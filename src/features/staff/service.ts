import "server-only";
import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  employees,
  invitations,
  locations,
  roleAssignments,
  roles,
} from "@/db/schema";
import { activePermissions } from "@/features/invitations/service";
import { writeAudit } from "@/server/audit/write";
import {
  allowedLocationIds,
  hasPermission,
  type Actor,
} from "@/server/auth/actor";
import { Conflict, Forbidden, Invalid, NotFound } from "@/server/auth/errors";
import {
  assertCanGrant,
  assertCanInviteWithRole,
  assertNotSelf,
} from "@/server/auth/guardrails";
import { withTransaction, type Db, type Tx } from "@/server/db/client";
import { assertActorActive, lockOrganization } from "@/server/db/locks";

export type TxRunner = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

/** Injectable so integration tests run on TEST_DATABASE_URL, never DATABASE_URL. */
export type StaffDeps = { transaction?: TxRunner };

export type ProfileInput = { displayName: string; phone: string | null };

// Only these two fields exist in the schema: anything else a caller sends
// (email, status, organization) is stripped, never written.
const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(60, "Your name can be up to 60 characters."),
  phone: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[0-9 +()-]{1,20}$/.test(v), {
      message: "Enter a phone number using digits, spaces and + ( ) -, up to 20 characters.",
    }),
});

/**
 * Update the signed-in employee's own display name and phone. Always acts on
 * `actor.employeeId`; there is no way to name another employee.
 */
export async function updateOwnProfile(
  actor: Actor,
  rawInput: ProfileInput,
  deps: StaffDeps = {},
): Promise<void> {
  if (!hasPermission(actor, "profile.edit_own", "any")) throw new Forbidden();
  const parsed = profileSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Invalid(parsed.error.issues[0]?.message ?? "That input is not valid.");
  }
  const { displayName, phone } = parsed.data;
  const transaction = deps.transaction ?? withTransaction;

  await transaction(async (tx) => {
    const [before] = await tx
      .select({ displayName: employees.displayName, phone: employees.phone })
      .from(employees)
      .where(
        and(
          eq(employees.id, actor.employeeId),
          eq(employees.organizationId, actor.organizationId),
        ),
      )
      .for("update");
    if (!before) throw new NotFound();

    await tx
      .update(employees)
      .set({ displayName, phone })
      .where(
        and(
          eq(employees.id, actor.employeeId),
          eq(employees.organizationId, actor.organizationId),
        ),
      );
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorEmployeeId: actor.employeeId,
      action: "employee.profile_updated",
      entityType: "employee",
      entityId: actor.employeeId,
      before,
      after: { displayName, phone },
    });
  });
}

export type HubContext = {
  locationName: string | null;
  timezone: string;
  phone: string | null;
};

const DEFAULT_TIMEZONE = "America/Phoenix";

/**
 * What the Hub and profile pages show about the signed-in employee: their
 * first assigned location (name, timezone) and phone. Org-wide staff with no
 * location assignment get no location name.
 */
export async function getHubContext(
  actor: Actor,
  deps: StaffDeps = {},
): Promise<HubContext> {
  const transaction = deps.transaction ?? withTransaction;
  return transaction(async (tx) => {
    const [me] = await tx
      .select({ phone: employees.phone })
      .from(employees)
      .where(
        and(
          eq(employees.id, actor.employeeId),
          eq(employees.organizationId, actor.organizationId),
        ),
      );
    const [loc] = await tx
      .select({ name: locations.name, timezone: locations.timezone })
      .from(roleAssignments)
      .innerJoin(
        locations,
        and(
          eq(locations.id, roleAssignments.locationId),
          eq(locations.organizationId, roleAssignments.organizationId),
        ),
      )
      .where(
        and(
          eq(roleAssignments.employeeId, actor.employeeId),
          eq(roleAssignments.organizationId, actor.organizationId),
          isNull(roleAssignments.revokedAt),
          eq(locations.status, "active"),
        ),
      )
      .orderBy(roleAssignments.grantedAt)
      .limit(1);
    return {
      locationName: loc?.name ?? null,
      timezone: loc?.timezone ?? DEFAULT_TIMEZONE,
      phone: me?.phone ?? null,
    };
  });
}

export type EmployeeStatus = "invited" | "active" | "suspended" | "left";

type RoleLabel = { roleName: string; locationName: string | null };

export type StaffRow = {
  employeeId: string;
  displayName: string;
  email: string;
  status: EmployeeStatus;
  roles: RoleLabel[];
};

/**
 * Staff the actor may see. Location isolation: a location-scoped holder of
 * `staff.view` sees only employees with an active assignment (or an open
 * invitation) at one of their locations, and only the roles held at those
 * locations. Organization-wide holders see everyone in the organization.
 */
export async function listStaff(
  actor: Actor,
  opts: { locationId?: string } = {},
  deps: StaffDeps = {},
): Promise<StaffRow[]> {
  if (!hasPermission(actor, "staff.view", "any")) throw new Forbidden();
  const allowed = allowedLocationIds(actor, "staff.view");
  if (
    opts.locationId !== undefined &&
    allowed !== "all" &&
    !allowed.includes(opts.locationId)
  ) {
    throw new Forbidden();
  }
  // null = no location restriction.
  const restrictTo: string[] | null =
    opts.locationId !== undefined
      ? [opts.locationId]
      : allowed === "all"
        ? null
        : allowed;
  if (restrictTo !== null && restrictTo.length === 0) return [];
  const transaction = deps.transaction ?? withTransaction;

  return transaction(async (tx) => {
    const orgId = actor.organizationId;

    const assignmentRows = await tx
      .select({
        employeeId: roleAssignments.employeeId,
        roleName: roles.name,
        locationName: locations.name,
      })
      .from(roleAssignments)
      .innerJoin(
        roles,
        and(eq(roles.id, roleAssignments.roleId), eq(roles.organizationId, orgId)),
      )
      .leftJoin(
        locations,
        and(
          eq(locations.id, roleAssignments.locationId),
          eq(locations.organizationId, orgId),
        ),
      )
      .where(
        and(
          eq(roleAssignments.organizationId, orgId),
          isNull(roleAssignments.revokedAt),
          restrictTo === null
            ? undefined
            : inArray(roleAssignments.locationId, restrictTo),
        ),
      )
      .orderBy(asc(roles.name));

    // An open invitation stands in for an assignment until it is accepted.
    const inviteRows = await tx
      .select({
        employeeId: invitations.employeeId,
        roleName: roles.name,
        locationName: locations.name,
      })
      .from(invitations)
      .innerJoin(
        roles,
        and(eq(roles.id, invitations.roleId), eq(roles.organizationId, orgId)),
      )
      .leftJoin(
        locations,
        and(
          eq(locations.id, invitations.locationId),
          eq(locations.organizationId, orgId),
        ),
      )
      .where(
        and(
          eq(invitations.organizationId, orgId),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, new Date()),
          restrictTo === null
            ? undefined
            : and(
                eq(invitations.grantsOrgWide, false),
                inArray(invitations.locationId, restrictTo),
              ),
        ),
      );

    const rolesByEmployee = new Map<string, RoleLabel[]>();
    for (const r of [...assignmentRows, ...inviteRows]) {
      const list = rolesByEmployee.get(r.employeeId) ?? [];
      list.push({ roleName: r.roleName, locationName: r.locationName });
      rolesByEmployee.set(r.employeeId, list);
    }

    const everyone = restrictTo === null;
    const ids = [...rolesByEmployee.keys()];
    if (!everyone && ids.length === 0) return [];

    const people = await tx
      .select({
        id: employees.id,
        displayName: employees.displayName,
        email: employees.email,
        status: employees.status,
      })
      .from(employees)
      .where(
        and(
          eq(employees.organizationId, orgId),
          everyone ? undefined : inArray(employees.id, ids),
        ),
      )
      .orderBy(asc(employees.displayName), asc(employees.email));

    return people.map((p) => ({
      employeeId: p.id,
      displayName: p.displayName,
      email: p.email,
      status: p.status,
      roles: rolesByEmployee.get(p.id) ?? [],
    }));
  });
}

export type PendingInvitation = {
  invitationId: string;
  email: string;
  roleName: string;
  locationName: string;
  expiresAt: Date;
};

/**
 * Open, unexpired invitations at the actor locations. Organization-wide
 * invitations (Owner) are visible only to organization-wide holders.
 */
export async function listPendingInvitations(
  actor: Actor,
  deps: StaffDeps = {},
): Promise<PendingInvitation[]> {
  if (!hasPermission(actor, "staff.invite", "any")) throw new Forbidden();
  const allowed = allowedLocationIds(actor, "staff.invite");
  if (allowed !== "all" && allowed.length === 0) return [];
  const transaction = deps.transaction ?? withTransaction;

  return transaction(async (tx) => {
    const orgId = actor.organizationId;
    const rows = await tx
      .select({
        invitationId: invitations.id,
        email: invitations.email,
        roleName: roles.name,
        locationName: locations.name,
        expiresAt: invitations.expiresAt,
      })
      .from(invitations)
      .innerJoin(
        roles,
        and(eq(roles.id, invitations.roleId), eq(roles.organizationId, orgId)),
      )
      .leftJoin(
        locations,
        and(
          eq(locations.id, invitations.locationId),
          eq(locations.organizationId, orgId),
        ),
      )
      .where(
        and(
          eq(invitations.organizationId, orgId),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, new Date()),
          allowed === "all"
            ? undefined
            : and(
                eq(invitations.grantsOrgWide, false),
                inArray(invitations.locationId, allowed),
              ),
        ),
      )
      .orderBy(asc(invitations.expiresAt));
    return rows.map((r) => ({
      ...r,
      locationName: r.locationName ?? "All locations",
    }));
  });
}

export type InvitableRole = { id: string; key: string; name: string };

/**
 * Roles the actor may invite someone into at `locationId`: the same checks
 * `createInvitation` applies (staff.invite plus the no-escalation guardrail).
 */
export async function listInvitableRoles(
  actor: Actor,
  locationId: string,
  deps: StaffDeps = {},
): Promise<InvitableRole[]> {
  if (!hasPermission(actor, "staff.invite", { locationId })) throw new Forbidden();
  const transaction = deps.transaction ?? withTransaction;

  return transaction(async (tx) => {
    const orgId = actor.organizationId;
    const [location] = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(
        and(
          eq(locations.id, locationId),
          eq(locations.organizationId, orgId),
          eq(locations.status, "active"),
        ),
      );
    if (!location) throw new NotFound("Location not found.");

    const all = await tx
      .select({ id: roles.id, key: roles.key, name: roles.name })
      .from(roles)
      .where(eq(roles.organizationId, orgId))
      .orderBy(asc(roles.name));

    const result: InvitableRole[] = [];
    for (const role of all) {
      // Owner invitations are organization-wide, as in createInvitation.
      const orgWide = role.key === "owner";
      const scope = orgWide ? ("organization" as const) : { locationId };
      if (!hasPermission(actor, "staff.invite", scope)) continue;
      try {
        assertCanInviteWithRole(
          actor,
          await activePermissions(tx, orgId, role.id),
          orgWide ? null : locationId,
        );
        result.push(role);
      } catch (error) {
        if (!(error instanceof Forbidden)) throw error;
      }
    }
    return result;
  });
}

export type InvitableLocation = { id: string; name: string };

/** Active locations where the actor holds `staff.invite`. */
export async function listInvitableLocations(
  actor: Actor,
  deps: StaffDeps = {},
): Promise<InvitableLocation[]> {
  if (!hasPermission(actor, "staff.invite", "any")) throw new Forbidden();
  const allowed = allowedLocationIds(actor, "staff.invite");
  if (allowed !== "all" && allowed.length === 0) return [];
  const transaction = deps.transaction ?? withTransaction;
  return transaction((tx) =>
    tx
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(
        and(
          eq(locations.organizationId, actor.organizationId),
          eq(locations.status, "active"),
          allowed === "all" ? undefined : inArray(locations.id, allowed),
        ),
      )
      .orderBy(asc(locations.name)),
  );
}

// ---------------------------------------------------------------------------
// Staff management (Owner dashboard): status, role grants and revokes.
//
// Every change below runs in one transaction that (1) locks the organization
// row, so last-Owner checks cannot race, (2) re-checks the actor is still
// active, (3) resolves every id inside `actor.organizationId`, and (4) writes
// its audit row(s) before commit.
// ---------------------------------------------------------------------------

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: unknown; cause?: { code?: unknown } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

function parseId(value: unknown, message: string): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new Invalid(message);
  return parsed.data;
}

/**
 * Active owner employees: status `active` with an unrevoked organization-wide
 * assignment of the `owner` role. Distinct employees, this organization only.
 */
export async function countActiveOrgOwners(
  tx: Db | Tx,
  organizationId: string,
): Promise<number> {
  const rows = await tx
    .select({ id: employees.id })
    .from(roleAssignments)
    .innerJoin(
      roles,
      and(
        eq(roles.id, roleAssignments.roleId),
        eq(roles.organizationId, roleAssignments.organizationId),
      ),
    )
    .innerJoin(
      employees,
      and(
        eq(employees.id, roleAssignments.employeeId),
        eq(employees.organizationId, roleAssignments.organizationId),
      ),
    )
    .where(
      and(
        eq(roleAssignments.organizationId, organizationId),
        isNull(roleAssignments.revokedAt),
        isNull(roleAssignments.locationId),
        eq(roles.key, "owner"),
        eq(employees.status, "active"),
      ),
    );
  return new Set(rows.map((r) => r.id)).size;
}

export type ActiveAssignment = {
  assignmentId: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  locationId: string | null;
  locationName: string | null;
};

async function loadActiveAssignments(
  tx: Tx,
  organizationId: string,
  employeeId: string,
): Promise<ActiveAssignment[]> {
  return tx
    .select({
      assignmentId: roleAssignments.id,
      roleId: roleAssignments.roleId,
      roleKey: roles.key,
      roleName: roles.name,
      locationId: roleAssignments.locationId,
      locationName: locations.name,
    })
    .from(roleAssignments)
    .innerJoin(
      roles,
      and(eq(roles.id, roleAssignments.roleId), eq(roles.organizationId, organizationId)),
    )
    .leftJoin(
      locations,
      and(
        eq(locations.id, roleAssignments.locationId),
        eq(locations.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(roleAssignments.organizationId, organizationId),
        eq(roleAssignments.employeeId, employeeId),
        isNull(roleAssignments.revokedAt),
      ),
    )
    .orderBy(asc(roleAssignments.grantedAt), asc(roleAssignments.id));
}

/**
 * The actor may act on someone only if, for every active assignment the target
 * holds, the actor has `staff.manage` at that assignment's scope AND holds
 * every permission of that role there (no escalation, in the revoking and
 * suspending direction too). A target with no assignments needs organization
 * scope.
 */
async function assertCanManageTarget(
  tx: Tx,
  actor: Actor,
  assignments: readonly ActiveAssignment[],
): Promise<void> {
  if (assignments.length === 0) {
    if (!hasPermission(actor, "staff.manage", "organization")) throw new Forbidden();
    return;
  }
  for (const a of assignments) {
    const scope = a.locationId === null ? "organization" : { locationId: a.locationId };
    if (!hasPermission(actor, "staff.manage", scope)) throw new Forbidden();
    assertCanGrant(
      actor,
      await activePermissions(tx, actor.organizationId, a.roleId),
      a.locationId,
    );
  }
}

const statusSchema = z.enum(["active", "suspended", "left"]);

const LAST_OWNER_MESSAGE =
  "This is the last Owner. Make someone else an Owner first.";

/**
 * Change an employee's status. Needs `staff.manage` over everything the target
 * holds (see `assertCanManageTarget`); never your own; never the last active
 * organization-wide Owner. Marking someone `left` also revokes their
 * assignments (rows are kept, with `revoked_at`).
 */
export async function setEmployeeStatus(
  actor: Actor,
  employeeIdInput: string,
  statusInput: "active" | "suspended" | "left",
  deps: StaffDeps = {},
): Promise<void> {
  if (!hasPermission(actor, "staff.manage", "any")) throw new Forbidden();
  const employeeId = parseId(employeeIdInput, "We could not find that person.");
  const parsedStatus = statusSchema.safeParse(statusInput);
  if (!parsedStatus.success) throw new Invalid("Choose active, suspended or left.");
  const status = parsedStatus.data;
  assertNotSelf(actor, employeeId);
  const transaction = deps.transaction ?? withTransaction;

  await transaction(async (tx) => {
    const orgId = actor.organizationId;
    await lockOrganization(tx, orgId);
    await assertActorActive(tx, actor);

    const [target] = await tx
      .select({ id: employees.id, status: employees.status })
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.organizationId, orgId)))
      .for("update");
    if (!target) throw new NotFound("We could not find that person.");
    if (target.status === status) return;
    if (target.status === "invited") {
      throw new Invalid("This person has not joined yet. Cancel their invite instead.");
    }
    if (target.status === "left") {
      throw new Invalid("This person has left. Invite them again to bring them back.");
    }

    const assignments = await loadActiveAssignments(tx, orgId, employeeId);
    await assertCanManageTarget(tx, actor, assignments);

    const isActiveOwner =
      target.status === "active" &&
      assignments.some((a) => a.roleKey === "owner" && a.locationId === null);
    if (isActiveOwner && status !== "active") {
      if ((await countActiveOrgOwners(tx, orgId)) <= 1) {
        throw new Conflict(LAST_OWNER_MESSAGE);
      }
    }

    await tx
      .update(employees)
      .set({ status })
      .where(and(eq(employees.id, employeeId), eq(employees.organizationId, orgId)));

    if (status === "left") {
      await tx
        .update(roleAssignments)
        .set({ revokedAt: new Date(), revokedByEmployeeId: actor.employeeId })
        .where(
          and(
            eq(roleAssignments.organizationId, orgId),
            eq(roleAssignments.employeeId, employeeId),
            isNull(roleAssignments.revokedAt),
          ),
        );
    }

    await writeAudit(tx, {
      organizationId: orgId,
      actorEmployeeId: actor.employeeId,
      action: "employee.status_changed",
      entityType: "employee",
      entityId: employeeId,
      before: { status: target.status },
      after: { status },
    });
    if (status === "left") {
      for (const a of assignments) {
        await writeAudit(tx, {
          organizationId: orgId,
          locationId: a.locationId,
          actorEmployeeId: actor.employeeId,
          action: "role.revoked",
          entityType: "role_assignment",
          entityId: a.assignmentId,
          before: {
            employeeId,
            roleKey: a.roleKey,
            locationId: a.locationId,
            revoked: false,
          },
          after: { revoked: true, reason: "employee left" },
        });
      }
    }
  });
}

const grantSchema = z.object({
  employeeId: z.uuid("We could not find that person."),
  roleId: z.uuid("Choose a role."),
  locationId: z.uuid("Choose a location.").nullable(),
});

/**
 * Give an employee a role at a location (`null` = all locations). Needs
 * `staff.manage` at that scope and every permission of the role there; never
 * for yourself. The Owner role is organization-wide only. Closed locations
 * cannot receive assignments.
 */
export async function grantRole(
  actor: Actor,
  input: { employeeId: string; roleId: string; locationId: string | null },
  deps: StaffDeps = {},
): Promise<void> {
  const parsed = grantSchema.safeParse(input);
  if (!parsed.success) {
    throw new Invalid(parsed.error.issues[0]?.message ?? "That input is not valid.");
  }
  const { employeeId, roleId, locationId } = parsed.data;
  assertNotSelf(actor, employeeId);
  const scope = locationId === null ? ("organization" as const) : { locationId };
  if (!hasPermission(actor, "staff.manage", scope)) throw new Forbidden();
  const transaction = deps.transaction ?? withTransaction;

  await transaction(async (tx) => {
    const orgId = actor.organizationId;
    await lockOrganization(tx, orgId);
    await assertActorActive(tx, actor);

    const [target] = await tx
      .select({ id: employees.id, status: employees.status })
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.organizationId, orgId)))
      .for("update");
    if (!target) throw new NotFound("We could not find that person.");
    if (target.status !== "active" && target.status !== "suspended") {
      throw new Invalid(
        target.status === "invited"
          ? "This person has not joined yet. Their invite sets their role."
          : "This person has left. Invite them again to bring them back.",
      );
    }

    const [role] = await tx
      .select({ id: roles.id, key: roles.key })
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.organizationId, orgId)));
    if (!role) throw new NotFound("Role not found.");

    if (locationId !== null) {
      const [location] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(
          and(
            eq(locations.id, locationId),
            eq(locations.organizationId, orgId),
            eq(locations.status, "active"),
          ),
        );
      if (!location) throw new NotFound("Location not found.");
    }
    if (role.key === "owner" && locationId !== null) {
      throw new Invalid("The Owner role applies to all locations.");
    }

    assertCanGrant(actor, await activePermissions(tx, orgId, role.id), locationId);

    const [existing] = await tx
      .select({ id: roleAssignments.id })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.organizationId, orgId),
          eq(roleAssignments.employeeId, employeeId),
          eq(roleAssignments.roleId, roleId),
          locationId === null
            ? isNull(roleAssignments.locationId)
            : eq(roleAssignments.locationId, locationId),
          isNull(roleAssignments.revokedAt),
        ),
      );
    if (existing) throw new Conflict("They already have that role there.");

    let assignmentId: string;
    try {
      const [created] = await tx
        .insert(roleAssignments)
        .values({
          organizationId: orgId,
          employeeId,
          roleId,
          locationId,
          grantedByEmployeeId: actor.employeeId,
        })
        .returning({ id: roleAssignments.id });
      if (!created) throw new Error("role assignment insert returned no row");
      assignmentId = created.id;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new Conflict("They already have that role there.");
      }
      throw error;
    }

    await writeAudit(tx, {
      organizationId: orgId,
      locationId,
      actorEmployeeId: actor.employeeId,
      action: "role.granted",
      entityType: "role_assignment",
      entityId: assignmentId,
      after: { employeeId, roleId, roleKey: role.key, locationId },
    });
  });
}

/**
 * End a role assignment (sets `revoked_at`; the row stays as history). Needs
 * `staff.manage` at the assignment's scope and every permission of the role
 * there; never your own; never the last active organization-wide Owner.
 */
export async function revokeRole(
  actor: Actor,
  assignmentIdInput: string,
  deps: StaffDeps = {},
): Promise<void> {
  if (!hasPermission(actor, "staff.manage", "any")) throw new Forbidden();
  const assignmentId = parseId(assignmentIdInput, "We could not find that role.");
  const transaction = deps.transaction ?? withTransaction;

  await transaction(async (tx) => {
    const orgId = actor.organizationId;
    await lockOrganization(tx, orgId);
    await assertActorActive(tx, actor);

    const [assignment] = await tx
      .select({
        id: roleAssignments.id,
        employeeId: roleAssignments.employeeId,
        roleId: roleAssignments.roleId,
        roleKey: roles.key,
        locationId: roleAssignments.locationId,
      })
      .from(roleAssignments)
      .innerJoin(
        roles,
        and(eq(roles.id, roleAssignments.roleId), eq(roles.organizationId, orgId)),
      )
      .where(
        and(
          eq(roleAssignments.id, assignmentId),
          eq(roleAssignments.organizationId, orgId),
          isNull(roleAssignments.revokedAt),
        ),
      )
      .for("update", { of: roleAssignments });
    if (!assignment) throw new NotFound("We could not find that role.");

    assertNotSelf(actor, assignment.employeeId);
    const scope =
      assignment.locationId === null
        ? ("organization" as const)
        : { locationId: assignment.locationId };
    if (!hasPermission(actor, "staff.manage", scope)) throw new Forbidden();
    assertCanGrant(
      actor,
      await activePermissions(tx, orgId, assignment.roleId),
      assignment.locationId,
    );

    if (assignment.roleKey === "owner" && assignment.locationId === null) {
      const [holder] = await tx
        .select({ status: employees.status })
        .from(employees)
        .where(
          and(eq(employees.id, assignment.employeeId), eq(employees.organizationId, orgId)),
        );
      if (holder?.status === "active" && (await countActiveOrgOwners(tx, orgId)) <= 1) {
        throw new Conflict(LAST_OWNER_MESSAGE);
      }
    }

    await tx
      .update(roleAssignments)
      .set({ revokedAt: new Date(), revokedByEmployeeId: actor.employeeId })
      .where(
        and(
          eq(roleAssignments.id, assignmentId),
          eq(roleAssignments.organizationId, orgId),
        ),
      );
    await writeAudit(tx, {
      organizationId: orgId,
      locationId: assignment.locationId,
      actorEmployeeId: actor.employeeId,
      action: "role.revoked",
      entityType: "role_assignment",
      entityId: assignmentId,
      before: {
        employeeId: assignment.employeeId,
        roleKey: assignment.roleKey,
        locationId: assignment.locationId,
        revoked: false,
      },
      after: { revoked: true },
    });
  });
}

export type StaffDetail = {
  employeeId: string;
  displayName: string;
  email: string;
  phone: string | null;
  status: EmployeeStatus;
  isSelf: boolean;
  assignments: ActiveAssignment[];
};

/**
 * One employee for the Owner staff page. Needs `staff.manage`. Location-scoped
 * holders only see people with an assignment at one of their locations, and
 * only those assignments.
 */
export async function getStaffDetail(
  actor: Actor,
  employeeIdInput: string,
  deps: StaffDeps = {},
): Promise<StaffDetail> {
  if (!hasPermission(actor, "staff.manage", "any")) throw new Forbidden();
  const parsedId = z.uuid().safeParse(employeeIdInput);
  if (!parsedId.success) throw new NotFound("We could not find that person.");
  const employeeId = parsedId.data;
  const allowed = allowedLocationIds(actor, "staff.manage");
  const transaction = deps.transaction ?? withTransaction;

  return transaction(async (tx) => {
    const orgId = actor.organizationId;
    const [person] = await tx
      .select({
        id: employees.id,
        displayName: employees.displayName,
        email: employees.email,
        phone: employees.phone,
        status: employees.status,
      })
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.organizationId, orgId)));
    if (!person) throw new NotFound("We could not find that person.");

    let assignments = await loadActiveAssignments(tx, orgId, employeeId);
    if (allowed !== "all") {
      assignments = assignments.filter(
        (a) => a.locationId !== null && allowed.includes(a.locationId),
      );
      if (assignments.length === 0) throw new NotFound("We could not find that person.");
    }
    return {
      employeeId: person.id,
      displayName: person.displayName,
      email: person.email,
      phone: person.phone,
      status: person.status,
      isSelf: person.id === actor.employeeId,
      assignments,
    };
  });
}

/**
 * Roles the actor could grant at a scope (`null` = all locations): the same
 * no-escalation check `grantRole` applies. The Owner role is organization-wide.
 */
export async function listGrantableRoles(
  actor: Actor,
  locationId: string | null,
  deps: StaffDeps = {},
): Promise<InvitableRole[]> {
  const scope = locationId === null ? ("organization" as const) : { locationId };
  if (!hasPermission(actor, "staff.manage", scope)) throw new Forbidden();
  const transaction = deps.transaction ?? withTransaction;

  return transaction(async (tx) => {
    const orgId = actor.organizationId;
    if (locationId !== null) {
      const [location] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(
          and(
            eq(locations.id, locationId),
            eq(locations.organizationId, orgId),
            eq(locations.status, "active"),
          ),
        );
      if (!location) throw new NotFound("Location not found.");
    }
    const all = await tx
      .select({ id: roles.id, key: roles.key, name: roles.name })
      .from(roles)
      .where(eq(roles.organizationId, orgId))
      .orderBy(asc(roles.name));
    const result: InvitableRole[] = [];
    for (const role of all) {
      if (role.key === "owner" && locationId !== null) continue;
      try {
        assertCanGrant(actor, await activePermissions(tx, orgId, role.id), locationId);
        result.push(role);
      } catch (error) {
        if (!(error instanceof Forbidden)) throw error;
      }
    }
    return result;
  });
}

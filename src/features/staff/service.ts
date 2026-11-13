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
import { Forbidden, Invalid, NotFound } from "@/server/auth/errors";
import { assertCanInviteWithRole } from "@/server/auth/guardrails";
import { withTransaction, type Tx } from "@/server/db/client";

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

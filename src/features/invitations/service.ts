import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  employees,
  invitations,
  locations,
  organizations,
  roleAssignments,
  rolePermissions,
  roles,
} from "@/db/schema";
import { writeAudit } from "@/server/audit/write";
import { hasPermission, type Actor, type Scope } from "@/server/auth/actor";
import { Conflict, Forbidden, Invalid, NotFound } from "@/server/auth/errors";
import { assertCanInviteWithRole } from "@/server/auth/guardrails";
import { isPermission, type Permission } from "@/server/auth/permissions";
import type { SessionUser } from "@/server/auth/session";
import { withTransaction, type Tx } from "@/server/db/client";
import { linkDelivery, type InviteDelivery } from "./delivery";
import { generateInviteToken, hashInviteToken, inviteUrl } from "./tokens";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export type TxRunner = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

/** Injectable so integration tests run on TEST_DATABASE_URL, never DATABASE_URL. */
export type InvitationDeps = {
  transaction?: TxRunner;
  delivery?: InviteDelivery;
};

export type InviteInput = {
  firstName: string;
  lastName: string;
  email: string;
  locationId: string;
  roleId: string;
};

const inviteSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address.")),
  locationId: z.uuid("Choose a location."),
  roleId: z.uuid("Choose a role."),
});

export type InvitationStatus =
  | "valid"
  | "expired"
  | "revoked"
  | "accepted"
  | "unknown";

export type InvitationPreview = {
  status: InvitationStatus;
  organizationName?: string;
  locationName?: string;
  roleName?: string;
  maskedEmail?: string;
};

function scopeOf(invite: {
  grantsOrgWide: boolean;
  locationId: string | null;
}): Scope {
  return invite.grantsOrgWide || invite.locationId === null
    ? "organization"
    : { locationId: invite.locationId };
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: unknown; cause?: { code?: unknown } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

async function activePermissions(
  tx: Tx,
  organizationId: string,
  roleId: string,
): Promise<Permission[]> {
  const rows = await tx
    .select({ permission: rolePermissions.permission })
    .from(rolePermissions)
    .where(
      and(
        eq(rolePermissions.roleId, roleId),
        eq(rolePermissions.organizationId, organizationId),
        isNull(rolePermissions.revokedAt),
      ),
    );
  return rows.map((r) => r.permission).filter(isPermission);
}

/**
 * Create (or replace) an invitation. Needs `staff.invite` at the location and
 * passes the no-escalation guardrail for the role. An Owner invitation is
 * organization-wide, so it needs the same at organization scope. The raw
 * token only ever exists in the returned link.
 */
export async function createInvitation(
  actor: Actor,
  rawInput: InviteInput,
  deps: InvitationDeps = {},
): Promise<{ invitationId: string; inviteUrl: string }> {
  const parsed = inviteSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Invalid(
      parsed.error.issues[0]?.message ?? "That input is not valid.",
    );
  }
  const input = parsed.data;
  const transaction = deps.transaction ?? withTransaction;
  const delivery = deps.delivery ?? linkDelivery;

  const token = generateInviteToken();
  const link = inviteUrl(token.raw); // fails early if APP_URL is unset

  let result: { invitationId: string };
  try {
    result = await transaction(async (tx) => {
      // Both ids come from user input: resolve them inside the actor's organization.
      const [location] = await tx
        .select({ id: locations.id, status: locations.status })
        .from(locations)
        .where(
          and(
            eq(locations.id, input.locationId),
            eq(locations.organizationId, actor.organizationId),
          ),
        );
      if (!location || location.status !== "active") {
        throw new NotFound("Location not found.");
      }

      const [role] = await tx
        .select({ id: roles.id, key: roles.key })
        .from(roles)
        .where(
          and(
            eq(roles.id, input.roleId),
            eq(roles.organizationId, actor.organizationId),
          ),
        );
      if (!role) throw new NotFound("Role not found.");

      const grantsOrgWide = role.key === "owner";
      const scope: Scope = grantsOrgWide
        ? "organization"
        : { locationId: location.id };
      if (!hasPermission(actor, "staff.invite", scope)) throw new Forbidden();
      assertCanInviteWithRole(
        actor,
        await activePermissions(tx, actor.organizationId, role.id),
        grantsOrgWide ? null : location.id,
      );

      // Serialise on the employee row so concurrent invites for one email queue up.
      const [existing] = await tx
        .select()
        .from(employees)
        .where(
          and(
            eq(employees.organizationId, actor.organizationId),
            eq(employees.email, input.email),
          ),
        )
        .for("update");

      let employeeId: string;
      const displayName = `${input.firstName} ${input.lastName}`;
      if (existing) {
        if (existing.status === "active" || existing.status === "suspended") {
          throw new Conflict("already on the team");
        }
        // Replace open invitations, but only ones this actor could revoke themselves.
        const open = await tx
          .select()
          .from(invitations)
          .where(
            and(
              eq(invitations.employeeId, existing.id),
              eq(invitations.organizationId, actor.organizationId),
              isNull(invitations.acceptedAt),
              isNull(invitations.revokedAt),
            ),
          )
          .for("update");
        for (const old of open) {
          if (!hasPermission(actor, "staff.invite", scopeOf(old))) {
            throw new Forbidden();
          }
          assertCanInviteWithRole(
            actor,
            await activePermissions(tx, actor.organizationId, old.roleId),
            old.grantsOrgWide ? null : old.locationId,
          );
          await tx
            .update(invitations)
            .set({ revokedAt: new Date() })
            .where(eq(invitations.id, old.id));
          await writeAudit(tx, {
            organizationId: actor.organizationId,
            locationId: old.locationId,
            actorEmployeeId: actor.employeeId,
            action: "invitation.revoked",
            entityType: "invitation",
            entityId: old.id,
            after: { reason: "replaced", employeeId: existing.id },
          });
        }
        await tx
          .update(employees)
          .set({
            firstName: input.firstName,
            lastName: input.lastName,
            displayName,
            status: "invited",
          })
          .where(eq(employees.id, existing.id));
        if (existing.status === "left") {
          await writeAudit(tx, {
            organizationId: actor.organizationId,
            locationId: location.id,
            actorEmployeeId: actor.employeeId,
            action: "employee.status_changed",
            entityType: "employee",
            entityId: existing.id,
            before: { status: "left" },
            after: { status: "invited" },
          });
        }
        employeeId = existing.id;
      } else {
        const [created] = await tx
          .insert(employees)
          .values({
            organizationId: actor.organizationId,
            firstName: input.firstName,
            lastName: input.lastName,
            displayName,
            email: input.email,
            status: "invited",
          })
          .returning({ id: employees.id });
        if (!created) {
          throw new Error("Invitation: employee insert returned no row");
        }
        employeeId = created.id;
      }

      const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
      const [invitation] = await tx
        .insert(invitations)
        .values({
          organizationId: actor.organizationId,
          employeeId,
          email: input.email,
          locationId: location.id,
          roleId: role.id,
          tokenHash: token.hash,
          grantsOrgWide,
          invitedByEmployeeId: actor.employeeId,
          expiresAt,
        })
        .returning({ id: invitations.id });
      if (!invitation) throw new Error("Invitation: insert returned no row");

      await writeAudit(tx, {
        organizationId: actor.organizationId,
        locationId: location.id,
        actorEmployeeId: actor.employeeId,
        action: "invitation.created",
        entityType: "invitation",
        entityId: invitation.id,
        after: {
          employeeId,
          email: input.email,
          roleId: role.id,
          locationId: location.id,
          grantsOrgWide,
          expiresAt: expiresAt.toISOString(),
        },
      });
      return { invitationId: invitation.id };
    });
  } catch (error) {
    // Two invites for a brand-new email raced; the unique index picked a loser.
    if (isUniqueViolation(error)) throw new Conflict("already on the team");
    throw error;
  }

  await delivery.deliver({
    email: input.email,
    inviteUrl: link,
    inviterName: actor.displayName,
  });
  return { invitationId: result.invitationId, inviteUrl: link };
}

/**
 * Revoke an open invitation (sets `revoked_at`; nothing is deleted). Needs
 * `staff.invite` at the invitation's scope plus the same role guardrail as
 * creating it, so a Manager cannot cancel a Manager or Owner invite.
 * Revoking an already revoked invitation is a no-op.
 */
export async function revokeInvitation(
  actor: Actor,
  invitationId: string,
  deps: InvitationDeps = {},
): Promise<void> {
  if (!z.uuid().safeParse(invitationId).success) {
    throw new NotFound("Invitation not found.");
  }
  const transaction = deps.transaction ?? withTransaction;
  await transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.id, invitationId),
          eq(invitations.organizationId, actor.organizationId),
        ),
      )
      .for("update");
    if (!invite) throw new NotFound("Invitation not found.");

    if (!hasPermission(actor, "staff.invite", scopeOf(invite))) {
      throw new Forbidden();
    }
    assertCanInviteWithRole(
      actor,
      await activePermissions(tx, actor.organizationId, invite.roleId),
      invite.grantsOrgWide ? null : invite.locationId,
    );

    if (invite.acceptedAt) {
      throw new Invalid("This invitation was already accepted.");
    }
    if (invite.revokedAt) return;

    await tx
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(eq(invitations.id, invite.id));
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      locationId: invite.locationId,
      actorEmployeeId: actor.employeeId,
      action: "invitation.revoked",
      entityType: "invitation",
      entityId: invite.id,
      after: { reason: "revoked", employeeId: invite.employeeId },
    });
  });
}

function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  return `${email.slice(0, 1)}•••${email.slice(at)}`;
}

function statusOf(invite: {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}): InvitationStatus {
  if (invite.acceptedAt) return "accepted";
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt.getTime() <= Date.now()) return "expired";
  return "valid";
}

/**
 * Public, read-only view of an invitation for the invite page. Needs no
 * session (the token is the capability) and reveals only organization,
 * location and role names plus a masked email, and only while the invitation
 * is valid. Unknown or malformed tokens return `{ status: "unknown" }`.
 */
export async function getInvitationPreview(
  rawToken: string,
  deps: InvitationDeps = {},
): Promise<InvitationPreview> {
  if (!TOKEN_SHAPE.test(rawToken)) return { status: "unknown" };
  const transaction = deps.transaction ?? withTransaction;
  return transaction(async (tx): Promise<InvitationPreview> => {
    const [row] = await tx
      .select({
        invite: invitations,
        organizationName: organizations.name,
        locationName: locations.name,
        roleName: roles.name,
      })
      .from(invitations)
      .innerJoin(
        organizations,
        eq(organizations.id, invitations.organizationId),
      )
      .innerJoin(roles, eq(roles.id, invitations.roleId))
      .leftJoin(locations, eq(locations.id, invitations.locationId))
      .where(eq(invitations.tokenHash, hashInviteToken(rawToken)));
    if (!row) return { status: "unknown" };
    const status = statusOf(row.invite);
    // Terminal states reveal nothing beyond the state itself.
    if (status !== "valid") return { status };
    return {
      status,
      organizationName: row.organizationName,
      locationName: row.locationName ?? undefined,
      roleName: row.roleName,
      maskedEmail: maskEmail(row.invite.email),
    };
  });
}

/** True when this invitation was already accepted by this signed-in user. */
export async function hasAcceptedInvitation(
  user: SessionUser,
  rawToken: string,
  deps: InvitationDeps = {},
): Promise<boolean> {
  if (!TOKEN_SHAPE.test(rawToken)) return false;
  const transaction = deps.transaction ?? withTransaction;
  return transaction(async (tx) => {
    const [row] = await tx
      .select({
        acceptedAt: invitations.acceptedAt,
        authUserId: employees.authUserId,
      })
      .from(invitations)
      .innerJoin(employees, eq(employees.id, invitations.employeeId))
      .where(eq(invitations.tokenHash, hashInviteToken(rawToken)));
    return Boolean(row?.acceptedAt && row.authUserId === user.id);
  });
}

/**
 * Accept an invitation as the signed-in user. The session email (lower-cased)
 * must equal the invitation email. Race-safe: the employee row is locked
 * first (same order as `createInvitation`, so no deadlock), then the
 * invitation row, so concurrent accepts run one after another and the second
 * sees `accepted_at`. Same user again: returns the same employee id.
 *
 * Errors: `Forbidden("wrong account")` for an email mismatch; otherwise
 * `Invalid(status)` where status is unknown, accepted, revoked, expired or
 * unavailable (the employee is no longer in the `invited` state).
 */
export async function acceptInvitation(
  user: SessionUser,
  rawToken: string,
  deps: InvitationDeps = {},
): Promise<{ employeeId: string }> {
  if (!TOKEN_SHAPE.test(rawToken)) throw new Invalid("unknown");
  const transaction = deps.transaction ?? withTransaction;
  const tokenHash = hashInviteToken(rawToken);
  const userEmail = user.email.trim().toLowerCase();

  try {
    return await transaction(async (tx) => {
      const [peek] = await tx
        .select({
          employeeId: invitations.employeeId,
          organizationId: invitations.organizationId,
          email: invitations.email,
        })
        .from(invitations)
        .where(eq(invitations.tokenHash, tokenHash));
      if (!peek) throw new Invalid("unknown");
      // Identity binding: the invitation is for one verified email address.
      if (userEmail !== peek.email) throw new Forbidden("wrong account");

      const [employee] = await tx
        .select()
        .from(employees)
        .where(
          and(
            eq(employees.id, peek.employeeId),
            eq(employees.organizationId, peek.organizationId),
          ),
        )
        .for("update");
      const [invite] = await tx
        .select()
        .from(invitations)
        .where(eq(invitations.tokenHash, tokenHash))
        .for("update");
      if (!employee || !invite) throw new Invalid("unknown");

      if (invite.acceptedAt) {
        if (employee.authUserId === user.id) return { employeeId: employee.id };
        throw new Invalid("accepted");
      }
      if (invite.revokedAt) throw new Invalid("revoked");
      if (invite.expiresAt.getTime() <= Date.now()) throw new Invalid("expired");
      if (employee.status !== "invited") throw new Invalid("unavailable");

      const now = new Date();
      await tx
        .update(employees)
        .set({ authUserId: user.id, status: "active" })
        .where(eq(employees.id, employee.id));

      const locationId = invite.grantsOrgWide ? null : invite.locationId;
      const [alreadyGranted] = await tx
        .select({ id: roleAssignments.id })
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.employeeId, employee.id),
            eq(roleAssignments.roleId, invite.roleId),
            locationId === null
              ? isNull(roleAssignments.locationId)
              : eq(roleAssignments.locationId, locationId),
            isNull(roleAssignments.revokedAt),
          ),
        );
      if (!alreadyGranted) {
        const [assignment] = await tx
          .insert(roleAssignments)
          .values({
            organizationId: invite.organizationId,
            employeeId: employee.id,
            roleId: invite.roleId,
            locationId,
            grantedByEmployeeId: invite.invitedByEmployeeId,
            grantedAt: now,
          })
          .returning({ id: roleAssignments.id });
        if (!assignment) {
          throw new Error("Invitation: assignment insert returned no row");
        }
        await writeAudit(tx, {
          organizationId: invite.organizationId,
          locationId,
          actorEmployeeId: employee.id,
          action: "role.granted",
          entityType: "role_assignment",
          entityId: assignment.id,
          after: {
            employeeId: employee.id,
            roleId: invite.roleId,
            locationId,
            via: "invitation",
            invitationId: invite.id,
          },
        });
      }

      await tx
        .update(invitations)
        .set({ acceptedAt: now })
        .where(eq(invitations.id, invite.id));
      await writeAudit(tx, {
        organizationId: invite.organizationId,
        locationId: invite.locationId,
        actorEmployeeId: employee.id,
        action: "invitation.accepted",
        entityType: "invitation",
        entityId: invite.id,
        before: { employeeStatus: employee.status },
        after: { employeeStatus: "active", employeeId: employee.id },
      });
      return { employeeId: employee.id };
    });
  } catch (error) {
    // auth_user_id is unique: this account is already another team member.
    if (isUniqueViolation(error)) {
      throw new Conflict(
        "This account is already linked to another team member.",
      );
    }
    throw error;
  }
}

import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { rolePermissions, roles } from "@/db/schema";
import { writeAudit } from "@/server/audit/write";
import { hasPermission, type Actor } from "@/server/auth/actor";
import { Conflict, Forbidden, Invalid, NotFound } from "@/server/auth/errors";
import { assertCanGrant } from "@/server/auth/guardrails";
import { isPermission, type Permission } from "@/server/auth/permissions";
import { withTransaction, type Tx } from "@/server/db/client";
import { assertActorActive } from "@/server/db/locks";

export type TxRunner = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

/** Injectable so integration tests run on TEST_DATABASE_URL, never DATABASE_URL. */
export type RoleDeps = { transaction?: TxRunner };

export const SYSTEM_ROLE_KEYS = ["owner", "manager", "employee"] as const;

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: unknown; cause?: { code?: unknown } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export type RoleSummary = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Permission[];
};

/** Roles need `roles.manage` for the whole organization (roles are not per location). */
function requireOrgRoles(actor: Actor): void {
  if (!hasPermission(actor, "roles.manage", "organization")) throw new Forbidden();
}

export async function listRoles(
  actor: Actor,
  deps: RoleDeps = {},
): Promise<RoleSummary[]> {
  requireOrgRoles(actor);
  const transaction = deps.transaction ?? withTransaction;
  return transaction(async (tx) => {
    const orgId = actor.organizationId;
    const roleRows = await tx
      .select()
      .from(roles)
      .where(eq(roles.organizationId, orgId))
      .orderBy(asc(roles.isSystem), asc(roles.name));
    const permissionRows = await tx
      .select({ roleId: rolePermissions.roleId, permission: rolePermissions.permission })
      .from(rolePermissions)
      .where(
        and(eq(rolePermissions.organizationId, orgId), isNull(rolePermissions.revokedAt)),
      );
    const byRole = new Map<string, Permission[]>();
    for (const row of permissionRows) {
      if (!isPermission(row.permission)) continue;
      const list = byRole.get(row.roleId) ?? [];
      list.push(row.permission);
      byRole.set(row.roleId, list);
    }
    return roleRows
      .map((r) => ({
        id: r.id,
        key: r.key,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        permissions: (byRole.get(r.id) ?? []).sort(),
      }))
      // System roles first (Owner, Manager, Employee), then custom roles by name.
      .sort((a, b) => {
        const rank = (r: RoleSummary) =>
          r.isSystem ? SYSTEM_ROLE_KEYS.indexOf(r.key as (typeof SYSTEM_ROLE_KEYS)[number]) : 99;
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      });
  });
}

const createSchema = z.object({
  key: z
    .string()
    .regex(
      /^[a-z][a-z0-9_]{1,30}$/,
      "Use a short key of lower-case letters, numbers and underscores, starting with a letter.",
    ),
  name: z
    .string()
    .trim()
    .min(1, "Enter a name for the role.")
    .max(60, "The name can be up to 60 characters."),
  description: z
    .string()
    .trim()
    .max(200, "The description can be up to 200 characters.")
    .nullish()
    .transform((v) => (v ? v : null)),
});

/** A new custom role. It starts with no permissions; set them separately. */
export async function createRole(
  actor: Actor,
  rawInput: { key: string; name: string; description?: string | null },
  deps: RoleDeps = {},
): Promise<string> {
  requireOrgRoles(actor);
  const parsed = createSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Invalid(parsed.error.issues[0]?.message ?? "That input is not valid.");
  }
  const { key, name, description } = parsed.data;
  if ((SYSTEM_ROLE_KEYS as readonly string[]).includes(key)) {
    throw new Invalid("That key is used by a built-in role. Choose another.");
  }
  const transaction = deps.transaction ?? withTransaction;

  return transaction(async (tx) => {
    const orgId = actor.organizationId;
    await assertActorActive(tx, actor);
    const [existing] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.organizationId, orgId), eq(roles.key, key)));
    if (existing) throw new Conflict("A role with that key already exists.");

    let id: string;
    try {
      const [created] = await tx
        .insert(roles)
        .values({ organizationId: orgId, key, name, description, isSystem: false })
        .returning({ id: roles.id });
      if (!created) throw new Error("role insert returned no row");
      id = created.id;
    } catch (error) {
      if (isUniqueViolation(error)) throw new Conflict("A role with that key already exists.");
      throw error;
    }
    await writeAudit(tx, {
      organizationId: orgId,
      actorEmployeeId: actor.employeeId,
      action: "role.created",
      entityType: "role",
      entityId: id,
      after: { key, name, description },
    });
    return id;
  });
}

/**
 * Replace a role's permission set. Needs `roles.manage` organization-wide.
 * The Owner role is fixed. No escalation: every permission being ADDED must be
 * held by the actor organization-wide (this includes widening a role they
 * hold themselves). Removed permissions are soft-revoked and kept as history.
 * Takes effect for holders on their next request.
 */
export async function setRolePermissions(
  actor: Actor,
  roleIdInput: string,
  permissionsInput: readonly string[],
  deps: RoleDeps = {},
): Promise<void> {
  requireOrgRoles(actor);
  const parsedId = z.uuid().safeParse(roleIdInput);
  if (!parsedId.success) throw new Invalid("We could not find that role.");
  const roleId = parsedId.data;

  const wanted = new Set<Permission>();
  for (const p of permissionsInput) {
    if (!isPermission(p)) throw new Invalid("One of those permissions does not exist.");
    wanted.add(p);
  }
  const transaction = deps.transaction ?? withTransaction;

  await transaction(async (tx) => {
    const orgId = actor.organizationId;
    await assertActorActive(tx, actor);

    const [role] = await tx
      .select({ id: roles.id, key: roles.key })
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.organizationId, orgId)))
      .for("update");
    if (!role) throw new NotFound("We could not find that role.");
    if (role.key === "owner") throw new Forbidden("owner role permissions are fixed");

    const currentRows = await tx
      .select({ id: rolePermissions.id, permission: rolePermissions.permission })
      .from(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, roleId),
          eq(rolePermissions.organizationId, orgId),
          isNull(rolePermissions.revokedAt),
        ),
      );
    const current = new Map<string, string>();
    for (const row of currentRows) current.set(row.permission, row.id);

    const added = [...wanted].filter((p) => !current.has(p));
    const removed = currentRows.filter((r) => !wanted.has(r.permission as Permission));
    if (added.length === 0 && removed.length === 0) return;

    assertCanGrant(actor, added, null);

    const now = new Date();
    for (const row of removed) {
      await tx
        .update(rolePermissions)
        .set({ revokedAt: now, revokedByEmployeeId: actor.employeeId })
        .where(
          and(eq(rolePermissions.id, row.id), eq(rolePermissions.organizationId, orgId)),
        );
    }
    if (added.length > 0) {
      await tx.insert(rolePermissions).values(
        added.map((permission) => ({ organizationId: orgId, roleId, permission })),
      );
    }

    await writeAudit(tx, {
      organizationId: orgId,
      actorEmployeeId: actor.employeeId,
      action: "role.permissions_changed",
      entityType: "role",
      entityId: roleId,
      before: [...current.keys()].sort(),
      after: [...wanted].sort(),
    });
  });
}

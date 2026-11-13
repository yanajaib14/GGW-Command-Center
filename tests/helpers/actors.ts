import { and, eq } from "drizzle-orm";
import { employees, rolePermissions, roles } from "@/db/schema";
import type { Actor } from "@/server/auth/actor";
import { loadActor } from "@/server/auth/load-actor";
import { PERMISSIONS, type Permission } from "@/server/auth/permissions";
import type { Tx } from "@/server/db/client";
import { seedEmployee, testDb, type SeededOrg } from "./db";

/** Transaction runner on TEST_DATABASE_URL for service `deps`. */
export const inTestTx = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
  testDb().transaction(fn);

export const testDeps = { transaction: inTestTx };

export async function actorFor(
  org: SeededOrg,
  roleKey: "owner" | "manager" | "employee",
  locationId: string | null,
): Promise<Actor> {
  return actorWithRole(org, org.roles[roleKey], locationId, roleKey);
}

export async function actorWithRole(
  org: SeededOrg,
  roleId: string,
  locationId: string | null,
  label = "actor",
): Promise<Actor> {
  const authUserId = `auth-${crypto.randomUUID()}`;
  const email = `${label}-${crypto.randomUUID()}@example.test`;
  await seedEmployee({
    orgId: org.orgId,
    authUserId,
    email,
    assignments: [{ roleId, locationId }],
  });
  const actor = await loadActor(testDb(), { id: authUserId, email, emailVerified: true });
  if (!actor) throw new Error("actor did not load");
  return actor;
}

/** Reload an actor from the database (after a status or role change). */
export async function reloadActor(actor: Actor): Promise<Actor | null> {
  const [row] = await testDb()
    .select({ authUserId: employees.authUserId })
    .from(employees)
    .where(eq(employees.id, actor.employeeId));
  if (!row?.authUserId) return null;
  return loadActor(testDb(), { id: row.authUserId, email: actor.email, emailVerified: true });
}

/** A non-system role with exactly these permissions. */
export async function seedCustomRole(
  org: SeededOrg,
  key: string,
  permissions: readonly Permission[],
): Promise<string> {
  const db = testDb();
  const [role] = await db
    .insert(roles)
    .values({ organizationId: org.orgId, key, name: key, isSystem: false })
    .returning({ id: roles.id });
  if (!role) throw new Error("seedCustomRole: no row");
  if (permissions.length > 0) {
    await db
      .insert(rolePermissions)
      .values(
        permissions.map((permission) => ({
          organizationId: org.orgId,
          roleId: role.id,
          permission,
        })),
      );
  }
  return role.id;
}

export const ALL_PERMISSIONS: readonly Permission[] = PERMISSIONS;

export async function activeRolePermissionKeys(roleId: string): Promise<string[]> {
  const rows = await testDb()
    .select({ permission: rolePermissions.permission, revokedAt: rolePermissions.revokedAt })
    .from(rolePermissions)
    .where(and(eq(rolePermissions.roleId, roleId)));
  return rows
    .filter((r) => r.revokedAt === null)
    .map((r) => r.permission)
    .sort();
}

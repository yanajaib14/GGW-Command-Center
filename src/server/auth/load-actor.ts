import "server-only";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import {
  employees,
  locations,
  roleAssignments,
  rolePermissions,
  roles,
} from "@/db/schema";
import type { Db, Tx } from "@/server/db/client";
import type { Actor, ActorAssignment } from "./actor";
import { isPermission, type Permission } from "./permissions";
import type { SessionUser } from "./session";

/*
 * Lives apart from actor.ts on purpose: actor.ts is pure and reaches client
 * bundles through src/server/nav.ts; this module touches the database.
 */

/**
 * Load the actor for a signed-in user, in one query. Returns null unless an
 * employee with this auth user ID exists and is `active`.
 *
 * Kept: role assignments with `revoked_at IS NULL` whose location is null
 * (organization-wide) or `active`; role permissions with `revoked_at IS NULL`.
 * Every join stays inside the employee's organization. Permission strings
 * from the database pass through `isPermission`; unknown keys are dropped.
 *
 * An active employee with no usable assignments still gets an Actor (with no
 * assignments), so "signed in, no access" is distinguishable from "not an
 * employee".
 */
export async function loadActor(
  db: Db | Tx,
  user: SessionUser,
): Promise<Actor | null> {
  const activeLocation = sql`exists (
    select 1 from ${locations}
    where ${locations.id} = ${roleAssignments.locationId}
      and ${locations.organizationId} = ${roleAssignments.organizationId}
      and ${locations.status} = 'active'
  )`;

  const rows = await db
    .select({
      employeeId: employees.id,
      organizationId: employees.organizationId,
      email: employees.email,
      displayName: employees.displayName,
      assignmentId: roleAssignments.id,
      roleId: roleAssignments.roleId,
      roleKey: roles.key,
      locationId: roleAssignments.locationId,
      permission: rolePermissions.permission,
    })
    .from(employees)
    .leftJoin(
      roleAssignments,
      and(
        eq(roleAssignments.employeeId, employees.id),
        eq(roleAssignments.organizationId, employees.organizationId),
        isNull(roleAssignments.revokedAt),
        or(isNull(roleAssignments.locationId), activeLocation),
      ),
    )
    .leftJoin(
      roles,
      and(
        eq(roles.id, roleAssignments.roleId),
        eq(roles.organizationId, roleAssignments.organizationId),
      ),
    )
    .leftJoin(
      rolePermissions,
      and(
        eq(rolePermissions.roleId, roles.id),
        eq(rolePermissions.organizationId, roles.organizationId),
        isNull(rolePermissions.revokedAt),
      ),
    )
    .where(
      and(eq(employees.authUserId, user.id), eq(employees.status, "active")),
    )
    .orderBy(asc(roleAssignments.grantedAt), asc(roleAssignments.id));

  const first = rows[0];
  if (!first) return null;

  const byAssignment = new Map<
    string,
    Omit<ActorAssignment, "permissions"> & { permissions: Set<Permission> }
  >();
  for (const row of rows) {
    if (row.assignmentId === null || row.roleId === null || row.roleKey === null) {
      continue;
    }
    let entry = byAssignment.get(row.assignmentId);
    if (!entry) {
      entry = {
        assignmentId: row.assignmentId,
        roleId: row.roleId,
        roleKey: row.roleKey,
        locationId: row.locationId,
        permissions: new Set<Permission>(),
      };
      byAssignment.set(row.assignmentId, entry);
    }
    if (row.permission !== null && isPermission(row.permission)) {
      entry.permissions.add(row.permission);
    }
  }

  return {
    employeeId: first.employeeId,
    organizationId: first.organizationId,
    email: first.email,
    displayName: first.displayName,
    assignments: [...byAssignment.values()].map((a) => ({
      ...a,
      permissions: [...a.permissions],
    })),
  };
}

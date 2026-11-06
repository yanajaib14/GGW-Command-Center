import { hasPermission, type Actor, type Scope } from "./actor";
import { Forbidden } from "./errors";
import type { Permission } from "./permissions";

function scopeFor(locationId: string | null): Scope {
  return locationId === null ? "organization" : { locationId };
}

/**
 * No escalation: every permission in the role must be held at that scope.
 *
 * Not an authorization gate on its own. Callers must first call
 * `requirePermission("staff.manage", scope)` (role changes) or
 * `requirePermission("staff.invite", scope)` (invitations).
 */
export function assertCanGrant(
  actor: Actor,
  rolePermissions: readonly Permission[],
  locationId: string | null,
): void {
  const scope = scopeFor(locationId);
  for (const p of rolePermissions) {
    if (!hasPermission(actor, p, scope)) {
      throw new Forbidden("You cannot grant a role with more access than you have.");
    }
  }
}

/**
 * Managers can invite Employees only: roles that can invite need staff.manage.
 *
 * Not an authorization gate on its own. Callers must first call
 * `requirePermission("staff.invite", scope)`.
 */
export function assertCanInviteWithRole(
  actor: Actor,
  rolePermissions: readonly Permission[],
  locationId: string | null,
): void {
  assertCanGrant(actor, rolePermissions, locationId);
  if (
    rolePermissions.includes("staff.invite") &&
    !hasPermission(actor, "staff.manage", scopeFor(locationId))
  ) {
    throw new Forbidden("You cannot invite someone into that role.");
  }
}

export function assertNotSelf(actor: Actor, targetEmployeeId: string): void {
  if (actor.employeeId === targetEmployeeId) {
    throw new Forbidden("You cannot change your own access or status.");
  }
}

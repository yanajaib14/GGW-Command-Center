import { EXPERIENCES, type Permission } from "./permissions";

export type ActorAssignment = {
  assignmentId: string;
  roleId: string;
  roleKey: string;
  /** null means the assignment is organization-wide. */
  locationId: string | null;
  permissions: readonly Permission[];
};

export type Actor = {
  employeeId: string;
  organizationId: string;
  email: string;
  displayName: string;
  assignments: readonly ActorAssignment[];
};

export type Scope = { locationId: string } | "organization" | "any";

function applies(a: ActorAssignment, scope: Scope): boolean {
  if (scope === "any") return true;
  if (scope === "organization") return a.locationId === null;
  return a.locationId === null || a.locationId === scope.locationId;
}

export function hasPermission(
  actor: Actor,
  p: Permission,
  scope: Scope,
): boolean {
  return actor.assignments.some(
    (a) => applies(a, scope) && a.permissions.includes(p),
  );
}

export function allowedLocationIds(
  actor: Actor,
  p: Permission,
): "all" | string[] {
  const holding = actor.assignments.filter((a) => a.permissions.includes(p));
  if (holding.some((a) => a.locationId === null)) return "all";
  const ids = new Set<string>();
  for (const a of holding) {
    if (a.locationId !== null) ids.add(a.locationId);
  }
  return [...ids];
}

export function landingPath(actor: Actor): string {
  const found = EXPERIENCES.find((e) => hasPermission(actor, e.permission, "any"));
  return found?.path ?? "/no-access";
}

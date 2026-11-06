export const PERMISSIONS = [
  "dashboard.employee",
  "dashboard.manager",
  "dashboard.owner",
  "profile.edit_own",
  "staff.view",
  "staff.invite",
  "staff.manage",
  "roles.manage",
  "locations.manage",
  "audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(s: string): s is Permission {
  return (PERMISSIONS as readonly string[]).includes(s);
}

function freezeList(list: readonly Permission[]): readonly Permission[] {
  return Object.freeze([...list]);
}

/** Immutable: runtime changes to a role's permissions belong in the database. */
export const DEFAULT_ROLE_PERMISSIONS: Readonly<
  Record<"owner" | "manager" | "employee", readonly Permission[]>
> = Object.freeze({
  owner: freezeList(PERMISSIONS),
  manager: freezeList([
    "dashboard.employee",
    "dashboard.manager",
    "profile.edit_own",
    "staff.view",
    "staff.invite",
  ]),
  employee: freezeList(["dashboard.employee", "profile.edit_own"]),
});

export const EXPERIENCES = [
  { key: "owner", permission: "dashboard.owner", path: "/owner" },
  { key: "manager", permission: "dashboard.manager", path: "/manager" },
  { key: "employee", permission: "dashboard.employee", path: "/hub" },
] as const satisfies readonly {
  key: string;
  permission: Permission;
  path: string;
}[];

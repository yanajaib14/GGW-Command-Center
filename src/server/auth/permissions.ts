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

export const DEFAULT_ROLE_PERMISSIONS: Record<
  "owner" | "manager" | "employee",
  readonly Permission[]
> = {
  owner: [...PERMISSIONS],
  manager: [
    "dashboard.employee",
    "dashboard.manager",
    "profile.edit_own",
    "staff.view",
    "staff.invite",
  ],
  employee: ["dashboard.employee", "profile.edit_own"],
};

export const EXPERIENCES = [
  { key: "owner", permission: "dashboard.owner", path: "/owner" },
  { key: "manager", permission: "dashboard.manager", path: "/manager" },
  { key: "employee", permission: "dashboard.employee", path: "/hub" },
] as const satisfies readonly {
  key: string;
  permission: Permission;
  path: string;
}[];

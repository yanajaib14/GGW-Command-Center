import type { Permission } from "@/server/auth/permissions";

export type PermissionGroup = {
  title: string;
  items: ReadonlyArray<{ key: Permission; label: string }>;
};

/** Plain-language labels, grouped by area, for the roles page. Pure; client-safe. */
export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  {
    title: "Screens",
    items: [
      { key: "dashboard.employee", label: "Employee screens" },
      { key: "dashboard.manager", label: "Manager screens" },
      { key: "dashboard.owner", label: "Owner screens" },
    ],
  },
  {
    title: "Profile",
    items: [{ key: "profile.edit_own", label: "Edit their own profile" }],
  },
  {
    title: "Staff",
    items: [
      { key: "staff.view", label: "See staff" },
      { key: "staff.invite", label: "Invite staff" },
      { key: "staff.manage", label: "Change staff status and roles" },
    ],
  },
  {
    title: "Roles",
    items: [{ key: "roles.manage", label: "Create roles and change what they can do" }],
  },
  {
    title: "Locations",
    items: [{ key: "locations.manage", label: "Add and edit locations" }],
  },
  {
    title: "Audit",
    items: [{ key: "audit.view", label: "Read the audit log" }],
  },
];

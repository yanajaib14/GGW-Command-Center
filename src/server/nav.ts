import { hasPermission, type Actor } from "@/server/auth/actor";
import { EXPERIENCES, type Permission } from "@/server/auth/permissions";

export type Experience = "owner" | "manager" | "employee";

/** `icon` is a string key resolved by the shell's icon map. */
export type NavItem = { label: string; href: string; icon: string };

type NavDef = NavItem & { permission: Permission };

const NAV: Record<Experience, readonly NavDef[]> = {
  employee: [
    { label: "Today", href: "/hub", icon: "today", permission: "dashboard.employee" },
    { label: "Profile", href: "/hub/profile", icon: "profile", permission: "profile.edit_own" },
  ],
  manager: [
    { label: "Staff", href: "/manager", icon: "staff", permission: "dashboard.manager" },
  ],
  owner: [
    { label: "Overview", href: "/owner", icon: "overview", permission: "dashboard.owner" },
    { label: "Roles", href: "/owner/roles", icon: "roles", permission: "roles.manage" },
    { label: "Locations", href: "/owner/locations", icon: "locations", permission: "locations.manage" },
    { label: "Audit", href: "/owner/audit", icon: "audit", permission: "audit.view" },
  ],
};

/** Items for one experience, limited to permissions held at any scope. */
export function navFor(actor: Actor, experience: Experience): NavItem[] {
  return NAV[experience]
    .filter((item) => hasPermission(actor, item.permission, "any"))
    .map(({ label, href, icon }) => ({ label, href, icon }));
}

export function experiencesFor(actor: Actor): Experience[] {
  return EXPERIENCES.filter((e) => hasPermission(actor, e.permission, "any")).map(
    (e) => e.key,
  );
}

export function experiencePath(experience: Experience): string {
  return EXPERIENCES.find((e) => e.key === experience)?.path ?? "/";
}

/** The href of the item matching `pathname`; the longest prefix wins. */
export function activeHref(items: readonly NavItem[], pathname: string): string | null {
  let best: string | null = null;
  for (const { href } of items) {
    const match = pathname === href || pathname.startsWith(`${href}/`);
    if (match && (best === null || href.length > best.length)) best = href;
  }
  return best;
}

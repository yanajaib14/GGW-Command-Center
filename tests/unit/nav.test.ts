import { describe, expect, it } from "vitest";
import { activeHref, experiencesFor, navFor } from "@/server/nav";
import {
  DEFAULT_ROLE_PERMISSIONS,
  type Permission,
} from "@/server/auth/permissions";
import type { Actor } from "@/server/auth/actor";

function actorWith(...roles: Array<readonly Permission[]>): Actor {
  return {
    employeeId: "e1",
    organizationId: "o1",
    email: "a@example.com",
    displayName: "A",
    assignments: roles.map((permissions, i) => ({
      assignmentId: `a${i}`,
      roleId: `r${i}`,
      roleKey: "custom",
      locationId: null,
      permissions,
    })),
  };
}

describe("navFor", () => {
  it("employee sees only hub items", () => {
    const actor = actorWith(DEFAULT_ROLE_PERMISSIONS.employee);
    const items = navFor(actor, "employee");
    expect(items.map((i) => i.href)).toEqual(["/hub", "/hub/profile"]);
    expect(items.map((i) => i.label)).toEqual(["Today", "Profile"]);
  });

  it("owner sees Roles, Locations, Audit", () => {
    const actor = actorWith(DEFAULT_ROLE_PERMISSIONS.owner);
    const labels = navFor(actor, "owner").map((i) => i.label);
    expect(labels).toEqual(["Overview", "Roles", "Locations", "Audit"]);
  });

  it("owner-role-without-audit (custom matrix) hides Audit", () => {
    const perms = DEFAULT_ROLE_PERMISSIONS.owner.filter(
      (p) => p !== "audit.view",
    );
    const labels = navFor(actorWith(perms), "owner").map((i) => i.label);
    expect(labels).toEqual(["Overview", "Roles", "Locations"]);
  });

  it("manager sees Staff", () => {
    const actor = actorWith(DEFAULT_ROLE_PERMISSIONS.manager);
    expect(navFor(actor, "manager")).toEqual([
      { label: "Staff", href: "/manager", icon: "staff" },
    ]);
  });

  it("returns nothing for an experience the actor does not hold", () => {
    const actor = actorWith(DEFAULT_ROLE_PERMISSIONS.employee);
    expect(navFor(actor, "owner")).toEqual([]);
  });
});

describe("experiencesFor", () => {
  it("manager+employee -> [manager, employee]", () => {
    const actor = actorWith(DEFAULT_ROLE_PERMISSIONS.manager);
    expect(experiencesFor(actor)).toEqual(["manager", "employee"]);
  });

  it("owner holds all three", () => {
    const actor = actorWith(DEFAULT_ROLE_PERMISSIONS.owner);
    expect(experiencesFor(actor)).toEqual(["owner", "manager", "employee"]);
  });
});

describe("activeHref", () => {
  const items = [
    { label: "Overview", href: "/owner", icon: "overview" },
    { label: "Roles", href: "/owner/roles", icon: "roles" },
  ];
  it("prefers the longest matching prefix", () => {
    expect(activeHref(items, "/owner/roles")).toBe("/owner/roles");
    expect(activeHref(items, "/owner/roles/x")).toBe("/owner/roles");
    expect(activeHref(items, "/owner")).toBe("/owner");
  });
  it("returns null when nothing matches", () => {
    expect(activeHref(items, "/ownerx")).toBeNull();
  });
});

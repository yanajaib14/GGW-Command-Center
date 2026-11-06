import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  isPermission,
  type Permission,
} from "@/server/auth/permissions";
import {
  allowedLocationIds,
  hasPermission,
  landingPath,
  type Actor,
  type ActorAssignment,
} from "@/server/auth/actor";

const L1 = "00000000-0000-4000-8000-0000000000a1";
const L2 = "00000000-0000-4000-8000-0000000000a2";

type RoleKey = "owner" | "manager" | "employee";

function makeAssignment(
  roleKey: RoleKey,
  locationId: string | null,
): ActorAssignment {
  return {
    assignmentId: `assign-${roleKey}-${locationId ?? "org"}`,
    roleId: `role-${roleKey}`,
    roleKey,
    locationId,
    permissions: DEFAULT_ROLE_PERMISSIONS[roleKey],
  };
}

function makeActor(assignments: readonly ActorAssignment[]): Actor {
  return {
    employeeId: "emp-1",
    organizationId: "org-1",
    email: "a@example.com",
    displayName: "A",
    assignments,
  };
}

// Copied from spec section 8 (Catalog table).
const EXPECTED: Record<Permission, Record<RoleKey, boolean>> = {
  "dashboard.employee": { owner: true, manager: true, employee: true },
  "dashboard.manager": { owner: true, manager: true, employee: false },
  "dashboard.owner": { owner: true, manager: false, employee: false },
  "profile.edit_own": { owner: true, manager: true, employee: true },
  "staff.view": { owner: true, manager: true, employee: false },
  "staff.invite": { owner: true, manager: true, employee: false },
  "staff.manage": { owner: true, manager: false, employee: false },
  "roles.manage": { owner: true, manager: false, employee: false },
  "locations.manage": { owner: true, manager: false, employee: false },
  "audit.view": { owner: true, manager: false, employee: false },
};

describe("permission catalog", () => {
  it("has exactly the 10 spec keys", () => {
    expect([...PERMISSIONS].sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it("matrix matches the spec", () => {
    const roles: RoleKey[] = ["owner", "manager", "employee"];
    let count = 0;
    for (const permission of PERMISSIONS) {
      for (const role of roles) {
        count += 1;
        expect(
          DEFAULT_ROLE_PERMISSIONS[role].includes(permission),
          `${role} / ${permission}`,
        ).toBe(EXPECTED[permission][role]);
      }
    }
    expect(count).toBe(30);
  });

  it("isPermission rejects unknown keys", () => {
    expect(isPermission("staff.delete")).toBe(false);
    expect(isPermission("staff.view")).toBe(true);
  });
});

describe("hasPermission", () => {
  it("location-scoped assignment grants only at that location", () => {
    const actor = makeActor([makeAssignment("manager", L1)]);
    expect(hasPermission(actor, "staff.view", { locationId: L1 })).toBe(true);
    expect(hasPermission(actor, "staff.view", { locationId: L2 })).toBe(false);
    expect(hasPermission(actor, "staff.view", "organization")).toBe(false);
    expect(hasPermission(actor, "staff.view", "any")).toBe(true);
  });

  it("org-wide assignment grants everywhere", () => {
    const actor = makeActor([makeAssignment("owner", null)]);
    expect(hasPermission(actor, "staff.manage", { locationId: L1 })).toBe(true);
    expect(hasPermission(actor, "staff.manage", { locationId: L2 })).toBe(true);
    expect(hasPermission(actor, "staff.manage", "organization")).toBe(true);
  });

  it("multiple roles union their permissions", () => {
    const actor = makeActor([
      makeAssignment("employee", L1),
      makeAssignment("manager", L2),
    ]);
    expect(hasPermission(actor, "staff.invite", { locationId: L2 })).toBe(true);
    expect(hasPermission(actor, "staff.invite", { locationId: L1 })).toBe(false);
    expect(hasPermission(actor, "dashboard.employee", { locationId: L1 })).toBe(
      true,
    );
  });
});

describe("allowedLocationIds", () => {
  it("returns all for an org-wide holder", () => {
    const actor = makeActor([makeAssignment("owner", null)]);
    expect(allowedLocationIds(actor, "staff.view")).toBe("all");
  });

  it("lists locations for location-scoped holders", () => {
    const actor = makeActor([
      makeAssignment("manager", L1),
      makeAssignment("manager", L2),
    ]);
    expect(allowedLocationIds(actor, "staff.view")).toEqual([L1, L2]);
  });

  it("returns empty when the permission is not held", () => {
    const actor = makeActor([makeAssignment("employee", L1)]);
    expect(allowedLocationIds(actor, "staff.view")).toEqual([]);
  });
});

describe("landingPath", () => {
  it("owner goes to /owner", () => {
    expect(landingPath(makeActor([makeAssignment("owner", null)]))).toBe(
      "/owner",
    );
  });

  it("manager plus employee goes to /manager", () => {
    const actor = makeActor([
      makeAssignment("employee", L1),
      makeAssignment("manager", L2),
    ]);
    expect(landingPath(actor)).toBe("/manager");
  });

  it("employee goes to /hub", () => {
    expect(landingPath(makeActor([makeAssignment("employee", L1)]))).toBe(
      "/hub",
    );
  });

  it("no assignments goes to /no-access", () => {
    expect(landingPath(makeActor([]))).toBe("/no-access");
  });
});

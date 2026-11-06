import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_PERMISSIONS } from "@/server/auth/permissions";
import type { Actor, ActorAssignment } from "@/server/auth/actor";
import {
  assertCanGrant,
  assertCanInviteWithRole,
  assertNotSelf,
} from "@/server/auth/guardrails";
import {
  AppError,
  Conflict,
  Forbidden,
  Invalid,
  NotFound,
  Unauthenticated,
} from "@/server/auth/errors";

const L1 = "00000000-0000-4000-8000-0000000000a1";
const L2 = "00000000-0000-4000-8000-0000000000a2";

type RoleKey = "owner" | "manager" | "employee";

function makeActor(assignments: readonly [RoleKey, string | null][]): Actor {
  const list: ActorAssignment[] = assignments.map(([roleKey, locationId]) => ({
    assignmentId: `a-${roleKey}-${locationId ?? "org"}`,
    roleId: `r-${roleKey}`,
    roleKey,
    locationId,
    permissions: DEFAULT_ROLE_PERMISSIONS[roleKey],
  }));
  return {
    employeeId: "emp-1",
    organizationId: "org-1",
    email: "a@example.com",
    displayName: "A",
    assignments: list,
  };
}

const manager = makeActor([["manager", L1]]);
const owner = makeActor([["owner", null]]);

describe("assertCanGrant", () => {
  it("manager can grant employee role at own location", () => {
    expect(() =>
      assertCanGrant(manager, DEFAULT_ROLE_PERMISSIONS.employee, L1),
    ).not.toThrow();
  });

  it("manager cannot grant owner role at own location", () => {
    expect(() =>
      assertCanGrant(manager, DEFAULT_ROLE_PERMISSIONS.owner, L1),
    ).toThrow(Forbidden);
  });

  it("manager cannot grant employee role at another location", () => {
    expect(() =>
      assertCanGrant(manager, DEFAULT_ROLE_PERMISSIONS.employee, L2),
    ).toThrow(Forbidden);
  });

  it("manager cannot grant org-wide roles", () => {
    expect(() =>
      assertCanGrant(manager, DEFAULT_ROLE_PERMISSIONS.employee, null),
    ).toThrow(Forbidden);
  });

  it("owner can grant owner role org-wide", () => {
    expect(() =>
      assertCanGrant(owner, DEFAULT_ROLE_PERMISSIONS.owner, null),
    ).not.toThrow();
  });
});

describe("assertCanInviteWithRole", () => {
  it("manager cannot invite another manager", () => {
    expect(() =>
      assertCanInviteWithRole(manager, DEFAULT_ROLE_PERMISSIONS.manager, L1),
    ).toThrow(Forbidden);
  });

  it("manager can invite an employee", () => {
    expect(() =>
      assertCanInviteWithRole(manager, DEFAULT_ROLE_PERMISSIONS.employee, L1),
    ).not.toThrow();
  });

  it("owner can invite a manager", () => {
    expect(() =>
      assertCanInviteWithRole(owner, DEFAULT_ROLE_PERMISSIONS.manager, L1),
    ).not.toThrow();
  });

  it("custom role with staff.invite and staff.manage at L1 can invite a manager at L1 only", () => {
    const actor: Actor = {
      employeeId: "emp-2",
      organizationId: "org-1",
      email: "b@example.com",
      displayName: "B",
      assignments: [
        {
          assignmentId: "a-custom",
          roleId: "r-custom",
          roleKey: "custom",
          locationId: L1,
          permissions: [
            ...DEFAULT_ROLE_PERMISSIONS.manager,
            "staff.manage",
          ],
        },
      ],
    };
    expect(() =>
      assertCanInviteWithRole(actor, DEFAULT_ROLE_PERMISSIONS.manager, L1),
    ).not.toThrow();
    expect(() =>
      assertCanInviteWithRole(actor, DEFAULT_ROLE_PERMISSIONS.manager, L2),
    ).toThrow(Forbidden);
  });
});

describe("assertNotSelf", () => {
  it("cannot act on self", () => {
    expect(() => assertNotSelf(manager, manager.employeeId)).toThrow(Forbidden);
  });

  it("can act on someone else", () => {
    expect(() => assertNotSelf(manager, "someone-else")).not.toThrow();
  });
});

describe("error classes", () => {
  const cases = [
    ["Unauthenticated", Unauthenticated, "UNAUTHENTICATED"],
    ["Forbidden", Forbidden, "FORBIDDEN"],
    ["NotFound", NotFound, "NOT_FOUND"],
    ["Conflict", Conflict, "CONFLICT"],
    ["Invalid", Invalid, "INVALID"],
  ] as const;

  it.each(cases)("%s has the right code and name", (name, Cls, code) => {
    const error = new Cls();
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Cls);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(code);
    expect(error.name).toBe(name);
    expect(error.message.length).toBeGreaterThan(0);
  });
});

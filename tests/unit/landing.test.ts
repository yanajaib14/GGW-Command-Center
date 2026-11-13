import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/auth/actor";
import { experienceFromPath, resolveLanding } from "@/server/landing";

const user = { id: "u1", email: "a@example.test", emailVerified: true };

function actorWith(permissions: Actor["assignments"][number]["permissions"]): Actor {
  return {
    employeeId: "e1",
    organizationId: "o1",
    email: "a@example.test",
    displayName: "A",
    assignments: [
      { assignmentId: "a1", roleId: "r1", roleKey: "x", locationId: null, permissions },
    ],
  };
}

describe("resolveLanding", () => {
  it("sends signed-out visitors to sign-in", () => {
    expect(resolveLanding(null, null)).toBe("/sign-in");
    expect(resolveLanding(null, actorWith(["dashboard.owner"]))).toBe("/sign-in");
  });

  it("sends signed-in users without an active employee to no-access", () => {
    expect(resolveLanding(user, null)).toBe("/no-access");
  });

  it("sends actors to their highest experience", () => {
    expect(resolveLanding(user, actorWith(["dashboard.owner", "dashboard.employee"]))).toBe("/owner");
    expect(resolveLanding(user, actorWith(["dashboard.manager"]))).toBe("/manager");
    expect(resolveLanding(user, actorWith(["dashboard.employee"]))).toBe("/hub");
  });

  it("sends actors with no dashboard permission to no-access", () => {
    expect(resolveLanding(user, actorWith([]))).toBe("/no-access");
  });
});

describe("experienceFromPath", () => {
  it("maps path segments to experiences", () => {
    expect(experienceFromPath("/owner")).toBe("owner");
    expect(experienceFromPath("/owner/staff/123")).toBe("owner");
    expect(experienceFromPath("/manager")).toBe("manager");
    expect(experienceFromPath("/manager/x")).toBe("manager");
    expect(experienceFromPath("/hub")).toBe("employee");
    expect(experienceFromPath("/hub/profile")).toBe("employee");
  });

  it("defaults to employee and ignores look-alike prefixes", () => {
    expect(experienceFromPath("/")).toBe("employee");
    expect(experienceFromPath("/ownership")).toBe("employee");
    expect(experienceFromPath("/managers")).toBe("employee");
    expect(experienceFromPath("")).toBe("employee");
  });
});

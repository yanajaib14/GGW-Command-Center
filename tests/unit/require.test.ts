import { describe, expect, it, vi } from "vitest";
import type { Actor, ActorAssignment } from "@/server/auth/actor";
import { Forbidden, Unauthenticated } from "@/server/auth/errors";
import { DEFAULT_ROLE_PERMISSIONS } from "@/server/auth/permissions";
import {
  requireActor,
  requirePermission,
  type SessionUser,
} from "@/server/auth/require";

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

const user: SessionUser = { id: "auth-user-1", email: "a@example.com" };
const signedIn = () => Promise.resolve(user);
const signedOut = () => Promise.resolve(null);

describe("requirePermission", () => {
  it("no session → Unauthenticated, without loading an actor", async () => {
    const loadActor = vi.fn(() => Promise.resolve(makeActor([["owner", null]])));
    await expect(
      requirePermission("staff.view", "any", { getUser: signedOut, loadActor }),
    ).rejects.toBeInstanceOf(Unauthenticated);
    expect(loadActor).not.toHaveBeenCalled();
  });

  it("session without employee → Forbidden", async () => {
    await expect(
      requirePermission("dashboard.employee", "any", {
        getUser: signedIn,
        loadActor: () => Promise.resolve(null),
      }),
    ).rejects.toBeInstanceOf(Forbidden);
  });

  it("employee asking for staff.view → Forbidden", async () => {
    const employee = makeActor([["employee", L1]]);
    await expect(
      requirePermission(
        "staff.view",
        { locationId: L1 },
        { getUser: signedIn, loadActor: () => Promise.resolve(employee) },
      ),
    ).rejects.toBeInstanceOf(Forbidden);
  });

  it("manager staff.view at own location → returns actor", async () => {
    const manager = makeActor([["manager", L1]]);
    const loadActor = vi.fn(() => Promise.resolve(manager));
    const actor = await requirePermission(
      "staff.view",
      { locationId: L1 },
      { getUser: signedIn, loadActor },
    );
    expect(actor).toBe(manager);
    expect(loadActor).toHaveBeenCalledWith(user);
  });

  it("manager staff.view at another location → Forbidden", async () => {
    const manager = makeActor([["manager", L1]]);
    await expect(
      requirePermission(
        "staff.view",
        { locationId: L2 },
        { getUser: signedIn, loadActor: () => Promise.resolve(manager) },
      ),
    ).rejects.toBeInstanceOf(Forbidden);
  });

  it("suspension takes effect on next call", async () => {
    const manager = makeActor([["manager", L1]]);
    // The loader returns null once the employee is suspended (loadActor only
    // matches active employees), so the gate must re-load on every call.
    const loadActor = vi
      .fn<(u: SessionUser) => Promise<Actor | null>>()
      .mockResolvedValueOnce(manager)
      .mockResolvedValueOnce(null);
    const deps = { getUser: signedIn, loadActor };

    await expect(
      requirePermission("staff.view", { locationId: L1 }, deps),
    ).resolves.toBe(manager);
    await expect(
      requirePermission("staff.view", { locationId: L1 }, deps),
    ).rejects.toBeInstanceOf(Forbidden);
    expect(loadActor).toHaveBeenCalledTimes(2);
  });
});

describe("requireActor", () => {
  it("no session → Unauthenticated", async () => {
    await expect(
      requireActor({ getUser: signedOut, loadActor: () => Promise.resolve(null) }),
    ).rejects.toBeInstanceOf(Unauthenticated);
  });

  it("session without active employee → Forbidden", async () => {
    await expect(
      requireActor({ getUser: signedIn, loadActor: () => Promise.resolve(null) }),
    ).rejects.toBeInstanceOf(Forbidden);
  });

  it("active employee with no assignments → returns actor (no permission check)", async () => {
    const bare = makeActor([]);
    await expect(
      requireActor({ getUser: signedIn, loadActor: () => Promise.resolve(bare) }),
    ).resolves.toBe(bare);
  });
});

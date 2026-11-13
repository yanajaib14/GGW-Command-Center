import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { locations, rolePermissions } from "@/db/schema";
import { hasPermission } from "@/server/auth/actor";
import { loadActor } from "@/server/auth/load-actor";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  resetDb,
  seedDefaultPermissions,
  seedEmployee,
  seedOrg,
  testDb,
  type SeededOrg,
} from "../helpers/db";

let org: SeededOrg;

beforeEach(async () => {
  await resetDb();
  org = await seedOrg();
  await seedDefaultPermissions(org);
});

function userFor(authUserId: string) {
  return { id: authUserId, email: "someone@example.test", emailVerified: true };
}

async function closedLocation(): Promise<string> {
  const [row] = await testDb()
    .insert(locations)
    .values({ organizationId: org.orgId, name: "Closed L2", status: "closed" })
    .returning({ id: locations.id });
  if (!row) throw new Error("closed location insert returned no row");
  return row.id;
}

describe("loadActor", () => {
  it("returns null for unknown auth user", async () => {
    await seedEmployee({ orgId: org.orgId, authUserId: "known-user" });
    expect(await loadActor(testDb(), userFor("unknown-user"))).toBeNull();
  });

  it("does not load by email alone", async () => {
    await seedEmployee({
      orgId: org.orgId,
      email: "someone@example.test",
      authUserId: "other-auth-user",
      assignments: [{ roleId: org.roles.owner, locationId: null }],
    });
    // Same email as the session, different auth user id: must not match.
    expect(await loadActor(testDb(), userFor("session-auth-user"))).toBeNull();
  });

  it("returns null for suspended and left employees", async () => {
    for (const status of ["suspended", "left", "invited"] as const) {
      const authUserId = `user-${status}`;
      await seedEmployee({
        orgId: org.orgId,
        status,
        authUserId,
        assignments: [{ roleId: org.roles.owner, locationId: null }],
      });
      expect(await loadActor(testDb(), userFor(authUserId))).toBeNull();
    }
  });

  it("ignores revoked assignments", async () => {
    await seedEmployee({
      orgId: org.orgId,
      authUserId: "u1",
      assignments: [
        { roleId: org.roles.manager, locationId: org.locationId, revoked: true },
        { roleId: org.roles.employee, locationId: org.locationId },
      ],
    });
    const actor = await loadActor(testDb(), userFor("u1"));
    expect(actor).not.toBeNull();
    expect(actor!.assignments.map((a) => a.roleKey)).toEqual(["employee"]);
    expect(hasPermission(actor!, "staff.view", { locationId: org.locationId })).toBe(false);
    expect(hasPermission(actor!, "dashboard.employee", { locationId: org.locationId })).toBe(true);
  });

  it("ignores assignments at a closed location", async () => {
    const l2 = await closedLocation();
    await seedEmployee({
      orgId: org.orgId,
      authUserId: "u1",
      assignments: [{ roleId: org.roles.manager, locationId: l2 }],
    });
    const actor = await loadActor(testDb(), userFor("u1"));
    // Still an active employee (signed in, no access), not "unknown".
    expect(actor).not.toBeNull();
    expect(actor!.assignments).toEqual([]);
    expect(hasPermission(actor!, "staff.view", { locationId: l2 })).toBe(false);
    expect(hasPermission(actor!, "dashboard.manager", "any")).toBe(false);
  });

  it("loads permissions per assignment", async () => {
    await seedEmployee({
      orgId: org.orgId,
      authUserId: "owner-user",
      email: "Owner@Example.test",
      assignments: [{ roleId: org.roles.owner, locationId: null }],
    });
    const actor = await loadActor(testDb(), userFor("owner-user"));
    expect(actor).not.toBeNull();
    expect(actor!.organizationId).toBe(org.orgId);
    expect(actor!.email).toBe("owner@example.test");
    expect(actor!.assignments).toHaveLength(1);
    const [owner] = actor!.assignments;
    expect(owner!.locationId).toBeNull();
    expect([...owner!.permissions].sort()).toEqual([...PERMISSIONS].sort());
    for (const p of PERMISSIONS) {
      expect(hasPermission(actor!, p, "organization")).toBe(true);
    }
  });

  it("ignores revoked role permissions and unknown permission keys", async () => {
    await testDb()
      .update(rolePermissions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(rolePermissions.roleId, org.roles.manager),
          eq(rolePermissions.permission, "staff.invite"),
        ),
      );
    await testDb().insert(rolePermissions).values({
      organizationId: org.orgId,
      roleId: org.roles.manager,
      permission: "legacy.unknown_key",
    });
    await seedEmployee({
      orgId: org.orgId,
      authUserId: "u1",
      assignments: [{ roleId: org.roles.manager, locationId: org.locationId }],
    });
    const actor = await loadActor(testDb(), userFor("u1"));
    const [manager] = actor!.assignments;
    expect([...manager!.permissions].sort()).toEqual(
      ["dashboard.employee", "dashboard.manager", "profile.edit_own", "staff.view"].sort(),
    );
  });
});

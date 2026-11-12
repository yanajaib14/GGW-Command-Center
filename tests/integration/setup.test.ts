import { count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  employees,
  invitations,
  locations,
  organizations,
  rolePermissions,
  roleAssignments,
  roles,
} from "@/db/schema";
import { hashInviteToken } from "@/features/invitations/tokens";
import { runOwnerSetup } from "@/features/setup/service";
import { Conflict } from "@/server/auth/errors";
import type { Tx } from "@/server/db/client";
import { DEFAULT_ROLE_PERMISSIONS } from "@/server/auth/permissions";
import { resetDb, seedEmployee, seedOrg, testDb } from "../helpers/db";

// Run setup on the test branch, never on DATABASE_URL.
const inTestTx = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
  testDb().transaction(fn);

const input = {
  organizationName: "Glai Gung Won",
  slug: "ggw",
  locationName: "Glai Gung Won Tempe",
  ownerEmail: "  Owner@Example.COM ",
  ownerFirstName: "Olive",
  ownerLastName: "Owner",
};

async function rowCounts() {
  const db = testDb();
  const tables = [
    organizations,
    locations,
    roles,
    rolePermissions,
    employees,
    invitations,
    roleAssignments,
    auditLog,
  ];
  const out: number[] = [];
  for (const t of tables) {
    const [row] = await db.select({ n: count() }).from(t);
    out.push(row?.n ?? 0);
  }
  return out;
}

beforeEach(async () => {
  await resetDb();
  process.env.APP_URL = "http://localhost:3000";
});

describe("runOwnerSetup", () => {
  it("creates org, location, three system roles with the spec matrix and an owner invitation", async () => {
    const { inviteUrl } = await runOwnerSetup(input, inTestTx);
    const db = testDb();

    const [org] = await db.select().from(organizations);
    expect(org?.slug).toBe("ggw");
    expect(org?.name).toBe("Glai Gung Won");

    const locs = await db.select().from(locations);
    expect(locs).toHaveLength(1);
    expect(locs[0]?.name).toBe("Glai Gung Won Tempe");

    const roleRows = await db.select().from(roles);
    expect(roleRows.map((r) => r.key).sort()).toEqual(["employee", "manager", "owner"]);
    expect(roleRows.every((r) => r.isSystem)).toBe(true);

    const perms = await db.select().from(rolePermissions);
    for (const role of roleRows) {
      const key = role.key as "owner" | "manager" | "employee";
      expect(
        perms
          .filter((p) => p.roleId === role.id && p.revokedAt === null)
          .map((p) => p.permission)
          .sort(),
      ).toEqual([...DEFAULT_ROLE_PERMISSIONS[key]].sort());
    }

    const [emp] = await db.select().from(employees);
    expect(emp?.status).toBe("invited");
    expect(emp?.authUserId).toBeNull();

    const [inv] = await db.select().from(invitations);
    const ownerRole = roleRows.find((r) => r.key === "owner");
    expect(inv?.roleId).toBe(ownerRole?.id);
    expect(inv?.grantsOrgWide).toBe(true);
    expect(inv?.locationId).toBe(locs[0]?.id);
    expect(inv?.employeeId).toBe(emp?.id);
    expect(inv?.acceptedAt).toBeNull();
    expect(inv?.revokedAt).toBeNull();

    // Link carries the raw token; only its hash is stored. Expires in 7 days.
    expect(inviteUrl.startsWith("http://localhost:3000/invite/")).toBe(true);
    const raw = inviteUrl.split("/invite/")[1] ?? "";
    expect(hashInviteToken(raw)).toBe(inv?.tokenHash);
    const ms = (inv?.expiresAt.getTime() ?? 0) - Date.now();
    expect(ms).toBeGreaterThan(6.99 * 86_400_000);
    expect(ms).toBeLessThanOrEqual(7 * 86_400_000);

    // No assignment yet: the owner gets access only by accepting the invite.
    expect(await db.select().from(roleAssignments)).toHaveLength(0);
  });

  it("writes a setup.run audit entry with actor null", async () => {
    await runOwnerSetup(input, inTestTx);
    const rows = await testDb().select().from(auditLog);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row?.action).toBe("setup.run");
    expect(row?.actorEmployeeId).toBeNull();
    expect(row?.entityType).toBe("organization");
    const [org] = await testDb().select().from(organizations);
    expect(row?.organizationId).toBe(org?.id);
    expect(row?.entityId).toBe(org?.id);
    expect(JSON.stringify(row?.after)).not.toMatch(/invite\//);
  });

  it("refuses when an active owner exists", async () => {
    const org = await seedOrg();
    await seedEmployee({
      orgId: org.orgId,
      status: "active",
      authUserId: "existing-owner",
      assignments: [{ roleId: org.roles.owner, locationId: null }],
    });
    const before = await rowCounts();
    await expect(runOwnerSetup(input, inTestTx)).rejects.toBeInstanceOf(Conflict);
    expect(await rowCounts()).toEqual(before);
  });

  it("is not blocked by a suspended owner or a revoked owner assignment", async () => {
    const org = await seedOrg();
    await seedEmployee({
      orgId: org.orgId,
      status: "suspended",
      authUserId: "suspended-owner",
      assignments: [{ roleId: org.roles.owner, locationId: null }],
    });
    await seedEmployee({
      orgId: org.orgId,
      status: "active",
      authUserId: "ex-owner",
      assignments: [{ roleId: org.roles.owner, locationId: null, revoked: true }],
    });
    const result = await runOwnerSetup(input, inTestTx);
    expect(result.inviteUrl).toContain("/invite/");
  });

  it("refuses a slug that already exists without partial writes", async () => {
    await runOwnerSetup(input, inTestTx);
    const before = await rowCounts();
    await expect(
      runOwnerSetup({ ...input, ownerEmail: "other@example.com" }, inTestTx),
    ).rejects.toBeInstanceOf(Conflict);
    expect(await rowCounts()).toEqual(before);
  });

  it("location timezone defaults to America/Phoenix", async () => {
    await runOwnerSetup(input, inTestTx);
    const [loc] = await testDb().select().from(locations);
    expect(loc?.timezone).toBe("America/Phoenix");
  });

  it("email stored lower-cased and trimmed", async () => {
    await runOwnerSetup(input, inTestTx);
    const db = testDb();
    const [emp] = await db.select().from(employees);
    const [inv] = await db.select().from(invitations);
    expect(emp?.email).toBe("owner@example.com");
    expect(inv?.email).toBe("owner@example.com");
    expect(emp?.displayName).toBe("Olive Owner");
    const matching = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.email, "owner@example.com"));
    expect(matching).toHaveLength(1);
  });
});

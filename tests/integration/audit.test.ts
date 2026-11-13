import { beforeEach, describe, expect, it } from "vitest";
import { auditLog } from "@/db/schema";
import { listAudit } from "@/features/audit/service";
import { setEmployeeStatus } from "@/features/staff/service";
import { Forbidden } from "@/server/auth/errors";
import { actorFor, testDeps as deps } from "../helpers/actors";
import { resetDb, seedDefaultPermissions, seedOrg, testDb, type SeededOrg } from "../helpers/db";

let org: SeededOrg;

async function insertAudit(
  n: number,
  opts: { createdAt?: Date; orgId?: string; actor?: string | null } = {},
) {
  const rows = Array.from({ length: n }, (_, i) => ({
    organizationId: opts.orgId ?? org.orgId,
    actorEmployeeId: opts.actor ?? null,
    action: "role.granted",
    entityType: "role_assignment",
    entityId: `entity-${i}`,
    ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
  }));
  await testDb().insert(auditLog).values(rows);
}

beforeEach(async () => {
  await resetDb();
  org = await seedOrg();
  await seedDefaultPermissions(org);
});

describe("listAudit", () => {
  it("lists newest first with actor names", async () => {
    const owner = await actorFor(org, "owner", null);
    const manager = await actorFor(org, "manager", org.locationId);
    await setEmployeeStatus(owner, manager.employeeId, "suspended", deps);
    await new Promise((r) => setTimeout(r, 15));
    await setEmployeeStatus(owner, manager.employeeId, "active", deps);

    const rows = await listAudit(owner, {}, deps);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.createdAt.getTime()).toBeGreaterThan(rows[1]?.createdAt.getTime() ?? 0);
    expect(rows[0]).toMatchObject({
      action: "employee.status_changed",
      actorName: "Test Employee",
      entityType: "employee",
      entityId: manager.employeeId,
      locationName: null,
    });
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(
      ["action", "actorName", "createdAt", "entityId", "entityType", "id", "locationName"],
    );
  });

  it("never exposes before/after snapshots or other organizations' rows", async () => {
    const owner = await actorFor(org, "owner", null);
    const other = await seedOrg();
    await testDb().insert(auditLog).values([
      {
        organizationId: org.orgId,
        action: "invitation.created",
        entityType: "invitation",
        entityId: "i1",
        after: { tokenHash: "secret", inviteUrl: "http://x/invite/raw" },
      },
      { organizationId: other.orgId, action: "role.granted", entityType: "role_assignment", entityId: "x" },
    ]);
    const rows = await listAudit(owner, {}, deps);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toMatch(/secret|invite\/raw|tokenHash/);
  });

  it("shows the location name and a null actor name for system rows", async () => {
    const owner = await actorFor(org, "owner", null);
    await testDb().insert(auditLog).values({
      organizationId: org.orgId,
      locationId: org.locationId,
      action: "setup.run",
      entityType: "organization",
      entityId: org.orgId,
    });
    const [row] = await listAudit(owner, {}, deps);
    expect(row).toMatchObject({ locationName: "Test Location", actorName: null });
  });

  it("paginates with before", async () => {
    const owner = await actorFor(org, "owner", null);
    const base = Date.now() - 100_000;
    for (let i = 0; i < 5; i++) {
      await insertAudit(1, { createdAt: new Date(base + i * 1000) });
    }
    const first = await listAudit(owner, { limit: 2 }, deps);
    expect(first).toHaveLength(2);
    const last = first[first.length - 1];
    if (!last) throw new Error("empty page");
    const second = await listAudit(owner, { limit: 2, before: last.createdAt }, deps);
    expect(second).toHaveLength(2);
    const third = await listAudit(owner, { limit: 2, before: second[1]?.createdAt }, deps);
    expect(third).toHaveLength(1);
    const ids = [...first, ...second, ...third].map((r) => r.id);
    expect(new Set(ids).size).toBe(5);
    const times = [...first, ...second, ...third].map((r) => r.createdAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("does not skip rows that share a timestamp when paging with a cursor", async () => {
    const owner = await actorFor(org, "owner", null);
    await insertAudit(5, { createdAt: new Date(Date.now() - 50_000) });
    const seen: string[] = [];
    let before: { createdAt: Date; id: string } | undefined;
    for (let page = 0; page < 5; page++) {
      const rows = await listAudit(owner, { limit: 2, before }, deps);
      if (rows.length === 0) break;
      seen.push(...rows.map((r) => r.id));
      const last = rows[rows.length - 1];
      if (!last) break;
      before = { createdAt: last.createdAt, id: last.id };
    }
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  it("clamps the limit", async () => {
    const owner = await actorFor(org, "owner", null);
    await insertAudit(3);
    expect(await listAudit(owner, { limit: 0 }, deps)).toHaveLength(1);
    expect(await listAudit(owner, { limit: 100000 }, deps)).toHaveLength(3);
  });

  it("manager cannot read audit", async () => {
    const manager = await actorFor(org, "manager", org.locationId);
    await expect(listAudit(manager, {}, deps)).rejects.toBeInstanceOf(Forbidden);
    const emp = await actorFor(org, "employee", org.locationId);
    await expect(listAudit(emp, {}, deps)).rejects.toBeInstanceOf(Forbidden);
  });
});

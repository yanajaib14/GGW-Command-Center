import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { auditLog, employees } from "@/db/schema";
import {
  getHubContext,
  updateOwnProfile,
} from "@/features/staff/service";
import type { Actor } from "@/server/auth/actor";
import { Forbidden, Invalid } from "@/server/auth/errors";
import { loadActor } from "@/server/auth/load-actor";
import type { Tx } from "@/server/db/client";
import {
  resetDb,
  seedDefaultPermissions,
  seedEmployee,
  seedOrg,
  testDb,
  type SeededOrg,
} from "../helpers/db";

const inTestTx = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
  testDb().transaction(fn);
const deps = { transaction: inTestTx };

let org: SeededOrg;

async function employeeActor(): Promise<Actor> {
  const authUserId = `auth-${crypto.randomUUID()}`;
  const email = `emp-${crypto.randomUUID()}@example.test`;
  await seedEmployee({
    orgId: org.orgId,
    authUserId,
    email,
    assignments: [{ roleId: org.roles.employee, locationId: org.locationId }],
  });
  const actor = await loadActor(testDb(), { id: authUserId, email, emailVerified: true });
  if (!actor) throw new Error("actor did not load");
  return actor;
}

beforeEach(async () => {
  await resetDb();
  org = await seedOrg();
  await seedDefaultPermissions(org);
});

describe("updateOwnProfile", () => {
  it("updates own display name and phone with audit", async () => {
    const actor = await employeeActor();
    await updateOwnProfile(
      actor,
      { displayName: "  Som C.  ", phone: "+1 (602) 555-0100" },
      deps,
    );
    const [row] = await testDb().select().from(employees).where(eq(employees.id, actor.employeeId));
    expect(row?.displayName).toBe("Som C.");
    expect(row?.phone).toBe("+1 (602) 555-0100");

    const audits = await testDb().select().from(auditLog).where(eq(auditLog.action, "employee.profile_updated"));
    expect(audits).toHaveLength(1);
    expect(audits[0]?.actorEmployeeId).toBe(actor.employeeId);
    expect(audits[0]?.entityId).toBe(actor.employeeId);
    expect(audits[0]?.before).toMatchObject({ displayName: "Test Employee", phone: null });
    expect(audits[0]?.after).toMatchObject({ displayName: "Som C.", phone: "+1 (602) 555-0100" });
  });

  it("clears the phone when it is blank", async () => {
    const actor = await employeeActor();
    await updateOwnProfile(actor, { displayName: "Som", phone: "555 0100" }, deps);
    await updateOwnProfile(actor, { displayName: "Som", phone: "  " }, deps);
    const [row] = await testDb().select().from(employees).where(eq(employees.id, actor.employeeId));
    expect(row?.phone).toBeNull();
  });

  it("rejects empty display name", async () => {
    const actor = await employeeActor();
    await expect(
      updateOwnProfile(actor, { displayName: "   ", phone: null }, deps),
    ).rejects.toBeInstanceOf(Invalid);
    await expect(
      updateOwnProfile(actor, { displayName: "x".repeat(61), phone: null }, deps),
    ).rejects.toBeInstanceOf(Invalid);
  });

  it("rejects a bad phone number", async () => {
    const actor = await employeeActor();
    await expect(
      updateOwnProfile(actor, { displayName: "Som", phone: "call me" }, deps),
    ).rejects.toBeInstanceOf(Invalid);
    await expect(
      updateOwnProfile(actor, { displayName: "Som", phone: "1".repeat(21) }, deps),
    ).rejects.toBeInstanceOf(Invalid);
  });

  it("cannot change email or status through profile", async () => {
    const actor = await employeeActor();
    const sneaky = {
      displayName: "Som",
      phone: null,
      email: "hacker@example.test",
      status: "suspended",
      organizationId: crypto.randomUUID(),
    };
    await updateOwnProfile(actor, sneaky, deps);
    const [row] = await testDb().select().from(employees).where(eq(employees.id, actor.employeeId));
    expect(row?.email).toBe(actor.email);
    expect(row?.status).toBe("active");
    expect(row?.organizationId).toBe(org.orgId);
  });

  it("is refused without profile.edit_own", async () => {
    const actor = await employeeActor();
    const stripped: Actor = {
      ...actor,
      assignments: actor.assignments.map((a) => ({
        ...a,
        permissions: a.permissions.filter((p) => p !== "profile.edit_own"),
      })),
    };
    await expect(
      updateOwnProfile(stripped, { displayName: "Som", phone: null }, deps),
    ).rejects.toBeInstanceOf(Forbidden);
  });
});

describe("getHubContext", () => {
  it("returns the location name and timezone of the actor's assignment", async () => {
    const actor = await employeeActor();
    const ctx = await getHubContext(actor, deps);
    expect(ctx.locationName).toBe("Test Location");
    expect(ctx.timezone).toBe("America/Phoenix");
  });
});

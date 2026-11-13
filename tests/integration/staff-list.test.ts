import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { invitations, locations } from "@/db/schema";
import {
  acceptInvitation,
  createInvitation,
  revokeInvitation,
} from "@/features/invitations/service";
import {
  listInvitableLocations,
  listInvitableRoles,
  listPendingInvitations,
  listStaff,
} from "@/features/staff/service";
import type { Actor } from "@/server/auth/actor";
import { Forbidden, Invalid, NotFound } from "@/server/auth/errors";
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
let locA: string;
let locB: string;

async function actorFor(
  roleKey: "owner" | "manager" | "employee",
  locationId: string | null,
): Promise<Actor> {
  const authUserId = `auth-${crypto.randomUUID()}`;
  const email = `${roleKey}-${crypto.randomUUID()}@example.test`;
  await seedEmployee({
    orgId: org.orgId,
    authUserId,
    email,
    assignments: [{ roleId: org.roles[roleKey], locationId }],
  });
  const actor = await loadActor(testDb(), { id: authUserId, email, emailVerified: true });
  if (!actor) throw new Error("actor did not load");
  return actor;
}

function inviteInput(email: string, locationId: string, roleId = org.roles.employee) {
  return { firstName: "New", lastName: "Hire", email, locationId, roleId };
}

beforeEach(async () => {
  await resetDb();
  process.env.APP_URL = "http://localhost:3000";
  org = await seedOrg();
  await seedDefaultPermissions(org);
  locA = org.locationId;
  const [b] = await testDb()
    .insert(locations)
    .values({ organizationId: org.orgId, name: "Second Location" })
    .returning({ id: locations.id });
  if (!b) throw new Error("second location insert failed");
  locB = b.id;
});

describe("listStaff", () => {
  it("manager sees only staff at own location", async () => {
    const managerA = await actorFor("manager", locA);
    const empA = await actorFor("employee", locA);
    const empB = await actorFor("employee", locB);
    const managerB = await actorFor("manager", locB);
    const owner = await actorFor("owner", null);

    const rows = await listStaff(managerA, {}, deps);
    const ids = rows.map((r) => r.employeeId);
    expect(ids).toContain(managerA.employeeId);
    expect(ids).toContain(empA.employeeId);
    expect(ids).not.toContain(empB.employeeId);
    expect(ids).not.toContain(managerB.employeeId);
    expect(ids).not.toContain(owner.employeeId);
    for (const r of rows) {
      for (const role of r.roles) expect(role.locationName).toBe("Test Location");
    }
  });

  it("rejects a malformed location id", async () => {
    const owner = await actorFor("owner", null);
    await expect(listStaff(owner, { locationId: "not-a-uuid" }, deps)).rejects.toBeInstanceOf(Invalid);
  });

  it("manager cannot widen the list with another location id", async () => {
    const managerA = await actorFor("manager", locA);
    await actorFor("employee", locB);
    await expect(listStaff(managerA, { locationId: locB }, deps)).rejects.toBeInstanceOf(Forbidden);
  });

  it("manager does not see another location's roles on a shared employee", async () => {
    const managerA = await actorFor("manager", locA);
    const sharedId = await seedEmployee({
      orgId: org.orgId,
      authUserId: `auth-${crypto.randomUUID()}`,
      assignments: [
        { roleId: org.roles.employee, locationId: locA },
        { roleId: org.roles.manager, locationId: locB },
        { roleId: org.roles.owner, locationId: null },
      ],
    });
    const rows = await listStaff(managerA, {}, deps);
    const shared = rows.find((r) => r.employeeId === sharedId);
    expect(shared?.roles).toEqual([{ roleName: "Employee", locationName: "Test Location" }]);
  });

  it("owner sees all locations, including org-wide and inactive staff", async () => {
    const owner = await actorFor("owner", null);
    const empA = await actorFor("employee", locA);
    const empB = await actorFor("employee", locB);
    const left = await seedEmployee({ orgId: org.orgId, status: "left" });
    const rows = await listStaff(owner, {}, deps);
    const ids = rows.map((r) => r.employeeId);
    for (const id of [owner.employeeId, empA.employeeId, empB.employeeId, left]) {
      expect(ids).toContain(id);
    }
    const filtered = await listStaff(owner, { locationId: locB }, deps);
    expect(filtered.map((r) => r.employeeId)).toEqual([empB.employeeId]);
  });

  it("never returns another organization's staff", async () => {
    const owner = await actorFor("owner", null);
    const other = await seedOrg();
    const otherEmp = await seedEmployee({
      orgId: other.orgId,
      assignments: [{ roleId: other.roles.employee, locationId: other.locationId }],
    });
    const rows = await listStaff(owner, {}, deps);
    expect(rows.map((r) => r.employeeId)).not.toContain(otherEmp);
    expect(await listStaff(owner, { locationId: other.locationId }, deps)).toEqual([]);
  });

  it("shows an invited employee at the invitation location only", async () => {
    const managerA = await actorFor("manager", locA);
    const managerB = await actorFor("manager", locB);
    const owner = await actorFor("owner", null);
    await createInvitation(managerA, inviteInput("a@example.com", locA), deps);
    await createInvitation(managerB, inviteInput("b@example.com", locB), deps);

    const rowsA = await listStaff(managerA, {}, deps);
    expect(rowsA.map((r) => r.email)).toContain("a@example.com");
    expect(rowsA.map((r) => r.email)).not.toContain("b@example.com");
    const invited = rowsA.find((r) => r.email === "a@example.com");
    expect(invited?.status).toBe("invited");
    expect(invited?.roles).toEqual([{ roleName: "Employee", locationName: "Test Location" }]);

    const rowsOwner = await listStaff(owner, {}, deps);
    expect(rowsOwner.map((r) => r.email)).toEqual(
      expect.arrayContaining(["a@example.com", "b@example.com"]),
    );
  });

  it("employee cannot list staff", async () => {
    const emp = await actorFor("employee", locA);
    await expect(listStaff(emp, {}, deps)).rejects.toBeInstanceOf(Forbidden);
  });
});

describe("listPendingInvitations", () => {
  it("excludes expired, revoked and accepted", async () => {
    const manager = await actorFor("manager", locA);
    const open = await createInvitation(manager, inviteInput("open@example.com", locA), deps);
    const expired = await createInvitation(manager, inviteInput("expired@example.com", locA), deps);
    const revoked = await createInvitation(manager, inviteInput("revoked@example.com", locA), deps);
    const accepted = await createInvitation(manager, inviteInput("accepted@example.com", locA), deps);

    await testDb()
      .update(invitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invitations.id, expired.invitationId));
    await revokeInvitation(manager, revoked.invitationId, deps);
    const token = accepted.inviteUrl.split("/invite/")[1] ?? "";
    await acceptInvitation(
      { id: `auth-${crypto.randomUUID()}`, email: "accepted@example.com", emailVerified: true },
      token,
      deps,
    );

    const rows = await listPendingInvitations(manager, deps);
    expect(rows.map((r) => r.invitationId)).toEqual([open.invitationId]);
    expect(rows[0]).toMatchObject({
      email: "open@example.com",
      roleName: "Employee",
      locationName: "Test Location",
    });
    expect(rows[0]?.expiresAt).toBeInstanceOf(Date);
  });

  it("manager sees only own location invites; owner sees all", async () => {
    const managerA = await actorFor("manager", locA);
    const managerB = await actorFor("manager", locB);
    const owner = await actorFor("owner", null);
    const a = await createInvitation(managerA, inviteInput("a@example.com", locA), deps);
    const b = await createInvitation(managerB, inviteInput("b@example.com", locB), deps);
    const ownerInvite = await createInvitation(
      owner,
      inviteInput("boss@example.com", locA, org.roles.owner),
      deps,
    );

    expect((await listPendingInvitations(managerA, deps)).map((r) => r.invitationId)).toEqual([
      a.invitationId,
    ]);
    const all = (await listPendingInvitations(owner, deps)).map((r) => r.invitationId);
    expect(all).toEqual(
      expect.arrayContaining([a.invitationId, b.invitationId, ownerInvite.invitationId]),
    );
  });

  it("employee cannot list pending invitations", async () => {
    const emp = await actorFor("employee", locA);
    await expect(listPendingInvitations(emp, deps)).rejects.toBeInstanceOf(Forbidden);
  });
});

describe("listInvitableRoles", () => {
  it("manager invitable roles are Employee only", async () => {
    const manager = await actorFor("manager", locA);
    const roles = await listInvitableRoles(manager, locA, deps);
    expect(roles.map((r) => r.name)).toEqual(["Employee"]);
    expect(roles[0]?.id).toBe(org.roles.employee);
  });

  it("owner may invite any role", async () => {
    const owner = await actorFor("owner", null);
    const roles = await listInvitableRoles(owner, locA, deps);
    expect(roles.map((r) => r.name).sort()).toEqual(["Employee", "Manager", "Owner"]);
  });

  it("refuses a location the manager does not run, and one that does not exist", async () => {
    const manager = await actorFor("manager", locA);
    await expect(listInvitableRoles(manager, locB, deps)).rejects.toBeInstanceOf(Forbidden);
    const owner = await actorFor("owner", null);
    await expect(listInvitableRoles(owner, crypto.randomUUID(), deps)).rejects.toBeInstanceOf(
      NotFound,
    );
  });

  it("employee cannot list invitable roles", async () => {
    const emp = await actorFor("employee", locA);
    await expect(listInvitableRoles(emp, locA, deps)).rejects.toBeInstanceOf(Forbidden);
  });
});

describe("listInvitableLocations", () => {
  it("manager gets own location only; owner gets all active ones", async () => {
    const manager = await actorFor("manager", locA);
    const owner = await actorFor("owner", null);
    expect((await listInvitableLocations(manager, deps)).map((l) => l.id)).toEqual([locA]);
    expect((await listInvitableLocations(owner, deps)).map((l) => l.id).sort()).toEqual(
      [locA, locB].sort(),
    );
    await testDb().update(locations).set({ status: "closed" }).where(eq(locations.id, locB));
    expect((await listInvitableLocations(owner, deps)).map((l) => l.id)).toEqual([locA]);
  });

  it("employee cannot list invitable locations", async () => {
    const emp = await actorFor("employee", locA);
    await expect(listInvitableLocations(emp, deps)).rejects.toBeInstanceOf(Forbidden);
  });
});

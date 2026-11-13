import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  employees,
  invitations,
  locations,
  roleAssignments,
} from "@/db/schema";
import {
  acceptInvitation,
  createInvitation,
  getInvitationPreview,
  revokeInvitation,
  type InviteInput,
} from "@/features/invitations/service";
import { hashInviteToken } from "@/features/invitations/tokens";
import { runOwnerSetup } from "@/features/setup/service";
import { hasPermission, type Actor } from "@/server/auth/actor";
import { Conflict, Forbidden, Invalid } from "@/server/auth/errors";
import { loadActor } from "@/server/auth/load-actor";
import type { SessionUser } from "@/server/auth/session";
import type { Tx } from "@/server/db/client";
import {
  resetDb,
  seedDefaultPermissions,
  seedEmployee,
  seedOrg,
  testDb,
  type SeededOrg,
} from "../helpers/db";

// Every service call runs on the test branch, never on DATABASE_URL.
const inTestTx = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
  testDb().transaction(fn);
const deps = { transaction: inTestTx };

let org: SeededOrg;
let otherLocationId: string;

async function actorFor(
  roleKey: "owner" | "manager",
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
  if (!actor) throw new Error("actorFor: actor did not load");
  return actor;
}

function input(overrides: Partial<InviteInput> = {}): InviteInput {
  return {
    firstName: "Som",
    lastName: "Chai",
    email: "som@example.com",
    locationId: org.locationId,
    roleId: org.roles.employee,
    ...overrides,
  };
}

const tokenOf = (url: string) => url.split("/invite/")[1] ?? "";
const userFor = (email: string, id = `auth-${crypto.randomUUID()}`): SessionUser => ({
  id,
  email,
  emailVerified: true,
});

async function auditActions(): Promise<string[]> {
  const rows = await testDb().select().from(auditLog);
  return rows.map((r) => r.action);
}

beforeEach(async () => {
  await resetDb();
  process.env.APP_URL = "http://localhost:3000";
  org = await seedOrg();
  await seedDefaultPermissions(org);
  const [loc] = await testDb()
    .insert(locations)
    .values({ organizationId: org.orgId, name: "Second Location" })
    .returning({ id: locations.id });
  if (!loc) throw new Error("second location insert failed");
  otherLocationId = loc.id;
});

describe("createInvitation", () => {
  it("manager invites employee at own location", async () => {
    const manager = await actorFor("manager", org.locationId);
    const { invitationId, inviteUrl } = await createInvitation(manager, input(), deps);
    expect(inviteUrl).toContain("/invite/");

    const db = testDb();
    const [emp] = await db.select().from(employees).where(eq(employees.email, "som@example.com"));
    expect(emp?.status).toBe("invited");
    const [inv] = await db.select().from(invitations).where(eq(invitations.id, invitationId));
    expect(inv?.employeeId).toBe(emp?.id);
    expect(inv?.invitedByEmployeeId).toBe(manager.employeeId);
    expect(inv?.grantsOrgWide).toBe(false);
    expect(inv?.tokenHash).toBe(hashInviteToken(tokenOf(inviteUrl)));
    const ms = (inv?.expiresAt.getTime() ?? 0) - Date.now();
    expect(ms).toBeGreaterThan(6.99 * 86_400_000);
    expect(ms).toBeLessThanOrEqual(7 * 86_400_000);

    const audit = (await db.select().from(auditLog)).filter((r) => r.action === "invitation.created");
    expect(audit).toHaveLength(1);
    expect(audit[0]?.actorEmployeeId).toBe(manager.employeeId);
    expect(audit[0]?.entityId).toBe(invitationId);
  });

  it("never stores or audits the raw token or link", async () => {
    const manager = await actorFor("manager", org.locationId);
    const { inviteUrl } = await createInvitation(manager, input(), deps);
    const raw = tokenOf(inviteUrl);
    const dump = JSON.stringify([
      await testDb().select().from(auditLog),
      await testDb().select().from(invitations),
    ]);
    expect(dump).not.toContain(raw);
    expect(dump).not.toContain("/invite/");
  });

  it("manager cannot invite at another location", async () => {
    const manager = await actorFor("manager", org.locationId);
    await expect(
      createInvitation(manager, input({ locationId: otherLocationId }), deps),
    ).rejects.toBeInstanceOf(Forbidden);
    expect(await testDb().select().from(employees).where(eq(employees.email, "som@example.com"))).toHaveLength(0);
  });

  it("manager cannot invite a manager", async () => {
    const manager = await actorFor("manager", org.locationId);
    await expect(
      createInvitation(manager, input({ roleId: org.roles.manager }), deps),
    ).rejects.toBeInstanceOf(Forbidden);
  });

  it("an employee cannot invite anyone", async () => {
    const authUserId = `auth-${crypto.randomUUID()}`;
    const email = "emp@example.test";
    await seedEmployee({
      orgId: org.orgId,
      authUserId,
      email,
      assignments: [{ roleId: org.roles.employee, locationId: org.locationId }],
    });
    const actor = await loadActor(testDb(), { id: authUserId, email, emailVerified: true });
    await expect(createInvitation(actor as Actor, input(), deps)).rejects.toBeInstanceOf(Forbidden);
  });

  it("rejects a location or role from another organization", async () => {
    const owner = await actorFor("owner", null);
    const foreign = await seedOrg();
    await expect(
      createInvitation(owner, input({ locationId: foreign.locationId }), deps),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      createInvitation(owner, input({ roleId: foreign.roles.employee }), deps),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("owner may invite a manager; an owner invite is org-wide and needs an org-wide inviter", async () => {
    const owner = await actorFor("owner", null);
    await createInvitation(owner, input({ roleId: org.roles.manager }), deps);

    const { invitationId } = await createInvitation(
      owner,
      input({ email: "boss@example.com", roleId: org.roles.owner }),
      deps,
    );
    const [inv] = await testDb().select().from(invitations).where(eq(invitations.id, invitationId));
    expect(inv?.grantsOrgWide).toBe(true);

    const manager = await actorFor("manager", org.locationId);
    await expect(
      createInvitation(manager, input({ email: "x@example.com", roleId: org.roles.owner }), deps),
    ).rejects.toBeInstanceOf(Forbidden);
  });

  it("rejects invalid input", async () => {
    const owner = await actorFor("owner", null);
    await expect(createInvitation(owner, input({ email: "nope" }), deps)).rejects.toBeInstanceOf(Invalid);
    await expect(createInvitation(owner, input({ firstName: "  " }), deps)).rejects.toBeInstanceOf(Invalid);
  });

  it("email is normalised", async () => {
    const manager = await actorFor("manager", org.locationId);
    const { inviteUrl } = await createInvitation(manager, input({ email: " Som@Example.com " }), deps);
    const { employeeId } = await acceptInvitation(userFor("som@example.com"), tokenOf(inviteUrl), deps);
    const [emp] = await testDb().select().from(employees).where(eq(employees.id, employeeId));
    expect(emp?.email).toBe("som@example.com");
    expect(emp?.status).toBe("active");
  });

  it("re-invite replaces the open invite", async () => {
    const manager = await actorFor("manager", org.locationId);
    const first = await createInvitation(manager, input(), deps);
    const second = await createInvitation(manager, input(), deps);

    const db = testDb();
    const [old] = await db.select().from(invitations).where(eq(invitations.id, first.invitationId));
    const [fresh] = await db.select().from(invitations).where(eq(invitations.id, second.invitationId));
    expect(old?.revokedAt).not.toBeNull();
    expect(fresh?.revokedAt).toBeNull();
    expect(fresh?.employeeId).toBe(old?.employeeId);
    expect(await db.select().from(employees).where(eq(employees.email, "som@example.com"))).toHaveLength(1);
    expect((await getInvitationPreview(tokenOf(first.inviteUrl), deps)).status).toBe("revoked");
    expect((await getInvitationPreview(tokenOf(second.inviteUrl), deps)).status).toBe("valid");
    const actions = await auditActions();
    expect(actions.filter((a) => a === "invitation.revoked")).toHaveLength(1);
    expect(actions.filter((a) => a === "invitation.created")).toHaveLength(2);
  });

  it("re-invite cannot revoke an open invite the inviter has no authority over", async () => {
    const owner = await actorFor("owner", null);
    const manager = await actorFor("manager", org.locationId);
    const first = await createInvitation(owner, input({ locationId: otherLocationId }), deps);
    await expect(createInvitation(manager, input(), deps)).rejects.toBeInstanceOf(Forbidden);
    expect((await getInvitationPreview(tokenOf(first.inviteUrl), deps)).status).toBe("valid");
  });

  it("inviting an active member is refused", async () => {
    const manager = await actorFor("manager", org.locationId);
    await seedEmployee({ orgId: org.orgId, status: "active", email: "som@example.com" });
    await expect(createInvitation(manager, input(), deps)).rejects.toBeInstanceOf(Conflict);
    await seedEmployee({ orgId: org.orgId, status: "suspended", email: "sus@example.com" });
    await expect(
      createInvitation(manager, input({ email: "sus@example.com" }), deps),
    ).rejects.toBeInstanceOf(Conflict);
  });

  it("a left employee is set back to invited", async () => {
    const manager = await actorFor("manager", org.locationId);
    const id = await seedEmployee({ orgId: org.orgId, status: "left", email: "som@example.com" });
    const { inviteUrl } = await createInvitation(manager, input(), deps);
    const [emp] = await testDb().select().from(employees).where(eq(employees.id, id));
    expect(emp?.status).toBe("invited");
    expect((await getInvitationPreview(tokenOf(inviteUrl), deps)).status).toBe("valid");
    expect(await auditActions()).toContain("employee.status_changed");
  });
});

describe("revokeInvitation", () => {
  it("revokes (no delete), audits, and the token stops working", async () => {
    const manager = await actorFor("manager", org.locationId);
    const { invitationId, inviteUrl } = await createInvitation(manager, input(), deps);
    await revokeInvitation(manager, invitationId, deps);

    const [inv] = await testDb().select().from(invitations).where(eq(invitations.id, invitationId));
    expect(inv?.revokedAt).not.toBeNull();
    expect(await auditActions()).toContain("invitation.revoked");
    await expect(
      acceptInvitation(userFor("som@example.com"), tokenOf(inviteUrl), deps),
    ).rejects.toMatchObject({ code: "INVALID", message: "revoked" });
  });

  it("is refused outside the actor's location", async () => {
    const owner = await actorFor("owner", null);
    const manager = await actorFor("manager", org.locationId);
    const { invitationId } = await createInvitation(owner, input({ locationId: otherLocationId }), deps);
    await expect(revokeInvitation(manager, invitationId, deps)).rejects.toBeInstanceOf(Forbidden);
  });

  it("a manager cannot revoke a manager invite", async () => {
    const owner = await actorFor("owner", null);
    const manager = await actorFor("manager", org.locationId);
    const { invitationId } = await createInvitation(owner, input({ roleId: org.roles.manager }), deps);
    await expect(revokeInvitation(manager, invitationId, deps)).rejects.toBeInstanceOf(Forbidden);
  });

  it("another organization's invitation is NotFound", async () => {
    const owner = await actorFor("owner", null);
    const { invitationId } = await createInvitation(owner, input(), deps);
    const foreignOrg = await seedOrg();
    await seedDefaultPermissions(foreignOrg);
    const foreignAuth = `auth-${crypto.randomUUID()}`;
    await seedEmployee({
      orgId: foreignOrg.orgId,
      authUserId: foreignAuth,
      email: "f@example.test",
      assignments: [{ roleId: foreignOrg.roles.owner, locationId: null }],
    });
    const foreignOwner = await loadActor(testDb(), {
      id: foreignAuth,
      email: "f@example.test",
      emailVerified: true,
    });
    await expect(revokeInvitation(foreignOwner as Actor, invitationId, deps)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("an accepted invitation cannot be revoked", async () => {
    const manager = await actorFor("manager", org.locationId);
    const { invitationId, inviteUrl } = await createInvitation(manager, input(), deps);
    await acceptInvitation(userFor("som@example.com"), tokenOf(inviteUrl), deps);
    await expect(revokeInvitation(manager, invitationId, deps)).rejects.toBeInstanceOf(Invalid);
  });
});

describe("getInvitationPreview", () => {
  it("masks the email", async () => {
    const manager = await actorFor("manager", org.locationId);
    const { inviteUrl } = await createInvitation(manager, input(), deps);
    const preview = await getInvitationPreview(tokenOf(inviteUrl), deps);
    expect(preview).toMatchObject({
      status: "valid",
      organizationName: "Test Org",
      locationName: "Test Location",
      roleName: "Employee",
      maskedEmail: "s•••@example.com",
    });
  });

  it("unknown or malformed tokens are 'unknown' and reveal nothing", async () => {
    expect(await getInvitationPreview("nope", deps)).toEqual({ status: "unknown" });
    expect(await getInvitationPreview(crypto.randomUUID(), deps)).toEqual({ status: "unknown" });
  });

  it("reports expired", async () => {
    const manager = await actorFor("manager", org.locationId);
    const { invitationId, inviteUrl } = await createInvitation(manager, input(), deps);
    await testDb()
      .update(invitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invitations.id, invitationId));
    expect((await getInvitationPreview(tokenOf(inviteUrl), deps)).status).toBe("expired");
  });
});

describe("acceptInvitation", () => {
  it("activates the employee, grants the role at the location, and audits", async () => {
    const manager = await actorFor("manager", org.locationId);
    const { invitationId, inviteUrl } = await createInvitation(manager, input(), deps);
    const user = userFor("som@example.com");
    const { employeeId } = await acceptInvitation(user, tokenOf(inviteUrl), deps);

    const db = testDb();
    const [emp] = await db.select().from(employees).where(eq(employees.id, employeeId));
    expect(emp?.authUserId).toBe(user.id);
    expect(emp?.status).toBe("active");
    const assignments = await db
      .select()
      .from(roleAssignments)
      .where(and(eq(roleAssignments.employeeId, employeeId), isNull(roleAssignments.revokedAt)));
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.roleId).toBe(org.roles.employee);
    expect(assignments[0]?.locationId).toBe(org.locationId);
    expect(assignments[0]?.grantedByEmployeeId).toBe(manager.employeeId);
    const [inv] = await db.select().from(invitations).where(eq(invitations.id, invitationId));
    expect(inv?.acceptedAt).not.toBeNull();
    const actions = await auditActions();
    expect(actions).toContain("invitation.accepted");
    expect(actions).toContain("role.granted");
    const accepted = (await db.select().from(auditLog)).find((r) => r.action === "invitation.accepted");
    expect(accepted?.actorEmployeeId).toBe(employeeId);
  });

  it("wrong account cannot accept", async () => {
    const manager = await actorFor("manager", org.locationId);
    const { invitationId, inviteUrl } = await createInvitation(manager, input(), deps);
    await expect(
      acceptInvitation(userFor("someone-else@example.com"), tokenOf(inviteUrl), deps),
    ).rejects.toBeInstanceOf(Forbidden);

    const db = testDb();
    const [inv] = await db.select().from(invitations).where(eq(invitations.id, invitationId));
    expect(inv?.acceptedAt).toBeNull();
    const [emp] = await db.select().from(employees).where(eq(employees.email, "som@example.com"));
    expect(emp?.status).toBe("invited");
    expect(emp?.authUserId).toBeNull();
    expect(await db.select().from(roleAssignments).where(eq(roleAssignments.organizationId, org.orgId))
      .then((rows) => rows.filter((r) => r.employeeId === emp?.id))).toHaveLength(0);
  });

  it("an unverified session email cannot accept", async () => {
    const manager = await actorFor("manager", org.locationId);
    const { invitationId, inviteUrl } = await createInvitation(manager, input(), deps);
    await expect(
      acceptInvitation(
        { ...userFor("som@example.com"), emailVerified: false },
        tokenOf(inviteUrl),
        deps,
      ),
    ).rejects.toBeInstanceOf(Forbidden);

    const db = testDb();
    const [inv] = await db.select().from(invitations).where(eq(invitations.id, invitationId));
    expect(inv?.acceptedAt).toBeNull();
    const [emp] = await db.select().from(employees).where(eq(employees.email, "som@example.com"));
    expect(emp?.status).toBe("invited");
    expect(emp?.authUserId).toBeNull();
  });

  it("session email casing does not matter", async () => {
    const manager = await actorFor("manager", org.locationId);
    const { inviteUrl } = await createInvitation(manager, input(), deps);
    await expect(
      acceptInvitation(userFor("SOM@Example.COM"), tokenOf(inviteUrl), deps),
    ).resolves.toHaveProperty("employeeId");
  });

  it("accept is idempotent for the same user", async () => {
    const manager = await actorFor("manager", org.locationId);
    const { inviteUrl } = await createInvitation(manager, input(), deps);
    const user = userFor("som@example.com");
    const a = await acceptInvitation(user, tokenOf(inviteUrl), deps);
    const b = await acceptInvitation(user, tokenOf(inviteUrl), deps);
    expect(b.employeeId).toBe(a.employeeId);
    const active = await testDb()
      .select()
      .from(roleAssignments)
      .where(and(eq(roleAssignments.employeeId, a.employeeId), isNull(roleAssignments.revokedAt)));
    expect(active).toHaveLength(1);
    expect((await auditActions()).filter((x) => x === "invitation.accepted")).toHaveLength(1);
  });

  it("a different user cannot reuse an accepted invitation", async () => {
    const manager = await actorFor("manager", org.locationId);
    const { inviteUrl } = await createInvitation(manager, input(), deps);
    await acceptInvitation(userFor("som@example.com"), tokenOf(inviteUrl), deps);
    await expect(
      acceptInvitation(userFor("som@example.com"), tokenOf(inviteUrl), deps),
    ).rejects.toMatchObject({ code: "INVALID", message: "accepted" });
  });

  it("concurrent accepts by the same user yield one grant", async () => {
    const manager = await actorFor("manager", org.locationId);
    const { inviteUrl } = await createInvitation(manager, input(), deps);
    const user = userFor("som@example.com");
    const results = await Promise.all([
      acceptInvitation(user, tokenOf(inviteUrl), deps),
      acceptInvitation(user, tokenOf(inviteUrl), deps),
      acceptInvitation(user, tokenOf(inviteUrl), deps),
    ]);
    expect(new Set(results.map((r) => r.employeeId)).size).toBe(1);
    const active = await testDb()
      .select()
      .from(roleAssignments)
      .where(and(eq(roleAssignments.employeeId, results[0]!.employeeId), isNull(roleAssignments.revokedAt)));
    expect(active).toHaveLength(1);
    const actions = await auditActions();
    expect(actions.filter((x) => x === "invitation.accepted")).toHaveLength(1);
    expect(actions.filter((x) => x === "role.granted")).toHaveLength(1);
  });

  it("concurrent accepts by two different accounts: exactly one wins", async () => {
    const manager = await actorFor("manager", org.locationId);
    const { inviteUrl } = await createInvitation(manager, input(), deps);
    const results = await Promise.allSettled([
      acceptInvitation(userFor("som@example.com", "auth-a"), tokenOf(inviteUrl), deps),
      acceptInvitation(userFor("som@example.com", "auth-b"), tokenOf(inviteUrl), deps),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected).toMatchObject({ reason: { code: "INVALID", message: "accepted" } });
    const [emp] = await testDb().select().from(employees).where(eq(employees.email, "som@example.com"));
    expect(["auth-a", "auth-b"]).toContain(emp?.authUserId);
  });

  it("expired invitation", async () => {
    const manager = await actorFor("manager", org.locationId);
    const { invitationId, inviteUrl } = await createInvitation(manager, input(), deps);
    await testDb()
      .update(invitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invitations.id, invitationId));
    await expect(
      acceptInvitation(userFor("som@example.com"), tokenOf(inviteUrl), deps),
    ).rejects.toMatchObject({ code: "INVALID", message: "expired" });
    const [emp] = await testDb().select().from(employees).where(eq(employees.email, "som@example.com"));
    expect(emp?.status).toBe("invited");
  });

  it("an unknown token is Invalid('unknown')", async () => {
    await expect(
      acceptInvitation(userFor("som@example.com"), "x".repeat(43), deps),
    ).rejects.toMatchObject({ code: "INVALID", message: "unknown" });
  });

  it("a suspended employee is not reactivated by an old invitation", async () => {
    const manager = await actorFor("manager", org.locationId);
    const { inviteUrl } = await createInvitation(manager, input(), deps);
    await testDb().update(employees).set({ status: "suspended" }).where(eq(employees.email, "som@example.com"));
    await expect(
      acceptInvitation(userFor("som@example.com"), tokenOf(inviteUrl), deps),
    ).rejects.toBeInstanceOf(Invalid);
    const [emp] = await testDb().select().from(employees).where(eq(employees.email, "som@example.com"));
    expect(emp?.status).toBe("suspended");
  });

  it("owner invitation grants org-wide owner on accept", async () => {
    const { inviteUrl } = await runOwnerSetup(
      {
        organizationName: "Glai Gung Won",
        slug: "ggw",
        locationName: "Tempe",
        ownerEmail: "owner@example.com",
        ownerFirstName: "Olive",
        ownerLastName: "Owner",
      },
      inTestTx,
    );
    const user = userFor("owner@example.com", "auth-owner");
    const { employeeId } = await acceptInvitation(user, tokenOf(inviteUrl), deps);
    const actor = await loadActor(testDb(), user);
    expect(actor?.employeeId).toBe(employeeId);
    expect(hasPermission(actor as Actor, "audit.view", "organization")).toBe(true);
    const assignments = await testDb()
      .select()
      .from(roleAssignments)
      .where(eq(roleAssignments.employeeId, employeeId));
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.locationId).toBeNull();
  });
});

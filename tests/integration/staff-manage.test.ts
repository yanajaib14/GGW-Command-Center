import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { auditLog, employees, locations, roleAssignments } from "@/db/schema";
import {
  countActiveOrgOwners,
  getStaffDetail,
  grantRole,
  listGrantableRoles,
  revokeRole,
  setEmployeeStatus,
} from "@/features/staff/service";
import { Conflict, Forbidden, Invalid, NotFound } from "@/server/auth/errors";
import {
  actorFor,
  actorWithRole,
  ALL_PERMISSIONS,
  reloadActor,
  seedCustomRole,
  testDeps as deps,
} from "../helpers/actors";
import {
  resetDb,
  seedDefaultPermissions,
  seedEmployee,
  seedOrg,
  testDb,
  type SeededOrg,
} from "../helpers/db";

// Everything a Manager has, plus staff.manage.
const STAFFER_PERMISSIONS = [
  "dashboard.employee",
  "dashboard.manager",
  "profile.edit_own",
  "staff.view",
  "staff.invite",
  "staff.manage",
] as const;

let org: SeededOrg;
let locA: string;
let locB: string;

const as = (key: "owner" | "manager" | "employee", loc: string | null) =>
  actorFor(org, key, loc);

async function statusOf(employeeId: string): Promise<string | undefined> {
  const [row] = await testDb()
    .select({ status: employees.status })
    .from(employees)
    .where(eq(employees.id, employeeId));
  return row?.status;
}

async function activeAssignments(employeeId: string) {
  return testDb()
    .select()
    .from(roleAssignments)
    .where(eq(roleAssignments.employeeId, employeeId));
}

async function auditActions(): Promise<string[]> {
  const rows = await testDb().select({ action: auditLog.action }).from(auditLog);
  return rows.map((r) => r.action);
}

beforeEach(async () => {
  await resetDb();
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

describe("setEmployeeStatus", () => {
  it("owner suspends a manager and the manager is blocked next request", async () => {
    const owner = await as("owner", null);
    const manager = await as("manager", locA);
    expect(await reloadActor(manager)).not.toBeNull();

    await setEmployeeStatus(owner, manager.employeeId, "suspended", deps);

    expect(await statusOf(manager.employeeId)).toBe("suspended");
    expect(await reloadActor(manager)).toBeNull();
    const [entry] = await testDb()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "employee.status_changed"));
    expect(entry).toMatchObject({
      actorEmployeeId: owner.employeeId,
      entityId: manager.employeeId,
      before: { status: "active" },
      after: { status: "suspended" },
    });
  });

  it("can reactivate a suspended employee", async () => {
    const owner = await as("owner", null);
    const manager = await as("manager", locA);
    await setEmployeeStatus(owner, manager.employeeId, "suspended", deps);
    await setEmployeeStatus(owner, manager.employeeId, "active", deps);
    expect(await reloadActor(manager)).not.toBeNull();
  });

  it("cannot suspend self", async () => {
    const owner = await as("owner", null);
    await as("owner", null); // a second owner, so the last-owner rule is not the reason
    await expect(setEmployeeStatus(owner, owner.employeeId, "suspended", deps)).rejects.toBeInstanceOf(
      Forbidden,
    );
    expect(await statusOf(owner.employeeId)).toBe("active");
  });

  it("marking someone as left revokes their assignments and keeps the rows", async () => {
    const owner = await as("owner", null);
    const manager = await as("manager", locA);
    await setEmployeeStatus(owner, manager.employeeId, "left", deps);
    expect(await statusOf(manager.employeeId)).toBe("left");
    const rows = await activeAssignments(manager.employeeId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.revokedAt).toBeInstanceOf(Date);
    expect(rows[0]?.revokedByEmployeeId).toBe(owner.employeeId);
    expect(await auditActions()).toEqual(
      expect.arrayContaining(["employee.status_changed", "role.revoked"]),
    );
  });

  it("a left employee cannot be reactivated here (they need a new invite)", async () => {
    const owner = await as("owner", null);
    const emp = await as("employee", locA);
    await setEmployeeStatus(owner, emp.employeeId, "left", deps);
    await expect(setEmployeeStatus(owner, emp.employeeId, "active", deps)).rejects.toBeInstanceOf(
      Invalid,
    );
  });

  it("an invited employee cannot be set active (they must accept)", async () => {
    const owner = await as("owner", null);
    const invited = await seedEmployee({ orgId: org.orgId, status: "invited" });
    await expect(setEmployeeStatus(owner, invited, "active", deps)).rejects.toBeInstanceOf(Invalid);
  });

  it("repeating the same status is a quiet no-op", async () => {
    const owner = await as("owner", null);
    const emp = await as("employee", locA);
    await setEmployeeStatus(owner, emp.employeeId, "suspended", deps);
    await setEmployeeStatus(owner, emp.employeeId, "suspended", deps);
    const rows = await testDb()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "employee.status_changed"));
    expect(rows).toHaveLength(1);
  });

  it("manager cannot change status", async () => {
    const manager = await as("manager", locA);
    const emp = await as("employee", locA);
    await expect(setEmployeeStatus(manager, emp.employeeId, "suspended", deps)).rejects.toBeInstanceOf(
      Forbidden,
    );
    expect(await statusOf(emp.employeeId)).toBe("active");
  });

  it("another organization's employee is not found", async () => {
    const owner = await as("owner", null);
    const other = await seedOrg();
    const foreign = await seedEmployee({
      orgId: other.orgId,
      assignments: [{ roleId: other.roles.employee, locationId: other.locationId }],
    });
    await expect(setEmployeeStatus(owner, foreign, "suspended", deps)).rejects.toBeInstanceOf(NotFound);
    expect(await statusOf(foreign)).toBe("active");
  });

  it("a location-scoped staff.manage holder cannot touch someone with org-wide or other-location access", async () => {
    const locAdminRole = await seedCustomRole(org, "loc_admin", STAFFER_PERMISSIONS);
    const locAdmin = await actorWithRole(org, locAdminRole, locA);
    const orgWideManager = await as("manager", null);
    const bothLocations = await seedEmployee({
      orgId: org.orgId,
      assignments: [
        { roleId: org.roles.employee, locationId: locA },
        { roleId: org.roles.employee, locationId: locB },
      ],
    });
    const atA = await as("employee", locA);

    await expect(
      setEmployeeStatus(locAdmin, orgWideManager.employeeId, "suspended", deps),
    ).rejects.toBeInstanceOf(Forbidden);
    await expect(setEmployeeStatus(locAdmin, bothLocations, "suspended", deps)).rejects.toBeInstanceOf(
      Forbidden,
    );
    await setEmployeeStatus(locAdmin, atA.employeeId, "suspended", deps);
    expect(await statusOf(atA.employeeId)).toBe("suspended");
  });

  it("an actor suspended mid-flight can no longer change anything", async () => {
    const owner = await as("owner", null);
    const emp = await as("employee", locA);
    await testDb().update(employees).set({ status: "suspended" }).where(eq(employees.id, owner.employeeId));
    await expect(setEmployeeStatus(owner, emp.employeeId, "suspended", deps)).rejects.toBeInstanceOf(
      Forbidden,
    );
  });
});

describe("last owner", () => {
  async function soleOwnerAndAdmin() {
    const owner = await as("owner", null);
    // Holds every permission but is not the Owner role, so it can act on the Owner.
    const superRole = await seedCustomRole(org, "super_admin", ALL_PERMISSIONS);
    const admin = await actorWithRole(org, superRole, null, "admin");
    return { owner, admin };
  }

  it("cannot remove the last owner (suspend, mark left, revoke owner role)", async () => {
    const { owner, admin } = await soleOwnerAndAdmin();
    await expect(setEmployeeStatus(admin, owner.employeeId, "suspended", deps)).rejects.toBeInstanceOf(
      Conflict,
    );
    await expect(setEmployeeStatus(admin, owner.employeeId, "left", deps)).rejects.toBeInstanceOf(
      Conflict,
    );
    const ownerAssignment = owner.assignments[0];
    if (!ownerAssignment) throw new Error("no assignment");
    await expect(revokeRole(admin, ownerAssignment.assignmentId, deps)).rejects.toBeInstanceOf(
      Conflict,
    );
    expect(await statusOf(owner.employeeId)).toBe("active");
    expect(await reloadActor(owner)).not.toBeNull();
    expect(await countActiveOrgOwners(testDb(), org.orgId)).toBe(1);
  });

  it("a second owner allows removing the first", async () => {
    const first = await as("owner", null);
    const second = await as("owner", null);
    expect(await countActiveOrgOwners(testDb(), org.orgId)).toBe(2);
    await setEmployeeStatus(second, first.employeeId, "suspended", deps);
    expect(await countActiveOrgOwners(testDb(), org.orgId)).toBe(1);
  });

  it("counts only active employees with an unrevoked org-wide owner assignment", async () => {
    await as("owner", null);
    await seedEmployee({
      orgId: org.orgId,
      status: "suspended",
      assignments: [{ roleId: org.roles.owner, locationId: null }],
    });
    await seedEmployee({
      orgId: org.orgId,
      assignments: [{ roleId: org.roles.owner, locationId: null, revoked: true }],
    });
    await seedEmployee({
      orgId: org.orgId,
      assignments: [{ roleId: org.roles.owner, locationId: locA }],
    });
    const other = await seedOrg();
    await seedEmployee({
      orgId: other.orgId,
      assignments: [{ roleId: other.roles.owner, locationId: null }],
    });
    expect(await countActiveOrgOwners(testDb(), org.orgId)).toBe(1);
  });

  it("two owners removing each other at once leave one active owner", async () => {
    const first = await as("owner", null);
    const second = await as("owner", null);
    const results = await Promise.allSettled([
      setEmployeeStatus(first, second.employeeId, "suspended", deps),
      setEmployeeStatus(second, first.employeeId, "suspended", deps),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await countActiveOrgOwners(testDb(), org.orgId)).toBe(1);
  });
});

describe("grantRole", () => {
  it("owner grants a role at a location and it is audited", async () => {
    const owner = await as("owner", null);
    const emp = await as("employee", locA);
    await grantRole(owner, { employeeId: emp.employeeId, roleId: org.roles.manager, locationId: locA }, deps);
    const reloaded = await reloadActor(emp);
    expect(reloaded?.assignments.map((a) => a.roleKey).sort()).toEqual(["employee", "manager"]);
    const [entry] = await testDb().select().from(auditLog).where(eq(auditLog.action, "role.granted"));
    expect(entry).toMatchObject({ actorEmployeeId: owner.employeeId, locationId: locA });
  });

  it("grant beyond own permissions is refused", async () => {
    const stafferRole = await seedCustomRole(org, "staffer", STAFFER_PERMISSIONS);
    const staffer = await actorWithRole(org, stafferRole, null, "staffer");
    const emp = await as("employee", locA);
    await expect(
      grantRole(staffer, { employeeId: emp.employeeId, roleId: org.roles.owner, locationId: null }, deps),
    ).rejects.toBeInstanceOf(Forbidden);
    // Manager permissions are a subset of the staffer's, so that grant is allowed.
    await grantRole(staffer, { employeeId: emp.employeeId, roleId: org.roles.manager, locationId: locA }, deps);
  });

  it("a location-scoped grantor cannot grant elsewhere or org-wide", async () => {
    const stafferRole = await seedCustomRole(org, "staffer", STAFFER_PERMISSIONS);
    const staffer = await actorWithRole(org, stafferRole, locA, "staffer");
    const emp = await as("employee", locA);
    const grant = (locationId: string | null) =>
      grantRole(staffer, { employeeId: emp.employeeId, roleId: org.roles.manager, locationId }, deps);
    await expect(grant(locB)).rejects.toBeInstanceOf(Forbidden);
    await expect(grant(null)).rejects.toBeInstanceOf(Forbidden);
    await grant(locA);
  });

  it("manager cannot grant roles", async () => {
    const manager = await as("manager", locA);
    const emp = await as("employee", locA);
    await expect(
      grantRole(manager, { employeeId: emp.employeeId, roleId: org.roles.employee, locationId: locA }, deps),
    ).rejects.toBeInstanceOf(Forbidden);
  });

  it("cannot change own roles", async () => {
    const owner = await as("owner", null);
    await expect(
      grantRole(owner, { employeeId: owner.employeeId, roleId: org.roles.manager, locationId: locA }, deps),
    ).rejects.toBeInstanceOf(Forbidden);
  });

  it("the Owner role is organization-wide only", async () => {
    const owner = await as("owner", null);
    const emp = await as("employee", locA);
    await expect(
      grantRole(owner, { employeeId: emp.employeeId, roleId: org.roles.owner, locationId: locA }, deps),
    ).rejects.toBeInstanceOf(Invalid);
    await grantRole(owner, { employeeId: emp.employeeId, roleId: org.roles.owner, locationId: null }, deps);
    expect(await countActiveOrgOwners(testDb(), org.orgId)).toBe(2);
  });

  it("resolves ids inside the actor's organization", async () => {
    const owner = await as("owner", null);
    const emp = await as("employee", locA);
    const other = await seedOrg();
    const foreignEmp = await seedEmployee({ orgId: other.orgId });
    await expect(
      grantRole(owner, { employeeId: foreignEmp, roleId: org.roles.employee, locationId: locA }, deps),
    ).rejects.toBeInstanceOf(NotFound);
    await expect(
      grantRole(owner, { employeeId: emp.employeeId, roleId: other.roles.employee, locationId: locA }, deps),
    ).rejects.toBeInstanceOf(NotFound);
    await expect(
      grantRole(
        owner,
        { employeeId: emp.employeeId, roleId: org.roles.employee, locationId: other.locationId },
        deps,
      ),
    ).rejects.toBeInstanceOf(NotFound);
    await expect(
      grantRole(owner, { employeeId: "not-a-uuid", roleId: org.roles.employee, locationId: locA }, deps),
    ).rejects.toBeInstanceOf(Invalid);
  });

  it("grants nothing at a closed location", async () => {
    const owner = await as("owner", null);
    const emp = await as("employee", locA);
    await testDb().update(locations).set({ status: "closed" }).where(eq(locations.id, locB));
    await expect(
      grantRole(owner, { employeeId: emp.employeeId, roleId: org.roles.employee, locationId: locB }, deps),
    ).rejects.toBeInstanceOf(NotFound);
  });

  it("refuses a duplicate active assignment", async () => {
    const owner = await as("owner", null);
    const emp = await as("employee", locA);
    await expect(
      grantRole(owner, { employeeId: emp.employeeId, roleId: org.roles.employee, locationId: locA }, deps),
    ).rejects.toBeInstanceOf(Conflict);
  });

  it("refuses to grant to someone who has left or not yet joined", async () => {
    const owner = await as("owner", null);
    const left = await seedEmployee({ orgId: org.orgId, status: "left" });
    const invited = await seedEmployee({ orgId: org.orgId, status: "invited" });
    for (const id of [left, invited]) {
      await expect(
        grantRole(owner, { employeeId: id, roleId: org.roles.employee, locationId: locA }, deps),
      ).rejects.toBeInstanceOf(Invalid);
    }
  });
});

describe("revokeRole", () => {
  it("revoked role row keeps history", async () => {
    const owner = await as("owner", null);
    const manager = await as("manager", locA);
    const assignment = manager.assignments[0];
    if (!assignment) throw new Error("no assignment");

    await revokeRole(owner, assignment.assignmentId, deps);

    const [row] = await testDb()
      .select()
      .from(roleAssignments)
      .where(eq(roleAssignments.id, assignment.assignmentId));
    expect(row).toBeDefined();
    expect(row?.revokedAt).toBeInstanceOf(Date);
    expect(row?.revokedByEmployeeId).toBe(owner.employeeId);
    expect((await reloadActor(manager))?.assignments).toEqual([]);
    const [entry] = await testDb().select().from(auditLog).where(eq(auditLog.action, "role.revoked"));
    expect(entry).toMatchObject({ entityId: assignment.assignmentId, locationId: locA });
  });

  it("cannot revoke own role", async () => {
    const owner = await as("owner", null);
    await as("owner", null);
    const mine = owner.assignments[0];
    if (!mine) throw new Error("no assignment");
    await expect(revokeRole(owner, mine.assignmentId, deps)).rejects.toBeInstanceOf(Forbidden);
  });

  it("manager cannot revoke roles", async () => {
    const manager = await as("manager", locA);
    const emp = await as("employee", locA);
    const target = emp.assignments[0];
    if (!target) throw new Error("no assignment");
    await expect(revokeRole(manager, target.assignmentId, deps)).rejects.toBeInstanceOf(Forbidden);
  });

  it("cannot revoke access broader than your own", async () => {
    const stafferRole = await seedCustomRole(org, "staffer", STAFFER_PERMISSIONS);
    const staffer = await actorWithRole(org, stafferRole, null, "staffer");
    const owner = await as("owner", null);
    const target = owner.assignments[0];
    if (!target) throw new Error("no assignment");
    await expect(revokeRole(staffer, target.assignmentId, deps)).rejects.toBeInstanceOf(Forbidden);
  });

  it("an assignment in another organization is not found; an already revoked one is too", async () => {
    const owner = await as("owner", null);
    const other = await seedOrg();
    const foreignEmp = await seedEmployee({
      orgId: other.orgId,
      assignments: [{ roleId: other.roles.employee, locationId: other.locationId }],
    });
    const [foreign] = await testDb()
      .select({ id: roleAssignments.id })
      .from(roleAssignments)
      .where(eq(roleAssignments.employeeId, foreignEmp));
    if (!foreign) throw new Error("no foreign assignment");
    await expect(revokeRole(owner, "not-a-uuid", deps)).rejects.toBeInstanceOf(Invalid);
    await expect(revokeRole(owner, foreign.id, deps)).rejects.toBeInstanceOf(NotFound);

    const emp = await as("employee", locA);
    const mine = emp.assignments[0];
    if (!mine) throw new Error("no assignment");
    await revokeRole(owner, mine.assignmentId, deps);
    await expect(revokeRole(owner, mine.assignmentId, deps)).rejects.toBeInstanceOf(NotFound);
  });

  it("revoking and re-granting leaves history and one active assignment", async () => {
    const owner = await as("owner", null);
    const emp = await as("employee", locA);
    const mine = emp.assignments[0];
    if (!mine) throw new Error("no assignment");
    await revokeRole(owner, mine.assignmentId, deps);
    await grantRole(owner, { employeeId: emp.employeeId, roleId: org.roles.employee, locationId: locA }, deps);
    const rows = await activeAssignments(emp.employeeId);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.revokedAt === null)).toHaveLength(1);
  });
});

describe("staff detail and grantable roles", () => {
  it("owner sees the employee and their active assignments", async () => {
    const owner = await as("owner", null);
    const emp = await as("employee", locA);
    const detail = await getStaffDetail(owner, emp.employeeId, deps);
    expect(detail).toMatchObject({ employeeId: emp.employeeId, status: "active", isSelf: false });
    expect(detail.assignments).toEqual([
      expect.objectContaining({ roleKey: "employee", locationId: locA, locationName: "Test Location" }),
    ]);
    expect((await getStaffDetail(owner, owner.employeeId, deps)).isSelf).toBe(true);
  });

  it("is not found across organizations, and hidden from other locations' scoped managers", async () => {
    const owner = await as("owner", null);
    const other = await seedOrg();
    const foreign = await seedEmployee({ orgId: other.orgId });
    await expect(getStaffDetail(owner, foreign, deps)).rejects.toBeInstanceOf(NotFound);

    const stafferRole = await seedCustomRole(org, "staffer", ["dashboard.manager", "staff.view", "staff.manage"]);
    const staffer = await actorWithRole(org, stafferRole, locA, "staffer");
    const atB = await as("employee", locB);
    await expect(getStaffDetail(staffer, atB.employeeId, deps)).rejects.toBeInstanceOf(NotFound);
  });

  it("manager cannot open staff detail", async () => {
    const manager = await as("manager", locA);
    const emp = await as("employee", locA);
    await expect(getStaffDetail(manager, emp.employeeId, deps)).rejects.toBeInstanceOf(Forbidden);
  });

  it("lists roles the actor may grant at a scope (Owner only org-wide)", async () => {
    const owner = await as("owner", null);
    const atLocation = await listGrantableRoles(owner, locA, deps);
    expect(atLocation.map((r) => r.key).sort()).toEqual(["employee", "manager"]);
    const orgWide = await listGrantableRoles(owner, null, deps);
    expect(orgWide.map((r) => r.key).sort()).toEqual(["employee", "manager", "owner"]);
    const manager = await as("manager", locA);
    await expect(listGrantableRoles(manager, locA, deps)).rejects.toBeInstanceOf(Forbidden);
  });
});

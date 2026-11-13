import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { auditLog, rolePermissions, roles } from "@/db/schema";
import { createRole, listRoles, setRolePermissions } from "@/features/roles/service";
import { Conflict, Forbidden, Invalid, NotFound } from "@/server/auth/errors";
import {
  activeRolePermissionKeys,
  actorFor,
  actorWithRole,
  reloadActor,
  seedCustomRole,
  testDeps as deps,
} from "../helpers/actors";
import { resetDb, seedDefaultPermissions, seedEmployee, seedOrg, testDb, type SeededOrg } from "../helpers/db";

let org: SeededOrg;

beforeEach(async () => {
  await resetDb();
  org = await seedOrg();
  await seedDefaultPermissions(org);
});

describe("createRole", () => {
  it("create custom role", async () => {
    const owner = await actorFor(org, "owner", null);
    const id = await createRole(
      owner,
      { key: "shift_lead", name: "Shift lead", description: "Runs a shift" },
      deps,
    );
    const [row] = await testDb().select().from(roles).where(eq(roles.id, id));
    expect(row).toMatchObject({
      organizationId: org.orgId,
      key: "shift_lead",
      name: "Shift lead",
      description: "Runs a shift",
      isSystem: false,
    });
    expect(await activeRolePermissionKeys(id)).toEqual([]);
    const [entry] = await testDb().select().from(auditLog).where(eq(auditLog.action, "role.created"));
    expect(entry).toMatchObject({ actorEmployeeId: owner.employeeId, entityId: id });
  });

  it("reject system key", async () => {
    const owner = await actorFor(org, "owner", null);
    for (const key of ["owner", "manager", "employee"]) {
      await expect(createRole(owner, { key, name: "x", description: "" }, deps)).rejects.toBeInstanceOf(
        Invalid,
      );
    }
  });

  it("rejects bad keys and names", async () => {
    const owner = await actorFor(org, "owner", null);
    for (const key of ["", "A", "Shift", "1lead", "a", "has space", "x".repeat(32), "dash-ed"]) {
      await expect(createRole(owner, { key, name: "Name", description: "" }, deps)).rejects.toBeInstanceOf(
        Invalid,
      );
    }
    await expect(
      createRole(owner, { key: "ok_key", name: "   ", description: "" }, deps),
    ).rejects.toBeInstanceOf(Invalid);
  });

  it("refuses a duplicate key", async () => {
    const owner = await actorFor(org, "owner", null);
    await createRole(owner, { key: "cook", name: "Cook", description: "" }, deps);
    await expect(createRole(owner, { key: "cook", name: "Cook 2", description: "" }, deps)).rejects.toBeInstanceOf(
      Conflict,
    );
  });

  it("needs roles.manage organization-wide", async () => {
    const manager = await actorFor(org, "manager", org.locationId);
    await expect(createRole(manager, { key: "cook", name: "Cook", description: "" }, deps)).rejects.toBeInstanceOf(
      Forbidden,
    );
    const scopedRole = await seedCustomRole(org, "scoped_roles", ["dashboard.manager", "roles.manage"]);
    const scoped = await actorWithRole(org, scopedRole, org.locationId, "scoped");
    await expect(createRole(scoped, { key: "cook", name: "Cook", description: "" }, deps)).rejects.toBeInstanceOf(
      Forbidden,
    );
  });
});

describe("setRolePermissions", () => {
  it("set permissions writes audit before/after and soft-revokes removed ones", async () => {
    const owner = await actorFor(org, "owner", null);
    const id = await createRole(owner, { key: "lead", name: "Lead", description: "" }, deps);
    await setRolePermissions(owner, id, ["dashboard.employee", "staff.view"], deps);
    await setRolePermissions(owner, id, ["staff.view", "staff.invite"], deps);

    expect(await activeRolePermissionKeys(id)).toEqual(["staff.invite", "staff.view"]);
    const all = await testDb()
      .select()
      .from(rolePermissions)
      .where(and(eq(rolePermissions.roleId, id), eq(rolePermissions.permission, "dashboard.employee")));
    expect(all).toHaveLength(1);
    expect(all[0]?.revokedAt).toBeInstanceOf(Date);
    expect(all[0]?.revokedByEmployeeId).toBe(owner.employeeId);

    const entries = await testDb()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "role.permissions_changed"));
    expect(entries).toHaveLength(2);
    const last = entries.find((e) => JSON.stringify(e.after) === JSON.stringify(["staff.invite", "staff.view"]));
    expect(last?.before).toEqual(["dashboard.employee", "staff.view"]);
    expect(last?.entityId).toBe(id);
  });

  it("re-adding a removed permission works", async () => {
    const owner = await actorFor(org, "owner", null);
    const id = await createRole(owner, { key: "lead", name: "Lead", description: "" }, deps);
    await setRolePermissions(owner, id, ["staff.view"], deps);
    await setRolePermissions(owner, id, [], deps);
    await setRolePermissions(owner, id, ["staff.view"], deps);
    expect(await activeRolePermissionKeys(id)).toEqual(["staff.view"]);
  });

  it("an unchanged set writes nothing", async () => {
    const owner = await actorFor(org, "owner", null);
    const id = await createRole(owner, { key: "lead", name: "Lead", description: "" }, deps);
    await setRolePermissions(owner, id, ["staff.view", "staff.view"], deps);
    await setRolePermissions(owner, id, ["staff.view"], deps);
    const entries = await testDb()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "role.permissions_changed"));
    expect(entries).toHaveLength(1);
  });

  it("unknown permission rejected", async () => {
    const owner = await actorFor(org, "owner", null);
    const id = await createRole(owner, { key: "lead", name: "Lead", description: "" }, deps);
    await expect(
      setRolePermissions(owner, id, ["staff.view", "inventory.count"], deps),
    ).rejects.toBeInstanceOf(Invalid);
    expect(await activeRolePermissionKeys(id)).toEqual([]);
  });

  it("owner role permissions are fixed", async () => {
    const owner = await actorFor(org, "owner", null);
    const before = await activeRolePermissionKeys(org.roles.owner);
    await expect(setRolePermissions(owner, org.roles.owner, ["dashboard.owner"], deps)).rejects.toThrow(
      "owner role permissions are fixed",
    );
    await expect(setRolePermissions(owner, org.roles.owner, ["dashboard.owner"], deps)).rejects.toBeInstanceOf(
      Forbidden,
    );
    expect(await activeRolePermissionKeys(org.roles.owner)).toEqual(before);
  });

  it("system manager and employee roles can be adjusted with the same rules", async () => {
    const owner = await actorFor(org, "owner", null);
    await setRolePermissions(owner, org.roles.employee, ["dashboard.employee"], deps);
    expect(await activeRolePermissionKeys(org.roles.employee)).toEqual(["dashboard.employee"]);
    const [stillSystem] = await testDb().select().from(roles).where(eq(roles.id, org.roles.employee));
    expect(stillSystem).toMatchObject({ key: "employee", name: "Employee", isSystem: true });
  });

  it("cannot add a permission the actor does not hold (no escalation)", async () => {
    const rolesAdminRole = await seedCustomRole(org, "roles_admin", [
      "dashboard.owner",
      "roles.manage",
      "staff.view",
    ]);
    const admin = await actorWithRole(org, rolesAdminRole, null, "rolesadmin");
    const id = await createRole(admin, { key: "lead", name: "Lead", description: "" }, deps);
    await setRolePermissions(admin, id, ["staff.view"], deps);
    await expect(setRolePermissions(admin, id, ["staff.view", "audit.view"], deps)).rejects.toBeInstanceOf(
      Forbidden,
    );
    // Their own role included: they cannot widen it either.
    await expect(
      setRolePermissions(admin, rolesAdminRole, ["dashboard.owner", "roles.manage", "staff.view", "staff.manage"], deps),
    ).rejects.toBeInstanceOf(Forbidden);
    expect(await activeRolePermissionKeys(id)).toEqual(["staff.view"]);
  });

  it("manager cannot change permissions", async () => {
    const manager = await actorFor(org, "manager", org.locationId);
    await expect(setRolePermissions(manager, org.roles.employee, [], deps)).rejects.toBeInstanceOf(Forbidden);
  });

  it("a role in another organization is not found", async () => {
    const owner = await actorFor(org, "owner", null);
    const other = await seedOrg();
    await expect(setRolePermissions(owner, other.roles.employee, [], deps)).rejects.toBeInstanceOf(NotFound);
    await expect(setRolePermissions(owner, "not-a-uuid", [], deps)).rejects.toBeInstanceOf(Invalid);
  });

  it("takes effect on the holder's next request", async () => {
    const owner = await actorFor(org, "owner", null);
    const emp = await actorFor(org, "employee", org.locationId);
    await seedEmployee({ orgId: org.orgId });
    await setRolePermissions(owner, org.roles.employee, ["profile.edit_own"], deps);
    const reloaded = await reloadActor(emp);
    expect(reloaded?.assignments[0]?.permissions).toEqual(["profile.edit_own"]);
  });
});

describe("listRoles", () => {
  it("lists roles with active permissions; manager is refused", async () => {
    const owner = await actorFor(org, "owner", null);
    const list = await listRoles(owner, deps);
    expect(list.map((r) => r.key).sort()).toEqual(["employee", "manager", "owner"]);
    const ownerRole = list.find((r) => r.key === "owner");
    expect(ownerRole?.isSystem).toBe(true);
    expect(ownerRole?.permissions).toHaveLength(10);
    const manager = await actorFor(org, "manager", org.locationId);
    await expect(listRoles(manager, deps)).rejects.toBeInstanceOf(Forbidden);
  });

  it("never lists another organization's roles", async () => {
    const owner = await actorFor(org, "owner", null);
    const other = await seedOrg();
    await seedCustomRole(other, "theirs", ["staff.view"]);
    const list = await listRoles(owner, deps);
    expect(list.map((r) => r.key)).not.toContain("theirs");
  });
});

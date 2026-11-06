import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { auditLog, employees, roleAssignments } from "@/db/schema";
import { resetDb, seedOrg, testDb, type SeededOrg } from "../helpers/db";

/** Walk the error cause chain (drivers/ORMs wrap the Postgres error). */
async function rejection(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const parts: string[] = [];
    let cur: unknown = e;
    while (cur instanceof Error) {
      const code = (cur as { code?: string }).code;
      parts.push(`${code ?? ""} ${cur.message}`);
      cur = cur.cause;
    }
    return parts.join(" | ");
  }
  throw new Error("expected the statement to reject, but it succeeded");
}

const UNIQUE_VIOLATION = "23505";

let seed: SeededOrg;

async function newEmployee(email: string) {
  const [row] = await testDb()
    .insert(employees)
    .values({
      organizationId: seed.orgId,
      firstName: "Som",
      lastName: "Test",
      displayName: "Som",
      email,
    })
    .returning({ id: employees.id });
  if (!row) throw new Error("employee insert returned no row");
  return row.id;
}

beforeEach(async () => {
  await resetDb();
  seed = await seedOrg();
});

describe("schema constraints", () => {
  it("employee email is unique per organization ignoring case", async () => {
    await newEmployee("Som@x.com");
    const msg = await rejection(newEmployee("som@x.com"));
    expect(msg).toContain(UNIQUE_VIOLATION);
  });

  it("one active assignment per employee, role and location", async () => {
    const db = testDb();
    const employeeId = await newEmployee("a@x.com");
    const values = {
      organizationId: seed.orgId,
      employeeId,
      roleId: seed.roles.manager,
      locationId: seed.locationId,
    };
    const [first] = await db
      .insert(roleAssignments)
      .values(values)
      .returning({ id: roleAssignments.id });
    if (!first) throw new Error("assignment insert returned no row");

    expect(await rejection(db.insert(roleAssignments).values(values))).toContain(
      UNIQUE_VIOLATION,
    );

    await db
      .update(roleAssignments)
      .set({ revokedAt: new Date() })
      .where(eq(roleAssignments.id, first.id));
    await expect(
      db.insert(roleAssignments).values(values),
    ).resolves.toBeDefined();
  });

  it("org-wide duplicate assignment rejected", async () => {
    const db = testDb();
    const employeeId = await newEmployee("b@x.com");
    const values = {
      organizationId: seed.orgId,
      employeeId,
      roleId: seed.roles.owner,
      locationId: null,
    };
    await db.insert(roleAssignments).values(values);
    expect(await rejection(db.insert(roleAssignments).values(values))).toContain(
      UNIQUE_VIOLATION,
    );
  });

  it("audit_log rejects update and delete", async () => {
    const db = testDb();
    await db.insert(auditLog).values({
      organizationId: seed.orgId,
      action: "test.created",
      entityType: "test",
    });
    expect(
      await rejection(db.execute(sql`UPDATE audit_log SET action = 'x'`)),
    ).toContain("audit_log is append-only");
    expect(await rejection(db.execute(sql`DELETE FROM audit_log`))).toContain(
      "audit_log is append-only",
    );
  });
});

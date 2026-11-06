import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { auditLog, employees, roleAssignments } from "@/db/schema";
import { resetDb, seedOrg, testDb, type SeededOrg } from "../helpers/db";

type Rejection = { code?: string; constraint?: string; text: string };

/** Walk the error cause chain (Drizzle wraps the Postgres error). */
async function rejection(p: Promise<unknown>): Promise<Rejection> {
  try {
    await p;
  } catch (e) {
    const out: Rejection = { text: "" };
    let cur: unknown = e;
    while (cur instanceof Error) {
      const pg = cur as { code?: string; constraint?: string };
      out.code ??= pg.code;
      out.constraint ??= pg.constraint;
      out.text += ` ${cur.message}`;
      cur = cur.cause;
    }
    return out;
  }
  throw new Error("expected the statement to reject, but it succeeded");
}

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

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
  it("employee email is unique per organization", async () => {
    await newEmployee("som@x.com");
    const r = await rejection(newEmployee("som@x.com"));
    expect(r.code).toBe(UNIQUE_VIOLATION);
    expect(r.constraint).toBe("employees_org_email_unique");
  });

  it("employee email must be stored lower-case", async () => {
    const r = await rejection(newEmployee("Som@x.com"));
    expect(r.code).toBe(CHECK_VIOLATION);
    expect(r.constraint).toBe("employees_email_lower");
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

    const r = await rejection(db.insert(roleAssignments).values(values));
    expect(r.code).toBe(UNIQUE_VIOLATION);
    expect(r.constraint).toBe("role_assignments_active_unique");

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
    const r = await rejection(db.insert(roleAssignments).values(values));
    expect(r.code).toBe(UNIQUE_VIOLATION);
    expect(r.constraint).toBe("role_assignments_active_unique");
  });

  it("audit_log rejects update and delete", async () => {
    const db = testDb();
    await db.insert(auditLog).values({
      organizationId: seed.orgId,
      action: "test.created",
      entityType: "test",
    });
    const upd = await rejection(
      db.execute(sql`UPDATE audit_log SET action = 'x'`),
    );
    expect(upd.text).toContain("audit_log is append-only");
    const del = await rejection(db.execute(sql`DELETE FROM audit_log`));
    expect(del.text).toContain("audit_log is append-only");

    const rows = await db.select().from(auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("test.created");
  });
});

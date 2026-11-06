import { neonConfig, Pool } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "@/db/schema";
import { DEFAULT_ROLE_PERMISSIONS } from "@/server/auth/permissions";
import { requireTestDatabaseUrl } from "./env";

type TestDb = NeonDatabase<typeof schema>;

let pool: Pool | undefined;
let instance: TestDb | undefined;

/** Drizzle client on TEST_DATABASE_URL (never DATABASE_URL). */
export function testDb(): TestDb {
  if (instance) return instance;
  const url = requireTestDatabaseUrl();
  if (typeof WebSocket !== "undefined") {
    neonConfig.webSocketConstructor = WebSocket;
  }
  pool = new Pool({ connectionString: url });
  instance = drizzle(pool, { schema });
  return instance;
}

export async function closeTestDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  instance = undefined;
}

const APP_TABLES = [
  "audit_log",
  "invitations",
  "role_assignments",
  "role_permissions",
  "roles",
  "employees",
  "locations",
  "organizations",
];

/** Empty every application table. The audit trigger only blocks row-level UPDATE/DELETE, not TRUNCATE. */
export async function resetDb(): Promise<void> {
  await testDb().execute(
    sql.raw(`TRUNCATE ${APP_TABLES.join(", ")} RESTART IDENTITY CASCADE`),
  );
}

export type SeededOrg = {
  orgId: string;
  locationId: string;
  roles: Record<"owner" | "manager" | "employee", string>;
};

/** One organization, one location and the three system roles (no permissions). */
export async function seedOrg(): Promise<SeededOrg> {
  const db = testDb();
  const [org] = await db
    .insert(schema.organizations)
    .values({ name: "Test Org", slug: `test-org-${crypto.randomUUID()}` })
    .returning({ id: schema.organizations.id });
  if (!org) throw new Error("seedOrg: organization insert returned no row");

  const [location] = await db
    .insert(schema.locations)
    .values({ organizationId: org.id, name: "Test Location" })
    .returning({ id: schema.locations.id });
  if (!location) throw new Error("seedOrg: location insert returned no row");

  const inserted = await db
    .insert(schema.roles)
    .values(
      (["owner", "manager", "employee"] as const).map((key) => ({
        organizationId: org.id,
        key,
        name: key.charAt(0).toUpperCase() + key.slice(1),
        isSystem: true,
      })),
    )
    .returning({ id: schema.roles.id, key: schema.roles.key });

  const byKey = new Map(inserted.map((r) => [r.key, r.id]));
  const owner = byKey.get("owner");
  const manager = byKey.get("manager");
  const employee = byKey.get("employee");
  if (!owner || !manager || !employee) {
    throw new Error("seedOrg: system role insert incomplete");
  }
  return {
    orgId: org.id,
    locationId: location.id,
    roles: { owner, manager, employee },
  };
}

/** Give the three system roles their default permissions (spec section 8 matrix). */
export async function seedDefaultPermissions(org: SeededOrg): Promise<void> {
  const rows = (["owner", "manager", "employee"] as const).flatMap((key) =>
    DEFAULT_ROLE_PERMISSIONS[key].map((permission) => ({
      organizationId: org.orgId,
      roleId: org.roles[key],
      permission,
    })),
  );
  await testDb().insert(schema.rolePermissions).values(rows);
}

export type SeedAssignment = {
  roleId: string;
  /** null = organization-wide. */
  locationId: string | null;
  /** Insert the assignment already revoked. */
  revoked?: boolean;
};

export type SeedEmployeeInput = {
  orgId: string;
  status?: "invited" | "active" | "suspended" | "left";
  authUserId?: string | null;
  /** Lower-cased before insert (the employees table has a lower-case CHECK). */
  email?: string;
  assignments?: readonly SeedAssignment[];
};

/** One employee plus their role assignments. Returns the employee ID. */
export async function seedEmployee(input: SeedEmployeeInput): Promise<string> {
  const db = testDb();
  const email = (input.email ?? `e-${crypto.randomUUID()}@example.test`).toLowerCase();
  const [employee] = await db
    .insert(schema.employees)
    .values({
      organizationId: input.orgId,
      authUserId: input.authUserId ?? null,
      firstName: "Test",
      lastName: "Employee",
      displayName: "Test Employee",
      email,
      status: input.status ?? "active",
    })
    .returning({ id: schema.employees.id });
  if (!employee) throw new Error("seedEmployee: employee insert returned no row");

  const assignments = input.assignments ?? [];
  if (assignments.length > 0) {
    await db.insert(schema.roleAssignments).values(
      assignments.map((a) => ({
        organizationId: input.orgId,
        employeeId: employee.id,
        roleId: a.roleId,
        locationId: a.locationId,
        revokedAt: a.revoked ? new Date() : null,
      })),
    );
  }
  return employee.id;
}

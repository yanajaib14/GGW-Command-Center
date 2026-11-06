import { sql } from "drizzle-orm";
import {
  boolean,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { employees } from "./employees";
import { locations } from "./locations";
import { organizations } from "./organizations";

export const roles = pgTable(
  "roles",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    ...timestamps(),
  },
  (t) => [uniqueIndex("roles_org_key_unique").on(t.organizationId, t.key)],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    permission: text("permission").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permission] })],
);

export const roleAssignments = pgTable(
  "role_assignments",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    /** Null means all locations in the organization. */
    locationId: uuid("location_id").references(() => locations.id),
    grantedByEmployeeId: uuid("granted_by_employee_id").references(
      () => employees.id,
    ),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByEmployeeId: uuid("revoked_by_employee_id").references(
      () => employees.id,
    ),
    ...timestamps(),
  },
  (t) => [
    // At most one active assignment per (employee, role, location); null
    // location (all locations) is folded to the nil UUID so it is also unique.
    uniqueIndex("role_assignments_active_unique")
      .on(
        t.employeeId,
        t.roleId,
        sql`coalesce(${t.locationId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      )
      .where(sql`${t.revokedAt} is null`),
  ],
);

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
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
  (t) => [
    // Target for composite (id, organization_id) foreign keys.
    unique("roles_id_org_unique").on(t.id, t.organizationId),
    uniqueIndex("roles_org_key_unique").on(t.organizationId, t.key),
  ],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    id: id(),
    roleId: uuid("role_id").notNull(),
    permission: text("permission").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByEmployeeId: uuid("revoked_by_employee_id").references(
      () => employees.id,
    ),
  },
  (t) => [
    foreignKey({
      name: "role_permissions_role_org_fk",
      columns: [t.roleId, t.organizationId],
      foreignColumns: [roles.id, roles.organizationId],
    }),
    uniqueIndex("role_permissions_active_unique")
      .on(t.roleId, t.permission)
      .where(sql`${t.revokedAt} is null`),
    check(
      "role_permissions_revoked_by_needs_revoked_at",
      sql`${t.revokedByEmployeeId} is null or ${t.revokedAt} is not null`,
    ),
  ],
);

export const roleAssignments = pgTable(
  "role_assignments",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id").notNull(),
    roleId: uuid("role_id").notNull(),
    /** Null means all locations in the organization. */
    locationId: uuid("location_id"),
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
    // Composite FKs keep every reference inside the same organization. A NULL
    // location_id (org-wide) is not checked by the location FK, by design.
    foreignKey({
      name: "role_assignments_employee_org_fk",
      columns: [t.employeeId, t.organizationId],
      foreignColumns: [employees.id, employees.organizationId],
    }),
    foreignKey({
      name: "role_assignments_role_org_fk",
      columns: [t.roleId, t.organizationId],
      foreignColumns: [roles.id, roles.organizationId],
    }),
    foreignKey({
      name: "role_assignments_location_org_fk",
      columns: [t.locationId, t.organizationId],
      foreignColumns: [locations.id, locations.organizationId],
    }),
    check(
      "role_assignments_revoked_by_needs_revoked_at",
      sql`${t.revokedByEmployeeId} is null or ${t.revokedAt} is not null`,
    ),
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

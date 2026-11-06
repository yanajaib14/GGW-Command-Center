import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { employees } from "./employees";
import { locations } from "./locations";
import { organizations } from "./organizations";
import { roles } from "./roles";

export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id").notNull(),
    email: text("email").notNull(),
    locationId: uuid("location_id"),
    roleId: uuid("role_id").notNull(),
    /** SHA-256 hex of the random token; the raw token only appears in the link. */
    tokenHash: text("token_hash").notNull().unique(),
    /**
     * When true the accepted assignment gets location_id null (all locations).
     * location_id may still be set (the Owner setup invitation keeps it for display).
     */
    grantsOrgWide: boolean("grants_org_wide").notNull().default(false),
    invitedByEmployeeId: uuid("invited_by_employee_id").references(
      () => employees.id,
    ),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: "invitations_employee_org_fk",
      columns: [t.employeeId, t.organizationId],
      foreignColumns: [employees.id, employees.organizationId],
    }),
    foreignKey({
      name: "invitations_role_org_fk",
      columns: [t.roleId, t.organizationId],
      foreignColumns: [roles.id, roles.organizationId],
    }),
    foreignKey({
      name: "invitations_location_org_fk",
      columns: [t.locationId, t.organizationId],
      foreignColumns: [locations.id, locations.organizationId],
    }),
    check("invitations_email_lower", sql`${t.email} = lower(${t.email})`),
  ],
);

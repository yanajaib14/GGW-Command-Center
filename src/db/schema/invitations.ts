import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { employees } from "./employees";
import { locations } from "./locations";
import { organizations } from "./organizations";
import { roles } from "./roles";

export const invitations = pgTable("invitations", {
  id: id(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id),
  email: text("email").notNull(),
  locationId: uuid("location_id").references(() => locations.id),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id),
  /** SHA-256 hex of the random token; the raw token only appears in the link. */
  tokenHash: text("token_hash").notNull().unique(),
  /** When true the accepted assignment gets location_id null (all locations). */
  grantsOrgWide: boolean("grants_org_wide").notNull().default(false),
  invitedByEmployeeId: uuid("invited_by_employee_id").references(
    () => employees.id,
  ),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  ...timestamps(),
});

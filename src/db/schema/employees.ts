import { sql } from "drizzle-orm";
import {
  check,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { organizations } from "./organizations";

export const employeeStatus = pgEnum("employee_status", [
  "invited",
  "active",
  "suspended",
  "left",
]);

export const employees = pgTable(
  "employees",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    /** Neon Auth user ID; set when the invitation is accepted. */
    authUserId: text("auth_user_id").unique(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    displayName: text("display_name").notNull(),
    /** Stored lower-case (enforced by CHECK). */
    email: text("email").notNull(),
    phone: text("phone"),
    status: employeeStatus("status").notNull().default("invited"),
    ...timestamps(),
  },
  (t) => [
    // Target for composite (id, organization_id) foreign keys.
    unique("employees_id_org_unique").on(t.id, t.organizationId),
    check("employees_email_lower", sql`${t.email} = lower(${t.email})`),
    uniqueIndex("employees_org_email_unique").on(
      t.organizationId,
      sql`lower(${t.email})`,
    ),
  ],
);

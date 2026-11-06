import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  text,
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
    email: text("email").notNull(),
    phone: text("phone"),
    status: employeeStatus("status").notNull().default("invited"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("employees_org_email_unique").on(
      t.organizationId,
      sql`lower(${t.email})`,
    ),
  ],
);

import { desc } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { id } from "./columns";
import { employees } from "./employees";
import { locations } from "./locations";
import { organizations } from "./organizations";

/**
 * Append-only. A trigger (migration 0001_audit_append_only) rejects every
 * UPDATE and DELETE regardless of the connecting database role. There is no
 * updated_at because rows never change.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    locationId: uuid("location_id").references(() => locations.id),
    actorEmployeeId: uuid("actor_employee_id").references(() => employees.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_log_org_created_idx").on(t.organizationId, desc(t.createdAt)),
  ],
);

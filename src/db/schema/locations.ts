import { pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { organizations } from "./organizations";

export const locationStatus = pgEnum("location_status", ["active", "closed"]);

export const locations = pgTable(
  "locations",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    address: text("address"),
    timezone: text("timezone").notNull().default("America/Phoenix"),
    status: locationStatus("status").notNull().default("active"),
    ...timestamps(),
  },
  // Target for composite (id, organization_id) foreign keys.
  (t) => [unique("locations_id_org_unique").on(t.id, t.organizationId)],
);

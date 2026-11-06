import { pgTable, text } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ...timestamps(),
});

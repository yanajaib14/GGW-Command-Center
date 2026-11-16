import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit does not load .env.local; use Node's built-in loader.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// The database is shared with the launch app (decision 0004). `push` diffs the
// live schema against this app's code and would offer to DROP the launch
// tables, so it is refused outright. Use `generate` + `migrate` (add-only).
if (process.argv.includes("push")) {
  throw new Error(
    "drizzle-kit push is disabled: the database holds the launch app's tables. Use `npm run db:generate` then `npm run db:migrate`.",
  );
}

// This app owns only these tables. Every drizzle-kit command that reads the
// live database (pull, studio, check) is limited to them; the launch tables
// are never introspected, diffed or changed.
export const APP_OWNED_TABLES = [
  "organizations",
  "locations",
  "employees",
  "roles",
  "role_permissions",
  "role_assignments",
  "invitations",
  "audit_log",
];

// Only commands that connect need a URL; `generate` works offline.
const needsDatabase = process.argv.some((a) =>
  ["migrate", "pull", "studio"].includes(a),
);
if (needsDatabase && !process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Add the Neon DIRECT (non-pooler) connection string to .env.local before running migrations.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "src/db/migrations",
  schemaFilter: ["public"],
  tablesFilter: APP_OWNED_TABLES,
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});

/**
 * Read-only check that the app's own database client reaches the shared
 * launch database (ADR 0004). Prints table names and row counts, never the
 * connection string. Run: npm run check:db
 */
import { existsSync } from "node:fs";
import { sql } from "drizzle-orm";
import { withTransaction } from "@/server/db/client";

// The client reads DATABASE_URL lazily, so loading the file here is in time.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const LAUNCH_SAMPLE = ["vendors", "menu_items", "inventory_items", "tasks", "app_settings", "activity_logs"];
const APP_TABLES = ["organizations", "locations", "employees", "roles", "audit_log"];

async function main(): Promise<void> {
  await withTransaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION READ ONLY`);
    const branch = await tx.execute(sql`select current_setting('neon.branch_id', true) as branch`);
    console.log("branch:", (branch.rows[0] as { branch: string | null }).branch ?? "unknown");
    for (const group of [["launch tables", LAUNCH_SAMPLE], ["command-center tables", APP_TABLES]] as const) {
      console.log(group[0] + ":");
      for (const table of group[1]) {
        const r = await tx.execute(sql`select count(*)::int as n from ${sql.identifier(table)}`);
        console.log(`  ${table}: ${(r.rows[0] as { n: number }).n} rows`);
      }
    }
    const settings = await tx.execute(sql`select * from app_settings limit 1`);
    const cols = settings.fields.map((f) => f.name);
    console.log("app_settings columns:", cols.join(", "));
  });
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);

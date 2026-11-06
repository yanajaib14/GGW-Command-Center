import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { requireTestDatabaseUrl } from "./env";
import { closeTestDb, testDb } from "./db";

/** Vitest globalSetup for integration tests: guard, then migrate once. */
export default async function setup(): Promise<() => Promise<void>> {
  requireTestDatabaseUrl();
  await migrate(testDb(), { migrationsFolder: "src/db/migrations" });
  return async () => {
    await closeTestDb();
  };
}

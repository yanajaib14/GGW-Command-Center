import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Load .env.local into process.env if the file exists (Node built-in). */
export function loadLocalEnv(): void {
  const file = resolve(process.cwd(), ".env.local");
  if (existsSync(file)) process.loadEnvFile(file);
}

/** The test database URL, or a readable error. Never falls back to DATABASE_URL. */
export function requireTestDatabaseUrl(): string {
  loadLocalEnv();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Integration tests need a Neon test branch connection string in .env.local (see .env.example).",
    );
  }
  if (url === process.env.DATABASE_URL) {
    throw new Error(
      "TEST_DATABASE_URL must not equal DATABASE_URL. Integration tests truncate tables; point TEST_DATABASE_URL at a separate Neon test branch.",
    );
  }
  return url;
}

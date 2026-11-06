import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Load .env.local into process.env if the file exists (Node built-in). */
export function loadLocalEnv(): void {
  const file = resolve(process.cwd(), ".env.local");
  if (existsSync(file)) process.loadEnvFile(file);
}

/**
 * Normalised identity of a Postgres connection string: host with `-pooler`
 * removed from the first label (a Neon pooled and direct string for the same
 * endpoint are the same database), plus the database name. Credentials, port
 * and query parameters are ignored.
 */
export function databaseIdentity(url: string): string {
  const u = new URL(url);
  const [first = "", ...rest] = u.hostname.toLowerCase().split(".");
  const host = [first.replace(/-pooler$/, ""), ...rest].join(".");
  return `${host}${u.pathname}`;
}

/** True when two connection strings point at the same database. */
export function sameDatabase(a: string, b: string): boolean {
  return databaseIdentity(a) === databaseIdentity(b);
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
  const main = process.env.DATABASE_URL;
  if (main && sameDatabase(url, main)) {
    throw new Error(
      "TEST_DATABASE_URL must not point at the same database as DATABASE_URL (pooled and direct strings for one branch count as the same). Integration tests truncate tables; point TEST_DATABASE_URL at a separate Neon test branch.",
    );
  }
  return url;
}

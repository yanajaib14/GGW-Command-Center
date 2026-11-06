import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit does not load .env.local; use Node's built-in loader.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// Only commands that connect need a URL; `generate` works offline.
const needsDatabase = process.argv.some((a) =>
  ["migrate", "push", "pull", "studio"].includes(a),
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
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});

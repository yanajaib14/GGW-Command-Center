import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit does not load .env.local; use Node's built-in loader.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "src/db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});

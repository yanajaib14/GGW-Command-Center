import { defineConfig } from "vitest/config";

// Integration tests hit a real Neon test branch (TEST_DATABASE_URL). They live
// in their own config so `npm run check` / `test:unit` never need a database.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["./tests/helpers/global-setup.ts"],
    // One shared database: run files and tests serially.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

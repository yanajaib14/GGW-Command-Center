import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests hit a real Neon test branch (TEST_DATABASE_URL). They live
// in their own config so `npm run check` / `test:unit` never need a database.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // `server-only` throws outside React Server Components; tests import
    // server modules directly, so point it at the package's empty module.
    alias: {
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["./tests/helpers/integration-setup.ts"],
    globalSetup: ["./tests/helpers/global-setup.ts"],
    // One shared database: run files and tests serially.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

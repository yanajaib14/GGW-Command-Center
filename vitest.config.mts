import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
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
    // Component tests opt in with a `// @vitest-environment jsdom` docblock.
    environment: "node",
    // @neon/auth's ESM imports `next/headers` without an extension, which
    // Node's resolver rejects; let Vite resolve it instead.
    server: { deps: { inline: ["@neon/auth"] } },
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    // Integration tests need a database; they run via vitest.integration.config.mts.
    exclude: ["**/node_modules/**", "tests/integration/**"],
  },
});

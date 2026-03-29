import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Local-only tests that may connect to the local dev database.
 * Run with: pnpm run test:local (from packages/shared)
 */
export default defineConfig({
  resolve: {
    alias: {
      "@games/shared": path.resolve(__dirname, "src/index.ts"),
      "@games/shared/*": path.resolve(__dirname, "src/*"),
    },
  },
  test: {
    include: ["src/__tests__/local/**/*.test.ts"],
    environment: "node",
    globals: true,
    testTimeout: 30_000,
    setupFiles: ["src/__tests__/local/setup.ts"],
  },
});

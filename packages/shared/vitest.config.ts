import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@games/shared": path.resolve(import.meta.dirname, "src/index.ts"),
      "@games/shared/*": path.resolve(import.meta.dirname, "src/*"),
    },
  },
  test: {
    include: ["src/__tests__/**/*.test.ts"],
    environment: "node",
    globals: true,
    testTimeout: 10_000,
    setupFiles: ["src/__tests__/zero-mock.ts"],
  },
});

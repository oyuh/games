import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@games/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
      "@games/shared/*": path.resolve(__dirname, "../../packages/shared/src/*"),
    },
  },
  test: {
    include: ["src/__tests__/**/*.test.ts"],
    exclude: ["src/__tests__/local/**"],
    environment: "node",
    globals: true,
    testTimeout: 10_000,
  },
});

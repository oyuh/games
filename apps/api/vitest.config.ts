import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@games\/shared\/games\/shikaku-engine$/, replacement: path.resolve(__dirname, "../../packages/shared/src/games/shikaku-engine.ts") },
      { find: /^@games\/shared\/games\/pips-engine$/, replacement: path.resolve(__dirname, "../../packages/shared/src/games/pips-engine.ts") },
      { find: /^@games\/shared$/, replacement: path.resolve(__dirname, "../../packages/shared/src/index.ts") },
    ],
  },
  test: {
    include: ["src/__tests__/**/*.test.ts"],
    exclude: ["src/__tests__/local/**"],
    environment: "node",
    globals: true,
    testTimeout: 10_000,
  },
});

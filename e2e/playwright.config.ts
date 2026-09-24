import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: ".",
  outputDir: "test-results",
  globalSetup: "./global-setup.ts",
  // Every test hits the same local API from one IP, so running in parallel
  // just trips the rate limiter.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 150_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never", outputFolder: "playwright-report" }]] : "list",
  use: {
    baseURL,
    // Below this the fixed sidebar covers the left column of game cards.
    viewport: { width: 1440, height: 900 },
    // Set PW_CHANNEL=chrome (or msedge) to use an installed browser instead
    // of the one `npx playwright install chromium` downloads.
    channel: process.env.PW_CHANNEL,
    trace: "retain-on-failure",
  },
  // Reuses a stack that is already up; otherwise starts Postgres, zero-cache,
  // the API and the web app the same way `bun run local up` does. Admin is
  // left out because nothing here tests it.
  webServer: {
    command: "node scripts/local.mjs up --only api,web",
    cwd: "..",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 300_000,
  },
});

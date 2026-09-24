import { expect, test, type Page } from "@playwright/test";
import { waitForSync, watchSync } from "./helpers";

const SYNC = /:4848\//;
const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

test("a returning visitor keeps their session and name", async ({ page }) => {
  const connected = watchSync(page);
  await page.goto("/");
  // The id can change once while the server verifies it, so read it after.
  await waitForSync(page, connected);
  const sessionChip = page.getByRole("contentinfo").getByRole("button").last();
  await expect(sessionChip).toHaveText(/^[\w-]{16,}$/);
  const sessionId = await sessionChip.textContent();

  const name = page.getByRole("textbox", { name: "Enter name…" });
  await name.fill("ReturnE2E");
  await name.press("Enter");
  await expect.poll(() => stored(page, "games:user-name")).toBe("ReturnE2E");

  await page.reload();
  await expect(name).toHaveValue("ReturnE2E");
  await expect(sessionChip).toHaveText(sessionId!);
});

test("a name saved while sync is still down survives a reload", async ({ page }) => {
  // Known bug: the new name waits in Zero's queue while zero-cache is
  // unreachable (a cold start). On reload, /api/session/sync sends the new
  // name, the server still has the old one, answers resetRequired, and the
  // client overwrites its name with the stale one. Drop test.fail once the
  // boot sync accepts a newer name from the verified owner.
  test.fail();

  let syncUp = false;
  await page.routeWebSocket(SYNC, (ws) => {
    if (syncUp) ws.connectToServer();
  });
  await page.goto("/");
  await expect.poll(() => stored(page, "games:session-proof"), { timeout: 30_000 }).toBeTruthy();

  const name = page.getByRole("textbox", { name: "Enter name…" });
  await name.fill("OfflineE2E");
  await name.press("Enter");
  await expect.poll(() => stored(page, "games:user-name")).toBe("OfflineE2E");

  syncUp = true;
  await page.reload();
  await page.waitForTimeout(5_000);
  await expect(name).toHaveValue("OfflineE2E");
});

test("two visitors get different sessions", async ({ browser }) => {
  const ids = [];
  for (let i = 0; i < 2; i++) {
    const page = await (await browser.newContext()).newPage();
    await page.goto("/");
    const chip = page.getByRole("contentinfo").getByRole("button").last();
    await expect(chip).toHaveText(/^[\w-]{16,}$/);
    ids.push(await chip.textContent());
  }
  expect(ids[0]).not.toBe(ids[1]);
});

test("a first visit boots without React render warnings", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && /Cannot update a component|while rendering a different component/.test(msg.text())) {
      warnings.push(msg.text());
    }
  });
  await page.goto("/");
  await expect(page.getByRole("contentinfo").getByRole("button").last()).toHaveText(/^[\w-]{16,}$/);
  // The anonymous-to-verified client swap happens shortly after boot.
  await page.waitForTimeout(3_000);
  expect(warnings).toEqual([]);
});

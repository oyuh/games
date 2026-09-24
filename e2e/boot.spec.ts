import { expect, test, type Page } from "@playwright/test";
import { createButton, joinByCode, newPlayer, waitForSync, watchSync } from "./helpers";

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

test("a game made before the backend wakes is still there once it does", async ({ browser, page }) => {
  // Everything done while the API and sync server are asleep waits in Zero's
  // queue. When they come up the client gets its verified token, and none of
  // that work may be lost. The room code shown while asleep has to be the one
  // the server stores, since that is when a host shares it. (The server side
  // of this, keeping a brand-new id instead of an older session on the same
  // device, only runs in production mode and is covered in
  // session-identity.test.ts.)
  let awake = false;
  await page.routeWebSocket(SYNC, (ws) => {
    if (awake) ws.connectToServer();
  });
  await page.route(/localhost:3001/, (route) => (awake ? route.continue() : route.abort()));

  await page.goto("/");
  const devTools = page.getByRole("button", { name: "Collapse dev tools" });
  if (await devTools.isVisible()) await devTools.click();
  await page.getByRole("textbox", { name: "Enter name…" }).fill("AsleepE2E");
  await page.getByRole("textbox", { name: "Enter name…" }).press("Enter");
  await createButton(page, "Imposter").click();
  await page.getByRole("button", { name: "Create It!" }).click();
  await expect(page).toHaveURL(/\/imposter\/[\w-]+$/);
  const roomUrl = page.url();
  await expect(page.getByRole("main").getByText("Lobby")).toBeVisible();
  await page.getByRole("button", { name: "Show the room code" }).click();
  const code = (await page.getByRole("button", { name: /^Room code/ }).textContent())!.trim();

  awake = true;
  await expect.poll(() => stored(page, "games:session-proof"), { timeout: 30_000 }).toBeTruthy();

  // Still in the room, and the room is real: someone else can join it.
  const friend = await newPlayer(browser, "FriendE2E");
  await joinByCode(friend, code, /\/imposter\//);
  await expect(page).toHaveURL(roomUrl);
  for (const p of [page, friend]) {
    await expect(p.getByRole("main").getByText("AsleepE2E", { exact: true })).toBeVisible();
    await expect(p.getByRole("main").getByText("FriendE2E", { exact: true })).toBeVisible();
  }
});

import { expect, type Browser, type Page } from "@playwright/test";

const SYNC_SOCKET = /:4848\//;

/**
 * Live zero-cache sockets that are syncing, keyed by socket, with their user
 * id. The app boots on an anonymous client and swaps to a verified one, and in
 * dev a spare client with the same user id connects and is then refused, so
 * each socket is tracked on its own.
 */
export function watchSync(page: Page) {
  const syncing = new Map<object, string>();
  page.on("websocket", (ws) => {
    if (!SYNC_SOCKET.test(ws.url())) return;
    const userId = new URL(ws.url()).searchParams.get("userID") ?? "";
    ws.on("framereceived", (frame) => {
      const payload = String(frame.payload);
      if (payload.startsWith('["connected"')) syncing.set(ws, userId);
      if (payload.startsWith('["error"')) syncing.delete(ws);
    });
    ws.on("close", () => syncing.delete(ws));
  });
  return syncing;
}

/** Waits for a verified session and a live sync connection for it, like a settled page. */
export async function waitForSync(page: Page, syncing: Map<object, string>) {
  let proof: string | null = null;
  await expect.poll(async () => (proof = await page.evaluate(() => localStorage.getItem("games:session-proof"))), { timeout: 20_000 }).toBeTruthy();
  // The proof is "<session id>.<signature>".
  const sessionId = proof!.split(".")[0]!;
  await expect.poll(() => [...syncing.values()].includes(sessionId), { timeout: 40_000 }).toBe(true);
}

/** A fresh player: own browser context, so own session, cookie and storage. */
export async function newPlayer(browser: Browser, name: string) {
  const page = await (await browser.newContext()).newPage();
  const connected = watchSync(page);
  // The Vite dev server now and then refuses a module request under load and
  // the page never boots. One reload covers that; boot.spec.ts checks booting
  // itself without the second chance.
  await expect(async () => {
    await page.goto("/");
    await waitForSync(page, connected);
  }).toPass({ timeout: 120_000 });
  await page.getByRole("textbox", { name: "Enter name…" }).fill(name);
  // The dev-only tools panel sits over the bottom-left game card.
  const devTools = page.getByRole("button", { name: "Collapse dev tools" });
  if (await devTools.isVisible()) await devTools.click();
  return page;
}

/** The "Create Game" button inside one game's card on the home page. */
export function createButton(page: Page, game: string) {
  return page
    .getByRole("heading", { name: game, level: 2 })
    .locator('xpath=ancestor::*[.//button[normalize-space()="Create Game"]][1]')
    .getByRole("button", { name: "Create Game" });
}

/** Creates a room from the home page, picking the given setup radios, and returns its code. */
export async function createRoom(host: Page, game: string, route: RegExp, options: string[] = []) {
  await createButton(host, game).click();
  for (const option of options) await host.getByRole("radio", { name: option }).click();
  await host.getByRole("button", { name: "Create It!" }).click();
  await expect(host).toHaveURL(route);
  await host.getByRole("button", { name: "Show the room code" }).click();
  const code = (await host.getByRole("button", { name: /^Room code/ }).textContent())?.trim() ?? "";
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  return code;
}

/**
 * Joins through the home page code box. The code lookup is a synced query,
 * so a join typed before sync catches up gets "no game found"; retry the
 * way a person would.
 */
export async function joinByCode(page: Page, code: string, route: RegExp) {
  const box = page.getByRole("textbox", { name: "ABCXYZ" });
  await expect(async () => {
    await box.fill("");
    await box.fill(code);
    await box.press("Enter");
    await expect(page).toHaveURL(route, { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

/** A host plus everyone else joined by code, in the order of `names`. */
export async function openRoom(browser: Browser, game: string, route: RegExp, names: string[], options: string[] = []) {
  const host = await newPlayer(browser, names[0]!);
  const code = await createRoom(host, game, route, options);
  const players = [host];
  for (const name of names.slice(1)) {
    const page = await newPlayer(browser, name);
    await joinByCode(page, code, route);
    players.push(page);
  }
  for (const page of players) {
    for (const name of names) await expect(page.getByRole("main").getByText(name, { exact: true }).first()).toBeVisible();
  }
  return { players, code };
}

/** Index of the one page `test` holds for, once the room settles into it. */
export async function whichPage(pages: Page[], test: (page: Page) => Promise<boolean>) {
  let found: number[] = [];
  await expect(async () => {
    const results = await Promise.all(pages.map(test));
    found = results.flatMap((hit, i) => (hit ? [i] : []));
    expect(found).toHaveLength(1);
  }).toPass({ timeout: 20_000 });
  return found[0]!;
}

/** Status codes of every game-secret key request a page makes. */
export function keyStatuses(page: Page) {
  const statuses: number[] = [];
  page.on("response", (res) => {
    if (res.url().endsWith("/api/game-secret/key")) statuses.push(res.status());
  });
  return statuses;
}

/**
 * Every frame the page's sockets receive from here on, which includes the
 * zero-cache sync stream. Reloads so sockets opened before now are caught too.
 */
export async function recordSyncFrames(page: Page) {
  const frames: string[] = [];
  page.on("websocket", (ws) => ws.on("framereceived", (frame) => frames.push(String(frame.payload))));
  await page.reload();
  return frames;
}

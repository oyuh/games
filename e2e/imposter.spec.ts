import { expect, test } from "@playwright/test";
import { createRoom, joinByCode, keyStatuses, newPlayer, openRoom, recordSyncFrames, whichPage } from "./helpers";

const NAMES = ["HostE2E", "AliceE2E", "BobE2E"];
const ROUTE = /\/imposter\/[\w-]+$/;

test("three players play a full round and only the imposter is kept from the word", async ({ browser }) => {
  const { players } = await openRoom(browser, "Imposter", ROUTE, NAMES, ["1 round"]);
  const [host] = players;
  await expect(host!.getByRole("button", { name: "Start the round" })).toBeEnabled();
  // Only the host gets the kick buttons.
  await expect(players[1]!.getByRole("button", { name: /^Remove / })).toHaveCount(0);

  const keys = players.map(keyStatuses);
  await host!.getByRole("button", { name: "Start the round" }).click();

  // Exactly one imposter, and everyone else decrypts the same word.
  for (const page of players) await expect(page.getByText(/^(Your word|You are the imposter)$/)).toBeVisible();
  const imp = await whichPage(players, (p) => p.getByText("You are the imposter").isVisible());
  const impName = NAMES[imp]!;

  const words = new Set<string>();
  for (const [i, page] of players.entries()) {
    if (i === imp) continue;
    const word = page.getByText("Your word").locator("xpath=following-sibling::p[1]");
    // "••••" is the placeholder while the key is on its way.
    await expect(word).toHaveText(/^[^•]+$/);
    words.add((await word.textContent())!.trim());
  }
  expect(words.size).toBe(1);
  const [word] = words;

  // The server refuses the imposter the key, not just the UI.
  await expect.poll(() => keys[imp]!.length).toBeGreaterThan(0);
  expect(new Set(keys[imp])).toEqual(new Set([403]));
  for (const [i, statuses] of keys.entries()) {
    if (i !== imp) expect(statuses).toContain(200);
  }
  await expect(players[imp]!.getByText(word!, { exact: true })).toHaveCount(0);

  // Clues from everyone move the room to voting.
  for (const [i, page] of players.entries()) {
    await page.getByRole("textbox", { name: "Your clue" }).fill(["fluffy", "stripes", "claws"][i]!);
    await page.getByRole("button", { name: "Lock it in" }).click();
  }
  for (const page of players) await expect(page.getByRole("radiogroup", { name: "Your vote" })).toBeVisible();

  // Everyone else votes out the imposter; the imposter votes for someone else.
  for (const [i, page] of players.entries()) {
    const target = i === imp ? NAMES.find((_, j) => j !== imp && j !== i)! : impName;
    await page.locator("label").filter({ has: page.getByRole("radio", { name: new RegExp(`^${target}`) }) }).click();
    await page.getByRole("button", { name: `Vote for ${target}` }).click();
  }

  for (const page of players) {
    await expect(page.getByText("was the imposter")).toBeVisible();
    await expect(page.getByText("the word was")).toContainText(word!);
  }
  await expect(host!.getByText("voted out", { exact: true }).locator("xpath=preceding-sibling::p[1]")).toHaveText(impName);
});

test("a kicked player is removed and cannot get back in", async ({ browser }) => {
  const host = await newPlayer(browser, NAMES[0]!);
  const code = await createRoom(host, "Imposter", ROUTE);
  const bob = await newPlayer(browser, NAMES[2]!);
  await joinByCode(bob, code, ROUTE);
  const roomUrl = bob.url();

  await host.getByRole("button", { name: `Remove ${NAMES[2]}` }).click();
  await host.getByRole("button", { name: `Confirm removing ${NAMES[2]}` }).click();

  await expect(host.getByRole("main").getByText(NAMES[2]!, { exact: true })).toHaveCount(0);
  await expect(bob).toHaveURL(/\/$/);

  // Not by code...
  const box = bob.getByRole("textbox", { name: "ABCXYZ" });
  await box.fill(code);
  await box.press("Enter");
  await expect(bob.getByText("You have been kicked from this game")).toBeVisible();
  await expect(bob).toHaveURL(/\/$/);

  // ...and not by the room link.
  await bob.goto(roomUrl);
  await expect(bob).toHaveURL(/\/$/);
  await expect(host.getByRole("main").getByText(NAMES[2]!, { exact: true })).toHaveCount(0);
});

test("the imposter's sync socket never carries the word in plaintext", async ({ browser }) => {
  // Known leak: the server start mutator writes secret_word in plaintext and
  // the host's browser encrypts it afterwards via /api/game-secret/init, so
  // zero-cache pushes the plain word to every client first. Anyone with
  // devtools open reads it. Drop test.fail once start encrypts server side.
  test.fail();

  const { players } = await openRoom(browser, "Imposter", ROUTE, NAMES);
  const frames = await Promise.all(players.map(recordSyncFrames));

  await expect(players[0]!.getByRole("button", { name: "Start the round" })).toBeEnabled();
  await players[0]!.getByRole("button", { name: "Start the round" }).click();
  for (const page of players) await expect(page.getByText(/^(Your word|You are the imposter)$/)).toBeVisible();
  const imp = await whichPage(players, (p) => p.getByText("You are the imposter").isVisible());

  const word = players.find((_, i) => i !== imp)!.getByText("Your word").locator("xpath=following-sibling::p[1]");
  await expect(word).toHaveText(/^[^•]+$/);
  const plain = `"${(await word.textContent())!.trim()}"`;
  await players[imp]!.waitForTimeout(2_000);
  expect(frames[imp]!.filter((f) => f.includes(plain))).toEqual([]);
});

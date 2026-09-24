import { expect, test } from "@playwright/test";
import { keyStatuses, openRoom, recordSyncFrames } from "./helpers";

const NAMES = ["HostE2E", "AliceE2E", "BobE2E", "CaraE2E"];
const ROUTE = /\/password\/[\w-]+/;

test("two teams race, only cluers see their word, and one correct guess wins", async ({ browser }) => {
  const { players } = await openRoom(browser, "Password", ROUTE, NAMES, ["First to 3 points"]);
  const [host] = players;
  const keys = players.map(keyStatuses);
  const frames = await Promise.all(players.map(recordSyncFrames));

  await expect(host!.getByRole("button", { name: "Start the game" })).toBeEnabled();
  await host!.getByRole("button", { name: "Start the game" }).click();
  for (const page of players) await expect(page.getByText(/^(Get them to say this|You are guessing)$/)).toBeVisible();

  // Every team gets one cluer and one guesser.
  const isCluer = await Promise.all(players.map((p) => p.getByText("Get them to say this").isVisible()));
  expect(isCluer.filter(Boolean)).toHaveLength(2);
  const cluers = players.filter((_, i) => isCluer[i]);
  const guessers = players.filter((_, i) => !isCluer[i]);

  const words: string[] = [];
  for (const cluer of cluers) {
    const word = cluer.getByText("Get them to say this").locator("xpath=following-sibling::p[1]");
    await expect(word).toHaveText(/^[^•]+$/);
    words.push((await word.textContent())!.trim());
  }

  // Guessers never see a word, can't get the key, and never receive one in plaintext.
  for (const [i, page] of players.entries()) {
    if (isCluer[i]) continue;
    for (const word of words) await expect(page.getByText(word, { exact: true })).toHaveCount(0);
    expect(keys[i]!.every((status) => status === 403)).toBe(true);
    expect(frames[i]!.length).toBeGreaterThan(0);
    for (const word of words) expect(frames[i]!.filter((f) => f.includes(`"${word}"`))).toEqual([]);
  }

  // A clue reaches the cluer's own guesser and nobody on the other team.
  await cluers[0]!.getByRole("textbox", { name: "Your clue" }).fill("hint");
  await cluers[0]!.getByRole("button", { name: "Send" }).click();
  let teammate = -1;
  await expect(async () => {
    const sees = await Promise.all(guessers.map((g) => g.getByText("hint", { exact: true }).first().isVisible()));
    expect(sees.filter(Boolean)).toHaveLength(1);
    teammate = sees.indexOf(true);
  }).toPass({ timeout: 15_000 });

  const guesser = guessers[teammate]!;
  await guesser.getByRole("textbox", { name: "Your guess" }).fill(words[0]!);
  await guesser.getByRole("button", { name: "Guess" }).click();

  // First-try guess is worth 3, which hits the target and ends the game for everyone.
  for (const page of players) {
    await expect(page.getByText("the game goes to")).toBeVisible();
    await expect(page.getByRole("group").getByText(words[0]!, { exact: true }).first()).toBeVisible();
  }
});

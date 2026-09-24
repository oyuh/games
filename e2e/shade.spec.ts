import { expect, test, type Page } from "@playwright/test";
import { openRoom, recordSyncFrames, whichPage } from "./helpers";

const NAMES = ["HostE2E", "AliceE2E", "BobE2E"];
const ROUTE = /\/shade\/[\w-]+$/;

/** Row and column (1-based) of the ringed target on the leader's grid. */
async function leaderTarget(leader: Page) {
  // The grid can draw a beat before the target syncs in.
  await expect(leader.locator(".sk-grid .is-target")).toHaveCount(1);
  return leader.locator(".sk-grid").first().evaluate((grid) => {
    const cells = [...grid.children];
    const cols = Number(getComputedStyle(grid).getPropertyValue("--sk-cols"));
    const i = cells.findIndex((cell) => cell.classList.contains("is-target"));
    return { row: Math.floor(i / cols) + 1, col: (i % cols) + 1, cols };
  });
}

const cell = (row: number, col: number) => `Row ${row}, column ${col}`;

async function startAndFindLeader(players: Page[]) {
  await players[0]!.getByRole("button", { name: "Start the round" }).click();
  return whichPage(players, (p) => p.getByRole("textbox", { name: "Clue 1" }).isVisible());
}

test("the leader clues a color and guesses are scored by distance", async ({ browser }) => {
  // Each guess phase waits out its clock even once everyone locks in.
  test.setTimeout(180_000);
  const { players } = await openRoom(browser, "Shade Signal", ROUTE, NAMES);
  const li = await startAndFindLeader(players);
  const leader = players[li]!;
  const [spotOn, nextDoor] = players.filter((_, i) => i !== li) as [Page, Page];

  // Only the leader sees the target.
  const target = await leaderTarget(leader);
  expect(target.row).toBeGreaterThan(0);
  for (const guesser of [spotOn, nextDoor]) await expect(guesser.locator(".sk-grid .is-target")).toHaveCount(0);

  await leader.getByRole("textbox", { name: "Clue 1" }).fill("ocean");
  await leader.getByRole("button", { name: "Send it" }).click();

  const neighbor = cell(target.row, target.col === target.cols ? target.col - 1 : target.col + 1);
  for (const [guesser, pick] of [[spotOn, cell(target.row, target.col)], [nextDoor, neighbor]] as const) {
    await guesser.getByRole("button", { name: pick, exact: true }).click();
    await guesser.getByRole("button", { name: "Lock it in" }).click();
  }

  await expect(leader.getByRole("textbox", { name: "Clue 2" })).toBeVisible({ timeout: 60_000 });
  await leader.getByRole("textbox", { name: "Clue 2" }).fill("deep");
  await leader.getByRole("button", { name: "Send it" }).click();
  for (const guesser of [spotOn, nextDoor]) {
    await expect(guesser.getByRole("button", { name: "Lock it in" })).toBeEnabled({ timeout: 30_000 });
    await guesser.getByRole("button", { name: "Lock it in" }).click();
  }

  // Exact pays 5 and one away pays 3, and everyone sees the same result.
  const [spotOnName, nextDoorName] = [NAMES[players.indexOf(spotOn)]!, NAMES[players.indexOf(nextDoor)]!];
  // The reveal only lasts a few seconds, so check every page at once.
  await Promise.all(players.map(async (page) => {
    await expect(page.getByText(/^Reveal/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("main")).toContainText(new RegExp(`${spotOnName}\\s*(you)?\\s*Spot on\\s*5\\s*pts`));
    await expect(page.getByRole("main")).toContainText(new RegExp(`${nextDoorName}\\s*(you)?\\s*1 away\\s*3\\s*pts`));
  }));
});

test("guessers' sync sockets never carry the target", async ({ browser }) => {
  // Known leak: with the grid picking the color, target_row and target_col
  // stay in plaintext on the synced row for the whole round, so every
  // guesser's client has the answer. Drop test.fail once the target is
  // encrypted before it is written.
  test.fail();

  const { players } = await openRoom(browser, "Shade Signal", ROUTE, NAMES);
  const frames = await Promise.all(players.map(recordSyncFrames));
  const li = await startAndFindLeader(players);
  await players[li]!.waitForTimeout(2_000);

  for (const [i, pageFrames] of frames.entries()) {
    if (i === li) continue;
    expect(pageFrames.length).toBeGreaterThan(0);
    expect(pageFrames.filter((f) => /"target_row":\d/.test(f))).toEqual([]);
  }
});

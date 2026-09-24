import { expect, test, type Page } from "@playwright/test";
import { openRoom, recordSyncFrames, whichPage } from "./helpers";

const NAMES = ["HostE2E", "AliceE2E", "BobE2E"];
const ROUTE = /\/location\/[\w-]+$/;

/** Clicks the map at a spot given as fractions of its width and height. */
async function clickMap(page: Page, x: number, y: number) {
  const map = page.getByRole("button", { name: "Repeating world map" }).first();
  const box = (await map.boundingBox())!;
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
}

async function startAndFindLeader(players: Page[]) {
  await players[0]!.getByRole("button", { name: "Start the round" }).click();
  await expect(players[0]!.getByText("The place")).toBeVisible();
  // Everyone but the leader is told the leader is out finding somewhere.
  return whichPage(players, async (p) => !(await p.getByText("is finding somewhere").isVisible()));
}

test("the leader drops a pin and guesses are paid by distance", async ({ browser }) => {
  const { players } = await openRoom(browser, "Location Signal", ROUTE, NAMES, ["1 clue and guess pair"]);
  const li = await startAndFindLeader(players);
  const leader = players[li]!;
  const [bullseye, farAway] = players.filter((_, i) => i !== li) as [Page, Page];

  await expect(leader.getByRole("textbox", { name: "Clue 1" })).toBeDisabled();
  await clickMap(leader, 0.3, 0.4);
  await expect(leader.getByText("Place set")).toBeVisible();
  await leader.getByRole("textbox", { name: "Clue 1" }).fill("water");
  await leader.getByRole("button", { name: "Send it" }).click();

  // Same viewport and zoom, so the same spot on the map is the same place.
  for (const [guesser, [x, y]] of [[bullseye, [0.3, 0.4]], [farAway, [0.8, 0.8]]] as const) {
    await expect(guesser.getByText("Click the map")).toBeVisible({ timeout: 30_000 });
    await clickMap(guesser, x, y);
    await expect(guesser.getByText("Pin dropped")).toBeVisible();
    await guesser.getByRole("button", { name: "Lock it in" }).click();
  }

  const [bullseyeName, farName] = [NAMES[players.indexOf(bullseye)]!, NAMES[players.indexOf(farAway)]!];
  await Promise.all(players.map(async (page) => {
    await expect(page.getByText(/^Reveal/)).toBeVisible({ timeout: 60_000 });
    const standings = page.getByRole("main").getByRole("listitem");
    await expect(standings.first()).toContainText(new RegExp(`${bullseyeName}\\s*(you)?\\s*0\\.0 km\\s*\\+5,000`));
    await expect(standings.nth(1)).toContainText(farName);
    await expect(standings.nth(1)).not.toContainText("+5,000");
  }));
});

test("guessers' sync sockets never carry the leader's place", async ({ browser }) => {
  // Known leak: sending the first clue writes target_lat and target_lng in
  // plaintext, and the leader's browser encrypts them afterwards through
  // /api/game-secret/init. zero-cache pushes the real coordinates to every
  // guesser first. Drop test.fail once the place is encrypted before it is
  // written.
  test.fail();

  const { players } = await openRoom(browser, "Location Signal", ROUTE, NAMES, ["1 clue and guess pair"]);
  const frames = await Promise.all(players.map(recordSyncFrames));
  const li = await startAndFindLeader(players);
  await clickMap(players[li]!, 0.3, 0.4);
  await expect(players[li]!.getByText("Place set")).toBeVisible();
  // The place is only sent along with the first clue.
  await players[li]!.getByRole("textbox", { name: "Clue 1" }).fill("water");
  await players[li]!.getByRole("button", { name: "Send it" }).click();
  await players[li]!.waitForTimeout(3_000);

  for (const [i, pageFrames] of frames.entries()) {
    if (i === li) continue;
    expect(pageFrames.length).toBeGreaterThan(0);
    // After encryption the row holds 0,0; anything else is the real place.
    expect(pageFrames.filter((f) => /"target_lat":-?(?!0[,}])\d/.test(f))).toEqual([]);
  }
});

import { expect, test, type Page } from "@playwright/test";
import { openRoom, recordSyncFrames } from "./helpers";
import { chainWordBank } from "../packages/shared/src/zero/mutators/word-banks";

const NAMES = ["HostE2E", "AliceE2E"];
const ROUTE = /\/chain\/[\w-]+$/;

/** The words of this page's chain, rows top to bottom. */
function chainRows(page: Page) {
  return page.getByRole("main").getByRole("list").first().getByRole("listitem");
}

/** Premade chains are dealt from the bank; the ends are shown, so they pin down which one. */
async function lookUpChain(page: Page) {
  const rows = chainRows(page);
  await expect(rows.first()).toContainText("given");
  const texts = await rows.allTextContents();
  const first = texts[0]!.match(/[A-Z]{2,}/)![0];
  const last = texts.at(-1)!.match(/[A-Z]{2,}/)![0];
  const matches = chainWordBank.animals!.filter((c) => c.length === texts.length && c[0] === first && c.at(-1) === last);
  expect(matches).toHaveLength(1);
  return matches[0]!;
}

test("a duel where one player cracks their chain and the other gives up", async ({ browser }) => {
  const { players } = await openRoom(browser, "Chain Reaction", ROUTE, NAMES, ["1 round"]);
  const [host, alice] = players as [Page, Page];
  await host.getByRole("button", { name: "Start the duel" }).click();

  // The host solves every hidden word. Solving one jumps to the next.
  const chain = await lookUpChain(host);
  const rows = chainRows(host);
  for (let i = 1; i < chain.length - 1; i++) {
    const box = rows.nth(i).getByRole("textbox");
    if (!(await box.isVisible())) await rows.nth(i).getByRole("button").first().click();
    await box.fill(chain[i]!);
    await box.press("Enter");
    // The submit glyph can linger in the row for a beat after it is solved.
    await expect(rows.nth(i)).toContainText(new RegExp(`${chain[i]}\\W*yours`));
  }
  await expect(host.getByText("Your chain is done")).toBeVisible();
  await expect(alice.getByRole("button", { name: /^HostE2E .*Chain finished/ })).toBeVisible();

  // Alice gets a wrong guess wrong (it hands her a letter), then gives up the rest.
  const aliceRows = chainRows(alice);
  const hidden = await aliceRows.nth(1).getByRole("button").first().textContent();
  await aliceRows.nth(1).getByRole("button").first().click();
  await aliceRows.nth(1).getByRole("textbox").fill("QQQQ".slice(0, hidden!.replace(/[^_]/g, "").length));
  await aliceRows.nth(1).getByRole("textbox").press("Enter");
  await expect(aliceRows.nth(1)).toContainText(/[A-Z]/);

  const aliceChain = await lookUpChain(alice);
  for (let i = 1; i < aliceChain.length - 1; i++) {
    await aliceRows.nth(i).getByRole("button", { name: "Give up on this word" }).click();
    await aliceRows.nth(i).getByRole("button", { name: "Confirm giving up on this word" }).click();
    await expect(aliceRows.nth(i)).toContainText(new RegExp(`${aliceChain[i]}\\W*given up`));
  }

  for (const page of players) {
    await expect(page.getByText("the duel goes to")).toBeVisible();
    await expect(page.getByText("the duel goes to").locator("xpath=following-sibling::p[1]")).toHaveText("HostE2E");
  }
});

test("a player's sync socket never carries their own unsolved words", async ({ browser }) => {
  // Hidden words sync as a mask plus a copy only the server can decrypt,
  // and guesses are checked there.
  const { players } = await openRoom(browser, "Chain Reaction", ROUTE, NAMES, ["1 round"]);
  const frames = await recordSyncFrames(players[1]!);
  await players[0]!.getByRole("button", { name: "Start the duel" }).click();

  const chain = await lookUpChain(players[1]!);
  const hidden = chain.slice(1, -1);
  await players[1]!.waitForTimeout(2_000);
  expect(frames.length).toBeGreaterThan(0);
  expect(hidden.filter((word) => frames.some((f) => f.includes(`"${word}"`)))).toEqual([]);
});

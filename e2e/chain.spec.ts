import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { openRoom, recordSyncFrames } from "./helpers";
import { chainLinks } from "../packages/shared/src/zero/mutators/word-banks";

const NAMES = ["HostE2E", "AliceE2E"];
const ROUTE = /\/chain\/[\w-]+$/;

/** The words of this page's chain, rows top to bottom. */
function chainRows(page: Page) {
  return page.getByRole("main").getByRole("list").first().getByRole("listitem");
}

/**
 * The chains this page could have been dealt: every walk through the link
 * graph from the shown first word to the shown last word whose middle words
 * match the masked lengths, with no word repeated, the same rules pickChain
 * deals by. Several walks can fit, so the caller tries them in order.
 */
async function candidateChains(page: Page) {
  const rows = chainRows(page);
  await expect(rows.first()).toContainText("given");
  const texts = await rows.allTextContents();
  const first = texts[0]!.match(/[A-Z]{2,}/)![0];
  const last = texts.at(-1)!.match(/[A-Z]{2,}/)![0];
  // A masked row reads like "2H___↵3": index, hinted letters and blanks, points.
  const lengths = texts.slice(1, -1).map((text) => text.match(/[A-Z_]{2,}/)![0].length);

  const matches: string[][] = [];
  const walk = (chain: string[]) => {
    const prev = chain.at(-1)!;
    if (chain.length === texts.length - 1) {
      if (chainLinks[prev]?.includes(last)) matches.push([...chain, last]);
      return;
    }
    for (const next of chainLinks[prev] ?? []) {
      if (next.length === lengths[chain.length - 1] && next !== last && !chain.includes(next)) walk([...chain, next]);
    }
  };
  walk([first]);
  expect(matches.length).toBeGreaterThan(0);
  return matches;
}

test("a duel where one player cracks their chain and the other gives up", async ({ browser }) => {
  const { players } = await openRoom(browser, "Chain Reaction", ROUTE, NAMES, ["1 round"]);
  const [host, alice] = players as [Page, Page];
  await host.getByRole("button", { name: "Start the duel" }).click();

  // The host solves every hidden word. Solving one jumps to the next.
  let candidates = await candidateChains(host);
  const rows = chainRows(host);
  const middle = candidates[0]!.length - 2;
  for (let i = 1; i <= middle; i++) {
    const row = rows.nth(i);
    const words = [...new Set(candidates.map((c) => c[i]!))];
    for (const word of words) {
      const box = row.getByRole("textbox");
      if (!(await box.isVisible())) await row.getByRole("button").first().click();
      await box.fill(word);
      await box.press("Enter");
      // The submit glyph can linger in the row for a beat after it is solved.
      const solved = await expect(row).toContainText(new RegExp(`${word}\\W*yours`), { timeout: 5_000 }).then(() => true, () => false);
      if (solved) {
        candidates = candidates.filter((c) => c[i] === word);
        break;
      }
    }
    await expect(row).toContainText("yours");
  }
  await expect(host.getByText("Your chain is done")).toBeVisible();
  await expect(alice.getByRole("button", { name: /^HostE2E .*Chain finished/ })).toBeVisible();

  // Alice guesses wrong (it hands her a letter), then gives up every word.
  const aliceRows = chainRows(alice);
  const aliceCount = await aliceRows.count();
  const hidden = await aliceRows.nth(1).getByRole("button").first().textContent();
  await aliceRows.nth(1).getByRole("button").first().click();
  await aliceRows.nth(1).getByRole("textbox").fill("QQQQQQQQQQ".slice(0, hidden!.replace(/[^_]/g, "").length));
  await aliceRows.nth(1).getByRole("textbox").press("Enter");
  await expect(aliceRows.nth(1)).toContainText(/[A-Z]/);

  for (let i = 1; i < aliceCount - 1; i++) {
    await aliceRows.nth(i).getByRole("button", { name: "Give up on this word" }).click();
    await aliceRows.nth(i).getByRole("button", { name: "Confirm giving up on this word" }).click();
    await expect(aliceRows.nth(i)).toContainText(/[A-Z]{2,}\W*given up/);
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

  const hidden = new Set((await candidateChains(players[1]!)).flatMap((c) => c.slice(1, -1)));
  await players[1]!.waitForTimeout(2_000);
  expect(frames.length).toBeGreaterThan(0);
  expect([...hidden].filter((word) => frames.some((f) => f.includes(`"${word}"`)))).toEqual([]);
});

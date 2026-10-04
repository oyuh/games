import { describe, expect, it } from "bun:test";
import { checkMoveTimes } from "../move-timing";

/** Moves at these gaps after a first move at `start`; the board is solved on the last one. */
function board(start: number, gaps: number[]) {
  const moves = [start];
  for (const gap of gaps) moves.push(moves[moves.length - 1]! + gap);
  return { moves, split: moves[moves.length - 1]! };
}

function check(game: "shikaku" | "pips" | "zip", boards: { moves: number[]; split: number }[], minMoves = boards.map(() => 1)) {
  return checkMoveTimes(game, boards.map((b) => b.moves), boards.map((b) => b.split), minMoves);
}

describe("solo move timing", () => {
  it("passes a person thinking between drags", () => {
    const run = [
      board(900, [450, 1_300, 380, 2_100, 520, 610]),
      board(1_400, [700, 300, 1_800, 260, 940, 410, 1_200]),
      board(650, [2_400, 330, 520, 290, 1_100]),
    ];
    const result = check("shikaku", run);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.legitimacy).toBeGreaterThanOrEqual(90);
  });

  it("passes a fast Zip swipe, squares landing in bunches", () => {
    const swipe = [0, 16, 0, 17, 0, 0, 16, 300, 0, 17, 16, 0, 450, 16, 0, 17, 0, 16, 16, 0, 600, 0, 17, 16];
    const result = check("zip", [board(700, swipe), board(520, swipe), board(880, swipe)]);
    expect(result.ok).toBe(true);
  });

  it("refuses a run whose moves all land at once", () => {
    const burst = { moves: Array(12).fill(5_000), split: 5_000 };
    expect(check("shikaku", [burst, burst, burst])).toMatchObject({ ok: false, code: "scripted" });
  });

  it("refuses a metronome that starts the instant the board appears", () => {
    const loop = board(0, Array(12).fill(50));
    expect(check("pips", [loop, loop, loop])).toMatchObject({ ok: false, code: "scripted" });
  });

  it("refuses a log that doesn't fit the run", () => {
    const real = board(900, [450, 1_300, 380]);
    // Fewer moves than the board takes.
    expect(check("pips", [real], [6])).toMatchObject({ ok: false, code: "invalid-moves" });
    // Moves after the solve, or nowhere near it.
    expect(check("pips", [{ moves: real.moves, split: real.split - 2_000 }])).toMatchObject({ ok: false, code: "invalid-moves" });
    expect(check("pips", [{ moves: real.moves, split: real.split + 5_000 }])).toMatchObject({ ok: false, code: "invalid-moves" });
    // Out of order, or one log short of the boards.
    expect(check("pips", [{ moves: [900, 400, 1_300], split: 1_300 }])).toMatchObject({ ok: false, code: "invalid-moves" });
    expect(checkMoveTimes("pips", [real.moves], [real.split, real.split], [1, 1])).toMatchObject({ ok: false, code: "invalid-moves" });
  });
});

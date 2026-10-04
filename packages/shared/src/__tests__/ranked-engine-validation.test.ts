import { describe, expect, it } from "bun:test";
import {
  PUZZLES_PER_RUN,
  calculateScore,
  generateRun as generateShikakuRun,
  validateRankedShikakuRun,
} from "../games/shikaku-engine";
import {
  PIPS_RUN_DIFFICULTIES,
  generateRun as generatePipsRun,
  validateRankedPipsRun,
} from "../games/pips-engine";
import {
  RUN_LENGTH as ZIP_RUN_LENGTH,
  generateRun as generateZipRun,
  validateRankedZipRun,
} from "../games/zip-engine";

describe("ranked Shikaku replay validation", () => {
  it("accepts canonical replay rectangles for the generated seed", () => {
    const seed = 12345;
    const timeMs = 25_000;
    const run = generateShikakuRun(seed, "easy");

    const result = validateRankedShikakuRun({
      seed,
      difficulty: "easy",
      score: calculateScore(timeMs, "easy"),
      timeMs,
      puzzleCount: PUZZLES_PER_RUN,
      replayData: {
        puzzleTimes: [5_000, 5_000, 5_000, 5_000, 5_000],
        solutions: run.map((puzzle) => puzzle.solution),
      },
    });

    expect(result.ok).toBe(true);
  });

  it("rejects replays that do not solve the canonical generated puzzle", () => {
    const seed = 12345;
    const timeMs = 25_000;
    const run = generateShikakuRun(seed, "easy");
    const tamperedFirstSolution = run[0]!.solution.map((rect, index) => index === 0 ? { ...rect, w: rect.w + 1 } : rect);

    const result = validateRankedShikakuRun({
      seed,
      difficulty: "easy",
      score: calculateScore(timeMs, "easy"),
      timeMs,
      puzzleCount: PUZZLES_PER_RUN,
      replayData: {
        puzzleTimes: [5_000, 5_000, 5_000, 5_000, 5_000],
        solutions: [tamperedFirstSolution, ...run.slice(1).map((puzzle) => puzzle.solution)],
      },
    });

    expect(result).toMatchObject({ ok: false, code: "non-canonical-solution" });
  });
});

describe("ranked Pips replay validation", () => {
  it("accepts canonical placements for the generated run", () => {
    const seed = 246810;
    const run = generatePipsRun(seed);
    const placements = Object.fromEntries(
      run.puzzles.map((puzzle) => [puzzle.difficulty, puzzle.solution]),
    );

    const result = validateRankedPipsRun({
      seed,
      totalMs: 30_000,
      easyMs: 6_000,
      mediumMs: 9_000,
      hardMs: 15_000,
      puzzleCount: PIPS_RUN_DIFFICULTIES.length,
      replayData: { placements },
    });

    expect(result.ok).toBe(true);
  });

  it("rejects placements that solve a different board shape", () => {
    const seed = 246810;
    const run = generatePipsRun(seed);
    const placements = Object.fromEntries(
      run.puzzles.map((puzzle) => [puzzle.difficulty, puzzle.solution]),
    );
    const easy = [...run.puzzles[0]!.solution];
    easy[0] = { ...easy[0]!, r1: easy[0]!.r1 + 10 };

    const result = validateRankedPipsRun({
      seed,
      totalMs: 30_000,
      easyMs: 6_000,
      mediumMs: 9_000,
      hardMs: 15_000,
      puzzleCount: PIPS_RUN_DIFFICULTIES.length,
      replayData: { placements: { ...placements, easy } },
    });

    expect(result).toMatchObject({ ok: false, code: "non-canonical-solution" });
  });
});

describe("ranked Zip replay validation", () => {
  const seed = 97531;
  const run = generateZipRun(seed, "easy");
  const base = {
    seed,
    difficulty: "easy",
    timeMs: 30_000,
    puzzleCount: ZIP_RUN_LENGTH,
    replayData: { puzzleTimes: [10_000, 10_000, 10_000], paths: run.map((puzzle) => puzzle.solution) },
  };

  it("accepts the generated run's own paths", () => {
    expect(validateRankedZipRun(base).ok).toBe(true);
  });

  it("rejects a path drawn on a different board", () => {
    const otherBoard = generateZipRun(seed + 1, "easy")[0]!.solution;
    const paths = [otherBoard, ...base.replayData.paths.slice(1)];
    expect(validateRankedZipRun({ ...base, replayData: { ...base.replayData, paths } }))
      .toMatchObject({ ok: false, code: "non-canonical-solution" });
  });

  it("rejects splits that don't add up to the total, and runs of the wrong length", () => {
    expect(validateRankedZipRun({ ...base, timeMs: 12_000 })).toMatchObject({ ok: false, code: "invalid-time" });
    expect(validateRankedZipRun({ ...base, puzzleCount: 5 })).toMatchObject({ ok: false, code: "invalid-puzzle-count" });
  });
});

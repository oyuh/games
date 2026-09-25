import { describe, it, expect } from "vitest";
import {
  mulberry32,
  getAutoFilledRects,
  generatePuzzle,
  generateRun,
  validateSolution,
  calculateScore,
  DIFFICULTY_CONFIG,
  PUZZLES_PER_RUN,
  type ShikakuPuzzle,
  type Rect,
  type NumberCell,
  type Difficulty,
} from "../games/shikaku-engine";

describe("mulberry32", () => {
  it("is deterministic and stays in [0, 1)", () => {
    const a = mulberry32(999);
    const b = mulberry32(999);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(v).toBe(b());
    }
  });
});

// ─── generatePuzzle ─────────────────────────────────────────
describe("generatePuzzle", () => {
  // validateSolution's own tests below prove it checks coverage, overlap,
  // bounds, areas and one number per rectangle, so a generated puzzle that
  // passes it has all of those.
  it("builds a solvable puzzle of the asked size, across sizes and seeds", () => {
    for (const size of [5, 9, 15]) {
      for (let seed = 0; seed < 20; seed++) {
        const puzzle = generatePuzzle(size, size, mulberry32(seed * 137 + size));
        expect(puzzle.rows).toBe(size);
        expect(puzzle.cols).toBe(size);
        expect(validateSolution(puzzle, puzzle.solution)).toBe(true);
      }
    }
  });

  it("is deterministic: same seed produces identical puzzle", () => {
    expect(generatePuzzle(5, 5, mulberry32(42))).toEqual(generatePuzzle(5, 5, mulberry32(42)));
  });
});

// ─── generateRun ────────────────────────────────────────────
describe("generateRun", () => {
  it("returns PUZZLES_PER_RUN valid puzzles at each difficulty's size", () => {
    for (const difficulty of ["easy", "medium", "hard", "expert"] as Difficulty[]) {
      const cfg = DIFFICULTY_CONFIG[difficulty];
      const run = generateRun(5678, difficulty);
      expect(run).toHaveLength(PUZZLES_PER_RUN);
      for (const puzzle of run) {
        expect(puzzle.rows).toBe(cfg.rows);
        expect(puzzle.cols).toBe(cfg.cols);
        expect(validateSolution(puzzle, puzzle.solution)).toBe(true);
      }
    }
  });

  it("is deterministic: same seed + difficulty = same run", () => {
    expect(generateRun(42, "medium")).toEqual(generateRun(42, "medium"));
  });

  it("different seeds produce different runs", () => {
    expect(generateRun(1, "easy")[0]!.numbers).not.toEqual(generateRun(2, "easy")[0]!.numbers);
  });
});

describe("getAutoFilledRects", () => {
  it("returns only 1×1 solution rectangles in row-major order", () => {
    const puzzle: ShikakuPuzzle = {
      rows: 3,
      cols: 3,
      numbers: [
        { r: 2, c: 2, value: 1 },
        { r: 1, c: 0, value: 2 },
        { r: 0, c: 2, value: 1 },
      ],
      solution: [
        { r: 2, c: 2, w: 1, h: 1 },
        { r: 1, c: 0, w: 2, h: 1 },
        { r: 0, c: 2, w: 1, h: 1 },
      ],
    };

    expect(getAutoFilledRects(puzzle)).toEqual([
      { r: 0, c: 2, w: 1, h: 1 },
      { r: 2, c: 2, w: 1, h: 1 },
    ]);
  });

  it("returns an empty list when there are no 1×1 regions", () => {
    const puzzle: ShikakuPuzzle = {
      rows: 2,
      cols: 2,
      numbers: [{ r: 0, c: 0, value: 4 }],
      solution: [{ r: 0, c: 0, w: 2, h: 2 }],
    };

    expect(getAutoFilledRects(puzzle)).toEqual([]);
  });
});

// ─── validateSolution ───────────────────────────────────────
describe("validateSolution", () => {
  // Helper to build a small test puzzle
  function makePuzzle(
    rows: number,
    cols: number,
    numbers: NumberCell[],
    solution: Rect[],
  ): ShikakuPuzzle {
    return { rows, cols, numbers, solution };
  }

  // Simple 2x2 grid: one 2x2 rect with value 4
  const simple2x2: ShikakuPuzzle = makePuzzle(
    2, 2,
    [{ r: 0, c: 0, value: 4 }],
    [{ r: 0, c: 0, w: 2, h: 2 }],
  );

  // 2x3 grid: two rects (1x3 and 1x3)
  const twoRows: ShikakuPuzzle = makePuzzle(
    2, 3,
    [
      { r: 0, c: 0, value: 3 },
      { r: 1, c: 1, value: 3 },
    ],
    [
      { r: 0, c: 0, w: 3, h: 1 },
      { r: 1, c: 0, w: 3, h: 1 },
    ],
  );

  it("accepts correct solution for 2×2", () => {
    expect(validateSolution(simple2x2, simple2x2.solution)).toBe(true);
  });

  it("accepts correct solution for 2×3", () => {
    expect(validateSolution(twoRows, twoRows.solution)).toBe(true);
  });

  it("rejects when rectangles overlap", () => {
    const puzzle = makePuzzle(
      2, 2,
      [{ r: 0, c: 0, value: 4 }],
      [
        { r: 0, c: 0, w: 2, h: 2 },
        { r: 0, c: 0, w: 1, h: 1 }, // overlap
      ],
    );
    expect(validateSolution(puzzle, puzzle.solution)).toBe(false);
  });

  it("rejects when cells are uncovered", () => {
    const puzzle = makePuzzle(
      2, 2,
      [{ r: 0, c: 0, value: 2 }],
      [{ r: 0, c: 0, w: 2, h: 1 }], // only top row covered
    );
    expect(validateSolution(puzzle, puzzle.solution)).toBe(false);
  });

  it("rejects when area does not match number value", () => {
    const puzzle = makePuzzle(
      2, 2,
      [{ r: 0, c: 0, value: 2 }], // says 2 but rect area is 4
      [{ r: 0, c: 0, w: 2, h: 2 }],
    );
    expect(validateSolution(puzzle, puzzle.solution)).toBe(false);
  });

  it("rejects when rectangle extends out of bounds", () => {
    const puzzle = makePuzzle(
      2, 2,
      [{ r: 0, c: 0, value: 6 }],
      [{ r: 0, c: 0, w: 3, h: 2 }], // extends past cols
    );
    expect(validateSolution(puzzle, puzzle.solution)).toBe(false);
  });

  it("rejects negative coordinates", () => {
    const puzzle = makePuzzle(
      2, 2,
      [{ r: 0, c: 0, value: 4 }],
      [{ r: -1, c: 0, w: 2, h: 2 }],
    );
    expect(validateSolution(puzzle, puzzle.solution)).toBe(false);
  });

  it("rejects when a rectangle contains zero numbers", () => {
    // Two rects but only one number → one rect has no number
    const puzzle = makePuzzle(
      2, 2,
      [{ r: 0, c: 0, value: 2 }],
      [
        { r: 0, c: 0, w: 2, h: 1 },
        { r: 1, c: 0, w: 2, h: 1 },
      ],
    );
    expect(validateSolution(puzzle, puzzle.solution)).toBe(false);
  });

  it("rejects when a rectangle contains multiple numbers", () => {
    const puzzle = makePuzzle(
      2, 2,
      [
        { r: 0, c: 0, value: 4 },
        { r: 1, c: 1, value: 4 },
      ],
      [{ r: 0, c: 0, w: 2, h: 2 }],
    );
    expect(validateSolution(puzzle, puzzle.solution)).toBe(false);
  });

  it("rejects empty rect list for non-empty grid", () => {
    const puzzle = makePuzzle(2, 2, [{ r: 0, c: 0, value: 4 }], []);
    expect(validateSolution(puzzle, [])).toBe(false);
  });
});

// ─── calculateScore ─────────────────────────────────────────
describe("calculateScore", () => {
  // Easy par is 30s a puzzle, so 150s for the run. Base is 1000 a puzzle.
  it("scores base points at par, double at zero, and floors at a tenth", () => {
    expect(calculateScore(150_000, "easy")).toBe(5000);
    expect(calculateScore(0, "easy")).toBe(10000);
    expect(calculateScore(10_000_000, "easy")).toBe(500);
  });

  it("faster times produce higher scores", () => {
    expect(calculateScore(30_000, "easy")).toBeGreaterThan(calculateScore(200_000, "easy"));
  });

  it("applies each difficulty's multiplier", () => {
    const multipliers: Record<Difficulty, number> = { easy: 1, medium: 1.5, hard: 2.2, expert: 3 };
    for (const [d, mult] of Object.entries(multipliers) as [Difficulty, number][]) {
      expect(calculateScore(0, d)).toBe(Math.round(5000 * mult * 2));
    }
  });
});

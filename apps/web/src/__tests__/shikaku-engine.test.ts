/**
 * Tests for the Shikaku puzzle engine.
 *
 * Covers: PRNG, puzzle generation, solution validation, scoring,
 * difficulty config, and deterministic reproduction from seeds.
 */
import { describe, it, expect } from "vitest";
import {
  mulberry32,
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
} from "../lib/shikaku-engine";

// ─── mulberry32 PRNG ────────────────────────────────────────
describe("mulberry32", () => {
  it("returns a function", () => {
    const rng = mulberry32(42);
    expect(typeof rng).toBe("function");
  });

  it("produces values in [0, 1)", () => {
    const rng = mulberry32(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is deterministic — same seed produces same sequence", () => {
    const a = mulberry32(999);
    const b = mulberry32(999);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it("different seeds produce different sequences", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    let same = 0;
    for (let i = 0; i < 100; i++) {
      if (a() === b()) same++;
    }
    expect(same).toBeLessThan(5); // statistically very unlikely to be many
  });

  it("produces uniformly distributed output (chi-square rough check)", () => {
    const rng = mulberry32(7777);
    const buckets = new Array(10).fill(0);
    const N = 10000;
    for (let i = 0; i < N; i++) {
      buckets[Math.floor(rng() * 10)]++;
    }
    // Each bucket should have ~1000 values — allow 20% tolerance
    for (const count of buckets) {
      expect(count).toBeGreaterThan(800);
      expect(count).toBeLessThan(1200);
    }
  });

  it("handles seed = 0", () => {
    const rng = mulberry32(0);
    const v = rng();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });

  it("handles negative seeds", () => {
    const rng = mulberry32(-42);
    const v = rng();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });
});

// ─── DIFFICULTY_CONFIG ──────────────────────────────────────
describe("DIFFICULTY_CONFIG", () => {
  it("defines all four difficulties", () => {
    expect(Object.keys(DIFFICULTY_CONFIG)).toEqual(["easy", "medium", "hard", "expert"]);
  });

  it("has increasing grid sizes", () => {
    const sizes = (["easy", "medium", "hard", "expert"] as Difficulty[]).map(
      (d) => DIFFICULTY_CONFIG[d].rows * DIFFICULTY_CONFIG[d].cols,
    );
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]!).toBeGreaterThan(sizes[i - 1]!);
    }
  });

  it("has square grids for all difficulties", () => {
    for (const cfg of Object.values(DIFFICULTY_CONFIG)) {
      expect(cfg.rows).toBe(cfg.cols);
    }
  });

  it("labels match dimensions", () => {
    for (const cfg of Object.values(DIFFICULTY_CONFIG)) {
      expect(cfg.label).toBe(`${cfg.rows}×${cfg.cols}`);
    }
  });
});

// ─── PUZZLES_PER_RUN ────────────────────────────────────────
describe("PUZZLES_PER_RUN", () => {
  it("equals 5", () => {
    expect(PUZZLES_PER_RUN).toBe(5);
  });
});

// ─── generatePuzzle ─────────────────────────────────────────
describe("generatePuzzle", () => {
  it("returns a puzzle with correct dimensions", () => {
    const rng = mulberry32(100);
    const puzzle = generatePuzzle(5, 5, rng);
    expect(puzzle.rows).toBe(5);
    expect(puzzle.cols).toBe(5);
  });

  it("covers every cell with solution rectangles", () => {
    const rng = mulberry32(200);
    const puzzle = generatePuzzle(5, 5, rng);
    const covered = Array.from({ length: 5 }, () => new Array(5).fill(false));
    for (const rect of puzzle.solution) {
      for (let dr = 0; dr < rect.h; dr++) {
        for (let dc = 0; dc < rect.w; dc++) {
          covered[rect.r + dr]![rect.c + dc] = true;
        }
      }
    }
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        expect(covered[r]![c]).toBe(true);
      }
    }
  });

  it("solution rectangles do not overlap", () => {
    const rng = mulberry32(300);
    const puzzle = generatePuzzle(5, 5, rng);
    const grid = Array.from({ length: 5 }, () => new Array(5).fill(-1));
    for (let i = 0; i < puzzle.solution.length; i++) {
      const rect = puzzle.solution[i]!;
      for (let dr = 0; dr < rect.h; dr++) {
        for (let dc = 0; dc < rect.w; dc++) {
          expect(grid[rect.r + dr]![rect.c + dc]).toBe(-1);
          grid[rect.r + dr]![rect.c + dc] = i;
        }
      }
    }
  });

  it("each number matches its containing rectangle area", () => {
    const rng = mulberry32(400);
    const puzzle = generatePuzzle(5, 5, rng);
    for (const num of puzzle.numbers) {
      const containingRect = puzzle.solution.find(
        (r) =>
          num.r >= r.r &&
          num.r < r.r + r.h &&
          num.c >= r.c &&
          num.c < r.c + r.w,
      );
      expect(containingRect).toBeDefined();
      expect(num.value).toBe(containingRect!.w * containingRect!.h);
    }
  });

  it("has exactly one number per rectangle", () => {
    const rng = mulberry32(500);
    const puzzle = generatePuzzle(5, 5, rng);
    expect(puzzle.numbers.length).toBe(puzzle.solution.length);

    for (const rect of puzzle.solution) {
      const contained = puzzle.numbers.filter(
        (n) =>
          n.r >= rect.r &&
          n.r < rect.r + rect.h &&
          n.c >= rect.c &&
          n.c < rect.c + rect.w,
      );
      expect(contained.length).toBe(1);
    }
  });

  it("solution rectangles stay within grid bounds", () => {
    const rng = mulberry32(600);
    const rows = 9, cols = 9;
    const puzzle = generatePuzzle(rows, cols, rng);
    for (const rect of puzzle.solution) {
      expect(rect.r).toBeGreaterThanOrEqual(0);
      expect(rect.c).toBeGreaterThanOrEqual(0);
      expect(rect.r + rect.h).toBeLessThanOrEqual(rows);
      expect(rect.c + rect.w).toBeLessThanOrEqual(cols);
    }
  });

  it("generated solution passes validateSolution", () => {
    const rng = mulberry32(700);
    const puzzle = generatePuzzle(5, 5, rng);
    expect(validateSolution(puzzle, puzzle.solution)).toBe(true);
  });

  it("is deterministic — same seed produces identical puzzle", () => {
    const p1 = generatePuzzle(5, 5, mulberry32(42));
    const p2 = generatePuzzle(5, 5, mulberry32(42));
    expect(p1.numbers).toEqual(p2.numbers);
    expect(p1.solution).toEqual(p2.solution);
  });

  it("works for medium grid (9×9)", () => {
    const rng = mulberry32(800);
    const puzzle = generatePuzzle(9, 9, rng);
    expect(puzzle.rows).toBe(9);
    expect(puzzle.cols).toBe(9);
    expect(validateSolution(puzzle, puzzle.solution)).toBe(true);
  });

  it("works for hard grid (15×15)", () => {
    const rng = mulberry32(900);
    const puzzle = generatePuzzle(15, 15, rng);
    expect(puzzle.rows).toBe(15);
    expect(puzzle.cols).toBe(15);
    expect(validateSolution(puzzle, puzzle.solution)).toBe(true);
  });
});

// ─── generateRun ────────────────────────────────────────────
describe("generateRun", () => {
  it("returns PUZZLES_PER_RUN puzzles", () => {
    const run = generateRun(1234, "easy");
    expect(run.length).toBe(PUZZLES_PER_RUN);
  });

  it("all puzzles in a run have correct difficulty dimensions", () => {
    for (const difficulty of ["easy", "medium", "hard", "expert"] as Difficulty[]) {
      const cfg = DIFFICULTY_CONFIG[difficulty];
      const run = generateRun(5678, difficulty);
      for (const puzzle of run) {
        expect(puzzle.rows).toBe(cfg.rows);
        expect(puzzle.cols).toBe(cfg.cols);
      }
    }
  });

  it("all puzzles in a run are valid", () => {
    const run = generateRun(9999, "easy");
    for (const puzzle of run) {
      expect(validateSolution(puzzle, puzzle.solution)).toBe(true);
    }
  });

  it("is deterministic — same seed + difficulty = same run", () => {
    const a = generateRun(42, "medium");
    const b = generateRun(42, "medium");
    expect(a).toEqual(b);
  });

  it("different seeds produce different runs", () => {
    const a = generateRun(1, "easy");
    const b = generateRun(2, "easy");
    // Compare first puzzle numbers — extremely unlikely to match
    expect(a[0]!.numbers).not.toEqual(b[0]!.numbers);
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

  it("validates generated puzzles against their own solutions", () => {
    // Fuzz: check multiple seeds
    for (let seed = 0; seed < 20; seed++) {
      const rng = mulberry32(seed * 137);
      const puzzle = generatePuzzle(5, 5, rng);
      expect(validateSolution(puzzle, puzzle.solution)).toBe(true);
    }
  });
});

// ─── calculateScore ─────────────────────────────────────────
describe("calculateScore", () => {
  it("returns a positive number for reasonable times", () => {
    expect(calculateScore(60_000, "easy")).toBeGreaterThan(0);
    expect(calculateScore(120_000, "medium")).toBeGreaterThan(0);
    expect(calculateScore(300_000, "hard")).toBeGreaterThan(0);
    expect(calculateScore(600_000, "expert")).toBeGreaterThan(0);
  });

  it("never returns negative", () => {
    // Even absurdly long times should clamp to 0
    expect(calculateScore(999_999_999, "easy")).toBeGreaterThanOrEqual(0);
  });

  it("faster times produce higher scores", () => {
    const fast = calculateScore(30_000, "easy");
    const slow = calculateScore(200_000, "easy");
    expect(fast).toBeGreaterThan(slow);
  });

  it("higher difficulty gives higher score for same speed ratio", () => {
    // Easy par total = 150s, expert par total = 600s
    // Use exactly par time for each difficulty
    const easyAtPar = calculateScore(150_000, "easy");   // 30s * 5
    const expertAtPar = calculateScore(600_000, "expert"); // 120s * 5
    expect(expertAtPar).toBeGreaterThan(easyAtPar);
  });

  it("matches expected formula: basePoints * diffMult * timeBonus", () => {
    const timeMs = 100_000;
    const difficulty: Difficulty = "easy";
    const totalParMs = 30_000 * 5; // 150_000
    const timeBonus = Math.max(0.1, 2 - timeMs / totalParMs);
    const expected = Math.round(5000 * 1 * timeBonus);
    expect(calculateScore(timeMs, difficulty)).toBe(expected);
  });

  it("caps timeBonus at 0.1 minimum", () => {
    // Very slow time → timeBonus should floor at 0.1
    const verySlowScore = calculateScore(10_000_000, "easy");
    const expected = Math.round(5000 * 1 * 0.1);
    expect(verySlowScore).toBe(expected);
  });

  it("at exactly par time, timeBonus = 1  →  score = base * mult", () => {
    // Par for easy = 30_000 * 5 = 150_000ms
    const score = calculateScore(150_000, "easy");
    expect(score).toBe(Math.round(5000 * 1 * 1)); // 5000
  });

  it("at zero time, timeBonus = 2 (max)", () => {
    const score = calculateScore(0, "easy");
    expect(score).toBe(Math.round(5000 * 1 * 2)); // 10000
  });

  it("works for all difficulty levels", () => {
    const difficulties: Difficulty[] = ["easy", "medium", "hard", "expert"];
    for (const d of difficulties) {
      const score = calculateScore(60_000, d);
      expect(score).toBeGreaterThan(0);
      expect(Number.isInteger(score)).toBe(true);
    }
  });

  it("difficulty multipliers are applied correctly", () => {
    // At 0ms timeBonus = 2 for all, so score = 5000 * mult * 2
    const expectedMultipliers: Record<Difficulty, number> = {
      easy: 1,
      medium: 1.5,
      hard: 2.2,
      expert: 3,
    };
    for (const d of ["easy", "medium", "hard", "expert"] as Difficulty[]) {
      const score = calculateScore(0, d);
      expect(score).toBe(Math.round(5000 * expectedMultipliers[d] * 2));
    }
  });
});

// ─── Integration: full pipeline ─────────────────────────────
describe("integration — generate → validate → score", () => {
  it("full workflow: generate run, validate all, then score", () => {
    const run = generateRun(777, "medium");
    expect(run.length).toBe(PUZZLES_PER_RUN);

    for (const puzzle of run) {
      expect(validateSolution(puzzle, puzzle.solution)).toBe(true);
    }

    const score = calculateScore(180_000, "medium");
    expect(score).toBeGreaterThan(0);
  });

  it("stress: 50 random easy puzzles all self-validate", () => {
    for (let seed = 0; seed < 50; seed++) {
      const rng = mulberry32(seed);
      const puzzle = generatePuzzle(5, 5, rng);
      expect(validateSolution(puzzle, puzzle.solution)).toBe(true);
    }
  });

  it("stress: 10 random medium puzzles all self-validate", () => {
    for (let seed = 0; seed < 10; seed++) {
      const rng = mulberry32(seed + 10000);
      const puzzle = generatePuzzle(9, 9, rng);
      expect(validateSolution(puzzle, puzzle.solution)).toBe(true);
    }
  });
});

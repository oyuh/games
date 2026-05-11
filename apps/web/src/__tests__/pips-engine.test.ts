import { describe, expect, it } from "vitest";
import {
  PIPS_DIFFICULTY_CONFIG,
  PIPS_PUZZLES_PER_RUN,
  PIPS_RUN_DIFFICULTIES,
  compareRunTimes,
  countPipsSolutions,
  evaluateRegionRule,
  generatePuzzle,
  generateRun,
  getPlacementValueGrid,
  getRunScoreTime,
  mulberry32,
  validatePuzzleShape,
  validateSolution,
  type PipsPuzzle,
} from "../lib/pips-engine";

describe("pips mulberry32", () => {
  it("produces deterministic values in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);

    for (let i = 0; i < 100; i++) {
      const value = a();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(value).toBe(b());
    }
  });
});

describe("PIPS_DIFFICULTY_CONFIG", () => {
  it("defines one full easy-medium-hard run", () => {
    expect(PIPS_RUN_DIFFICULTIES).toEqual(["easy", "medium", "hard"]);
    expect(PIPS_PUZZLES_PER_RUN).toBe(3);
  });

  it("uses even active-cell counts for every difficulty", () => {
    for (const difficulty of PIPS_RUN_DIFFICULTIES) {
      const config = PIPS_DIFFICULTY_CONFIG[difficulty];
      expect(config.dominoes * 2).toBeLessThan(config.rows * config.cols);
      expect((config.dominoes * 2) % 2).toBe(0);
    }
  });
});

describe("evaluateRegionRule", () => {
  it("evaluates sum rules", () => {
    expect(evaluateRegionRule({ type: "sum", target: 7 }, [2, 5])).toBe(true);
    expect(evaluateRegionRule({ type: "sum", target: 7 }, [2, 4])).toBe(false);
  });

  it("evaluates comparison rules", () => {
    expect(evaluateRegionRule({ type: "greaterThan", target: 5 }, [3, 3])).toBe(true);
    expect(evaluateRegionRule({ type: "lessThan", target: 5 }, [3, 3])).toBe(false);
  });

  it("evaluates equal and different rules", () => {
    expect(evaluateRegionRule({ type: "equal" }, [4, 4, 4])).toBe(true);
    expect(evaluateRegionRule({ type: "equal" }, [4, 3, 4])).toBe(false);
    expect(evaluateRegionRule({ type: "different" }, [1, 2, 3])).toBe(true);
    expect(evaluateRegionRule({ type: "different" }, [1, 2, 1])).toBe(false);
  });
});

describe("generatePuzzle", () => {
  it("generates valid puzzles for every difficulty", () => {
    for (const difficulty of PIPS_RUN_DIFFICULTIES) {
      const puzzle = generatePuzzle(difficulty, mulberry32(1000 + PIPS_RUN_DIFFICULTIES.indexOf(difficulty)));
      const config = PIPS_DIFFICULTY_CONFIG[difficulty];

      expect(puzzle.difficulty).toBe(difficulty);
      expect(puzzle.rows).toBeLessThanOrEqual(config.rows);
      expect(puzzle.cols).toBeLessThanOrEqual(config.cols);
      expect(puzzle.cells.length).toBe(config.dominoes * 2);
      expect(puzzle.dominoes.length).toBe(config.dominoes);
      expect(puzzle.solution.length).toBe(config.dominoes);
      expect(puzzle.cells.length).toBeLessThan(puzzle.rows * puzzle.cols);
      expect(isConnectedCells(puzzle)).toBe(true);
      expect(validatePuzzleShape(puzzle)).toBe(true);
      expect(validateSolution(puzzle, puzzle.solution)).toBe(true);
    }
  });

  it("generates irregular board silhouettes instead of full rectangles", () => {
    const run = generateRun(424242);

    for (const puzzle of run.puzzles) {
      const rowCounts = new Set(
        Array.from({ length: puzzle.rows }, (_, row) => puzzle.cells.filter((cell) => cell.r === row).length).filter(Boolean),
      );
      const colCounts = new Set(
        Array.from({ length: puzzle.cols }, (_, col) => puzzle.cells.filter((cell) => cell.c === col).length).filter(Boolean),
      );

      expect(puzzle.cells.length).toBeLessThan(puzzle.rows * puzzle.cols);
      expect(rowCounts.size).toBeGreaterThan(1);
      expect(colCounts.size).toBeGreaterThan(1);
    }
  });

  it("is deterministic for a given seed and difficulty", () => {
    const a = generatePuzzle("medium", mulberry32(12345));
    const b = generatePuzzle("medium", mulberry32(12345));
    expect(a).toEqual(b);
  });

  it("produces a value grid for the generated solution", () => {
    const puzzle = generatePuzzle("easy", mulberry32(54321));
    const valueGrid = getPlacementValueGrid(puzzle, puzzle.solution);

    expect(valueGrid).not.toBeNull();
    expect(valueGrid!.size).toBe(puzzle.cells.length);
    for (const value of valueGrid!.values()) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(6);
    }
  });
});

describe("generateRun", () => {
  it("generates one easy, one medium, and one hard puzzle", () => {
    const run = generateRun(999);

    expect(run.seed).toBe(999);
    expect(run.puzzles.map((puzzle) => puzzle.difficulty)).toEqual(["easy", "medium", "hard"]);
    expect(run.puzzles.length).toBe(PIPS_PUZZLES_PER_RUN);
  });

  it("is deterministic for the same run seed", () => {
    expect(generateRun(2026)).toEqual(generateRun(2026));
  });

  it("varies with different seeds", () => {
    expect(generateRun(1)).not.toEqual(generateRun(2));
  });
});

describe("validateSolution", () => {
  const tinyPuzzle: PipsPuzzle = {
    difficulty: "easy",
    rows: 2,
    cols: 2,
    cells: [
      { r: 0, c: 0 },
      { r: 0, c: 1 },
      { r: 1, c: 0 },
      { r: 1, c: 1 },
    ],
    dominoes: [
      { id: "0-1", a: 0, b: 1 },
      { id: "2-3", a: 2, b: 3 },
    ],
    regions: [
      { id: "r0", cells: [{ r: 0, c: 0 }], rule: { type: "sum", target: 0 }, colorIndex: 0 },
      { id: "r1", cells: [{ r: 0, c: 1 }], rule: { type: "sum", target: 1 }, colorIndex: 1 },
      { id: "r2", cells: [{ r: 1, c: 0 }], rule: { type: "sum", target: 2 }, colorIndex: 2 },
      { id: "r3", cells: [{ r: 1, c: 1 }], rule: { type: "sum", target: 3 }, colorIndex: 3 },
    ],
    solution: [
      { dominoId: "0-1", r1: 0, c1: 0, r2: 0, c2: 1, flipped: false },
      { dominoId: "2-3", r1: 1, c1: 0, r2: 1, c2: 1, flipped: false },
    ],
  };

  it("accepts a correct hand-built puzzle", () => {
    expect(validatePuzzleShape(tinyPuzzle)).toBe(true);
    expect(validateSolution(tinyPuzzle, tinyPuzzle.solution)).toBe(true);
  });

  it("rejects overlapping placements", () => {
    expect(validateSolution(tinyPuzzle, [
      { dominoId: "0-1", r1: 0, c1: 0, r2: 0, c2: 1, flipped: false },
      { dominoId: "2-3", r1: 0, c1: 0, r2: 1, c2: 0, flipped: false },
    ])).toBe(false);
  });

  it("rejects non-adjacent placements", () => {
    expect(validateSolution(tinyPuzzle, [
      { dominoId: "0-1", r1: 0, c1: 0, r2: 1, c2: 1, flipped: false },
      { dominoId: "2-3", r1: 0, c1: 1, r2: 1, c2: 0, flipped: false },
    ])).toBe(false);
  });

  it("rejects placements that break a region rule", () => {
    expect(validateSolution(tinyPuzzle, [
      { dominoId: "0-1", r1: 0, c1: 0, r2: 0, c2: 1, flipped: true },
      { dominoId: "2-3", r1: 1, c1: 0, r2: 1, c2: 1, flipped: false },
    ])).toBe(false);
  });
});

describe("countPipsSolutions", () => {
  it("counts one solution for a constrained tiny puzzle", () => {
    const puzzle: PipsPuzzle = {
      difficulty: "easy",
      rows: 2,
      cols: 2,
      cells: [
        { r: 0, c: 0 },
        { r: 0, c: 1 },
        { r: 1, c: 0 },
        { r: 1, c: 1 },
      ],
      dominoes: [
        { id: "0-1", a: 0, b: 1 },
        { id: "2-3", a: 2, b: 3 },
      ],
      regions: [
        { id: "r0", cells: [{ r: 0, c: 0 }], rule: { type: "sum", target: 0 }, colorIndex: 0 },
        { id: "r1", cells: [{ r: 0, c: 1 }], rule: { type: "sum", target: 1 }, colorIndex: 1 },
        { id: "r2", cells: [{ r: 1, c: 0 }], rule: { type: "sum", target: 2 }, colorIndex: 2 },
        { id: "r3", cells: [{ r: 1, c: 1 }], rule: { type: "sum", target: 3 }, colorIndex: 3 },
      ],
      solution: [],
    };

    expect(countPipsSolutions(puzzle, 2, 10_000)).toBe(1);
  });

  it("returns zero for an impossible tiny puzzle", () => {
    const impossible = generatePuzzle("easy", mulberry32(123));
    impossible.regions = impossible.cells.map((cell, index) => ({
      id: `r${index}`,
      cells: [cell],
      rule: { type: "sum", target: 99 },
      colorIndex: index,
    }));

    expect(countPipsSolutions(impossible, 2, 10_000)).toBe(0);
  });
});

describe("run time scoring helpers", () => {
  it("uses elapsed time as the score metric", () => {
    expect(getRunScoreTime(1234.9)).toBe(1234);
    expect(getRunScoreTime(-5)).toBe(0);
  });

  it("sorts lower run times first", () => {
    expect(compareRunTimes(1000, 2000)).toBeLessThan(0);
    expect(compareRunTimes(3000, 2000)).toBeGreaterThan(0);
  });
});

function isConnectedCells(puzzle: PipsPuzzle): boolean {
  const active = new Set(puzzle.cells.map(cellKey));
  const seen = new Set<string>();
  const queue = [puzzle.cells[0]!];
  seen.add(cellKey(queue[0]!));

  while (queue.length > 0) {
    const cell = queue.shift()!;
    for (const neighbor of [
      { r: cell.r - 1, c: cell.c },
      { r: cell.r + 1, c: cell.c },
      { r: cell.r, c: cell.c - 1 },
      { r: cell.r, c: cell.c + 1 },
    ]) {
      const key = cellKey(neighbor);
      if (!active.has(key) || seen.has(key)) continue;
      seen.add(key);
      queue.push(neighbor);
    }
  }

  return seen.size === active.size;
}

function cellKey(cell: { r: number; c: number }): string {
  return `${cell.r},${cell.c}`;
}

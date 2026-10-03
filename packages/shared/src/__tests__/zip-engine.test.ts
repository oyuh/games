import { describe, it, expect } from "bun:test";
import { generatePuzzle, validatePath, mulberry32, GRID_SIZES, DIFFICULTY_CONFIG, type Difficulty, type ZipPuzzle } from "../games/zip-engine";

describe("generatePuzzle", () => {
  it("builds a board its own solution solves, for every size and difficulty", () => {
    for (const size of GRID_SIZES) {
      for (const difficulty of Object.keys(DIFFICULTY_CONFIG) as Difficulty[]) {
        const puzzle = generatePuzzle(size, difficulty, mulberry32(size * 7 + difficulty.length));
        expect(puzzle.size).toBe(size);
        expect(puzzle.checkpoints[0]).toBe(puzzle.solution[0]!);
        expect(validatePath(puzzle, puzzle.solution)).toBe(true);
      }
    }
  });

  it("is deterministic for a seed", () => {
    expect(generatePuzzle(8, "hard", mulberry32(42))).toEqual(generatePuzzle(8, "hard", mulberry32(42)));
  });
});

describe("validatePath", () => {
  // 3x3 board: 0 1 2 / 3 4 5 / 6 7 8, serpentine solution.
  const board = (overrides: Partial<ZipPuzzle> = {}): ZipPuzzle => ({
    size: 3,
    checkpoints: [0, 5, 8],
    walls: [],
    solution: [0, 1, 2, 5, 4, 3, 6, 7, 8],
    ...overrides,
  });
  const snake = [0, 1, 2, 5, 4, 3, 6, 7, 8];

  it("accepts any legal path, not only the stored solution", () => {
    expect(validatePath(board({ checkpoints: [0, 8] }), [0, 3, 6, 7, 4, 1, 2, 5, 8])).toBe(true);
  });

  it("rejects paths that break a rule", () => {
    expect(validatePath(board(), snake)).toBe(true);
    expect(validatePath(board({ checkpoints: [0, 4, 5, 8] }), snake)).toBe(false); // checkpoints out of order
    expect(validatePath(board({ walls: [[1, 2]] }), snake)).toBe(false); // crosses a wall
    expect(validatePath(board(), snake.slice(0, 8))).toBe(false); // misses a cell
    expect(validatePath(board(), [0, 1, 2, 5, 4, 3, 7, 6, 8])).toBe(false); // diagonal jump
  });
});

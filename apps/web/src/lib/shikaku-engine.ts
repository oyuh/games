/**
 * Shikaku puzzle engine — generation, validation, and seeded PRNG.
 *
 * A Shikaku puzzle is a grid where numbered cells must be covered by
 * non-overlapping rectangles whose area equals the number inside them.
 * Every cell must be covered by exactly one rectangle.
 */

/* ── Seeded PRNG (mulberry32) ──────────────────────────────── */
export function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Types ─────────────────────────────────────────────────── */
export interface Rect {
  r: number; // top-left row
  c: number; // top-left col
  w: number; // width (cols)
  h: number; // height (rows)
}

export interface NumberCell {
  r: number;
  c: number;
  value: number;
}

export interface ShikakuPuzzle {
  rows: number;
  cols: number;
  numbers: NumberCell[];
  /** The solution rectangles (hidden from player, used for verification) */
  solution: Rect[];
}

export interface PlacedRect extends Rect {
  colorIndex: number;
}

export type Difficulty = "easy" | "medium" | "hard" | "expert";

export const DIFFICULTY_CONFIG: Record<Difficulty, { rows: number; cols: number; label: string }> = {
  easy:   { rows: 5,  cols: 5,  label: "5×5" },
  medium: { rows: 9,  cols: 9,  label: "9×9" },
  hard:   { rows: 15, cols: 15, label: "15×15" },
  expert: { rows: 22, cols: 22, label: "22×22" },
};

export const PUZZLES_PER_RUN = 5;

/* ── Puzzle generator ──────────────────────────────────────── */

/**
 * Generate a single Shikaku puzzle from a seed.
 * Strategy: randomly partition the grid into rectangles, place numbers,
 * then verify uniqueness by checking the solver finds exactly one solution.
 */
export function generatePuzzle(rows: number, cols: number, rng: () => number): ShikakuPuzzle {
  // Scale max rect area with grid size for more interesting puzzles
  const maxArea = rows <= 5 ? 10 : rows <= 9 ? 16 : rows <= 15 ? 25 : 36;
  // Iteration budget for uniqueness solver scales with grid size
  const solverBudget = rows <= 5 ? 500_000 : rows <= 9 ? 200_000 : rows <= 15 ? 50_000 : 10_000;
  // Try until we get a valid, uniquely solvable puzzle
  for (let attempt = 0; attempt < 80; attempt++) {
    const result = tryGeneratePuzzle(rows, cols, rng, maxArea);
    if (!result) continue;
    // Sanity-check: generated solution must pass validation
    if (!validateSolution(result, result.solution)) continue;
    // Verify unique solution (skip for huge grids if budget exhausted)
    const solveResult = countSolutions(result, 2, solverBudget);
    if (solveResult === 1) return result; // uniquely solvable!
    // If solver hit budget limit, accept puzzle (still solvable by construction)
    if (solveResult === -1) return result;
    // Otherwise has 0 or 2+ solutions — retry
  }
  // Fallback: very simple grid of 1×1 cells
  const numbers: NumberCell[] = [];
  const solution: Rect[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      numbers.push({ r, c, value: 1 });
      solution.push({ r, c, w: 1, h: 1 });
    }
  }
  return { rows, cols, numbers, solution };
}

function tryGeneratePuzzle(rows: number, cols: number, rng: () => number, maxArea: number): ShikakuPuzzle | null {
  const grid = Array.from({ length: rows }, () => new Int8Array(cols).fill(-1));
  const rects: Rect[] = [];
  let rectId = 0;

  // Fill grid with random rectangles
  const cellOrder: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cellOrder.push([r, c]);
    }
  }
  // Shuffle cell order
  for (let i = cellOrder.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cellOrder[i], cellOrder[j]] = [cellOrder[j], cellOrder[i]];
  }

  for (const [r, c] of cellOrder) {
    if (grid[r][c] !== -1) continue;

    // Try to place a rectangle starting at (r, c)
    const candidates = getRectCandidates(r, c, rows, cols, grid, maxArea);
    if (candidates.length === 0) continue;

    // Pick a random candidate, biased toward larger ones
    shuffleArray(candidates, rng);
    // Sort by area descending, then pick from top few
    candidates.sort((a, b) => (b.w * b.h) - (a.w * a.h));
    const pickIdx = Math.floor(rng() * Math.min(3, candidates.length));
    const rect = candidates[pickIdx];

    // Place rectangle
    for (let dr = 0; dr < rect.h; dr++) {
      for (let dc = 0; dc < rect.w; dc++) {
        grid[rect.r + dr][rect.c + dc] = rectId;
      }
    }
    rects.push(rect);
    rectId++;
  }

  // Fill any remaining uncovered cells as 1×1
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === -1) {
        grid[r][c] = rectId;
        rects.push({ r, c, w: 1, h: 1 });
        rectId++;
      }
    }
  }

  // Place numbers: one number per rectangle, at a random cell within it
  const numbers: NumberCell[] = [];
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    const area = rect.w * rect.h;
    // Pick random position within rect
    const dr = Math.floor(rng() * rect.h);
    const dc = Math.floor(rng() * rect.w);
    numbers.push({ r: rect.r + dr, c: rect.c + dc, value: area });
  }

  return { rows, cols, numbers, solution: rects };
}

function getRectCandidates(startR: number, startC: number, rows: number, cols: number, grid: Int8Array[], maxArea: number): Rect[] {
  const candidates: Rect[] = [];
  const maxH = rows - startR;
  const maxW = cols - startC;
  const areaLimit = Math.min(maxH * maxW, maxArea);

  for (let h = 1; h <= maxH; h++) {
    for (let w = 1; w <= maxW; w++) {
      if (h * w > areaLimit) break;
      if (h * w < 2 && (maxH > 1 || maxW > 1)) continue; // avoid too many 1×1s unless forced

      // Check all cells are uncovered
      let valid = true;
      for (let dr = 0; dr < h && valid; dr++) {
        for (let dc = 0; dc < w && valid; dc++) {
          if (grid[startR + dr][startC + dc] !== -1) valid = false;
        }
      }
      if (valid) {
        candidates.push({ r: startR, c: startC, w, h });
      }
    }
  }

  return candidates;
}

function shuffleArray<T>(arr: T[], rng: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/* ── Puzzle generation from seed ───────────────────────────── */

/**
 * Generate a full run of puzzles from a single seed + difficulty.
 * Returns `PUZZLES_PER_RUN` puzzles.
 */
export function generateRun(seed: number, difficulty: Difficulty): ShikakuPuzzle[] {
  const { rows, cols } = DIFFICULTY_CONFIG[difficulty];
  const rng = mulberry32(seed);
  const puzzles: ShikakuPuzzle[] = [];
  for (let i = 0; i < PUZZLES_PER_RUN; i++) {
    puzzles.push(generatePuzzle(rows, cols, rng));
  }
  return puzzles;
}

/* ── Validation ────────────────────────────────────────────── */

/**
 * Check if a set of placed rectangles solves the puzzle.
 */
export function validateSolution(puzzle: ShikakuPuzzle, rects: Rect[]): boolean {
  const { rows, cols, numbers } = puzzle;

  // Build coverage grid
  const grid = Array.from({ length: rows }, () => new Int8Array(cols).fill(-1));

  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    // Bounds check
    if (rect.r < 0 || rect.c < 0 || rect.r + rect.h > rows || rect.c + rect.w > cols) return false;

    for (let dr = 0; dr < rect.h; dr++) {
      for (let dc = 0; dc < rect.w; dc++) {
        const gr = rect.r + dr;
        const gc = rect.c + dc;
        if (grid[gr][gc] !== -1) return false; // overlap
        grid[gr][gc] = i;
      }
    }
  }

  // All cells must be covered
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === -1) return false;
    }
  }

  // Each rectangle must contain exactly one number, and the area must match
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    const area = rect.w * rect.h;
    const containedNumbers = numbers.filter(
      (n) => n.r >= rect.r && n.r < rect.r + rect.h && n.c >= rect.c && n.c < rect.c + rect.w
    );
    if (containedNumbers.length !== 1) return false;
    if (containedNumbers[0].value !== area) return false;
  }

  return true;
}

/* ── Scoring ───────────────────────────────────────────────── */

const DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = {
  easy: 1,
  medium: 1.5,
  hard: 2.2,
  expert: 3,
};

/**
 * Calculate score from total solve time.
 * Higher score = faster solve. Base points per puzzle ~1000, scaled by difficulty.
 * Score = basePoints * diffMultiplier * timeBonus
 * timeBonus = max(0.1, 2 - (timeMs / parTimeMs))
 * Par time per puzzle by difficulty: easy 30s, medium 60s, hard 90s, expert 120s
 */
export function calculateScore(timeMs: number, difficulty: Difficulty): number {
  const parTimes: Record<Difficulty, number> = {
    easy: 30_000,
    medium: 60_000,
    hard: 90_000,
    expert: 120_000,
  };

  const totalParMs = parTimes[difficulty] * PUZZLES_PER_RUN;
  const timeBonus = Math.max(0.1, 2 - timeMs / totalParMs);
  const basePoints = 1000 * PUZZLES_PER_RUN;
  const score = Math.round(basePoints * DIFFICULTY_MULTIPLIER[difficulty] * timeBonus);
  return Math.max(0, score);
}

/* ── Solver — verify unique solvability ────────────────────── */

/**
 * Count solutions for a Shikaku puzzle using backtracking with
 * constraint propagation. Returns the count (capped at `maxCount`),
 * or -1 if the iteration budget was exhausted.
 */
function countSolutions(puzzle: ShikakuPuzzle, maxCount: number, iterBudget: number): number {
  const { rows, cols, numbers } = puzzle;
  const grid = new Uint8Array(rows * cols); // 0 = free, 1 = occupied
  const assigned = new Uint8Array(numbers.length);
  let solutions = 0;
  let iters = 0;

  const idx = (r: number, c: number) => r * cols + c;

  function canPlace(r: number, c: number, w: number, h: number): boolean {
    for (let dr = 0; dr < h; dr++)
      for (let dc = 0; dc < w; dc++)
        if (grid[idx(r + dr, c + dc)]) return false;
    return true;
  }

  function place(r: number, c: number, w: number, h: number) {
    for (let dr = 0; dr < h; dr++)
      for (let dc = 0; dc < w; dc++)
        grid[idx(r + dr, c + dc)] = 1;
  }

  function unplace(r: number, c: number, w: number, h: number) {
    for (let dr = 0; dr < h; dr++)
      for (let dc = 0; dc < w; dc++)
        grid[idx(r + dr, c + dc)] = 0;
  }

  function getOptions(ni: number): Rect[] {
    const n = numbers[ni];
    const area = n.value;
    const rects: Rect[] = [];
    for (let h = 1; h <= Math.min(area, rows); h++) {
      if (area % h !== 0) continue;
      const w = area / h;
      if (w > cols) continue;
      for (let r = Math.max(0, n.r - h + 1); r <= n.r && r + h <= rows; r++) {
        for (let c = Math.max(0, n.c - w + 1); c <= n.c && c + w <= cols; c++) {
          if (!canPlace(r, c, w, h)) continue;
          // No other unassigned number inside this rect
          let conflict = false;
          for (let oi = 0; oi < numbers.length; oi++) {
            if (oi === ni || assigned[oi]) continue;
            const o = numbers[oi];
            if (o.r >= r && o.r < r + h && o.c >= c && o.c < c + w) {
              conflict = true;
              break;
            }
          }
          if (!conflict) rects.push({ r, c, w, h });
        }
      }
    }
    return rects;
  }

  function solve(): void {
    if (solutions >= maxCount || iters >= iterBudget) return;
    iters++;

    // Pick unassigned number with fewest options (MRV heuristic)
    let bestNi = -1;
    let bestOpts: Rect[] = [];
    let bestCount = Infinity;
    for (let ni = 0; ni < numbers.length; ni++) {
      if (assigned[ni]) continue;
      const opts = getOptions(ni);
      if (opts.length === 0) return; // dead end
      if (opts.length < bestCount) {
        bestCount = opts.length;
        bestNi = ni;
        bestOpts = opts;
      }
    }

    if (bestNi === -1) {
      // All numbers assigned — check full coverage
      for (let i = 0; i < rows * cols; i++)
        if (!grid[i]) return;
      solutions++;
      return;
    }

    assigned[bestNi] = 1;
    for (const rect of bestOpts) {
      place(rect.r, rect.c, rect.w, rect.h);
      solve();
      unplace(rect.r, rect.c, rect.w, rect.h);
      if (solutions >= maxCount || iters >= iterBudget) break;
    }
    assigned[bestNi] = 0;
  }

  solve();
  return iters >= iterBudget ? -1 : solutions;
}

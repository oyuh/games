/**
 * Zip puzzle engine: generation and validation.
 *
 * A Zip puzzle is a square grid with numbered checkpoints and optional walls
 * between cells. The player draws one path that starts on 1, visits every
 * checkpoint in order, ends on the highest number, never crosses a wall, and
 * fills every cell exactly once.
 *
 * Cells are addressed by index: `r * size + c`.
 */

import { mulberry32 } from "./shikaku-engine";

export { mulberry32 };

/* ── Types ─────────────────────────────────────────────────── */
export interface ZipPuzzle {
  size: number;
  /** Cell index of each checkpoint, in order. checkpoints[0] is "1". */
  checkpoints: number[];
  /** Blocked edges between orthogonal neighbors, each stored as [lower, higher]. */
  walls: [number, number][];
  /** The intended path (hidden from player, used for hints and verification). */
  solution: number[];
}

export type Difficulty = "easy" | "medium" | "hard" | "expert";

export const GRID_SIZES = [6, 8, 10, 12] as const;
export type GridSize = (typeof GRID_SIZES)[number];

/**
 * Each difficulty plays at one size, so a difficulty is a whole board.
 * `clueDensity` is the share of cells seeded as checkpoints before the
 * uniqueness pass, as a [min, max] range rolled per puzzle (most are fixed).
 * `wallChance` is how often that pass resolves an ambiguity with a wall
 * instead of another checkpoint.
 */
export const DIFFICULTY_CONFIG: Record<Difficulty, { size: GridSize; clueDensity: readonly [number, number]; wallChance: number; label: string }> = {
  easy:   { size: 6,  clueDensity: [0.3, 0.3],   wallChance: 0,    label: "Easy" },
  medium: { size: 8,  clueDensity: [0.2, 0.2],   wallChance: 0.35, label: "Medium" },
  hard:   { size: 10, clueDensity: [0.12, 0.12], wallChance: 0.7,  label: "Hard" },
  expert: { size: 12, clueDensity: [0.04, 0.16], wallChance: 0.7,  label: "Expert" },
};

/** Puzzles in a ranked or seeded run, at every difficulty. */
export const RUN_LENGTH = 3;

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === "string" && value in DIFFICULTY_CONFIG;
}

export function isGridSize(value: unknown): value is GridSize {
  return GRID_SIZES.includes(value as GridSize);
}

/* ── Grid helpers ──────────────────────────────────────────── */
function neighborsOf(cell: number, size: number): number[] {
  const r = Math.floor(cell / size);
  const c = cell % size;
  const out: number[] = [];
  if (r > 0) out.push(cell - size);
  if (r < size - 1) out.push(cell + size);
  if (c > 0) out.push(cell - 1);
  if (c < size - 1) out.push(cell + 1);
  return out;
}

const wallKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** True when `b` is an orthogonal neighbor of `a` with no wall between them. */
export function canStep(puzzle: ZipPuzzle, a: number, b: number): boolean {
  if (!neighborsOf(a, puzzle.size).includes(b)) return false;
  const key = wallKey(a, b);
  return !puzzle.walls.some(([x, y]) => wallKey(x, y) === key);
}

/* ── Colors ─────────────────────────────────────────────────── */

/* One color per stretch of line between two numbers, ordered so neighbors
   never look alike. Past twelve stretches it cycles. */
const SEGMENT_COLORS = [
  "#facc15", "#60a5fa", "#f472b6", "#34d399", "#fb923c", "#a78bfa",
  "#22d3ee", "#f87171", "#a3e635", "#e879f9", "#2dd4bf", "#fda4af",
];

/** The color of the stretch from number `k + 1` to number `k + 2`. */
export function segmentColor(k: number): string {
  return SEGMENT_COLORS[k % SEGMENT_COLORS.length]!;
}

/**
 * Splits the path into one run of cells per stretch. Each run starts on its
 * number and ends on the next, so the runs meet under the balls.
 */
export function pathSegments(puzzle: ZipPuzzle, path: number[]): number[][] {
  const runs: number[][] = [];
  let k = -1;
  for (const cell of path) {
    if (cell === puzzle.checkpoints[k + 1]) {
      runs[k]?.push(cell);
      k++;
      runs[k] = [cell];
    } else {
      runs[k]?.push(cell);
    }
  }
  return runs;
}

/* ── Validation ────────────────────────────────────────────── */

/** Check whether a drawn path solves the puzzle. */
export function validatePath(puzzle: ZipPuzzle, path: number[]): boolean {
  const { size, checkpoints } = puzzle;
  const total = size * size;
  if (path.length !== total) return false;
  if (path[0] !== checkpoints[0] || path[total - 1] !== checkpoints[checkpoints.length - 1]) return false;

  const blocked = new Set(puzzle.walls.map(([a, b]) => wallKey(a, b)));
  const cpIndex = new Int16Array(total).fill(-1);
  checkpoints.forEach((cell, i) => (cpIndex[cell] = i));
  const seen = new Uint8Array(total);
  let nextCheckpoint = 0;
  for (let i = 0; i < total; i++) {
    const cell = path[i]!;
    if (!Number.isInteger(cell) || cell < 0 || cell >= total || seen[cell]) return false;
    seen[cell] = 1;
    if (i > 0) {
      const prev = path[i - 1]!;
      if (!neighborsOf(prev, size).includes(cell) || blocked.has(wallKey(prev, cell))) return false;
    }
    const cp = cpIndex[cell]!;
    if (cp !== -1) {
      if (cp !== nextCheckpoint) return false;
      nextCheckpoint++;
    }
  }
  return nextCheckpoint === checkpoints.length;
}

/* ── Puzzle generator ──────────────────────────────────────── */

/**
 * Random Hamiltonian path via backbite moves: start from a serpentine and
 * repeatedly reattach one end to a random neighbor, reversing the tail.
 * Every move keeps a valid path, so this never fails or backtracks.
 */
function randomHamiltonianPath(size: number, rng: () => number): number[] {
  const total = size * size;
  const path: number[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) path.push(r * size + (r % 2 === 0 ? c : size - 1 - c));
  }
  const pos = new Int32Array(total);
  path.forEach((cell, i) => (pos[cell] = i));

  const reverse = (from: number, to: number) => {
    for (let i = from, j = to; i < j; i++, j--) {
      const t = path[i]!;
      path[i] = path[j]!;
      path[j] = t;
      pos[path[i]!] = i;
      pos[path[j]!] = j;
    }
  };

  // ponytail: fixed move count, mixes well up to 12×12; scale it if larger grids are added
  const moves = total * total;
  for (let m = 0; m < moves; m++) {
    if (rng() < 0.5) reverse(0, total - 1);
    const end = path[total - 1]!;
    const options = neighborsOf(end, size);
    const target = options[Math.floor(rng() * options.length)]!;
    const i = pos[target]!;
    if (i === total - 2) continue;
    reverse(i + 1, total - 1);
  }
  return path;
}

const SOLVER_BUDGET = 600_000;

/**
 * Generate a single Zip puzzle, unique whenever the solver can prove it.
 * Strategy: draw a random full path, seed checkpoints along it, then run the
 * solver. Each time it finds a second solution, add a checkpoint or wall that
 * rules that solution out, until the intended path is the only one left or
 * the solver budget runs out.
 */
export function generatePuzzle(size: GridSize, difficulty: Difficulty, rng: () => number): ZipPuzzle {
  const { clueDensity: [minDensity, maxDensity], wallChance } = DIFFICULTY_CONFIG[difficulty];
  const total = size * size;
  const solution = randomHamiltonianPath(size, rng);
  // Only a ranged difficulty rolls, so fixed ones keep their old seeds' boards.
  const clueDensity = minDensity === maxDensity ? minDensity : minDensity + rng() * (maxDensity - minDensity);

  const isCheckpoint = new Uint8Array(total); // indexed by path position
  isCheckpoint[0] = 1;
  isCheckpoint[total - 1] = 1;
  const interior = Array.from({ length: total - 2 }, (_, i) => i + 1);
  shuffleArray(interior, rng);
  const seedCount = Math.max(0, Math.round(total * clueDensity) - 2);
  for (const i of interior.slice(0, seedCount)) isCheckpoint[i] = 1;

  const puzzle: ZipPuzzle = { size, checkpoints: [], walls: [], solution };
  const syncCheckpoints = () => {
    puzzle.checkpoints = solution.filter((_, i) => isCheckpoint[i]);
  };
  syncCheckpoints();

  const solutionEdges = new Set<string>();
  for (let i = 1; i < total; i++) solutionEdges.add(wallKey(solution[i - 1]!, solution[i]!));


  // ponytail: shared node budget, so big grids may ship with extra solutions;
  // validatePath accepts any legal path, so that only costs puzzle quality
  let budget = SOLVER_BUDGET;
  for (;;) {
    const { solutions, nodes } = findSolutions(puzzle, 2, budget);
    budget -= nodes;
    const alt = solutions.find((s) => s.some((cell, i) => cell !== solution[i]));
    if (!alt) return puzzle; // unique, or out of budget

    // Alternates can match every unnumbered cell's position and differ only
    // on checkpoints, so a wall is the fallback when no free cell differs.
    const diffs = interior.filter((i) => !isCheckpoint[i] && alt[i] !== solution[i]);
    if (diffs.length === 0 || rng() < wallChance) {
      const altEdges: [number, number][] = [];
      for (let i = 1; i < total; i++) {
        const a = alt[i - 1]!;
        const b = alt[i]!;
        if (!solutionEdges.has(wallKey(a, b))) altEdges.push(a < b ? [a, b] : [b, a]);
      }
      puzzle.walls.push(altEdges[Math.floor(rng() * altEdges.length)]!);
      continue;
    }

    // Prefer a checkpoint that breaks the alternate path outright.
    shuffleArray(diffs, rng);
    let pick = diffs[0]!;
    for (const i of diffs) {
      isCheckpoint[i] = 1;
      syncCheckpoints();
      const breaks = !validatePath(puzzle, alt);
      isCheckpoint[i] = 0;
      if (breaks) {
        pick = i;
        break;
      }
    }
    isCheckpoint[pick] = 1;
    syncCheckpoints();
  }
}

function shuffleArray<T>(arr: T[], rng: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const current = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = current;
  }
}

/* ── Runs ──────────────────────────────────────────────────── */

/**
 * Every puzzle in a run, from one seed. The client and the server both call
 * this, so a seed always means the same boards on both sides.
 */
export function generateRun(seed: number, difficulty: Difficulty): ZipPuzzle[] {
  const rng = mulberry32(seed);
  const { size } = DIFFICULTY_CONFIG[difficulty];
  return Array.from({ length: RUN_LENGTH }, () => generatePuzzle(size, difficulty, rng));
}

/* ── Ranked replay validation ──────────────────────────────── */

export interface ZipReplayData {
  /** Milliseconds spent on each puzzle, in run order. */
  puzzleTimes: number[];
  /** The path drawn on each puzzle, as cell indices. */
  paths: number[][];
}

export type ZipRankedValidationCode =
  | "invalid-seed"
  | "invalid-difficulty"
  | "invalid-time"
  | "invalid-puzzle-count"
  | "invalid-replay"
  | "non-canonical-solution";

export type ZipRankedValidationResult =
  | { ok: true; replayData: ZipReplayData }
  | { ok: false; code: ZipRankedValidationCode; reason: string };

/**
 * Rebuild a ranked run from its seed and check the submitted replay against
 * it. This is the server's anti-tamper check: a ranked time has to come with
 * a legal path on every canonical board, and split times that add up.
 */
export function validateRankedZipRun(args: {
  seed: number;
  difficulty: unknown;
  timeMs: number;
  puzzleCount: number;
  replayData: unknown;
  timeToleranceMs?: number;
}): ZipRankedValidationResult {
  const { seed, difficulty, timeMs, puzzleCount, replayData, timeToleranceMs = 2_000 } = args;

  if (!Number.isInteger(seed) || seed <= 0 || seed > 2_147_483_647) {
    return { ok: false, code: "invalid-seed", reason: "Ranked Zip runs need a positive 32-bit seed." };
  }
  if (!isDifficulty(difficulty)) {
    return { ok: false, code: "invalid-difficulty", reason: "Ranked Zip runs need a known difficulty." };
  }
  if (!Number.isInteger(timeMs) || timeMs <= 0) {
    return { ok: false, code: "invalid-time", reason: "Ranked Zip runs need a positive whole-millisecond time." };
  }
  const length = RUN_LENGTH;
  if (puzzleCount !== length) {
    return { ok: false, code: "invalid-puzzle-count", reason: `Ranked runs are ${length} puzzles.` };
  }

  const replay = readReplay(replayData);
  if (!replay || replay.paths.length !== length || replay.puzzleTimes.length !== length) {
    return { ok: false, code: "invalid-replay", reason: `The replay doesn't hold exactly ${length} solved puzzles.` };
  }
  const splitTotal = replay.puzzleTimes.reduce((total, value) => total + value, 0);
  if (replay.puzzleTimes.some((value) => value <= 0) || Math.abs(splitTotal - timeMs) > timeToleranceMs) {
    return { ok: false, code: "invalid-time", reason: "The puzzle times don't add up to the submitted total." };
  }

  const run = generateRun(seed, difficulty);
  for (let i = 0; i < run.length; i++) {
    if (!validatePath(run[i]!, replay.paths[i]!)) {
      return { ok: false, code: "non-canonical-solution", reason: `Puzzle ${i + 1} wasn't solved on the canonical board.` };
    }
  }
  return { ok: true, replayData: replay };
}

/** Untrusted JSON in, concrete replay out. Anything off-shape is null. */
function readReplay(value: unknown): ZipReplayData | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const { puzzleTimes, paths } = value as Record<string, unknown>;
  if (!Array.isArray(puzzleTimes) || !Array.isArray(paths)) return null;
  if (!puzzleTimes.every(Number.isInteger)) return null;
  if (!paths.every((path) => Array.isArray(path) && path.every(Number.isInteger))) return null;
  return { puzzleTimes: puzzleTimes as number[], paths: paths as number[][] };
}

/* ── Solver ────────────────────────────────────────────────── */

/**
 * Depth-first search for up to `limit` solutions. Prunes on checkpoint order,
 * disconnected leftovers, and stranded cells (a cell with one way in must be
 * the final checkpoint). Stops early once `budget` nodes have been searched.
 *
 * Both prunes run incrementally. On a grid, moving the head from `h` to `n`
 * only lowers the open-neighbor count of `h`'s unvisited neighbors (`h` and
 * `n` share no neighbors), and it can only split the board if one of those
 * neighbors is cut off from `n`. So each step checks at most 3 cells and runs
 * a flood fill that stops once it reaches them.
 */
function findSolutions(puzzle: ZipPuzzle, limit: number, budget: number): { solutions: number[][]; nodes: number } {
  const { size, checkpoints } = puzzle;
  const total = size * size;
  const start = checkpoints[0]!;
  const lastCell = checkpoints[checkpoints.length - 1]!;
  const lastCp = checkpoints.length - 1;

  const cpIndex = new Int16Array(total).fill(-1);
  checkpoints.forEach((cell, i) => (cpIndex[cell] = i));

  // Flat adjacency: cell's open neighbors live at adj[cell * 4 .. cell * 4 + deg[cell]).
  const blocked = new Set(puzzle.walls.map(([a, b]) => wallKey(a, b)));
  const adj = new Int16Array(total * 4);
  const deg = new Uint8Array(total);
  for (let cell = 0; cell < total; cell++) {
    const links = neighborsOf(cell, size).filter((n) => !blocked.has(wallKey(cell, n)));
    links.forEach((n, i) => (adj[cell * 4 + i] = n));
    deg[cell] = links.length;
  }

  const visited = new Uint8Array(total);
  const open = new Uint8Array(deg); // unvisited neighbors per cell
  const path = new Int16Array(total);
  let length = 0;
  const solutions: number[][] = [];
  const queue = new Int16Array(total);
  const mark = new Int32Array(total);
  let stamp = 0;
  let nodes = 0;

  const visit = (cell: number) => {
    visited[cell] = 1;
    for (let k = cell * 4, end = k + deg[cell]!; k < end; k++) open[adj[k]!] = open[adj[k]!]! - 1;
    path[length++] = cell;
  };
  const unvisit = (cell: number) => {
    visited[cell] = 0;
    for (let k = cell * 4, end = k + deg[cell]!; k < end; k++) open[adj[k]!] = open[adj[k]!]! + 1;
    length--;
  };

  // Called after the head moved from `from` to `head`.
  function viable(from: number, head: number): boolean {
    let pending = 0;
    stamp++;
    for (let k = from * 4, end = k + deg[from]!; k < end; k++) {
      const u = adj[k]!;
      if (visited[u]) continue;
      if (open[u] === 0 || (open[u] === 1 && u !== lastCell)) return false;
      mark[u] = -stamp; // flood-fill target
      pending++;
    }
    if (pending === 0) return true;

    let read = 0;
    let write = 0;
    queue[write++] = head;
    mark[head] = stamp;
    while (read < write) {
      const cell = queue[read++]!;
      for (let k = cell * 4, end = k + deg[cell]!; k < end; k++) {
        const n = adj[k]!;
        if (visited[n] || mark[n] === stamp) continue;
        if (mark[n] === -stamp && --pending === 0) return true;
        mark[n] = stamp;
        queue[write++] = n;
      }
    }
    return false;
  }

  function dfs(head: number, nextCp: number): void {
    nodes++;
    if (length === total) {
      if (head === lastCell) solutions.push(Array.from(path));
      return;
    }

    // Try the most boxed-in neighbor first (Warnsdorff's rule). It finds
    // paths fast, so a second solution surfaces long before the budget runs out.
    const moves: number[] = [];
    for (let k = head * 4, end = k + deg[head]!; k < end; k++) {
      const n = adj[k]!;
      if (visited[n]) continue;
      const cp = cpIndex[n]!;
      if (cp !== -1 && cp !== nextCp) continue;
      if (cp === lastCp && length + 1 !== total) continue;
      moves.push(n);
    }
    moves.sort((a, b) => open[a]! - open[b]!);

    for (const n of moves) {
      const cp = cpIndex[n]!;
      visit(n);
      if (viable(head, n)) dfs(n, cp === -1 ? nextCp : nextCp + 1);
      unvisit(n);
      if (solutions.length >= limit || nodes >= budget) return;
    }
  }

  visit(start);
  // The incremental checks assume the starting board has no stranded cells.
  for (let cell = 0; cell < total; cell++) {
    if (visited[cell]) continue;
    let ways = open[cell]!;
    for (let k = cell * 4, end = k + deg[cell]!; k < end; k++) if (adj[k] === start) ways++;
    if (ways === 0 || (ways === 1 && cell !== lastCell)) return { solutions, nodes };
  }
  dfs(start, 1);
  return { solutions, nodes };
}

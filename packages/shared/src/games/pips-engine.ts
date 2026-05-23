/**
 * Pips puzzle engine - generation, validation, seeded PRNG, and solver checks.
 *
 * A Pips puzzle is a board of active square cells tiled by dominoes. Each
 * domino covers two orthogonally adjacent cells. Colored regions define rules
 * over the pip values assigned to their cells.
 */

/* -- Seeded PRNG (mulberry32) -------------------------------- */
export function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -- Types ---------------------------------------------------- */
export type PipsDifficulty = "easy" | "medium" | "hard";

export interface PipsCell {
  r: number;
  c: number;
}

export interface PipsDomino {
  id: string;
  a: number;
  b: number;
}

export type PipsRegionRule =
  | { type: "sum"; target: number }
  | { type: "greaterThan"; target: number }
  | { type: "lessThan"; target: number }
  | { type: "equal" }
  | { type: "different" };

export interface PipsRegion {
  id: string;
  cells: PipsCell[];
  rule: PipsRegionRule;
  colorIndex: number;
}

export interface PipsPlacement {
  dominoId: string;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  /**
   * false: first cell receives domino.a, second receives domino.b.
   * true: first cell receives domino.b, second receives domino.a.
   */
  flipped: boolean;
}

export interface PipsPuzzle {
  difficulty: PipsDifficulty;
  rows: number;
  cols: number;
  cells: PipsCell[];
  dominoes: PipsDomino[];
  regions: PipsRegion[];
  /** Hidden solved placement. UI should not rely on this during play. */
  solution: PipsPlacement[];
}

export interface PipsRun {
  seed: number;
  puzzles: PipsPuzzle[];
}

export const PIPS_RUN_DIFFICULTIES: PipsDifficulty[] = ["easy", "medium", "hard"];

export const PIPS_DIFFICULTY_CONFIG: Record<
  PipsDifficulty,
  { rows: number; cols: number; dominoes: number; label: string }
> = {
  easy: { rows: 4, cols: 5, dominoes: 6, label: "Easy" },
  medium: { rows: 6, cols: 6, dominoes: 10, label: "Medium" },
  hard: { rows: 7, cols: 9, dominoes: 15, label: "Hard" },
};

export const PIPS_PUZZLES_PER_RUN = PIPS_RUN_DIFFICULTIES.length;

/* -- Generation ---------------------------------------------- */
/**
 * Generate a complete ranked-style Pips run from one seed.
 *
 * The same PRNG stream is shared across Easy, Medium, and Hard so the run is
 * deterministic from the public seed. This is what lets the API rebuild a run
 * later and compare a submitted replay against the canonical board.
 */
export function generateRun(seed: number): PipsRun {
  const rng = mulberry32(seed);
  return {
    seed,
    puzzles: PIPS_RUN_DIFFICULTIES.map((difficulty) => generatePuzzle(difficulty, rng)),
  };
}

/**
 * Build one puzzle for a difficulty:
 * 1. grow an irregular even-cell board as hidden domino pairs,
 * 2. choose domino values,
 * 3. derive a solved value grid,
 * 4. partition visible regions and attach rules that the solution satisfies.
 */
export function generatePuzzle(difficulty: PipsDifficulty, rng: () => number): PipsPuzzle {
  const config = PIPS_DIFFICULTY_CONFIG[difficulty];
  const shape = generateIrregularDominoShape(config.rows, config.cols, config.dominoes, rng);
  const cells = shape.cells;
  const cellPairs = shape.pairs;
  const dominoes = pickDominoSet(config.dominoes, rng);

  const solution = cellPairs.map((pair, index) => ({
    dominoId: dominoes[index]!.id,
    r1: pair[0].r,
    c1: pair[0].c,
    r2: pair[1].r,
    c2: pair[1].c,
    flipped: rng() < 0.5,
  }));

  const valueGrid = getPlacementValueGrid(
    { difficulty, rows: shape.rows, cols: shape.cols, cells, dominoes, regions: [], solution },
    solution,
  );
  if (!valueGrid) return generatePuzzle(difficulty, rng);
  const regions = generateRegions(cells, valueGrid, difficulty, rng);

  const puzzle: PipsPuzzle = {
    difficulty,
    rows: shape.rows,
    cols: shape.cols,
    cells,
    dominoes,
    regions,
    solution,
  };

  if (!validateSolution(puzzle, solution)) {
    return generatePuzzle(difficulty, rng);
  }

  return puzzle;
}

interface GeneratedPipsShape {
  rows: number;
  cols: number;
  cells: PipsCell[];
  pairs: [PipsCell, PipsCell][];
}

function generateIrregularDominoShape(rows: number, cols: number, dominoes: number, rng: () => number): GeneratedPipsShape {
  for (let attempt = 0; attempt < 220; attempt++) {
    // Start from one domino pair and grow outward so the final silhouette is
    // connected. Pair-based growth guarantees an even number of active cells.
    const active = new Set<string>();
    const pairs: [PipsCell, PipsCell][] = [];
    const startPair = pickWeightedDominoPair(getAllGridDominoPairs(rows, cols), active, rows, cols, rng);
    addShapePair(startPair, active, pairs);

    while (pairs.length < dominoes) {
      const options = getGrowthDominoOptions(active, rows, cols);
      if (options.length === 0) break;
      addShapePair(pickWeightedDominoPair(options, active, rows, cols, rng), active, pairs);
    }

    if (pairs.length !== dominoes) continue;

    const trimmed = trimShapeToBounds(pairs);
    // Reject rectangular or disconnected shapes. Pips should feel like a
    // shaped board, not a plain fill-the-rectangle domino exercise.
    if (!isConnectedShape(trimmed.cells, trimmed.rows, trimmed.cols)) continue;
    if (!isIrregularShape(trimmed.cells, trimmed.rows, trimmed.cols)) continue;

    shuffleArray(trimmed.pairs, rng);
    return trimmed;
  }

  throw new Error("Unable to generate irregular Pips shape");
}

function addShapePair(pair: [PipsCell, PipsCell], active: Set<string>, pairs: [PipsCell, PipsCell][]): void {
  active.add(cellKey(pair[0]));
  active.add(cellKey(pair[1]));
  pairs.push(pair);
}

function getAllGridDominoPairs(rows: number, cols: number): [PipsCell, PipsCell][] {
  const pairs: [PipsCell, PipsCell][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = { r, c };
      if (c + 1 < cols) pairs.push([cell, { r, c: c + 1 }]);
      if (r + 1 < rows) pairs.push([cell, { r: r + 1, c }]);
    }
  }
  return pairs;
}

function getGrowthDominoOptions(active: Set<string>, rows: number, cols: number): [PipsCell, PipsCell][] {
  return getAllGridDominoPairs(rows, cols).filter(([first, second]) => {
    if (active.has(cellKey(first)) || active.has(cellKey(second))) return false;
    // A new pair must touch the current shape so growth stays connected.
    return countActiveNeighbors(first, active, rows, cols) + countActiveNeighbors(second, active, rows, cols) > 0;
  });
}

function pickWeightedDominoPair(
  options: [PipsCell, PipsCell][],
  active: Set<string>,
  rows: number,
  cols: number,
  rng: () => number,
): [PipsCell, PipsCell] {
  const weighted = options.map((pair) => ({
    pair,
    weight: getShapeGrowthWeight(pair, active, rows, cols, rng),
  }));
  const total = weighted.reduce((sum, option) => sum + option.weight, 0);
  let cursor = rng() * total;

  for (const option of weighted) {
    cursor -= option.weight;
    if (cursor <= 0) return option.pair;
  }

  return weighted[weighted.length - 1]!.pair;
}

function getShapeGrowthWeight(pair: [PipsCell, PipsCell], active: Set<string>, rows: number, cols: number, rng: () => number): number {
  if (active.size === 0) {
    // Bias the first pair toward the center so the random walk has room to
    // make pockets and elbows before it reaches the board edge.
    const centerR = (rows - 1) / 2;
    const centerC = (cols - 1) / 2;
    const distance =
      Math.abs((pair[0].r + pair[1].r) / 2 - centerR) + Math.abs((pair[0].c + pair[1].c) / 2 - centerC);
    return Math.max(0.35, rows + cols - distance);
  }

  const activeNeighbors = countActiveNeighbors(pair[0], active, rows, cols) + countActiveNeighbors(pair[1], active, rows, cols);
  const expandsBounds = pairExpandsBounds(pair, active);
  const nearEdge = pair.some((cell) => cell.r === 0 || cell.c === 0 || cell.r === rows - 1 || cell.c === cols - 1);
  const makesElbow = pair.some((cell) => {
    const vertical = getNeighbors(cell, rows, cols).some((neighbor) => active.has(cellKey(neighbor)) && neighbor.c === cell.c);
    const horizontal = getNeighbors(cell, rows, cols).some((neighbor) => active.has(cellKey(neighbor)) && neighbor.r === cell.r);
    return vertical && horizontal;
  });

  let weight = 1 + rng() * 2.5;
  // These weights keep shapes organic: prefer useful contact, allow outward
  // expansion, and avoid gluing too many cells into a dense rectangular blob.
  if (activeNeighbors === 1) weight += 5.4;
  if (activeNeighbors === 2) weight += 2.2;
  if (activeNeighbors >= 4) weight *= 0.32;
  if (expandsBounds) weight += 3.2;
  if (nearEdge) weight += 0.85;
  if (makesElbow) weight += 1.3;
  return Math.max(0.15, weight);
}

function countActiveNeighbors(cell: PipsCell, active: Set<string>, rows: number, cols: number): number {
  return getNeighbors(cell, rows, cols).filter((neighbor) => active.has(cellKey(neighbor))).length;
}

function pairExpandsBounds(pair: [PipsCell, PipsCell], active: Set<string>): boolean {
  const activeCells = [...active].map(parseCellKey);
  if (activeCells.length === 0) return true;
  const minR = Math.min(...activeCells.map((cell) => cell.r));
  const maxR = Math.max(...activeCells.map((cell) => cell.r));
  const minC = Math.min(...activeCells.map((cell) => cell.c));
  const maxC = Math.max(...activeCells.map((cell) => cell.c));

  return pair.some((cell) => cell.r < minR || cell.r > maxR || cell.c < minC || cell.c > maxC);
}

function trimShapeToBounds(pairs: [PipsCell, PipsCell][]): GeneratedPipsShape {
  // Growth happens in the difficulty-sized canvas. Trim after generation so
  // rendering can use a compact board with stable row/column coordinates.
  const rawCells = pairs.flat();
  const minR = Math.min(...rawCells.map((cell) => cell.r));
  const maxR = Math.max(...rawCells.map((cell) => cell.r));
  const minC = Math.min(...rawCells.map((cell) => cell.c));
  const maxC = Math.max(...rawCells.map((cell) => cell.c));
  const shiftedPairs = pairs.map(([first, second]) => [
    { r: first.r - minR, c: first.c - minC },
    { r: second.r - minR, c: second.c - minC },
  ] as [PipsCell, PipsCell]);
  const cellsByKey = new Map<string, PipsCell>();
  shiftedPairs.flat().forEach((cell) => cellsByKey.set(cellKey(cell), cell));

  return {
    rows: maxR - minR + 1,
    cols: maxC - minC + 1,
    cells: [...cellsByKey.values()].sort((a, b) => a.r - b.r || a.c - b.c),
    pairs: shiftedPairs,
  };
}

function isConnectedShape(cells: PipsCell[], rows: number, cols: number): boolean {
  if (cells.length === 0) return false;

  const active = new Set(cells.map(cellKey));
  const seen = new Set<string>();
  const queue = [cells[0]!];
  seen.add(cellKey(cells[0]!));

  while (queue.length > 0) {
    const cell = queue.shift()!;
    for (const neighbor of getNeighbors(cell, rows, cols)) {
      const key = cellKey(neighbor);
      if (!active.has(key) || seen.has(key)) continue;
      seen.add(key);
      queue.push(neighbor);
    }
  }

  return seen.size === active.size;
}

function isIrregularShape(cells: PipsCell[], rows: number, cols: number): boolean {
  if (cells.length >= rows * cols) return false;

  const rowCounts = Array.from({ length: rows }, (_, row) => cells.filter((cell) => cell.r === row).length).filter(Boolean);
  const colCounts = Array.from({ length: cols }, (_, col) => cells.filter((cell) => cell.c === col).length).filter(Boolean);
  const variedRows = new Set(rowCounts).size > 1;
  const variedCols = new Set(colCounts).size > 1;
  const active = new Set(cells.map(cellKey));
  const hasPocket = Array.from({ length: rows * cols }, (_, index) => ({
    r: Math.floor(index / cols),
    c: index % cols,
  })).some((cell) => !active.has(cellKey(cell)) && countActiveNeighbors(cell, active, rows, cols) >= 2);

  return variedRows && variedCols && hasPocket;
}

function generateDominoTiling(cells: PipsCell[], rows: number, cols: number, rng: () => number): [PipsCell, PipsCell][] {
  const active = new Set(cells.map(cellKey));
  const order = [...cells];
  shuffleArray(order, rng);

  for (let attempt = 0; attempt < 80; attempt++) {
    const free = new Set(active);
    const placements: [PipsCell, PipsCell][] = [];
    if (tileBacktrack(order, free, placements, rows, cols, rng)) return placements;
    shuffleArray(order, rng);
  }

  throw new Error("Unable to generate domino tiling");
}

function tileBacktrack(
  order: PipsCell[],
  free: Set<string>,
  placements: [PipsCell, PipsCell][],
  rows: number,
  cols: number,
  rng: () => number,
): boolean {
  if (free.size === 0) return true;

  const first = order.find((cell) => free.has(cellKey(cell)));
  if (!first) return false;

  const neighbors = getNeighbors(first, rows, cols).filter((cell) => free.has(cellKey(cell)));
  shuffleArray(neighbors, rng);

  free.delete(cellKey(first));
  for (const neighbor of neighbors) {
    const neighborKey = cellKey(neighbor);
    if (!free.has(neighborKey)) continue;

    free.delete(neighborKey);
    placements.push([first, neighbor]);

    if (tileBacktrack(order, free, placements, rows, cols, rng)) return true;

    placements.pop();
    free.add(neighborKey);
  }
  free.add(cellKey(first));

  return false;
}

function pickDominoSet(count: number, rng: () => number): PipsDomino[] {
  const all: PipsDomino[] = [];
  for (let a = 0; a <= 6; a++) {
    for (let b = a; b <= 6; b++) {
      all.push({ id: `${a}-${b}`, a, b });
    }
  }
  shuffleArray(all, rng);
  return all.slice(0, count);
}

function generateRegions(
  cells: PipsCell[],
  valueGrid: Map<string, number>,
  difficulty: PipsDifficulty,
  rng: () => number,
): PipsRegion[] {
  // Regions are visible clues. They are grown over the solved value grid, then
  // each region gets a rule that the hidden solution already satisfies.
  const unassigned = new Set(cells.map(cellKey));
  const order = [...cells];
  shuffleArray(order, rng);

  const regions: PipsRegion[] = [];
  for (const start of order) {
    const startKey = cellKey(start);
    if (!unassigned.has(startKey)) continue;

    const targetSize = getRegionTargetSize(difficulty, rng);
    const regionCells = growRegion(start, targetSize, unassigned, cells, rng);
    const values = regionCells.map((cell) => valueGrid.get(cellKey(cell)) ?? 0);

    regions.push({
      id: `r${regions.length}`,
      cells: regionCells,
      rule: pickRegionRule(values, difficulty, rng),
      colorIndex: regions.length % 10,
    });
  }

  return regions;
}

function getRegionTargetSize(difficulty: PipsDifficulty, rng: () => number): number {
  if (difficulty === "easy") return rng() < 0.25 ? 1 : 2;
  if (difficulty === "medium") return rng() < 0.15 ? 1 : 2 + Math.floor(rng() * 2);
  return rng() < 0.1 ? 1 : 2 + Math.floor(rng() * 3);
}

function growRegion(
  start: PipsCell,
  targetSize: number,
  unassigned: Set<string>,
  allCells: PipsCell[],
  rng: () => number,
): PipsCell[] {
  const active = new Set(allCells.map(cellKey));
  const region = [start];
  unassigned.delete(cellKey(start));

  while (region.length < targetSize) {
    const candidates: PipsCell[] = [];
    for (const cell of region) {
      for (const neighbor of getNeighbors(cell, Infinity, Infinity)) {
        const key = cellKey(neighbor);
        if (active.has(key) && unassigned.has(key) && !candidates.some((c) => cellKey(c) === key)) {
          candidates.push(neighbor);
        }
      }
    }

    if (candidates.length === 0) break;
    const next = candidates[Math.floor(rng() * candidates.length)]!;
    region.push(next);
    unassigned.delete(cellKey(next));
  }

  return region;
}

function pickRegionRule(values: number[], difficulty: PipsDifficulty, rng: () => number): PipsRegionRule {
  const sum = values.reduce((total, value) => total + value, 0);
  if (values.length === 1) return { type: "sum", target: sum };

  const allSame = values.every((value) => value === values[0]);
  const allDifferent = new Set(values).size === values.length;
  const candidates: PipsRegionRule[] = [{ type: "sum", target: sum }];

  if (allSame) candidates.push({ type: "equal" });
  if (allDifferent) candidates.push({ type: "different" });

  if (difficulty !== "easy") {
    // Comparison rules are deliberately derived just outside the solved sum.
    // That keeps them meaningful while avoiding impossible or ambiguous clues.
    if (sum > 0) candidates.push({ type: "greaterThan", target: sum - 1 });
    if (sum < values.length * 6) candidates.push({ type: "lessThan", target: sum + 1 });
  }

  const sumWeight = difficulty === "easy" ? 0.8 : difficulty === "medium" ? 0.55 : 0.4;
  if (rng() < sumWeight) return { type: "sum", target: sum };
  return candidates[Math.floor(rng() * candidates.length)]!;
}

/* -- Validation ---------------------------------------------- */
export function validateSolution(puzzle: PipsPuzzle, placements: PipsPlacement[]): boolean {
  if (!validatePuzzleShape(puzzle)) return false;
  if (placements.length !== puzzle.dominoes.length) return false;

  const activeCells = new Set(puzzle.cells.map(cellKey));
  const usedCells = new Set<string>();
  const usedDominoes = new Set<string>();
  const dominoesById = new Map(puzzle.dominoes.map((domino) => [domino.id, domino]));

  for (const placement of placements) {
    const domino = dominoesById.get(placement.dominoId);
    if (!domino) return false;
    if (usedDominoes.has(domino.id)) return false;
    usedDominoes.add(domino.id);

    const first = { r: placement.r1, c: placement.c1 };
    const second = { r: placement.r2, c: placement.c2 };
    const firstKey = cellKey(first);
    const secondKey = cellKey(second);

    if (!activeCells.has(firstKey) || !activeCells.has(secondKey)) return false;
    if (!areAdjacent(first, second)) return false;
    if (usedCells.has(firstKey) || usedCells.has(secondKey)) return false;

    usedCells.add(firstKey);
    usedCells.add(secondKey);
  }

  if (usedCells.size !== activeCells.size) return false;

  const valueGrid = getPlacementValueGrid(puzzle, placements);
  if (!valueGrid) return false;

  return puzzle.regions.every((region) => {
    const values = region.cells.map((cell) => valueGrid.get(cellKey(cell)));
    if (values.some((value) => value == null)) return false;
    return evaluateRegionRule(region.rule, values as number[]);
  });
}

export function validatePuzzleShape(puzzle: PipsPuzzle): boolean {
  if (puzzle.rows <= 0 || puzzle.cols <= 0) return false;
  if (puzzle.cells.length === 0 || puzzle.cells.length % 2 !== 0) return false;
  if (puzzle.dominoes.length * 2 !== puzzle.cells.length) return false;

  const active = new Set<string>();
  for (const cell of puzzle.cells) {
    if (!isCellInBounds(cell, puzzle.rows, puzzle.cols)) return false;
    const key = cellKey(cell);
    if (active.has(key)) return false;
    active.add(key);
  }

  const regionCells = new Set<string>();
  for (const region of puzzle.regions) {
    if (region.cells.length === 0) return false;
    for (const cell of region.cells) {
      const key = cellKey(cell);
      if (!active.has(key)) return false;
      if (regionCells.has(key)) return false;
      regionCells.add(key);
    }
  }

  return regionCells.size === active.size;
}

export function evaluateRegionRule(rule: PipsRegionRule, values: number[]): boolean {
  if (values.length === 0) return false;
  const sum = values.reduce((total, value) => total + value, 0);

  if (rule.type === "sum") return sum === rule.target;
  if (rule.type === "greaterThan") return sum > rule.target;
  if (rule.type === "lessThan") return sum < rule.target;
  if (rule.type === "equal") return values.every((value) => value === values[0]);
  return new Set(values).size === values.length;
}

export function getPlacementValueGrid(puzzle: PipsPuzzle, placements: PipsPlacement[]): Map<string, number> | null {
  const dominoesById = new Map(puzzle.dominoes.map((domino) => [domino.id, domino]));
  const values = new Map<string, number>();

  for (const placement of placements) {
    const domino = dominoesById.get(placement.dominoId);
    if (!domino) return null;

    const firstValue = placement.flipped ? domino.b : domino.a;
    const secondValue = placement.flipped ? domino.a : domino.b;

    values.set(cellKey({ r: placement.r1, c: placement.c1 }), firstValue);
    values.set(cellKey({ r: placement.r2, c: placement.c2 }), secondValue);
  }

  return values;
}

/* -- Run scoring --------------------------------------------- */
export function getRunScoreTime(timeMs: number): number {
  return Math.max(0, Math.floor(timeMs));
}

export function compareRunTimes(aMs: number, bMs: number): number {
  return getRunScoreTime(aMs) - getRunScoreTime(bMs);
}

/* -- Ranked replay validation -------------------------------- */
export interface PipsRankedReplayData {
  placements: Record<PipsDifficulty, PipsPlacement[]>;
  splits?: Partial<Record<PipsDifficulty, number>>;
}

export type PipsRankedValidationCode =
  | "invalid-seed"
  | "invalid-time"
  | "invalid-puzzle-count"
  | "invalid-replay"
  | "invalid-generated-run"
  | "non-canonical-solution";

export type PipsRankedValidationResult =
  | { ok: true; replayData: PipsRankedReplayData }
  | { ok: false; code: PipsRankedValidationCode; reason: string };

/**
 * Rebuild a ranked Easy/Medium/Hard run and validate the submitted placements.
 *
 * The client only owns UI state. The server owns ranked acceptance: it uses the
 * shared engine to regenerate the public seed and proves every submitted board
 * is a valid solution to that canonical puzzle before storing leaderboard data.
 */
export function validateRankedPipsRun(args: {
  seed: number;
  totalMs: number;
  easyMs: number;
  mediumMs: number;
  hardMs: number;
  puzzleCount: number;
  replayData: unknown;
  timeToleranceMs?: number;
}): PipsRankedValidationResult {
  const { seed, totalMs, easyMs, mediumMs, hardMs, puzzleCount, replayData, timeToleranceMs = 250 } = args;

  if (!Number.isInteger(seed) || seed <= 0 || seed > 2_147_483_647) {
    return { ok: false, code: "invalid-seed", reason: "Ranked Pips runs require a positive 32-bit seed." };
  }
  if (![totalMs, easyMs, mediumMs, hardMs].every((value) => Number.isInteger(value) && value > 0)) {
    return { ok: false, code: "invalid-time", reason: "Ranked Pips runs require positive integer split times." };
  }
  if (Math.abs(easyMs + mediumMs + hardMs - totalMs) > timeToleranceMs) {
    return { ok: false, code: "invalid-time", reason: "The submitted split times do not match the total run time." };
  }
  if (puzzleCount !== PIPS_PUZZLES_PER_RUN) {
    return { ok: false, code: "invalid-puzzle-count", reason: "Ranked Pips runs must complete Easy, Medium, and Hard." };
  }

  const replay = normalizePipsReplayData(replayData);
  if (!replay) {
    return { ok: false, code: "invalid-replay", reason: "Ranked Pips submissions must include solved placements for all three puzzles." };
  }

  const run = generateRun(seed);
  if (run.puzzles.length !== PIPS_PUZZLES_PER_RUN || !PIPS_RUN_DIFFICULTIES.every((difficulty, index) => run.puzzles[index]?.difficulty === difficulty)) {
    return { ok: false, code: "invalid-generated-run", reason: "The generated Pips run is not eligible for ranked scoring." };
  }

  for (const puzzle of run.puzzles) {
    if (!isRankablePipsPuzzle(puzzle)) {
      return { ok: false, code: "invalid-generated-run", reason: "One generated Pips puzzle failed engine validation." };
    }

    const placements = replay.placements[puzzle.difficulty];
    if (!validateSolution(puzzle, placements)) {
      return { ok: false, code: "non-canonical-solution", reason: `${puzzle.difficulty} was not solved against the canonical generated board.` };
    }
  }

  return { ok: true, replayData: replay };
}

function normalizePipsReplayData(value: unknown): PipsRankedReplayData | null {
  if (!isRecord(value)) return null;
  const rawPlacements = value.placements;
  if (!isRecord(rawPlacements)) return null;

  const placements = {} as Record<PipsDifficulty, PipsPlacement[]>;
  for (const difficulty of PIPS_RUN_DIFFICULTIES) {
    const normalized = normalizePipsPlacementList(rawPlacements[difficulty]);
    if (!normalized) return null;
    placements[difficulty] = normalized;
  }

  const rawSplits = isRecord(value.splits) ? value.splits : null;
  if (!rawSplits) return { placements };

  const splits: Partial<Record<PipsDifficulty, number>> = {};
  for (const difficulty of PIPS_RUN_DIFFICULTIES) {
    const split = Number(rawSplits[difficulty]);
    if (Number.isFinite(split)) {
      splits[difficulty] = getRunScoreTime(split);
    }
  }

  return { placements, splits };
}

function normalizePipsPlacementList(value: unknown): PipsPlacement[] | null {
  if (!Array.isArray(value)) return null;
  const placements: PipsPlacement[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const dominoId = typeof item.dominoId === "string" ? item.dominoId : "";
    const r1 = Number(item.r1);
    const c1 = Number(item.c1);
    const r2 = Number(item.r2);
    const c2 = Number(item.c2);
    if (!dominoId || dominoId.length > 16 || ![r1, c1, r2, c2].every(Number.isInteger) || typeof item.flipped !== "boolean") {
      return null;
    }
    placements.push({ dominoId, r1, c1, r2, c2, flipped: item.flipped });
  }
  return placements;
}

function isRankablePipsPuzzle(puzzle: PipsPuzzle): boolean {
  const config = PIPS_DIFFICULTY_CONFIG[puzzle.difficulty];
  return Boolean(config)
    && puzzle.dominoes.length === config.dominoes
    && puzzle.cells.length === config.dominoes * 2
    && validatePuzzleShape(puzzle)
    && validateSolution(puzzle, puzzle.solution);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/* -- Solver --------------------------------------------------- */
export function countPipsSolutions(puzzle: PipsPuzzle, maxCount = 2, iterBudget = 100_000): number {
  if (!validatePuzzleShape(puzzle)) return 0;

  const activeCells = new Set(puzzle.cells.map(cellKey));
  const adjacentPairs = getAdjacentPairs(puzzle.cells, puzzle.rows, puzzle.cols);
  const usedCells = new Set<string>();
  const usedDominoes = new Set<string>();
  const regionState = puzzle.regions.map((region) => ({
    rule: region.rule,
    size: region.cells.length,
    values: [] as number[],
  }));
  const regionIndexByCell = new Map<string, number>();
  puzzle.regions.forEach((region, index) => {
    region.cells.forEach((cell) => regionIndexByCell.set(cellKey(cell), index));
  });

  let solutions = 0;
  let iterations = 0;

  function canUseCell(cell: PipsCell): boolean {
    const key = cellKey(cell);
    return activeCells.has(key) && !usedCells.has(key);
  }

  function pushRegionValue(cell: PipsCell, value: number): boolean {
    const regionIndex = regionIndexByCell.get(cellKey(cell));
    if (regionIndex == null) return false;
    const state = regionState[regionIndex]!;
    state.values.push(value);
    return isPartialRegionValid(state.rule, state.values, state.size);
  }

  function popRegionValue(cell: PipsCell): void {
    const regionIndex = regionIndexByCell.get(cellKey(cell));
    if (regionIndex == null) return;
    regionState[regionIndex]!.values.pop();
  }

  function placeOption(option: SolverOption): boolean {
    usedCells.add(cellKey(option.first));
    usedCells.add(cellKey(option.second));
    usedDominoes.add(option.domino.id);

    if (!pushRegionValue(option.first, option.firstValue)) {
      popRegionValue(option.first);
      usedCells.delete(cellKey(option.first));
      usedCells.delete(cellKey(option.second));
      usedDominoes.delete(option.domino.id);
      return false;
    }
    if (!pushRegionValue(option.second, option.secondValue)) {
      popRegionValue(option.second);
      popRegionValue(option.first);
      usedCells.delete(cellKey(option.first));
      usedCells.delete(cellKey(option.second));
      usedDominoes.delete(option.domino.id);
      return false;
    }

    return true;
  }

  function undoOption(option: SolverOption): void {
    popRegionValue(option.second);
    popRegionValue(option.first);
    usedCells.delete(cellKey(option.first));
    usedCells.delete(cellKey(option.second));
    usedDominoes.delete(option.domino.id);
  }

  function getOptionsForDomino(domino: PipsDomino): SolverOption[] {
    if (usedDominoes.has(domino.id)) return [];

    const options: SolverOption[] = [];
    for (const [first, second] of adjacentPairs) {
      if (!canUseCell(first) || !canUseCell(second)) continue;

      options.push({ domino, first, second, firstValue: domino.a, secondValue: domino.b });
      if (domino.a !== domino.b) {
        options.push({ domino, first, second, firstValue: domino.b, secondValue: domino.a });
      }
    }
    return options;
  }

  function solve(): void {
    if (solutions >= maxCount || iterations >= iterBudget) return;
    iterations++;

    if (usedDominoes.size === puzzle.dominoes.length) {
      if (usedCells.size !== activeCells.size) return;
      if (regionState.every((state) => state.values.length === state.size && evaluateRegionRule(state.rule, state.values))) {
        solutions++;
      }
      return;
    }

    let bestDomino: PipsDomino | null = null;
    let bestOptions: SolverOption[] = [];

    for (const domino of puzzle.dominoes) {
      if (usedDominoes.has(domino.id)) continue;
      const options = getOptionsForDomino(domino).filter((option) => {
        if (!placeOption(option)) return false;
        undoOption(option);
        return true;
      });

      if (options.length === 0) return;
      if (!bestDomino || options.length < bestOptions.length) {
        bestDomino = domino;
        bestOptions = options;
      }
    }

    if (!bestDomino) return;

    for (const option of bestOptions) {
      if (!placeOption(option)) continue;
      solve();
      undoOption(option);
      if (solutions >= maxCount || iterations >= iterBudget) return;
    }
  }

  solve();
  return iterations >= iterBudget ? -1 : solutions;
}

interface SolverOption {
  domino: PipsDomino;
  first: PipsCell;
  second: PipsCell;
  firstValue: number;
  secondValue: number;
}

function isPartialRegionValid(rule: PipsRegionRule, values: number[], size: number): boolean {
  const sum = values.reduce((total, value) => total + value, 0);

  if (rule.type === "sum") return sum <= rule.target && (values.length < size || sum === rule.target);
  if (rule.type === "lessThan") return sum < rule.target;
  if (rule.type === "greaterThan") return values.length < size || sum > rule.target;
  if (rule.type === "equal") return values.every((value) => value === values[0]);
  return new Set(values).size === values.length;
}

/* -- Helpers -------------------------------------------------- */
function getAdjacentPairs(cells: PipsCell[], rows: number, cols: number): [PipsCell, PipsCell][] {
  const active = new Set(cells.map(cellKey));
  const pairs: [PipsCell, PipsCell][] = [];

  for (const cell of cells) {
    for (const neighbor of [
      { r: cell.r, c: cell.c + 1 },
      { r: cell.r + 1, c: cell.c },
    ]) {
      if (isCellInBounds(neighbor, rows, cols) && active.has(cellKey(neighbor))) {
        pairs.push([cell, neighbor]);
      }
    }
  }

  return pairs;
}

function getNeighbors(cell: PipsCell, rows: number, cols: number): PipsCell[] {
  const candidates = [
    { r: cell.r - 1, c: cell.c },
    { r: cell.r + 1, c: cell.c },
    { r: cell.r, c: cell.c - 1 },
    { r: cell.r, c: cell.c + 1 },
  ];
  return candidates.filter((candidate) => isCellInBounds(candidate, rows, cols));
}

function isCellInBounds(cell: PipsCell, rows: number, cols: number): boolean {
  return cell.r >= 0 && cell.c >= 0 && cell.r < rows && cell.c < cols;
}

function areAdjacent(a: PipsCell, b: PipsCell): boolean {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

function cellKey(cell: PipsCell): string {
  return `${cell.r},${cell.c}`;
}

function parseCellKey(key: string): PipsCell {
  const [r, c] = key.split(",").map(Number);
  return { r: r ?? 0, c: c ?? 0 };
}

function shuffleArray<T>(arr: T[], rng: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const current = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = current;
  }
}

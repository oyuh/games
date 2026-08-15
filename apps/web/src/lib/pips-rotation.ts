import type { PipsCell, PipsPlacement } from "./pips-engine";

export function areAdjacent(a: PipsCell, b: PipsCell): boolean {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

/**
 * Which way a domino faces, clockwise from lying flat with its first half on
 * the left. 0 and 2 are the same two cells with the halves swapped, as are 1
 * and 3, so turning a piece never moves it off the square you put it on.
 */
export type Rotation = 0 | 1 | 2 | 3;

/* How the pair extends from its pivot cell. Every rotation reaches right or
   down, never back. Reaching backwards is what used to walk a domino across
   the board a quarter-turn at a time. */
export const ROTATION_STEPS: Record<Rotation, PipsCell> = {
  0: { r: 0, c: 1 },
  1: { r: 1, c: 0 },
  2: { r: 0, c: 1 },
  3: { r: 1, c: 0 },
};

/** Where the second half can go when dropping onto a cell, best first. */
export const DROP_OFFSETS: Record<Rotation, PipsCell[]> = {
  0: [{ r: 0, c: 1 }, { r: 0, c: -1 }],
  1: [{ r: 1, c: 0 }, { r: -1, c: 0 }],
  2: [{ r: 0, c: -1 }, { r: 0, c: 1 }],
  3: [{ r: -1, c: 0 }, { r: 1, c: 0 }],
};

export function nextRotation(rotation: Rotation): Rotation {
  return ((rotation + 1) % 4) as Rotation;
}

/**
 * The cell pairs a rotation could use, best first. The pivot is the placement's
 * top-left cell, so the domino turns where it stands. The second pair is a wall
 * kick: hard against an edge or a neighbour, it turns back through the cell
 * behind the pivot rather than refusing to turn at all.
 */
export function getRotationFootprints(placement: PipsPlacement, rotation: Rotation): [PipsCell, PipsCell][] {
  const pivot = { r: placement.r1, c: placement.c1 };
  const step = ROTATION_STEPS[rotation];

  return [
    [pivot, { r: pivot.r + step.r, c: pivot.c + step.c }],
    [{ r: pivot.r - step.r, c: pivot.c - step.c }, pivot],
  ];
}

export function placementToRotation(placement: PipsPlacement): Rotation {
  const horizontal = placement.r1 === placement.r2;
  const visualFirstIsFirstCell = horizontal ? placement.c1 < placement.c2 : placement.r1 < placement.r2;
  const aAtVisualFirst = visualFirstIsFirstCell ? !placement.flipped : placement.flipped;

  if (horizontal) return aAtVisualFirst ? 0 : 2;
  return aAtVisualFirst ? 1 : 3;
}

export function createPlacementFromCells(
  dominoId: string,
  first: PipsCell,
  second: PipsCell,
  rotation: Rotation,
): PipsPlacement | null {
  if (!areAdjacent(first, second)) return null;
  const horizontal = first.r === second.r;
  if (horizontal !== (rotation === 0 || rotation === 2)) return null;

  const visualFirst = horizontal
    ? first.c < second.c
      ? first
      : second
    : first.r < second.r
      ? first
      : second;
  const visualSecond = visualFirst === first ? second : first;

  return {
    dominoId,
    r1: visualFirst.r,
    c1: visualFirst.c,
    r2: visualSecond.r,
    c2: visualSecond.c,
    flipped: rotation >= 2,
  };
}

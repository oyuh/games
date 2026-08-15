import { describe, expect, it } from "vitest";
import {
  createPlacementFromCells,
  getRotationFootprints,
  nextRotation,
  placementToRotation,
  type Rotation,
} from "../lib/pips-rotation";

const ROTATIONS: Rotation[] = [0, 1, 2, 3];

/** The forward footprint: where a turn puts the piece when nothing blocks it. */
function turn(placement: ReturnType<typeof horizontalAt>, rotation: Rotation) {
  const [first, second] = getRotationFootprints(placement, rotation)[0]!;
  const next = createPlacementFromCells(placement.dominoId, first, second, rotation);
  expect(next).not.toBeNull();
  return next!;
}

function horizontalAt(r: number, c: number) {
  return createPlacementFromCells("d", { r, c }, { r, c: c + 1 }, 0)!;
}

function cellsOf(placement: { r1: number; c1: number; r2: number; c2: number }) {
  return [
    { r: placement.r1, c: placement.c1 },
    { r: placement.r2, c: placement.c2 },
  ].sort((a, b) => a.r - b.r || a.c - b.c);
}

describe("pips rotation", () => {
  it("round-trips a rotation through a placement and back", () => {
    for (const rotation of ROTATIONS) {
      const horizontal = rotation === 0 || rotation === 2;
      const second = horizontal ? { r: 3, c: 5 } : { r: 4, c: 4 };
      const placement = createPlacementFromCells("d", { r: 3, c: 4 }, second, rotation);
      expect(placement).not.toBeNull();
      expect(placementToRotation(placement!)).toBe(rotation);
    }
  });

  it("keeps the pivot cell when it turns", () => {
    let placement = horizontalAt(3, 4);
    for (const rotation of ROTATIONS) {
      placement = turn(placement, rotation);
      expect({ r: placement.r1, c: placement.c1 }).toEqual({ r: 3, c: 4 });
    }
  });

  // The reported bug: four quarter-turns used to leave the domino a cell up
  // and a cell left of where it started, so repeated rotating walked it off
  // the board.
  it("returns to its original cells after four quarter-turns", () => {
    const start = horizontalAt(3, 4);
    let placement = start;
    let rotation: Rotation = placementToRotation(start);

    for (let step = 0; step < 4; step += 1) {
      rotation = nextRotation(rotation);
      placement = turn(placement, rotation);
    }

    expect(cellsOf(placement)).toEqual(cellsOf(start));
    expect(placementToRotation(placement)).toBe(placementToRotation(start));
  });

  it("never drifts, however many times it is turned", () => {
    let placement = horizontalAt(0, 0);
    let rotation: Rotation = 0;

    for (let step = 0; step < 40; step += 1) {
      rotation = nextRotation(rotation);
      placement = turn(placement, rotation);
      // Two cells anchored at the pivot: nothing may reach up or left of it.
      expect(Math.min(placement.r1, placement.r2)).toBe(0);
      expect(Math.min(placement.c1, placement.c2)).toBe(0);
    }
  });

  it("offers a wall kick behind the pivot when the forward cell is taken", () => {
    const placement = horizontalAt(3, 4);
    const [forward, kicked] = getRotationFootprints(placement, 1);

    expect(forward).toEqual([{ r: 3, c: 4 }, { r: 4, c: 4 }]);
    expect(kicked).toEqual([{ r: 2, c: 4 }, { r: 3, c: 4 }]);
  });

  it("gives half-turns the same two cells, so a boxed-in domino can still flip", () => {
    const placement = horizontalAt(3, 4);
    const flat = getRotationFootprints(placement, 0)[0]!;
    const flipped = getRotationFootprints(placement, 2)[0]!;

    expect(flipped).toEqual(flat);
    expect(placementToRotation(turn(placement, 2))).toBe(2);
  });
});

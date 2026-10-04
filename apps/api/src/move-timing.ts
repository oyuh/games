import type { SoloGame } from "./solo-ticket";

/**
 * The move log of a ranked solo run: for each board, when every move landed,
 * in ms from that board's start. The page records it and the API reads it two
 * ways.
 *
 * A log that doesn't fit the run was made up: fewer moves than the board
 * takes, moves out of order or after the solve, or a last move nowhere near
 * the solve. That run is refused outright.
 *
 * A log that fits gets a legitimacy score from 0 to 100, saved with the run.
 * People take a moment to start a new board, don't chain moves faster than a
 * hand can, and vary their pace. Scripts tend to do none of that. Only a score
 * lower than a person can plausibly reach refuses the run; anything above it is
 * kept and left for review.
 */

/** Below this a run is refused as scripted. */
export const MIN_LEGITIMACY = 30;

const MAX_MOVES_PER_BOARD = 5_000;
/** How far the solve can trail the last move: the page renders the board solved first. */
const SOLVE_LAG_MS = 1_000;
/** Quicker than anyone reacts to a board that just appeared. */
const MIN_REACTION_MS = 100;

const PACE: Record<SoloGame, { fastGapMs: number; fastAllowance: number }> = {
  // Every Shikaku and Pips move is its own drag or tap.
  shikaku: { fastGapMs: 40, fastAllowance: 0.1 },
  pips: { fastGapMs: 40, fastAllowance: 0.1 },
  // A quick Zip swipe adds several squares in one pointer event, so zero gaps are normal.
  zip: { fastGapMs: 1, fastAllowance: 0.6 },
};

export type MoveCheck =
  | { ok: true; legitimacy: number }
  | { ok: false; code: "invalid-moves" | "scripted"; reason: string };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * `splits` and `minMoves` come from the already-validated replay, one per board:
 * each board's solve time and the fewest moves that board can be solved in.
 */
export function checkMoveTimes(game: SoloGame, moveTimes: unknown, splits: number[], minMoves: number[]): MoveCheck {
  const invalid = { ok: false, code: "invalid-moves", reason: "This run's move log doesn't match its replay." } as const;
  if (!Array.isArray(moveTimes) || moveTimes.length !== splits.length) return invalid;

  const gaps: number[] = [];
  let quickStarts = 0;
  for (const [i, moves] of moveTimes.entries()) {
    const split = splits[i]!;
    if (!Array.isArray(moves) || moves.length > MAX_MOVES_PER_BOARD || moves.length < minMoves[i]!) return invalid;
    let previous = 0;
    for (const [m, at] of moves.entries()) {
      if (!Number.isInteger(at) || at < previous || at > split + SOLVE_LAG_MS) return invalid;
      if (m > 0) gaps.push(at - previous);
      previous = at;
    }
    if (moves.length === 0) continue;
    if (split - previous > SOLVE_LAG_MS) return invalid;
    if (moves[0] < MIN_REACTION_MS) quickStarts += 1;
  }

  // Up to 25 for starting boards before anyone could have seen them.
  const reactionPenalty = 25 * (quickStarts / splits.length);

  // Up to 75 for moves chained faster than a hand moves, past what play allows.
  const { fastGapMs, fastAllowance } = PACE[game];
  const fastShare = gaps.length ? gaps.filter((gap) => gap < fastGapMs).length / gaps.length : 0;
  const speedPenalty = 75 * clamp01((fastShare - fastAllowance) / (1 - fastAllowance));

  // Up to 60 for a metronome pace. People pause to think; a steady loop doesn't.
  const paced = gaps.filter((gap) => gap >= fastGapMs);
  let rhythmPenalty = 0;
  if (paced.length >= 8) {
    const mean = paced.reduce((sum, gap) => sum + gap, 0) / paced.length;
    const spread = Math.sqrt(paced.reduce((sum, gap) => sum + (gap - mean) ** 2, 0) / paced.length) / mean;
    rhythmPenalty = 60 * clamp01((0.5 - spread) / 0.5);
  }

  const legitimacy = Math.round(Math.max(0, 100 - reactionPenalty - speedPenalty - rhythmPenalty));
  if (legitimacy < MIN_LEGITIMACY) {
    return { ok: false, code: "scripted", reason: "This run's moves look automated, so it can't be ranked." };
  }
  return { ok: true, legitimacy };
}

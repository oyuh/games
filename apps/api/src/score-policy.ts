import { calculateScore as calculateShikakuScore, RANKED_OFF_CLOCK_MS as SHIKAKU_RANKED_OFF_CLOCK_MS } from "@games/shared/games/shikaku-engine";
import { PIPS_RANKED_OFF_CLOCK_MS } from "@games/shared/games/pips-engine";
import { RANKED_OFF_CLOCK_MS as ZIP_RANKED_OFF_CLOCK_MS } from "@games/shared/games/zip-engine";
type ShikakuDifficulty = "easy" | "medium" | "hard" | "expert";

export const SHIKAKU_MIN_TIME_MS: Record<string, number> = {
  easy: 10_000,   // 2 s per puzzle
  medium: 20_000, // 4 s per puzzle
  hard: 30_000,   // 6 s per puzzle
  expert: 40_000, // 8 s per puzzle
};

export const SHIKAKU_MAX_TIME_MS: Record<string, number> = {
  easy:   3_600_000,                // 1 hr
  medium: 3_600_000 + 1_800_000,    // 1.5 hr
  hard:   3_600_000 + 3_600_000,    // 2 hr
  expert: 3_600_000 + 5_400_000,    // 2.5 hr
};

export const SHIKAKU_MAX_SCORES_PER_SESSION = 20;

export const SHIKAKU_VALID_DIFFS = ["easy", "medium", "hard", "expert"] as const;

export const PIPS_MIN_TOTAL_TIME_MS = 12_000;

export const PIPS_MIN_SPLIT_TIME_MS = 1_500;

export const PIPS_MAX_TOTAL_TIME_MS = 7_200_000;

export const PIPS_MAX_SCORES_PER_SESSION = 20;

export const PIPS_SPLIT_SUM_TOLERANCE_MS = 250;

export function shikakuMaxScore(timeMs: number, difficulty: string): number {
  return isShikakuDifficulty(difficulty) ? calculateShikakuScore(timeMs, difficulty) : 0;
}

export function isShikakuDifficulty(value: unknown): value is ShikakuDifficulty {
  return typeof value === "string" && SHIKAKU_VALID_DIFFS.includes(value as ShikakuDifficulty);
}

/*
 * Zip floors scale with the board, since a line has to cross every square.
 * 25 ms a square is faster than anyone draws: 0.9 s for a 6x6, 3.6 s for a
 * 12x12. The auto-ban line sits at half that, where only a script lands.
 */
export const ZIP_MIN_MS_PER_CELL = 25;

export const ZIP_AUTO_BAN_MS_PER_CELL = 12;

export const ZIP_MAX_TIME_MS = 7_200_000;

export const ZIP_MAX_SCORES_PER_SESSION = 20;

/** A ranked ticket is good for the longest allowed run (Shikaku expert) plus a little slack. */
export const SOLO_TICKET_TTL_MS =
  Math.max(...Object.values(SHIKAKU_MAX_TIME_MS), PIPS_MAX_TOTAL_TIME_MS, ZIP_MAX_TIME_MS) + 10 * 60_000;

/** Network, render, and background-tab timer lag between the server's clock and the client's. */
export const SOLO_CLOCK_SLACK_MS = 2_000;

/** Time a full ranked run spends with its timer stopped, from each game's shared pacing. */
export const SOLO_OFF_CLOCK_MS = {
  pips: PIPS_RANKED_OFF_CLOCK_MS,
  shikaku: SHIKAKU_RANKED_OFF_CLOCK_MS,
  zip: ZIP_RANKED_OFF_CLOCK_MS,
} as const;

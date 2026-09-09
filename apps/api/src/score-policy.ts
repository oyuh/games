import { calculateScore as calculateShikakuScore } from "@games/shared/games/shikaku-engine";
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

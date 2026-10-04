import { getOrCreateSessionId } from "./session";
import { postAsSession } from "./solo-run";
import type { Difficulty, ZipReplayData } from "./zip-engine";

/**
 * Zip's leaderboard and score calls. The ranked ticket itself comes from
 * startRankedRun in solo-run.ts. Endless and seeded runs never touch any of
 * this, so Zip stays playable with the API down; only ranked needs it.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export type ZipLeaderboardView = "all" | "mine";

export interface ZipLeaderboardEntry {
  id: string;
  name: string;
  timeMs: number;
  difficulty: Difficulty;
  createdAt: number;
  seed: number;
  rank: number;
  isOwn: boolean;
}

export interface ZipPersonalBest {
  timeMs: number;
  rank: number;
}

export interface ZipLeaderboardPage {
  entries: ZipLeaderboardEntry[];
  personalBest: ZipPersonalBest | null;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ZipSubmission {
  ticket: string;
  timeMs: number;
  replayData: ZipReplayData;
  /** Per board, when each move landed, in ms from the board's start. */
  moveTimes: number[][];
}

export interface ZipSubmitResult {
  ok: boolean;
  /** The server's own words, ready to show. */
  reason: string;
  /** The stable code behind a refusal, e.g. "duplicate" or "too-fast". */
  code?: string;
  /** From an eligible check: the ticket stamped with the run's finish, to submit with. */
  ticket?: string;
}

/** One page of a board, or the "you and your neighbors" slice with `window`. */
export async function fetchZipLeaderboard(args: {
  difficulty: Difficulty;
  page?: number;
  limit?: number;
  view?: ZipLeaderboardView;
  q?: string;
  window?: boolean;
}): Promise<ZipLeaderboardPage> {
  const params = new URLSearchParams({
    difficulty: args.difficulty,
    page: String(args.page ?? 1),
    limit: String(args.limit ?? 10),
    sessionId: getOrCreateSessionId(),
  });
  if (args.view === "mine") params.set("mineOnly", "1");
  if (args.q) params.set("q", args.q);
  if (args.window) params.set("window", "me");

  const res = await fetch(`${API_BASE}/api/zip/leaderboard?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Zip leaderboard failed (${res.status})`);
  return res.json() as Promise<ZipLeaderboardPage>;
}

/** Whether a finished run would be accepted, without saving it. */
export async function checkZipEligibility(run: ZipSubmission): Promise<ZipSubmitResult> {
  const res = await postAsSession("/api/zip/score/eligibility", { ...run }, "zip-eligibility");
  const data = await res.json().catch(() => null) as { canSubmit?: boolean; code?: string; reason?: string; ticket?: string } | null;
  return {
    ok: Boolean(data?.canSubmit),
    reason: data?.reason ?? "This run couldn't be checked right now.",
    ...(data?.code ? { code: data.code } : {}),
    ...(data?.ticket ? { ticket: data.ticket } : {}),
  };
}

export async function submitZipScore(run: ZipSubmission): Promise<ZipSubmitResult> {
  const res = await postAsSession("/api/zip/score", { ...run }, "zip-submit");
  const data = await res.json().catch(() => null) as { id?: string | null; code?: string; reason?: string } | null;
  if (!res.ok) {
    return { ok: false, reason: data?.reason ?? "This run couldn't be submitted.", ...(data?.code ? { code: data.code } : {}) };
  }
  return { ok: Boolean(data?.id), reason: data?.reason ?? "Submitted to the leaderboard." };
}

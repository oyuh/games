import { fetchWithChallenge } from "./challenge";
import { getDisplayName, getOrCreateSessionId, getSessionRequestHeaders, syncSessionIdentity } from "./session";
import type { Difficulty, GridSize, ZipReplayData } from "./zip-engine";

/**
 * The browser's half of ranked Zip. A ranked run starts by asking the API for
 * a seed and a signed ticket, and the finished run hands the ticket back with
 * its paths and splits. Endless and seeded runs never touch any of this, so
 * Zip stays playable with the API down; only ranked needs it.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export type ZipLeaderboardView = "all" | "mine";

export interface ZipLeaderboardEntry {
  id: string;
  name: string;
  timeMs: number;
  difficulty: Difficulty;
  size: GridSize;
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

export interface ZipRankedRun {
  seed: number;
  ticket: string;
}

export interface ZipSubmission {
  ticket: string;
  timeMs: number;
  replayData: ZipReplayData;
}

export interface ZipSubmitResult {
  ok: boolean;
  /** The server's own words, ready to show. */
  reason: string;
  /** The stable code behind a refusal, e.g. "duplicate" or "too-fast". */
  code?: string;
}

/** One page of a board, or the "you and your neighbors" slice with `window`. */
export async function fetchZipLeaderboard(args: {
  difficulty: Difficulty;
  size: GridSize;
  page?: number;
  limit?: number;
  view?: ZipLeaderboardView;
  q?: string;
  window?: boolean;
}): Promise<ZipLeaderboardPage> {
  const params = new URLSearchParams({
    difficulty: args.difficulty,
    size: String(args.size),
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

async function postAsSession(path: string, payload: Record<string, unknown>, reason: string) {
  const identity = await syncSessionIdentity(API_BASE, { allowCreate: true, reason });
  return fetchWithChallenge(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: getSessionRequestHeaders(identity.sessionId, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      sessionId: identity.sessionId,
      name: getDisplayName(identity.name, identity.sessionId),
      ...payload,
    }),
  });
}

/** Asks the server for a ranked seed. Throws when the API can't hand one out. */
export async function startZipRankedRun(difficulty: Difficulty, size: GridSize): Promise<ZipRankedRun> {
  const res = await postAsSession("/api/zip/run", { difficulty, size }, "zip-run");
  if (!res.ok) throw new Error(`Couldn't start a ranked Zip run (${res.status})`);
  return res.json() as Promise<ZipRankedRun>;
}

/** Whether a finished run would be accepted, without saving it. */
export async function checkZipEligibility(run: ZipSubmission): Promise<ZipSubmitResult> {
  const res = await postAsSession("/api/zip/score/eligibility", { ...run }, "zip-eligibility");
  const data = await res.json().catch(() => null) as { canSubmit?: boolean; code?: string; reason?: string } | null;
  return {
    ok: Boolean(data?.canSubmit),
    reason: data?.reason ?? "This run couldn't be checked right now.",
    ...(data?.code ? { code: data.code } : {}),
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

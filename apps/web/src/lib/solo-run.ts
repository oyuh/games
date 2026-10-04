import { fetchWithChallenge } from "./challenge";
import { getDisplayName, getSessionRequestHeaders, syncSessionIdentity } from "./session";

/**
 * The browser's half of a ranked solo run. A ranked Shikaku, Pips, or Zip run
 * starts by asking the API for a seed and a signed ticket; the end screen's
 * eligibility check hands back the ticket stamped with the finish, and the
 * submit sends that one. Endless and seeded runs never touch any of this.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export type SoloGame = "shikaku" | "pips" | "zip";

export interface RankedRun {
  seed: number;
  ticket: string;
}

/** POSTs as the current session, with the bot check's hold-and-retry. */
export async function postAsSession(path: string, payload: Record<string, unknown>, reason: string) {
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
export async function startRankedRun(game: SoloGame, difficulty?: string): Promise<RankedRun> {
  const res = await postAsSession(`/api/${game}/run`, difficulty ? { difficulty } : {}, `${game}-run`);
  if (!res.ok) throw new Error(`Couldn't start a ranked ${game} run (${res.status})`);
  return res.json() as Promise<RankedRun>;
}

/**
 * A move log for a board the dev tools solved, spread at random over the
 * split like hands would, so a dev-tested ranked run passes the server's move
 * check instead of striking your local session. Dev builds only.
 */
export function devMoveTimes(count: number, splitMs: number): number[] {
  const start = Math.min(400, splitMs / 2);
  const times = Array.from({ length: count }, () => Math.round(start + Math.random() * (splitMs - start))).sort((a, b) => a - b);
  if (count > 0) times[count - 1] = Math.round(splitMs);
  return times;
}

import { broadcastToSession } from "./broadcast-server";

/**
 * Per-session bot score. Suspicious things a session does add points, the
 * points halve every minute, and a session whose score climbs past ENTER goes
 * into "limbo": its game writes and score submissions are refused until it
 * passes a Turnstile check or cools off below EXIT. The gap between the two
 * thresholds keeps a session from flapping in and out on every request.
 *
 * Reads are never gated. A player in limbo still sees their game move, so
 * nothing on their screen goes stale while the check is up.
 *
 * ponytail: in-memory like rate-limit.ts and presence, so one API instance and
 * a restart forgives everyone. Move to Redis or a table if the API scales out.
 * Keyed by session only, never by IP, so a bot that mints a fresh session per
 * request is left to the IP rate limits; a school on one NAT never gets locked
 * out together.
 */

const HALF_LIFE_MS = 60_000;
export const LIMBO_ENTER_SCORE = 60;
export const LIMBO_EXIT_SCORE = 20;
const MAX_SCORE = 100;

/** Points per signal. A steady human pace settles well under ENTER. */
export const BOT_SIGNALS = {
  // Any game action. One a second for a minute settles near 85, which no
  // real round asks for.
  mutation: 1,
  // Chat is the cheapest thing to spam and the most annoying to receive.
  chat: 3,
  // Tripped an IP rate limit while carrying this session.
  rateLimited: 10,
  // Tried to act as another session. A real client never does this.
  rejected: 15,
  // Identified with curl, python-requests and friends.
  automationAgent: 30,
  // Kept knocking while already in limbo, so hammering never decays out.
  blocked: 2,
} as const;

export type BotSignal = keyof typeof BOT_SIGNALS;

export type BotStatus = { score: number; limbo: boolean };

type Entry = { score: number; at: number; limbo: boolean };

const entries = new Map<string, Entry>();

/** Some sessions are not a real player and are never scored. */
function scorable(sessionId: string | null | undefined): sessionId is string {
  return Boolean(sessionId) && sessionId !== "anon";
}

function decayed(entry: Entry, now: number) {
  entry.score *= 0.5 ** ((now - entry.at) / HALF_LIFE_MS);
  entry.at = now;
  return entry;
}

function notify(sessionId: string, limbo: boolean) {
  broadcastToSession(sessionId, { type: "bot:challenge", required: limbo });
}

/** Moves the entry across a threshold and tells the player's tabs about it. */
function settle(sessionId: string, entry: Entry) {
  if (!entry.limbo && entry.score >= LIMBO_ENTER_SCORE && turnstileEnforced()) {
    entry.limbo = true;
    notify(sessionId, true);
  } else if (entry.limbo && entry.score < LIMBO_EXIT_SCORE) {
    entry.limbo = false;
    notify(sessionId, false);
  }
  return { score: Math.round(entry.score), limbo: entry.limbo };
}

/**
 * The session's current standing. This is also the re-check: a session that
 * has cooled off is let out of limbo here.
 */
export function botStatus(sessionId: string | null | undefined): BotStatus {
  if (!scorable(sessionId)) return { score: 0, limbo: false };
  const entry = entries.get(sessionId);
  if (!entry) return { score: 0, limbo: false };
  return settle(sessionId, decayed(entry, Date.now()));
}

export function addBotSignal(sessionId: string | null | undefined, signal: BotSignal): BotStatus {
  return setBotScore(sessionId, botStatus(sessionId).score + BOT_SIGNALS[signal]);
}

/** Direct write for a passed challenge (0) and the dev tools. */
export function setBotScore(sessionId: string | null | undefined, score: number): BotStatus {
  if (!scorable(sessionId)) return { score: 0, limbo: false };
  const entry = entries.get(sessionId) ?? { score: 0, at: Date.now(), limbo: false };
  entry.score = Math.min(MAX_SCORE, Math.max(0, score));
  entry.at = Date.now();
  entries.set(sessionId, entry);
  return settle(sessionId, entry);
}

// Sessions in limbo that stopped making requests still deserve to hear that
// they cooled off, so a sweep re-checks them instead of waiting for a request.
setInterval(() => {
  for (const [sessionId, entry] of entries) {
    const status = botStatus(sessionId);
    if (!entry.limbo && status.score < 1) entries.delete(sessionId);
  }
}, 15_000).unref();

// ─── Turnstile ─────────────────────────────────────────────
// Cloudflare's published test secret passes every dummy token, which is what
// the test site keys hand out, so dev works with no setup. Production needs a
// real key; without one nobody can prove they are human, so limbo stays off
// and the score is only recorded. Read per call: index.ts loads .env after
// this module is evaluated.
const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";

function turnstileSecret() {
  return process.env.TURNSTILE_SECRET_KEY?.trim()
    || (process.env.NODE_ENV === "production" ? "" : TURNSTILE_TEST_SECRET);
}

export function turnstileEnforced() {
  return Boolean(turnstileSecret());
}

/** Siteverify errors come back as codes; the client shows them as-is in dev. */
export async function verifyTurnstileToken(token: string, remoteIp: string) {
  const secret = turnstileSecret();
  if (!secret) return { ok: false, errors: ["not-configured"] };

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp && remoteIp !== "unknown") body.set("remoteip", remoteIp);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8_000),
    });
    const result = await response.json() as { success?: boolean; "error-codes"?: string[] };
    return { ok: result.success === true, errors: result["error-codes"] ?? [] };
  } catch (error) {
    console.error("[bot-score] siteverify failed", error);
    return { ok: false, errors: ["siteverify-unreachable"] };
  }
}

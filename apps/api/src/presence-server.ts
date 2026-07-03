// Presence is tracked via the realtime WebSocket connection itself, no HTTP
// polling. A client is "online" for as long as it holds an open `/ws` socket.
// The socket lifecycle (open/close) and an occasional `presence` message
// (sent only when the client's activity changes) keep this registry current.
//
// Why an in-memory registry *and* DB writes:
//   - The registry gives the admin panel an accurate live online/idle status
//     without waiting on `last_seen` recency.
//   - We still persist `activity` + `last_seen` so the admin roster query keeps
//     working and so a client's *last* activity survives after they disconnect
//     (shown as "… (idle)").
import { sessions } from "@games/shared/db";
import { eq, inArray } from "drizzle-orm";
import { drizzleClient } from "./db-provider";

type PresenceEntry = {
  /** Number of open sockets for this session (multiple tabs => > 1). */
  sockets: number;
  /** Last reported activity slug (route the client is on). */
  activity: string | null;
  /** Last time we heard from this session. */
  lastSeen: number;
};

const ACTIVITY_MAX_LEN = 32;
const presence = new Map<string, PresenceEntry>();

function sanitizeActivity(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, ACTIVITY_MAX_LEN);
  return cleaned || null;
}

function persistSession(sessionId: string, activity: string | null) {
  const now = Date.now();
  drizzleClient
    .update(sessions)
    .set({ lastSeen: now, ...(activity ? { activity } : {}) })
    .where(eq(sessions.id, sessionId))
    .then(() => {})
    .catch(() => {});
}

/** A new `/ws` socket opened for this session. */
export function presenceOpen(sessionId: string) {
  const entry = presence.get(sessionId);
  if (entry) {
    entry.sockets += 1;
    entry.lastSeen = Date.now();
  } else {
    presence.set(sessionId, { sockets: 1, activity: null, lastSeen: Date.now() });
  }
}

/** A `/ws` socket closed for this session. */
export function presenceClose(sessionId: string) {
  const entry = presence.get(sessionId);
  if (!entry) {
    return;
  }
  entry.sockets -= 1;
  entry.lastSeen = Date.now();
  if (entry.sockets <= 0) {
    // Drop from the live set. `last_seen` in the DB stays where it was, so the
    // admin roster shows this session as idle until it ages out of the window.
    presence.delete(sessionId);
  }
}

/** The client reported what it's doing (sent on connect + on route change). */
export function presenceActivity(sessionId: string, rawActivity: unknown) {
  const activity = sanitizeActivity(rawActivity);
  const entry = presence.get(sessionId);
  if (entry) {
    if (activity) {
      entry.activity = activity;
    }
    entry.lastSeen = Date.now();
  } else {
    presence.set(sessionId, { sockets: 1, activity, lastSeen: Date.now() });
  }
  persistSession(sessionId, activity);
}

/** Is this session currently holding an open socket? */
export function isSessionOnline(sessionId: string): boolean {
  const entry = presence.get(sessionId);
  return Boolean(entry && entry.sockets > 0);
}

export function getOnlineSessionIds(): string[] {
  const ids: string[] = [];
  for (const [id, entry] of presence) {
    if (entry.sockets > 0) {
      ids.push(id);
    }
  }
  return ids;
}

let flushTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Periodically bump `last_seen` for all online sessions so the admin roster's
 * recency window keeps including long-lived single-page clients (who may not
 * send any activity messages for minutes). This is a single batched DB write
 * on the server; clients never poll.
 */
export function startPresenceFlush(intervalMs = 60_000) {
  if (flushTimer) {
    return;
  }
  flushTimer = setInterval(() => {
    const ids = getOnlineSessionIds();
    if (ids.length === 0) {
      return;
    }
    drizzleClient
      .update(sessions)
      .set({ lastSeen: Date.now() })
      .where(inArray(sessions.id, ids))
      .then(() => {})
      .catch(() => {});
  }, intervalMs);

  if (typeof (flushTimer as { unref?: () => void }).unref === "function") {
    (flushTimer as { unref: () => void }).unref();
  }
}

export function stopPresenceFlush() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

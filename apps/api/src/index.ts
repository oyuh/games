import { SHIKAKU_MIN_TIME_MS, SHIKAKU_MAX_TIME_MS, SHIKAKU_MAX_SCORES_PER_SESSION, SHIKAKU_VALID_DIFFS, PIPS_MIN_TOTAL_TIME_MS, PIPS_MIN_SPLIT_TIME_MS, PIPS_MAX_TOTAL_TIME_MS, PIPS_MAX_SCORES_PER_SESSION, PIPS_SPLIT_SUM_TOLERANCE_MS, ZIP_MIN_MS_PER_CELL, ZIP_AUTO_BAN_MS_PER_CELL, ZIP_MAX_TIME_MS, ZIP_MAX_SCORES_PER_SESSION, ZIP_TICKET_TTL_MS, ZIP_CLOCK_SLACK_MS, shikakuMaxScore, isShikakuDifficulty } from "./score-policy";
import { recordedCleanup } from "./cleanup";
import { fallbackPlayerName, imposterChatKeyId, mutators, queries, schema } from "@games/shared";
import { adminNameOverrides, chatMessages, imposterGames, locationSignalGames, passwordGames, pipsBannedSessions, pipsScores, sessions, shadeSignalGames, shikakuScores, shikakuBannedSessions, statusTable, zipBannedSessions, zipScores } from "@games/shared/db";

import { handleMutateRequest, handleQueryRequest } from "@rocicorp/zero/server";
import { mustGetMutator, mustGetQuery } from "@rocicorp/zero";
import { config } from "dotenv";
import { lt, and, asc, count, desc, eq, gt, inArray, or, sql, type SQL } from "drizzle-orm";
import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import {
  PUZZLES_PER_RUN as ENGINE_SHIKAKU_PUZZLES,
  validateRankedShikakuRun,
} from "@games/shared/games/shikaku-engine";
import {
  PIPS_PUZZLES_PER_RUN as ENGINE_PIPS_PUZZLES,
  validateRankedPipsRun,
} from "@games/shared/games/pips-engine";
import { dbProvider, type Db } from "./db-provider";
import { drizzleClient } from "./db-provider";
import {
  attachRealtimeServer,
  getCustomStatus,
  setBanChecker,
  getBanChecker,
  onRealtimeClose,
  onRealtimeMessage,
  onRealtimeOpen,
  type RealtimeSocketData,
} from "./broadcast-server";
import { startPresenceFlush } from "./presence-server";
import { adminRoutes, isBanned, getRestrictedNamesRoute, loadPersistedStatus } from "./admin-routes";
import { allowUnrestrictedSessionName, findRestrictedNameMatch } from "./name-rules";
import { parseLeaderboardSearch } from "./leaderboard-search";
import { rateLimit } from "./rate-limit";
import {
  chooseCanonicalSession,
  createSignedSessionCookieValue,
  createSignedSessionProofValue,
  normalizeSessionId,
  readBearerToken,
  readSignedSessionCookie,
  readSignedSessionProof,
  sanitizeSessionName,
  serializeSessionCookie,
  shouldUseSecureCookie,
  ZERO_SESSION_PROOF_HEADER,
  type SessionIdentityCandidate,
  verifyClaimedSessionId,
} from "./session-identity";
import { getClientInfo } from "./client-info";
import { authorizeMutation, isDevOnlyMutator } from "./mutator-auth";
import { addBotSignal, botStatus, setBotScore, turnstileEnforced, verifyTurnstileToken } from "./bot-score";
import { getOrCreateGameKey, type GameType } from "./game-keys";
import { shikakuImageRoutes } from "./shikaku-image";
import { createZipTicket, readZipTicket, type ZipTicket } from "./zip-ticket";
import {
  DIFFICULTY_CONFIG as ZIP_DIFFICULTY_CONFIG,
  RUN_LENGTH as ZIP_RUN_LENGTH,
  isDifficulty as isZipDifficulty,
  validateRankedZipRun,
  type ZipRankedValidationCode,
  type ZipReplayData,
} from "@games/shared/games/zip-engine";
import { embedRoutes } from "./embed-routes";

config({ path: "../../.env", quiet: true });

const app = new Hono();
const DB_STATUS_KEY = process.env.DB_STATUS_KEY?.trim() || "footer";
const DB_STATUS_EXPECTED_VALUE = process.env.DB_STATUS_EXPECTED_VALUE?.trim() || "ok";
const DEFAULT_PUBLIC_ORIGIN = "https://games.lawsonhart.me";
const DEV_MODE = process.env.NODE_ENV !== "production";

// A secret left at its committed dev default is a public key. SESSION_COOKIE_SECRET
// signs both the session cookie and the x-zero-session-proof the whole identity
// model trusts; CLEANUP_SECRET gates the destructive /api/cleanup endpoint. In
// production, refuse to boot on a missing or default value rather than run forgeable.
const SESSION_COOKIE_SECRET_DEV_DEFAULT = "games-dev-session-secret";
const CLEANUP_SECRET_DEV_DEFAULT = "cleanup-local";
if (!DEV_MODE) {
  const rawSessionSecret = process.env.SESSION_COOKIE_SECRET?.trim();
  if (!rawSessionSecret || rawSessionSecret === SESSION_COOKIE_SECRET_DEV_DEFAULT) {
    throw new Error("SESSION_COOKIE_SECRET must be set to a non-default value in production");
  }
  const rawCleanupSecret = process.env.CLEANUP_SECRET?.trim();
  if (!rawCleanupSecret || rawCleanupSecret === CLEANUP_SECRET_DEV_DEFAULT) {
    throw new Error("CLEANUP_SECRET must be set to a non-default value in production");
  }
}

const SESSION_COOKIE_SECRET = process.env.SESSION_COOKIE_SECRET?.trim() || SESSION_COOKIE_SECRET_DEV_DEFAULT;
if (DEV_MODE) {
  console.log("[dev-mode] Security relaxations active: fingerprint binding, session proof, and rate limits are loosened for local testing.");
}
if (!turnstileEnforced()) {
  console.warn("[bot-score] TURNSTILE_SECRET_KEY is not set; bot scores are tracked but never enforced.");
}

function parseOriginList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileOriginPattern(pattern: string) {
  if (!pattern.includes("*")) {
    return null;
  }

  const source = `^${pattern.split("*").map(escapeRegex).join(".*")}$`;
  return new RegExp(source);
}

const configuredOriginEntries = [
  DEFAULT_PUBLIC_ORIGIN,
  ...parseOriginList(process.env.CORS_ALLOWED_ORIGINS),
  ...(DEV_MODE ? ["http://localhost:5173", "http://127.0.0.1:5173"] : []),
];

const configuredAllowedOrigins = new Set<string>(
  configuredOriginEntries.filter((entry) => !entry.includes("*"))
);

const configuredAllowedOriginPatterns = configuredOriginEntries
  .map(compileOriginPattern)
  .filter((pattern): pattern is RegExp => Boolean(pattern));

function isAllowedOrigin(origin: string | undefined) {
  if (!origin) {
    return DEV_MODE;
  }

  if (configuredAllowedOrigins.has(origin)) {
    return true;
  }

  if (origin.endsWith(".lawsonhart.me")) {
    return true;
  }

  if (configuredAllowedOriginPatterns.some((pattern) => pattern.test(origin))) {
    return true;
  }

  if (DEV_MODE && (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"))) {
    return true;
  }

  return false;
}

function resolveCorsOrigin(origin: string | undefined) {
  return isAllowedOrigin(origin) ? origin ?? DEFAULT_PUBLIC_ORIGIN : DEFAULT_PUBLIC_ORIGIN;
}

app.use(
  "*",
  cors({
    origin: resolveCorsOrigin,
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-zero-user-id", ZERO_SESSION_PROOF_HEADER],
    credentials: true,
    maxAge: 86400
  })
);

// ─── Rate limiting ─────────────────────────────────────────
// IMPORTANT: all rate-limit middleware is registered HERE, before any routes
// are mounted below. In Hono, middleware only applies to handlers registered
// *after* it, so registering limiters up front guarantees every route (present
// and future) is covered. The numbers live in RATE_LIMITS (see rate-limit.ts);
// tiers are layered (e.g. a score submission hits global → game → score).
//
// ─── Bot check ─────────────────────────────────────────────
// Registered ahead of the limiters so it sees their 429s on the way out.
// A session in limbo (see bot-score.ts) is refused the score writes here; its
// game writes are refused per mutation in /api/zero/mutate. Reads stay open so
// a player waiting on the check never stares at a stale game.
const CHALLENGE_REQUIRED = "CHALLENGE_REQUIRED";
const LIMBO_GATED_PATH = /^\/api\/(pips|shikaku|zip)\/score/;

app.use("/api/*", async (c, next) => {
  const sessionId = requestSessionId(c);
  // The limiters below budget per session, falling back to the IP without one.
  c.set("sessionId", sessionId);
  if (sessionId && LIMBO_GATED_PATH.test(c.req.path) && botStatus(sessionId).limbo) {
    addBotSignal(sessionId, "blocked");
    return c.json({ error: "Verification required", code: CHALLENGE_REQUIRED }, 403);
  }
  await next();
  // Only a session running out of its own budget says anything about it. A
  // full IP bucket is everyone on that network, or zero-cache for every push.
  if (c.res.status === 429 && c.get("rateLimitedBy") === "session") {
    addBotSignal(sessionId, "rateLimited");
  }
});

// A global catch-all runs first so nothing is ever accidentally unprotected.
app.use("/api/*", rateLimit("global"));
app.use("/debug/*", rateLimit("global", "global_debug"));
app.use("/health", rateLimit("health"));

// High-volume real-time sync + identity. Generous so live play is never throttled.
app.use("/api/zero/*", rateLimit("zero"));
app.use("/api/session/sync", rateLimit("sessionSync"));

// Per-game encryption key exchange.
app.use("/api/game-secret/*", rateLimit("gameSecret"));

// Bot check status and Turnstile verification. Verify calls Cloudflare.
app.use("/api/challenge/*", rateLimit("challenge"));

// Map helpers. Geocode proxies an external provider, so it's tighter.
app.use("/api/maps/config", rateLimit("mapsConfig"));
app.use("/api/maps/geocode", rateLimit("mapsGeocode"));

// Solo games (shikaku/pips/zip): general reads + image generation share the "game"
// tier; score submission gets a tighter layer on top. Registered before the
// shikaku image routes are mounted below so they're actually covered.
app.use("/api/shikaku/*", rateLimit("game", "shikaku"));
app.use("/api/shikaku/score", rateLimit("score", "shikaku_score"));
app.use("/api/pips/*", rateLimit("game", "pips"));
app.use("/api/pips/score", rateLimit("score", "pips_score"));
app.use("/api/zip/*", rateLimit("game", "zip"));
app.use("/api/zip/score", rateLimit("score", "zip_score"));
// One ticket per ranked run, so the score tier's budget is plenty.
app.use("/api/zip/run", rateLimit("score", "zip_run"));

// Searching a leaderboard is the same route with a `q`, so the extra layer only
// applies when there is one. Both games share the bucket: it is one budget for
// "how much scanning may this IP ask for", not one per board.
const searchLimiter = rateLimit("leaderboardSearch");
const limitLeaderboardSearch: MiddlewareHandler = (c, next) =>
  c.req.query("q") ? searchLimiter(c, next) : next();
app.use("/api/shikaku/leaderboard", limitLeaderboardSearch);
app.use("/api/pips/leaderboard", limitLeaderboardSearch);
app.use("/api/zip/leaderboard", limitLeaderboardSearch);

// Embeds (crawler/social previews) + public read-only lookups.
app.use("/api/embed/*", rateLimit("embed"));
app.use("/api/public/*", rateLimit("publicRead"));
app.use("/api/admin-status", rateLimit("publicRead", "admin_status"));

// Internal / secret-authed routes get light limits (present but generous).
app.use("/api/admin/*", rateLimit("admin"));
app.use("/api/cleanup", rateLimit("cron", "cleanup"));

// Debug build-info runs a DB probe, so keep it modest (on top of the global cap).
app.use("/debug/build-info", rateLimit("debug"));

// ─── Admin routes ──────────────────────────────────────────
app.route("/api/admin", adminRoutes);

// ─── Public endpoints (no auth) ─────────────────────────────
app.route("/api/public", getRestrictedNamesRoute());

// ─── Rich link embeds for crawlers/social previews ──────────
app.route("/api/embed", embedRoutes);

// ─── Shikaku puzzle image generator ─────────────────────────
app.route("/api/shikaku", shikakuImageRoutes);

// ─── Map helpers (Location Signal scaffold) ──────────────────
app.get("/api/maps/config", (c) => {
  const tileUrlTemplate = process.env.MAP_TILE_URL_TEMPLATE ?? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const attribution = process.env.MAP_TILE_ATTRIBUTION ?? "© OpenStreetMap contributors";
  return c.json({
    ok: true,
    provider: "openstreetmap",
    tileUrlTemplate,
    attribution,
    minZoom: 1,
    maxZoom: 18,
  });
});

app.get("/api/maps/geocode", async (c) => {
  const q = c.req.query("q")?.trim() ?? "";
  if (!q || q.length > 200) {
    return c.json({ ok: false, error: "q is required (max 200 chars)" }, 400);
  }

  const endpoint = process.env.MAP_GEOCODE_URL ?? "https://nominatim.openstreetmap.org/search";
  const url = new URL(endpoint);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "games-refac-location-signal/1.0"
      }
    });
    if (!response.ok) {
      return c.json({ ok: false, error: `geocode upstream status ${response.status}` }, 502);
    }

    const payload = (await response.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    return c.json({
      ok: true,
      results: payload.map((entry) => ({
        lat: Number(entry.lat),
        lng: Number(entry.lon),
        label: entry.display_name,
      })),
    });
  } catch (error) {
    return c.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

/** Simple hash of IP+UA to detect session migration between different clients */
function computeFingerprint(ip: string, userAgent: string): string {
  // Quick deterministic hash. Not crypto, just identity binding.
  let hash = 0;
  const str = `${ip}::${userAgent}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

// ── Session fingerprint anomaly tracker ─────────────────────
// Maps sessionId → Set of fingerprints seen. If a session has too many
// distinct fingerprints it's likely being shared/spoofed.
const sessionFingerprints = new Map<string, Set<string>>();
const MAX_FINGERPRINTS_PER_SESSION = 5;

function checkFingerprintAnomaly(sessionId: string, fingerprint: string): boolean {
  if (DEV_MODE) return false;
  let fps = sessionFingerprints.get(sessionId);
  if (!fps) {
    fps = new Set();
    sessionFingerprints.set(sessionId, fps);
  }
  fps.add(fingerprint);
  return fps.size > MAX_FINGERPRINTS_PER_SESSION;
}

/** Persist IP/geo/UA/fingerprint onto a session row (fire-and-forget) */
function updateSessionTracking(sessionId: string, ip: string, region: string, userAgent: string, fingerprint: string) {
  drizzleClient
    .update(sessions)
    .set({ ip, region, userAgent, fingerprint, lastSeen: Date.now() })
    .where(eq(sessions.id, sessionId))
    .then(() => {})
    .catch(() => {});
}

type ResolvedSessionIdentity = {
  sessionId: string;
  name: string | null;
  resetRequired: boolean;
  created: boolean;
  source: "cookie" | "claimed" | "fingerprint" | "created";
};

async function loadSessionCandidate(id: string | null) {
  if (!id) {
    return null;
  }
  const [row] = await drizzleClient
    .select({ id: sessions.id, name: sessions.name, fingerprint: sessions.fingerprint, lastSeen: sessions.lastSeen })
    .from(sessions)
    .where(eq(sessions.id, id))
    .limit(1);

  return (row ?? null) as SessionIdentityCandidate | null;
}

async function resolveSessionIdentity(
  c: { req: { header: (name: string) => string | undefined }; header: (name: string, value: string) => void },
  {
    claimedSessionId,
    claimedName,
    allowCreate,
  }: {
    claimedSessionId: unknown;
    claimedName?: unknown;
    allowCreate: boolean;
  }
): Promise<ResolvedSessionIdentity | null> {
  const { ip, region, userAgent } = await getClientInfo(c.req);
  const fingerprint = computeFingerprint(ip, userAgent);
  const normalizedClaimedId = normalizeSessionId(claimedSessionId);
  const cookieSessionId = readSignedSessionCookie(c.req.header("cookie"), SESSION_COOKIE_SECRET);

  const [claimedSession, cookieSession, fingerprintSession] = await Promise.all([
    loadSessionCandidate(normalizedClaimedId || null),
    loadSessionCandidate(cookieSessionId),
    // In dev mode, skip fingerprint-based session lookup so tabs with different
    // claimed session IDs don't get merged into one session.
    DEV_MODE
      ? Promise.resolve(null)
      : drizzleClient
          .select({ id: sessions.id, name: sessions.name, fingerprint: sessions.fingerprint, lastSeen: sessions.lastSeen })
          .from(sessions)
          .where(eq(sessions.fingerprint, fingerprint))
          .orderBy(desc(sessions.lastSeen))
          .limit(1)
          .then((rows) => rows[0] ?? null),
  ]);

  const decision = chooseCanonicalSession({
    cookieSessionId,
    claimedSessionId: normalizedClaimedId,
    claimedName,
    // In dev mode, pass the claimed session's own fingerprint so the
    // fingerprint-match guard in chooseCanonicalSession always passes.
    // This lets multiple sessions coexist from the same browser.
    fingerprint: DEV_MODE && claimedSession?.fingerprint ? claimedSession.fingerprint : fingerprint,
    cookieSession,
    claimedSession,
    fingerprintSession,
    allowCreate,
    newSessionId: crypto.randomUUID(),
  });

  if (!decision) {
    return null;
  }

  const [override] = await drizzleClient
    .select({ forcedName: adminNameOverrides.forcedName })
    .from(adminNameOverrides)
    .where(eq(adminNameOverrides.sessionId, decision.sessionId))
    .limit(1);

  const existingName = cookieSession?.id === decision.sessionId
    ? cookieSession.name
    : claimedSession?.id === decision.sessionId
      ? claimedSession.name
      : fingerprintSession?.id === decision.sessionId
        ? fingerprintSession.name
        : null;
  const forcedName = sanitizeSessionName(override?.forcedName ?? null);
  const canonicalName = forcedName
    ?? await allowUnrestrictedSessionName(decision.canonicalName)
    ?? await allowUnrestrictedSessionName(existingName)
    ?? fallbackPlayerName(decision.sessionId);
  const now = Date.now();

  if (decision.shouldCreate) {
    await drizzleClient
      .insert(sessions)
      .values({
        id: decision.sessionId,
        name: canonicalName,
        ip,
        region,
        userAgent,
        fingerprint,
        createdAt: now,
        lastSeen: now,
      })
      .onConflictDoUpdate({
        target: sessions.id,
        set: {
          name: canonicalName,
          ip,
          region,
          userAgent,
          fingerprint,
          lastSeen: now,
        },
      });
  } else {
    const normalizedExistingName = sanitizeSessionName(existingName);

    await drizzleClient
      .update(sessions)
      .set({
        ...(canonicalName !== normalizedExistingName ? { name: canonicalName } : {}),
        ip,
        region,
        userAgent,
        fingerprint,
        lastSeen: now,
      })
      .where(eq(sessions.id, decision.sessionId));
  }

  const cookieValue = createSignedSessionCookieValue(decision.sessionId, SESSION_COOKIE_SECRET);
  if (cookieValue) {
    c.header(
      "Set-Cookie",
      serializeSessionCookie(
        cookieValue,
        shouldUseSecureCookie(c.req.header("x-forwarded-proto"), c.req.header("origin"))
      )
    );
  }

  return {
    sessionId: decision.sessionId,
    name: canonicalName,
    // An admin override or a restricted name can replace the claimed name
    // after the decision, and the client has to hear about that too.
    resetRequired: decision.shouldResetSession
      || decision.shouldResetName
      || (claimedName !== undefined && canonicalName !== decision.canonicalName),
    created: decision.shouldCreate,
    source: decision.source,
  };
}

function readRealtimeSessionId(req: Request) {
  const url = new URL(req.url);
  const claimedSessionId = normalizeSessionId(url.searchParams.get("sessionId"));
  const proofSessionId = readSignedSessionProof(url.searchParams.get("sessionProof") ?? undefined, SESSION_COOKIE_SECRET);
  const cookieSessionId = readSignedSessionCookie(req.headers.get("cookie") ?? undefined, SESSION_COOKIE_SECRET);

  if (DEV_MODE) {
    return (proofSessionId ?? claimedSessionId) || cookieSessionId;
  }

  if (proofSessionId && claimedSessionId && proofSessionId !== claimedSessionId) {
    return null;
  }

  const resolvedSessionId = proofSessionId ?? cookieSessionId;
  if (!resolvedSessionId) {
    return null;
  }

  if (claimedSessionId && claimedSessionId !== resolvedSessionId) {
    return null;
  }

  return resolvedSessionId;
}

async function authorizeRealtimeUpgrade(req: Request) {
  const origin = req.headers.get("origin") ?? undefined;
  if (!isAllowedOrigin(origin)) {
    return { ok: false as const, status: 403, error: "Unauthorized origin" };
  }

  const sessionId = readRealtimeSessionId(req);
  if (!sessionId) {
    return { ok: false as const, status: 403, error: "Invalid session proof" };
  }

  const session = await loadSessionCandidate(sessionId);
  if (!session) {
    return { ok: false as const, status: 403, error: "Unknown session" };
  }

  const requestHeaders = {
    header(name: string) {
      return req.headers.get(name) ?? undefined;
    },
  };
  const { ip, region, userAgent } = await getClientInfo(requestHeaders);
  const checker = getBanChecker();
  if (checker) {
    const ban = checker(sessionId, ip, region);
    if (ban) {
      return { ok: false as const, status: 403, error: "Banned" };
    }
  }

  const fingerprint = computeFingerprint(ip, userAgent);
  updateSessionTracking(sessionId, ip, region, userAgent, fingerprint);

  return { ok: true as const, sessionId };
}

app.post("/api/session/sync", async (c) => {
  const body = await c.req.json().catch(() => null) as {
    sessionId?: unknown;
    name?: unknown;
    allowCreate?: boolean;
  } | null;

  const resolved = await resolveSessionIdentity(c, {
    claimedSessionId: body?.sessionId,
    claimedName: body?.name,
    allowCreate: body?.allowCreate !== false,
  });

  if (!resolved) {
    return c.json({ error: "Invalid session" }, 403);
  }

  if (AUTOMATION_AGENT.test(c.req.header("user-agent") ?? "")) {
    addBotSignal(resolved.sessionId, "automationAgent");
  }

  return c.json({
    ok: true,
    sessionId: resolved.sessionId,
    name: resolved.name,
    zeroSessionProof: createSignedSessionProofValue(resolved.sessionId, SESSION_COOKIE_SECRET),
    resetRequired: resolved.resetRequired,
    created: resolved.created,
    source: resolved.source,
  });
});

// ─── Bot check endpoints ───────────────────────────────────
app.get("/api/challenge/status", (c) => c.json(botStatus(requestSessionId(c))));

app.post("/api/challenge/verify", async (c) => {
  const sessionId = requestSessionId(c);
  if (!sessionId) {
    return c.json({ error: "Invalid session" }, 403);
  }
  const body = await c.req.json().catch(() => null) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  // Turnstile tokens are capped at 2048 characters.
  if (!token || token.length > 2048) {
    return c.json({ ok: false, errors: ["invalid-input-response"] }, 400);
  }
  const { ip } = await getClientInfo(c.req);
  const result = await verifyTurnstileToken(token, ip);
  if (!result.ok) {
    return c.json({ ok: false, errors: result.errors }, 400);
  }
  return c.json({ ok: true, ...setBotScore(sessionId, 0) });
});

// Dev tools drive the score directly to test limbo without spamming for real.
if (DEV_MODE) {
  app.post("/api/challenge/dev", async (c) => {
    const body = await c.req.json().catch(() => null) as { score?: unknown } | null;
    const score = typeof body?.score === "number" && Number.isFinite(body.score) ? body.score : null;
    if (score === null) {
      return c.json({ error: "score must be a number" }, 400);
    }
    return c.json(setBotScore(requestSessionId(c), score));
  });
}

// Presence is now driven entirely by the realtime `/ws` connection
// (see presence-server.ts). The old HTTP heartbeat polling endpoint was
// removed. Clients no longer poll; holding the socket open is the signal.

// ─── Custom status in build-info ───────────────────────────
app.get("/api/admin-status", (c) => {
  return c.json({ ok: true, status: getCustomStatus() });
});
const apiStartedAt = new Date().toISOString();

// Load persisted status from DB
loadPersistedStatus().catch(console.error);

function firstNonEmpty(values: Array<string | undefined>) {
  for (const value of values) {
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function getCallerUserId(c: { req: { header: (name: string) => string | undefined } }): string {
  const caller = c.req.header("x-zero-user-id")?.trim();
  return caller && caller.length > 0 && caller.length <= 64 ? caller : "anon";
}

function getCallerProofFromRequest(c: { req: { header: (name: string) => string | undefined } }): string | null {
  const headerProofUserId = readSignedSessionProof(c.req.header(ZERO_SESSION_PROOF_HEADER), SESSION_COOKIE_SECRET);
  if (headerProofUserId) {
    return headerProofUserId;
  }

  const bearerToken = readBearerToken(c.req.header("authorization"));
  if (!bearerToken) {
    return null;
  }

  return readSignedSessionProof(bearerToken, SESSION_COOKIE_SECRET);
}

function getCallerProofUserId(c: { req: { header: (name: string) => string | undefined } }): string | null {
  return getCallerProofFromRequest(c);
}

/**
 * The verified session behind a plain REST call: the signed proof header, then
 * the signed cookie. Dev also takes the bare header, like the rest of the API.
 */
function requestSessionId(c: { req: { header: (name: string) => string | undefined } }): string | null {
  const devClaim = DEV_MODE ? getCallerUserId(c) : "anon";
  return getCallerProofFromRequest(c)
    ?? readSignedSessionCookie(c.req.header("cookie"), SESSION_COOKIE_SECRET)
    ?? (devClaim === "anon" ? null : devClaim);
}

// Scripted HTTP clients announce themselves; browsers never send these.
const AUTOMATION_AGENT = /^$|curl|wget|python-requests|python-urllib|aiohttp|httpx|go-http-client|node-fetch|axios|okhttp|java\/|libwww|scrapy|^node$|^bun\//i;

// What a player in limbo may still do: leave a game, the session bookkeeping
// the app boots with, and expire a phase timer any player in the room can
// expire. Everything else waits for the check.
function limboAllowsMutation(name: string) {
  const [namespace, action] = name.split(".");
  return (namespace === "sessions" && action !== "setName" && action !== "setAvatar")
    || action === "leave"
    || action === "leaveSpectator"
    || action === "advanceTimer";
}

function getVerifiedClaimedSessionId(
  c: { req: { header: (name: string) => string | undefined } },
  claimedSessionId: unknown
) {
  return verifyClaimedSessionId(getCallerUserId(c), getCallerProofUserId(c), claimedSessionId, !DEV_MODE);
}

const MAX_ID_LEN = 64;

function validId(v: unknown): string {
  if (typeof v !== "string") return "";
  const trimmed = v.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_ID_LEN ? trimmed : "";
}

async function assertAllowedSessionNameMutation(name: string, args: unknown, db: Db) {
  if (name !== "sessions.setName" && name !== "sessions.upsert") {
    return;
  }
  if (args == null || typeof args !== "object") {
    return;
  }

  const payload = args as { name?: unknown };
  if (typeof payload.name !== "string") {
    return;
  }

  const restrictedMatch = await findRestrictedNameMatch(payload.name, db);
  if (restrictedMatch) {
    throw new Error("That name is restricted by admin");
  }
}

function normalizeGameType(value: unknown): GameType | null {
  if (
    value === "imposter" ||
    value === "password" ||
    value === "chain_reaction" ||
    value === "shade_signal" ||
    value === "location_signal"
  ) {
    return value;
  }
  return null;
}

async function canAccessGameSecret(gameType: GameType, gameId: string, sessionId: string) {
  if (gameType === "imposter") {
    const [game] = await drizzleClient
      .select({ phase: imposterGames.phase, players: imposterGames.players })
      .from(imposterGames)
      .where(eq(imposterGames.id, gameId));
    if (!game) return { allowed: false, reason: "Game not found", status: 404 as const };
    const me = game.players.find((p) => p.sessionId === sessionId);
    if (!me) return { allowed: false, reason: "Forbidden", status: 403 as const };
    const revealPhase = game.phase === "results" || game.phase === "finished" || game.phase === "ended";
    if (!revealPhase && game.phase !== "playing" && game.phase !== "voting") {
      return { allowed: false, reason: "Forbidden", status: 403 as const };
    }
    if (!revealPhase && me.role === "imposter") {
      return { allowed: false, reason: "Forbidden", status: 403 as const };
    }
    return { allowed: true, myRole: me.role ?? "player" };
  }

  if (gameType === "password") {
    const [game] = await drizzleClient
      .select({ phase: passwordGames.phase, teams: passwordGames.teams, activeRounds: passwordGames.activeRounds })
      .from(passwordGames)
      .where(eq(passwordGames.id, gameId));
    if (!game) return { allowed: false, reason: "Game not found", status: 404 as const };
    const team = game.teams.find((t) => t.members.includes(sessionId));
    if (!team) return { allowed: false, reason: "Forbidden", status: 403 as const };
    const inActiveRound = game.phase === "playing";
    if (inActiveRound) {
      const isGuesser = game.activeRounds.some((round) => round.guesserId === sessionId);
      if (isGuesser) {
        return { allowed: false, reason: "Forbidden", status: 403 as const };
      }
    }
    return { allowed: true, myRole: "player" as const };
  }

  if (gameType === "shade_signal") {
    const [game] = await drizzleClient
      .select({ phase: shadeSignalGames.phase, leaderId: shadeSignalGames.leaderId, players: shadeSignalGames.players })
      .from(shadeSignalGames)
      .where(eq(shadeSignalGames.id, gameId));
    if (!game) return { allowed: false, reason: "Game not found", status: 404 as const };
    const isPlayer = game.players.some((p) => p.sessionId === sessionId);
    if (!isPlayer) return { allowed: false, reason: "Forbidden", status: 403 as const };
    const revealPhase = game.phase === "reveal" || game.phase === "finished" || game.phase === "ended";
    if (!revealPhase && game.leaderId !== sessionId) {
      return { allowed: false, reason: "Forbidden", status: 403 as const };
    }
    return { allowed: true, myRole: game.leaderId === sessionId ? "leader" : "player" };
  }

  if (gameType === "location_signal") {
    const [game] = await drizzleClient
      .select({ phase: locationSignalGames.phase, leaderId: locationSignalGames.leaderId, players: locationSignalGames.players })
      .from(locationSignalGames)
      .where(eq(locationSignalGames.id, gameId));
    if (!game) return { allowed: false, reason: "Game not found", status: 404 as const };
    const isPlayer = game.players.some((p) => p.sessionId === sessionId);
    if (!isPlayer) return { allowed: false, reason: "Forbidden", status: 403 as const };
    const revealPhase = game.phase === "reveal" || game.phase === "finished" || game.phase === "ended";
    if (!revealPhase && game.leaderId !== sessionId) {
      return { allowed: false, reason: "Forbidden", status: 403 as const };
    }
    return { allowed: true, myRole: game.leaderId === sessionId ? "leader" : "player" };
  }

  // Chain words are sealed for the server's own guess checks. The key would
  // hand a player their own answers, so no client ever gets it.
  return { allowed: false, reason: "Forbidden", status: 403 as const };
}


app.post("/api/game-secret/key", async (c) => {
  const body = await c.req.json().catch(() => null) as {
    gameType?: unknown;
    gameId?: unknown;
    sessionId?: unknown;
  } | null;

  const gameType = normalizeGameType(body?.gameType);
  const gameId = validId(body?.gameId);
  const claimedSessionId = validId(body?.sessionId);
  if (!gameType || !gameId || !claimedSessionId) {
    return c.json({ error: "gameType, gameId, sessionId required" }, 400);
  }

  const verifiedClaimedSessionId = getVerifiedClaimedSessionId(c, claimedSessionId);
  if (!verifiedClaimedSessionId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const resolvedIdentity = await resolveSessionIdentity(c, {
    claimedSessionId: verifiedClaimedSessionId,
    allowCreate: false,
  });
  if (!resolvedIdentity) {
    return c.json({ error: "Invalid session" }, 403);
  }
  const sessionId = resolvedIdentity.sessionId;

  const access = await canAccessGameSecret(gameType, gameId, sessionId);
  if (!access.allowed) {
    return c.json({ error: access.reason }, access.status);
  }

  const key = await getOrCreateGameKey(gameType, gameId);

  return c.json({ ok: true, key, myRole: access.myRole ?? null });
});

// The imposter back-channel's key. Opposite audience from the secret-word key
// above: only imposters get it during play (so they can read their own channel),
// and everyone once the game is revealed/over. See imposterChatKeyId.
app.post("/api/game-secret/imposter-chat-key", async (c) => {
  const body = await c.req.json().catch(() => null) as {
    gameId?: unknown;
    sessionId?: unknown;
  } | null;

  const gameId = validId(body?.gameId);
  const claimedSessionId = validId(body?.sessionId);
  if (!gameId || !claimedSessionId) {
    return c.json({ error: "gameId, sessionId required" }, 400);
  }

  const verifiedClaimedSessionId = getVerifiedClaimedSessionId(c, claimedSessionId);
  if (!verifiedClaimedSessionId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const resolvedIdentity = await resolveSessionIdentity(c, {
    claimedSessionId: verifiedClaimedSessionId,
    allowCreate: false,
  });
  if (!resolvedIdentity) {
    return c.json({ error: "Invalid session" }, 403);
  }
  const sessionId = resolvedIdentity.sessionId;

  const [game] = await drizzleClient
    .select({ phase: imposterGames.phase, players: imposterGames.players })
    .from(imposterGames)
    .where(eq(imposterGames.id, gameId));
  if (!game) {
    return c.json({ error: "Game not found" }, 404);
  }
  const me = game.players.find((p) => p.sessionId === sessionId);
  if (!me) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const revealPhase = game.phase === "results" || game.phase === "finished" || game.phase === "ended";
  if (me.role !== "imposter" && !revealPhase) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const key = await getOrCreateGameKey("imposter", imposterChatKeyId(gameId));
  return c.json({ ok: true, key });
});

function detectPlatform() {
  if (process.env.VERCEL === "1") {
    return "vercel";
  }
  if (process.env.RAILWAY_ENVIRONMENT) {
    return "railway";
  }
  return "unknown";
}

type DatabaseProbe = {
  state: "ok" | "unknown" | "offline";
  reason: string;
  key: string;
  expectedValue: string;
  actualValue: string;
  checkedAt: string;
};

async function probeDatabaseStatus(): Promise<DatabaseProbe> {
  const checkedAt = new Date().toISOString();

  try {
    const rows = await drizzleClient
      .select({ value: statusTable.value })
      .from(statusTable)
      .where(eq(statusTable.key, DB_STATUS_KEY))
      .limit(1);

    const actualValue = rows[0]?.value ?? "";

    // The query answering is the health check. A missing sentinel row just
    // means nobody seeded it, and used to paint every fresh database red. Only
    // a row someone set to something else counts as a deliberate warning.
    if (actualValue && actualValue !== DB_STATUS_EXPECTED_VALUE) {
      return {
        state: "unknown",
        reason: `status value mismatch for key '${DB_STATUS_KEY}'`,
        key: DB_STATUS_KEY,
        expectedValue: DB_STATUS_EXPECTED_VALUE,
        actualValue,
        checkedAt
      };
    }

    return {
      state: "ok",
      reason: "",
      key: DB_STATUS_KEY,
      expectedValue: DB_STATUS_EXPECTED_VALUE,
      actualValue,
      checkedAt
    };
  } catch (error) {
    return {
      state: "offline",
      reason: error instanceof Error ? error.message : String(error),
      key: DB_STATUS_KEY,
      expectedValue: DB_STATUS_EXPECTED_VALUE,
      actualValue: "",
      checkedAt
    };
  }
}

// ─── Solo leaderboard standings window ───────────────────────

/**
 * Narrows an already-ranked score query down to the slice the end screen shows:
 * the top 3, the caller's own rank plus and minus 3, and the bottom 3. It is one
 * round trip on purpose, so the client never has to page around hunting for
 * itself. `ranked` must select `session_id` plus a `rank` and a `total` window
 * column; every other column comes back untouched under its raw SQL name.
 *
 * With no score of your own, `me.rank` is NULL, the abs() test is NULL, and you
 * are left with just the top and bottom, which is the right answer.
 */
async function selectScoreWindow(ranked: SQL, sessionId: string | null) {
  const result = await drizzleClient.execute(sql`
    WITH ranked AS (${ranked}),
    me AS (SELECT min(rank) AS rank FROM ranked WHERE session_id = ${sessionId ?? ""})
    SELECT * FROM ranked
    WHERE rank <= 3 OR rank > total - 3 OR abs(rank - (SELECT rank FROM me)) <= 3
    ORDER BY rank
  `);
  const rows = (Array.isArray(result) ? result : result.rows ?? []) as Record<string, any>[];
  return {
    total: Number(rows[0]?.total ?? 0),
    rows: rows.map((row): Record<string, any> & { rank: number; isOwn: boolean } => ({
      ...row,
      rank: Number(row.rank),
      isOwn: sessionId != null && row.session_id === sessionId,
    })),
  };
}

// ─── Shikaku solo game endpoints ─────────────────────────────

// Server-side score calculation uses the shared engine formula exactly.
const SHIKAKU_PUZZLES = ENGINE_SHIKAKU_PUZZLES;

const SHIKAKU_AUTO_BAN_MIN_TIME_MS: Record<string, number> = {
  easy: 5_000,
  medium: 10_000,
  hard: 15_000,
  expert: 20_000,
};

type ShikakuDifficulty = (typeof SHIKAKU_VALID_DIFFS)[number];

type ShikakuScoreRequestBody = {
  sessionId?: string;
  name?: string;
  seed?: number;
  difficulty?: string;
  score?: number;
  timeMs?: number;
  puzzleCount?: number;
  replayData?: unknown;
};

type ShikakuScoreCandidate = {
  effectiveSessionId: string;
  effectiveName: string;
  seed: number;
  difficulty: ShikakuDifficulty;
  score: number;
  timeMs: number;
  puzzleCount: number;
  replayData: unknown;
  callerIp: string;
  callerRegion: string;
  callerUA: string;
};

type ShikakuScoreErrorCode =
  | "invalid-body"
  | "invalid-session"
  | "invalid-session-id"
  | "invalid-name"
  | "invalid-seed"
  | "invalid-difficulty"
  | "invalid-score"
  | "invalid-time"
  | "invalid-puzzle-count"
  | "banned"
  | "too-fast"
  | "too-slow"
  | "inflated-score"
  | "invalid-replay"
  | "invalid-generated-run"
  | "non-canonical-solution"
  | "duplicate";

type ShikakuScoreValidationResult =
  | {
      ok: false;
      status: number;
      error: string;
      reason: string;
      code: ShikakuScoreErrorCode;
    }
  | {
      ok: true;
      candidate: ShikakuScoreCandidate;
    };

type ShikakuScoreAssessment =
  | {
      kind: "error";
      status: number;
      error: string;
      reason: string;
      code: ShikakuScoreErrorCode;
    }
  | {
      kind: "accepted-no-store";
      reason: string;
    }
  | {
      kind: "eligible";
      willReplace: boolean;
      lowestScoreId: string | null;
      replayData: unknown;
    };

async function buildShikakuScoreCandidate(
  c: { req: { header: (name: string) => string | undefined }; header: (name: string, value: string) => void },
  body: ShikakuScoreRequestBody | null
): Promise<ShikakuScoreValidationResult> {
  if (!body) {
    return {
      ok: false,
      status: 400,
      error: "Invalid body",
      reason: "This run could not be verified because the score payload was invalid.",
      code: "invalid-body",
    };
  }

  const { sessionId, name, seed, difficulty, score, timeMs, puzzleCount, replayData } = body;
  const verifiedClaimedSessionId = getVerifiedClaimedSessionId(c, sessionId);
  if (!verifiedClaimedSessionId) {
    return {
      ok: false,
      status: 403,
      error: "Invalid session",
      reason: "Your session could not be verified for this run.",
      code: "invalid-session",
    };
  }

  const resolvedIdentity = await resolveSessionIdentity(c, {
    claimedSessionId: verifiedClaimedSessionId,
    claimedName: name,
    allowCreate: false,
  });

  if (!resolvedIdentity) {
    return {
      ok: false,
      status: 403,
      error: "Invalid session",
      reason: "Your session could not be verified for this run.",
      code: "invalid-session",
    };
  }

  const effectiveSessionId = resolvedIdentity.sessionId;
  const effectiveName = sanitizeSessionName(resolvedIdentity.name) ?? fallbackPlayerName(effectiveSessionId);

  if (!effectiveSessionId || effectiveSessionId.length > 64) {
    return {
      ok: false,
      status: 400,
      error: "Invalid sessionId",
      reason: "This run could not be verified because the session ID was invalid.",
      code: "invalid-session-id",
    };
  }
  if (typeof name === "string" && name.length > 50) {
    return {
      ok: false,
      status: 400,
      error: "Invalid name",
      reason: "Your player name is too long to submit.",
      code: "invalid-name",
    };
  }
  if (typeof seed !== "number" || !Number.isInteger(seed)) {
    return {
      ok: false,
      status: 400,
      error: "Invalid seed",
      reason: "This run could not be verified because the puzzle seed was invalid.",
      code: "invalid-seed",
    };
  }
  if (!isShikakuDifficulty(difficulty)) {
    return {
      ok: false,
      status: 400,
      error: "Invalid difficulty",
      reason: "This run could not be verified because the difficulty was invalid.",
      code: "invalid-difficulty",
    };
  }
  if (typeof score !== "number" || score < 0 || score > 100000) {
    return {
      ok: false,
      status: 400,
      error: "Invalid score",
      reason: "This run could not be verified because the score was invalid.",
      code: "invalid-score",
    };
  }
  if (typeof timeMs !== "number" || timeMs < 0 || timeMs > 9_000_000) {
    return {
      ok: false,
      status: 400,
      error: "Invalid timeMs",
      reason: "This run could not be verified because the recorded time was invalid.",
      code: "invalid-time",
    };
  }
  if (typeof puzzleCount !== "number" || puzzleCount < 1 || puzzleCount > 20) {
    return {
      ok: false,
      status: 400,
      error: "Invalid puzzleCount",
      reason: "This run could not be verified because the puzzle count was invalid.",
      code: "invalid-puzzle-count",
    };
  }

  const { ip: callerIp, region: callerRegion, userAgent: callerUA } = await getClientInfo(c.req);

  return {
    ok: true,
    candidate: {
      effectiveSessionId,
      effectiveName,
      seed,
      difficulty,
      score,
      timeMs,
      puzzleCount,
      replayData,
      callerIp,
      callerRegion,
      callerUA,
    },
  };
}

async function assessShikakuScoreCandidate(candidate: ShikakuScoreCandidate): Promise<ShikakuScoreAssessment> {
  if (isShikakuBanned(candidate.effectiveSessionId)) {
    return {
      kind: "error",
      status: 403,
      error: "Score rejected",
      reason: "This session is not allowed to submit Shikaku scores.",
      code: "banned",
    };
  }

  if (isBanned(candidate.effectiveSessionId, candidate.callerIp, candidate.callerRegion)) {
    return {
      kind: "error",
      status: 403,
      error: "Score rejected",
      reason: "This session is not allowed to submit Shikaku scores.",
      code: "banned",
    };
  }

  const minTime = SHIKAKU_MIN_TIME_MS[candidate.difficulty] ?? 15_000;
  if (candidate.timeMs < minTime) {
    return {
      kind: "error",
      status: 400,
      error: "Score rejected",
      reason: `This run was faster than the minimum verifiable time for ${candidate.difficulty}.`,
      code: "too-fast",
    };
  }

  const maxTime = SHIKAKU_MAX_TIME_MS[candidate.difficulty] ?? 3_600_000;
  if (candidate.timeMs > maxTime) {
    return {
      kind: "error",
      status: 400,
      error: "Score rejected",
      reason: `This run exceeded the maximum allowed time for ${candidate.difficulty}.`,
      code: "too-slow",
    };
  }

  const maxLegitScore = shikakuMaxScore(candidate.timeMs, candidate.difficulty);
  if (candidate.score > maxLegitScore) {
    return {
      kind: "error",
      status: 400,
      error: "Score rejected",
      reason: "This score is higher than the maximum verified score for the recorded time.",
      code: "inflated-score",
    };
  }

  const rankedValidation = validateRankedShikakuRun({
    seed: candidate.seed,
    difficulty: candidate.difficulty,
    score: candidate.score,
    timeMs: candidate.timeMs,
    puzzleCount: candidate.puzzleCount,
    replayData: candidate.replayData,
  });
  if (!rankedValidation.ok) {
    return {
      kind: "error",
      status: 400,
      error: "Score rejected",
      reason: rankedValidation.reason,
      code: rankedValidation.code,
    };
  }

  const [existing] = await drizzleClient
    .select({ id: shikakuScores.id })
    .from(shikakuScores)
    .where(and(
      eq(shikakuScores.sessionId, candidate.effectiveSessionId),
      eq(shikakuScores.seed, candidate.seed),
      eq(shikakuScores.difficulty, candidate.difficulty)
    ))
    .limit(1);
  if (existing) {
    return {
      kind: "error",
      status: 409,
      error: "Score already submitted for this run",
      reason: "This run has already been submitted to the leaderboard.",
      code: "duplicate",
    };
  }

  const sessionScores = await drizzleClient
    .select({ id: shikakuScores.id, score: shikakuScores.score })
    .from(shikakuScores)
    .where(eq(shikakuScores.sessionId, candidate.effectiveSessionId))
    .orderBy(desc(shikakuScores.score));

  if (sessionScores.length >= SHIKAKU_MAX_SCORES_PER_SESSION) {
    const lowest = sessionScores[sessionScores.length - 1] ?? null;
    if (lowest && candidate.score <= lowest.score) {
      return {
        kind: "accepted-no-store",
        reason: "This score was verified, but it is not high enough to enter your saved top 20.",
      };
    }

    return {
      kind: "eligible",
      willReplace: Boolean(lowest),
      lowestScoreId: lowest?.id ?? null,
      replayData: rankedValidation.replayData,
    };
  }

  return {
    kind: "eligible",
    willReplace: false,
    lowestScoreId: null,
    replayData: rankedValidation.replayData,
  };
}

// ── Shikaku auto-ban cache ──────────────────────────────────
const shikakuBanCache = new Set<string>();

async function loadShikakuBans() {
  try {
    const rows = await drizzleClient
      .select({ sessionId: shikakuBannedSessions.sessionId })
      .from(shikakuBannedSessions);
    for (const r of rows) shikakuBanCache.add(r.sessionId);
  } catch {
    // table may not exist yet
  }
}
loadShikakuBans().catch(console.error);

// ── In-memory abuse tracker ─────────────────────────────────
// Tracks suspicious activity per session: rapid submissions, impossible
// scores, tampered times, etc.  3 strikes → auto-ban.
const abuseStrikes = new Map<string, { count: number; reasons: string[]; firstAt: number }>();
const ABUSE_STRIKE_LIMIT = 3;
const ABUSE_WINDOW_MS = 30 * 60 * 1000; // 30 min window

function recordStrike(sessionId: string, reason: string): boolean {
  const now = Date.now();
  let entry = abuseStrikes.get(sessionId);
  if (!entry || now - entry.firstAt > ABUSE_WINDOW_MS) {
    entry = { count: 0, reasons: [], firstAt: now };
  }
  entry.count++;
  entry.reasons.push(reason);
  abuseStrikes.set(sessionId, entry);
  return entry.count >= ABUSE_STRIKE_LIMIT;
}

async function autoBanSession(sessionId: string, reasons: string[]) {
  const reason = `Auto-ban: ${reasons.join("; ")}`;
  shikakuBanCache.add(sessionId);
  try {
    await drizzleClient
      .insert(shikakuBannedSessions)
      .values({ sessionId, reason, violations: reasons.length, createdAt: Date.now() })
      .onConflictDoUpdate({
        target: shikakuBannedSessions.sessionId,
        set: {
          reason,
          violations: sql`${shikakuBannedSessions.violations} + ${reasons.length}`,
        },
      });
  } catch {
    // DB write failed, in-memory ban still active
  }
}

function isShikakuBanned(sessionId: string): boolean {
  return shikakuBanCache.has(sessionId);
}

// Rate limits for /api/shikaku/* (incl. score) are registered up top, before
// the shikaku image routes are mounted; see the "Rate limiting" block.
app.get("/api/shikaku/leaderboard", async (c) => {
  const difficulty = c.req.query("difficulty")?.trim() ?? "easy";
  if (!isShikakuDifficulty(difficulty)) {
    return c.json({ error: "Invalid difficulty" }, 400);
  }
  const limitParam = parseInt(c.req.query("limit") ?? "10", 10);
  const limit = Math.min(Math.max(1, limitParam), 50);
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
  const offset = (page - 1) * limit;
  const mineOnly = ["1", "true", "yes"].includes((c.req.query("mineOnly") ?? "").toLowerCase());
  const requestedSessionId = c.req.query("sessionId")?.trim() ?? null;
  const resolvedIdentity = requestedSessionId
    ? await resolveSessionIdentity(c, { claimedSessionId: requestedSessionId, allowCreate: false })
    : null;
  const sessionIdParam = resolvedIdentity?.sessionId ?? (normalizeSessionId(requestedSessionId) || null);
  const filters = [eq(shikakuScores.difficulty, difficulty)];

  // The end screen's standings slice, in one round trip. See selectScoreWindow.
  if (c.req.query("window") === "me") {
    const { rows, total } = await selectScoreWindow(
      sql`
        SELECT id, name, score, time_ms, difficulty, created_at, seed, session_id,
               row_number() OVER (ORDER BY score DESC, time_ms ASC, created_at ASC) AS rank,
               count(*) OVER () AS total
        FROM shikaku_scores
        WHERE difficulty = ${difficulty}
      `,
      sessionIdParam,
    );
    const own = rows.find((row) => row.isOwn);
    return c.json({
      entries: rows.map((row) => ({
        id: row.id,
        name: row.name,
        score: Number(row.score),
        timeMs: Number(row.time_ms),
        difficulty: row.difficulty,
        createdAt: Number(row.created_at),
        seed: Number(row.seed),
        rank: row.rank,
        isOwn: row.isOwn,
      })),
      personalBest: own ? { score: Number(own.score), timeMs: Number(own.time_ms), rank: own.rank } : null,
      page: 1,
      pageSize: rows.length,
      total,
      totalPages: 1,
    });
  }

  if (mineOnly) {
    if (!sessionIdParam) {
      return c.json({ entries: [], personalBest: null, page: 1, pageSize: limit, total: 0, totalPages: 1 });
    }
    filters.push(eq(shikakuScores.sessionId, sessionIdParam));
  }

  // Search. Ranking happens before the filter so a match keeps the standing it
  // actually holds on the board, and count(*) OVER () pages the matches without
  // a second round trip.
  const search = parseLeaderboardSearch(c.req.query("q"));
  if (search) {
    const result = await drizzleClient.execute(sql`
      WITH ranked AS (
        SELECT id, name, score, time_ms, difficulty, created_at, seed, session_id,
               row_number() OVER (ORDER BY score DESC, time_ms ASC, created_at ASC) AS rank
        FROM shikaku_scores
        WHERE difficulty = ${difficulty}
        ${mineOnly ? sql`AND session_id = ${sessionIdParam}` : sql``}
      )
      SELECT *, count(*) OVER () AS match_total
      FROM ranked
      WHERE name ILIKE ${search.namePattern} ESCAPE '\'
      ${search.seed != null ? sql`OR seed = ${search.seed}` : sql``}
      ORDER BY rank
      LIMIT ${limit} OFFSET ${offset}
    `);
    const rows = (Array.isArray(result) ? result : result.rows ?? []) as Record<string, any>[];
    const matchTotal = Number(rows[0]?.match_total ?? 0);
    return c.json({
      entries: rows.map((row) => ({
        id: row.id,
        name: row.name,
        score: Number(row.score),
        timeMs: Number(row.time_ms),
        difficulty: row.difficulty,
        createdAt: Number(row.created_at),
        seed: Number(row.seed),
        rank: Number(row.rank),
        isOwn: sessionIdParam != null && row.session_id === sessionIdParam,
      })),
      personalBest: null,
      page,
      pageSize: limit,
      total: matchTotal,
      totalPages: Math.max(1, Math.ceil(matchTotal / limit)),
    });
  }

  const [rows, totalResult] = await Promise.all([
    drizzleClient
      .select({
        id: shikakuScores.id,
        name: shikakuScores.name,
        score: shikakuScores.score,
        timeMs: shikakuScores.timeMs,
        difficulty: shikakuScores.difficulty,
        createdAt: shikakuScores.createdAt,
        sessionId: shikakuScores.sessionId,
        seed: shikakuScores.seed,
      })
      .from(shikakuScores)
      .where(and(...filters))
      .orderBy(desc(shikakuScores.score), asc(shikakuScores.timeMs), asc(shikakuScores.createdAt))
      .limit(limit)
      .offset(offset),
    drizzleClient
      .select({ total: sql<number>`count(*)::int` })
      .from(shikakuScores)
      .where(and(...filters)),
  ]);
  const totalCount = totalResult[0]?.total ?? 0;

  let personalBest: { score: number; timeMs: number; rank: number } | null = null;
  if (sessionIdParam && sessionIdParam.length <= 64) {
    const [pb] = await drizzleClient
      .select({ score: shikakuScores.score, timeMs: shikakuScores.timeMs })
      .from(shikakuScores)
      .where(and(eq(shikakuScores.difficulty, difficulty), eq(shikakuScores.sessionId, sessionIdParam)))
      .orderBy(desc(shikakuScores.score), asc(shikakuScores.timeMs), asc(shikakuScores.createdAt))
      .limit(1);
    if (pb) {
      const [countResult] = await drizzleClient
        .select({ count: sql<number>`count(*)::int` })
        .from(shikakuScores)
        .where(and(
          eq(shikakuScores.difficulty, difficulty),
          or(
            gt(shikakuScores.score, pb.score),
            and(eq(shikakuScores.score, pb.score), lt(shikakuScores.timeMs, pb.timeMs))
          )
        ));
      personalBest = { score: pb.score, timeMs: pb.timeMs, rank: Number(countResult?.count ?? 0) + 1 };
    }
  }

  return c.json({
    entries: rows.map((r) => ({
      id: r.id,
      name: r.name,
      score: r.score,
      timeMs: r.timeMs,
      difficulty: r.difficulty,
      createdAt: r.createdAt,
      seed: r.seed,
      isOwn: sessionIdParam ? r.sessionId === sessionIdParam : false,
    })),
    personalBest,
    page,
    pageSize: limit,
    total: totalCount,
    totalPages: Math.ceil(totalCount / limit),
  });
});

app.post("/api/shikaku/score/eligibility", async (c) => {
  const body = await c.req.json().catch(() => null) as ShikakuScoreRequestBody | null;
  const validation = await buildShikakuScoreCandidate(c, body);

  if (!validation.ok) {
    return c.json({
      ok: true,
      canSubmit: false,
      code: validation.code,
      reason: validation.reason,
    });
  }

  const assessment = await assessShikakuScoreCandidate(validation.candidate);
  if (assessment.kind === "eligible") {
    return c.json({
      ok: true,
      canSubmit: true,
      code: "eligible",
      reason: assessment.willReplace
        ? "This score is verified and will replace your current lowest saved score."
        : "This score is verified and ready to submit.",
      willReplace: assessment.willReplace,
    });
  }

  if (assessment.kind === "accepted-no-store") {
    return c.json({
      ok: true,
      canSubmit: false,
      code: "not-ranked",
      reason: assessment.reason,
    });
  }

  return c.json({
    ok: true,
    canSubmit: false,
    code: assessment.code,
    reason: assessment.reason,
  });
});

app.post("/api/shikaku/score", async (c) => {
  const body = await c.req.json().catch(() => null) as ShikakuScoreRequestBody | null;
  const validation = await buildShikakuScoreCandidate(c, body);
  if (!validation.ok) {
    return c.json({ error: validation.error }, { status: validation.status as 400 | 403 | 409 });
  }

  const { candidate } = validation;

  const fp = computeFingerprint(candidate.callerIp, candidate.callerUA);
  const fpAnomaly = checkFingerprintAnomaly(candidate.effectiveSessionId, fp);
  if (fpAnomaly) {
    const shouldBan = recordStrike(candidate.effectiveSessionId, "fingerprint anomaly: too many distinct clients");
    if (shouldBan) {
      const entry = abuseStrikes.get(candidate.effectiveSessionId);
      await autoBanSession(candidate.effectiveSessionId, entry?.reasons ?? ["fingerprint abuse"]);
    }
  }

  const assessment = await assessShikakuScoreCandidate(candidate);
  if (assessment.kind === "error") {
    if (assessment.code === "too-fast") {
      const autoBanThreshold = SHIKAKU_AUTO_BAN_MIN_TIME_MS[candidate.difficulty] ?? 5_000;
      if (candidate.timeMs < autoBanThreshold) {
        const shouldBan = recordStrike(candidate.effectiveSessionId, `impossibly fast: ${candidate.timeMs}ms on ${candidate.difficulty}`);
        if (shouldBan) {
          const entry = abuseStrikes.get(candidate.effectiveSessionId);
          await autoBanSession(candidate.effectiveSessionId, entry?.reasons ?? ["speed abuse"]);
        }
      }
    }

    if (assessment.code === "inflated-score") {
      const maxLegitScore = shikakuMaxScore(candidate.timeMs, candidate.difficulty);
      const shouldBan = recordStrike(candidate.effectiveSessionId, `inflated score: ${candidate.score} > max ${maxLegitScore}`);
      if (shouldBan) {
        const entry = abuseStrikes.get(candidate.effectiveSessionId);
        await autoBanSession(candidate.effectiveSessionId, entry?.reasons ?? ["score manipulation"]);
      }
    }

    if (assessment.code === "invalid-replay" || assessment.code === "invalid-generated-run" || assessment.code === "non-canonical-solution") {
      const shouldBan = recordStrike(candidate.effectiveSessionId, `shikaku replay validation failed: ${assessment.code}`);
      if (shouldBan) {
        const entry = abuseStrikes.get(candidate.effectiveSessionId);
        await autoBanSession(candidate.effectiveSessionId, entry?.reasons ?? ["replay manipulation"]);
      }
    }

    return c.json({ error: assessment.error }, { status: assessment.status as 400 | 403 | 409 });
  }

  if (assessment.kind === "accepted-no-store") {
    return c.json({ ok: true, id: null, replaced: false, reason: assessment.reason });
  }

  if (assessment.willReplace && assessment.lowestScoreId) {
    await drizzleClient
      .delete(shikakuScores)
      .where(eq(shikakuScores.id, assessment.lowestScoreId));
  }

  const id = crypto.randomUUID();
  await drizzleClient.insert(shikakuScores).values({
    id,
    sessionId: candidate.effectiveSessionId,
    name: candidate.effectiveName.slice(0, 50),
    seed: candidate.seed,
    difficulty: candidate.difficulty,
    score: candidate.score,
    timeMs: candidate.timeMs,
    puzzleCount: candidate.puzzleCount,
    replayData: assessment.replayData,
    createdAt: Date.now(),
  });

  return c.json({ ok: true, id, replaced: assessment.willReplace });
});

// ─── Pips solo game endpoints ────────────────────────────────

const PIPS_PUZZLES = ENGINE_PIPS_PUZZLES;

const PIPS_AUTO_BAN_MIN_TIME_MS = 4_000;

type PipsScoreRequestBody = {
  sessionId?: string;
  name?: string;
  seed?: number;
  totalMs?: number;
  easyMs?: number;
  mediumMs?: number;
  hardMs?: number;
  puzzleCount?: number;
  replayData?: unknown;
};

type PipsScoreCandidate = {
  effectiveSessionId: string;
  effectiveName: string;
  seed: number;
  totalMs: number;
  easyMs: number;
  mediumMs: number;
  hardMs: number;
  puzzleCount: number;
  replayData: unknown;
  callerIp: string;
  callerRegion: string;
  callerUA: string;
};

type PipsScoreErrorCode =
  | "invalid-body"
  | "invalid-session"
  | "invalid-session-id"
  | "invalid-name"
  | "invalid-seed"
  | "invalid-time"
  | "invalid-splits"
  | "invalid-puzzle-count"
  | "banned"
  | "too-fast"
  | "too-slow"
  | "invalid-replay"
  | "invalid-generated-run"
  | "non-canonical-solution"
  | "duplicate";

type PipsScoreValidationResult =
  | {
      ok: false;
      status: number;
      error: string;
      reason: string;
      code: PipsScoreErrorCode;
    }
  | {
      ok: true;
      candidate: PipsScoreCandidate;
    };

type PipsScoreAssessment =
  | {
      kind: "error";
      status: number;
      error: string;
      reason: string;
      code: PipsScoreErrorCode;
    }
  | {
      kind: "accepted-no-store";
      reason: string;
    }
  | {
      kind: "eligible";
      willReplace: boolean;
      worstScoreId: string | null;
      replayData: unknown;
    };

function isValidPipsTime(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

async function buildPipsScoreCandidate(
  c: { req: { header: (name: string) => string | undefined }; header: (name: string, value: string) => void },
  body: PipsScoreRequestBody | null
): Promise<PipsScoreValidationResult> {
  if (!body) {
    return {
      ok: false,
      status: 400,
      error: "Invalid body",
      reason: "This run could not be verified because the score payload was invalid.",
      code: "invalid-body",
    };
  }

  const { sessionId, name, seed, totalMs, easyMs, mediumMs, hardMs, puzzleCount, replayData } = body;
  const verifiedClaimedSessionId = getVerifiedClaimedSessionId(c, sessionId);
  if (!verifiedClaimedSessionId) {
    return {
      ok: false,
      status: 403,
      error: "Invalid session",
      reason: "Your session could not be verified for this run.",
      code: "invalid-session",
    };
  }

  const resolvedIdentity = await resolveSessionIdentity(c, {
    claimedSessionId: verifiedClaimedSessionId,
    claimedName: name,
    allowCreate: false,
  });

  if (!resolvedIdentity) {
    return {
      ok: false,
      status: 403,
      error: "Invalid session",
      reason: "Your session could not be verified for this run.",
      code: "invalid-session",
    };
  }

  const effectiveSessionId = resolvedIdentity.sessionId;
  const effectiveName = sanitizeSessionName(resolvedIdentity.name) ?? fallbackPlayerName(effectiveSessionId);

  if (!effectiveSessionId || effectiveSessionId.length > 64) {
    return {
      ok: false,
      status: 400,
      error: "Invalid sessionId",
      reason: "This run could not be verified because the session ID was invalid.",
      code: "invalid-session-id",
    };
  }
  if (typeof name === "string" && name.length > 50) {
    return {
      ok: false,
      status: 400,
      error: "Invalid name",
      reason: "Your player name is too long to submit.",
      code: "invalid-name",
    };
  }
  if (typeof seed !== "number" || !Number.isInteger(seed)) {
    return {
      ok: false,
      status: 400,
      error: "Invalid seed",
      reason: "This run could not be verified because the puzzle seed was invalid.",
      code: "invalid-seed",
    };
  }
  if (!isValidPipsTime(totalMs) || !isValidPipsTime(easyMs) || !isValidPipsTime(mediumMs) || !isValidPipsTime(hardMs)) {
    return {
      ok: false,
      status: 400,
      error: "Invalid time",
      reason: "This run could not be verified because the recorded time was invalid.",
      code: "invalid-time",
    };
  }
  if (easyMs < PIPS_MIN_SPLIT_TIME_MS || mediumMs < PIPS_MIN_SPLIT_TIME_MS || hardMs < PIPS_MIN_SPLIT_TIME_MS) {
    return {
      ok: false,
      status: 400,
      error: "Invalid splits",
      reason: "This run could not be verified because one of the split times was too short.",
      code: "invalid-splits",
    };
  }
  if (typeof puzzleCount !== "number" || puzzleCount !== PIPS_PUZZLES) {
    return {
      ok: false,
      status: 400,
      error: "Invalid puzzleCount",
      reason: "Only complete ranked Pips runs can be submitted.",
      code: "invalid-puzzle-count",
    };
  }

  const splitTotal = easyMs + mediumMs + hardMs;
  if (Math.abs(splitTotal - totalMs) > PIPS_SPLIT_SUM_TOLERANCE_MS) {
    return {
      ok: false,
      status: 400,
      error: "Invalid splits",
      reason: "This run could not be verified because the split times do not match the total.",
      code: "invalid-splits",
    };
  }

  const { ip: callerIp, region: callerRegion, userAgent: callerUA } = await getClientInfo(c.req);

  return {
    ok: true,
    candidate: {
      effectiveSessionId,
      effectiveName,
      seed,
      totalMs,
      easyMs,
      mediumMs,
      hardMs,
      puzzleCount,
      replayData,
      callerIp,
      callerRegion,
      callerUA,
    },
  };
}

const pipsBanCache = new Set<string>();

async function loadPipsBans() {
  try {
    const rows = await drizzleClient
      .select({ sessionId: pipsBannedSessions.sessionId })
      .from(pipsBannedSessions);
    for (const r of rows) pipsBanCache.add(r.sessionId);
  } catch {
    // table may not exist yet
  }
}
loadPipsBans().catch(console.error);

function isPipsBanned(sessionId: string): boolean {
  return pipsBanCache.has(sessionId);
}

async function autoBanPipsSession(sessionId: string, reasons: string[]) {
  const reason = `Auto-ban: ${reasons.join("; ")}`;
  pipsBanCache.add(sessionId);
  try {
    await drizzleClient
      .insert(pipsBannedSessions)
      .values({ sessionId, reason, violations: reasons.length, createdAt: Date.now() })
      .onConflictDoUpdate({
        target: pipsBannedSessions.sessionId,
        set: {
          reason,
          violations: sql`${pipsBannedSessions.violations} + ${reasons.length}`,
        },
      });
  } catch {
    // DB write failed, in-memory ban still active
  }
}

async function assessPipsScoreCandidate(candidate: PipsScoreCandidate): Promise<PipsScoreAssessment> {
  if (isPipsBanned(candidate.effectiveSessionId) || isBanned(candidate.effectiveSessionId, candidate.callerIp, candidate.callerRegion)) {
    return {
      kind: "error",
      status: 403,
      error: "Score rejected",
      reason: "This session is not allowed to submit Pips scores.",
      code: "banned",
    };
  }

  if (candidate.totalMs < PIPS_MIN_TOTAL_TIME_MS) {
    return {
      kind: "error",
      status: 400,
      error: "Score rejected",
      reason: "This run was faster than the minimum verifiable time for Pips.",
      code: "too-fast",
    };
  }

  if (candidate.totalMs > PIPS_MAX_TOTAL_TIME_MS) {
    return {
      kind: "error",
      status: 400,
      error: "Score rejected",
      reason: "This run exceeded the maximum allowed time for Pips.",
      code: "too-slow",
    };
  }

  const rankedValidation = validateRankedPipsRun({
    seed: candidate.seed,
    totalMs: candidate.totalMs,
    easyMs: candidate.easyMs,
    mediumMs: candidate.mediumMs,
    hardMs: candidate.hardMs,
    puzzleCount: candidate.puzzleCount,
    replayData: candidate.replayData,
  });
  if (!rankedValidation.ok) {
    return {
      kind: "error",
      status: 400,
      error: "Score rejected",
      reason: rankedValidation.reason,
      code: rankedValidation.code,
    };
  }

  const [existing] = await drizzleClient
    .select({ id: pipsScores.id })
    .from(pipsScores)
    .where(and(eq(pipsScores.sessionId, candidate.effectiveSessionId), eq(pipsScores.seed, candidate.seed)))
    .limit(1);
  if (existing) {
    return {
      kind: "error",
      status: 409,
      error: "Score already submitted for this run",
      reason: "This run has already been submitted to the leaderboard.",
      code: "duplicate",
    };
  }

  const sessionScores = await drizzleClient
    .select({ id: pipsScores.id, totalMs: pipsScores.totalMs })
    .from(pipsScores)
    .where(eq(pipsScores.sessionId, candidate.effectiveSessionId))
    .orderBy(asc(pipsScores.totalMs));

  if (sessionScores.length >= PIPS_MAX_SCORES_PER_SESSION) {
    const worst = sessionScores[sessionScores.length - 1] ?? null;
    if (worst && candidate.totalMs >= worst.totalMs) {
      return {
        kind: "accepted-no-store",
        reason: "This score was verified, but it is not fast enough to enter your saved top 20.",
      };
    }

    return {
      kind: "eligible",
      willReplace: Boolean(worst),
      worstScoreId: worst?.id ?? null,
      replayData: rankedValidation.replayData,
    };
  }

  return {
    kind: "eligible",
    willReplace: false,
    worstScoreId: null,
    replayData: rankedValidation.replayData,
  };
}

// Rate limits for /api/pips/* (incl. score) are registered up top; see the
// "Rate limiting" block.
app.get("/api/pips/leaderboard", async (c) => {
  const limitParam = parseInt(c.req.query("limit") ?? "10", 10);
  const limit = Math.min(Math.max(1, limitParam), 50);
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
  const offset = (page - 1) * limit;
  const mineOnly = ["1", "true", "yes"].includes((c.req.query("mineOnly") ?? "").toLowerCase());
  const requestedSessionId = c.req.query("sessionId")?.trim() ?? null;
  const resolvedIdentity = requestedSessionId
    ? await resolveSessionIdentity(c, { claimedSessionId: requestedSessionId, allowCreate: false })
    : null;
  const sessionIdParam = resolvedIdentity?.sessionId ?? (normalizeSessionId(requestedSessionId) || null);
  const filters = [sql`true`];

  // The end screen's standings slice, in one round trip. See selectScoreWindow.
  if (c.req.query("window") === "me") {
    const { rows, total } = await selectScoreWindow(
      sql`
        SELECT id, name, total_ms, easy_ms, medium_ms, hard_ms, created_at, seed, session_id,
               row_number() OVER (ORDER BY total_ms ASC, created_at ASC) AS rank,
               count(*) OVER () AS total
        FROM pips_scores
      `,
      sessionIdParam,
    );
    const own = rows.find((row) => row.isOwn);
    return c.json({
      entries: rows.map((row) => ({
        id: row.id,
        name: row.name,
        totalMs: Number(row.total_ms),
        easyMs: Number(row.easy_ms),
        mediumMs: Number(row.medium_ms),
        hardMs: Number(row.hard_ms),
        createdAt: Number(row.created_at),
        seed: Number(row.seed),
        rank: row.rank,
        isOwn: row.isOwn,
      })),
      personalBest: own
        ? {
            name: own.name,
            seed: Number(own.seed),
            totalMs: Number(own.total_ms),
            easyMs: Number(own.easy_ms),
            mediumMs: Number(own.medium_ms),
            hardMs: Number(own.hard_ms),
            createdAt: Number(own.created_at),
            rank: own.rank,
          }
        : null,
      page: 1,
      pageSize: rows.length,
      total,
      totalPages: 1,
    });
  }

  if (mineOnly) {
    if (!sessionIdParam) {
      return c.json({ entries: [], personalBest: null, page: 1, pageSize: limit, total: 0, totalPages: 1 });
    }
    filters.push(eq(pipsScores.sessionId, sessionIdParam));
  }

  // Same shape as Shikaku's search: rank first, filter second, page the matches
  // off count(*) OVER (). See that route for the reasoning.
  const search = parseLeaderboardSearch(c.req.query("q"));
  if (search) {
    const result = await drizzleClient.execute(sql`
      WITH ranked AS (
        SELECT id, name, total_ms, easy_ms, medium_ms, hard_ms, created_at, seed, session_id,
               row_number() OVER (ORDER BY total_ms ASC, created_at ASC) AS rank
        FROM pips_scores
        ${mineOnly ? sql`WHERE session_id = ${sessionIdParam}` : sql``}
      )
      SELECT *, count(*) OVER () AS match_total
      FROM ranked
      WHERE name ILIKE ${search.namePattern} ESCAPE '\'
      ${search.seed != null ? sql`OR seed = ${search.seed}` : sql``}
      ORDER BY rank
      LIMIT ${limit} OFFSET ${offset}
    `);
    const rows = (Array.isArray(result) ? result : result.rows ?? []) as Record<string, any>[];
    const matchTotal = Number(rows[0]?.match_total ?? 0);
    return c.json({
      entries: rows.map((row) => ({
        id: row.id,
        name: row.name,
        totalMs: Number(row.total_ms),
        easyMs: Number(row.easy_ms),
        mediumMs: Number(row.medium_ms),
        hardMs: Number(row.hard_ms),
        createdAt: Number(row.created_at),
        seed: Number(row.seed),
        rank: Number(row.rank),
        isOwn: sessionIdParam != null && row.session_id === sessionIdParam,
      })),
      personalBest: null,
      page,
      pageSize: limit,
      total: matchTotal,
      totalPages: Math.max(1, Math.ceil(matchTotal / limit)),
    });
  }

  const whereClause = and(...filters);
  const [rows, totalResult] = await Promise.all([
    drizzleClient
      .select({
        id: pipsScores.id,
        name: pipsScores.name,
        totalMs: pipsScores.totalMs,
        easyMs: pipsScores.easyMs,
        mediumMs: pipsScores.mediumMs,
        hardMs: pipsScores.hardMs,
        createdAt: pipsScores.createdAt,
        sessionId: pipsScores.sessionId,
        seed: pipsScores.seed,
      })
      .from(pipsScores)
      .where(whereClause)
      .orderBy(asc(pipsScores.totalMs), asc(pipsScores.createdAt))
      .limit(limit)
      .offset(offset),
    drizzleClient
      .select({ total: sql<number>`count(*)::int` })
      .from(pipsScores)
      .where(whereClause),
  ]);
  const totalCount = totalResult[0]?.total ?? 0;

  let personalBest: { totalMs: number; rank: number; seed: number; easyMs: number; mediumMs: number; hardMs: number; createdAt: number; name: string } | null = null;
  if (sessionIdParam && sessionIdParam.length <= 64) {
    const [pb] = await drizzleClient
      .select({
        name: pipsScores.name,
        seed: pipsScores.seed,
        totalMs: pipsScores.totalMs,
        easyMs: pipsScores.easyMs,
        mediumMs: pipsScores.mediumMs,
        hardMs: pipsScores.hardMs,
        createdAt: pipsScores.createdAt,
      })
      .from(pipsScores)
      .where(eq(pipsScores.sessionId, sessionIdParam))
      .orderBy(asc(pipsScores.totalMs), asc(pipsScores.createdAt))
      .limit(1);
    if (pb) {
      const [countResult] = await drizzleClient
        .select({ count: sql<number>`count(*)::int` })
        .from(pipsScores)
        .where(lt(pipsScores.totalMs, pb.totalMs));
      personalBest = { ...pb, rank: Number(countResult?.count ?? 0) + 1 };
    }
  }

  return c.json({
    entries: rows.map((r) => ({
      id: r.id,
      name: r.name,
      totalMs: r.totalMs,
      easyMs: r.easyMs,
      mediumMs: r.mediumMs,
      hardMs: r.hardMs,
      createdAt: r.createdAt,
      seed: r.seed,
      isOwn: sessionIdParam ? r.sessionId === sessionIdParam : false,
    })),
    personalBest,
    page,
    pageSize: limit,
    total: totalCount,
    totalPages: Math.ceil(totalCount / limit),
  });
});

app.post("/api/pips/score/eligibility", async (c) => {
  const body = await c.req.json().catch(() => null) as PipsScoreRequestBody | null;
  const validation = await buildPipsScoreCandidate(c, body);
  if (!validation.ok) {
    return c.json({ ok: true, canSubmit: false, code: validation.code, reason: validation.reason });
  }

  const assessment = await assessPipsScoreCandidate(validation.candidate);
  if (assessment.kind === "eligible") {
    return c.json({
      ok: true,
      canSubmit: true,
      code: "eligible",
      reason: assessment.willReplace
        ? "This run is verified and will replace your current slowest saved run."
        : "This run is verified and ready to submit.",
      willReplace: assessment.willReplace,
    });
  }

  if (assessment.kind === "accepted-no-store") {
    return c.json({ ok: true, canSubmit: false, code: "not-ranked", reason: assessment.reason });
  }

  return c.json({ ok: true, canSubmit: false, code: assessment.code, reason: assessment.reason });
});

app.post("/api/pips/score", async (c) => {
  const body = await c.req.json().catch(() => null) as PipsScoreRequestBody | null;
  const validation = await buildPipsScoreCandidate(c, body);
  if (!validation.ok) {
    return c.json({ error: validation.error }, { status: validation.status as 400 | 403 | 409 });
  }

  const { candidate } = validation;
  const fp = computeFingerprint(candidate.callerIp, candidate.callerUA);
  const fpAnomaly = checkFingerprintAnomaly(candidate.effectiveSessionId, fp);
  if (fpAnomaly) {
    const shouldBan = recordStrike(candidate.effectiveSessionId, "pips fingerprint anomaly: too many distinct clients");
    if (shouldBan) {
      const entry = abuseStrikes.get(candidate.effectiveSessionId);
      await autoBanPipsSession(candidate.effectiveSessionId, entry?.reasons ?? ["fingerprint abuse"]);
    }
  }

  const assessment = await assessPipsScoreCandidate(candidate);
  if (assessment.kind === "error") {
    if (assessment.code === "too-fast" && candidate.totalMs < PIPS_AUTO_BAN_MIN_TIME_MS) {
      const shouldBan = recordStrike(candidate.effectiveSessionId, `pips impossibly fast: ${candidate.totalMs}ms`);
      if (shouldBan) {
        const entry = abuseStrikes.get(candidate.effectiveSessionId);
        await autoBanPipsSession(candidate.effectiveSessionId, entry?.reasons ?? ["speed abuse"]);
      }
    }
    if (assessment.code === "invalid-replay" || assessment.code === "invalid-generated-run" || assessment.code === "non-canonical-solution") {
      const shouldBan = recordStrike(candidate.effectiveSessionId, `pips replay validation failed: ${assessment.code}`);
      if (shouldBan) {
        const entry = abuseStrikes.get(candidate.effectiveSessionId);
        await autoBanPipsSession(candidate.effectiveSessionId, entry?.reasons ?? ["replay manipulation"]);
      }
    }
    return c.json({ error: assessment.error }, { status: assessment.status as 400 | 403 | 409 });
  }

  if (assessment.kind === "accepted-no-store") {
    return c.json({ ok: true, id: null, replaced: false, reason: assessment.reason });
  }

  if (assessment.willReplace && assessment.worstScoreId) {
    await drizzleClient
      .delete(pipsScores)
      .where(eq(pipsScores.id, assessment.worstScoreId));
  }

  const id = crypto.randomUUID();
  await drizzleClient.insert(pipsScores).values({
    id,
    sessionId: candidate.effectiveSessionId,
    name: candidate.effectiveName.slice(0, 50),
    seed: candidate.seed,
    totalMs: candidate.totalMs,
    easyMs: candidate.easyMs,
    mediumMs: candidate.mediumMs,
    hardMs: candidate.hardMs,
    puzzleCount: candidate.puzzleCount,
    replayData: assessment.replayData,
    createdAt: Date.now(),
  });

  return c.json({ ok: true, id, replaced: assessment.willReplace });
});

// ─── Zip solo game endpoints ─────────────────────────────────
//
// Ranked Zip differs from the other two in one way: the server picks the seed.
// POST /api/zip/run hands back a seed and a signed ticket, and the score has to
// come with that ticket. So a ranked board is never one the player has already
// seen, and a run can't claim more time than passed on the server's clock. On
// top of that the replay is checked path by path against the regenerated run.

type ZipScoreRequestBody = {
  sessionId?: string;
  name?: string;
  ticket?: string;
  timeMs?: number;
  replayData?: unknown;
};

type ZipScoreErrorCode =
  | "invalid-body"
  | "invalid-session"
  | "invalid-ticket"
  | "expired-ticket"
  | "invalid-time"
  | "banned"
  | "too-fast"
  | "too-slow"
  | ZipRankedValidationCode
  | "duplicate";

type ZipSubmissionCheck =
  | {
      kind: "error";
      status: 400 | 403 | 409;
      error: string;
      reason: string;
      code: ZipScoreErrorCode;
      /** Set when the failure looks deliberate, so the POST route counts it. */
      strike?: string;
    }
  | { kind: "not-ranked"; reason: string }
  | {
      kind: "eligible";
      sessionId: string;
      name: string;
      ticket: ZipTicket;
      timeMs: number;
      replayData: ZipReplayData;
      replaceId: string | null;
      callerIp: string;
      callerUA: string;
    };

const zipBanCache = new Set<string>();

async function loadZipBans() {
  try {
    const rows = await drizzleClient.select({ sessionId: zipBannedSessions.sessionId }).from(zipBannedSessions);
    for (const r of rows) zipBanCache.add(r.sessionId);
  } catch {
    // table may not exist yet
  }
}
loadZipBans().catch(console.error);

async function autoBanZipSession(sessionId: string, reasons: string[]) {
  const reason = `Auto-ban: ${reasons.join("; ")}`;
  zipBanCache.add(sessionId);
  try {
    await drizzleClient
      .insert(zipBannedSessions)
      .values({ sessionId, reason, violations: reasons.length, createdAt: Date.now() })
      .onConflictDoUpdate({
        target: zipBannedSessions.sessionId,
        set: { reason, violations: sql`${zipBannedSessions.violations} + ${reasons.length}` },
      });
  } catch {
    // DB write failed, in-memory ban still active
  }
}

async function strikeZipSession(sessionId: string, reason: string) {
  if (recordStrike(sessionId, reason)) {
    await autoBanZipSession(sessionId, abuseStrikes.get(sessionId)?.reasons ?? [reason]);
  }
}

function zipError(status: 400 | 403 | 409, code: ZipScoreErrorCode, reason: string, strike?: string): ZipSubmissionCheck {
  return { kind: "error", status, error: "Score rejected", reason, code, ...(strike ? { strike } : {}) };
}

/** Everything a Zip score has to pass, shared by the eligibility check and the real submit. */
async function checkZipSubmission(
  c: { req: { header: (name: string) => string | undefined }; header: (name: string, value: string) => void },
  body: ZipScoreRequestBody | null,
): Promise<ZipSubmissionCheck> {
  if (!body) return zipError(400, "invalid-body", "This run could not be verified because the score payload was invalid.");

  const claimed = getVerifiedClaimedSessionId(c, body.sessionId);
  const identity = claimed
    ? await resolveSessionIdentity(c, { claimedSessionId: claimed, claimedName: body.name, allowCreate: false })
    : null;
  if (!identity?.sessionId || identity.sessionId.length > 64) {
    return zipError(403, "invalid-session", "Your session could not be verified for this run.");
  }
  const sessionId = identity.sessionId;
  const name = (sanitizeSessionName(identity.name) ?? fallbackPlayerName(sessionId)).slice(0, 50);

  // A bad signature is tampering and counts as a strike. A good ticket for a
  // different session is refused but not counted, since a session can get
  // reset mid-run without anyone cheating.
  const ticket = readZipTicket(body.ticket, SESSION_COOKIE_SECRET);
  if (!ticket) {
    return zipError(403, "invalid-ticket", "This run wasn't started as a ranked run.", "zip ticket forged");
  }
  if (ticket.sessionId !== sessionId) {
    return zipError(403, "invalid-ticket", "This ranked run was started by a different session.");
  }
  const elapsed = Date.now() - ticket.issuedAt;
  if (elapsed > ZIP_TICKET_TTL_MS) {
    return zipError(400, "expired-ticket", "This ranked run started too long ago to submit.");
  }

  const { timeMs, replayData } = body;
  if (typeof timeMs !== "number" || !Number.isInteger(timeMs) || timeMs <= 0) {
    return zipError(400, "invalid-time", "This run could not be verified because the recorded time was invalid.");
  }
  if (timeMs > elapsed + ZIP_CLOCK_SLACK_MS) {
    return zipError(400, "invalid-time", "This run claims more time than has passed since it started.", "zip time beyond ticket age");
  }

  const { ip: callerIp, region: callerRegion, userAgent: callerUA } = await getClientInfo(c.req);
  if (zipBanCache.has(sessionId) || isBanned(sessionId, callerIp, callerRegion)) {
    return zipError(403, "banned", "This session is not allowed to submit Zip scores.");
  }
  if (timeMs > ZIP_MAX_TIME_MS) {
    return zipError(400, "too-slow", "This run went past the maximum allowed time.");
  }

  // Cheap floors before the expensive regenerate: every split has to be long
  // enough to draw a line across the whole board.
  const { size } = ZIP_DIFFICULTY_CONFIG[ticket.difficulty];
  const cells = size * size;
  const splits = (replayData as { puzzleTimes?: unknown } | null)?.puzzleTimes;
  if (Array.isArray(splits) && splits.some((split) => typeof split === "number" && split < cells * ZIP_MIN_MS_PER_CELL)) {
    const scripted = splits.some((split) => typeof split === "number" && split < cells * ZIP_AUTO_BAN_MS_PER_CELL);
    return zipError(400, "too-fast", "One of these puzzles was solved faster than a line can be drawn.", scripted ? `zip impossibly fast on ${size}x${size}` : undefined);
  }

  const validation = validateRankedZipRun({
    seed: ticket.seed,
    difficulty: ticket.difficulty,
    timeMs,
    puzzleCount: ZIP_RUN_LENGTH,
    replayData,
  });
  if (!validation.ok) {
    return zipError(400, validation.code, validation.reason, `zip replay validation failed: ${validation.code}`);
  }

  const [existing] = await drizzleClient
    .select({ id: zipScores.id })
    .from(zipScores)
    .where(and(eq(zipScores.sessionId, sessionId), eq(zipScores.seed, ticket.seed)))
    .limit(1);
  if (existing) {
    return zipError(409, "duplicate", "This run has already been submitted to the leaderboard.");
  }

  // Keep a session's 20 fastest per board. A full board only takes a faster run.
  const own = await drizzleClient
    .select({ id: zipScores.id, timeMs: zipScores.timeMs })
    .from(zipScores)
    .where(and(eq(zipScores.sessionId, sessionId), eq(zipScores.difficulty, ticket.difficulty), eq(zipScores.size, size)))
    .orderBy(asc(zipScores.timeMs));
  let replaceId: string | null = null;
  if (own.length >= ZIP_MAX_SCORES_PER_SESSION) {
    const slowest = own[own.length - 1]!;
    if (timeMs >= slowest.timeMs) {
      return { kind: "not-ranked", reason: "This run was verified, but it isn't faster than your saved top 20 on this board." };
    }
    replaceId = slowest.id;
  }

  return { kind: "eligible", sessionId, name, ticket, timeMs, replayData: validation.replayData, replaceId, callerIp, callerUA };
}

app.post("/api/zip/run", async (c) => {
  const body = await c.req.json().catch(() => null) as { sessionId?: string; difficulty?: unknown } | null;
  if (!body || !isZipDifficulty(body.difficulty)) {
    return c.json({ error: "Invalid run" }, 400);
  }
  const claimed = getVerifiedClaimedSessionId(c, body.sessionId);
  const identity = claimed ? await resolveSessionIdentity(c, { claimedSessionId: claimed, allowCreate: false }) : null;
  if (!identity?.sessionId) {
    return c.json({ error: "Invalid session" }, 403);
  }

  const seed = (crypto.getRandomValues(new Uint32Array(1))[0]! % 2_147_483_646) + 1;
  const ticket = createZipTicket(
    { sessionId: identity.sessionId, seed, difficulty: body.difficulty, issuedAt: Date.now() },
    SESSION_COOKIE_SECRET,
  );
  return c.json({ ok: true, seed, ticket });
});

app.post("/api/zip/score/eligibility", async (c) => {
  const body = await c.req.json().catch(() => null) as ZipScoreRequestBody | null;
  const check = await checkZipSubmission(c, body);
  if (check.kind === "eligible") {
    return c.json({
      ok: true,
      canSubmit: true,
      code: "eligible",
      reason: check.replaceId
        ? "This run is verified and will replace your slowest saved run on this board."
        : "This run is verified and ready to submit.",
      willReplace: Boolean(check.replaceId),
    });
  }
  return c.json({ ok: true, canSubmit: false, code: check.kind === "not-ranked" ? "not-ranked" : check.code, reason: check.reason });
});

app.post("/api/zip/score", async (c) => {
  const body = await c.req.json().catch(() => null) as ZipScoreRequestBody | null;
  const check = await checkZipSubmission(c, body);

  if (check.kind === "error") {
    const sessionId = getVerifiedClaimedSessionId(c, body?.sessionId);
    if (check.strike && sessionId) await strikeZipSession(sessionId, check.strike);
    return c.json({ error: check.error, code: check.code, reason: check.reason }, check.status);
  }
  if (check.kind === "not-ranked") {
    return c.json({ ok: true, id: null, replaced: false, reason: check.reason });
  }

  if (checkFingerprintAnomaly(check.sessionId, computeFingerprint(check.callerIp, check.callerUA))) {
    await strikeZipSession(check.sessionId, "zip fingerprint anomaly: too many distinct clients");
  }
  if (check.replaceId) {
    await drizzleClient.delete(zipScores).where(eq(zipScores.id, check.replaceId));
  }

  const id = crypto.randomUUID();
  await drizzleClient.insert(zipScores).values({
    id,
    sessionId: check.sessionId,
    name: check.name,
    seed: check.ticket.seed,
    difficulty: check.ticket.difficulty,
    size: ZIP_DIFFICULTY_CONFIG[check.ticket.difficulty].size,
    timeMs: check.timeMs,
    puzzleCount: check.replayData.paths.length,
    replayData: check.replayData,
    createdAt: Date.now(),
  });
  return c.json({ ok: true, id, replaced: Boolean(check.replaceId) });
});

function zipLeaderboardRow(row: Record<string, any>, sessionId: string | null) {
  return {
    id: row.id,
    name: row.name,
    timeMs: Number(row.time_ms),
    difficulty: row.difficulty,
    size: Number(row.size),
    createdAt: Number(row.created_at),
    seed: Number(row.seed),
    rank: Number(row.rank),
    isOwn: sessionId != null && row.session_id === sessionId,
  };
}

app.get("/api/zip/leaderboard", async (c) => {
  const difficulty = c.req.query("difficulty")?.trim() ?? "easy";
  if (!isZipDifficulty(difficulty)) {
    return c.json({ error: "Invalid board" }, 400);
  }
  // Pinning the size too keeps runs from the old size-per-board days off it.
  const { size } = ZIP_DIFFICULTY_CONFIG[difficulty];
  const limit = Math.min(Math.max(1, parseInt(c.req.query("limit") ?? "10", 10) || 10), 50);
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
  const offset = (page - 1) * limit;
  const mineOnly = ["1", "true", "yes"].includes((c.req.query("mineOnly") ?? "").toLowerCase());
  const requestedSessionId = c.req.query("sessionId")?.trim() ?? null;
  const resolvedIdentity = requestedSessionId
    ? await resolveSessionIdentity(c, { claimedSessionId: requestedSessionId, allowCreate: false })
    : null;
  const sessionId = resolvedIdentity?.sessionId ?? (normalizeSessionId(requestedSessionId) || null);

  // Every view ranks the whole board first, so a filtered row keeps the
  // standing it actually holds. Fastest first, earliest breaks a tie.
  const ranked = sql`
    SELECT id, name, time_ms, difficulty, size, created_at, seed, session_id,
           row_number() OVER (ORDER BY time_ms ASC, created_at ASC) AS rank,
           count(*) OVER () AS total
    FROM zip_scores
    WHERE difficulty = ${difficulty} AND size = ${size}
  `;

  // The end screen's standings slice, in one round trip. See selectScoreWindow.
  if (c.req.query("window") === "me") {
    const { rows, total } = await selectScoreWindow(ranked, sessionId);
    const own = rows.find((row) => row.isOwn);
    return c.json({
      entries: rows.map((row) => zipLeaderboardRow(row, sessionId)),
      personalBest: own ? { timeMs: Number(own.time_ms), rank: own.rank } : null,
      page: 1,
      pageSize: rows.length,
      total,
      totalPages: 1,
    });
  }

  if (mineOnly && !sessionId) {
    return c.json({ entries: [], personalBest: null, page: 1, pageSize: limit, total: 0, totalPages: 1 });
  }

  const search = parseLeaderboardSearch(c.req.query("q"));
  const result = await drizzleClient.execute(sql`
    WITH ranked AS (${ranked}),
    shown AS (
      SELECT * FROM ranked
      WHERE true
      ${mineOnly ? sql`AND session_id = ${sessionId}` : sql``}
      ${search ? sql`AND (name ILIKE ${search.namePattern} ESCAPE '\' ${search.seed != null ? sql`OR seed = ${search.seed}` : sql``})` : sql``}
    )
    SELECT *, count(*) OVER () AS match_total,
           (SELECT min(rank) FROM ranked WHERE session_id = ${sessionId ?? ""}) AS own_rank,
           (SELECT min(time_ms) FROM ranked WHERE session_id = ${sessionId ?? ""}) AS own_time
    FROM shown
    ORDER BY rank
    LIMIT ${limit} OFFSET ${offset}
  `);
  const rows = (Array.isArray(result) ? result : result.rows ?? []) as Record<string, any>[];
  const total = Number(rows[0]?.match_total ?? 0);
  const ownRank = rows[0]?.own_rank;

  return c.json({
    entries: rows.map((row) => zipLeaderboardRow(row, sessionId)),
    personalBest: ownRank != null ? { timeMs: Number(rows[0]!.own_time), rank: Number(ownRank) } : null,
    page,
    pageSize: limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

app.get("/health", (c) => c.json({ ok: true }));

// ─── Commit diff stats ─────────────────────────────────────────
// The deploy env vars carry a commit's name but not its size, and the size is
// the part anyone reading a footer actually wants: how much moved. GitHub knows,
// so we ask it once per sha and keep the answer for as long as this process
// lives, because the shape of a landed commit never changes afterwards.
//
// The fetch never happens inside the request. build-info is polled by every open
// tab every 30s and its round trip is the latency number the footer prints, so
// hanging it on a third party would be lying about our own speed. Instead a miss
// kicks the fetch off and answers null; the next poll finds it warm.
type CommitStats = {
  additions: number;
  deletions: number;
  filesChanged: number;
};

const COMMIT_STATS_RETRY_MS = 5 * 60_000;
const commitStatsCache = new Map<string, { stats: CommitStats | null; retryAfter: number }>();
const commitStatsInFlight = new Set<string>();

function githubRepoSlug() {
  const owner = process.env.VERCEL_GIT_REPO_OWNER;
  const slug = process.env.VERCEL_GIT_REPO_SLUG;

  return firstNonEmpty([
    process.env.GITHUB_REPOSITORY,
    owner && slug ? `${owner}/${slug}` : undefined,
    "oyuh/games"
  ]);
}

async function loadCommitStats(sha: string): Promise<void> {
  const repo = githubRepoSlug();
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "games-api"
  };

  // Anonymous is 60 requests an hour per IP, which one fetch per deploy fits
  // inside comfortably. The token is only here for hosts that share an egress
  // IP with enough neighbours to burn that on their own.
  const token = firstNonEmpty([process.env.GITHUB_TOKEN, process.env.GH_TOKEN]);
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}`, {
      headers,
      signal: AbortSignal.timeout(6_000)
    });

    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }

    const payload = (await response.json()) as {
      stats?: { additions?: number; deletions?: number };
      files?: unknown[];
    };

    commitStatsCache.set(sha, {
      stats: {
        additions: Math.max(0, Math.round(payload.stats?.additions ?? 0)),
        deletions: Math.max(0, Math.round(payload.stats?.deletions ?? 0)),
        filesChanged: Array.isArray(payload.files) ? payload.files.length : 0
      },
      retryAfter: Number.POSITIVE_INFINITY
    });
  } catch (error) {
    // A private repo, a rate limit, a slow morning: none of them are worth a
    // log line every poll, and none of them are permanent. Hold the miss for
    // five minutes so we neither hammer GitHub nor give up on it.
    commitStatsCache.set(sha, { stats: null, retryAfter: Date.now() + COMMIT_STATS_RETRY_MS });
    void error;
  } finally {
    commitStatsInFlight.delete(sha);
  }
}

function getCommitStats(sha: string): CommitStats | null {
  if (!sha) {
    return null;
  }

  const cached = commitStatsCache.get(sha);
  if (cached && Date.now() < cached.retryAfter) {
    return cached.stats;
  }

  if (!commitStatsInFlight.has(sha)) {
    commitStatsInFlight.add(sha);
    void loadCommitStats(sha);
  }

  return cached?.stats ?? null;
}

app.get("/debug/build-info", async (c) => {
  const commitSha = firstNonEmpty([
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.RAILWAY_GIT_COMMIT_SHA,
    process.env.GITHUB_SHA,
    process.env.SOURCE_VERSION
  ]);

  const commitRef = firstNonEmpty([
    process.env.VERCEL_GIT_COMMIT_REF,
    process.env.RAILWAY_GIT_BRANCH,
    process.env.GITHUB_REF_NAME,
    process.env.BRANCH_NAME
  ]);

  const commitMessage = firstNonEmpty([
    process.env.VERCEL_GIT_COMMIT_MESSAGE,
    process.env.RAILWAY_GIT_COMMIT_MESSAGE,
    process.env.GITHUB_COMMIT_MESSAGE
  ]);

  const commitTimestamp = firstNonEmpty([
    process.env.VERCEL_GIT_COMMIT_TIMESTAMP,
    process.env.RAILWAY_GIT_COMMIT_TIMESTAMP,
    process.env.GITHUB_COMMIT_TIMESTAMP
  ]);

  const buildTimestamp = firstNonEmpty([
    process.env.API_BUILD_AT,
    process.env.BUILD_TIMESTAMP,
    process.env.BUILD_TIME,
    process.env.VERCEL_BUILD_TIME
  ]);

  const database = await probeDatabaseStatus();
  const commitStats = getCommitStats(commitSha);

  return c.json({
    ok: true,
    service: "@games/api",
    platform: detectPlatform(),
    commitSha,
    commitRef,
    commitMessage,
    commitTimestamp,
    commitStats,
    buildTimestamp,
    updatedAt: buildTimestamp || commitTimestamp || apiStartedAt,
    startedAt: apiStartedAt,
    uptimeMs: Math.round(process.uptime() * 1000),
    nodeVersion: process.version,
    environment: process.env.NODE_ENV ?? "development",
    database
  });
});

app.post("/api/zero/query", async (c) => {
  const request = c.req.raw;
  const callerUserId = getCallerProofUserId(c) ?? getCallerUserId(c);
  const result = await handleQueryRequest({
    handler: (name, args) => {
      const query = mustGetQuery(queries, name);
      return query.fn({ args, ctx: { userId: callerUserId } });
    },
    schema,
    request,
    userID: callerUserId,
  });
  return c.json(result);
});

app.post("/api/zero/mutate", async (c) => {
  const request = c.req.raw;
  const rawCallerUserId = getCallerUserId(c);
  const proofUserId = getCallerProofFromRequest(c);
  const callerUserId = proofUserId ?? rawCallerUserId;
  try {
    const result = await handleMutateRequest({
      dbProvider,
      handler: (transact) =>
        transact((tx, name, args) => {
          return Promise.resolve().then(async () => {
            let authorized: ReturnType<typeof authorizeMutation<typeof args>>;
            try {
              authorized = authorizeMutation(name, args, { headerUserId: rawCallerUserId, proofUserId }, !DEV_MODE);
            } catch (error) {
              // Only the proof is scored: a bare header could be anyone's id,
              // and scoring it would let a stranger push someone into limbo.
              addBotSignal(proofUserId, "rejected");
              throw error;
            }
            const { userId: resolvedCallerUserId, args: normalizedArgs } = authorized;
            // Throwing here is an app error to Zero: this one mutation is
            // refused and rolled back on the client, the push keeps flowing.
            if (!isDevOnlyMutator(name)) {
              if (botStatus(resolvedCallerUserId).limbo && !limboAllowsMutation(name)) {
                addBotSignal(resolvedCallerUserId, "blocked");
                throw new Error(CHALLENGE_REQUIRED);
              }
              addBotSignal(resolvedCallerUserId, name === "chat.send" ? "chat" : "mutation");
            }
            // Everything below runs inside this mutation's transaction, so any
            // database work has to go through it. A second pool connection here
            // deadlocks the pool once every connection is held by a mutation.
            const db = tx.dbTransaction.wrappedTransaction;
            await assertAllowedSessionNameMutation(name, normalizedArgs, db);
            const mutator = mustGetMutator(mutators, name);
            return mutator.fn({
              args: normalizedArgs,
              tx,
              ctx: {
                userId: resolvedCallerUserId,
                resolveGameSecretKey: (gameType: GameType, gameId: string) => getOrCreateGameKey(gameType, gameId, db),
              }
            });
          });
        }),
      request,
      userID: callerUserId,
    });
    return c.json(result);
  } catch (err) {
    // Mutation ID conflicts happen when the client's IndexedDB cache gets
    // evicted (mobile storage pressure, clearing data, etc.). The client
    // resets to mutation 0 but the server still expects a higher ID.
    // Return an empty success so the client doesn't endlessly retry.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("already processed")) {
      console.warn("[zero/mutate] stale mutation ignored:", msg);
      return c.json({});
    }
    throw err;
  }
});

// Accept both GET and POST so any cron service works
app.on(["GET", "POST"], "/api/cleanup", async (c) => {
  const authHeader = c.req.header("Authorization");
  const expectedToken = process.env.CLEANUP_SECRET ?? CLEANUP_SECRET_DEV_DEFAULT;
  if (authHeader !== `Bearer ${expectedToken}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const summary = await recordedCleanup("endpoint");
  if (!summary) return c.json({ error: "Cleanup is already running" }, 409);
  return c.json({ ok: true, ...summary });
});

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
const server = Bun.serve<RealtimeSocketData>({
  fetch: async (req, bunServer) => {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const authorized = await authorizeRealtimeUpgrade(req);
      if (!authorized.ok) {
        return new Response(authorized.error, { status: authorized.status });
      }

      const upgraded = bunServer.upgrade(req, {
        data: {
          sessionId: authorized.sessionId,
          subscriptions: new Set<string>(),
        },
      });

      if (upgraded) {
        return;
      }

      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    return app.fetch(req);
  },
  websocket: {
    open: onRealtimeOpen,
    close: onRealtimeClose,
    message: onRealtimeMessage,
  },
  port,
});
attachRealtimeServer(server);
console.log(`API listening on http://localhost:${server.port}`);

setBanChecker(isBanned);
// Presence is driven by the realtime WS connection; this just keeps online
// sessions' last_seen fresh for the admin roster (server-side, no client polling).
startPresenceFlush();
console.log("Realtime WebSocket transport configured");

// ─── Auto-cleanup: run every 15 minutes ────────────────────
async function scheduledCleanup() {
  try {
    await recordedCleanup("scheduled");
  } catch (err) {
    console.error("[cleanup] error:", err);
  }
}

setTimeout(scheduledCleanup, 10_000);
setInterval(scheduledCleanup, 15 * 60 * 1000);

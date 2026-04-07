import { mutators, queries, schema } from "@games/shared";
import { adminNameOverrides, chatMessages, chainReactionGames, decryptSecret, encryptSecret, gameEncryptionKeys, generateGameKey, imposterGames, isEncrypted, locationSignalGames, passwordGames, sessions, shadeSignalGames, shikakuScores, shikakuBannedSessions, statusTable } from "@games/shared";

import { handleMutateRequest, handleQueryRequest } from "@rocicorp/zero/server";
import { mustGetMutator, mustGetQuery } from "@rocicorp/zero";
import { config } from "dotenv";
import { lt, and, asc, count, desc, eq, gt, inArray, ne, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { dbProvider } from "./db-provider";
import { drizzleClient } from "./db-provider";
import { pusher, getCustomStatus, setBanChecker, getBanChecker } from "./broadcast-server";
import { adminRoutes, isBanned, getRestrictedNamesRoute, loadPersistedStatus } from "./admin-routes";
import { allowUnrestrictedSessionName, findRestrictedNameMatch } from "./name-rules";
import { rateLimiter } from "./rate-limit";
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
} from "./session-identity";
import { getClientInfo } from "./client-info";

config({ path: "../../.env" });

const app = new Hono();
const DB_STATUS_KEY = process.env.DB_STATUS_KEY?.trim() || "footer";
const DB_STATUS_EXPECTED_VALUE = process.env.DB_STATUS_EXPECTED_VALUE?.trim() || "ok";
const SESSION_COOKIE_SECRET = process.env.SESSION_COOKIE_SECRET?.trim() || process.env.PUSHER_SECRET?.trim() || "games-dev-session-secret";

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return "https://games.lawsonhart.me";
      if (
        origin.endsWith(".lawsonhart.me") ||
        origin === "https://games.lawsonhart.me" ||
        origin.startsWith("http://localhost:")
      ) {
        return origin;
      }
      return "https://games.lawsonhart.me";
    },
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-zero-user-id", ZERO_SESSION_PROOF_HEADER],
    credentials: true,
    maxAge: 86400
  })
);

app.use(
  "/api/zero/*",
  rateLimiter({
    windowMs: 60_000,
    maxRequests: 120,
    scope: "zero"
  })
);

app.use(
  "/api/maps/geocode",
  rateLimiter({
    windowMs: 60_000,
    maxRequests: 10,
    scope: "maps_geocode"
  })
);

app.use(
  "/api/pusher/auth",
  rateLimiter({
    windowMs: 60_000,
    maxRequests: 30,
    scope: "pusher_auth"
  })
);

app.use(
  "/api/presence/heartbeat",
  rateLimiter({
    windowMs: 60_000,
    maxRequests: 30,
    scope: "presence_heartbeat"
  })
);

app.use(
  "/api/cleanup",
  rateLimiter({
    windowMs: 60_000,
    maxRequests: 5,
    scope: "cleanup"
  })
);

app.use(
  "/api/game-secret/*",
  rateLimiter({
    windowMs: 60_000,
    maxRequests: 30,
    scope: "game_secret"
  })
);

// ─── Admin routes ──────────────────────────────────────────
app.use(
  "/api/admin/*",
  rateLimiter({
    windowMs: 60_000,
    maxRequests: 60,
    scope: "admin"
  })
);
app.route("/api/admin", adminRoutes);

// ─── Public endpoints (no auth) ─────────────────────────────
app.route("/api/public", getRestrictedNamesRoute());

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
  // Quick deterministic hash — not crypto, just identity binding
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
    drizzleClient
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
    fingerprint,
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

  const forcedName = sanitizeSessionName(override?.forcedName ?? null);
  const canonicalName = forcedName ?? await allowUnrestrictedSessionName(decision.canonicalName);
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
    const existingName = cookieSession?.id === decision.sessionId
      ? cookieSession.name
      : claimedSession?.id === decision.sessionId
        ? claimedSession.name
        : fingerprintSession?.id === decision.sessionId
          ? fingerprintSession.name
          : null;
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
    resetRequired: decision.shouldResetSession || decision.shouldResetName,
    created: decision.shouldCreate,
    source: decision.source,
  };
}

// ─── Pusher auth endpoint ───────────────────────────────────
app.post("/api/pusher/auth", async (c) => {
  const body = await c.req.parseBody();
  const socketId = body["socket_id"] as string;
  const channelName = body["channel_name"] as string;
  const claimedSessionId = (body["session_id"] as string) || "";

  if (!socketId || !channelName) {
    return c.json({ error: "Missing socket_id or channel_name" }, 400);
  }

  const resolvedIdentity = await resolveSessionIdentity(c, {
    claimedSessionId,
    allowCreate: false,
  });

  if (!resolvedIdentity) {
    return c.json({ error: "Invalid session" }, 403);
  }

  const sessionId = resolvedIdentity.sessionId;

  // Ban check on auth — banned users can't subscribe
  if (sessionId) {
    const { ip, region, userAgent } = await getClientInfo(c.req);
    const checker = getBanChecker();
    if (checker) {
      const ban = checker(sessionId, ip, region);
      if (ban) {
        return c.json({ error: "Banned" }, 403);
      }
    }

    // Track session client info on every auth
    const fp = computeFingerprint(ip, userAgent);
    updateSessionTracking(sessionId, ip, region, userAgent, fp);
  }

  // Only allow private-user-{sessionId} channels where sessionId matches
  if (channelName.startsWith("private-user-")) {
    const channelSessionId = channelName.replace("private-user-", "");
    if (channelSessionId !== sessionId) {
      return c.json({ error: "Unauthorized channel" }, 403);
    }
  }

  const authResponse = pusher.authorizeChannel(socketId, channelName);
  return c.json(authResponse);
});

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

// ─── Presence heartbeat (replaces WebSocket presence) ───────
app.post("/api/presence/heartbeat", async (c) => {
  const body = await c.req.json().catch(() => null) as {
    sessionId?: string;
  } | null;
  const claimedSessionId = body?.sessionId ?? "";

  if (!claimedSessionId || claimedSessionId.length > MAX_ID_LEN) {
    return c.json({ error: "sessionId required" }, 400);
  }

  const resolvedIdentity = await resolveSessionIdentity(c, {
    claimedSessionId,
    allowCreate: false,
  });

  if (!resolvedIdentity) {
    return c.json({ error: "Invalid session" }, 403);
  }

  const sessionId = resolvedIdentity.sessionId;

  const { ip, region, userAgent } = await getClientInfo(c.req);
  const fingerprint = computeFingerprint(ip, userAgent);

  // Check for session ID being used from too many different clients
  const anomaly = checkFingerprintAnomaly(sessionId, fingerprint);

  await drizzleClient
    .update(sessions)
    .set({
      ip,
      region,
      userAgent,
      fingerprint,
      lastSeen: Date.now(),
    })
    .where(eq(sessions.id, sessionId));

  return c.json({
    ok: true,
    sessionId,
    resetRequired: resolvedIdentity.resetRequired,
    ...(anomaly ? { warning: "fingerprint_anomaly" } : {}),
  });
});

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

function getVerifiedClaimedSessionId(
  c: { req: { header: (name: string) => string | undefined } },
  claimedSessionId: unknown
) {
  const headerUserId = getCallerUserId(c);
  const proofUserId = getCallerProofUserId(c);
  const normalizedClaimedId = normalizeSessionId(claimedSessionId);

  if (headerUserId !== "anon" && (!proofUserId || headerUserId !== proofUserId)) {
    return null;
  }

  if (proofUserId && normalizedClaimedId && proofUserId !== normalizedClaimedId) {
    return null;
  }

  return proofUserId ?? normalizedClaimedId;
}

const MAX_ID_LEN = 64;

function validId(v: unknown): string {
  if (typeof v !== "string") return "";
  const trimmed = v.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_ID_LEN ? trimmed : "";
}

function assertCallerValue(userId: string, claimed: unknown, field: string) {
  if (userId === "anon") {
    return;
  }
  if (typeof claimed !== "string" || claimed.trim().length === 0) {
    throw new Error(`Missing ${field}`);
  }
  if (claimed !== userId) {
    throw new Error("Not allowed");
  }
}

function requiresMutatorSessionProof(name: string, args: unknown) {
  if (name.startsWith("demo.") && process.env.NODE_ENV !== "production") {
    return false;
  }
  if (args == null || typeof args !== "object") {
    return false;
  }

  const payload = args as Record<string, unknown>;
  const [namespace] = name.split(".");
  return namespace === "sessions"
    || "sessionId" in payload
    || "hostId" in payload
    || "senderId" in payload
    || "voterId" in payload;
}

function applyCanonicalMutatorCaller<T>(userId: string, name: string, args: T): T {
  if (userId === "anon" || args == null || typeof args !== "object") {
    return args;
  }

  const payload = { ...(args as Record<string, unknown>) };
  const [namespace] = name.split(".");

  if (namespace === "sessions") {
    payload.id = userId;
    return payload as T;
  }

  if ("sessionId" in payload) {
    payload.sessionId = userId;
  }
  if ("hostId" in payload) {
    payload.hostId = userId;
  }
  if ("senderId" in payload) {
    payload.senderId = userId;
  }
  if ("voterId" in payload) {
    payload.voterId = userId;
  }

  return payload as T;
}

function resolveZeroMutatorCaller(userId: string, name: string, args: unknown, proofUserId: string | null) {
  if (!requiresMutatorSessionProof(name, args)) {
    return proofUserId ?? userId;
  }
  if (!proofUserId) {
    throw new Error(
      process.env.NODE_ENV === "production"
        ? "Invalid session proof"
        : "Invalid session proof: zero-cache must forward x-zero-session-proof via ZERO_MUTATE_ALLOWED_CLIENT_HEADERS"
    );
  }
  return proofUserId;
}

function enforceMutatorCaller(userId: string, name: string, args: unknown) {
  if (args == null || typeof args !== "object") {
    return;
  }

  const payload = args as Record<string, unknown>;
  const [namespace] = name.split(".");

  // Anon users (no x-zero-user-id header) are only allowed to target
  // session-creation mutators; they must not impersonate existing sessions
  // in identity-sensitive fields.  We skip enforcement only for sessions.create
  // since it establishes a new identity.
  if (userId === "anon") {
    if (namespace === "sessions" && name === "sessions.create") {
      return; // allow anon to create a new session
    }
    if (namespace === "sessions" && name === "sessions.setName") {
      return; // allow anon to set their own name (client-side session)
    }
    // For all other mutations, anon callers still go through identity checks
    // below — they'll fail if the payload includes an identity field, which
    // is the correct behaviour (prevents spoofing).
  }

  if (namespace === "sessions") {
    assertCallerValue(userId, payload.id, "id");
    return;
  }

  if ("sessionId" in payload) {
    assertCallerValue(userId, payload.sessionId, "sessionId");
  }
  if ("hostId" in payload) {
    assertCallerValue(userId, payload.hostId, "hostId");
  }
  if ("senderId" in payload) {
    assertCallerValue(userId, payload.senderId, "senderId");
  }
  if ("voterId" in payload) {
    assertCallerValue(userId, payload.voterId, "voterId");
  }
}

async function assertAllowedSessionNameMutation(name: string, args: unknown) {
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

  const restrictedMatch = await findRestrictedNameMatch(payload.name);
  if (restrictedMatch) {
    throw new Error("That name is restricted by admin");
  }
}

type GameType = "imposter" | "password" | "chain_reaction" | "shade_signal" | "location_signal";

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

  const [game] = await drizzleClient
    .select({ phase: chainReactionGames.phase, players: chainReactionGames.players })
    .from(chainReactionGames)
    .where(eq(chainReactionGames.id, gameId));
  if (!game) return { allowed: false, reason: "Game not found", status: 404 as const };
  const isPlayer = game.players.some((p) => p.sessionId === sessionId);
  if (!isPlayer) return { allowed: false, reason: "Forbidden", status: 403 as const };
  return { allowed: true, myRole: "player" as const };
}

async function getOrCreateGameKey(gameType: GameType, gameId: string) {
  const [existing] = await drizzleClient
    .select({ key: gameEncryptionKeys.encryptionKey })
    .from(gameEncryptionKeys)
    .where(and(eq(gameEncryptionKeys.gameType, gameType), eq(gameEncryptionKeys.gameId, gameId)))
    .limit(1);

  let key = existing?.key;
  if (!key) {
    key = await generateGameKey();
    await drizzleClient
      .insert(gameEncryptionKeys)
      .values({
        id: crypto.randomUUID(),
        gameType,
        gameId,
        encryptionKey: key,
        createdAt: Date.now(),
      })
      .onConflictDoNothing({ target: [gameEncryptionKeys.gameType, gameEncryptionKeys.gameId] });

    const [inserted] = await drizzleClient
      .select({ key: gameEncryptionKeys.encryptionKey })
      .from(gameEncryptionKeys)
      .where(and(eq(gameEncryptionKeys.gameType, gameType), eq(gameEncryptionKeys.gameId, gameId)))
      .limit(1);
    key = inserted?.key;
  }

  if (!key) {
    throw new Error("Key unavailable");
  }

  return key;
}

app.post("/api/game-secret/init", async (c) => {
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

  if (gameType !== "imposter" && gameType !== "shade_signal" && gameType !== "location_signal") {
    return c.json({ error: "Unsupported gameType" }, 400);
  }

  if (gameType === "imposter") {
    const [game] = await drizzleClient
      .select({ hostId: imposterGames.hostId, phase: imposterGames.phase, secretWord: imposterGames.secretWord })
      .from(imposterGames)
      .where(eq(imposterGames.id, gameId))
      .limit(1);

    if (!game) return c.json({ error: "Game not found" }, 404);
    if (game.hostId !== sessionId) return c.json({ error: "Forbidden" }, 403);
    if (game.phase !== "playing") return c.json({ error: "Not in playing phase" }, 409);
    if (!game.secretWord) return c.json({ error: "Secret not set yet" }, 409);
    if (isEncrypted(game.secretWord)) return c.json({ ok: true, alreadyEncrypted: true });

    const key = await getOrCreateGameKey(gameType, gameId);
    const encryptedSecretWord = await encryptSecret(game.secretWord, key);

    await drizzleClient
      .update(imposterGames)
      .set({ secretWord: encryptedSecretWord, updatedAt: Date.now() })
      .where(eq(imposterGames.id, gameId));

    return c.json({ ok: true });
  }

  if (gameType === "shade_signal") {
    const [game] = await drizzleClient
      .select({ id: shadeSignalGames.id, hostId: shadeSignalGames.hostId, leaderId: shadeSignalGames.leaderId, targetRow: shadeSignalGames.targetRow, targetCol: shadeSignalGames.targetCol, encryptedTarget: shadeSignalGames.encryptedTarget })
      .from(shadeSignalGames)
      .where(eq(shadeSignalGames.id, gameId))
      .limit(1);

    if (!game) return c.json({ error: "Game not found" }, 404);
    if (game.leaderId !== sessionId && game.hostId !== sessionId) return c.json({ error: "Forbidden" }, 403);
    if (game.encryptedTarget) return c.json({ ok: true, alreadyEncrypted: true });
    if (game.targetRow == null || game.targetCol == null) return c.json({ error: "Target not set yet" }, 409);

    const key = await getOrCreateGameKey(gameType, gameId);
    const encryptedTarget = await encryptSecret(JSON.stringify({ row: game.targetRow, col: game.targetCol }), key);

    await drizzleClient
      .update(shadeSignalGames)
      .set({ targetRow: -1, targetCol: -1, encryptedTarget, updatedAt: Date.now() })
      .where(eq(shadeSignalGames.id, gameId));

    return c.json({ ok: true });
  }

  const [game] = await drizzleClient
    .select({ id: locationSignalGames.id, hostId: locationSignalGames.hostId, leaderId: locationSignalGames.leaderId, targetLat: locationSignalGames.targetLat, targetLng: locationSignalGames.targetLng, encryptedTarget: locationSignalGames.encryptedTarget })
    .from(locationSignalGames)
    .where(eq(locationSignalGames.id, gameId))
    .limit(1);

  if (!game) return c.json({ error: "Game not found" }, 404);
  if (game.leaderId !== sessionId && game.hostId !== sessionId) return c.json({ error: "Forbidden" }, 403);
  if (game.encryptedTarget) return c.json({ ok: true, alreadyEncrypted: true });
  if (game.targetLat == null || game.targetLng == null) return c.json({ error: "Target not set yet" }, 409);

  const key = await getOrCreateGameKey(gameType, gameId);
  const encryptedTarget = await encryptSecret(JSON.stringify({ lat: game.targetLat, lng: game.targetLng }), key);

  await drizzleClient
    .update(locationSignalGames)
    .set({ targetLat: 0, targetLng: 0, encryptedTarget, updatedAt: Date.now() })
    .where(eq(locationSignalGames.id, gameId));

  return c.json({ ok: true });
});

app.post("/api/game-secret/pre-reveal", async (c) => {
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

  if (gameType !== "shade_signal" && gameType !== "location_signal") {
    return c.json({ error: "Unsupported gameType" }, 400);
  }

  if (gameType === "shade_signal") {
    const [game] = await drizzleClient
      .select({ hostId: shadeSignalGames.hostId, encryptedTarget: shadeSignalGames.encryptedTarget })
      .from(shadeSignalGames)
      .where(eq(shadeSignalGames.id, gameId))
      .limit(1);
    if (!game) return c.json({ error: "Game not found" }, 404);
    if (game.hostId !== sessionId) return c.json({ error: "Forbidden" }, 403);
    if (!game.encryptedTarget) return c.json({ ok: true, alreadyPlain: true });

    const key = await getOrCreateGameKey(gameType, gameId);
    const decrypted = await decryptSecret(game.encryptedTarget, key);
    let payload: { row: number; col: number };
    try {
      const parsed = JSON.parse(decrypted);
      if (typeof parsed?.row !== "number" || typeof parsed?.col !== "number") throw new Error("bad payload");
      payload = parsed;
    } catch {
      return c.json({ error: "Corrupted encrypted target" }, 500);
    }
    await drizzleClient
      .update(shadeSignalGames)
      .set({ targetRow: payload.row, targetCol: payload.col, encryptedTarget: null, updatedAt: Date.now() })
      .where(eq(shadeSignalGames.id, gameId));
    return c.json({ ok: true });
  }

  const [game] = await drizzleClient
    .select({ hostId: locationSignalGames.hostId, encryptedTarget: locationSignalGames.encryptedTarget })
    .from(locationSignalGames)
    .where(eq(locationSignalGames.id, gameId))
    .limit(1);
  if (!game) return c.json({ error: "Game not found" }, 404);
  if (game.hostId !== sessionId) return c.json({ error: "Forbidden" }, 403);
  if (!game.encryptedTarget) return c.json({ ok: true, alreadyPlain: true });

  const key = await getOrCreateGameKey(gameType, gameId);
  const decrypted = await decryptSecret(game.encryptedTarget, key);
  let payload: { lat: number; lng: number };
  try {
    const parsed = JSON.parse(decrypted);
    if (typeof parsed?.lat !== "number" || typeof parsed?.lng !== "number") throw new Error("bad payload");
    payload = parsed;
  } catch {
    return c.json({ error: "Corrupted encrypted target" }, 500);
  }
  await drizzleClient
    .update(locationSignalGames)
    .set({ targetLat: payload.lat, targetLng: payload.lng, encryptedTarget: null, updatedAt: Date.now() })
    .where(eq(locationSignalGames.id, gameId));
  return c.json({ ok: true });
});

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

    if (!actualValue) {
      return {
        state: "unknown",
        reason: `missing status row for key '${DB_STATUS_KEY}'`,
        key: DB_STATUS_KEY,
        expectedValue: DB_STATUS_EXPECTED_VALUE,
        actualValue,
        checkedAt
      };
    }

    if (actualValue !== DB_STATUS_EXPECTED_VALUE) {
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

// ─── Shikaku solo game endpoints ─────────────────────────────

// Server-side score calculation (mirrors the client formula exactly)
const SHIKAKU_DIFF_MULT: Record<string, number> = { easy: 1, medium: 1.5, hard: 2.2, expert: 3 };
const SHIKAKU_PAR_MS: Record<string, number> = { easy: 30_000, medium: 60_000, hard: 90_000, expert: 120_000 };
const SHIKAKU_PUZZLES = 5;
const SHIKAKU_MIN_TIME_MS: Record<string, number> = {
  easy: 10_000,   // 2 s per puzzle
  medium: 20_000, // 4 s per puzzle
  hard: 30_000,   // 6 s per puzzle
  expert: 40_000, // 8 s per puzzle
};
const SHIKAKU_AUTO_BAN_MIN_TIME_MS: Record<string, number> = {
  easy: 5_000,
  medium: 10_000,
  hard: 15_000,
  expert: 20_000,
};

function shikakuMaxScore(timeMs: number, difficulty: string): number {
  const totalParMs = (SHIKAKU_PAR_MS[difficulty] ?? 30_000) * SHIKAKU_PUZZLES;
  const timeBonus = Math.max(0.1, 2 - timeMs / totalParMs);
  const basePoints = 1000 * SHIKAKU_PUZZLES;
  return Math.max(0, Math.round(basePoints * (SHIKAKU_DIFF_MULT[difficulty] ?? 1) * timeBonus));
}

// ── Max play time per difficulty ────────────────────────────
// Base: 1 hour, +30 min per difficulty tier
const SHIKAKU_MAX_TIME_MS: Record<string, number> = {
  easy:   3_600_000,                // 1 hr
  medium: 3_600_000 + 1_800_000,    // 1.5 hr
  hard:   3_600_000 + 3_600_000,    // 2 hr
  expert: 3_600_000 + 5_400_000,    // 2.5 hr
};

const SHIKAKU_MAX_SCORES_PER_SESSION = 20;
const SHIKAKU_VALID_DIFFS = ["easy", "medium", "hard", "expert"] as const;

type ShikakuDifficulty = (typeof SHIKAKU_VALID_DIFFS)[number];

type ShikakuScoreRequestBody = {
  sessionId?: string;
  name?: string;
  seed?: number;
  difficulty?: string;
  score?: number;
  timeMs?: number;
  puzzleCount?: number;
};

type ShikakuScoreCandidate = {
  effectiveSessionId: string;
  effectiveName: string;
  seed: number;
  difficulty: ShikakuDifficulty;
  score: number;
  timeMs: number;
  puzzleCount: number;
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
      code: Extract<ShikakuScoreErrorCode, "banned" | "too-fast" | "too-slow" | "inflated-score" | "duplicate">;
    }
  | {
      kind: "accepted-no-store";
      reason: string;
    }
  | {
      kind: "eligible";
      willReplace: boolean;
      lowestScoreId: string | null;
    };

function isShikakuDifficulty(value: unknown): value is ShikakuDifficulty {
  return typeof value === "string" && SHIKAKU_VALID_DIFFS.includes(value as ShikakuDifficulty);
}

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

  const { sessionId, name, seed, difficulty, score, timeMs, puzzleCount } = body;
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
  const effectiveName = sanitizeSessionName(resolvedIdentity.name) ?? "Anonymous";

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
    };
  }

  return {
    kind: "eligible",
    willReplace: false,
    lowestScoreId: null,
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

app.use(
  "/api/shikaku/*",
  rateLimiter({
    windowMs: 60_000,
    maxRequests: 30,
    scope: "shikaku"
  })
);

// Tighter limit specifically for score submissions
app.use(
  "/api/shikaku/score",
  rateLimiter({
    windowMs: 60_000,
    maxRequests: 6,
    scope: "shikaku_score"
  })
);

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

  if (mineOnly) {
    if (!sessionIdParam) {
      return c.json({ entries: [], personalBest: null, page: 1, pageSize: limit, total: 0, totalPages: 1 });
    }
    filters.push(eq(shikakuScores.sessionId, sessionIdParam));
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
    createdAt: Date.now(),
  });

  return c.json({ ok: true, id, replaced: assessment.willReplace });
});

app.get("/health", (c) => c.json({ ok: true }));

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

  return c.json({
    ok: true,
    service: "@games/api",
    platform: detectPlatform(),
    commitSha,
    commitRef,
    commitMessage,
    commitTimestamp,
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
  const result = await handleQueryRequest(
    (name, args) => {
      const query = mustGetQuery(queries, name);
      return query.fn({ args, ctx: { userId: callerUserId } });
    },
    schema,
    request
  );
  return c.json(result);
});

app.post("/api/zero/mutate", async (c) => {
  const request = c.req.raw;
  const rawCallerUserId = getCallerUserId(c);
  const proofUserId = getCallerProofFromRequest(c);
  try {
    const result = await handleMutateRequest(
      dbProvider,
      (transact) =>
        transact((tx, name, args) => {
          return Promise.resolve().then(async () => {
          const callerUserId = resolveZeroMutatorCaller(rawCallerUserId, name, args, proofUserId);
          const normalizedArgs = applyCanonicalMutatorCaller(callerUserId, name, args);
          enforceMutatorCaller(callerUserId, name, normalizedArgs);
          await assertAllowedSessionNameMutation(name, normalizedArgs);
          if (name.startsWith("demo.") && process.env.NODE_ENV === "production") {
            throw new Error("Demo mutators are disabled in production");
          }
          const mutator = mustGetMutator(mutators, name);
          return mutator.fn({
            args: normalizedArgs,
            tx,
            ctx: {
              userId: callerUserId,
              resolveGameSecretKey: (gameType: GameType, gameId: string) => getOrCreateGameKey(gameType, gameId),
            }
          });
          });
        }),
      request
    );
    return c.json(result);
  } catch (err) {
    // Mutation ID conflicts happen when the client's IndexedDB cache gets
    // evicted (mobile storage pressure, clearing data, etc.) — the client
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

// ─── Stale game cleanup ────────────────────────────────────
const STALE_MS = 20 * 60 * 1000;   // 20 min idle → end game
const DELETE_MS = 60 * 60 * 1000;  // 1 hr → delete game row

async function runCleanup() {
  const now = Date.now();
  const staleCutoff = now - STALE_MS;
  const deleteCutoff = now - DELETE_MS;

  // ── 1) End stale games (idle > 20min) ──────────────────────
  const endedImposter = await drizzleClient
    .update(imposterGames)
    .set({ phase: "ended", updatedAt: now })
    .where(and(lt(imposterGames.updatedAt, staleCutoff), ne(imposterGames.phase, "ended")))
    .returning({ id: imposterGames.id });

  const endedPassword = await drizzleClient
    .update(passwordGames)
    .set({ phase: "ended", updatedAt: now })
    .where(and(lt(passwordGames.updatedAt, staleCutoff), ne(passwordGames.phase, "ended")))
    .returning({ id: passwordGames.id });

  const endedChain = await drizzleClient
    .update(chainReactionGames)
    .set({ phase: "ended", updatedAt: now })
    .where(and(lt(chainReactionGames.updatedAt, staleCutoff), ne(chainReactionGames.phase, "ended")))
    .returning({ id: chainReactionGames.id });

  const endedShade = await drizzleClient
    .update(shadeSignalGames)
    .set({ phase: "ended", updatedAt: now })
    .where(and(lt(shadeSignalGames.updatedAt, staleCutoff), ne(shadeSignalGames.phase, "ended")))
    .returning({ id: shadeSignalGames.id });

  const endedLocation = await drizzleClient
    .update(locationSignalGames)
    .set({ phase: "ended", updatedAt: now })
    .where(and(lt(locationSignalGames.updatedAt, staleCutoff), ne(locationSignalGames.phase, "ended")))
    .returning({ id: locationSignalGames.id });

  // ── 2) Detach sessions from ended games ────────────────────
  const endedGameIds = new Set([
    ...endedImposter.map((g) => g.id),
    ...endedPassword.map((g) => g.id),
    ...endedChain.map((g) => g.id),
    ...endedShade.map((g) => g.id),
    ...endedLocation.map((g) => g.id)
  ]);
  if (endedGameIds.size > 0) {
    const allSessions = await drizzleClient
      .select({ id: sessions.id, gameId: sessions.gameId })
      .from(sessions)
      .where(lt(sessions.lastSeen, staleCutoff));
    for (const s of allSessions) {
      if (s.gameId && endedGameIds.has(s.gameId)) {
        await drizzleClient
          .update(sessions)
          .set({ gameType: null, gameId: null, lastSeen: now })
          .where(eq(sessions.id, s.id));
      }
    }
  }

  // ── 3) Hard-delete old ended games (1hr+) ──────────────────
  const deletedImposter = await drizzleClient
    .delete(imposterGames)
    .where(and(eq(imposterGames.phase, "ended"), lt(imposterGames.updatedAt, deleteCutoff)))
    .returning({ id: imposterGames.id });

  const deletedPassword = await drizzleClient
    .delete(passwordGames)
    .where(and(eq(passwordGames.phase, "ended"), lt(passwordGames.updatedAt, deleteCutoff)))
    .returning({ id: passwordGames.id });

  const deletedChain = await drizzleClient
    .delete(chainReactionGames)
    .where(and(eq(chainReactionGames.phase, "ended"), lt(chainReactionGames.updatedAt, deleteCutoff)))
    .returning({ id: chainReactionGames.id });

  const deletedShade = await drizzleClient
    .delete(shadeSignalGames)
    .where(and(eq(shadeSignalGames.phase, "ended"), lt(shadeSignalGames.updatedAt, deleteCutoff)))
    .returning({ id: shadeSignalGames.id });

  const deletedLocation = await drizzleClient
    .delete(locationSignalGames)
    .where(and(eq(locationSignalGames.phase, "ended"), lt(locationSignalGames.updatedAt, deleteCutoff)))
    .returning({ id: locationSignalGames.id });

  const allDeletedGameIds = [
    ...deletedImposter.map((g) => g.id),
    ...deletedPassword.map((g) => g.id),
    ...deletedChain.map((g) => g.id),
    ...deletedShade.map((g) => g.id),
    ...deletedLocation.map((g) => g.id),
  ];

  // ── 4) Clean up encryption keys for deleted games ──────────
  let deletedEncryptionKeys = 0;
  if (allDeletedGameIds.length > 0) {
    const deletedKeys = await drizzleClient
      .delete(gameEncryptionKeys)
      .where(inArray(gameEncryptionKeys.gameId, allDeletedGameIds))
      .returning({ id: gameEncryptionKeys.id });
    deletedEncryptionKeys = deletedKeys.length;
  }
  // Also clean any orphaned keys whose game no longer exists
  const orphanedKeys = await drizzleClient.execute(sql`
    DELETE FROM game_encryption_keys
    WHERE game_id NOT IN (
      SELECT id FROM imposter_games
      UNION SELECT id FROM password_games
      UNION SELECT id FROM chain_reaction_games
      UNION SELECT id FROM shade_signal_games
      UNION SELECT id FROM location_signal_games
    )
    RETURNING id
  `);
  const orphanedKeysDeleted = Array.isArray(orphanedKeys) ? orphanedKeys.length : (orphanedKeys.rowCount ?? 0);
  deletedEncryptionKeys += Number(orphanedKeysDeleted);

  // ── 5) Clean up chat messages for deleted games ────────────
  let deletedChatMessages = 0;
  if (allDeletedGameIds.length > 0) {
    const deletedChats = await drizzleClient
      .delete(chatMessages)
      .where(inArray(chatMessages.gameId, allDeletedGameIds))
      .returning({ id: chatMessages.id });
    deletedChatMessages = deletedChats.length;
  }

  // ── 6) Delete stale sessions (1hr+) ────────────────────────
  const deletedSessions = await drizzleClient
    .delete(sessions)
    .where(lt(sessions.lastSeen, deleteCutoff))
    .returning({ id: sessions.id });

  // ── 7) Shikaku: enforce max 20 scores per session per difficulty ─
  // Each player can keep up to 20 scores for each difficulty (easy/medium/hard/expert)
  let shikakuScoresTrimmed = 0;
  const overLimitGroups = await drizzleClient.execute(sql`
    SELECT session_id, difficulty, COUNT(*) as cnt
    FROM shikaku_scores
    GROUP BY session_id, difficulty
    HAVING COUNT(*) > ${SHIKAKU_MAX_SCORES_PER_SESSION}
  `);
  const groupsToTrim = Array.isArray(overLimitGroups) ? overLimitGroups : (overLimitGroups.rows ?? []);
  for (const row of groupsToTrim) {
    const { session_id: sid, difficulty: diff } = row as { session_id: string; difficulty: string };
    // Keep the top 20 highest scores for this session+difficulty, delete the rest
    const allScores = await drizzleClient
      .select({ id: shikakuScores.id })
      .from(shikakuScores)
      .where(and(eq(shikakuScores.sessionId, sid), eq(shikakuScores.difficulty, diff)))
      .orderBy(desc(shikakuScores.score))
      .limit(10000);
    const idsToDelete = allScores.slice(SHIKAKU_MAX_SCORES_PER_SESSION).map((s) => s.id);
    if (idsToDelete.length > 0) {
      await drizzleClient
        .delete(shikakuScores)
        .where(inArray(shikakuScores.id, idsToDelete));
      shikakuScoresTrimmed += idsToDelete.length;
    }
  }

  // ── 8) Shikaku: detect and remove suspicious scores ───────
  // Flag scores that exceed the max possible for their time/difficulty
  let shikakuSuspiciousRemoved = 0;
  const allShikakuScoresRaw = await drizzleClient
    .select({
      id: shikakuScores.id,
      sessionId: shikakuScores.sessionId,
      score: shikakuScores.score,
      timeMs: shikakuScores.timeMs,
      difficulty: shikakuScores.difficulty,
      name: shikakuScores.name,
    })
    .from(shikakuScores);

  const suspiciousIds: string[] = [];
  const suspiciousSessions = new Set<string>();
  for (const s of allShikakuScoresRaw) {
    const maxAllowed = shikakuMaxScore(s.timeMs, s.difficulty);
    const minTime = SHIKAKU_MIN_TIME_MS[s.difficulty] ?? 10_000;
    const maxTime = SHIKAKU_MAX_TIME_MS[s.difficulty] ?? 3_600_000;
    // Score exceeds theoretical max (with 5% tolerance for rounding)
    const isInflated = s.score > maxAllowed * 1.05;
    // Impossibly fast
    const isTooFast = s.timeMs < minTime;
    // Unreasonably slow (beyond max allowed time)
    const isTooSlow = s.timeMs > maxTime;
    // Negative/zero score or time
    const isInvalid = s.score <= 0 || s.timeMs <= 0;

    if (isInflated || isTooFast || isTooSlow || isInvalid) {
      suspiciousIds.push(s.id);
      suspiciousSessions.add(s.sessionId);
    }
  }
  if (suspiciousIds.length > 0) {
    await drizzleClient
      .delete(shikakuScores)
      .where(inArray(shikakuScores.id, suspiciousIds));
    shikakuSuspiciousRemoved = suspiciousIds.length;
  }

  // ── 9) Counts for diagnostics ─────────────────────────────
  const [imposterCount = { total: 0 }] = await drizzleClient.select({ total: count() }).from(imposterGames);
  const [passwordCount = { total: 0 }] = await drizzleClient.select({ total: count() }).from(passwordGames);
  const [chainCount = { total: 0 }] = await drizzleClient.select({ total: count() }).from(chainReactionGames);
  const [shadeCount = { total: 0 }] = await drizzleClient.select({ total: count() }).from(shadeSignalGames);
  const [locationCount = { total: 0 }] = await drizzleClient.select({ total: count() }).from(locationSignalGames);
  const [sessionCount = { total: 0 }] = await drizzleClient.select({ total: count() }).from(sessions);
  const [shikakuCount = { total: 0 }] = await drizzleClient.select({ total: count() }).from(shikakuScores);
  const [encKeyCount = { total: 0 }] = await drizzleClient.select({ total: count() }).from(gameEncryptionKeys);

  return {
    ended: {
      imposter: endedImposter.length,
      password: endedPassword.length,
      chainReaction: endedChain.length,
      shadeSignal: endedShade.length,
      locationSignal: endedLocation.length,
    },
    deleted: {
      imposter: deletedImposter.length,
      password: deletedPassword.length,
      chainReaction: deletedChain.length,
      shadeSignal: deletedShade.length,
      locationSignal: deletedLocation.length,
      sessions: deletedSessions.length,
      encryptionKeys: deletedEncryptionKeys,
      chatMessages: deletedChatMessages,
    },
    shikaku: {
      scoresTrimmed: shikakuScoresTrimmed,
      suspiciousRemoved: shikakuSuspiciousRemoved,
      suspiciousSessions: suspiciousSessions.size,
    },
    cutoffs: {
      stale: new Date(staleCutoff).toISOString(),
      delete: new Date(deleteCutoff).toISOString(),
    },
    totals: {
      imposterGames: imposterCount.total,
      passwordGames: passwordCount.total,
      chainReactionGames: chainCount.total,
      shadeSignalGames: shadeCount.total,
      locationSignalGames: locationCount.total,
      sessions: sessionCount.total,
      shikakuScores: shikakuCount.total,
      encryptionKeys: encKeyCount.total,
    },
  };
}

function formatCleanupLog(summary: Awaited<ReturnType<typeof runCleanup>>, trigger: string) {
  const { ended, deleted, shikaku, cutoffs, totals } = summary;
  const endedTotal = ended.imposter + ended.password + ended.chainReaction + ended.shadeSignal + ended.locationSignal;
  const deletedGames = deleted.imposter + deleted.password + deleted.chainReaction + deleted.shadeSignal + deleted.locationSignal;

  const lines = [
    ``,
    `╔══════════════════════════════════════════════════════╗`,
    `║         🧹 CLEANUP REPORT (${trigger.padEnd(12)})           ║`,
    `╠══════════════════════════════════════════════════════╣`,
    `║  Stale cutoff:  ${cutoffs.stale.padEnd(35)}║`,
    `║  Delete cutoff: ${cutoffs.delete.padEnd(35)}║`,
    `╠══════════════════════════════════════════════════════╣`,
    `║  GAMES ENDED (idle > 20min):  ${String(endedTotal).padStart(4)}                 ║`,
  ];
  if (endedTotal > 0) {
    if (ended.imposter) lines.push(`║    Imposter:        ${String(ended.imposter).padStart(4)}                         ║`);
    if (ended.password) lines.push(`║    Password:        ${String(ended.password).padStart(4)}                         ║`);
    if (ended.chainReaction) lines.push(`║    Chain Reaction:  ${String(ended.chainReaction).padStart(4)}                         ║`);
    if (ended.shadeSignal) lines.push(`║    Shade Signal:    ${String(ended.shadeSignal).padStart(4)}                         ║`);
    if (ended.locationSignal) lines.push(`║    Location Signal: ${String(ended.locationSignal).padStart(4)}                         ║`);
  }
  lines.push(
    `╠══════════════════════════════════════════════════════╣`,
    `║  DELETED (ended > 1hr):                              ║`,
    `║    Games:           ${String(deletedGames).padStart(4)}                         ║`,
    `║    Sessions:        ${String(deleted.sessions).padStart(4)}                         ║`,
    `║    Encryption keys: ${String(deleted.encryptionKeys).padStart(4)}                         ║`,
    `║    Chat messages:   ${String(deleted.chatMessages).padStart(4)}                         ║`,
    `╠══════════════════════════════════════════════════════╣`,
    `║  SHIKAKU AUDIT:                                      ║`,
    `║    Scores trimmed (>20/session): ${String(shikaku.scoresTrimmed).padStart(4)}               ║`,
    `║    Suspicious removed:           ${String(shikaku.suspiciousRemoved).padStart(4)}               ║`,
    `║    Flagged sessions:             ${String(shikaku.suspiciousSessions).padStart(4)}               ║`,
    `╠══════════════════════════════════════════════════════╣`,
    `║  CURRENT TOTALS:                                     ║`,
    `║    Imposter:        ${String(totals.imposterGames).padStart(4)}     Sessions:    ${String(totals.sessions).padStart(5)}   ║`,
    `║    Password:        ${String(totals.passwordGames).padStart(4)}     Shikaku:     ${String(totals.shikakuScores).padStart(5)}   ║`,
    `║    Chain Reaction:  ${String(totals.chainReactionGames).padStart(4)}     Enc. Keys:   ${String(totals.encryptionKeys).padStart(5)}   ║`,
    `║    Shade Signal:    ${String(totals.shadeSignalGames).padStart(4)}                          ║`,
    `║    Location Signal: ${String(totals.locationSignalGames).padStart(4)}                          ║`,
    `╚══════════════════════════════════════════════════════╝`,
    ``,
  );
  return lines.join("\n");
}

// ─── Activity report (general stats snapshot) ──────────────
async function runActivityReport() {
  const now = Date.now();
  const fiveMinAgo = now - 5 * 60 * 1000;
  const oneHourAgo = now - 60 * 60 * 1000;

  // Active sessions (seen in last 5 min)
  const [activeSessions = { total: 0 }] = await drizzleClient
    .select({ total: count() })
    .from(sessions)
    .where(gt(sessions.lastSeen, fiveMinAgo));

  // Total sessions
  const [totalSessions = { total: 0 }] = await drizzleClient
    .select({ total: count() })
    .from(sessions);

  // Active games by type (not ended)
  const [activeImposter = { total: 0 }] = await drizzleClient.select({ total: count() }).from(imposterGames).where(ne(imposterGames.phase, "ended"));
  const [activePassword = { total: 0 }] = await drizzleClient.select({ total: count() }).from(passwordGames).where(ne(passwordGames.phase, "ended"));
  const [activeChain = { total: 0 }] = await drizzleClient.select({ total: count() }).from(chainReactionGames).where(ne(chainReactionGames.phase, "ended"));
  const [activeShade = { total: 0 }] = await drizzleClient.select({ total: count() }).from(shadeSignalGames).where(ne(shadeSignalGames.phase, "ended"));
  const [activeLocation = { total: 0 }] = await drizzleClient.select({ total: count() }).from(locationSignalGames).where(ne(locationSignalGames.phase, "ended"));

  // Total games (all states)
  const [totalImposter = { total: 0 }] = await drizzleClient.select({ total: count() }).from(imposterGames);
  const [totalPassword = { total: 0 }] = await drizzleClient.select({ total: count() }).from(passwordGames);
  const [totalChain = { total: 0 }] = await drizzleClient.select({ total: count() }).from(chainReactionGames);
  const [totalShade = { total: 0 }] = await drizzleClient.select({ total: count() }).from(shadeSignalGames);
  const [totalLocation = { total: 0 }] = await drizzleClient.select({ total: count() }).from(locationSignalGames);

  // Shikaku stats
  const [shikakuTotal = { total: 0 }] = await drizzleClient.select({ total: count() }).from(shikakuScores);
  const [shikakuRecent = { total: 0 }] = await drizzleClient
    .select({ total: count() })
    .from(shikakuScores)
    .where(gt(shikakuScores.createdAt, oneHourAgo));
  const [bannedSessions = { total: 0 }] = await drizzleClient.select({ total: count() }).from(shikakuBannedSessions);

  // Unique shikaku players (distinct session_id)
  const [shikakuPlayers = { total: 0 }] = await drizzleClient
    .select({ total: sql<number>`COUNT(DISTINCT ${shikakuScores.sessionId})` })
    .from(shikakuScores);

  // Encryption keys & chat messages
  const [encKeys = { total: 0 }] = await drizzleClient.select({ total: count() }).from(gameEncryptionKeys);
  const [chatMsgs = { total: 0 }] = await drizzleClient.select({ total: count() }).from(chatMessages);

  // Admin bans
  const adminBansResult = await drizzleClient.execute(sql`SELECT COUNT(*) as total FROM admin_bans`);
  const adminBanCount = Number(Array.isArray(adminBansResult) ? (adminBansResult[0] as any)?.total ?? 0 : (adminBansResult.rows?.[0] as any)?.total ?? 0);

  const totalActiveGames = activeImposter.total + activePassword.total + activeChain.total + activeShade.total + activeLocation.total;
  const totalGames = totalImposter.total + totalPassword.total + totalChain.total + totalShade.total + totalLocation.total;

  const lines = [
    ``,
    `╔══════════════════════════════════════════════════════╗`,
    `║         📊 ACTIVITY REPORT                           ║`,
    `║         ${new Date(now).toISOString().padEnd(43)}║`,
    `╠══════════════════════════════════════════════════════╣`,
    `║  SESSIONS:                                           ║`,
    `║    Active (5min):   ${String(activeSessions.total).padStart(5)}                        ║`,
    `║    Total:           ${String(totalSessions.total).padStart(5)}                        ║`,
    `╠══════════════════════════════════════════════════════╣`,
    `║  ACTIVE GAMES:       ${String(totalActiveGames).padStart(4)}  (${String(totalGames).padStart(4)} total)            ║`,
    `║    Imposter:        ${String(activeImposter.total).padStart(4)} / ${String(totalImposter.total).padStart(4)}                      ║`,
    `║    Password:        ${String(activePassword.total).padStart(4)} / ${String(totalPassword.total).padStart(4)}                      ║`,
    `║    Chain Reaction:  ${String(activeChain.total).padStart(4)} / ${String(totalChain.total).padStart(4)}                      ║`,
    `║    Shade Signal:    ${String(activeShade.total).padStart(4)} / ${String(totalShade.total).padStart(4)}                      ║`,
    `║    Location Signal: ${String(activeLocation.total).padStart(4)} / ${String(totalLocation.total).padStart(4)}                      ║`,
    `╠══════════════════════════════════════════════════════╣`,
    `║  SHIKAKU:                                            ║`,
    `║    Total scores:    ${String(shikakuTotal.total).padStart(5)}                        ║`,
    `║    Unique players:  ${String(shikakuPlayers.total).padStart(5)}                        ║`,
    `║    Scores (1hr):    ${String(shikakuRecent.total).padStart(5)}                        ║`,
    `║    Banned sessions: ${String(bannedSessions.total).padStart(5)}                        ║`,
    `╠══════════════════════════════════════════════════════╣`,
    `║  OTHER:                                              ║`,
    `║    Encryption keys: ${String(encKeys.total).padStart(5)}                        ║`,
    `║    Chat messages:   ${String(chatMsgs.total).padStart(5)}                        ║`,
    `║    Admin bans:      ${String(adminBanCount).padStart(5)}                        ║`,
    `╚══════════════════════════════════════════════════════╝`,
    ``,
  ];

  return lines.join("\n");
}

// Accept both GET and POST so any cron service works
app.on(["GET", "POST"], "/api/cleanup", async (c) => {
  const authHeader = c.req.header("Authorization");
  const expectedToken = process.env.CLEANUP_SECRET ?? "cleanup-local";
  if (authHeader !== `Bearer ${expectedToken}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const summary = await runCleanup();
  console.log(formatCleanupLog(summary, "endpoint"));
  return c.json({ ok: true, ...summary });
});

// Activity report endpoint (same auth as cleanup)
app.on(["GET", "POST"], "/api/activity", async (c) => {
  const authHeader = c.req.header("Authorization");
  const expectedToken = process.env.CLEANUP_SECRET ?? "cleanup-local";
  if (authHeader !== `Bearer ${expectedToken}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const report = await runActivityReport();
  console.log(report);
  return c.json({ ok: true, report });
});

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
const server = Bun.serve({
  fetch: app.fetch,
  port,
});
console.log(`API listening on http://localhost:${server.port}`);

setBanChecker(isBanned);
console.log("Pusher broadcast configured (no WebSocket servers)");

// ─── Auto-cleanup: run every 15 minutes ────────────────────
async function scheduledCleanup() {
  try {
    const summary = await runCleanup();
    console.log(formatCleanupLog(summary, "scheduled"));
  } catch (err) {
    console.error("[cleanup] error:", err);
  }
}

// ─── Activity report: run every 30 minutes ─────────────────
async function scheduledActivityReport() {
  try {
    const report = await runActivityReport();
    console.log(report);
  } catch (err) {
    console.error("[activity] error:", err);
  }
}

setTimeout(scheduledCleanup, 10_000);
setInterval(scheduledCleanup, 15 * 60 * 1000);

setTimeout(scheduledActivityReport, 20_000);
setInterval(scheduledActivityReport, 30 * 60 * 1000);

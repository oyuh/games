import { mutators, queries, schema } from "@games/shared";
import { chainReactionGames, decryptSecret, encryptSecret, gameEncryptionKeys, generateGameKey, imposterGames, isEncrypted, locationSignalGames, passwordGames, sessions, shadeSignalGames, shikakuScores, shikakuBannedSessions, statusTable } from "@games/shared";
import { serve } from "@hono/node-server";
import { handleMutateRequest, handleQueryRequest } from "@rocicorp/zero/server";
import { mustGetMutator, mustGetQuery } from "@rocicorp/zero";
import { config } from "dotenv";
import { lt, and, ne, eq, count, desc, gt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { dbProvider } from "./db-provider";
import { drizzleClient } from "./db-provider";
import { pusher, getCustomStatus, setBanChecker, getBanChecker } from "./broadcast-server";
import { adminRoutes, isBanned, getRestrictedNamesRoute, loadPersistedStatus } from "./admin-routes";
import { rateLimiter } from "./rate-limit";

config({ path: "../../.env" });

const app = new Hono();
const DB_STATUS_KEY = process.env.DB_STATUS_KEY?.trim() || "footer";
const DB_STATUS_EXPECTED_VALUE = process.env.DB_STATUS_EXPECTED_VALUE?.trim() || "ok";

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return "*";
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
    allowHeaders: ["Content-Type", "Authorization", "x-zero-user-id"],
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

// ─── Client info extraction helpers ─────────────────────────
function getClientInfo(c: { req: { header: (name: string) => string | undefined } }) {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const region = c.req.header("cf-ipcountry") || c.req.header("x-vercel-ip-country") || "unknown";
  const userAgent = (c.req.header("user-agent") || "unknown").slice(0, 500);
  return { ip: ip.slice(0, 45), region: region.slice(0, 10), userAgent };
}

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

// ─── Pusher auth endpoint ───────────────────────────────────
app.post("/api/pusher/auth", async (c) => {
  const body = await c.req.parseBody();
  const socketId = body["socket_id"] as string;
  const channelName = body["channel_name"] as string;
  const sessionId = (body["session_id"] as string) || "";

  if (!socketId || !channelName) {
    return c.json({ error: "Missing socket_id or channel_name" }, 400);
  }

  // Ban check on auth — banned users can't subscribe
  if (sessionId) {
    const { ip, region, userAgent } = getClientInfo(c);
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

// ─── Presence heartbeat (replaces WebSocket presence) ───────
app.post("/api/presence/heartbeat", async (c) => {
  const body = await c.req.json();
  const { sessionId } = body as {
    sessionId?: string;
  };

  if (!sessionId || sessionId.length > MAX_ID_LEN) {
    return c.json({ error: "sessionId required" }, 400);
  }

  const { ip, region, userAgent } = getClientInfo(c);
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

  return c.json({ ok: true, ...(anomaly ? { warning: "fingerprint_anomaly" } : {}) });
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
  const sessionId = validId(body?.sessionId);
  if (!gameType || !gameId || !sessionId) {
    return c.json({ error: "gameType, gameId, sessionId required" }, 400);
  }

  if (gameType !== "imposter" && gameType !== "shade_signal" && gameType !== "location_signal") {
    return c.json({ error: "Unsupported gameType" }, 400);
  }

  const headerUserId = getCallerUserId(c);
  if (headerUserId !== "anon" && headerUserId !== sessionId) {
    return c.json({ error: "Forbidden" }, 403);
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
  const sessionId = validId(body?.sessionId);
  if (!gameType || !gameId || !sessionId) {
    return c.json({ error: "gameType, gameId, sessionId required" }, 400);
  }

  if (gameType !== "shade_signal" && gameType !== "location_signal") {
    return c.json({ error: "Unsupported gameType" }, 400);
  }

  const headerUserId = getCallerUserId(c);
  if (headerUserId !== "anon" && headerUserId !== sessionId) {
    return c.json({ error: "Forbidden" }, 403);
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
  const sessionId = validId(body?.sessionId);

  if (!gameType || !gameId || !sessionId) {
    return c.json({ error: "gameType, gameId, sessionId required" }, 400);
  }

  const headerUserId = getCallerUserId(c);
  if (headerUserId !== "anon" && headerUserId !== sessionId) {
    return c.json({ error: "Forbidden" }, 403);
  }

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
  easy: 15_000,   // 3 s per puzzle
  medium: 25_000, // 5 s per puzzle
  hard: 40_000,   // 8 s per puzzle
  expert: 60_000, // 12 s per puzzle
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
  const validDiffs = ["easy", "medium", "hard", "expert"];
  if (!validDiffs.includes(difficulty)) {
    return c.json({ error: "Invalid difficulty" }, 400);
  }
  const limitParam = parseInt(c.req.query("limit") ?? "10", 10);
  const limit = Math.min(Math.max(1, limitParam), 50);
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
  const offset = (page - 1) * limit;
  const sessionIdParam = c.req.query("sessionId")?.trim() ?? null;

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
      })
      .from(shikakuScores)
      .where(eq(shikakuScores.difficulty, difficulty))
      .orderBy(desc(shikakuScores.score))
      .limit(limit)
      .offset(offset),
    drizzleClient
      .select({ total: sql<number>`count(*)::int` })
      .from(shikakuScores)
      .where(eq(shikakuScores.difficulty, difficulty)),
  ]);
  const totalCount = totalResult[0]?.total ?? 0;

  // Fetch personal best for the given session
  let personalBest: { score: number; timeMs: number; rank: number } | null = null;
  if (sessionIdParam && sessionIdParam.length <= 64) {
    const [pb] = await drizzleClient
      .select({ score: shikakuScores.score, timeMs: shikakuScores.timeMs })
      .from(shikakuScores)
      .where(and(eq(shikakuScores.difficulty, difficulty), eq(shikakuScores.sessionId, sessionIdParam)))
      .orderBy(desc(shikakuScores.score))
      .limit(1);
    if (pb) {
      // Count how many scores are better to determine rank
      const [countResult] = await drizzleClient
        .select({ count: sql<number>`count(*)::int` })
        .from(shikakuScores)
        .where(and(eq(shikakuScores.difficulty, difficulty), gt(shikakuScores.score, pb.score)));
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
      isOwn: sessionIdParam ? r.sessionId === sessionIdParam : false,
    })),
    personalBest,
    page,
    pageSize: limit,
    total: totalCount,
    totalPages: Math.ceil(totalCount / limit),
  });
});

app.post("/api/shikaku/score", async (c) => {
  const body = await c.req.json().catch(() => null) as {
    sessionId?: string;
    name?: string;
    seed?: number;
    difficulty?: string;
    score?: number;
    timeMs?: number;
    puzzleCount?: number;
  } | null;

  if (!body) return c.json({ error: "Invalid body" }, 400);

  const { sessionId, name, seed, difficulty, score, timeMs, puzzleCount } = body;

  // ── Input validation ──────────────────────────────────────
  if (!sessionId || typeof sessionId !== "string" || sessionId.length > 64) {
    return c.json({ error: "Invalid sessionId" }, 400);
  }
  if (!name || typeof name !== "string" || name.length > 50) {
    return c.json({ error: "Invalid name" }, 400);
  }
  if (typeof seed !== "number" || !Number.isInteger(seed)) {
    return c.json({ error: "Invalid seed" }, 400);
  }
  const validDiffs = ["easy", "medium", "hard", "expert"];
  if (!difficulty || !validDiffs.includes(difficulty)) {
    return c.json({ error: "Invalid difficulty" }, 400);
  }
  if (typeof score !== "number" || score < 0 || score > 100000) {
    return c.json({ error: "Invalid score" }, 400);
  }
  if (typeof timeMs !== "number" || timeMs < 0 || timeMs > 9_000_000) {
    return c.json({ error: "Invalid timeMs" }, 400);
  }
  if (typeof puzzleCount !== "number" || puzzleCount < 1 || puzzleCount > 20) {
    return c.json({ error: "Invalid puzzleCount" }, 400);
  }

  // ── Shikaku-specific auto-ban check ───────────────────────
  if (isShikakuBanned(sessionId)) {
    return c.json({ error: "Score rejected" }, 403);
  }

  // ── Global admin ban check ────────────────────────────────
  const { ip: callerIp, region: callerRegion, userAgent: callerUA } = getClientInfo(c);
  if (isBanned(sessionId, callerIp, callerRegion)) {
    return c.json({ error: "Score rejected" }, 403);
  }

  // ── Fingerprint anomaly check ─────────────────────────────
  const fp = computeFingerprint(callerIp, callerUA);
  const fpAnomaly = checkFingerprintAnomaly(sessionId, fp);
  if (fpAnomaly) {
    const shouldBan = recordStrike(sessionId, "fingerprint anomaly: too many distinct clients");
    if (shouldBan) {
      const entry = abuseStrikes.get(sessionId);
      await autoBanSession(sessionId, entry?.reasons ?? ["fingerprint abuse"]);
    }
  }

  // ── Session verification ──────────────────────────────────
  const [session] = await drizzleClient
    .select({ id: sessions.id, name: sessions.name })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!session) {
    return c.json({ error: "Invalid session" }, 403);
  }

  // ── Per-difficulty minimum time ───────────────────────────
  const minTime = SHIKAKU_MIN_TIME_MS[difficulty] ?? 15_000;
  if (timeMs < minTime) {
    const shouldBan = recordStrike(sessionId, `impossibly fast: ${timeMs}ms on ${difficulty}`);
    if (shouldBan) {
      const entry = abuseStrikes.get(sessionId);
      await autoBanSession(sessionId, entry?.reasons ?? ["speed abuse"]);
    }
    return c.json({ error: "Score rejected" }, 400);
  }

  // ── Max play time per difficulty ──────────────────────────
  // base 1hr + 30min per difficulty tier
  const maxTime = SHIKAKU_MAX_TIME_MS[difficulty] ?? 3_600_000;
  if (timeMs > maxTime) {
    const shouldBan = recordStrike(sessionId, `exceeded max time: ${timeMs}ms on ${difficulty} (max ${maxTime}ms)`);
    if (shouldBan) {
      const entry = abuseStrikes.get(sessionId);
      await autoBanSession(sessionId, entry?.reasons ?? ["time abuse"]);
    }
    return c.json({ error: "Score rejected" }, 400);
  }

  // ── Server-side score cap ─────────────────────────────────
  const maxLegitScore = shikakuMaxScore(timeMs, difficulty);
  if (score > maxLegitScore) {
    const shouldBan = recordStrike(sessionId, `inflated score: ${score} > max ${maxLegitScore}`);
    if (shouldBan) {
      const entry = abuseStrikes.get(sessionId);
      await autoBanSession(sessionId, entry?.reasons ?? ["score manipulation"]);
    }
    return c.json({ error: "Score rejected" }, 400);
  }

  // ── Duplicate seed+session protection ─────────────────────
  const [existing] = await drizzleClient
    .select({ id: shikakuScores.id })
    .from(shikakuScores)
    .where(and(eq(shikakuScores.sessionId, sessionId), eq(shikakuScores.seed, seed)))
    .limit(1);
  if (existing) {
    return c.json({ error: "Score already submitted for this run" }, 409);
  }

  // ── 20-score limit per session — replace lowest if at cap ─
  const sessionScores = await drizzleClient
    .select({ id: shikakuScores.id, score: shikakuScores.score })
    .from(shikakuScores)
    .where(eq(shikakuScores.sessionId, sessionId))
    .orderBy(desc(shikakuScores.score));

  if (sessionScores.length >= SHIKAKU_MAX_SCORES_PER_SESSION) {
    // Find the lowest score for this session
    const lowest = sessionScores[sessionScores.length - 1];
    if (lowest && score <= lowest.score) {
      // New score isn't better than worst existing — silently accept but don't store
      return c.json({ ok: true, id: null, replaced: false, reason: "Score not high enough to enter top 20" });
    }
    // Delete the lowest to make room
    if (lowest) {
      await drizzleClient
        .delete(shikakuScores)
        .where(eq(shikakuScores.id, lowest.id));
    }
  }

  // ── Insert ────────────────────────────────────────────────
  const id = crypto.randomUUID();
  await drizzleClient.insert(shikakuScores).values({
    id,
    sessionId,
    name: name.slice(0, 50),
    seed,
    difficulty,
    score,
    timeMs,
    puzzleCount,
    createdAt: Date.now(),
  });

  const replaced = sessionScores.length >= SHIKAKU_MAX_SCORES_PER_SESSION;
  return c.json({ ok: true, id, replaced });
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
  const callerUserId = getCallerUserId(c);
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
  const callerUserId = getCallerUserId(c);
  try {
    const result = await handleMutateRequest(
      dbProvider,
      (transact) =>
        transact((tx, name, args) => {
          enforceMutatorCaller(callerUserId, name, args);
          if (name.startsWith("demo.") && process.env.NODE_ENV === "production") {
            throw new Error("Demo mutators are disabled in production");
          }
          const mutator = mustGetMutator(mutators, name);
          return mutator.fn({
            args,
            tx,
            ctx: {
              userId: callerUserId,
              resolveGameSecretKey: (gameType: GameType, gameId: string) => getOrCreateGameKey(gameType, gameId),
            }
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

  // 1) End stale imposter games (not already ended)
  const endedImposter = await drizzleClient
    .update(imposterGames)
    .set({ phase: "ended", updatedAt: now })
    .where(
      and(
        lt(imposterGames.updatedAt, staleCutoff),
        ne(imposterGames.phase, "ended")
      )
    )
    .returning({ id: imposterGames.id });

  // 2) End stale password games (not already ended)
  const endedPassword = await drizzleClient
    .update(passwordGames)
    .set({ phase: "ended", updatedAt: now })
    .where(
      and(
        lt(passwordGames.updatedAt, staleCutoff),
        ne(passwordGames.phase, "ended")
      )
    )
    .returning({ id: passwordGames.id });

  // 2b) End stale chain reaction games (not already ended)
  const endedChain = await drizzleClient
    .update(chainReactionGames)
    .set({ phase: "ended", updatedAt: now })
    .where(
      and(
        lt(chainReactionGames.updatedAt, staleCutoff),
        ne(chainReactionGames.phase, "ended")
      )
    )
    .returning({ id: chainReactionGames.id });

  // 2c) End stale shade signal games (not already ended)
  const endedShade = await drizzleClient
    .update(shadeSignalGames)
    .set({ phase: "ended", updatedAt: now })
    .where(
      and(
        lt(shadeSignalGames.updatedAt, staleCutoff),
        ne(shadeSignalGames.phase, "ended")
      )
    )
    .returning({ id: shadeSignalGames.id });

  // 2d) End stale location signal games (not already ended)
  const endedLocation = await drizzleClient
    .update(locationSignalGames)
    .set({ phase: "ended", updatedAt: now })
    .where(
      and(
        lt(locationSignalGames.updatedAt, staleCutoff),
        ne(locationSignalGames.phase, "ended")
      )
    )
    .returning({ id: locationSignalGames.id });

  // 3) Detach sessions that were in those ended games
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

  // 4) Hard-delete old ended games (1hr+)
  const deletedImposter = await drizzleClient
    .delete(imposterGames)
    .where(
      and(
        eq(imposterGames.phase, "ended"),
        lt(imposterGames.updatedAt, deleteCutoff)
      )
    )
    .returning({ id: imposterGames.id });

  const deletedPassword = await drizzleClient
    .delete(passwordGames)
    .where(
      and(
        eq(passwordGames.phase, "ended"),
        lt(passwordGames.updatedAt, deleteCutoff)
      )
    )
    .returning({ id: passwordGames.id });

  const deletedChain = await drizzleClient
    .delete(chainReactionGames)
    .where(
      and(
        eq(chainReactionGames.phase, "ended"),
        lt(chainReactionGames.updatedAt, deleteCutoff)
      )
    )
    .returning({ id: chainReactionGames.id });

  const deletedShade = await drizzleClient
    .delete(shadeSignalGames)
    .where(
      and(
        eq(shadeSignalGames.phase, "ended"),
        lt(shadeSignalGames.updatedAt, deleteCutoff)
      )
    )
    .returning({ id: shadeSignalGames.id });

  const deletedLocation = await drizzleClient
    .delete(locationSignalGames)
    .where(
      and(
        eq(locationSignalGames.phase, "ended"),
        lt(locationSignalGames.updatedAt, deleteCutoff)
      )
    )
    .returning({ id: locationSignalGames.id });

  // 5) Delete stale sessions (1hr+)
  const deletedSessions = await drizzleClient
    .delete(sessions)
    .where(lt(sessions.lastSeen, deleteCutoff))
    .returning({ id: sessions.id });

  // 6) Counts for diagnostics
  const [imposterCount = { total: 0 }] = await drizzleClient.select({ total: count() }).from(imposterGames);
  const [passwordCount = { total: 0 }] = await drizzleClient.select({ total: count() }).from(passwordGames);
  const [chainCount = { total: 0 }] = await drizzleClient.select({ total: count() }).from(chainReactionGames);
  const [shadeCount = { total: 0 }] = await drizzleClient.select({ total: count() }).from(shadeSignalGames);
  const [locationCount = { total: 0 }] = await drizzleClient.select({ total: count() }).from(locationSignalGames);
  const [sessionCount = { total: 0 }] = await drizzleClient.select({ total: count() }).from(sessions);

  return {
    imposterGamesEnded: endedImposter.length,
    passwordGamesEnded: endedPassword.length,
    chainReactionGamesEnded: endedChain.length,
    shadeSignalGamesEnded: endedShade.length,
    locationSignalGamesEnded: endedLocation.length,
    imposterGamesDeleted: deletedImposter.length,
    passwordGamesDeleted: deletedPassword.length,
    chainReactionGamesDeleted: deletedChain.length,
    shadeSignalGamesDeleted: deletedShade.length,
    locationSignalGamesDeleted: deletedLocation.length,
    sessionsDeleted: deletedSessions.length,
    staleCutoff: new Date(staleCutoff).toISOString(),
    deleteCutoff: new Date(deleteCutoff).toISOString(),
    totals: {
      imposterGames: imposterCount.total,
      passwordGames: passwordCount.total,
      chainReactionGames: chainCount.total,
      shadeSignalGames: shadeCount.total,
      locationSignalGames: locationCount.total,
      sessions: sessionCount.total,
    },
  };
}

// Accept both GET and POST so any cron service works
app.on(["GET", "POST"], "/api/cleanup", async (c) => {
  const authHeader = c.req.header("Authorization");
  const expectedToken = process.env.CLEANUP_SECRET ?? "cleanup-local";
  if (authHeader !== `Bearer ${expectedToken}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const summary = await runCleanup();
  console.log("[cleanup] via endpoint", summary);
  return c.json({ ok: true, ...summary });
});

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
const server = serve(
  {
    fetch: app.fetch,
    port
  },
  () => {
    console.log(`API listening on http://localhost:${port}`);
  }
);

setBanChecker(isBanned);
console.log("Pusher broadcast configured (no WebSocket servers)");

// ─── Auto-cleanup: run every 15 minutes ────────────────────
async function scheduledCleanup() {
  try {
    const summary = await runCleanup();
    console.log("[cleanup] scheduled", summary);
  } catch (err) {
    console.error("[cleanup] error:", err);
  }
}

setTimeout(scheduledCleanup, 10_000);
setInterval(scheduledCleanup, 15 * 60 * 1000);

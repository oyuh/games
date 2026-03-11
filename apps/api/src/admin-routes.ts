import { Hono } from "hono";
import { eq, ne, and, gt } from "drizzle-orm";
import {
  sessions,
  imposterGames,
  passwordGames,
  chainReactionGames,
  shadeSignalGames,
  chatMessages,
  adminBans,
  adminRestrictedNames,
  adminNameOverrides,
  statusTable,
} from "@games/shared";
import { drizzleClient } from "./db-provider";
import {
  broadcastToAll,
  broadcastToSession,
  disconnectSession,
  getCustomStatus,
  setCustomStatus,
  type CustomStatusPayload,
} from "./broadcast-server";

function genId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 12)}`;
}

// ─── Ban storage (database-backed) ──────────────────────────
type Ban = {
  id: string;
  type: "session" | "ip" | "region";
  value: string;
  reason: string;
  createdAt: number;
};

// In-memory cache of bans, synced from DB on startup and on changes
let bansCache: Ban[] = [];

async function loadBansFromDb() {
  const rows = await drizzleClient.select().from(adminBans);
  bansCache = rows.map((r) => ({
    id: r.id,
    type: r.type as Ban["type"],
    value: r.value,
    reason: r.reason,
    createdAt: r.createdAt,
  }));
}

// Load bans on startup
loadBansFromDb().catch(console.error);

export function isBanned(sessionId: string, ip: string, region: string): Ban | null {
  for (const ban of bansCache) {
    if (ban.type === "session" && ban.value === sessionId) return ban;
    if (ban.type === "ip" && ban.value === ip) return ban;
    if (ban.type === "region" && ban.value.toLowerCase() === region.toLowerCase()) return ban;
  }
  return null;
}

export function getBans() {
  return bansCache;
}

// ─── Middleware: verify admin secret ─────────────────────────
function adminAuth(c: any, next: () => Promise<void>) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return c.json({ error: "Admin API not configured" }, 503);
  }
  const auth = c.req.header("Authorization");
  if (auth !== `Bearer ${secret}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
}

export const adminRoutes = new Hono();

adminRoutes.use("*", adminAuth);

// ─── Connected clients (from sessions table) ───────────────
adminRoutes.get("/clients", async (c) => {
  const recentCutoff = Date.now() - 5 * 60 * 1000; // active in last 5 min
  const allSessions = await drizzleClient
    .select()
    .from(sessions)
    .where(gt(sessions.lastSeen, recentCutoff));

  const clients = allSessions.map((s) => ({
    sessionId: s.id,
    name: s.name,
    ip: null,
    userAgent: null,
    region: null,
    connectedAt: null,
    lastSeen: s.lastSeen,
    gameId: s.gameId,
    gameType: s.gameType,
  }));
  return c.json({ ok: true, clients, total: clients.length });
});

// ─── Active games list ──────────────────────────────────────
adminRoutes.get("/games", async (c) => {
  const [imposter, password, chain, shade] = await Promise.all([
    drizzleClient
      .select({
        id: imposterGames.id,
        code: imposterGames.code,
        hostId: imposterGames.hostId,
        phase: imposterGames.phase,
        players: imposterGames.players,
        createdAt: imposterGames.createdAt,
        updatedAt: imposterGames.updatedAt,
      })
      .from(imposterGames)
      .where(ne(imposterGames.phase, "ended")),
    drizzleClient
      .select({
        id: passwordGames.id,
        code: passwordGames.code,
        hostId: passwordGames.hostId,
        phase: passwordGames.phase,
        teams: passwordGames.teams,
        createdAt: passwordGames.createdAt,
        updatedAt: passwordGames.updatedAt,
      })
      .from(passwordGames)
      .where(ne(passwordGames.phase, "ended")),
    drizzleClient
      .select({
        id: chainReactionGames.id,
        code: chainReactionGames.code,
        hostId: chainReactionGames.hostId,
        phase: chainReactionGames.phase,
        players: chainReactionGames.players,
        createdAt: chainReactionGames.createdAt,
        updatedAt: chainReactionGames.updatedAt,
      })
      .from(chainReactionGames)
      .where(ne(chainReactionGames.phase, "ended")),
    drizzleClient
      .select({
        id: shadeSignalGames.id,
        code: shadeSignalGames.code,
        hostId: shadeSignalGames.hostId,
        phase: shadeSignalGames.phase,
        players: shadeSignalGames.players,
        createdAt: shadeSignalGames.createdAt,
        updatedAt: shadeSignalGames.updatedAt,
      })
      .from(shadeSignalGames)
      .where(ne(shadeSignalGames.phase, "ended")),
  ]);

  return c.json({
    ok: true,
    games: {
      imposter: imposter.map((g) => ({ ...g, type: "imposter" })),
      password: password.map((g) => ({ ...g, type: "password" })),
      chain_reaction: chain.map((g) => ({ ...g, type: "chain_reaction" })),
      shade_signal: shade.map((g) => ({ ...g, type: "shade_signal" })),
    },
    totals: {
      imposter: imposter.length,
      password: password.length,
      chain_reaction: chain.length,
      shade_signal: shade.length,
      total: imposter.length + password.length + chain.length + shade.length,
    },
  });
});

// ─── Game details ───────────────────────────────────────────
adminRoutes.get("/games/:type/:id", async (c) => {
  const { type, id } = c.req.param();
  let game: any = null;

  if (type === "imposter") {
    const [row] = await drizzleClient.select().from(imposterGames).where(eq(imposterGames.id, id));
    game = row;
  } else if (type === "password") {
    const [row] = await drizzleClient.select().from(passwordGames).where(eq(passwordGames.id, id));
    game = row;
  } else if (type === "chain_reaction") {
    const [row] = await drizzleClient.select().from(chainReactionGames).where(eq(chainReactionGames.id, id));
    game = row;
  } else if (type === "shade_signal") {
    const [row] = await drizzleClient.select().from(shadeSignalGames).where(eq(shadeSignalGames.id, id));
    game = row;
  } else {
    return c.json({ error: "Invalid game type" }, 400);
  }

  if (!game) {
    return c.json({ error: "Game not found" }, 404);
  }

  // Get sessions attached to this game
  const gameSessions = await drizzleClient
    .select()
    .from(sessions)
    .where(and(eq(sessions.gameId, id), eq(sessions.gameType, type as any)));

  return c.json({ ok: true, game: { ...game, type }, sessions: gameSessions });
});

// ─── End a specific game ────────────────────────────────────
adminRoutes.post("/games/:type/:id/end", async (c) => {
  const { type, id } = c.req.param();

  const now = Date.now();

  if (type === "imposter") {
    await drizzleClient.update(imposterGames).set({ phase: "ended", updatedAt: now }).where(eq(imposterGames.id, id));
  } else if (type === "password") {
    await drizzleClient.update(passwordGames).set({ phase: "ended", updatedAt: now }).where(eq(passwordGames.id, id));
  } else if (type === "chain_reaction") {
    await drizzleClient.update(chainReactionGames).set({ phase: "ended", updatedAt: now }).where(eq(chainReactionGames.id, id));
  } else if (type === "shade_signal") {
    await drizzleClient.update(shadeSignalGames).set({ phase: "ended", updatedAt: now }).where(eq(shadeSignalGames.id, id));
  } else {
    return c.json({ error: "Invalid game type" }, 400);
  }

  // Detach all sessions from this game
  const attached = await drizzleClient
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.gameId, id), eq(sessions.gameType, type as any)));

  for (const s of attached) {
    await drizzleClient
      .update(sessions)
      .set({ gameType: null, gameId: null, lastSeen: now })
      .where(eq(sessions.id, s.id));
  }

  return c.json({ ok: true, sessionsDetached: attached.length });
});

// ─── End ALL games ──────────────────────────────────────────
adminRoutes.post("/games/end-all", async (c) => {
  const now = Date.now();

  const [i, p, cr, ss] = await Promise.all([
    drizzleClient
      .update(imposterGames)
      .set({ phase: "ended", updatedAt: now })
      .where(ne(imposterGames.phase, "ended"))
      .returning({ id: imposterGames.id }),
    drizzleClient
      .update(passwordGames)
      .set({ phase: "ended", updatedAt: now })
      .where(ne(passwordGames.phase, "ended"))
      .returning({ id: passwordGames.id }),
    drizzleClient
      .update(chainReactionGames)
      .set({ phase: "ended", updatedAt: now })
      .where(ne(chainReactionGames.phase, "ended"))
      .returning({ id: chainReactionGames.id }),
    drizzleClient
      .update(shadeSignalGames)
      .set({ phase: "ended", updatedAt: now })
      .where(ne(shadeSignalGames.phase, "ended"))
      .returning({ id: shadeSignalGames.id }),
  ]);

  const total = i.length + p.length + cr.length + ss.length;

  return c.json({ ok: true, ended: { imposter: i.length, password: p.length, chain_reaction: cr.length, shade_signal: ss.length, total } });
});

// ─── Kick player from game ──────────────────────────────────
adminRoutes.post("/games/:type/:id/kick/:sessionId", async (c) => {
  const { type, id, sessionId } = c.req.param();
  const now = Date.now();

  // Detach session
  await drizzleClient
    .update(sessions)
    .set({ gameType: null, gameId: null, lastSeen: now })
    .where(eq(sessions.id, sessionId));

  // Add to kicked list in game
  if (type === "imposter") {
    const [game] = await drizzleClient.select({ kicked: imposterGames.kicked, players: imposterGames.players }).from(imposterGames).where(eq(imposterGames.id, id));
    if (game) {
      const kicked = [...(game.kicked || []), sessionId];
      const players = (game.players || []).filter((p: any) => p.sessionId !== sessionId);
      await drizzleClient.update(imposterGames).set({ kicked, players, updatedAt: now }).where(eq(imposterGames.id, id));
    }
  } else if (type === "password") {
    const [game] = await drizzleClient.select({ kicked: passwordGames.kicked, teams: passwordGames.teams }).from(passwordGames).where(eq(passwordGames.id, id));
    if (game) {
      const kicked = [...(game.kicked || []), sessionId];
      const teams = (game.teams || []).map((t: any) => ({ ...t, members: t.members.filter((m: string) => m !== sessionId) }));
      await drizzleClient.update(passwordGames).set({ kicked, teams, updatedAt: now }).where(eq(passwordGames.id, id));
    }
  } else if (type === "chain_reaction") {
    const [game] = await drizzleClient.select({ kicked: chainReactionGames.kicked, players: chainReactionGames.players }).from(chainReactionGames).where(eq(chainReactionGames.id, id));
    if (game) {
      const kicked = [...(game.kicked || []), sessionId];
      const players = (game.players || []).filter((p: any) => p.sessionId !== sessionId);
      await drizzleClient.update(chainReactionGames).set({ kicked, players, updatedAt: now }).where(eq(chainReactionGames.id, id));
    }
  } else if (type === "shade_signal") {
    const [game] = await drizzleClient.select({ kicked: shadeSignalGames.kicked, players: shadeSignalGames.players }).from(shadeSignalGames).where(eq(shadeSignalGames.id, id));
    if (game) {
      const kicked = [...(game.kicked || []), sessionId];
      const players = (game.players || []).filter((p: any) => p.sessionId !== sessionId);
      await drizzleClient.update(shadeSignalGames).set({ kicked, players, updatedAt: now }).where(eq(shadeSignalGames.id, id));
    }
  }

  // Notify the kicked client
  broadcastToSession(sessionId, { type: "admin:kick", sessionId, reason: "Kicked by admin" });

  return c.json({ ok: true });
});

// ─── Bans ───────────────────────────────────────────────────
adminRoutes.get("/bans", (c) => {
  return c.json({ ok: true, bans: bansCache });
});

adminRoutes.post("/bans", async (c) => {
  const body = await c.req.json();
  const { type, value, reason } = body as { type: string; value: string; reason?: string };

  if (!["session", "ip", "region"].includes(type) || !value) {
    return c.json({ error: "Invalid ban: need type (session|ip|region) and value" }, 400);
  }

  const ban: Ban = {
    id: genId("ban"),
    type: type as Ban["type"],
    value,
    reason: reason || "",
    createdAt: Date.now(),
  };

  await drizzleClient.insert(adminBans).values({
    id: ban.id,
    type: ban.type,
    value: ban.value,
    reason: ban.reason,
    createdAt: ban.createdAt,
  });
  bansCache.push(ban);

  // If banning a session, disconnect them
  if (type === "session") {
    disconnectSession(value);
  }

  // For IP/region bans, the ban check happens at Pusher auth time.
  // The user won't be able to re-subscribe on their next auth attempt.

  return c.json({ ok: true, ban });
});

adminRoutes.delete("/bans/:id", async (c) => {
  const { id } = c.req.param();
  const idx = bansCache.findIndex((b) => b.id === id);
  if (idx === -1) {
    return c.json({ error: "Ban not found" }, 404);
  }
  const removed = bansCache.splice(idx, 1)[0];
  await drizzleClient.delete(adminBans).where(eq(adminBans.id, id));
  return c.json({ ok: true, removed });
});

// ─── Broadcast: global toast ────────────────────────────────
adminRoutes.post("/broadcast/toast", async (c) => {
  const body = await c.req.json();
  const { message, level, targetSessionId } = body as {
    message: string;
    level?: "error" | "success" | "info";
    targetSessionId?: string;
  };

  if (!message) {
    return c.json({ error: "message is required" }, 400);
  }

  broadcastToAll({
    type: "admin:toast",
    message,
    level: level || "info",
    ...(targetSessionId ? { targetSessionId } : {}),
  });

  return c.json({ ok: true });
});

// ─── Broadcast: force refresh ───────────────────────────────
adminRoutes.post("/broadcast/refresh", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { countdown } = body as { countdown?: number };

  if (countdown && countdown > 0) {
    // Send warning toast first
    broadcastToAll({
      type: "admin:toast",
      message: `Site will refresh in ${Math.ceil(countdown / 60)} minutes for an update.`,
      level: "info",
    });

    // Schedule the actual refresh
    setTimeout(() => {
      broadcastToAll({ type: "admin:refresh" });
    }, countdown * 1000);

    return c.json({ ok: true, refreshIn: countdown });
  }

  broadcastToAll({ type: "admin:refresh" });
  return c.json({ ok: true });
});

// ─── Broadcast: custom status (enhanced: link, color, flash) ─
adminRoutes.get("/status", (c) => {
  return c.json({ ok: true, status: getCustomStatus() });
});

adminRoutes.post("/status", async (c) => {
  const body = await c.req.json();
  const { text, link, color, flash } = body as { text: string | null; link?: string | null; color?: string | null; flash?: boolean };

  if (!text) {
    setCustomStatus(null);
    // Persist cleared status
    await drizzleClient
      .insert(statusTable)
      .values({ key: "custom_status", value: JSON.stringify(null), updatedAt: Date.now() })
      .onConflictDoUpdate({ target: statusTable.key, set: { value: JSON.stringify(null), updatedAt: Date.now() } });
    broadcastToAll({ type: "admin:status", status: null });
    return c.json({ ok: true, status: null });
  }

  const payload: CustomStatusPayload = {
    text,
    link: link || null,
    color: color || null,
    flash: flash || false,
  };
  setCustomStatus(payload);

  // Persist to DB
  await drizzleClient
    .insert(statusTable)
    .values({ key: "custom_status", value: JSON.stringify(payload), updatedAt: Date.now() })
    .onConflictDoUpdate({ target: statusTable.key, set: { value: JSON.stringify(payload), updatedAt: Date.now() } });

  broadcastToAll({ type: "admin:status", status: payload });

  return c.json({ ok: true, status: payload });
});

adminRoutes.delete("/status", async (c) => {
  setCustomStatus(null);
  await drizzleClient
    .insert(statusTable)
    .values({ key: "custom_status", value: JSON.stringify(null), updatedAt: Date.now() })
    .onConflictDoUpdate({ target: statusTable.key, set: { value: JSON.stringify(null), updatedAt: Date.now() } });
  broadcastToAll({ type: "admin:status", status: null });
  return c.json({ ok: true });
});

// ─── API update with countdown warning ──────────────────────
adminRoutes.post("/broadcast/update-warning", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { minutes } = body as { minutes?: number };
  const mins = minutes || 5;
  const totalSec = mins * 60;

  // Send initial warning
  broadcastToAll({
    type: "admin:toast",
    message: `The site will be updated and refreshed in ${mins} minute${mins > 1 ? "s" : ""}. Your games will be saved.`,
    level: "info",
  });

  // Send 1-minute warning
  if (totalSec > 60) {
    setTimeout(() => {
      broadcastToAll({
        type: "admin:toast",
        message: "Site update in 1 minute. Finishing up...",
        level: "info",
      });
    }, (totalSec - 60) * 1000);
  }

  // Send 10-second warning
  setTimeout(() => {
    broadcastToAll({
      type: "admin:toast",
      message: "Refreshing in 10 seconds...",
      level: "info",
    });
  }, (totalSec - 10) * 1000);

  // Force refresh
  setTimeout(() => {
    broadcastToAll({ type: "admin:refresh" });
  }, totalSec * 1000);

  return c.json({ ok: true, refreshIn: totalSec });
});

// ─── Restrict a specific connected client ───────────────────
adminRoutes.post("/clients/:sessionId/restrict", async (c) => {
  const { sessionId } = c.req.param();
  const body = await c.req.json();
  const { type, value, reason } = body as { type: "session" | "ip" | "region"; value?: string; reason?: string };

  // For session bans, use the sessionId. For ip/region bans, value must be provided by the admin.
  let banValue = sessionId;
  if (type === "ip") {
    if (!value) return c.json({ error: "IP value is required for ip bans" }, 400);
    banValue = value;
  }
  if (type === "region") {
    if (!value) return c.json({ error: "Region value is required for region bans" }, 400);
    banValue = value;
  }

  const ban: Ban = {
    id: genId("ban"),
    type: type || "session",
    value: banValue,
    reason: reason || "Restricted by admin",
    createdAt: Date.now(),
  };

  await drizzleClient.insert(adminBans).values({
    id: ban.id,
    type: ban.type,
    value: ban.value,
    reason: ban.reason,
    createdAt: ban.createdAt,
  });
  bansCache.push(ban);

  disconnectSession(sessionId);

  return c.json({ ok: true, ban });
});

adminRoutes.post("/clients/:sessionId/toast", async (c) => {
  const { sessionId } = c.req.param();
  const body = await c.req.json();
  const { message, level } = body as { message: string; level?: "error" | "success" | "info" };

  if (!message) {
    return c.json({ error: "message is required" }, 400);
  }

  broadcastToSession(sessionId, {
    type: "admin:toast",
    message,
    level: level || "info",
  });

  return c.json({ ok: true });
});

// ─── Name Management ────────────────────────────────────────

// Change a client's name (admin override)
adminRoutes.post("/clients/:sessionId/name", async (c) => {
  const { sessionId } = c.req.param();
  const body = await c.req.json();
  const { name, reason } = body as { name: string; reason?: string };

  if (!name || !name.trim()) {
    return c.json({ error: "Name is required" }, 400);
  }

  const sanitizedName = name.trim().replace(/\s/g, "");
  if (sanitizedName.length > 20) {
    return c.json({ error: "Name too long (max 20 chars)" }, 400);
  }

  // Save override in DB
  await drizzleClient
    .insert(adminNameOverrides)
    .values({ sessionId, forcedName: sanitizedName, reason: reason || "", updatedAt: Date.now() })
    .onConflictDoUpdate({ target: adminNameOverrides.sessionId, set: { forcedName: sanitizedName, reason: reason || "", updatedAt: Date.now() } });

  // Update the session's name in sessions table if it exists
  await drizzleClient
    .update(sessions)
    .set({ name: sanitizedName })
    .where(eq(sessions.id, sessionId));

  // Notify the client to update their name
  broadcastToSession(sessionId, {
    type: "admin:name-changed",
    sessionId,
    name: sanitizedName,
  });

  return c.json({ ok: true, name: sanitizedName });
});

// Remove admin name override
adminRoutes.delete("/clients/:sessionId/name", async (c) => {
  const { sessionId } = c.req.param();
  await drizzleClient.delete(adminNameOverrides).where(eq(adminNameOverrides.sessionId, sessionId));
  return c.json({ ok: true });
});

// Get all name overrides
adminRoutes.get("/names/overrides", async (c) => {
  const overrides = await drizzleClient.select().from(adminNameOverrides);
  return c.json({ ok: true, overrides });
});

// ─── Restricted Names ───────────────────────────────────────

adminRoutes.get("/names/restricted", async (c) => {
  const restricted = await drizzleClient.select().from(adminRestrictedNames);
  return c.json({ ok: true, restricted });
});

adminRoutes.post("/names/restricted", async (c) => {
  const body = await c.req.json();
  const { pattern, reason } = body as { pattern: string; reason?: string };

  if (!pattern || !pattern.trim()) {
    return c.json({ error: "Pattern is required" }, 400);
  }

  const entry = {
    id: genId("rn"),
    pattern: pattern.trim().toLowerCase(),
    reason: reason || "",
    createdAt: Date.now(),
  };

  await drizzleClient.insert(adminRestrictedNames).values(entry);

  // Broadcast updated restrictions to all clients
  const allRestricted = await drizzleClient.select({ pattern: adminRestrictedNames.pattern }).from(adminRestrictedNames);
  broadcastToAll({ type: "admin:name-restricted", patterns: allRestricted.map((r) => r.pattern) });

  return c.json({ ok: true, entry });
});

adminRoutes.delete("/names/restricted/:id", async (c) => {
  const { id } = c.req.param();

  const [existing] = await drizzleClient.select().from(adminRestrictedNames).where(eq(adminRestrictedNames.id, id));
  if (!existing) {
    return c.json({ error: "Restricted name not found" }, 404);
  }

  await drizzleClient.delete(adminRestrictedNames).where(eq(adminRestrictedNames.id, id));

  // Broadcast updated restrictions
  const allRestricted = await drizzleClient.select({ pattern: adminRestrictedNames.pattern }).from(adminRestrictedNames);
  broadcastToAll({ type: "admin:name-restricted", patterns: allRestricted.map((r) => r.pattern) });

  return c.json({ ok: true, removed: existing });
});

// ─── Public: check restricted names (no auth required) ──────
// This is mounted separately in index.ts

export function getRestrictedNamesRoute() {
  const publicRoutes = new Hono();

  publicRoutes.get("/names/restricted", async (c) => {
    const restricted = await drizzleClient.select({ pattern: adminRestrictedNames.pattern }).from(adminRestrictedNames);
    return c.json({ ok: true, patterns: restricted.map((r) => r.pattern) });
  });

  return publicRoutes;
}

// ─── Load persisted custom status from DB on startup ────────
export async function loadPersistedStatus() {
  try {
    const [row] = await drizzleClient
      .select()
      .from(statusTable)
      .where(eq(statusTable.key, "custom_status"));
    if (row) {
      const parsed = JSON.parse(row.value);
      setCustomStatus(parsed);
    }
  } catch {
    // ignore - status not set yet
  }
}

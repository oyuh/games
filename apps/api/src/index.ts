import { mutators, queries, schema } from "@games/shared";
import { chainReactionGames, imposterGames, passwordGames, sessions, shadeSignalGames, statusTable } from "@games/shared";
import { serve } from "@hono/node-server";
import { handleMutateRequest, handleQueryRequest } from "@rocicorp/zero/server";
import { mustGetMutator, mustGetQuery } from "@rocicorp/zero";
import { config } from "dotenv";
import { lt, and, ne, eq, count } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { dbProvider } from "./db-provider";
import { drizzleClient } from "./db-provider";
import { startPresenceServer } from "./presence-server";
import { startBroadcastServer, broadcastToAll, getCustomStatus, setBanChecker } from "./broadcast-server";
import { adminRoutes, isBanned, getRestrictedNamesRoute, loadPersistedStatus } from "./admin-routes";

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
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400
  })
);

// ─── Admin routes ──────────────────────────────────────────
app.route("/api/admin", adminRoutes);

// ─── Public endpoints (no auth) ─────────────────────────────
app.route("/api/public", getRestrictedNamesRoute());

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
  const result = await handleQueryRequest(
    (name, args) => {
      const query = mustGetQuery(queries, name);
      return query.fn({ args, ctx: { userId: "anon" } });
    },
    schema,
    request
  );
  return c.json(result);
});

app.post("/api/zero/mutate", async (c) => {
  const request = c.req.raw;
  const result = await handleMutateRequest(
    dbProvider,
    (transact) =>
      transact((tx, name, args) => {
        const mutator = mustGetMutator(mutators, name);
        return mutator.fn({ args, tx, ctx: { userId: "anon" } });
      }),
    request
  );
  return c.json(result);
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

  // 3) Detach sessions that were in those ended games
  const endedGameIds = new Set([
    ...endedImposter.map((g) => g.id),
    ...endedPassword.map((g) => g.id),
    ...endedChain.map((g) => g.id),
    ...endedShade.map((g) => g.id)
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
  const [sessionCount = { total: 0 }] = await drizzleClient.select({ total: count() }).from(sessions);

  return {
    imposterGamesEnded: endedImposter.length,
    passwordGamesEnded: endedPassword.length,
    chainReactionGamesEnded: endedChain.length,
    shadeSignalGamesEnded: endedShade.length,
    imposterGamesDeleted: deletedImposter.length,
    passwordGamesDeleted: deletedPassword.length,
    chainReactionGamesDeleted: deletedChain.length,
    shadeSignalGamesDeleted: deletedShade.length,
    sessionsDeleted: deletedSessions.length,
    staleCutoff: new Date(staleCutoff).toISOString(),
    deleteCutoff: new Date(deleteCutoff).toISOString(),
    totals: {
      imposterGames: imposterCount.total,
      passwordGames: passwordCount.total,
      chainReactionGames: chainCount.total,
      shadeSignalGames: shadeCount.total,
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

startPresenceServer(server, "/presence");
startBroadcastServer(server, "/broadcast");
setBanChecker(isBanned);

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

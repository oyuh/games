import { mutators, queries, schema } from "@games/shared";
import { imposterGames, passwordGames, sessions } from "@games/shared";
import { serve } from "@hono/node-server";
import { handleMutateRequest, handleQueryRequest } from "@rocicorp/zero/server";
import { mustGetMutator, mustGetQuery } from "@rocicorp/zero";
import { config } from "dotenv";
import { lt } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { dbProvider } from "./db-provider";
import { drizzleClient } from "./db-provider";
import { startPresenceServer } from "./presence-server";
//fix

config({ path: "../../.env" });

const app = new Hono();

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
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400
  })
);
const apiStartedAt = new Date().toISOString();

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

app.get("/health", (c) => c.json({ ok: true }));

app.get("/debug/build-info", (c) => {
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
    environment: process.env.NODE_ENV ?? "development"
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
app.post("/api/cleanup", async (c) => {
  const authHeader = c.req.header("Authorization");
  const expectedToken = process.env.CLEANUP_SECRET ?? "cleanup-local";
  if (authHeader !== `Bearer ${expectedToken}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  const deletedImposter = await drizzleClient
    .delete(imposterGames)
    .where(lt(imposterGames.updatedAt, oneHourAgo))
    .returning({ id: imposterGames.id });

  const deletedPassword = await drizzleClient
    .delete(passwordGames)
    .where(lt(passwordGames.updatedAt, oneHourAgo))
    .returning({ id: passwordGames.id });

  const deletedSessions = await drizzleClient
    .delete(sessions)
    .where(lt(sessions.lastSeen, oneHourAgo))
    .returning({ id: sessions.id });

  const summary = {
    imposterGamesDeleted: deletedImposter.length,
    passwordGamesDeleted: deletedPassword.length,
    sessionsDeleted: deletedSessions.length,
    cutoff: new Date(oneHourAgo).toISOString(),
  };
  console.log("[cleanup]", summary);
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

// ─── Auto-cleanup: run every hour ──────────────────────────
async function runCleanup() {
  try {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    const deletedImposter = await drizzleClient
      .delete(imposterGames)
      .where(lt(imposterGames.updatedAt, oneHourAgo))
      .returning({ id: imposterGames.id });

    const deletedPassword = await drizzleClient
      .delete(passwordGames)
      .where(lt(passwordGames.updatedAt, oneHourAgo))
      .returning({ id: passwordGames.id });

    const deletedSessions = await drizzleClient
      .delete(sessions)
      .where(lt(sessions.lastSeen, oneHourAgo))
      .returning({ id: sessions.id });

    console.log("[cleanup]", {
      imposterGamesDeleted: deletedImposter.length,
      passwordGamesDeleted: deletedPassword.length,
      sessionsDeleted: deletedSessions.length,
      cutoff: new Date(oneHourAgo).toISOString(),
    });
  } catch (err) {
    console.error("[cleanup] error:", err);
  }
}

// Run once on startup (after 10s delay), then every hour
setTimeout(runCleanup, 10_000);
setInterval(runCleanup, 60 * 60 * 1000);

import { schema as zeroSchema } from "@games/shared";
import { chainReactionGames, imposterGames, passwordGames, sessions, statusTable } from "@games/shared";
import { zeroDrizzle } from "@rocicorp/zero/server/adapters/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const connStr = process.env.DATABASE_URL ?? process.env.ZERO_UPSTREAM_DB ?? "";
const url = new URL(connStr);

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function defaultSslMode(hostname: string) {
  if (isLocalHostname(hostname)) {
    return "disable";
  }

  if (hostname.endsWith(".railway.internal")) {
    return "require";
  }

  return "verify-full";
}

if (!url.searchParams.has("sslmode")) {
  url.searchParams.set("sslmode", defaultSslMode(url.hostname));
}

const pool = new Pool({
  connectionString: url.toString()
});

export const drizzleClient = drizzle(pool, {
  schema: {
    sessions,
    statusTable,
    imposterGames,
    passwordGames,
    chainReactionGames
  }
});

export const dbProvider = zeroDrizzle(zeroSchema, drizzleClient);

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    dbProvider: typeof dbProvider;
  }
}

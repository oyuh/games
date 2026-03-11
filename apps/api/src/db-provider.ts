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

function resolveSslConfig(hostname: string, sslMode: string | null) {
  if (sslMode === "disable" || isLocalHostname(hostname)) {
    return false;
  }

  if (sslMode === "no-verify" || hostname.endsWith(".railway.internal")) {
    return {
      rejectUnauthorized: false
    };
  }

  return {
    rejectUnauthorized: true
  };
}

const sslMode = url.searchParams.get("sslmode") ?? defaultSslMode(url.hostname);

// node-postgres replaces the explicit ssl object if sslmode-related params are left
// in the connection string, so strip them before constructing the pool config.
url.searchParams.delete("sslmode");
url.searchParams.delete("sslcert");
url.searchParams.delete("sslkey");
url.searchParams.delete("sslrootcert");

const pool = new Pool({
  connectionString: url.toString(),
  ssl: resolveSslConfig(url.hostname, sslMode),
  max: 3,
  idleTimeoutMillis: 30_000,
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

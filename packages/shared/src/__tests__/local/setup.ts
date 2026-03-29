/**
 * Local test setup — runs before local-only tests.
 *
 * Establishes a connection to the local dev database and provides
 * cleanup utilities. Uses the same DB connection as local dev.
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { beforeAll, afterAll } from "vitest";
import * as schema from "../../drizzle/schema";

// Load .env from workspace root
config({ path: "../../.env" });

const DATABASE_URL = process.env.DATABASE_URL;

let pool: pg.Pool;

export function getDb() {
  return drizzle(pool, { schema });
}

export function getPool() {
  return pool;
}

beforeAll(() => {
  if (!DATABASE_URL) {
    throw new Error(
      "DATABASE_URL not set. Local tests require a running dev database.\n" +
        "Run `pnpm local:dev` first, or set DATABASE_URL in .env."
    );
  }
  console.log("[local-setup] Using database:", DATABASE_URL.replace(/\/\/.*@/, "//***@"));

  const url = new URL(DATABASE_URL);
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";

  pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 2,
    idleTimeoutMillis: 10_000,
  });
});

afterAll(async () => {
  if (pool) await pool.end();
});

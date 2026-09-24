import { afterAll, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";

/*
 * Code that takes a second pool connection while its transaction holds one
 * deadlocks the API once every connection is held that way: three Zero
 * mutations at a phase change were enough with a pool of 3. Here the shared
 * pool has a single connection, so any such path fails within the connection
 * timeout instead of hanging a server.
 *
 * Opt in with a local database that has the schema pushed. The E2E job runs
 * this against the stack's database.
 */
const url = process.env.POOL_TEST_DATABASE_URL;

const { pool, db } = await vi.hoisted(async () => {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const url = process.env.POOL_TEST_DATABASE_URL;
  const pool = url ? new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 2_000 }) : null;
  return { pool, db: pool ? drizzle(pool) : null };
});
vi.mock("../db-provider", () => ({ drizzleClient: db }));
import { recordedCleanup } from "../cleanup";
import { getOrCreateGameKey } from "../game-keys";
import { findRestrictedNameMatch } from "../name-rules";

describe.skipIf(!url)("with one pool connection", () => {
  afterAll(() => pool?.end());

  it("runs a recorded cleanup", async () => {
    await recordedCleanup("pool-test");
  });

  it("records a skipped cleanup without leaving a running row", async () => {
    await db!.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(714209)`);
      // Holding the lock also holds the only connection, so this needs its own pool.
      const other = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 2_000 });
      try {
        expect(await recordedCleanup("pool-test-skipped", drizzle(other) as never)).toBeNull();
      } finally {
        await other.end();
      }
    });
    const left = await db!.execute(sql`SELECT count(*)::int AS n FROM cleanup_runs WHERE trigger = 'pool-test-skipped'`);
    expect(left.rows[0]?.n).toBe(0);
  });

  it("creates and reads a game key inside a transaction", async () => {
    const gameId = `pool-test-${crypto.randomUUID()}`;
    await db!.transaction(async (tx) => {
      const key = await getOrCreateGameKey("imposter", gameId, tx as never);
      expect(await getOrCreateGameKey("imposter", gameId, tx as never)).toBe(key);
      tx.rollback();
    }).catch((error: unknown) => {
      if (!(error instanceof Error && error.message === "Rollback")) throw error;
    });
  });

  it("checks restricted names inside a transaction", async () => {
    await db!.transaction(async (tx) => {
      await findRestrictedNameMatch("SomePlayer", tx as never);
    });
  });
});

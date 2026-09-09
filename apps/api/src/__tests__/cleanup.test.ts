import { describe, expect, it, vi, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import { cleanupReportLines, formatCleanupReport, percentage } from "../cleanup-report";

vi.mock("../db-provider", () => ({ drizzleClient: null }));
import { recordedCleanup } from "../cleanup";

it("formats percentages and readable reports with optional terminal color", () => {
  expect(percentage(0, 0)).toBe("0.0%");
  expect(percentage(1, 4)).toBe("25.0%");
  const lines = cleanupReportLines({ ended: { imposter: 1 }, deleted: { imposter: 1, sessions: 0, encryptionKeys: 0, chatMessages: 0 }, totals: { imposterGames: 3, sessions: 0 }, archive: { sessionsArchived: 0, sessionsTrimmed: 0 }, detachedSessions: 0, shikaku: { scoresChecked: 0, scoresTrimmed: 0, suspiciousRemoved: 0 }, pips: { scoresChecked: 4, scoresTrimmed: 1, suspiciousRemoved: 1 } });
  expect(lines[0]?.value).toContain("4 rooms checked, 1 ended (25.0%), 1 deleted (25.0%)");
  expect(lines.find((line) => line.label === "Pips")?.value).toContain("1 invalid removed (25.0%)");
  expect(formatCleanupReport(lines, "test", 1000)).not.toMatch(/[╔═║🧹]|\x1b/);
  expect(formatCleanupReport(lines, "test", 1000, true)).toContain("\x1b[32m");
});

// Opt in with a disposable local database, schema applied through db:push.
const url = process.env.CLEANUP_TEST_DATABASE_URL;
describe.skipIf(!url)("cleanup against PostgreSQL", () => {
  const pool = new Pool({ connectionString: url, max: 3 });
  const db = drizzle(pool);
  afterAll(() => pool.end());
  it("audits both solo games, repairs rooms, archives sessions, and records results", async () => {
    if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith("_test")) throw new Error("Use a disposable local _test database");
    await db.execute(sql`TRUNCATE cleanup_runs, sessions, session_archive, chat_messages, game_encryption_keys, imposter_games, password_games, chain_reaction_games, shade_signal_games, location_signal_games, pips_scores, shikaku_scores`);
    const now = Date.now();
    for (const table of ["imposter_games", "password_games", "chain_reaction_games", "shade_signal_games", "location_signal_games"]) {
      await db.execute(sql.raw(`INSERT INTO ${table} (id, code, host_id, created_at, updated_at) VALUES ('${table}', '${table}', 'host', ${now - 1500000}, ${now - 1500000})`));
    }
    await db.execute(sql`INSERT INTO imposter_games (id, code, host_id, phase, created_at, updated_at) VALUES ('old', 'old', 'host', 'ended', ${now - 7200000}, ${now - 7200000}), ('fresh', 'fresh', 'host', 'lobby', ${now}, ${now})`);
    await db.execute(sql`INSERT INTO sessions (id, game_id, game_type, created_at, last_seen) VALUES ('stale', 'imposter_games', 'imposter', ${now - 7200000}, ${now - 7200000}), ('online', 'missing', 'imposter', ${now}, ${now})`);
    await db.execute(sql`INSERT INTO chat_messages (id, game_id, game_type, sender_id, sender_name, text, created_at) VALUES ('orphan', 'missing', 'imposter', 'online', 'Player', 'hello', ${now})`);
    await db.execute(sql`INSERT INTO game_encryption_keys (id, game_id, game_type, encryption_key, created_at) VALUES ('orphan', 'missing', 'imposter', 'key', ${now})`);
    await db.execute(sql`INSERT INTO pips_scores (id, session_id, name, seed, total_ms, easy_ms, medium_ms, hard_ms, created_at) SELECT 'pips-' || n, 'player', 'Player', n, 30000 + n * 3, 10000 + n, 10000 + n, 10000 + n, ${now} FROM generate_series(1, 22) n`);
    await db.execute(sql`INSERT INTO pips_scores (id, session_id, name, seed, total_ms, easy_ms, medium_ms, hard_ms, created_at) VALUES ('bad', 'player', 'Player', 123, 12000, 10000, 10000, 10000, ${now})`);
    await db.execute(sql`INSERT INTO shikaku_scores (id, session_id, name, seed, difficulty, score, time_ms, created_at) VALUES ('bad', 'player', 'Player', 1, 'unknown', 1, 30000, ${now})`);
    const result = await recordedCleanup("test", db as never);
    expect(result?.ended).toEqual({ imposter: 1, password: 1, chainReaction: 1, shadeSignal: 1, locationSignal: 1 });
    expect(result?.deleted).toMatchObject({ imposter: 1, sessions: 1, chatMessages: 1, encryptionKeys: 1 });
    expect(result?.pips).toEqual({ scoresChecked: 23, suspiciousRemoved: 1, scoresTrimmed: 2 });
    expect(result?.shikaku.suspiciousRemoved).toBe(1);
    expect(result?.detachedSessions).toBe(2);
    expect((await db.execute(sql`SELECT last_seen, game_id FROM sessions WHERE id = 'online'`)).rows[0]).toEqual({ last_seen: String(now), game_id: null });
    expect((await db.execute(sql`SELECT id FROM session_archive WHERE id = 'stale'`)).rows).toHaveLength(1);
    expect((await db.execute(sql`SELECT phase FROM imposter_games WHERE id = 'fresh'`)).rows[0]?.phase).toBe("lobby");
    expect((await db.execute(sql`SELECT status, report FROM cleanup_runs`)).rows[0]).toMatchObject({ status: "completed", report: expect.any(Array) });
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(714209)`);
      expect(await recordedCleanup("overlap", db as never)).toBeNull();
    });
    await db.execute(sql`INSERT INTO imposter_games (id, code, host_id, created_at, updated_at) VALUES ('rollback', 'rollback', 'host', ${now - 1500000}, ${now - 1500000})`);
    await db.execute(sql`ALTER TABLE pips_scores RENAME TO pips_scores_missing`);
    try {
      await expect(recordedCleanup("failure", db as never)).rejects.toThrow();
      expect((await db.execute(sql`SELECT phase FROM imposter_games WHERE id = 'rollback'`)).rows[0]?.phase).toBe("lobby");
      expect((await db.execute(sql`SELECT status FROM cleanup_runs WHERE trigger = 'failure'`)).rows[0]?.status).toBe("failed");
    } finally {
      await db.execute(sql`ALTER TABLE pips_scores_missing RENAME TO pips_scores`);
    }
  });
});

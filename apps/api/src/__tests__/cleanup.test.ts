import { describe, expect, it, vi, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import { cleanupDayLines, cleanupReportLines, compactSummary, expandStats, foldCleanupRuns, formatCleanupReport, legacyReportStats, percentage, storedReportLines } from "../cleanup-report";

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

it("stores runs as compact counters and renders the same report from them", () => {
  const summary = { ended: { imposter: 1, password: 0 }, deleted: { imposter: 1, sessions: 2, encryptionKeys: 0, chatMessages: 0 }, totals: { imposterGames: 3, sessions: 5 }, archive: { sessionsArchived: 2, sessionsTrimmed: 0 }, detachedSessions: 0, shikaku: { scoresChecked: 0, scoresTrimmed: 0, suspiciousRemoved: 0 }, pips: { scoresChecked: 4, scoresTrimmed: 1, suspiciousRemoved: 1 }, cutoffs: { stale: "2026-01-01T00:00:00.000Z" } };
  const stats = compactSummary(summary);
  expect(stats).toEqual({ "ended.imposter": 1, "deleted.imposter": 1, "deleted.sessions": 2, "totals.imposterGames": 3, "totals.sessions": 5, "archive.sessionsArchived": 2, "pips.scoresChecked": 4, "pips.scoresTrimmed": 1, "pips.suspiciousRemoved": 1 });
  expect(JSON.stringify(stats).length).toBeLessThan(JSON.stringify(cleanupReportLines(summary)).length / 4);
  expect(storedReportLines(stats)).toEqual(cleanupReportLines(expandStats(stats)));
  expect(storedReportLines(stats)?.find((line) => line.label === "Sessions")?.value).toBe("0 room links cleared, 2 archived, 2 deleted, 5 remaining");
  const legacy = [{ label: "Imposter", value: "old prose", tone: "info" as const }];
  expect(storedReportLines(legacy)).toBe(legacy);
  expect(storedReportLines(null)).toBeNull();
  // Old prose rows parse back to the same counters, and failed runs to nothing.
  expect(legacyReportStats([...cleanupReportLines(summary), { label: "Policy", value: "End rooms after 20 minutes idle.", tone: "info" }])).toEqual(stats);
  expect(legacyReportStats([{ label: "Cleanup failed", value: "Changes rolled back. See server logs for the error.", tone: "error" }])).toBeNull();
});

it("folds old runs into daily rows without summing snapshot totals", () => {
  const day = Date.UTC(2026, 8, 1, 12);
  const days = foldCleanupRuns([
    { startedAt: day, finishedAt: day + 1000, status: "completed", report: { "ended.imposter": 2, "totals.sessions": 9, "pips.scoresChecked": 4, "pips.suspiciousRemoved": 1 } },
    { startedAt: day + 60_000, finishedAt: day + 63_000, status: "failed", report: null },
    { startedAt: day + 120_000, finishedAt: null, status: "running", report: [{ label: "legacy", value: "", tone: "info" }] },
  ], [{ day: "2026-09-01", runs: 1, completed: 1, failed: 0, unfinished: 0, durationMs: 500, stats: { "ended.imposter": 1 } }]);
  expect(days).toEqual([{ day: "2026-09-01", runs: 4, completed: 2, failed: 1, unfinished: 1, durationMs: 4500, stats: { "ended.imposter": 3, "pips.suspiciousRemoved": 1 } }]);
  expect(cleanupDayLines(days[0]!.stats).map((line) => line.value)).toEqual([
    "3 ended, 0 deleted", "1 invalid removed, 0 over the limit removed", "0 archived, 0 deleted, 0 trimmed from the archive", "0 encryption keys and 0 chat messages deleted",
  ]);
});

// Opt in with a disposable local database, schema applied through db:push.
const url = process.env.CLEANUP_TEST_DATABASE_URL;
describe.skipIf(!url)("cleanup against PostgreSQL", () => {
  const pool = new Pool({ connectionString: url, max: 3 });
  const db = drizzle(pool);
  afterAll(() => pool.end());
  it("audits both solo games, repairs rooms, archives sessions, and records results", async () => {
    if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith("_test")) throw new Error("Use a disposable local _test database");
    await db.execute(sql`TRUNCATE cleanup_runs, cleanup_run_days, sessions, session_archive, chat_messages, game_encryption_keys, imposter_games, password_games, chain_reaction_games, shade_signal_games, location_signal_games, pips_scores, shikaku_scores`);
    const now = Date.now();
    for (const table of ["imposter_games", "password_games", "chain_reaction_games", "shade_signal_games", "location_signal_games"]) {
      await db.execute(sql.raw(`INSERT INTO ${table} (id, code, host_id, created_at, updated_at) VALUES ('${table}', '${table}', 'host', ${now - 1500000}, ${now - 1500000})`));
    }
    await db.execute(sql`INSERT INTO imposter_games (id, code, host_id, phase, created_at, updated_at) VALUES ('old', 'old', 'host', 'ended', ${now - 7200000}, ${now - 7200000}), ('fresh', 'fresh', 'host', 'lobby', ${now}, ${now})`);
    await db.execute(sql`INSERT INTO sessions (id, game_id, game_type, created_at, last_seen) VALUES ('stale', 'imposter_games', 'imposter', ${now - 7200000}, ${now - 7200000}), ('online', 'missing', 'imposter', ${now}, ${now})`);
    // 'stale' was archived before: it keeps the earliest first_seen, takes the newer last_seen, and counts the visit.
    await db.execute(sql`INSERT INTO session_archive (id, name, first_seen, last_seen, seen_count) VALUES ('stale', 'old', ${now - 9000000}, ${now - 8000000}, 3)`);
    await db.execute(sql`INSERT INTO chat_messages (id, game_id, game_type, sender_id, sender_name, text, created_at) VALUES ('orphan', 'missing', 'imposter', 'online', 'Player', 'hello', ${now})`);
    await db.execute(sql`INSERT INTO game_encryption_keys (id, game_id, game_type, encryption_key, created_at) VALUES ('orphan', 'missing', 'imposter', 'key', ${now})`);
    await db.execute(sql`INSERT INTO pips_scores (id, session_id, name, seed, total_ms, easy_ms, medium_ms, hard_ms, created_at) SELECT 'pips-' || n, 'player', 'Player', n, 30000 + n * 3, 10000 + n, 10000 + n, 10000 + n, ${now} FROM generate_series(1, 22) n`);
    await db.execute(sql`INSERT INTO pips_scores (id, session_id, name, seed, total_ms, easy_ms, medium_ms, hard_ms, created_at) VALUES ('bad', 'player', 'Player', 123, 12000, 10000, 10000, 10000, ${now})`);
    await db.execute(sql`INSERT INTO shikaku_scores (id, session_id, name, seed, difficulty, score, time_ms, created_at) VALUES ('bad', 'player', 'Player', 1, 'unknown', 1, 30000, ${now})`);
    const weekAgo = now - 8 * 24 * 60 * 60 * 1000;
    await db.execute(sql`INSERT INTO cleanup_runs (id, trigger, status, started_at, finished_at, report) VALUES ('old', 'scheduled', 'completed', ${weekAgo}, ${weekAgo + 2000}, '{"ended.imposter":2}')`);
    const legacy = JSON.stringify([{ label: "Imposter", value: "5 rooms checked, 1 ended (20.0%), 2 deleted (40.0%), 3 remaining", tone: "warning" }]);
    await db.execute(sql`INSERT INTO cleanup_runs (id, trigger, status, started_at, finished_at, report) VALUES ('legacy', 'scheduled', 'completed', ${now - 60000}, ${now - 59000}, ${legacy}::jsonb)`);
    const result = await recordedCleanup("test", db as never);
    expect(result?.ended).toEqual({ imposter: 1, password: 1, chainReaction: 1, shadeSignal: 1, locationSignal: 1 });
    expect(result?.deleted).toMatchObject({ imposter: 1, sessions: 1, chatMessages: 1, encryptionKeys: 1 });
    expect(result?.pips).toEqual({ scoresChecked: 23, suspiciousRemoved: 1, scoresTrimmed: 2 });
    expect(result?.shikaku.suspiciousRemoved).toBe(1);
    expect(result?.detachedSessions).toBe(2);
    expect((await db.execute(sql`SELECT last_seen, game_id FROM sessions WHERE id = 'online'`)).rows[0]).toEqual({ last_seen: String(now), game_id: null });
    expect((await db.execute(sql`SELECT first_seen, last_seen, seen_count FROM session_archive WHERE id = 'stale'`)).rows).toEqual([{ first_seen: String(now - 9000000), last_seen: String(now - 7200000), seen_count: 4 }]);
    expect((await db.execute(sql`SELECT phase FROM imposter_games WHERE id = 'fresh'`)).rows[0]?.phase).toBe("lobby");
    expect((await db.execute(sql`SELECT id, report FROM cleanup_runs ORDER BY started_at`)).rows).toEqual([
      { id: "legacy", report: { "ended.imposter": 1, "deleted.imposter": 2, "totals.imposterGames": 3 } },
      { id: expect.any(String), report: expect.objectContaining({ "ended.imposter": 1, "pips.suspiciousRemoved": 1 }) },
    ]);
    expect((await db.execute(sql`SELECT runs, completed, duration_ms, stats FROM cleanup_run_days`)).rows).toEqual([{ runs: 1, completed: 1, duration_ms: "2000", stats: { "ended.imposter": 2 } }]);
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

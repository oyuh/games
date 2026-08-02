/**
 * Local DB: the solo end screen's standings window.
 *
 * The end screen shows the top 3, your own rank plus and minus 3, and the
 * bottom 3, all from one query (selectScoreWindow in apps/api/src/index.ts).
 * The query lives in the API as raw SQL, so this test runs the same shape
 * against a scratch table to prove the slicing is right: the holes land where
 * they should, nothing is returned twice, and a caller with no score of their
 * own still gets the top and bottom instead of an error.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "./setup";

const TABLE = "test_local_window_scores";

/** Same SQL the API runs, pointed at the scratch table. */
async function windowRanks(sessionId: string): Promise<number[]> {
  const rows = await getDb().execute(sql`
    WITH ranked AS (
      SELECT session_id,
             row_number() OVER (ORDER BY total_ms ASC, created_at ASC) AS rank,
             count(*) OVER () AS total
      FROM ${sql.identifier(TABLE)}
    ),
    me AS (SELECT min(rank) AS rank FROM ranked WHERE session_id = ${sessionId})
    SELECT rank FROM ranked
    WHERE rank <= 3 OR rank > total - 3 OR abs(rank - (SELECT rank FROM me)) <= 3
    ORDER BY rank
  `);
  return (Array.isArray(rows) ? rows : rows.rows).map((row: any) => Number(row.rank));
}

async function seed(count: number, mineAt: number | null) {
  const db = getDb();
  await db.execute(sql`TRUNCATE ${sql.identifier(TABLE)}`);
  if (count === 0) return;
  await db.execute(sql`
    INSERT INTO ${sql.identifier(TABLE)} (session_id, total_ms, created_at)
    SELECT CASE WHEN g = ${mineAt} THEN 'me' ELSE 'other' || g END, g * 1000, g
    FROM generate_series(1, ${count}) g
  `);
}

beforeAll(async () => {
  await getDb().execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(TABLE)} (
      session_id text NOT NULL,
      total_ms integer NOT NULL,
      created_at bigint NOT NULL
    )
  `);
});

afterAll(async () => {
  await getDb().execute(sql`DROP TABLE IF EXISTS ${sql.identifier(TABLE)}`);
});

describe("Local DB: solo standings window", () => {
  it("returns the top 3, your rank plus and minus 3, and the bottom 3", async () => {
    await seed(30, 12);
    expect(await windowRanks("me")).toEqual([1, 2, 3, 9, 10, 11, 12, 13, 14, 15, 28, 29, 30]);
  });

  it("falls back to the top and bottom when you have no score", async () => {
    await seed(30, null);
    expect(await windowRanks("me")).toEqual([1, 2, 3, 28, 29, 30]);
  });

  it("never repeats a run when the slices overlap", async () => {
    await seed(8, 4);
    const ranks = await windowRanks("me");
    expect(ranks).toEqual([...new Set(ranks)]);
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("returns nothing on an empty leaderboard instead of failing", async () => {
    await seed(0, null);
    expect(await windowRanks("me")).toEqual([]);
  });
});

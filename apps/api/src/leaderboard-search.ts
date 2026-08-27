/**
 * Leaderboard search: the shared parsing both solo games use before they touch
 * the database. Kept out of index.ts so it can be tested on its own.
 */

import { escapeLike } from "./sql-like";

export interface LeaderboardSearch {
  /** Ready to drop into `name ILIKE $1 ESCAPE '\'`, wildcards and all. */
  namePattern: string;
  /** Set when the query is a plain number, so it can also match a seed. */
  seed: number | null;
}

const MAX_QUERY_LEN = 40;

/**
 * Turns a raw `q` param into the two things the query needs, or null when there
 * is nothing worth searching for. Wildcards get escaped: someone typing "%"
 * should find the players with a "%" in their name, not the whole board.
 */
export function parseLeaderboardSearch(raw: string | undefined | null): LeaderboardSearch | null {
  const q = (raw ?? "").trim().slice(0, MAX_QUERY_LEN);
  if (q.length === 0) return null;

  const escaped = q.replace(/[\\%_]/g, "\\$&");
  // Seeds are plain integers. A digits-only query still searches names too,
  // because "7" is a perfectly good thing to call yourself.
  const seed = /^\d{1,15}$/.test(q) ? Number(q) : null;

  return {
    namePattern: `%${escaped}%`,
    seed: seed != null && Number.isSafeInteger(seed) ? seed : null,
  };
}

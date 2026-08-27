/**
 * Building LIKE patterns out of user input, in one place.
 *
 * LIKE treats % and _ as wildcards, so an unescaped search for "100%" matches
 * every row instead of the rows containing "100%". Backslash is LIKE's default
 * escape character in Postgres and has to be escaped first, or a user's
 * trailing backslash escapes the closing wildcard we add.
 *
 * Patterns are still passed as bound parameters everywhere this is used. This
 * only decides what the pattern means, never how the statement is built.
 *
 * No imports on purpose: the admin roster helper used to live in
 * admin-routes.ts, which pulls in db-provider at module load and throws
 * without DATABASE_URL, so its test could not run in CI.
 */

/** Escape LIKE metacharacters, leaving the value otherwise untouched. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/** Escape, then wrap for a contains-match. */
export function likeTerm(value: string): string {
  return `%${escapeLike(value)}%`;
}

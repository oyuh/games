/**
 * The proxy drops the caller's path into `/api/admin${path}`, and fetch()
 * normalises dot segments before it sends. Without a guard, `?path=/../status`
 * resolves to `/api/status` and gets forwarded with the admin bearer token
 * attached, walking straight out of the `/api/admin` prefix that the whole
 * authorisation model assumes.
 *
 * Callers pass a path plus an optional query string (`/clients?page=1`), so the
 * two halves are checked separately: only the path can traverse, and only the
 * query legitimately needs `?`, `=` and `&`.
 *
 * Encoded traversal (`%2e%2e`) is already decoded by the time searchParams
 * hands us the value, so one check covers both spellings. `%` is not in either
 * alphabet, which also stops a second round of encoding getting through.
 */
const SAFE_SEGMENTS = /^[A-Za-z0-9/_.:-]*$/;
const SAFE_QUERY = /^[A-Za-z0-9_.:\-=&,+*]*$/;

export function isSafePath(value: string): boolean {
  if (!value.startsWith("/")) return false;

  // Split on the first "?" only. Anything after it is query, including further
  // question marks, which the query alphabet then rejects.
  const queryStart = value.indexOf("?");
  const path = queryStart === -1 ? value : value.slice(0, queryStart);
  const query = queryStart === -1 ? "" : value.slice(queryStart + 1);

  if (!SAFE_SEGMENTS.test(path)) return false;
  if (!SAFE_QUERY.test(query)) return false;

  // Check segments rather than substring-matching "..", so a legitimate segment
  // like "1..2" is allowed while a real ".." segment never is. Empty segments go
  // too: "//host/x" cannot leave the origin here, but nothing legitimate needs a
  // double slash, so it has no business reaching the API either.
  const segments = path.split("/").slice(1);
  return segments.every((segment) => segment !== "" && segment !== "..");
}

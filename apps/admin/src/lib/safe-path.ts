/**
 * The proxy drops the caller's path into `/api/admin${path}`, and fetch()
 * normalises dot segments before it sends. Without a guard, `?path=/../status`
 * resolves to `/api/status` and gets forwarded with the admin bearer token
 * attached, walking straight out of the `/api/admin` prefix that the whole
 * authorisation model assumes.
 *
 * So: a leading slash, a known-safe alphabet, and no dot segments anywhere.
 * Encoded traversal (`%2e%2e`) is already decoded by the time searchParams
 * hands us the value, so one check covers both spellings.
 */
const SAFE_PATH = /^\/[A-Za-z0-9/_.:-]*$/;

export function isSafePath(path: string): boolean {
  if (!SAFE_PATH.test(path)) return false;
  // Check segments rather than substring-matching "..", so a legitimate segment
  // like "1..2" is allowed while a real ".." segment never is. Empty segments go
  // too: "//host/x" can't leave the origin here, but nothing legitimate needs a
  // double slash, so it has no business reaching the API either.
  const segments = path.split("/").slice(1);
  return segments.every((segment) => segment !== "" && segment !== "..");
}

import { createHmac, timingSafeEqual } from "node:crypto";
import { isDifficulty, isGridSize, type Difficulty, type GridSize } from "@games/shared/games/zip-engine";

/**
 * A ranked Zip run starts with the server handing out the seed, signed
 * together with who it's for and when it was issued. The score submission has
 * to bring the ticket back, so a ranked run can't be on a seed the player
 * already practiced, and its time can't be shorter than the time that actually
 * passed on the server's clock. Stateless: nothing to store or expire by hand.
 */
export interface ZipTicket {
  sessionId: string;
  seed: number;
  difficulty: Difficulty;
  size: GridSize;
  issuedAt: number;
}

function sign(body: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`zip-ticket:${body}`).digest();
}

export function createZipTicket(ticket: ZipTicket, secret: string): string {
  const body = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return `${body}.${sign(body, secret).toString("base64url")}`;
}

/** Null for anything forged, altered, or malformed. Expiry is the caller's call. */
export function readZipTicket(value: unknown, secret: string): ZipTicket | null {
  if (typeof value !== "string" || value.length > 512) return null;
  const [body, signature, extra] = value.split(".");
  if (!body || !signature || extra !== undefined) return null;

  const expected = sign(body, secret);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object") return null;
  const { sessionId, seed, difficulty, size, issuedAt } = parsed as Record<string, unknown>;
  if (typeof sessionId !== "string" || !Number.isInteger(seed) || !Number.isInteger(issuedAt)) return null;
  if (!isDifficulty(difficulty) || !isGridSize(size)) return null;
  return { sessionId, seed: seed as number, difficulty, size, issuedAt: issuedAt as number };
}

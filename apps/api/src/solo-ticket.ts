import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { SOLO_CLOCK_SLACK_MS, SOLO_OFF_CLOCK_MS, SOLO_TICKET_TTL_MS } from "./score-policy";

/**
 * A ranked solo run starts with the server handing out the seed, signed
 * together with the game, who it's for, and when it was issued. The score has
 * to bring the ticket back, so a ranked run is always on a seed the server
 * picked for that session, never one practiced in Seeded mode first.
 *
 * The ticket also pins the run's time to the server's clock. The first time a
 * finished run is reported (the eligibility check the end screen fires on its
 * own), the server stamps the ticket with that moment and a digest of what was
 * reported, and hands the stamped ticket back for the submit. The claimed time
 * has to match the time between issue and finish, less the countdown and
 * solved pauses the page keeps off the clock. Stateless: nothing to store or
 * expire by hand.
 */
export type SoloGame = keyof typeof SOLO_OFF_CLOCK_MS;

export interface SoloTicket {
  game: SoloGame;
  sessionId: string;
  seed: number;
  /** Null for Pips, whose ranked run climbs every difficulty. */
  difficulty: string | null;
  issuedAt: number;
  /** Set when the finished run is first reported. */
  finish?: { at: number; digest: string };
}

function sign(body: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`solo-ticket:${body}`).digest();
}

export function createSoloTicket(ticket: SoloTicket, secret: string): string {
  const body = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return `${body}.${sign(body, secret).toString("base64url")}`;
}

/** Null for anything forged, altered, or malformed. */
export function readSoloTicket(value: unknown, secret: string): SoloTicket | null {
  if (typeof value !== "string" || value.length > 512) return null;
  const [body, signature, extra] = value.split(".");
  if (!body || !signature || extra !== undefined) return null;

  const expected = sign(body, secret);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SoloTicket;
  } catch {
    return null;
  }
}

export type SoloRunCheck =
  | { ok: true; ticket: SoloTicket; stamped: string }
  | {
      ok: false;
      status: 400 | 403;
      code: "invalid-ticket" | "expired-ticket" | "invalid-time" | "time-mismatch";
      reason: string;
      /** Set when the failure looks deliberate, so the submit route counts it. */
      strike?: string;
    };

/**
 * The ticket half of every ranked solo check. `run` is the scored part of the
 * submission (times and replay), which the finish stamp's digest covers.
 */
export function checkSoloRun(args: {
  ticket: unknown;
  game: SoloGame;
  sessionId: string;
  timeMs: number;
  run: unknown[];
  secret: string;
}): SoloRunCheck {
  const { game, sessionId, timeMs, secret } = args;
  const now = Date.now();
  const fail = (status: 400 | 403, code: Extract<SoloRunCheck, { ok: false }>["code"], reason: string, strike?: string): SoloRunCheck =>
    ({ ok: false, status, code, reason, ...(strike ? { strike } : {}) });

  // A bad signature is tampering and counts as a strike. A good ticket for a
  // different session is refused but not counted, since a session can get
  // reset mid-run without anyone cheating.
  const ticket = readSoloTicket(args.ticket, secret);
  if (!ticket) return fail(403, "invalid-ticket", "This run wasn't started as a ranked run.", `${game} ticket forged`);
  if (ticket.game !== game) return fail(403, "invalid-ticket", "This run wasn't started as a ranked run.");
  if (ticket.sessionId !== sessionId) return fail(403, "invalid-ticket", "This ranked run was started by a different session.");
  if (now - ticket.issuedAt > SOLO_TICKET_TTL_MS) return fail(400, "expired-ticket", "This ranked run started too long ago to submit.");

  const digest = createHash("sha256").update(JSON.stringify(args.run)).digest("base64url");
  if (ticket.finish && ticket.finish.digest !== digest) {
    return fail(400, "invalid-ticket", "This run changed after the server checked it.");
  }

  const elapsed = (ticket.finish?.at ?? now) - ticket.issuedAt;
  if (timeMs > elapsed + SOLO_CLOCK_SLACK_MS) {
    return fail(400, "invalid-time", "This run claims more time than has passed since it started.", `${game} time beyond ticket age`);
  }
  // No strike: a run reported late (a bot check at the finish, a laptop lid
  // closed mid-countdown) lands here too.
  if (elapsed - timeMs > SOLO_OFF_CLOCK_MS[game] + SOLO_CLOCK_SLACK_MS) {
    return fail(400, "time-mismatch", "This run can't be ranked: it took longer on the server's clock than your timer shows. That happens when the game gets interrupted, like a bot check or a laptop going to sleep.");
  }

  const finish = ticket.finish ?? { at: now, digest };
  return { ok: true, ticket, stamped: createSoloTicket({ ...ticket, finish }, secret) };
}

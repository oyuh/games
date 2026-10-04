import { describe, expect, it } from "bun:test";
import { checkSoloRun, createSoloTicket, readSoloTicket, type SoloTicket } from "../solo-ticket";
import { SOLO_CLOCK_SLACK_MS, SOLO_OFF_CLOCK_MS } from "../score-policy";

const SECRET = "test-secret";
const TICKET: SoloTicket = { game: "zip", sessionId: "s1", seed: 4242, difficulty: "hard", issuedAt: 1_700_000_000_000 };
const RUN = [55_000, { puzzleTimes: [20_000, 20_000, 15_000], paths: [[0, 1], [2, 3], [4, 5]] }];

/** A fresh ticket issued `agoMs` before now, as the run route would sign it. */
function issued(agoMs: number, game: SoloTicket["game"] = "zip") {
  return createSoloTicket({ ...TICKET, game, issuedAt: Date.now() - agoMs }, SECRET);
}

function check(ticket: string, timeMs: number, run: unknown[] = RUN, game: SoloTicket["game"] = "zip") {
  return checkSoloRun({ ticket, game, sessionId: "s1", timeMs, run, secret: SECRET });
}

describe("solo run tickets", () => {
  it("reads back what it signed", () => {
    expect(readSoloTicket(createSoloTicket(TICKET, SECRET), SECRET)).toEqual(TICKET);
  });

  it("refuses a ticket with an edited body, a foreign key, or junk", () => {
    const [, signature] = createSoloTicket(TICKET, SECRET).split(".");
    const easier = Buffer.from(JSON.stringify({ ...TICKET, difficulty: "easy" })).toString("base64url");
    expect(readSoloTicket(`${easier}.${signature}`, SECRET)).toBeNull();
    expect(readSoloTicket(createSoloTicket(TICKET, "someone-else"), SECRET)).toBeNull();
    expect(readSoloTicket("not-a-ticket", SECRET)).toBeNull();
  });

  it("refuses another game's ticket and another session's", () => {
    expect(check(issued(60_000, "pips"), 55_000)).toMatchObject({ ok: false, code: "invalid-ticket" });
    expect(checkSoloRun({ ticket: issued(60_000), game: "zip", sessionId: "s2", timeMs: 55_000, run: RUN, secret: SECRET }))
      .toMatchObject({ ok: false, code: "invalid-ticket" });
  });

  it("holds the claimed time to the server's clock from both sides", () => {
    const offClock = SOLO_OFF_CLOCK_MS.zip;
    expect(check(issued(60_000), 60_000 - offClock).ok).toBe(true);
    // Cutting time out of the run.
    expect(check(issued(60_000), 60_000 - offClock - SOLO_CLOCK_SLACK_MS - 1_000)).toMatchObject({ ok: false, code: "time-mismatch" });
    // Claiming more time than has passed.
    expect(check(issued(60_000), 60_000 + SOLO_CLOCK_SLACK_MS + 1_000)).toMatchObject({ ok: false, code: "invalid-time" });
  });

  it("times a stamped run from its finish, and only for the run it stamped", () => {
    const first = check(issued(60_000), 55_000);
    if (!first.ok) throw new Error(first.reason);

    // Ten minutes on the end screen before hitting submit.
    const stamped = readSoloTicket(first.stamped, SECRET)!;
    const later = createSoloTicket(
      { ...stamped, issuedAt: stamped.issuedAt - 600_000, finish: { ...stamped.finish!, at: stamped.finish!.at - 600_000 } },
      SECRET,
    );
    expect(check(later, 55_000).ok).toBe(true);
    expect(check(later, 30_000, [30_000, RUN[1]])).toMatchObject({ ok: false, code: "invalid-ticket" });
  });
});

import { describe, expect, it } from "bun:test";
import { createZipTicket, readZipTicket, type ZipTicket } from "../zip-ticket";

const SECRET = "test-secret";
const TICKET: ZipTicket = { sessionId: "s1", seed: 4242, difficulty: "hard", issuedAt: 1_700_000_000_000 };

describe("zip run tickets", () => {
  it("reads back what it signed", () => {
    expect(readZipTicket(createZipTicket(TICKET, SECRET), SECRET)).toEqual(TICKET);
  });

  it("refuses a ticket with an edited body, a foreign key, or junk", () => {
    const [, signature] = createZipTicket(TICKET, SECRET).split(".");
    const easier = Buffer.from(JSON.stringify({ ...TICKET, difficulty: "easy" })).toString("base64url");
    expect(readZipTicket(`${easier}.${signature}`, SECRET)).toBeNull();
    expect(readZipTicket(createZipTicket(TICKET, "someone-else"), SECRET)).toBeNull();
    expect(readZipTicket("not-a-ticket", SECRET)).toBeNull();
  });
});

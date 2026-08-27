import { describe, expect, it } from "vitest";
import {
  AVATAR_COLOR_COUNT,
  AVATAR_SHAPE_COUNT,
  decodeAvatar,
  derivedLook,
  encodeAvatar,
  formatAvatar,
  paletteAt,
  parseAvatar,
  shapeSeed,
} from "../avatar";

describe("parseAvatar", () => {
  it("accepts a well formed pick", () => {
    expect(parseAvatar("12.4")).toEqual({ shape: 12, color: 4 });
    expect(parseAvatar("0.0")).toEqual({ shape: 0, color: 0 });
  });

  it("rejects anything out of range", () => {
    // This is the whole trust boundary for a column the client writes. An
    // out-of-range index would index past the arrays and render undefined.
    expect(parseAvatar(`${AVATAR_SHAPE_COUNT}.0`)).toBeNull();
    expect(parseAvatar(`0.${AVATAR_COLOR_COUNT}`)).toBeNull();
    expect(parseAvatar("-1.0")).toBeNull();
    expect(parseAvatar("0.-1")).toBeNull();
  });

  it("rejects malformed input rather than coercing it", () => {
    for (const value of [
      "",
      "12",
      "12.",
      ".4",
      "a.b",
      "1.5.2",
      "1e2.0",
      "1.0; DROP TABLE",
      "<script>.0",
      " 1.2",
      "Infinity.0",
      "NaN.NaN",
      // Number() used to coerce all of these into a valid-looking pick.
      "12.",
      ".4",
      " 1.2",
      "1.2 ",
      "+1.2",
      "1.2\n",
    ]) {
      expect(parseAvatar(value)).toBeNull();
    }
  });
});

describe("derivedLook", () => {
  it("is stable for a session id", () => {
    expect(derivedLook("sess_abc")).toEqual(derivedLook("sess_abc"));
  });

  it("always lands inside both arrays", () => {
    for (let i = 0; i < 500; i += 1) {
      const look = derivedLook(`sess_${i}`);
      expect(look.shape).toBeGreaterThanOrEqual(0);
      expect(look.shape).toBeLessThan(AVATAR_SHAPE_COUNT);
      expect(look.color).toBeGreaterThanOrEqual(0);
      expect(look.color).toBeLessThan(AVATAR_COLOR_COUNT);
      // Both halves must resolve, otherwise a face renders blank.
      expect(shapeSeed(look.shape)).toBeTruthy();
      expect(paletteAt(look.color).bg).toMatch(/^#/);
    }
  });

  it("does not march shape and colour together across neighbouring ids", () => {
    const looks = Array.from({ length: 40 }, (_, i) => derivedLook(`sess_${i}`));
    const pairs = new Set(looks.map((l) => `${l.shape}.${l.color}`));
    // Not a strict guarantee, just a smoke test that the hash actually scatters.
    expect(pairs.size).toBeGreaterThan(30);
  });
});

describe("wire format", () => {
  it("round trips a pick", () => {
    const code = formatAvatar({ shape: 7, color: 3 });
    expect(parseAvatar(decodeAvatar(encodeAvatar(code)))).toEqual({
      shape: 7,
      color: 3,
    });
  });

  it("survives a hand-edited column", () => {
    // Garbage decodes to "" (or to something parseAvatar rejects), and the
    // caller falls back to the derived look rather than throwing.
    expect(decodeAvatar("!!!not base64!!!")).toBe("");
    expect(decodeAvatar(null)).toBe("");
    expect(decodeAvatar(undefined)).toBe("");
    expect(parseAvatar(decodeAvatar("Zm9vYmFy"))).toBeNull();
  });
});

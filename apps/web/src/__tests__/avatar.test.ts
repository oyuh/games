/**
 * Tests for the marker palette and the chosen-avatar fallback.
 */
import { describe, it, expect } from "vitest";
import {
  AVATAR_COLOR_COUNT,
  AVATAR_COLORS,
  AVATAR_SHAPE_COUNT,
  decodeAvatar,
  derivedLook,
  encodeAvatar,
  formatAvatar,
  parseAvatar,
  getPlayerColor,
} from "../lib/avatar";

describe("AVATAR_COLORS", () => {
  it("has 15 colors", () => {
    expect(AVATAR_COLORS).toHaveLength(15);
  });

  it("all colors are valid hex codes", () => {
    for (const color of AVATAR_COLORS) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("all colors are unique", () => {
    const unique = new Set(AVATAR_COLORS.map((c) => c.toUpperCase()));
    expect(unique.size).toBe(AVATAR_COLORS.length);
  });
});

describe("getPlayerColor", () => {
  it("returns first color for index 0", () => {
    expect(getPlayerColor(0)).toBe(AVATAR_COLORS[0]);
  });

  it("returns correct color for index within range", () => {
    expect(getPlayerColor(3)).toBe(AVATAR_COLORS[3]);
  });

  it("wraps around when index exceeds palette length", () => {
    expect(getPlayerColor(15)).toBe(AVATAR_COLORS[0]);
    expect(getPlayerColor(16)).toBe(AVATAR_COLORS[1]);
    expect(getPlayerColor(30)).toBe(AVATAR_COLORS[0]);
  });

  it("handles large indices", () => {
    const result = getPlayerColor(1000);
    expect(AVATAR_COLORS).toContain(result);
  });
});

describe("avatar looks", () => {
  it("round-trips a look through its stored code", () => {
    const look = { shape: 12, color: 4 };
    expect(parseAvatar(formatAvatar(look))).toEqual(look);
  });

  it("rejects codes that would index off the end", () => {
    expect(parseAvatar(`${AVATAR_SHAPE_COUNT}.0`)).toBeNull();
    expect(parseAvatar(`0.${AVATAR_COLOR_COUNT}`)).toBeNull();
    expect(parseAvatar("nonsense")).toBeNull();
    expect(parseAvatar("-1.-1")).toBeNull();
  });

  it("derives a look in range, and the same one every time", () => {
    for (const seed of ["a", "session-xyz", "", "ééé"]) {
      const look = derivedLook(seed);
      expect(look.shape).toBeGreaterThanOrEqual(0);
      expect(look.shape).toBeLessThan(AVATAR_SHAPE_COUNT);
      expect(look.color).toBeGreaterThanOrEqual(0);
      expect(look.color).toBeLessThan(AVATAR_COLOR_COUNT);
      expect(derivedLook(seed)).toEqual(look);
    }
  });

  it("round-trips a build through the base64 the column stores", () => {
    const code = formatAvatar({ shape: 41, color: 17 });
    const wire = encodeAvatar(code);
    expect(wire).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(decodeAvatar(wire)).toBe(code);
    expect(parseAvatar(decodeAvatar(wire))).toEqual({ shape: 41, color: 17 });
  });

  it("treats an empty or corrupt column as no pick at all", () => {
    expect(decodeAvatar(null)).toBe("");
    expect(decodeAvatar("")).toBe("");
    expect(parseAvatar(decodeAvatar("!!!not base64!!!"))).toBeNull();
    expect(encodeAvatar("")).toBe("");
  });

  it("spreads different sessions across different looks", () => {
    const seen = new Set(
      Array.from({ length: 200 }, (_, i) => formatAvatar(derivedLook(`session-${i}`)))
    );
    expect(seen.size).toBeGreaterThan(150);
  });
});

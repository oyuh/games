/**
 * Tests for avatar color utilities.
 */
import { describe, it, expect } from "vitest";
import {
  AVATAR_COLORS,
  getPlayerColor,
  getAvatarColors,
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

describe("getAvatarColors", () => {
  it("always returns exactly 5 colors", () => {
    for (let i = 0; i < 20; i++) {
      expect(getAvatarColors(i)).toHaveLength(5);
    }
  });

  it("all returned colors are from the palette", () => {
    for (let i = 0; i < 20; i++) {
      for (const color of getAvatarColors(i)) {
        expect(AVATAR_COLORS).toContain(color);
      }
    }
  });

  it("different player indices produce different starting points", () => {
    const a = getAvatarColors(0);
    const b = getAvatarColors(2);
    // Different offsets should yield at least some different colors
    expect(a).not.toEqual(b);
  });

  it("returns consecutive colors from palette with offset", () => {
    const colors = getAvatarColors(0);
    // start = (0 * 3) % 15 = 0 → colors[0..4]
    for (let i = 0; i < 5; i++) {
      expect(colors[i]).toBe(AVATAR_COLORS[i % AVATAR_COLORS.length]);
    }
  });
});

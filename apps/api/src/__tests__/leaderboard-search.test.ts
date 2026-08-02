import { describe, it, expect } from "vitest";
import { parseLeaderboardSearch } from "../leaderboard-search";

describe("parseLeaderboardSearch", () => {
  it("treats blank queries as no search", () => {
    expect(parseLeaderboardSearch(undefined)).toBeNull();
    expect(parseLeaderboardSearch(null)).toBeNull();
    expect(parseLeaderboardSearch("   ")).toBeNull();
  });

  it("wraps a name in wildcards", () => {
    expect(parseLeaderboardSearch(" lawson ")).toEqual({ namePattern: "%lawson%", seed: null });
  });

  it("escapes wildcards so they match literally", () => {
    expect(parseLeaderboardSearch("100%")).toEqual({ namePattern: "%100\\%%", seed: null });
    expect(parseLeaderboardSearch("a_b")).toEqual({ namePattern: "%a\\_b%", seed: null });
    expect(parseLeaderboardSearch("\\")).toEqual({ namePattern: "%\\\\%", seed: null });
  });

  it("matches a seed as well as a name when the query is a number", () => {
    expect(parseLeaderboardSearch("1006610097")).toEqual({ namePattern: "%1006610097%", seed: 1006610097 });
    expect(parseLeaderboardSearch("7")).toEqual({ namePattern: "%7%", seed: 7 });
  });

  it("does not treat a number too big to be exact as a seed", () => {
    // 16 digits is past the point where a JS number stays exact, so it searches
    // names only rather than comparing a rounded value against a seed.
    expect(parseLeaderboardSearch("1234567890123456")).toEqual({
      namePattern: "%1234567890123456%",
      seed: null,
    });
  });

  it("caps the query length", () => {
    const long = "x".repeat(80);
    expect(parseLeaderboardSearch(long)!.namePattern).toBe(`%${"x".repeat(40)}%`);
  });
});

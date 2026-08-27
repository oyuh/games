import { describe, expect, it } from "vitest";
import { likeTerm } from "../admin-routes";

describe("likeTerm", () => {
  it("wraps an ordinary term in wildcards", () => {
    expect(likeTerm("bot")).toBe("%bot%");
    expect(likeTerm("")).toBe("%%");
  });

  it("escapes the wildcards a user types", () => {
    // The bug this prevents: searching for "100%" with an unescaped % matches
    // every row in the table instead of the rows containing "100%".
    expect(likeTerm("100%")).toBe("%100\\%%");
    expect(likeTerm("a_b")).toBe("%a\\_b%");
    expect(likeTerm("%_%")).toBe("%\\%\\_\\%%");
  });

  it("escapes backslashes before adding its own", () => {
    // Backslash is LIKE's escape character. If it were not escaped first, a
    // user's trailing backslash would escape our closing wildcard.
    expect(likeTerm("a\\b")).toBe("%a\\\\b%");
    expect(likeTerm("\\")).toBe("%\\\\%");
    expect(likeTerm("\\%")).toBe("%\\\\\\%%");
  });

  it("leaves other punctuation alone", () => {
    // Only LIKE metacharacters matter here. Quotes and semicolons are handled
    // by parameter binding, not by this function, so they pass through.
    expect(likeTerm("o'brien; --")).toBe("%o'brien; --%");
    expect(likeTerm("192.168.0.1")).toBe("%192.168.0.1%");
  });
});

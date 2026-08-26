import { describe, expect, test } from "bun:test";
import { isSafePath } from "./safe-path";

describe("isSafePath", () => {
  test("allows the paths the admin panel actually asks for", () => {
    for (const path of [
      "/clients",
      "/clients/sess_abc123",
      "/games/imposter/game_1/end",
      "/pips/scores",
      "/shikaku/scores/abc-123",
      "/names/restricted",
      "/dashboard/summary",
    ]) {
      expect(isSafePath(path)).toBe(true);
    }
  });

  test("rejects traversal out of the /api/admin prefix", () => {
    // The whole point of the guard: fetch() normalises these before sending,
    // so each one would reach a non-admin route with the bearer token attached.
    for (const path of [
      "/../status",
      "/..",
      "/clients/../../status",
      "/./../status",
      "/a/b/../../../cleanup",
    ]) {
      expect(isSafePath(path)).toBe(false);
    }
  });

  test("rejects anything that is not a plain path", () => {
    for (const path of [
      "clients", // no leading slash
      "/clients?x=1", // query smuggling
      "/clients#frag",
      "/clients\\..\\status", // backslash traversal
      "/clients ", // trailing space
      "//evil.com/x", // protocol-relative shape
      "/clients%2f..%2fstatus", // percent sign is not in the alphabet
    ]) {
      expect(isSafePath(path)).toBe(false);
    }
  });

  test("allows dots inside a segment, only a bare .. segment is a traversal", () => {
    expect(isSafePath("/scores/1.2.3")).toBe(true);
    expect(isSafePath("/a/..b/c")).toBe(true);
    expect(isSafePath("/a/../c")).toBe(false);
  });
});

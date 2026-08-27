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

  test("allows the query strings the panel actually sends", () => {
    // Every paginated and filtered request goes through here. Rejecting these
    // breaks the whole panel, which is exactly what a too-strict guard did.
    for (const path of [
      "/clients?page=1&pageSize=50",
      "/clients?pageSize=200",
      "/pips/scores?page=2&pageSize=50",
      "/shikaku/scores?page=1&pageSize=50",
      "/clients?q=bot&region=us-east&gameType=imposter",
      "/names/restricted?",
    ]) {
      expect(isSafePath(path)).toBe(true);
    }
  });

  test("a query string cannot smuggle traversal into the path", () => {
    expect(isSafePath("/../status?page=1")).toBe(false);
    expect(isSafePath("/clients/../../status?x=1")).toBe(false);
  });

  test("rejects anything that is not a plain path", () => {
    for (const path of [
      "clients", // no leading slash
      "/clients#frag",
      "/clients\\..\\status", // backslash traversal
      "/clients ", // trailing space
      "//evil.com/x", // protocol-relative shape
      "/clients%2f..%2fstatus", // percent sign is not in the alphabet
      "/clients?a=%2e%2e", // nor in the query
      "/clients?a=1?b=2", // a second question mark
      "/clients?a=<script>",
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

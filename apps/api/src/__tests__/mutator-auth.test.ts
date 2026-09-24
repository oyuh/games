import { describe, expect, it } from "vitest";
import { authorizeMutation } from "../mutator-auth";

const prod = (headerUserId: string, proofUserId: string | null) => ({ headerUserId, proofUserId });

describe("authorizeMutation in production", () => {
  it("rewrites every identity field to the proven caller", () => {
    const { userId, args } = authorizeMutation(
      "imposter.vote",
      { gameId: "g1", voterId: "victim", targetId: "someone" },
      prod("victim", "me"),
      true,
    );
    expect(userId).toBe("me");
    expect(args).toEqual({ gameId: "g1", voterId: "me", targetId: "someone" });
  });

  it("pins sessions.* mutators to the caller's own row", () => {
    const { args } = authorizeMutation("sessions.setName", { id: "victim", name: "x" }, prod("me", "me"), true);
    expect(args).toEqual({ id: "me", name: "x" });
  });

  it("rewrites hostId, so a player cannot claim to be host", () => {
    const { args } = authorizeMutation("imposter.start", { gameId: "g1", hostId: "real-host" }, prod("me", "me"), true);
    expect(args.hostId).toBe("me");
  });

  it("rejects identity-bearing mutations without a signed proof", () => {
    for (const [name, args] of [
      ["imposter.join", { gameId: "g1", sessionId: "me" }],
      ["chat.send", { gameId: "g1", senderId: "me", text: "hi" }],
      ["sessions.create", { id: "me" }],
    ] as const) {
      expect(() => authorizeMutation(name, args, prod("me", null), true)).toThrow("Invalid session proof");
    }
  });

  it("does not trust the plain user header on its own", () => {
    expect(() =>
      authorizeMutation("imposter.leave", { gameId: "g1", sessionId: "victim" }, prod("victim", null), true),
    ).toThrow("Invalid session proof");
  });

  it("lets mutations with no identity field through without a proof", () => {
    const { userId, args } = authorizeMutation("imposter.advanceTimer", { gameId: "g1" }, prod("anon", null), true);
    expect(userId).toBe("anon");
    expect(args).toEqual({ gameId: "g1" });
  });

  it("blocks dev and demo mutators outright", () => {
    expect(() => authorizeMutation("dev.fillLobby", { gameId: "g1" }, prod("me", "me"), true)).toThrow("disabled in production");
    expect(() => authorizeMutation("demo.seed", {}, prod("me", "me"), true)).toThrow("disabled in production");
  });

  it("does not mutate the caller's args object", () => {
    const original = { gameId: "g1", sessionId: "victim" };
    authorizeMutation("imposter.join", original, prod("me", "me"), true);
    expect(original.sessionId).toBe("victim");
  });
});

describe("authorizeMutation in dev", () => {
  it("trusts the header when there is no proof", () => {
    const { userId, args } = authorizeMutation("imposter.join", { gameId: "g1", sessionId: "other" }, prod("me", null), false);
    expect(userId).toBe("me");
    expect(args.sessionId).toBe("me");
  });

  it("still prefers the proof over the header", () => {
    const { userId } = authorizeMutation("imposter.join", { gameId: "g1", sessionId: "x" }, prod("header", "proof"), false);
    expect(userId).toBe("proof");
  });

  it("gives an anonymous caller a throwaway dev id instead of a real one", () => {
    const { userId, args } = authorizeMutation("imposter.join", { gameId: "g1", sessionId: "victim" }, prod("anon", null), false);
    expect(userId).toMatch(/^dev-/);
    expect(args.sessionId).toBe(userId);
  });

  it("runs dev mutators without a proof", () => {
    const { userId } = authorizeMutation("dev.fillLobby", { gameId: "g1" }, prod("anon", null), false);
    expect(userId).toBe("anon");
  });
});

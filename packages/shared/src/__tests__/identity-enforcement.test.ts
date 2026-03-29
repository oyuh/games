import { describe, it, expect } from "vitest";
import {
  assertCaller,
  assertHost,
} from "../zero/mutators/helpers";

// ───────────────────────────────────────────────────────────
// assertCaller — server-side identity enforcement
// ───────────────────────────────────────────────────────────
describe("assertCaller", () => {
  const serverTx = { location: "server" };
  const clientTx = { location: "client" };

  it("passes when caller matches userId on server", () => {
    expect(() => assertCaller(serverTx, { userId: "user1" }, "user1")).not.toThrow();
  });

  it("throws when caller does NOT match userId on server", () => {
    expect(() => assertCaller(serverTx, { userId: "user1" }, "user2")).toThrow("Not allowed");
  });

  it("skips enforcement on client-side tx", () => {
    expect(() => assertCaller(clientTx, { userId: "user1" }, "user2")).not.toThrow();
  });

  it("skips enforcement when ctx has no userId", () => {
    expect(() => assertCaller(serverTx, {}, "user1")).not.toThrow();
  });

  it("skips enforcement when userId is 'anon'", () => {
    expect(() => assertCaller(serverTx, { userId: "anon" }, "anyone")).not.toThrow();
  });

  it("blocks impersonation: user1 trying to act as user2", () => {
    expect(() => assertCaller(serverTx, { userId: "user1" }, "user2")).toThrow("Not allowed");
  });

  it("blocks impersonation: attacker spoofing admin session", () => {
    expect(() =>
      assertCaller(serverTx, { userId: "attacker-session" }, "host-admin-session")
    ).toThrow("Not allowed");
  });

  it("handles null/undefined ctx gracefully", () => {
    expect(() => assertCaller(serverTx, null, "user1")).not.toThrow();
    expect(() => assertCaller(serverTx, undefined, "user1")).not.toThrow();
  });

  it("handles null/undefined tx gracefully", () => {
    expect(() => assertCaller(null, { userId: "user1" }, "user1")).not.toThrow();
    expect(() => assertCaller(undefined, { userId: "user1" }, "user1")).not.toThrow();
  });
});

// ───────────────────────────────────────────────────────────
// assertHost — server-side host-only enforcement
// ───────────────────────────────────────────────────────────
describe("assertHost", () => {
  const serverTx = { location: "server" };
  const clientTx = { location: "client" };

  it("passes when caller is the actual host", () => {
    expect(() => assertHost(serverTx, { userId: "host1" }, "host1", "host1")).not.toThrow();
  });

  it("throws when caller is not the host", () => {
    expect(() => assertHost(serverTx, { userId: "player" }, "player", "host1")).toThrow(
      "Only host can do that"
    );
  });

  it("throws when claimed host doesn't match actual host", () => {
    expect(() => assertHost(serverTx, { userId: "host1" }, "host1", "real-host")).toThrow(
      "Only host can do that"
    );
  });

  it("skips enforcement on client-side tx", () => {
    expect(() => assertHost(clientTx, { userId: "player" }, "player", "host1")).not.toThrow();
  });

  it("skips enforcement when ctx has no userId", () => {
    expect(() => assertHost(serverTx, {}, "anyone", "host1")).not.toThrow();
  });

  it("blocks non-host from kicking/starting", () => {
    expect(() =>
      assertHost(serverTx, { userId: "regular-player" }, "regular-player", "actual-host")
    ).toThrow("Only host can do that");
  });

  it("blocks spoofed hostId that doesn't match actual host", () => {
    // Attacker claims to be host but the game's actual host is different
    expect(() =>
      assertHost(serverTx, { userId: "attacker" }, "attacker", "real-host")
    ).toThrow("Only host can do that");
  });

  it("handles null ctx gracefully", () => {
    expect(() => assertHost(serverTx, null, "host1", "host1")).not.toThrow();
  });
});

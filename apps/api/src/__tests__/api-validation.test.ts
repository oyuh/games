/**
 * API input validation & security tests.
 *
 * Tests helper functions extracted from the API server:
 * validId, getCallerUserId, normalizeGameType, enforceMutatorCaller.
 *
 * These functions are private in index.ts, so we re-implement their logic
 * here and test it to ensure the validation rules hold.
 */
import { describe, it, expect } from "vitest";

// ─── Re-implementations of private API helpers for testing ──
// These match the exact logic from apps/api/src/index.ts

const MAX_ID_LEN = 64;

function validId(v: unknown): string {
  if (typeof v !== "string") return "";
  const trimmed = v.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_ID_LEN ? trimmed : "";
}

function getCallerUserId(headers: Record<string, string | undefined>): string {
  const caller = headers["x-zero-user-id"]?.trim();
  return caller && caller.length > 0 && caller.length <= 64 ? caller : "anon";
}

type GameType = "imposter" | "password" | "chain_reaction" | "shade_signal" | "location_signal";

function normalizeGameType(value: unknown): GameType | null {
  if (
    value === "imposter" ||
    value === "password" ||
    value === "chain_reaction" ||
    value === "shade_signal" ||
    value === "location_signal"
  ) {
    return value;
  }
  return null;
}

function assertCallerValue(userId: string, claimed: unknown, field: string) {
  if (userId === "anon") return;
  if (typeof claimed !== "string" || claimed.trim().length === 0) {
    throw new Error(`Missing ${field}`);
  }
  if (claimed !== userId) {
    throw new Error("Not allowed");
  }
}

function enforceMutatorCaller(userId: string, name: string, args: unknown) {
  if (userId === "anon" || args == null || typeof args !== "object") return;
  const payload = args as Record<string, unknown>;
  const [namespace] = name.split(".");
  if (namespace === "sessions") {
    assertCallerValue(userId, payload.id, "id");
    return;
  }
  if ("sessionId" in payload) assertCallerValue(userId, payload.sessionId, "sessionId");
  if ("hostId" in payload) assertCallerValue(userId, payload.hostId, "hostId");
  if ("senderId" in payload) assertCallerValue(userId, payload.senderId, "senderId");
  if ("voterId" in payload) assertCallerValue(userId, payload.voterId, "voterId");
}

// ─── validId ────────────────────────────────────────────────
describe("validId", () => {
  it("accepts normal IDs", () => {
    expect(validId("abc123")).toBe("abc123");
    expect(validId("session_abc")).toBe("session_abc");
  });

  it("trims whitespace", () => {
    expect(validId("  abc  ")).toBe("abc");
  });

  it("rejects empty strings", () => {
    expect(validId("")).toBe("");
    expect(validId("   ")).toBe("");
  });

  it("rejects non-string types", () => {
    expect(validId(null)).toBe("");
    expect(validId(undefined)).toBe("");
    expect(validId(123)).toBe("");
    expect(validId({})).toBe("");
  });

  it("rejects IDs > 64 characters", () => {
    const long = "a".repeat(65);
    expect(validId(long)).toBe("");
  });

  it("accepts exactly 64 characters", () => {
    const max = "a".repeat(64);
    expect(validId(max)).toBe(max);
  });
});

// ─── getCallerUserId ────────────────────────────────────────
describe("getCallerUserId", () => {
  it("extracts user ID from x-zero-user-id header", () => {
    expect(getCallerUserId({ "x-zero-user-id": "user123" })).toBe("user123");
  });

  it('returns "anon" for missing header', () => {
    expect(getCallerUserId({})).toBe("anon");
    expect(getCallerUserId({ "x-zero-user-id": undefined })).toBe("anon");
  });

  it('returns "anon" for empty header', () => {
    expect(getCallerUserId({ "x-zero-user-id": "" })).toBe("anon");
    expect(getCallerUserId({ "x-zero-user-id": "   " })).toBe("anon");
  });

  it('returns "anon" for overly long header (>64)', () => {
    expect(getCallerUserId({ "x-zero-user-id": "x".repeat(65) })).toBe("anon");
  });

  it("trims whitespace", () => {
    expect(getCallerUserId({ "x-zero-user-id": "  user1  " })).toBe("user1");
  });
});

// ─── normalizeGameType ──────────────────────────────────────
describe("normalizeGameType", () => {
  it("accepts valid game types", () => {
    expect(normalizeGameType("imposter")).toBe("imposter");
    expect(normalizeGameType("password")).toBe("password");
    expect(normalizeGameType("chain_reaction")).toBe("chain_reaction");
    expect(normalizeGameType("shade_signal")).toBe("shade_signal");
    expect(normalizeGameType("location_signal")).toBe("location_signal");
  });

  it("rejects invalid game types", () => {
    expect(normalizeGameType("invalid")).toBeNull();
    expect(normalizeGameType("")).toBeNull();
    expect(normalizeGameType(null)).toBeNull();
    expect(normalizeGameType(undefined)).toBeNull();
    expect(normalizeGameType(42)).toBeNull();
    expect(normalizeGameType("IMPOSTER")).toBeNull(); // case-sensitive
    expect(normalizeGameType("imposter; DROP TABLE")).toBeNull();
  });
});

// ─── enforceMutatorCaller ───────────────────────────────────
describe("enforceMutatorCaller", () => {
  it("allows matching caller for sessionId", () => {
    expect(() =>
      enforceMutatorCaller("user1", "imposter.create", { sessionId: "user1" })
    ).not.toThrow();
  });

  it("blocks mismatched sessionId", () => {
    expect(() =>
      enforceMutatorCaller("user1", "imposter.create", { sessionId: "attacker" })
    ).toThrow("Not allowed");
  });

  it("blocks mismatched hostId", () => {
    expect(() =>
      enforceMutatorCaller("user1", "imposter.start", { hostId: "attacker" })
    ).toThrow("Not allowed");
  });

  it("blocks mismatched senderId", () => {
    expect(() =>
      enforceMutatorCaller("user1", "chat.send", { senderId: "attacker" })
    ).toThrow("Not allowed");
  });

  it("blocks mismatched voterId", () => {
    expect(() =>
      enforceMutatorCaller("user1", "imposter.vote", { voterId: "attacker" })
    ).toThrow("Not allowed");
  });

  it("checks session ID for sessions.* namespace", () => {
    expect(() =>
      enforceMutatorCaller("user1", "sessions.upsert", { id: "user1" })
    ).not.toThrow();
    expect(() =>
      enforceMutatorCaller("user1", "sessions.upsert", { id: "attacker" })
    ).toThrow("Not allowed");
  });

  it("skips checks for anon users", () => {
    expect(() =>
      enforceMutatorCaller("anon", "imposter.create", { sessionId: "whatever" })
    ).not.toThrow();
  });

  it("handles null/undefined args gracefully", () => {
    expect(() => enforceMutatorCaller("user1", "imposter.create", null)).not.toThrow();
    expect(() => enforceMutatorCaller("user1", "imposter.create", undefined)).not.toThrow();
  });

  it("handles missing identity fields gracefully", () => {
    // No sessionId/hostId/senderId/voterId → nothing to check
    expect(() =>
      enforceMutatorCaller("user1", "imposter.create", { someOtherField: "value" })
    ).not.toThrow();
  });
});

// ─── Ban system — isBanned logic ────────────────────────────
describe("isBanned (logic)", () => {
  type Ban = { id: string; type: "session" | "ip" | "region"; value: string; reason: string; createdAt: number };

  function isBanned(sessionId: string, ip: string, region: string, bans: Ban[]): Ban | null {
    for (const ban of bans) {
      if (ban.type === "session" && ban.value === sessionId) return ban;
      if (ban.type === "ip" && ban.value === ip) return ban;
      if (ban.type === "region" && ban.value.toLowerCase() === region.toLowerCase()) return ban;
    }
    return null;
  }

  const sessionBan: Ban = { id: "b1", type: "session", value: "evil_user", reason: "bad", createdAt: 0 };
  const ipBan: Ban = { id: "b2", type: "ip", value: "6.6.6.6", reason: "bot", createdAt: 0 };
  const regionBan: Ban = { id: "b3", type: "region", value: "XX", reason: "geo", createdAt: 0 };
  const bans = [sessionBan, ipBan, regionBan];

  it("matches session ban", () => {
    expect(isBanned("evil_user", "1.1.1.1", "US", bans)).toBe(sessionBan);
  });

  it("matches IP ban", () => {
    expect(isBanned("normal_user", "6.6.6.6", "US", bans)).toBe(ipBan);
  });

  it("matches region ban (case-insensitive)", () => {
    expect(isBanned("normal_user", "1.1.1.1", "xx", bans)).toBe(regionBan);
    expect(isBanned("normal_user", "1.1.1.1", "Xx", bans)).toBe(regionBan);
  });

  it("returns null when not banned", () => {
    expect(isBanned("good_user", "1.2.3.4", "US", bans)).toBeNull();
  });

  it("handles empty bans list", () => {
    expect(isBanned("evil_user", "6.6.6.6", "XX", [])).toBeNull();
  });
});

/**
 * Tests for session management utilities.
 *
 * Functions that depend on Zero mutators or localStorage are tested
 * with appropriate mocks.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock localStorage
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { for (const k of Object.keys(store)) delete store[k]; }),
  get length() { return Object.keys(store).length; },
  key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });

// Mock window.dispatchEvent
const dispatchMock = vi.fn();
Object.defineProperty(globalThis, "window", {
  value: { dispatchEvent: dispatchMock, CustomEvent: class CE { detail: unknown; type: string; constructor(type: string, opts?: { detail?: unknown }) { this.type = type; this.detail = opts?.detail; } } },
  writable: true,
});
Object.defineProperty(globalThis, "CustomEvent", {
  value: class CE { detail: unknown; type: string; constructor(type: string, opts?: { detail?: unknown }) { this.type = type; this.detail = opts?.detail; } },
  writable: true,
});

// Must import after mocks are set up
import {
  randomName,
  getOrCreateSessionId,
  getStoredName,
  getStoredSessionProof,
  getSessionRequestHeaders,
  syncStoredIdentity,
  setStoredName,
  getPlayerProfile,
  getRecentGames,
  addRecentGame,
  removeRecentGame,
  clearRecentGames,
  hasVisited,
  markVisited,
  resetStoredIdentityForTests,
  type RecentGame,
} from "../lib/session";

beforeEach(() => {
  resetStoredIdentityForTests();
  localStorageMock.clear();
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
  dispatchMock.mockClear();
  // Reset the store
  for (const k of Object.keys(store)) delete store[k];
});

// ─── randomName ─────────────────────────────────────────────
describe("randomName", () => {
  it("returns a non-empty string", () => {
    expect(randomName().length).toBeGreaterThan(0);
  });

  it("returns a string matching AdjectiveNoun pattern (PascalCase)", () => {
    const name = randomName();
    // Should start with an uppercase letter
    expect(name[0]).toMatch(/[A-Z]/);
  });

  it("produces varied names (not always the same)", () => {
    const names = new Set<string>();
    for (let i = 0; i < 50; i++) names.add(randomName());
    // With 40 adjectives × 40 nouns = 1600 combos, 50 tries should yield many unique
    expect(names.size).toBeGreaterThan(10);
  });
});

// ─── getOrCreateSessionId ───────────────────────────────────
describe("getOrCreateSessionId", () => {
  it("creates a new ID if none exists", () => {
    const id = getOrCreateSessionId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(5);
  });

  it("persists the ID to localStorage", () => {
    const id = getOrCreateSessionId();
    expect(localStorageMock.setItem).toHaveBeenCalledWith("games:user-id", id);
  });

  it("returns existing ID on subsequent calls", () => {
    const id1 = getOrCreateSessionId();
    const id2 = getOrCreateSessionId();
    expect(id1).toBe(id2);
  });

  it("keeps the canonical session id even if localStorage is tampered with directly", () => {
    const canonicalId = getOrCreateSessionId();
    store["games:user-id"] = "forged-session";

    expect(getOrCreateSessionId()).toBe(canonicalId);
  });
});

// ─── getStoredName / setStoredName ──────────────────────────
describe("getStoredName / setStoredName", () => {
  it("returns empty string when no name stored", () => {
    expect(getStoredName()).toBe("");
  });

  it("stores and retrieves a name", () => {
    setStoredName("TestPlayer");
    expect(store["games:user-name"]).toBe("TestPlayer");
  });

  it("strips whitespace from name", () => {
    setStoredName("Test Player");
    expect(store["games:user-name"]).toBe("TestPlayer");
  });

  it("removes key for empty name", () => {
    setStoredName("Hello");
    setStoredName("");
    expect(store["games:user-name"]).toBeUndefined();
  });

  it("dispatches custom event on name change", () => {
    setStoredName("NewName");
    expect(dispatchMock).toHaveBeenCalled();
  });

  it("keeps the canonical name even if localStorage is tampered with directly", () => {
    setStoredName("RealName");
    store["games:user-name"] = "ForgedName";

    expect(getStoredName()).toBe("RealName");
  });

  it("syncStoredIdentity updates the canonical session and name together", () => {
    const originalId = getOrCreateSessionId();

    const result = syncStoredIdentity({ sessionId: "server-session", name: "Server Name" });

    expect(originalId).not.toBe("server-session");
    expect(result).toEqual({ sessionChanged: true, nameChanged: true });
    expect(getOrCreateSessionId()).toBe("server-session");
    expect(getStoredName()).toBe("ServerName");
  });

  it("getSessionRequestHeaders includes the canonical session and signed proof", () => {
    const result = syncStoredIdentity({ sessionId: "server-session", name: "Server Name" });
    expect(result.sessionChanged).toBe(true);
    localStorageMock.setItem("games:session-proof", "proof-token");

    const headers = getSessionRequestHeaders(undefined, { "Content-Type": "application/json" });

    expect(getStoredSessionProof()).toBe("proof-token");
    expect(headers).toEqual({
      "Content-Type": "application/json",
      "x-zero-user-id": "server-session",
      "x-zero-session-proof": "proof-token",
    });
  });
});

// ─── getPlayerProfile ───────────────────────────────────────
describe("getPlayerProfile", () => {
  it("returns object with id and name", () => {
    const profile = getPlayerProfile();
    expect(profile).toHaveProperty("id");
    expect(profile).toHaveProperty("name");
    expect(typeof profile.id).toBe("string");
    expect(typeof profile.name).toBe("string");
  });
});

// ─── Recent games ───────────────────────────────────────────
describe("getRecentGames / addRecentGame / removeRecentGame / clearRecentGames", () => {
  it("returns empty array initially", () => {
    expect(getRecentGames()).toEqual([]);
  });

  it("adds and retrieves a recent game", () => {
    addRecentGame({ id: "g1", code: "abcd", gameType: "imposter" });
    const games = getRecentGames();
    const game = games[0]!;
    expect(games).toHaveLength(1);
    expect(game.id).toBe("g1");
    expect(game.code).toBe("ABCD"); // uppercased
    expect(game.gameType).toBe("imposter");
    expect(game.lastPlayedAt).toBeGreaterThan(0);
  });

  it("deduplicates by id + gameType", () => {
    addRecentGame({ id: "g1", code: "aaaa", gameType: "imposter" });
    addRecentGame({ id: "g1", code: "aaaa", gameType: "imposter" });
    expect(getRecentGames()).toHaveLength(1);
  });

  it("allows same id with different gameType", () => {
    addRecentGame({ id: "g1", code: "aaaa", gameType: "imposter" });
    addRecentGame({ id: "g1", code: "aaaa", gameType: "password" });
    expect(getRecentGames()).toHaveLength(2);
  });

  it("limits to MAX_RECENT_GAMES (6)", () => {
    for (let i = 0; i < 10; i++) {
      addRecentGame({ id: `g${i}`, code: `c${i}`, gameType: "imposter" });
    }
    expect(getRecentGames().length).toBeLessThanOrEqual(6);
  });

  it("orders by most recent first", () => {
    addRecentGame({ id: "old", code: "old1", gameType: "imposter" });
    addRecentGame({ id: "new", code: "new1", gameType: "imposter" });
    const games = getRecentGames();
    expect(games[0]!.id).toBe("new");
  });

  it("removes a specific game", () => {
    addRecentGame({ id: "g1", code: "aaaa", gameType: "imposter" });
    addRecentGame({ id: "g2", code: "bbbb", gameType: "password" });
    removeRecentGame("g1", "imposter");
    const games = getRecentGames();
    expect(games).toHaveLength(1);
    expect(games[0]!.id).toBe("g2");
  });

  it("clearRecentGames removes all", () => {
    addRecentGame({ id: "g1", code: "aaaa", gameType: "imposter" });
    clearRecentGames();
    expect(getRecentGames()).toEqual([]);
  });

  it("handles corrupted localStorage gracefully", () => {
    store["games:recent-games"] = "not valid json!!!";
    expect(getRecentGames()).toEqual([]);
  });
});

// ─── hasVisited / markVisited ───────────────────────────────
describe("hasVisited / markVisited", () => {
  it("returns false initially", () => {
    expect(hasVisited()).toBe(false);
  });

  it("returns true after markVisited", () => {
    markVisited();
    expect(hasVisited()).toBe(true);
  });
});

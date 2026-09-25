import { describe, it, expect, vi, beforeEach } from "vitest";

const originalFetch = globalThis.fetch;

const store: Record<string, string> = {};
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
  },
  writable: true,
});

class CE { detail: unknown; type: string; constructor(type: string, opts?: { detail?: unknown }) { this.type = type; this.detail = opts?.detail; } }
const dispatchMock = vi.fn();
Object.defineProperty(globalThis, "window", {
  value: { dispatchEvent: dispatchMock, setTimeout, clearTimeout, CustomEvent: CE },
  writable: true,
});
Object.defineProperty(globalThis, "CustomEvent", { value: CE, writable: true });

// The module caches identity in memory, so every test gets a fresh copy of it.
let session: typeof import("../lib/session");

beforeEach(async () => {
  for (const k of Object.keys(store)) delete store[k];
  dispatchMock.mockClear();
  vi.restoreAllMocks();
  if (originalFetch) {
    Object.defineProperty(globalThis, "fetch", { value: originalFetch, writable: true, configurable: true });
  } else {
    Reflect.deleteProperty(globalThis, "fetch");
  }
  vi.resetModules();
  session = await import("../lib/session");
});

describe("getOrCreateSessionId", () => {
  it("creates an id once and persists it", () => {
    const id = session.getOrCreateSessionId();
    expect(id).toBeTruthy();
    expect(store["games:user-id"]).toBe(id);
    expect(session.getOrCreateSessionId()).toBe(id);
  });

  it("keeps the canonical session id even if localStorage is tampered with directly", () => {
    const canonicalId = session.getOrCreateSessionId();
    store["games:user-id"] = "forged-session";

    expect(session.getOrCreateSessionId()).toBe(canonicalId);
  });
});

describe("getStoredName / setStoredName", () => {
  it("returns empty string when no name stored", () => {
    expect(session.getStoredName()).toBe("");
  });

  it("stores and retrieves a name", () => {
    session.setStoredName("TestPlayer");
    expect(store["games:user-name"]).toBe("TestPlayer");
    expect(session.getStoredName()).toBe("TestPlayer");
  });

  it("strips whitespace from name", () => {
    session.setStoredName("Test Player");
    expect(store["games:user-name"]).toBe("TestPlayer");
  });

  it("removes key for empty name", () => {
    session.setStoredName("Hello");
    session.setStoredName("");
    expect(store["games:user-name"]).toBeUndefined();
  });

  it("tells the rest of the app the name changed", () => {
    session.setStoredName("NewName");
    expect(dispatchMock).toHaveBeenCalledWith(expect.objectContaining({ type: "games:name-changed", detail: "NewName" }));
  });

  it("keeps the canonical name even if localStorage is tampered with directly", () => {
    session.setStoredName("RealName");
    store["games:user-name"] = "ForgedName";

    expect(session.getStoredName()).toBe("RealName");
  });

  it("syncStoredIdentity updates the canonical session and name together", () => {
    const originalId = session.getOrCreateSessionId();

    const result = session.syncStoredIdentity({ sessionId: "server-session", name: "Server Name" });

    expect(originalId).not.toBe("server-session");
    expect(result).toEqual({ sessionChanged: true, nameChanged: true });
    expect(session.getOrCreateSessionId()).toBe("server-session");
    expect(session.getStoredName()).toBe("ServerName");
  });

  it("getSessionRequestHeaders includes the canonical session and signed proof", () => {
    const result = session.syncStoredIdentity({ sessionId: "server-session", name: "Server Name" });
    expect(result.sessionChanged).toBe(true);
    store["games:session-proof"] = "proof-token";

    const headers = session.getSessionRequestHeaders(undefined, { "Content-Type": "application/json" });

    expect(session.getStoredSessionProof()).toBe("proof-token");
    expect(headers).toEqual({
      "Content-Type": "application/json",
      "x-zero-user-id": "server-session",
      "x-zero-session-proof": "proof-token",
    });
  });
});

describe("display name fallbacks", () => {
  it("uses a generated name instead of exposing the session id", () => {
    const displayName = session.getDisplayName(null, "server-session");
    expect(displayName).toBeTruthy();
    expect(displayName).not.toBe("server-session");
    expect(displayName).not.toContain("server");
  });

  it("creates and stores a generated name when none exists", () => {
    const sessionId = session.getOrCreateSessionId();
    const generated = session.getOrCreateStoredName(sessionId);
    expect(generated).toBeTruthy();
    expect(session.getStoredName()).toBe(generated);
    expect(generated).not.toBe(sessionId.slice(0, 5));
  });
});

describe("syncSessionIdentityForBoot", () => {
  it("retries until it gets a verified proof", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("cold start"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: "server-session",
          name: "Server Name",
          zeroSessionProof: "fresh-proof",
          resetRequired: true,
          created: false,
          source: "claimed",
        }),
      });

    Object.defineProperty(globalThis, "fetch", { value: fetchMock, writable: true, configurable: true });

    const result = await session.syncSessionIdentityForBoot("https://api.example.com", {
      attempts: 2,
      retryDelayMs: 0,
      timeoutMs: 2000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      sessionId: "server-session",
      name: "ServerName",
      zeroSessionProof: "fresh-proof",
      source: "claimed",
    });
    expect(session.getStoredSessionProof()).toBe("fresh-proof");
  });

  it("throws if boot cannot get a verified proof", async () => {
    Object.defineProperty(globalThis, "fetch", {
      value: vi.fn().mockRejectedValue(new Error("offline")),
      writable: true,
      configurable: true,
    });

    await expect(
      session.syncSessionIdentityForBoot("https://api.example.com", {
        attempts: 2,
        retryDelayMs: 0,
        timeoutMs: 2000,
      })
    ).rejects.toThrow("verified session");
  });
});

describe("recent games", () => {
  it("adds and retrieves a recent game", () => {
    session.addRecentGame({ id: "g1", code: "abcd", gameType: "imposter" });
    const games = session.getRecentGames();
    const game = games[0]!;
    expect(games).toHaveLength(1);
    expect(game.id).toBe("g1");
    expect(game.code).toBe("ABCD"); // uppercased
    expect(game.gameType).toBe("imposter");
    expect(game.lastPlayedAt).toBeGreaterThan(0);
  });

  it("deduplicates by id + gameType", () => {
    session.addRecentGame({ id: "g1", code: "aaaa", gameType: "imposter" });
    session.addRecentGame({ id: "g1", code: "aaaa", gameType: "imposter" });
    expect(session.getRecentGames()).toHaveLength(1);
  });

  it("allows same id with different gameType", () => {
    session.addRecentGame({ id: "g1", code: "aaaa", gameType: "imposter" });
    session.addRecentGame({ id: "g1", code: "aaaa", gameType: "password" });
    expect(session.getRecentGames()).toHaveLength(2);
  });

  it("keeps only the 6 most recent", () => {
    for (let i = 0; i < 10; i++) {
      session.addRecentGame({ id: `g${i}`, code: `c${i}`, gameType: "imposter" });
    }
    expect(session.getRecentGames().map((g) => g.id)).toEqual(["g9", "g8", "g7", "g6", "g5", "g4"]);
  });

  it("removes a specific game", () => {
    session.addRecentGame({ id: "g1", code: "aaaa", gameType: "imposter" });
    session.addRecentGame({ id: "g2", code: "bbbb", gameType: "password" });
    session.removeRecentGame("g1", "imposter");
    const games = session.getRecentGames();
    expect(games).toHaveLength(1);
    expect(games[0]!.id).toBe("g2");
  });

  it("clearRecentGames removes all", () => {
    session.addRecentGame({ id: "g1", code: "aaaa", gameType: "imposter" });
    session.clearRecentGames();
    expect(session.getRecentGames()).toEqual([]);
  });

  it("handles corrupted localStorage gracefully", () => {
    store["games:recent-games"] = "not valid json!!!";
    expect(session.getRecentGames()).toEqual([]);
  });
});

describe("hasVisited / markVisited", () => {
  it("flips from false to true after markVisited", () => {
    expect(session.hasVisited()).toBe(false);
    session.markVisited();
    expect(session.hasVisited()).toBe(true);
  });
});

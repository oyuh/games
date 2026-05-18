import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupGameByCode, routeForLookupGame, waitForJoinedGameAccess } from "../lib/game-lookup";
import { resetStoredIdentityForTests } from "../lib/session";

afterEach(() => {
  resetStoredIdentityForTests();
  vi.unstubAllGlobals();
});

describe("game lookup", () => {
  it("routes every multiplayer game type to the playable page", () => {
    expect(routeForLookupGame("imposter", "g1")).toBe("/imposter/g1");
    expect(routeForLookupGame("password", "g1")).toBe("/password/g1/begin");
    expect(routeForLookupGame("chain_reaction", "g1")).toBe("/chain/g1");
    expect(routeForLookupGame("shade_signal", "g1")).toBe("/shade/g1");
    expect(routeForLookupGame("location_signal", "g1")).toBe("/location/g1");
  });

  it("uses the sanitized API lookup endpoint instead of protected Zero byCode queries", async () => {
    const game = {
      gameType: "password",
      id: "game1",
      code: "ABC123",
      phase: "lobby",
      isPublic: false,
      hostName: null,
      playerCount: 1,
      spectatorCount: 0,
      createdAt: 123,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ game }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(lookupGameByCode(" abc123 ")).resolves.toEqual(game);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/games/lookup?code=ABC123"),
      { credentials: "include" }
    );
  });

  it("returns null when the API cannot find a game for the code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));

    await expect(lookupGameByCode("NOPE")).resolves.toBeNull();
  });

  it("waits for the API to confirm the joined session is attached", async () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => key === "games:session-proof" ? "proof-1" : null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ isAttached: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(waitForJoinedGameAccess("password", "game1", "session1")).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/games/access?type=password&id=game1&sessionId=session1"),
      {
        credentials: "include",
        headers: {
          "x-zero-session-proof": "proof-1",
          "x-zero-user-id": "session1",
        },
      }
    );
  });
});

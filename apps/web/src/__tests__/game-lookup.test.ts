import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupGameByCode, routeForLookupGame } from "../lib/game-lookup";

afterEach(() => {
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
});

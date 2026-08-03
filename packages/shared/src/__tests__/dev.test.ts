/**
 * Dev tools: drives a real imposter game with bots only.
 *
 * The point of this test is that dev mutators own no game logic. Filling the
 * lobby and making bots act must produce exactly the state real players would,
 * including the automatic lobby → playing → voting → results transitions.
 */
import { describe, it, expect, vi } from "vitest";
import { MockTx, serverCtx, makeSession, makeImposterGame } from "./test-helpers";

// ─── Mock @rocicorp/zero ────────────────────────────────────
// Unlike the other suites, defineMutator here returns a handler that is both
// callable (how existing tests invoke mutators) and carries `.fn` (how the dev
// mutators call into real game mutators at runtime).
vi.mock("@rocicorp/zero", () => {
  function mockQueryBuilder(table: string) {
    const q: any = {
      _table: table,
      _filters: [] as Array<{ field: string; value: unknown }>,
      _single: false,
      where(field: string, value: unknown) {
        const next = mockQueryBuilder(table);
        next._filters = [...q._filters, { field, value }];
        next._single = q._single;
        return next;
      },
      one() {
        const next = mockQueryBuilder(table);
        next._filters = [...q._filters];
        next._single = true;
        return next;
      },
    };
    return q;
  }
  const zqlProxy = new Proxy({}, { get: (_t, name: string) => mockQueryBuilder(name) });

  return {
    defineMutator: (_schema: any, handler: any) => Object.assign(handler, { fn: handler }),
    defineMutators: (m: any) => m,
    createBuilder: () => zqlProxy,
    createSchema: () => ({}),
    relationships: () => ({}),
    table: () => ({ columns: () => ({ primaryKey: () => ({}) }) }),
    string: () => ({ optional: () => ({}) }),
    number: () => ({ optional: () => ({}) }),
    boolean: () => ({ optional: () => ({}) }),
    json: () => ({ optional: () => ({}) }),
    enumeration: () => ({ optional: () => ({}) }),
  };
});

const { devMutators, isDevBot } = await import("../zero/mutators/dev");
const { imposterMutators } = await import("../zero/mutators/imposter");

const GAME_ID = "game-1";
const HOST_ID = "host-1";

function setup() {
  const tx = new MockTx("server");
  tx.seed("sessions", [makeSession({ id: HOST_ID, name: "Host" })]);
  tx.seed("imposter_games", [makeImposterGame({ id: GAME_ID, host_id: HOST_ID })]);
  return tx;
}

const game = (tx: MockTx) => tx.getById("imposter_games", GAME_ID) as any;
const target = { gameId: GAME_ID, gameType: "imposter" as const };

describe("dev.fillLobby", () => {
  it("adds bots through the real join mutator", async () => {
    const tx = setup();
    await devMutators.fillLobby({ args: { ...target, count: 3 }, tx, ctx: serverCtx(HOST_ID) });

    const players = game(tx).players;
    expect(players).toHaveLength(4); // host + 3 bots
    expect(players.filter((p: any) => isDevBot(p.sessionId))).toHaveLength(3);
    // join is what gives players a name and connected flag, so this proves we went through it
    expect(players.every((p: any) => p.name && p.connected === true)).toBe(true);
  });

  it("gives every bot its own session row", async () => {
    const tx = setup();
    await devMutators.fillLobby({ args: { ...target, count: 2 }, tx, ctx: serverCtx(HOST_ID) });

    const botSessions = tx.getAll("sessions").filter((s: any) => isDevBot(s.id));
    expect(botSessions).toHaveLength(2);
    expect(botSessions.every((s: any) => s.game_id === GAME_ID)).toBe(true);
  });
});

describe("dev.botAct", () => {
  it("plays a full round: clues advance to voting, votes advance to results", async () => {
    // Host is a bot too, so bots alone can complete every phase.
    const botHost = "bot-host";
    const tx = new MockTx("server");
    tx.seed("sessions", [makeSession({ id: botHost, name: "BotHost" })]);
    tx.seed("imposter_games", [makeImposterGame({ id: GAME_ID, host_id: botHost })]);
    const ctx = serverCtx(botHost);

    await devMutators.fillLobby({ args: { ...target, count: 2 }, tx, ctx });
    await imposterMutators.start({ args: { gameId: GAME_ID, hostId: botHost }, tx, ctx });

    expect(game(tx).phase).toBe("playing");
    expect(game(tx).players).toHaveLength(3);

    await devMutators.botAct({ args: target, tx, ctx });
    expect(game(tx).clues.length).toBeGreaterThan(0);
    expect(game(tx).phase).toBe("voting");

    await devMutators.botAct({ args: target, tx, ctx });
    expect(game(tx).votes.length).toBeGreaterThan(0);
    expect(game(tx).phase).toBe("results");

    // Real rules held throughout: nobody voted for themselves.
    expect(game(tx).votes.every((v: any) => v.voterId !== v.targetId)).toBe(true);
  });

  it("does nothing in the lobby", async () => {
    const tx = setup();
    const ctx = serverCtx(HOST_ID);
    await devMutators.fillLobby({ args: { ...target, count: 3 }, tx, ctx });

    await devMutators.botAct({ args: target, tx, ctx });
    expect(game(tx).phase).toBe("lobby");
    expect(game(tx).clues).toHaveLength(0);
  });
});

describe("dev.createHosted", () => {
  /** No game row yet: createHosted is what makes it. */
  function blank() {
    const tx = new MockTx("server");
    tx.seed("sessions", [makeSession({ id: "me-1", name: "Me" })]);
    tx.seed("imposter_games", []);
    return tx;
  }

  it("makes a bot the host so the human who joins is a plain player", async () => {
    const tx = blank();
    const ctx = serverCtx("me-1");

    await devMutators.createHosted({
      args: { id: GAME_ID, gameType: "imposter", bots: 3 },
      tx,
      ctx,
    });
    await imposterMutators.join({ args: { gameId: GAME_ID, sessionId: "me-1" }, tx, ctx });

    const g = game(tx);
    expect(isDevBot(g.host_id)).toBe(true);
    expect(g.host_id).not.toBe("me-1");
    expect(g.players).toHaveLength(4); // 3 bots (host included) + me
    expect(g.players.filter((p: any) => isDevBot(p.sessionId))).toHaveLength(3);
  });
});

describe("dev.asHost", () => {
  async function hostedGameWithMe() {
    const tx = new MockTx("server");
    tx.seed("sessions", [makeSession({ id: "me-1", name: "Me" })]);
    tx.seed("imposter_games", []);
    const ctx = serverCtx("me-1");
    await devMutators.createHosted({ args: { id: GAME_ID, gameType: "imposter", bots: 3 }, tx, ctx });
    await imposterMutators.join({ args: { gameId: GAME_ID, sessionId: "me-1" }, tx, ctx });
    return { tx, ctx };
  }

  it("starts a game the caller does not host", async () => {
    const { tx, ctx } = await hostedGameWithMe();
    expect(game(tx).phase).toBe("lobby");

    await devMutators.asHost({ args: { ...target, action: "start" }, tx, ctx });
    expect(game(tx).phase).toBe("playing");
  });

  it("kicks the caller on the bot host's behalf", async () => {
    const { tx, ctx } = await hostedGameWithMe();

    await devMutators.asHost({ args: { ...target, action: "kick", targetId: "me-1" }, tx, ctx });

    const g = game(tx);
    expect(g.players.some((p: any) => p.sessionId === "me-1")).toBe(false);
    expect(g.kicked).toContain("me-1");
  });

  it("ends the game on the bot host's behalf", async () => {
    const { tx, ctx } = await hostedGameWithMe();
    await devMutators.asHost({ args: { ...target, action: "endGame" }, tx, ctx });
    expect(game(tx).phase).toBe("ended");
  });
});

describe("dev.expirePhase", () => {
  it("expires the timer so the game's own advanceTimer takes over", async () => {
    const tx = setup();
    const ctx = serverCtx(HOST_ID);
    await devMutators.fillLobby({ args: { ...target, count: 3 }, tx, ctx });
    await imposterMutators.start({ args: { gameId: GAME_ID, hostId: HOST_ID }, tx, ctx });

    expect(game(tx).settings.phaseEndsAt).toBeGreaterThan(Date.now());
    await devMutators.expirePhase({ args: target, tx, ctx });
    expect(game(tx).settings.phaseEndsAt).toBeLessThan(Date.now());

    // advanceTimer is the real mutator and it alone performs the transition.
    await imposterMutators.advanceTimer({ args: { gameId: GAME_ID }, tx, ctx });
    expect(game(tx).phase).toBe("voting");
  });
});

describe("dev.clearBots", () => {
  it("removes bots and leaves real players alone", async () => {
    const tx = setup();
    const ctx = serverCtx(HOST_ID);
    await devMutators.fillLobby({ args: { ...target, count: 3 }, tx, ctx });
    expect(game(tx).players).toHaveLength(4);

    await devMutators.clearBots({ args: target, tx, ctx });

    const players = game(tx).players;
    expect(players).toHaveLength(1);
    expect(players[0].sessionId).toBe(HOST_ID);
    expect(tx.getAll("sessions").filter((s: any) => isDevBot(s.id))).toHaveLength(0);
  });

  it("also clears bots that games moved into spectators", async () => {
    const tx = setup();
    const ctx = serverCtx(HOST_ID);
    await devMutators.fillLobby({ args: { ...target, count: 3 }, tx, ctx });

    // Eliminated players end up as spectators, which outlives the players array.
    const ghost = game(tx).players.find((p: any) => isDevBot(p.sessionId)).sessionId;
    await tx.mutate.imposter_games.update({
      id: GAME_ID,
      players: game(tx).players.filter((p: any) => p.sessionId !== ghost),
      spectators: [{ sessionId: ghost, name: "Ghost" }],
    });

    await devMutators.clearBots({ args: target, tx, ctx });

    expect(game(tx).spectators).toHaveLength(0);
    expect(tx.getAll("sessions").filter((s: any) => isDevBot(s.id))).toHaveLength(0);
  });
});

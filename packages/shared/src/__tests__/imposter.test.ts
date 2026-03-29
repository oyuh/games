/**
 * Imposter game — mutator integration tests.
 *
 * Tests game phases (lobby → playing → voting → results) and
 * security enforcement (identity spoofing, kicked players, etc.)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MockTx,
  serverCtx,
  anonCtx,
  makeSession,
  makeImposterGame,
  expectThrows,
} from "./test-helpers";

// ─── Mock @rocicorp/zero so defineMutator is a pass-through ──
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
    defineMutator: (_schema: any, handler: any) => handler,
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

// Import mutators AFTER mocking
const { imposterMutators } = await import("../zero/mutators/imposter");

// Type the mutators as handler functions
type Handler = (params: { args: any; tx: any; ctx: any }) => Promise<void>;
const mutators = imposterMutators as unknown as Record<string, Handler>;

// ───────────────────────────────────────────────────────────
describe("Imposter — lobby phase", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [
      makeSession({ id: "host1", name: "Host" }),
      makeSession({ id: "player1", name: "Alice" }),
      makeSession({ id: "player2", name: "Bob" }),
      makeSession({ id: "player3", name: "Charlie" }),
    ]);
  });

  it("creates a game with the host as the first player", async () => {
    await mutators.create({ args: { id: "game1", hostId: "host1" }, tx, ctx: serverCtx("host1") });
    const game = tx.getById("imposter_games", "game1") as any;
    expect(game).toBeDefined();
    expect(game.phase).toBe("lobby");
    expect(game.host_id).toBe("host1");
    expect(game.players).toHaveLength(1);
    expect(game.players[0].sessionId).toBe("host1");
  });

  it("player can join the lobby", async () => {
    tx.seed("imposter_games", [makeImposterGame({ id: "game1", host_id: "host1" })]);
    await mutators.join({ args: { gameId: "game1", sessionId: "player1" }, tx, ctx: serverCtx("player1") });
    const game = tx.getById("imposter_games", "game1") as any;
    expect(game.players).toHaveLength(2);
    expect(game.players[1].sessionId).toBe("player1");
  });

  it("kicked player cannot rejoin", async () => {
    tx.seed("imposter_games", [
      makeImposterGame({ id: "game1", host_id: "host1", kicked: ["player1"] }),
    ]);
    await expectThrows(
      () => mutators.join({ args: { gameId: "game1", sessionId: "player1" }, tx, ctx: serverCtx("player1") }),
      "kicked"
    );
  });

  it("cannot join a non-existent game", async () => {
    await expectThrows(
      () => mutators.join({ args: { gameId: "nope", sessionId: "player1" }, tx, ctx: serverCtx("player1") }),
      "not found"
    );
  });

  it("cannot join an ended game", async () => {
    tx.seed("imposter_games", [
      makeImposterGame({ id: "game1", host_id: "host1", phase: "ended" }),
    ]);
    await expectThrows(
      () => mutators.join({ args: { gameId: "game1", sessionId: "player1" }, tx, ctx: serverCtx("player1") }),
      "ended"
    );
  });
});

// ───────────────────────────────────────────────────────────
describe("Imposter — identity enforcement", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [
      makeSession({ id: "host1", name: "Host" }),
      makeSession({ id: "player1", name: "Alice" }),
      makeSession({ id: "attacker", name: "Hacker" }),
    ]);
    tx.seed("imposter_games", [
      makeImposterGame({
        id: "game1",
        host_id: "host1",
        players: [
          { sessionId: "host1", name: "Host", connected: true },
          { sessionId: "player1", name: "Alice", connected: true },
        ],
      }),
    ]);
  });

  it("blocks joining as someone else (spoofed sessionId)", async () => {
    // Attacker is authenticated as "attacker" but claims to be "player1"
    await expectThrows(
      () => mutators.join({ args: { gameId: "game1", sessionId: "player1" }, tx, ctx: serverCtx("attacker") }),
      "Not allowed"
    );
  });

  it("blocks leaving on behalf of another player", async () => {
    await expectThrows(
      () => mutators.leave({ args: { gameId: "game1", sessionId: "player1" }, tx, ctx: serverCtx("attacker") }),
      "Not allowed"
    );
  });

  it("blocks non-host from starting the game", async () => {
    // Need 3 players to start
    tx.seed("imposter_games", [
      makeImposterGame({
        id: "game1",
        host_id: "host1",
        players: [
          { sessionId: "host1", name: "Host", connected: true },
          { sessionId: "player1", name: "Alice", connected: true },
          { sessionId: "attacker", name: "Hacker", connected: true },
        ],
      }),
    ]);
    await expectThrows(
      () => mutators.start({ args: { gameId: "game1", hostId: "attacker" }, tx, ctx: serverCtx("attacker") }),
      "Only host can start"
    );
  });

  it("allows host to start", async () => {
    tx.seed("imposter_games", [
      makeImposterGame({
        id: "game1",
        host_id: "host1",
        players: [
          { sessionId: "host1", name: "Host", connected: true },
          { sessionId: "player1", name: "Alice", connected: true },
          { sessionId: "attacker", name: "Hacker", connected: true },
        ],
      }),
    ]);
    await mutators.start({ args: { gameId: "game1", hostId: "host1" }, tx, ctx: serverCtx("host1") });
    const game = tx.getById("imposter_games", "game1") as any;
    expect(game.phase).toBe("playing");
  });
});

// ───────────────────────────────────────────────────────────
describe("Imposter — game start & playing phase", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [
      makeSession({ id: "host1", name: "Host" }),
      makeSession({ id: "p1", name: "Alice" }),
      makeSession({ id: "p2", name: "Bob" }),
    ]);
    tx.seed("imposter_games", [
      makeImposterGame({
        id: "game1",
        host_id: "host1",
        players: [
          { sessionId: "host1", name: "Host", connected: true },
          { sessionId: "p1", name: "Alice", connected: true },
          { sessionId: "p2", name: "Bob", connected: true },
        ],
      }),
    ]);
  });

  it("requires at least 3 players to start", async () => {
    tx.seed("imposter_games", [
      makeImposterGame({
        id: "small",
        host_id: "host1",
        players: [
          { sessionId: "host1", name: "Host", connected: true },
          { sessionId: "p1", name: "Alice", connected: true },
        ],
      }),
    ]);
    await expectThrows(
      () => mutators.start({ args: { gameId: "small", hostId: "host1" }, tx, ctx: serverCtx("host1") }),
      "at least 3"
    );
  });

  it("transitions to playing phase on start", async () => {
    await mutators.start({ args: { gameId: "game1", hostId: "host1" }, tx, ctx: serverCtx("host1") });
    const game = tx.getById("imposter_games", "game1") as any;
    expect(game.phase).toBe("playing");
    expect(game.secret_word).toBeTruthy();
    expect(game.settings.phaseEndsAt).toBeGreaterThan(0);
  });

  it("assigns roles on start (at least 1 imposter)", async () => {
    await mutators.start({ args: { gameId: "game1", hostId: "host1" }, tx, ctx: serverCtx("host1") });
    const game = tx.getById("imposter_games", "game1") as any;
    const imposters = game.players.filter((p: any) => p.role === "imposter");
    expect(imposters.length).toBeGreaterThanOrEqual(1);
    const regularPlayers = game.players.filter((p: any) => p.role === "player");
    expect(regularPlayers.length).toBeGreaterThanOrEqual(1);
  });
});

// ───────────────────────────────────────────────────────────
describe("Imposter — clue submission", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [
      makeSession({ id: "p1", name: "Alice" }),
      makeSession({ id: "p2", name: "Bob" }),
      makeSession({ id: "p3", name: "Charlie" }),
    ]);
    tx.seed("imposter_games", [
      makeImposterGame({
        id: "game1",
        host_id: "p1",
        phase: "playing",
        secret_word: "elephant",
        players: [
          { sessionId: "p1", name: "Alice", connected: true, role: "player", eliminated: false },
          { sessionId: "p2", name: "Bob", connected: true, role: "imposter", eliminated: false },
          { sessionId: "p3", name: "Charlie", connected: true, role: "player", eliminated: false },
        ],
      }),
    ]);
  });

  it("accepts a valid clue", async () => {
    await mutators.submitClue({
      args: { gameId: "game1", sessionId: "p1", text: "Big gray animal" },
      tx,
      ctx: serverCtx("p1"),
    });
    const game = tx.getById("imposter_games", "game1") as any;
    expect(game.clues).toHaveLength(1);
    expect(game.clues[0].text).toBe("Big gray animal");
  });

  it("sanitizes HTML from clue text", async () => {
    await mutators.submitClue({
      args: { gameId: "game1", sessionId: "p1", text: '<script>alert("xss")</script>Big animal' },
      tx,
      ctx: serverCtx("p1"),
    });
    const game = tx.getById("imposter_games", "game1") as any;
    expect(game.clues[0].text).not.toContain("<script>");
    expect(game.clues[0].text).toContain("Big animal");
  });

  it("rejects empty clues after sanitization", async () => {
    await expectThrows(
      () =>
        mutators.submitClue({
          args: { gameId: "game1", sessionId: "p1", text: "<script></script>" },
          tx,
          ctx: serverCtx("p1"),
        }),
      "empty"
    );
  });

  it("blocks clue submission by a non-player", async () => {
    await expectThrows(
      () =>
        mutators.submitClue({
          args: { gameId: "game1", sessionId: "outsider", text: "my clue" },
          tx,
          ctx: serverCtx("outsider"),
        }),
      "not in game"
    );
  });

  it("transitions to voting when all players submit clues", async () => {
    await mutators.submitClue({
      args: { gameId: "game1", sessionId: "p1", text: "Clue 1" },
      tx,
      ctx: serverCtx("p1"),
    });
    await mutators.submitClue({
      args: { gameId: "game1", sessionId: "p2", text: "Clue 2" },
      tx,
      ctx: serverCtx("p2"),
    });
    await mutators.submitClue({
      args: { gameId: "game1", sessionId: "p3", text: "Clue 3" },
      tx,
      ctx: serverCtx("p3"),
    });
    const game = tx.getById("imposter_games", "game1") as any;
    expect(game.phase).toBe("voting");
  });
});

// ───────────────────────────────────────────────────────────
describe("Imposter — voting phase", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [
      makeSession({ id: "p1", name: "Alice" }),
      makeSession({ id: "p2", name: "Bob" }),
      makeSession({ id: "p3", name: "Charlie" }),
    ]);
    tx.seed("imposter_games", [
      makeImposterGame({
        id: "game1",
        host_id: "p1",
        phase: "voting",
        secret_word: "elephant",
        players: [
          { sessionId: "p1", name: "Alice", connected: true, role: "player", eliminated: false },
          { sessionId: "p2", name: "Bob", connected: true, role: "imposter", eliminated: false },
          { sessionId: "p3", name: "Charlie", connected: true, role: "player", eliminated: false },
        ],
        clues: [
          { sessionId: "p1", text: "Clue 1", createdAt: Date.now() },
          { sessionId: "p2", text: "Clue 2", createdAt: Date.now() },
          { sessionId: "p3", text: "Clue 3", createdAt: Date.now() },
        ],
        settings: {
          rounds: 3,
          imposters: 1,
          currentRound: 1,
          roundDurationSec: 75,
          votingDurationSec: 45,
          phaseEndsAt: Date.now() + 45000,
        },
      }),
    ]);
  });

  it("accepts a valid vote", async () => {
    await mutators.submitVote({
      args: { gameId: "game1", voterId: "p1", targetId: "p2" },
      tx,
      ctx: serverCtx("p1"),
    });
    const game = tx.getById("imposter_games", "game1") as any;
    expect(game.votes).toHaveLength(1);
  });

  it("blocks self-voting", async () => {
    await expectThrows(
      () =>
        mutators.submitVote({
          args: { gameId: "game1", voterId: "p1", targetId: "p1" },
          tx,
          ctx: serverCtx("p1"),
        }),
      "yourself"
    );
  });

  it("blocks voting as someone else (identity spoofing)", async () => {
    await expectThrows(
      () =>
        mutators.submitVote({
          args: { gameId: "game1", voterId: "p1", targetId: "p2" },
          tx,
          ctx: serverCtx("p3"), // p3 trying to vote as p1
        }),
      "Not allowed"
    );
  });

  it("transitions to results when all players vote", async () => {
    await mutators.submitVote({
      args: { gameId: "game1", voterId: "p1", targetId: "p2" },
      tx,
      ctx: serverCtx("p1"),
    });
    await mutators.submitVote({
      args: { gameId: "game1", voterId: "p2", targetId: "p3" },
      tx,
      ctx: serverCtx("p2"),
    });
    await mutators.submitVote({
      args: { gameId: "game1", voterId: "p3", targetId: "p2" },
      tx,
      ctx: serverCtx("p3"),
    });
    const game = tx.getById("imposter_games", "game1") as any;
    expect(game.phase).toBe("results");
  });
});

// ───────────────────────────────────────────────────────────
describe("Imposter — host leaving / ending", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [
      makeSession({ id: "host1", name: "Host", game_type: "imposter", game_id: "game1" }),
      makeSession({ id: "p1", name: "Alice", game_type: "imposter", game_id: "game1" }),
    ]);
    tx.seed("imposter_games", [
      makeImposterGame({
        id: "game1",
        host_id: "host1",
        players: [
          { sessionId: "host1", name: "Host", connected: true },
          { sessionId: "p1", name: "Alice", connected: true },
        ],
      }),
    ]);
  });

  it("host leaving ends the game for everyone", async () => {
    await mutators.leave({
      args: { gameId: "game1", sessionId: "host1" },
      tx,
      ctx: serverCtx("host1"),
    });
    const game = tx.getById("imposter_games", "game1") as any;
    expect(game.phase).toBe("ended");
  });

  it("regular player leaving doesn't end the game", async () => {
    await mutators.leave({
      args: { gameId: "game1", sessionId: "p1" },
      tx,
      ctx: serverCtx("p1"),
    });
    const game = tx.getById("imposter_games", "game1") as any;
    expect(game.phase).toBe("lobby");
    expect(game.players).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────
describe("Imposter — spectator handling", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [
      makeSession({ id: "host1", name: "Host" }),
      makeSession({ id: "late", name: "Late Joiner" }),
    ]);
    tx.seed("imposter_games", [
      makeImposterGame({
        id: "game1",
        host_id: "host1",
        phase: "playing",
        players: [
          { sessionId: "host1", name: "Host", connected: true, role: "player", eliminated: false },
          { sessionId: "p1", name: "Alice", connected: true, role: "imposter", eliminated: false },
          { sessionId: "p2", name: "Bob", connected: true, role: "player", eliminated: false },
        ],
      }),
    ]);
  });

  it("late joiners become spectators during active game", async () => {
    await mutators.join({
      args: { gameId: "game1", sessionId: "late" },
      tx,
      ctx: serverCtx("late"),
    });
    const game = tx.getById("imposter_games", "game1") as any;
    expect(game.spectators).toHaveLength(1);
    expect(game.spectators[0].sessionId).toBe("late");
    // Should NOT be added to the players array
    expect(game.players).toHaveLength(3);
  });
});

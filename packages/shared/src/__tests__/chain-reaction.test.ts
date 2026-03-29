/**
 * Chain Reaction game — mutator integration tests.
 *
 * Tests lobby, identity enforcement, and sanitization.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MockTx,
  serverCtx,
  makeSession,
  makeChainReactionGame,
  expectThrows,
} from "./test-helpers";

// ─── Mock @rocicorp/zero ────────────────────────────────────
vi.mock("@rocicorp/zero", () => {
  function mockQueryBuilder(table: string) {
    const q: any = {
      _table: table, _filters: [] as any[], _single: false,
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
    defineMutator: (_s: any, handler: any) => handler,
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

const { chainReactionMutators } = await import("../zero/mutators/chain-reaction");
type Handler = (params: { args: any; tx: any; ctx: any }) => Promise<void>;
const mutators = chainReactionMutators as unknown as Record<string, Handler>;

// ───────────────────────────────────────────────────────────
describe("Chain Reaction — lobby phase", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [
      makeSession({ id: "host1", name: "Host" }),
      makeSession({ id: "p1", name: "Alice" }),
      makeSession({ id: "p2", name: "Bob" }),
    ]);
  });

  it("creates a game", async () => {
    await mutators.create({ args: { id: "game1", hostId: "host1" }, tx, ctx: serverCtx("host1") });
    const game = tx.getById("chain_reaction_games", "game1") as any;
    expect(game).toBeDefined();
    expect(game.phase).toBe("lobby");
    expect(game.host_id).toBe("host1");
  });

  it("player can join lobby", async () => {
    tx.seed("chain_reaction_games", [makeChainReactionGame({ id: "game1", host_id: "host1" })]);
    await mutators.join({ args: { gameId: "game1", sessionId: "p1" }, tx, ctx: serverCtx("p1") });
    const game = tx.getById("chain_reaction_games", "game1") as any;
    expect(game.players).toHaveLength(2);
    expect(game.players[1].sessionId).toBe("p1");
  });

  it("kicked player cannot rejoin", async () => {
    tx.seed("chain_reaction_games", [
      makeChainReactionGame({ id: "game1", host_id: "host1", kicked: ["p1"] }),
    ]);
    await expectThrows(
      () => mutators.join({ args: { gameId: "game1", sessionId: "p1" }, tx, ctx: serverCtx("p1") }),
      "kicked"
    );
  });

  it("cannot join ended game", async () => {
    tx.seed("chain_reaction_games", [
      makeChainReactionGame({ id: "game1", host_id: "host1", phase: "ended" }),
    ]);
    await expectThrows(
      () => mutators.join({ args: { gameId: "game1", sessionId: "p1" }, tx, ctx: serverCtx("p1") }),
      "ended"
    );
  });
});

// ───────────────────────────────────────────────────────────
describe("Chain Reaction — identity enforcement", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [
      makeSession({ id: "host1", name: "Host" }),
      makeSession({ id: "p1", name: "Alice" }),
      makeSession({ id: "attacker", name: "Hacker" }),
    ]);
    tx.seed("chain_reaction_games", [
      makeChainReactionGame({
        id: "game1",
        host_id: "host1",
        players: [
          { sessionId: "host1", name: "Host", connected: true },
          { sessionId: "p1", name: "Alice", connected: true },
          { sessionId: "attacker", name: "Hacker", connected: true },
        ],
      }),
    ]);
  });

  it("blocks joining as someone else", async () => {
    await expectThrows(
      () => mutators.join({ args: { gameId: "game1", sessionId: "p1" }, tx, ctx: serverCtx("attacker") }),
      "Not allowed"
    );
  });

  it("blocks non-host from kicking", async () => {
    await expectThrows(
      () => mutators.kick({ args: { gameId: "game1", hostId: "attacker", targetId: "p1" }, tx, ctx: serverCtx("attacker") }),
      "Only host can kick"
    );
  });

  it("allows host to kick", async () => {
    await mutators.kick({
      args: { gameId: "game1", hostId: "host1", targetId: "attacker" },
      tx,
      ctx: serverCtx("host1"),
    });
    const game = tx.getById("chain_reaction_games", "game1") as any;
    expect(game.kicked).toContain("attacker");
    expect(game.players.find((p: any) => p.sessionId === "attacker")).toBeUndefined();
  });

  it("blocks non-host from starting", async () => {
    await expectThrows(
      () => mutators.start({ args: { gameId: "game1", hostId: "attacker" }, tx, ctx: serverCtx("attacker") }),
      "Only host can start"
    );
  });
});

// ───────────────────────────────────────────────────────────
describe("Chain Reaction — host leaving", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [
      makeSession({ id: "host1", name: "Host", game_type: "chain_reaction", game_id: "game1" }),
      makeSession({ id: "p1", name: "Alice", game_type: "chain_reaction", game_id: "game1" }),
    ]);
    tx.seed("chain_reaction_games", [
      makeChainReactionGame({
        id: "game1",
        host_id: "host1",
        players: [
          { sessionId: "host1", name: "Host", connected: true },
          { sessionId: "p1", name: "Alice", connected: true },
        ],
      }),
    ]);
  });

  it("host leaving ends the game", async () => {
    await mutators.leave({
      args: { gameId: "game1", sessionId: "host1" },
      tx,
      ctx: serverCtx("host1"),
    });
    const game = tx.getById("chain_reaction_games", "game1") as any;
    expect(game.phase).toBe("ended");
  });

  it("regular player leaving doesn't end the game", async () => {
    await mutators.leave({
      args: { gameId: "game1", sessionId: "p1" },
      tx,
      ctx: serverCtx("p1"),
    });
    const game = tx.getById("chain_reaction_games", "game1") as any;
    expect(game.phase).toBe("lobby");
    expect(game.players).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────
describe("Chain Reaction — announcement sanitization", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [makeSession({ id: "host1", name: "Host" })]);
    tx.seed("chain_reaction_games", [
      makeChainReactionGame({ id: "game1", host_id: "host1" }),
    ]);
  });

  it("sanitizes HTML from announcements", async () => {
    await mutators.announce({
      args: { gameId: "game1", hostId: "host1", text: '<div onmouseover="hack()">News</div>' },
      tx,
      ctx: serverCtx("host1"),
    });
    const game = tx.getById("chain_reaction_games", "game1") as any;
    expect(game.announcement.text).not.toContain("<div");
    expect(game.announcement.text).toContain("News");
  });

  it("blocks non-host from announcing", async () => {
    tx.seed("chain_reaction_games", [
      makeChainReactionGame({
        id: "game2",
        host_id: "host1",
        players: [
          { sessionId: "host1", name: "Host", connected: true },
          { sessionId: "p1", name: "Alice", connected: true },
        ],
      }),
    ]);
    tx.seed("sessions", [makeSession({ id: "p1", name: "Alice" })]);
    await expectThrows(
      () => mutators.announce({ args: { gameId: "game2", hostId: "p1", text: "hacked" }, tx, ctx: serverCtx("p1") }),
      "Only host can announce"
    );
  });
});

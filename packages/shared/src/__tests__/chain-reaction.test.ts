/**
 * Chain Reaction game: mutator integration tests.
 *
 * Tests lobby, identity enforcement, and sanitization.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import {
  MockTx,
  serverCtx,
  makeSession,
  makeChainReactionGame,
  expectThrows,
  openForTest,
} from "./test-helpers";

import { chainReactionMutators } from "../zero/mutators/chain-reaction";
type Handler = (params: { args: any; tx: any; ctx: any }) => Promise<void>;
const mutators = chainReactionMutators as unknown as Record<string, Handler>;

// ───────────────────────────────────────────────────────────
describe("Chain Reaction: lobby phase", () => {
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
describe("Chain Reaction: identity enforcement", () => {
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
describe("Chain Reaction: host leaving", () => {
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
describe("Chain Reaction: announcement sanitization", () => {
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

// ───────────────────────────────────────────────────────────
describe("Chain Reaction: hidden words stay on the server", () => {
  let tx: MockTx;
  const players = [
    { sessionId: "host1", name: "Host", connected: true },
    { sessionId: "p1", name: "Alice", connected: true },
  ];
  const game = () => tx.getById("chain_reaction_games", "game1") as any;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [makeSession({ id: "host1", name: "Host" }), makeSession({ id: "p1", name: "Alice" })]);
    tx.seed("chain_reaction_games", [makeChainReactionGame({ id: "game1", host_id: "host1", players })]);
  });

  it("syncs a mask, hints letters, and checks guesses against the sealed word", async () => {
    await mutators.start({ args: { gameId: "game1", hostId: "host1" }, tx, ctx: serverCtx("host1") });
    const slot = game().chain.p1[1];
    expect(slot.word).toMatch(/^_+$/);
    expect(slot.secret).toMatch(/^enc:/);
    const word = await openForTest("chain_reaction", "game1", slot.secret);
    expect(slot.word).toHaveLength(word.length);

    await mutators.guess({ args: { gameId: "game1", sessionId: "p1", wordIndex: 1, guess: "QQQQ" }, tx, ctx: serverCtx("p1") });
    expect(game().chain.p1[1]).toMatchObject({ revealed: false, lettersShown: 1, word: word[0] + "_".repeat(word.length - 1) });

    await mutators.guess({ args: { gameId: "game1", sessionId: "p1", wordIndex: 1, guess: word }, tx, ctx: serverCtx("p1") });
    expect(game().chain.p1[1]).toMatchObject({ revealed: true, word, secret: null, solvedBy: "p1" });
  });

  it("can't judge a guess on the client, which has no key", async () => {
    await mutators.start({ args: { gameId: "game1", hostId: "host1" }, tx, ctx: serverCtx("host1") });
    const client = new MockTx("client");
    client.seed("chain_reaction_games", [game()]);
    await mutators.guess({ args: { gameId: "game1", sessionId: "p1", wordIndex: 1, guess: "ANYTHING" }, tx: client, ctx: {} });
    expect(client._mutations).toEqual([]);
  });

  it("seals custom chains and deals each player the other's words", async () => {
    tx.seed("chain_reaction_games", [makeChainReactionGame({
      id: "game1", host_id: "host1", players, phase: "submitting",
      settings: { chainLength: 4, rounds: 1, currentRound: 1, turnTimeSec: null, phaseEndsAt: null, chainMode: "custom" },
    })]);
    await mutators.submitChain({ args: { gameId: "game1", sessionId: "host1", words: ["sun", "flower", "pot", "hole"] }, tx, ctx: serverCtx("host1") });
    expect(game().submitted_chains.host1.every((w: string) => w.startsWith("enc:"))).toBe(true);

    await mutators.submitChain({ args: { gameId: "game1", sessionId: "p1", words: ["ice", "cream", "cone", "head"] }, tx, ctx: serverCtx("p1") });
    expect(game().phase).toBe("playing");
    const mine = game().chain.p1;
    expect(mine.map((s: any) => s.word)).toEqual(["SUN", "______", "___", "HOLE"]);
    expect(await openForTest("chain_reaction", "game1", mine[1].secret)).toBe("FLOWER");
  });

  it("ends the round when the clock runs out, revealing the hidden words for 0 points", async () => {
    tx.seed("chain_reaction_games", [makeChainReactionGame({
      id: "game1", host_id: "host1", players,
      settings: { chainLength: 5, rounds: 2, currentRound: 1, turnTimeSec: 60, phaseEndsAt: null, chainMode: "premade", category: "animals" },
    })]);
    await mutators.start({ args: { gameId: "game1", hostId: "host1" }, tx, ctx: serverCtx("host1") });
    const hidden = await openForTest("chain_reaction", "game1", game().chain.p1[1].secret);

    // Not yet expired: nothing happens.
    await mutators.advanceTimer({ args: { gameId: "game1" }, tx, ctx: serverCtx("p1") });
    expect(game().settings.currentRound).toBe(1);

    tx.seed("chain_reaction_games", [{ ...game(), settings: { ...game().settings, phaseEndsAt: 1 } }]);
    // The client can't open sealed words, so it leaves the reveal to the server.
    const client = new MockTx("client");
    client.seed("chain_reaction_games", [game()]);
    await mutators.advanceTimer({ args: { gameId: "game1" }, tx: client, ctx: {} });
    expect(client._mutations).toEqual([]);

    await mutators.advanceTimer({ args: { gameId: "game1" }, tx, ctx: serverCtx("p1") });
    const g = game();
    expect(g.round_history).toHaveLength(1);
    expect(g.round_history[0].chains.p1[1]).toEqual({ word: hidden, solvedBy: null, lettersShown: hidden.length });
    expect(g.scores).toEqual({ host1: 0, p1: 0 });
    expect(g.settings.currentRound).toBe(2);
    expect(g.settings.phaseEndsAt).toBeGreaterThan(Date.now());
    expect(g.announcement.text).toBe("Time's up! Round 2 starting!");
  });
});

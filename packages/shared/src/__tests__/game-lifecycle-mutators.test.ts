import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MockTx,
  serverCtx,
  makeSession,
  makeImposterGame,
  makePasswordGame,
  makeChainReactionGame,
  makeShadeSignalGame,
  makeLocationSignalGame,
  expectThrows,
} from "./test-helpers";

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

const [
  { imposterMutators },
  { passwordMutators },
  { chainReactionMutators },
  { shadeSignalMutators },
  { locationSignalMutators },
] = await Promise.all([
  import("../zero/mutators/imposter"),
  import("../zero/mutators/password"),
  import("../zero/mutators/chain-reaction"),
  import("../zero/mutators/shade-signal"),
  import("../zero/mutators/location-signal"),
]);

type Handler = (params: { args: any; tx: any; ctx: any }) => Promise<void>;
type GameType = "imposter" | "password" | "chain_reaction" | "shade_signal" | "location_signal";
type Spec = {
  label: string;
  gameType: GameType;
  table: string;
  mutators: Record<string, Handler>;
  makeGame: (overrides: any) => Record<string, unknown>;
  activePhase: string;
  endedPhases: string[];
  withPlayer: () => Record<string, unknown>;
  hasPlayer: (game: any, sessionId: string) => boolean;
  playerCount: (game: any, sessionId: string) => number;
};

const specs: Spec[] = [
  {
    label: "Imposter",
    gameType: "imposter",
    table: "imposter_games",
    mutators: imposterMutators as unknown as Record<string, Handler>,
    makeGame: makeImposterGame,
    activePhase: "playing",
    endedPhases: ["finished", "ended"],
    withPlayer: () => ({
      players: [
        { sessionId: "host1", name: "Host", connected: true, role: "player", eliminated: false },
        { sessionId: "p1", name: "Alice", connected: true, role: "imposter", eliminated: false },
        { sessionId: "p2", name: "Bob", connected: true, role: "player", eliminated: false },
      ],
    }),
    hasPlayer: (game, sessionId) => game.players.some((p: any) => p.sessionId === sessionId),
    playerCount: (game, sessionId) => game.players.filter((p: any) => p.sessionId === sessionId).length,
  },
  {
    label: "Password",
    gameType: "password",
    table: "password_games",
    mutators: passwordMutators as unknown as Record<string, Handler>,
    makeGame: makePasswordGame,
    activePhase: "playing",
    endedPhases: ["results", "ended"],
    withPlayer: () => ({
      teams: [
        { name: "Team A", members: ["host1", "p1"] },
        { name: "Team B", members: ["p2", "p3"] },
      ],
    }),
    hasPlayer: (game, sessionId) => game.teams.some((t: any) => t.members.includes(sessionId)),
    playerCount: (game, sessionId) => game.teams.reduce((total: number, t: any) => total + t.members.filter((id: string) => id === sessionId).length, 0),
  },
  {
    label: "Chain Reaction",
    gameType: "chain_reaction",
    table: "chain_reaction_games",
    mutators: chainReactionMutators as unknown as Record<string, Handler>,
    makeGame: makeChainReactionGame,
    activePhase: "playing",
    endedPhases: ["finished", "ended"],
    withPlayer: () => ({
      players: [
        { sessionId: "host1", name: "Host", connected: true },
        { sessionId: "p1", name: "Alice", connected: true },
      ],
    }),
    hasPlayer: (game, sessionId) => game.players.some((p: any) => p.sessionId === sessionId),
    playerCount: (game, sessionId) => game.players.filter((p: any) => p.sessionId === sessionId).length,
  },
  {
    label: "Shade Signal",
    gameType: "shade_signal",
    table: "shade_signal_games",
    mutators: shadeSignalMutators as unknown as Record<string, Handler>,
    makeGame: makeShadeSignalGame,
    activePhase: "clue1",
    endedPhases: ["finished", "ended"],
    withPlayer: () => ({
      players: [
        { sessionId: "host1", name: "Host", connected: true, totalScore: 0 },
        { sessionId: "p1", name: "Alice", connected: true, totalScore: 0 },
        { sessionId: "p2", name: "Bob", connected: true, totalScore: 0 },
      ],
    }),
    hasPlayer: (game, sessionId) => game.players.some((p: any) => p.sessionId === sessionId),
    playerCount: (game, sessionId) => game.players.filter((p: any) => p.sessionId === sessionId).length,
  },
  {
    label: "Location Signal",
    gameType: "location_signal",
    table: "location_signal_games",
    mutators: locationSignalMutators as unknown as Record<string, Handler>,
    makeGame: makeLocationSignalGame,
    activePhase: "clue1",
    endedPhases: ["finished", "ended"],
    withPlayer: () => ({
      players: [
        { sessionId: "host1", name: "Host", connected: true, totalScore: 0 },
        { sessionId: "p1", name: "Alice", connected: true, totalScore: 0 },
      ],
    }),
    hasPlayer: (game, sessionId) => game.players.some((p: any) => p.sessionId === sessionId),
    playerCount: (game, sessionId) => game.players.filter((p: any) => p.sessionId === sessionId).length,
  },
];

function seedSessions(tx: MockTx, extra: Record<string, unknown> = {}) {
  tx.seed("sessions", [
    makeSession({ id: "host1", name: "Host", ...extra }),
    makeSession({ id: "p1", name: "Alice", ...extra }),
    makeSession({ id: "p2", name: "Bob", ...extra }),
    makeSession({ id: "p3", name: "Charlie", ...extra }),
    makeSession({ id: "late", name: "Late", ...extra }),
  ]);
}

describe("multiplayer lifecycle mutators - joining and leaving", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    seedSessions(tx);
  });

  for (const spec of specs) {
    it(`${spec.label}: lobby join adds the player exactly once and attaches the session`, async () => {
      tx.seed(spec.table, [spec.makeGame({ id: "game1", host_id: "host1" })]);

      await spec.mutators.join({ args: { gameId: "game1", sessionId: "p1" }, tx, ctx: serverCtx("p1") });
      await spec.mutators.join({ args: { gameId: "game1", sessionId: "p1" }, tx, ctx: serverCtx("p1") });

      const game = tx.getById(spec.table, "game1") as any;
      const session = tx.getById("sessions", "p1") as any;

      expect(spec.hasPlayer(game, "p1")).toBe(true);
      expect(spec.playerCount(game, "p1")).toBe(1);
      expect(session.game_type).toBe(spec.gameType);
      expect(session.game_id).toBe("game1");
    });

    it(`${spec.label}: active-game join makes new visitors spectators and reconnects existing players`, async () => {
      tx.seed(spec.table, [
        spec.makeGame({ id: "game1", host_id: "host1", phase: spec.activePhase, ...spec.withPlayer() }),
      ]);

      await spec.mutators.join({ args: { gameId: "game1", sessionId: "late" }, tx, ctx: serverCtx("late") });
      await spec.mutators.join({ args: { gameId: "game1", sessionId: "p1" }, tx, ctx: serverCtx("p1") });

      const game = tx.getById(spec.table, "game1") as any;
      const lateSession = tx.getById("sessions", "late") as any;

      expect(game.spectators.some((s: any) => s.sessionId === "late")).toBe(true);
      expect(spec.hasPlayer(game, "late")).toBe(false);
      expect(spec.hasPlayer(game, "p1")).toBe(true);
      expect(lateSession.game_type).toBe(spec.gameType);
      expect(lateSession.game_id).toBe("game1");
    });

    for (const phase of spec.endedPhases) {
      it(`${spec.label}: join rejects ${phase} games`, async () => {
        tx.seed(spec.table, [
          spec.makeGame({ id: "game1", host_id: "host1", phase, ...spec.withPlayer() }),
        ]);

        await expectThrows(
          () => spec.mutators.join({ args: { gameId: "game1", sessionId: "late" }, tx, ctx: serverCtx("late") }),
          "ended"
        );
      });
    }

    it(`${spec.label}: a delayed leave from an old room cannot clear a newer join`, async () => {
      const newerType: GameType = spec.gameType === "imposter" ? "password" : "imposter";
      tx.seed("sessions", [
        makeSession({ id: "p1", name: "Alice", game_type: newerType, game_id: "new-game" }),
      ]);
      tx.seed(spec.table, [
        spec.makeGame({ id: "old-game", host_id: "host1", phase: "lobby", ...spec.withPlayer() }),
      ]);

      await spec.mutators.leave({ args: { gameId: "old-game", sessionId: "p1" }, tx, ctx: serverCtx("p1") });

      const session = tx.getById("sessions", "p1") as any;
      expect(session.game_type).toBe(newerType);
      expect(session.game_id).toBe("new-game");
    });

    it(`${spec.label}: host end clears every session still attached to that room`, async () => {
      tx.seed("sessions", [
        makeSession({ id: "host1", name: "Host", game_type: spec.gameType, game_id: "game1" }),
        makeSession({ id: "p1", name: "Alice", game_type: spec.gameType, game_id: "game1" }),
        makeSession({ id: "late", name: "Late", game_type: "imposter", game_id: "other-game" }),
      ]);
      tx.seed(spec.table, [
        spec.makeGame({ id: "game1", host_id: "host1", phase: spec.activePhase, ...spec.withPlayer() }),
      ]);

      await spec.mutators.endGame({ args: { gameId: "game1", hostId: "host1" }, tx, ctx: serverCtx("host1") });

      const host = tx.getById("sessions", "host1") as any;
      const player = tx.getById("sessions", "p1") as any;
      const other = tx.getById("sessions", "late") as any;
      const game = tx.getById(spec.table, "game1") as any;

      expect(game.phase).toBe("ended");
      expect(host.game_type).toBeNull();
      expect(host.game_id).toBeNull();
      expect(player.game_type).toBeNull();
      expect(player.game_id).toBeNull();
      expect(other.game_type).toBe("imposter");
      expect(other.game_id).toBe("other-game");
    });
  }
});

describe("multiplayer lifecycle mutators - phase completion paths", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    seedSessions(tx);
  });

  it("Imposter: all clues and votes finish the round through the host-controlled next round path", async () => {
    const mutators = imposterMutators as unknown as Record<string, Handler>;
    tx.seed("imposter_games", [
      makeImposterGame({
        id: "game1",
        host_id: "host1",
        phase: "playing",
        secret_word: "banana",
        players: [
          { sessionId: "host1", name: "Host", connected: true, role: "player", eliminated: false },
          { sessionId: "p1", name: "Alice", connected: true, role: "imposter", eliminated: false },
          { sessionId: "p2", name: "Bob", connected: true, role: "player", eliminated: false },
        ],
        settings: {
          rounds: 3,
          imposters: 1,
          currentRound: 1,
          roundDurationSec: 75,
          votingDurationSec: 45,
          phaseEndsAt: Date.now() + 75_000,
        },
      }),
    ]);

    await mutators.submitClue({ args: { gameId: "game1", sessionId: "host1", text: "fruit" }, tx, ctx: serverCtx("host1") });
    await mutators.submitClue({ args: { gameId: "game1", sessionId: "p1", text: "yellow" }, tx, ctx: serverCtx("p1") });
    await mutators.submitClue({ args: { gameId: "game1", sessionId: "p2", text: "snack" }, tx, ctx: serverCtx("p2") });
    expect((tx.getById("imposter_games", "game1") as any).phase).toBe("voting");

    await mutators.submitVote({ args: { gameId: "game1", voterId: "host1", targetId: "p1" }, tx, ctx: serverCtx("host1") });
    await mutators.submitVote({ args: { gameId: "game1", voterId: "p1", targetId: "p2" }, tx, ctx: serverCtx("p1") });
    await mutators.submitVote({ args: { gameId: "game1", voterId: "p2", targetId: "p1" }, tx, ctx: serverCtx("p2") });
    expect((tx.getById("imposter_games", "game1") as any).phase).toBe("results");

    await mutators.nextRound({ args: { gameId: "game1", hostId: "host1" }, tx, ctx: serverCtx("host1") });
    const game = tx.getById("imposter_games", "game1") as any;
    expect(game.phase).toBe("finished");
    expect(game.round_history).toHaveLength(1);
  });

  it("Password: a complete clue and guess cycle records history and ends at target score", async () => {
    const mutators = passwordMutators as unknown as Record<string, Handler>;
    tx.seed("password_games", [
      makePasswordGame({
        id: "game1",
        host_id: "host1",
        teams: [
          { name: "Team A", members: ["host1", "p1"] },
          { name: "Team B", members: ["p2", "p3"] },
        ],
        settings: { targetScore: 1, roundDurationSec: 120, roundEndsAt: null, category: "animals" },
      }),
    ]);

    await mutators.start({ args: { gameId: "game1", hostId: "host1" }, tx, ctx: serverCtx("host1") });
    let game = tx.getById("password_games", "game1") as any;
    const teamARound = game.active_rounds.find((round: any) => round.teamIndex === 0);

    await mutators.submitClue({ args: { gameId: "game1", sessionId: "p1", clue: "animal" }, tx, ctx: serverCtx("p1") });
    await mutators.submitGuess({ args: { gameId: "game1", sessionId: teamARound.guesserId, guess: teamARound.word }, tx, ctx: serverCtx(teamARound.guesserId) });

    game = tx.getById("password_games", "game1") as any;
    expect(game.phase).toBe("results");
    expect(game.rounds).toHaveLength(1);
    expect(game.active_rounds).toHaveLength(0);
  });

  it("Chain Reaction: giving up the last hidden words completes and finishes the final round", async () => {
    const mutators = chainReactionMutators as unknown as Record<string, Handler>;
    tx.seed("chain_reaction_games", [
      makeChainReactionGame({
        id: "game1",
        host_id: "host1",
        phase: "playing",
        players: [
          { sessionId: "host1", name: "Host", connected: true },
          { sessionId: "p1", name: "Alice", connected: true },
        ],
        chain: {
          host1: [
            { word: "sun", revealed: true, lettersShown: 0, solvedBy: null },
            { word: "moon", revealed: false, lettersShown: 0, solvedBy: null },
          ],
          p1: [
            { word: "cat", revealed: true, lettersShown: 0, solvedBy: null },
            { word: "dog", revealed: false, lettersShown: 0, solvedBy: null },
          ],
        },
        scores: { host1: 0, p1: 0 },
        settings: {
          chainLength: 2,
          rounds: 1,
          currentRound: 1,
          turnTimeSec: null,
          phaseEndsAt: null,
          chainMode: "premade",
        },
      }),
    ]);

    await mutators.giveUp({ args: { gameId: "game1", sessionId: "host1", wordIndex: 1 }, tx, ctx: serverCtx("host1") });
    await mutators.giveUp({ args: { gameId: "game1", sessionId: "p1", wordIndex: 1 }, tx, ctx: serverCtx("p1") });

    const game = tx.getById("chain_reaction_games", "game1") as any;
    expect(game.phase).toBe("finished");
    expect(game.round_history).toHaveLength(1);
  });

  it("Shade Signal: expired clue and guess phases advance, reveal scores, and nextRound finishes after all leaders", async () => {
    const mutators = shadeSignalMutators as unknown as Record<string, Handler>;
    tx.seed("shade_signal_games", [
      makeShadeSignalGame({
        id: "game1",
        host_id: "host1",
        phase: "clue1",
        players: [
          { sessionId: "host1", name: "Host", connected: true, totalScore: 0 },
          { sessionId: "p1", name: "Alice", connected: true, totalScore: 0 },
          { sessionId: "p2", name: "Bob", connected: true, totalScore: 0 },
        ],
        leader_id: "host1",
        leader_order: ["host1"],
        target_row: 1,
        target_col: 1,
        settings: {
          hardMode: false,
          clueDurationSec: 1,
          guessDurationSec: 1,
          roundsPerPlayer: 1,
          currentRound: 1,
          phaseEndsAt: 1,
        },
      }),
    ]);

    await mutators.advanceTimer({ args: { gameId: "game1" }, tx, ctx: serverCtx("host1") });
    expect((tx.getById("shade_signal_games", "game1") as any).phase).toBe("guess1");
    (tx.getById("shade_signal_games", "game1") as any).settings.phaseEndsAt = 1;
    await mutators.advanceTimer({ args: { gameId: "game1" }, tx, ctx: serverCtx("host1") });
    expect((tx.getById("shade_signal_games", "game1") as any).phase).toBe("clue2");
    (tx.getById("shade_signal_games", "game1") as any).settings.phaseEndsAt = 1;
    await mutators.advanceTimer({ args: { gameId: "game1" }, tx, ctx: serverCtx("host1") });
    expect((tx.getById("shade_signal_games", "game1") as any).phase).toBe("guess2");
    (tx.getById("shade_signal_games", "game1") as any).settings.phaseEndsAt = 1;
    await mutators.advanceTimer({ args: { gameId: "game1" }, tx, ctx: serverCtx("host1") });
    expect((tx.getById("shade_signal_games", "game1") as any).phase).toBe("reveal");

    await mutators.reveal({ args: { gameId: "game1" }, tx, ctx: serverCtx("host1") });
    await mutators.nextRound({ args: { gameId: "game1", hostId: "host1" }, tx, ctx: serverCtx("host1") });
    expect((tx.getById("shade_signal_games", "game1") as any).phase).toBe("finished");
  });

  it("Location Signal: target, clue, perfect guess, and nextRound complete the game", async () => {
    const mutators = locationSignalMutators as unknown as Record<string, Handler>;
    tx.seed("location_signal_games", [
      makeLocationSignalGame({
        id: "game1",
        host_id: "host1",
        players: [
          { sessionId: "host1", name: "Host", connected: true, totalScore: 0 },
          { sessionId: "p1", name: "Alice", connected: true, totalScore: 0 },
        ],
        settings: {
          clueDurationSec: 1,
          guessDurationSec: 1,
          roundsPerPlayer: 1,
          currentRound: 1,
          phaseEndsAt: null,
          cluePairs: 2,
        },
      }),
    ]);

    await mutators.start({ args: { gameId: "game1", hostId: "host1" }, tx, ctx: serverCtx("host1") });
    const started = tx.getById("location_signal_games", "game1") as any;
    const leaderId = started.leader_id;
    const guesserId = leaderId === "host1" ? "p1" : "host1";

    await mutators.setTarget({ args: { gameId: "game1", sessionId: leaderId, lat: 10, lng: 20 }, tx, ctx: serverCtx(leaderId) });
    await mutators.submitClue({ args: { gameId: "game1", sessionId: leaderId, round: 1, text: "nearby" }, tx, ctx: serverCtx(leaderId) });
    await mutators.submitGuess({ args: { gameId: "game1", sessionId: guesserId, round: 1, lat: 10, lng: 20 }, tx, ctx: serverCtx(guesserId) });

    let game = tx.getById("location_signal_games", "game1") as any;
    expect(game.phase).toBe("reveal");
    expect(game.round_history).toHaveLength(1);

    await mutators.nextRound({ args: { gameId: "game1", hostId: "host1" }, tx, ctx: serverCtx("host1") });
    game = tx.getById("location_signal_games", "game1") as any;
    expect(game.phase).toBe("picking");

    game.settings.currentRound = 2;
    await mutators.nextRound({ args: { gameId: "game1", hostId: "host1" }, tx, ctx: serverCtx("host1") });
    expect((tx.getById("location_signal_games", "game1") as any).phase).toBe("finished");
  });
});

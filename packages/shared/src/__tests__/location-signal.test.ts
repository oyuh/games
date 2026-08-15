/**
 * Location Signal game: mutator integration tests.
 *
 * Tests lobby, identity enforcement, and sanitization.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MockTx,
  serverCtx,
  makeSession,
  makeLocationSignalGame,
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

const { locationSignalMutators, haversineKm, scoreForDistance } = await import("../zero/mutators/location-signal");
type Handler = (params: { args: any; tx: any; ctx: any }) => Promise<void>;
const mutators = locationSignalMutators as unknown as Record<string, Handler>;

// ───────────────────────────────────────────────────────────
describe("Location Signal: lobby phase", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [
      makeSession({ id: "host1", name: "Host" }),
      makeSession({ id: "p1", name: "Alice" }),
    ]);
  });

  it("creates a game", async () => {
    await mutators.create({ args: { id: "game1", hostId: "host1" }, tx, ctx: serverCtx("host1") });
    const game = tx.getById("location_signal_games", "game1") as any;
    expect(game).toBeDefined();
    expect(game.phase).toBe("lobby");
    expect(game.host_id).toBe("host1");
  });

  it("player can join lobby", async () => {
    tx.seed("location_signal_games", [makeLocationSignalGame({ id: "game1", host_id: "host1" })]);
    await mutators.join({ args: { gameId: "game1", sessionId: "p1" }, tx, ctx: serverCtx("p1") });
    const game = tx.getById("location_signal_games", "game1") as any;
    expect(game.players.length).toBeGreaterThan(1);
  });

  it("kicked player cannot rejoin", async () => {
    tx.seed("location_signal_games", [
      makeLocationSignalGame({ id: "game1", host_id: "host1", kicked: ["p1"] }),
    ]);
    await expectThrows(
      () => mutators.join({ args: { gameId: "game1", sessionId: "p1" }, tx, ctx: serverCtx("p1") }),
      "kicked"
    );
  });
});

// ───────────────────────────────────────────────────────────
describe("Location Signal: identity enforcement", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [
      makeSession({ id: "host1", name: "Host" }),
      makeSession({ id: "p1", name: "Alice" }),
      makeSession({ id: "attacker", name: "Hacker" }),
    ]);
    tx.seed("location_signal_games", [
      makeLocationSignalGame({
        id: "game1",
        host_id: "host1",
        players: [
          { sessionId: "host1", name: "Host", connected: true, totalScore: 0 },
          { sessionId: "p1", name: "Alice", connected: true, totalScore: 0 },
          { sessionId: "attacker", name: "Hacker", connected: true, totalScore: 0 },
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
    const game = tx.getById("location_signal_games", "game1") as any;
    expect(game.kicked).toContain("attacker");
  });
});

// ───────────────────────────────────────────────────────────
describe("Location Signal: host leaving", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [
      makeSession({ id: "host1", name: "Host", game_type: "location_signal", game_id: "game1" }),
      makeSession({ id: "p1", name: "Alice", game_type: "location_signal", game_id: "game1" }),
    ]);
    tx.seed("location_signal_games", [
      makeLocationSignalGame({
        id: "game1",
        host_id: "host1",
        players: [
          { sessionId: "host1", name: "Host", connected: true, totalScore: 0 },
          { sessionId: "p1", name: "Alice", connected: true, totalScore: 0 },
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
    const game = tx.getById("location_signal_games", "game1") as any;
    expect(game.phase).toBe("ended");
  });
});

// ───────────────────────────────────────────────────────────
describe("Location Signal: announcement sanitization", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [makeSession({ id: "host1", name: "Host" })]);
    tx.seed("location_signal_games", [
      makeLocationSignalGame({ id: "game1", host_id: "host1" }),
    ]);
  });

  it("sanitizes HTML from announcements", async () => {
    await mutators.announce({
      args: { gameId: "game1", hostId: "host1", text: '<script>steal()</script>Important!' },
      tx,
      ctx: serverCtx("host1"),
    });
    const game = tx.getById("location_signal_games", "game1") as any;
    expect(game.announcement.text).not.toContain("<script>");
    expect(game.announcement.text).toContain("Important!");
  });
});

// ───────────────────────────────────────────────────────────
describe("Location Signal: clue submission sanitization", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [makeSession({ id: "leader1", name: "Leader" })]);
    tx.seed("location_signal_games", [
      makeLocationSignalGame({
        id: "game1",
        host_id: "leader1",
        phase: "clue1",
        leader_id: "leader1",
        target_lat: 48.8566,
        target_lng: 2.3522,
        players: [
          { sessionId: "leader1", name: "Leader", connected: true, totalScore: 0 },
          { sessionId: "p1", name: "Alice", connected: true, totalScore: 0 },
        ],
      }),
    ]);
  });

  it("rejects empty clue after sanitization", async () => {
    await expectThrows(
      () => mutators.submitClue({
        args: { gameId: "game1", sessionId: "leader1", text: "  <b></b>  " },
        tx,
        ctx: serverCtx("leader1"),
      }),
      "empty"
    );
  });
});

// ───────────────────────────────────────────────────────────
/**
 * A whole game, played through in the order the page actually fires the
 * mutators, with the state each screen depends on asserted as it goes.
 *
 * The screens were rebuilt against fake data on /dev/location, which proves the
 * components render and nothing at all about the wiring. This is the wiring:
 * the merged pick-and-clue press that sends setTarget and submitClue back to
 * back, the guess that can still be moved after it is locked, the scoring the
 * reveal works back out of the distance, and the round history the end screen
 * folds down.
 */
describe("Location Signal: a whole game", () => {
  let tx: MockTx;

  const host = "host1";
  const gameId = "game1";
  const game = () => tx.getById("location_signal_games", gameId) as any;
  const notLeader = () => {
    const leader = game().leader_id as string;
    return game().players.map((p: any) => p.sessionId).filter((id: string) => id !== leader);
  };

  /* The host only fires advanceTimer once the clock has actually run out, so
     the mutator refuses to move a phase that is still live. Winding the end
     time back is how the page's own timer effect gets there. */
  const runOutTheClock = async () => {
    const current = game();
    await tx.mutate.location_signal_games.update({
      id: gameId,
      settings: { ...current.settings, phaseEndsAt: 1 },
      updated_at: Date.now(),
    });
    await mutators.advanceTimer({ args: { gameId }, tx, ctx: serverCtx(host) });
  };

  beforeEach(async () => {
    tx = new MockTx("server");
    tx.seed("sessions", [
      makeSession({ id: host, name: "Host" }),
      makeSession({ id: "p1", name: "Alice" }),
      makeSession({ id: "p2", name: "Bob" }),
    ]);
    await mutators.create({ args: { id: gameId, hostId: host }, tx, ctx: serverCtx(host) });
    for (const id of ["p1", "p2"]) {
      await mutators.join({ args: { gameId, sessionId: id }, tx, ctx: serverCtx(id) });
    }
  });

  it("plays a round from the lobby to the reveal", async () => {
    await mutators.start({ args: { gameId, hostId: host }, tx, ctx: serverCtx(host) });
    expect(game().phase).toBe("picking");
    expect(game().leader_order).toHaveLength(3);

    const leader = game().leader_id as string;
    const others = notLeader();

    // The merged screen: one press, two mutators. Tokyo.
    await mutators.setTarget({
      args: { gameId, sessionId: leader, lat: 35.68, lng: 139.69 },
      tx, ctx: serverCtx(leader),
    });
    expect(game().phase).toBe("clue1");
    expect(game().target_lat).toBeCloseTo(35.68);

    await mutators.submitClue({
      args: { gameId, sessionId: leader, round: 1, text: "where the trains are on time" },
      tx, ctx: serverCtx(leader),
    });
    // Straight past clue1 without anybody sitting on it, which is the whole
    // point of merging the two screens.
    expect(game().phase).toBe("guess1");
    expect(game().clue1).toBe("where the trains are on time");

    await mutators.submitGuess({
      args: { gameId, sessionId: others[0], round: 1, lat: 37.57, lng: 126.98 },
      tx, ctx: serverCtx(others[0]),
    });
    expect(game().guesses).toHaveLength(1);

    // Locking does not freeze the map: the newest guess for the round wins,
    // which is what lets the console offer to move it after you have locked.
    await mutators.submitGuess({
      args: { gameId, sessionId: others[0], round: 1, lat: 35.02, lng: 135.76 },
      tx, ctx: serverCtx(others[0]),
    });
    expect(game().guesses).toHaveLength(1);
    expect(game().guesses[0].lng).toBeCloseTo(135.76);

    await mutators.submitGuess({
      args: { gameId, sessionId: others[1], round: 1, lat: 22.32, lng: 114.17 },
      tx, ctx: serverCtx(others[1]),
    });

    await runOutTheClock();
    expect(game().phase).toBe("clue2");

    await mutators.submitClue({
      args: { gameId, sessionId: leader, round: 2, text: "and the fish market never sleeps" },
      tx, ctx: serverCtx(leader),
    });
    expect(game().phase).toBe("guess2");

    for (const id of others) {
      await mutators.submitGuess({
        args: { gameId, sessionId: id, round: 2, lat: 35.6, lng: 139.5 },
        tx, ctx: serverCtx(id),
      });
    }

    await runOutTheClock();
    expect(game().phase).toBe("reveal");

    // What the reveal screen reads. It works the points back out of the
    // distance rather than being handed them, so the two have to agree.
    const history = game().round_history;
    expect(history).toHaveLength(1);
    expect(history[0].target).toEqual({ lat: 35.68, lng: 139.69 });
    expect(history[0].clue1).toBe("where the trains are on time");
    expect(history[0].clue2).toBe("and the fish market never sleeps");

    for (const id of others) {
      const player = game().players.find((p: any) => p.sessionId === id);
      expect(player.totalScore).toBe(scoreForDistance(haversineKm(35.68, 139.69, 35.6, 139.5)));
    }

    // The leader scores nothing, which the result screen says out loud so a
    // zero does not read as a bug.
    expect(game().players.find((p: any) => p.sessionId === leader).totalScore).toBe(0);
  });

  it("counts only the last guess, and refuses one from the leader", async () => {
    await mutators.start({ args: { gameId, hostId: host }, tx, ctx: serverCtx(host) });
    const leader = game().leader_id as string;
    const other = notLeader()[0];

    await mutators.setTarget({ args: { gameId, sessionId: leader, lat: 0, lng: 0 }, tx, ctx: serverCtx(leader) });
    await mutators.submitClue({ args: { gameId, sessionId: leader, round: 1, text: "middle" }, tx, ctx: serverCtx(leader) });

    await expectThrows(
      () => mutators.submitGuess({ args: { gameId, sessionId: leader, round: 1, lat: 0, lng: 0 }, tx, ctx: serverCtx(leader) }),
      "Leader cannot"
    );

    // Miles out first, spot on at the end. The end screen shows the final pin
    // per player, so the final one has to be the one that scored.
    await mutators.submitGuess({ args: { gameId, sessionId: other, round: 1, lat: 60, lng: 60 }, tx, ctx: serverCtx(other) });
    await runOutTheClock();
    await mutators.submitClue({ args: { gameId, sessionId: leader, round: 2, text: "dead centre" }, tx, ctx: serverCtx(leader) });
    await mutators.submitGuess({ args: { gameId, sessionId: other, round: 2, lat: 0, lng: 0 }, tx, ctx: serverCtx(other) });
    await runOutTheClock();

    expect(game().phase).toBe("reveal");
    expect(game().players.find((p: any) => p.sessionId === other).totalScore).toBe(5000);
  });

  it("runs every round and finishes", async () => {
    await mutators.start({ args: { gameId, hostId: host }, tx, ctx: serverCtx(host) });
    const total = game().leader_order.length * game().settings.roundsPerPlayer;

    for (let round = 1; round <= total; round++) {
      const leader = game().leader_id as string;
      const others = notLeader();

      await mutators.setTarget({ args: { gameId, sessionId: leader, lat: 10, lng: 10 }, tx, ctx: serverCtx(leader) });
      await mutators.submitClue({ args: { gameId, sessionId: leader, round: 1, text: "clue " + round }, tx, ctx: serverCtx(leader) });
      for (const id of others) {
        await mutators.submitGuess({ args: { gameId, sessionId: id, round: 1, lat: 11, lng: 11 }, tx, ctx: serverCtx(id) });
      }
      await runOutTheClock();
      await mutators.submitClue({ args: { gameId, sessionId: leader, round: 2, text: "again " + round }, tx, ctx: serverCtx(leader) });
      for (const id of others) {
        await mutators.submitGuess({ args: { gameId, sessionId: id, round: 2, lat: 10.1, lng: 10.1 }, tx, ctx: serverCtx(id) });
      }
      await runOutTheClock();
      expect(game().phase).toBe("reveal");

      if (round < total) {
        await mutators.nextRound({ args: { gameId, hostId: host }, tx, ctx: serverCtx(host) });
        expect(game().phase).toBe("picking");
        // A fresh round has to hand the next screen a clean slate, or the
        // picking map opens with the last round's pins still on it.
        expect(game().guesses).toHaveLength(0);
        expect(game().clue1).toBeFalsy();
      }
    }

    await mutators.nextRound({ args: { gameId, hostId: host }, tx, ctx: serverCtx(host) });
    expect(game().phase).toBe("finished");

    // What the end screen folds down: one entry per round, each carrying the
    // map it was played on.
    expect(game().round_history).toHaveLength(total);
    for (const entry of game().round_history) {
      expect(entry.target).toBeDefined();
      expect(entry.guesses.length).toBeGreaterThan(0);
    }
  });

  it("resets to a lobby that can be played again", async () => {
    await mutators.start({ args: { gameId, hostId: host }, tx, ctx: serverCtx(host) });
    await mutators.resetToLobby({ args: { gameId, hostId: host }, tx, ctx: serverCtx(host) });

    expect(game().phase).toBe("lobby");
    expect(game().guesses).toHaveLength(0);
    expect(game().round_history).toHaveLength(0);
    expect(game().players.every((p: any) => p.totalScore === 0)).toBe(true);
  });
});

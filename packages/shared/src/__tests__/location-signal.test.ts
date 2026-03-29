/**
 * Location Signal game — mutator integration tests.
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

const { locationSignalMutators } = await import("../zero/mutators/location-signal");
type Handler = (params: { args: any; tx: any; ctx: any }) => Promise<void>;
const mutators = locationSignalMutators as unknown as Record<string, Handler>;

// ───────────────────────────────────────────────────────────
describe("Location Signal — lobby phase", () => {
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
describe("Location Signal — identity enforcement", () => {
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
describe("Location Signal — host leaving", () => {
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
describe("Location Signal — announcement sanitization", () => {
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
describe("Location Signal — clue submission sanitization", () => {
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

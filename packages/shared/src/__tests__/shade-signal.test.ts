/**
 * Shade Signal game — mutator integration tests.
 *
 * Tests game phases (lobby → picking → clue → guess → reveal)
 * and security enforcement.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MockTx,
  serverCtx,
  makeSession,
  makeShadeSignalGame,
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

const { shadeSignalMutators } = await import("../zero/mutators/shade-signal");
type Handler = (params: { args: any; tx: any; ctx: any }) => Promise<void>;
const mutators = shadeSignalMutators as unknown as Record<string, Handler>;

// ───────────────────────────────────────────────────────────
describe("Shade Signal — lobby phase", () => {
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
    const game = tx.getById("shade_signal_games", "game1") as any;
    expect(game).toBeDefined();
    expect(game.phase).toBe("lobby");
    expect(game.host_id).toBe("host1");
  });

  it("player can join lobby", async () => {
    tx.seed("shade_signal_games", [makeShadeSignalGame({ id: "game1", host_id: "host1" })]);
    await mutators.join({ args: { gameId: "game1", sessionId: "p1" }, tx, ctx: serverCtx("p1") });
    const game = tx.getById("shade_signal_games", "game1") as any;
    expect(game.players.length).toBeGreaterThan(1);
  });

  it("kicked player cannot rejoin", async () => {
    tx.seed("shade_signal_games", [
      makeShadeSignalGame({ id: "game1", host_id: "host1", kicked: ["p1"] }),
    ]);
    await expectThrows(
      () => mutators.join({ args: { gameId: "game1", sessionId: "p1" }, tx, ctx: serverCtx("p1") }),
      "kicked"
    );
  });
});

// ───────────────────────────────────────────────────────────
describe("Shade Signal — identity enforcement", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [
      makeSession({ id: "host1", name: "Host" }),
      makeSession({ id: "p1", name: "Alice" }),
      makeSession({ id: "attacker", name: "Hacker" }),
    ]);
    tx.seed("shade_signal_games", [
      makeShadeSignalGame({
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
    const game = tx.getById("shade_signal_games", "game1") as any;
    expect(game.kicked).toContain("attacker");
    expect(game.players.find((p: any) => p.sessionId === "attacker")).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────
describe("Shade Signal — announcement sanitization", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [makeSession({ id: "host1", name: "Host" })]);
    tx.seed("shade_signal_games", [
      makeShadeSignalGame({ id: "game1", host_id: "host1" }),
    ]);
  });

  it("sanitizes HTML from announcements", async () => {
    await mutators.announce({
      args: { gameId: "game1", hostId: "host1", text: '<img src=x onerror=alert(1)>Hello' },
      tx,
      ctx: serverCtx("host1"),
    });
    const game = tx.getById("shade_signal_games", "game1") as any;
    expect(game.announcement.text).not.toContain("<img");
    expect(game.announcement.text).toContain("Hello");
  });
});

// ───────────────────────────────────────────────────────────
describe("Shade Signal — host leaving", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [
      makeSession({ id: "host1", name: "Host", game_type: "shade_signal", game_id: "game1" }),
      makeSession({ id: "p1", name: "Alice", game_type: "shade_signal", game_id: "game1" }),
    ]);
    tx.seed("shade_signal_games", [
      makeShadeSignalGame({
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
    const game = tx.getById("shade_signal_games", "game1") as any;
    expect(game.phase).toBe("ended");
  });
});

// ───────────────────────────────────────────────────────────
describe("Shade Signal — clue submission sanitization", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [makeSession({ id: "leader1", name: "Leader" })]);
    tx.seed("shade_signal_games", [
      makeShadeSignalGame({
        id: "game1",
        host_id: "leader1",
        phase: "clue1",
        leader_id: "leader1",
        target_row: 2,
        target_col: 3,
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
        args: { gameId: "game1", sessionId: "leader1", text: "  <script></script> " },
        tx,
        ctx: serverCtx("leader1"),
      }),
      "empty"
    );
  });
});

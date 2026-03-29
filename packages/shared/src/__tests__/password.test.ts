/**
 * Password game — mutator integration tests.
 *
 * Tests game phases (lobby → playing → results) and
 * security enforcement (identity, sanitization, team rules).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MockTx,
  serverCtx,
  makeSession,
  makePasswordGame,
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

const { passwordMutators } = await import("../zero/mutators/password");
type Handler = (params: { args: any; tx: any; ctx: any }) => Promise<void>;
const mutators = passwordMutators as unknown as Record<string, Handler>;

// ───────────────────────────────────────────────────────────
describe("Password — lobby phase", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [
      makeSession({ id: "host1", name: "Host" }),
      makeSession({ id: "p1", name: "Alice" }),
      makeSession({ id: "p2", name: "Bob" }),
      makeSession({ id: "p3", name: "Charlie" }),
    ]);
  });

  it("creates a game with default 2 teams", async () => {
    await mutators.create({ args: { id: "game1", hostId: "host1" }, tx, ctx: serverCtx("host1") });
    const game = tx.getById("password_games", "game1") as any;
    expect(game).toBeDefined();
    expect(game.phase).toBe("lobby");
    expect(game.teams).toHaveLength(2);
    expect(game.teams[0].members).toContain("host1");
  });

  it("player joins the smallest team", async () => {
    tx.seed("password_games", [makePasswordGame({ id: "game1", host_id: "host1" })]);
    await mutators.join({ args: { gameId: "game1", sessionId: "p1" }, tx, ctx: serverCtx("p1") });
    const game = tx.getById("password_games", "game1") as any;
    // Team B was empty so p1 should join Team B
    expect(game.teams[1].members).toContain("p1");
  });

  it("kicked player cannot rejoin", async () => {
    tx.seed("password_games", [
      makePasswordGame({ id: "game1", host_id: "host1", kicked: ["p1"] }),
    ]);
    await expectThrows(
      () => mutators.join({ args: { gameId: "game1", sessionId: "p1" }, tx, ctx: serverCtx("p1") }),
      "kicked"
    );
  });

  it("cannot join ended game", async () => {
    tx.seed("password_games", [
      makePasswordGame({ id: "game1", host_id: "host1", phase: "ended" }),
    ]);
    await expectThrows(
      () => mutators.join({ args: { gameId: "game1", sessionId: "p1" }, tx, ctx: serverCtx("p1") }),
      "ended"
    );
  });
});

// ───────────────────────────────────────────────────────────
describe("Password — identity enforcement", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [
      makeSession({ id: "host1", name: "Host" }),
      makeSession({ id: "p1", name: "Alice" }),
      makeSession({ id: "attacker", name: "Hacker" }),
    ]);
    tx.seed("password_games", [
      makePasswordGame({
        id: "game1",
        host_id: "host1",
        teams: [
          { name: "Team A", members: ["host1", "p1"] },
          { name: "Team B", members: ["attacker"] },
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

  it("blocks leaving on behalf of another player", async () => {
    await expectThrows(
      () => mutators.leave({ args: { gameId: "game1", sessionId: "p1" }, tx, ctx: serverCtx("attacker") }),
      "Not allowed"
    );
  });

  it("blocks non-host from starting", async () => {
    await expectThrows(
      () => mutators.start({ args: { gameId: "game1", hostId: "attacker" }, tx, ctx: serverCtx("attacker") }),
      "Only host can start"
    );
  });
});

// ───────────────────────────────────────────────────────────
describe("Password — host leaving", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [
      makeSession({ id: "host1", name: "Host", game_type: "password", game_id: "game1" }),
      makeSession({ id: "p1", name: "Alice", game_type: "password", game_id: "game1" }),
    ]);
    tx.seed("password_games", [
      makePasswordGame({
        id: "game1",
        host_id: "host1",
        teams: [
          { name: "Team A", members: ["host1"] },
          { name: "Team B", members: ["p1"] },
        ],
      }),
    ]);
  });

  it("host leaving ends the game", async () => {
    await mutators.leave({ args: { gameId: "game1", sessionId: "host1" }, tx, ctx: serverCtx("host1") });
    const game = tx.getById("password_games", "game1") as any;
    expect(game.phase).toBe("ended");
  });

  it("regular player leaving just removes them from their team", async () => {
    await mutators.leave({ args: { gameId: "game1", sessionId: "p1" }, tx, ctx: serverCtx("p1") });
    const game = tx.getById("password_games", "game1") as any;
    expect(game.phase).toBe("lobby");
    expect(game.teams[1].members).not.toContain("p1");
  });
});

// ───────────────────────────────────────────────────────────
describe("Password — spectator during active game", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [
      makeSession({ id: "late", name: "Late" }),
    ]);
    tx.seed("password_games", [
      makePasswordGame({
        id: "game1",
        host_id: "host1",
        phase: "playing",
        teams: [
          { name: "Team A", members: ["host1", "p1"] },
          { name: "Team B", members: ["p2", "p3"] },
        ],
      }),
    ]);
  });

  it("late joiners become spectators during active game", async () => {
    await mutators.join({ args: { gameId: "game1", sessionId: "late" }, tx, ctx: serverCtx("late") });
    const game = tx.getById("password_games", "game1") as any;
    expect(game.spectators).toHaveLength(1);
    expect(game.spectators[0].sessionId).toBe("late");
  });
});

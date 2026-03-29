/**
 * Mock Zero transaction for testing mutator logic without a real database.
 *
 * Provides an in-memory store that behaves like Zero's `tx` object,
 * tracking inserts, updates, upserts, and deletes so tests can assert
 * on the resulting game state.
 */

type Row = Record<string, unknown>;
type TableStore = Map<string, Row>;

export class MockTx {
  /** "server" or "client" — controls whether assertCaller/assertHost enforce */
  location: string;

  /** In-memory tables keyed by table name → Map<primaryKey, row> */
  private tables = new Map<string, TableStore>();

  /** Recorded mutations for assertion purposes */
  _mutations: Array<{ op: string; table: string; data: Row }> = [];

  /** Build query runners (the `run` method) */
  private queryMap = new Map<string, (filters: Array<{ field: string; value: unknown }>) => Row[]>();

  constructor(location: "server" | "client" = "server") {
    this.location = location;
  }

  // ─── Seed data into tables ──────────────────────────────
  seed(tableName: string, rows: Row[]) {
    const store: TableStore = new Map();
    for (const row of rows) {
      store.set(row["id"] as string, { ...row });
    }
    this.tables.set(tableName, store);
  }

  /** Get all rows in a table */
  getAll(tableName: string): Row[] {
    const store = this.tables.get(tableName);
    return store ? [...store.values()] : [];
  }

  /** Get a single row by id */
  getById(tableName: string, id: string): Row | undefined {
    return this.tables.get(tableName)?.get(id);
  }

  // ─── tx.run() — executes ZQL-like queries ──────────────
  run = (query: unknown): Promise<unknown> => {
    // The query object from zql gets captured here. We intercept it.
    // In practice, mutators call: tx.run(zql.sessions.where("id", x).one())
    // We simulate this by intercepting the proxy chain.
    const q = query as MockQuery;
    if (!q?._table) return Promise.resolve(null);

    const store = this.tables.get(q._table);
    if (!store) {
      return q._single ? Promise.resolve(null) : Promise.resolve([]);
    }

    let rows = [...store.values()];
    for (const filter of q._filters) {
      rows = rows.filter((row) => row[filter.field] === filter.value);
    }

    return q._single ? Promise.resolve(rows[0] ?? null) : Promise.resolve(rows);
  };

  // ─── tx.mutate.<table>.insert/update/upsert/delete ─────
  mutate = new Proxy(
    {},
    {
      get: (_target, tableName: string) => {
        return {
          insert: (data: Row) => {
            this._mutations.push({ op: "insert", table: tableName, data });
            const store = this.tables.get(tableName) ?? new Map();
            store.set(data["id"] as string, { ...data });
            this.tables.set(tableName, store);
            return Promise.resolve();
          },
          update: (data: Row) => {
            this._mutations.push({ op: "update", table: tableName, data });
            const store = this.tables.get(tableName);
            const id = data["id"] as string;
            if (store?.has(id)) {
              const existing = store.get(id)!;
              store.set(id, { ...existing, ...data });
            }
            return Promise.resolve();
          },
          upsert: (data: Row) => {
            this._mutations.push({ op: "upsert", table: tableName, data });
            const store = this.tables.get(tableName) ?? new Map();
            const id = data["id"] as string;
            const existing = store.get(id) ?? {};
            store.set(id, { ...existing, ...data });
            this.tables.set(tableName, store);
            return Promise.resolve();
          },
          delete: (data: { id: string }) => {
            this._mutations.push({ op: "delete", table: tableName, data });
            this.tables.get(tableName)?.delete(data.id);
            return Promise.resolve();
          },
        };
      },
    }
  );
}

// ─── Mock ZQL query builder ───────────────────────────────
// Simulates zql.tableName.where("field", value).one() chains

export interface MockQuery {
  _table: string;
  _filters: Array<{ field: string; value: unknown }>;
  _single: boolean;
  where: (field: string, value: unknown) => MockQuery;
  one: () => MockQuery;
}

function createMockQuery(table: string): MockQuery {
  const q: MockQuery = {
    _table: table,
    _filters: [],
    _single: false,
    where(field: string, value: unknown) {
      q._filters.push({ field, value });
      return q;
    },
    one() {
      q._single = true;
      return q;
    },
  };
  return q;
}

/**
 * A mock `zql` proxy — intercepts `zql.sessions`, `zql.imposter_games`, etc.
 * and returns chainable query builders the MockTx can resolve.
 */
export const mockZql = new Proxy(
  {},
  {
    get: (_target, tableName: string) => createMockQuery(tableName),
  }
);

// ─── Server context helpers ───────────────────────────────

/** Creates a server context where the caller IS the given userId */
export function serverCtx(userId: string) {
  return { userId };
}

/** Creates an anonymous/missing context (no enforcement) */
export function anonCtx() {
  return {};
}

/** Creates a client-side tx (no enforcement happens on client) */
export function clientTx() {
  return new MockTx("client");
}

/** Creates a server-side tx (assertCaller/assertHost will enforce) */
export function serverTx() {
  return new MockTx("server");
}

// ─── Game state factory functions ─────────────────────────

export function makeSession(overrides: Partial<Row> & { id: string }) {
  return {
    name: "Player",
    game_type: null,
    game_id: null,
    created_at: Date.now(),
    last_seen: Date.now(),
    ...overrides,
  };
}

export function makeImposterGame(overrides: Partial<Row> & { id: string; host_id: string }) {
  return {
    code: "ABC123",
    phase: "lobby",
    category: "animals",
    secret_word: null,
    players: [{ sessionId: overrides.host_id, name: "Host", connected: true }],
    clues: [],
    votes: [],
    kicked: [],
    spectators: [],
    round_history: [],
    announcement: null,
    settings: {
      rounds: 3,
      imposters: 1,
      currentRound: 1,
      roundDurationSec: 75,
      votingDurationSec: 45,
      phaseEndsAt: null,
    },
    is_public: false,
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  };
}

export function makePasswordGame(overrides: Partial<Row> & { id: string; host_id: string }) {
  return {
    code: "ABC123",
    phase: "lobby",
    teams: [
      { name: "Team A", members: [overrides.host_id] },
      { name: "Team B", members: [] },
    ],
    rounds: [],
    scores: { "Team A": 0, "Team B": 0 },
    current_round: 0,
    active_rounds: [],
    kicked: [],
    spectators: [],
    announcement: null,
    settings: { targetScore: 10, roundDurationSec: 120, roundEndsAt: null, category: "animals" },
    is_public: false,
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  };
}

export function makeChainReactionGame(overrides: Partial<Row> & { id: string; host_id: string }) {
  return {
    code: "ABC123",
    phase: "lobby",
    players: [{ sessionId: overrides.host_id, name: "Host", connected: true }],
    chain: {},
    submitted_chains: {},
    current_turn: undefined,
    scores: {},
    round_history: [],
    spectators: [],
    kicked: [],
    announcement: null,
    settings: {
      chainLength: 4,
      rounds: 3,
      currentRound: 1,
      turnTimeSec: 30,
      phaseEndsAt: null,
      chainMode: "premade",
    },
    is_public: false,
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  };
}

export function makeShadeSignalGame(overrides: Partial<Row> & { id: string; host_id: string }) {
  return {
    code: "ABC123",
    phase: "lobby",
    players: [{ sessionId: overrides.host_id, name: "Host", connected: true, totalScore: 0 }],
    leader_id: undefined,
    leader_order: [],
    current_leader_index: 0,
    grid_seed: 42,
    grid_rows: 5,
    grid_cols: 5,
    target_row: undefined,
    target_col: undefined,
    encrypted_target: undefined,
    clue1: undefined,
    clue2: undefined,
    guesses: [],
    round_history: [],
    spectators: [],
    kicked: [],
    announcement: null,
    settings: {
      hardMode: false,
      clueDurationSec: 60,
      guessDurationSec: 30,
      roundsPerPlayer: 2,
      currentRound: 1,
      phaseEndsAt: null,
    },
    is_public: false,
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  };
}

export function makeLocationSignalGame(overrides: Partial<Row> & { id: string; host_id: string }) {
  return {
    code: "ABC123",
    phase: "lobby",
    players: [{ sessionId: overrides.host_id, name: "Host", connected: true, totalScore: 0 }],
    leader_id: undefined,
    leader_order: [],
    current_leader_index: 0,
    target_lat: undefined,
    target_lng: undefined,
    encrypted_target: undefined,
    clue1: undefined,
    clue2: undefined,
    clue3: undefined,
    clue4: undefined,
    guesses: [],
    round_history: [],
    spectators: [],
    kicked: [],
    announcement: null,
    settings: {
      clueDurationSec: 60,
      guessDurationSec: 30,
      roundsPerPlayer: 2,
      currentRound: 1,
      phaseEndsAt: null,
      cluePairs: 2,
    },
    is_public: false,
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  };
}

// ─── Assertion helpers ────────────────────────────────────

/** Asserts that a mutator call throws with a matching message */
export async function expectThrows(fn: () => Promise<unknown>, messagePart: string) {
  try {
    await fn();
    throw new Error(`Expected error containing "${messagePart}" but no error was thrown`);
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (!msg.includes(messagePart)) {
      throw new Error(`Expected error containing "${messagePart}" but got "${msg}"`);
    }
  }
}

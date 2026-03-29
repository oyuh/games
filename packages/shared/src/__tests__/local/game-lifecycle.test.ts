/**
 * Local DB — game lifecycle tests.
 *
 * Creates games in the real local database, verifies JSONB columns
 * round-trip correctly, and tests phase transitions.
 */
import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { imposterGames, passwordGames, chainReactionGames, shadeSignalGames, sessions } from "../../drizzle/schema";
import { getDb } from "./setup";

const TEST_PREFIX = "test_local_";
function testId() {
  return `${TEST_PREFIX}${crypto.randomUUID().slice(0, 8)}`;
}
function testCode() {
  return `T${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

// Track everything we create for cleanup
const cleanup: Array<{ table: any; id: string }> = [];

afterEach(async () => {
  const db = getDb();
  for (const { table, id } of cleanup) {
    await db.delete(table).where(eq(table.id, id));
  }
  cleanup.length = 0;
});

// ─── Imposter ───────────────────────────────────────────────
describe("Local DB — imposter game lifecycle", () => {
  it("creates a game and round-trips JSONB players", async () => {
    const db = getDb();
    const id = testId();
    const code = testCode();
    cleanup.push({ table: imposterGames, id });
    const now = Date.now();

    await db.insert(imposterGames).values({
      id,
      code,
      hostId: "host1",
      phase: "lobby",
      players: [
        { sessionId: "host1", name: "Host", connected: true },
        { sessionId: "p1", name: "Alice", connected: true },
      ],
      createdAt: now,
      updatedAt: now,
    });

    const [row] = await db.select().from(imposterGames).where(eq(imposterGames.id, id));
    expect(row).toBeDefined();
    expect(row!.players).toHaveLength(2);
    expect(row!.players[0]!.sessionId).toBe("host1");
    expect(row!.phase).toBe("lobby");
    expect(row!.code).toBe(code);
  });

  it("transitions phase from lobby to playing", async () => {
    const db = getDb();
    const id = testId();
    const code = testCode();
    cleanup.push({ table: imposterGames, id });
    const now = Date.now();

    await db.insert(imposterGames).values({
      id,
      code,
      hostId: "host1",
      phase: "lobby",
      players: [
        { sessionId: "host1", name: "Host", connected: true, role: "player" },
        { sessionId: "p1", name: "Alice", connected: true, role: "player" },
        { sessionId: "p2", name: "Bob", connected: true, role: "imposter" },
      ],
      secretWord: "banana",
      createdAt: now,
      updatedAt: now,
    });

    await db
      .update(imposterGames)
      .set({ phase: "playing", updatedAt: Date.now() })
      .where(eq(imposterGames.id, id));

    const [row] = await db.select().from(imposterGames).where(eq(imposterGames.id, id));
    expect(row!.phase).toBe("playing");
    expect(row!.secretWord).toBe("banana");
  });

  it("stores and retrieves clues and votes JSONB", async () => {
    const db = getDb();
    const id = testId();
    const code = testCode();
    cleanup.push({ table: imposterGames, id });
    const now = Date.now();

    await db.insert(imposterGames).values({
      id,
      code,
      hostId: "host1",
      phase: "playing",
      players: [{ sessionId: "host1", name: "Host", connected: true }],
      clues: [{ sessionId: "host1", text: "yellow fruit", createdAt: now }],
      votes: [{ voterId: "host1", targetId: "p2" }],
      createdAt: now,
      updatedAt: now,
    });

    const [row] = await db.select().from(imposterGames).where(eq(imposterGames.id, id));
    expect(row!.clues[0]!.text).toBe("yellow fruit");
    expect(row!.votes[0]!.targetId).toBe("p2");
  });
});

// ─── Password ───────────────────────────────────────────────
describe("Local DB — password game lifecycle", () => {
  it("creates a game with teams JSONB", async () => {
    const db = getDb();
    const id = testId();
    const code = testCode();
    cleanup.push({ table: passwordGames, id });
    const now = Date.now();

    await db.insert(passwordGames).values({
      id,
      code,
      hostId: "host1",
      phase: "lobby",
      teams: [
        { name: "Red", members: ["host1", "p1"] },
        { name: "Blue", members: ["p2", "p3"] },
      ],
      createdAt: now,
      updatedAt: now,
    });

    const [row] = await db.select().from(passwordGames).where(eq(passwordGames.id, id));
    expect(row!.teams).toHaveLength(2);
    expect(row!.teams[0]!.members).toContain("host1");
    expect(row!.teams[1]!.name).toBe("Blue");
  });

  it("stores scores as JSONB object", async () => {
    const db = getDb();
    const id = testId();
    const code = testCode();
    cleanup.push({ table: passwordGames, id });
    const now = Date.now();

    await db.insert(passwordGames).values({
      id,
      code,
      hostId: "host1",
      phase: "playing",
      teams: [{ name: "A", members: ["p1"] }],
      scores: { "0": 5, "1": 3 },
      createdAt: now,
      updatedAt: now,
    });

    const [row] = await db.select().from(passwordGames).where(eq(passwordGames.id, id));
    expect(row!.scores["0"]).toBe(5);
    expect(row!.scores["1"]).toBe(3);
  });
});

// ─── Chain Reaction ─────────────────────────────────────────
describe("Local DB — chain reaction game lifecycle", () => {
  it("creates a game with settings JSONB", async () => {
    const db = getDb();
    const id = testId();
    const code = testCode();
    cleanup.push({ table: chainReactionGames, id });
    const now = Date.now();

    await db.insert(chainReactionGames).values({
      id,
      code,
      hostId: "host1",
      phase: "lobby",
      players: [{ sessionId: "host1", name: "Host", connected: true }],
      settings: {
        chainLength: 7,
        rounds: 2,
        currentRound: 1,
        turnTimeSec: 30,
        phaseEndsAt: null,
        chainMode: "premade",
      },
      createdAt: now,
      updatedAt: now,
    });

    const [row] = await db.select().from(chainReactionGames).where(eq(chainReactionGames.id, id));
    expect(row!.settings.chainLength).toBe(7);
    expect(row!.settings.rounds).toBe(2);
    expect(row!.settings.chainMode).toBe("premade");
  });

  it("stores chain JSONB with nested arrays", async () => {
    const db = getDb();
    const id = testId();
    const code = testCode();
    cleanup.push({ table: chainReactionGames, id });
    const now = Date.now();

    await db.insert(chainReactionGames).values({
      id,
      code,
      hostId: "host1",
      phase: "playing",
      players: [{ sessionId: "host1", name: "Host", connected: true }],
      chain: {
        "host1": [
          { word: "sun", revealed: true, lettersShown: 3, solvedBy: "host1" },
          { word: "flower", revealed: false, lettersShown: 0, solvedBy: null },
        ],
      },
      createdAt: now,
      updatedAt: now,
    });

    const [row] = await db.select().from(chainReactionGames).where(eq(chainReactionGames.id, id));
    expect(row!.chain["host1"]).toHaveLength(2);
    expect(row!.chain["host1"]![0]!.word).toBe("sun");
    expect(row!.chain["host1"]![0]!.solvedBy).toBe("host1");
  });
});

// ─── Shade Signal ───────────────────────────────────────────
describe("Local DB — shade signal game lifecycle", () => {
  it("creates a game with players containing totalScore", async () => {
    const db = getDb();
    const id = testId();
    const code = testCode();
    cleanup.push({ table: shadeSignalGames, id });
    const now = Date.now();

    await db.insert(shadeSignalGames).values({
      id,
      code,
      hostId: "host1",
      phase: "lobby",
      players: [
        { sessionId: "host1", name: "Host", connected: true, totalScore: 0 },
        { sessionId: "p1", name: "Alice", connected: true, totalScore: 10 },
      ],
      createdAt: now,
      updatedAt: now,
    });

    const [row] = await db.select().from(shadeSignalGames).where(eq(shadeSignalGames.id, id));
    expect(row!.players).toHaveLength(2);
    expect(row!.players[1]!.totalScore).toBe(10);
  });
});

// ─── Cross-table: session ↔ game link ───────────────────────
describe("Local DB — session/game linking", () => {
  it("session references a game and can be queried", async () => {
    const db = getDb();
    const gameId = testId();
    const sessionId = testId();
    const code = testCode();
    const now = Date.now();

    cleanup.push({ table: imposterGames, id: gameId });
    cleanup.push({ table: sessions, id: sessionId });

    await db.insert(imposterGames).values({
      id: gameId,
      code,
      hostId: sessionId,
      phase: "lobby",
      players: [{ sessionId, name: "Host", connected: true }],
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(sessions).values({
      id: sessionId,
      name: "Host",
      gameType: "imposter",
      gameId,
      createdAt: now,
      lastSeen: now,
    });

    // Query session → game
    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    expect(session!.gameType).toBe("imposter");
    expect(session!.gameId).toBe(gameId);

    // Query game → verify host
    const [game] = await db.select().from(imposterGames).where(eq(imposterGames.id, gameId));
    expect(game!.hostId).toBe(sessionId);
  });
});

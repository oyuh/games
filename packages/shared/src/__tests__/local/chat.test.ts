/**
 * Local DB — chat message tests.
 *
 * Verifies chat messages persist correctly and can be queried/deleted
 * against the real local dev database.
 */
import { describe, it, expect, afterEach } from "vitest";
import { eq, and } from "drizzle-orm";
import { chatMessages } from "../../drizzle/schema";
import { getDb } from "./setup";

const TEST_PREFIX = "test_local_";
function testId() {
  return `${TEST_PREFIX}${crypto.randomUUID().slice(0, 8)}`;
}

const createdIds: string[] = [];

afterEach(async () => {
  const db = getDb();
  for (const id of createdIds) {
    await db.delete(chatMessages).where(eq(chatMessages.id, id));
  }
  createdIds.length = 0;
});

describe("Local DB — chat messages", () => {
  it("inserts and reads back a message", async () => {
    const db = getDb();
    const id = testId();
    createdIds.push(id);
    const now = Date.now();

    await db.insert(chatMessages).values({
      id,
      gameType: "imposter",
      gameId: "game_test",
      senderId: "user1",
      senderName: "Alice",
      text: "Hello from local test!",
      createdAt: now,
    });

    const [row] = await db.select().from(chatMessages).where(eq(chatMessages.id, id));
    expect(row).toBeDefined();
    expect(row!.text).toBe("Hello from local test!");
    expect(row!.senderName).toBe("Alice");
    expect(row!.gameType).toBe("imposter");
  });

  it("supports badge and channel fields", async () => {
    const db = getDb();
    const id = testId();
    createdIds.push(id);
    const now = Date.now();

    await db.insert(chatMessages).values({
      id,
      gameType: "password",
      gameId: "game_test",
      senderId: "user1",
      senderName: "Alice",
      badge: "host",
      channel: "team-red",
      text: "Team message",
      createdAt: now,
    });

    const [row] = await db.select().from(chatMessages).where(eq(chatMessages.id, id));
    expect(row!.badge).toBe("host");
    expect(row!.channel).toBe("team-red");
  });

  it("can query messages by game", async () => {
    const db = getDb();
    const id1 = testId();
    const id2 = testId();
    const id3 = testId();
    createdIds.push(id1, id2, id3);
    const now = Date.now();
    const gameId = `game_${testId()}`;

    await db.insert(chatMessages).values([
      { id: id1, gameType: "imposter" as const, gameId, senderId: "u1", senderName: "A", text: "msg1", createdAt: now },
      { id: id2, gameType: "imposter" as const, gameId, senderId: "u2", senderName: "B", text: "msg2", createdAt: now + 1 },
      { id: id3, gameType: "imposter" as const, gameId: "other_game", senderId: "u3", senderName: "C", text: "msg3", createdAt: now },
    ]);

    const rows = await db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.gameType, "imposter"), eq(chatMessages.gameId, gameId)));

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.text).sort()).toEqual(["msg1", "msg2"]);
  });

  it("can delete messages for a game (clearForGame)", async () => {
    const db = getDb();
    const id1 = testId();
    const id2 = testId();
    createdIds.push(id1, id2);
    const now = Date.now();
    const gameId = `game_${testId()}`;

    await db.insert(chatMessages).values([
      { id: id1, gameType: "imposter" as const, gameId, senderId: "u1", senderName: "A", text: "bye1", createdAt: now },
      { id: id2, gameType: "imposter" as const, gameId, senderId: "u2", senderName: "B", text: "bye2", createdAt: now },
    ]);

    await db
      .delete(chatMessages)
      .where(and(eq(chatMessages.gameType, "imposter"), eq(chatMessages.gameId, gameId)));

    const rows = await db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.gameType, "imposter"), eq(chatMessages.gameId, gameId)));

    expect(rows).toHaveLength(0);
    // Remove from cleanup since already deleted
    createdIds.length = 0;
  });
});

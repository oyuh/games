/**
 * Local DB — sessions CRUD tests.
 *
 * Verifies sessions can be created, read, updated, and cleaned up
 * against the real local dev database.
 */
import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { sessions } from "../../drizzle/schema";
import { getDb } from "./setup";

const TEST_PREFIX = "test_local_";
function testId() {
  return `${TEST_PREFIX}${crypto.randomUUID().slice(0, 8)}`;
}

// Clean up any test rows created during the suite
const createdIds: string[] = [];
afterEach(async () => {
  const db = getDb();
  for (const id of createdIds) {
    await db.delete(sessions).where(eq(sessions.id, id));
  }
  createdIds.length = 0;
});

describe("Local DB — sessions", () => {
  it("can insert and read back a session", async () => {
    const db = getDb();
    const id = testId();
    createdIds.push(id);
    const now = Date.now();

    await db.insert(sessions).values({
      id,
      name: "Test User",
      createdAt: now,
      lastSeen: now,
    });

    const [row] = await db.select().from(sessions).where(eq(sessions.id, id));
    expect(row).toBeDefined();
    expect(row!.name).toBe("Test User");
    expect(row!.createdAt).toBe(now);
  });

  it("can update a session name", async () => {
    const db = getDb();
    const id = testId();
    createdIds.push(id);
    const now = Date.now();

    await db.insert(sessions).values({ id, name: "Old", createdAt: now, lastSeen: now });
    await db.update(sessions).set({ name: "New" }).where(eq(sessions.id, id));

    const [row] = await db.select().from(sessions).where(eq(sessions.id, id));
    expect(row!.name).toBe("New");
  });

  it("can attach and detach a game", async () => {
    const db = getDb();
    const id = testId();
    createdIds.push(id);
    const now = Date.now();

    await db.insert(sessions).values({ id, name: "Gamer", createdAt: now, lastSeen: now });

    // Attach
    await db.update(sessions).set({ gameType: "imposter", gameId: "game_xyz" }).where(eq(sessions.id, id));
    let [row] = await db.select().from(sessions).where(eq(sessions.id, id));
    expect(row!.gameType).toBe("imposter");
    expect(row!.gameId).toBe("game_xyz");

    // Detach
    await db.update(sessions).set({ gameType: null, gameId: null }).where(eq(sessions.id, id));
    [row] = await db.select().from(sessions).where(eq(sessions.id, id));
    expect(row!.gameType).toBeNull();
    expect(row!.gameId).toBeNull();
  });

  it("can update lastSeen (presence heartbeat)", async () => {
    const db = getDb();
    const id = testId();
    createdIds.push(id);
    const old = Date.now() - 60_000;

    await db.insert(sessions).values({ id, name: "Present", createdAt: old, lastSeen: old });
    const fresh = Date.now();
    await db.update(sessions).set({ lastSeen: fresh }).where(eq(sessions.id, id));

    const [row] = await db.select().from(sessions).where(eq(sessions.id, id));
    expect(row!.lastSeen).toBe(fresh);
  });

  it("can delete a session", async () => {
    const db = getDb();
    const id = testId();
    const now = Date.now();

    await db.insert(sessions).values({ id, name: "Temp", createdAt: now, lastSeen: now });
    await db.delete(sessions).where(eq(sessions.id, id));

    const [row] = await db.select().from(sessions).where(eq(sessions.id, id));
    expect(row).toBeUndefined();
  });
});

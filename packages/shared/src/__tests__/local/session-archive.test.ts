import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "./setup";
import { sessionArchive } from "../../drizzle/schema";

/**
 * The archive upsert, against a real database.
 *
 * The semantics only exist in the ON CONFLICT clause, so they cannot be tested
 * without Postgres: least() and greatest() decide whether a returning player
 * keeps their original first_seen, and seen_count is what separates a fresh id
 * from one that has come back forty times. Getting either wrong is invisible
 * until someone is looking at a moderation decision.
 */
const ID = "__test_session_archive__";

function upsert(row: typeof sessionArchive.$inferInsert) {
  return getDb()
    .insert(sessionArchive)
    .values(row)
    .onConflictDoUpdate({
      target: sessionArchive.id,
      set: {
        name: sql`excluded.name`,
        avatar: sql`excluded.avatar`,
        region: sql`excluded.region`,
        ip: sql`excluded.ip`,
        firstSeen: sql`least(${sessionArchive.firstSeen}, excluded.first_seen)`,
        lastSeen: sql`greatest(${sessionArchive.lastSeen}, excluded.last_seen)`,
        seenCount: sql`${sessionArchive.seenCount} + 1`,
      },
    });
}

const read = async () => {
  const [row] = await getDb()
    .select()
    .from(sessionArchive)
    .where(eq(sessionArchive.id, ID));
  return row;
};

afterEach(async () => {
  await getDb().delete(sessionArchive).where(eq(sessionArchive.id, ID));
});

describe("session archive upsert", () => {
  it("stores a session the first time it is archived", async () => {
    await upsert({
      id: ID,
      name: "first",
      avatar: null,
      region: "us",
      ip: "1.2.3.4",
      firstSeen: 5000,
      lastSeen: 6000,
      seenCount: 1,
    });

    const row = await read();
    expect(row).toMatchObject({
      id: ID,
      name: "first",
      firstSeen: 5000,
      lastSeen: 6000,
      seenCount: 1,
    });
  });

  it("keeps the earliest first_seen and the latest last_seen", async () => {
    await upsert({
      id: ID,
      name: "first",
      avatar: null,
      region: "us",
      ip: "1.2.3.4",
      firstSeen: 5000,
      lastSeen: 6000,
      seenCount: 1,
    });
    // A later visit whose window straddles the first one in both directions.
    await upsert({
      id: ID,
      name: "second",
      avatar: "MTIuNA==",
      region: "eu",
      ip: "5.6.7.8",
      firstSeen: 1000,
      lastSeen: 9000,
      seenCount: 1,
    });

    const row = await read();
    expect(row.firstSeen).toBe(1000);
    expect(row.lastSeen).toBe(9000);
  });

  it("counts visits rather than overwriting the count", async () => {
    for (let i = 0; i < 3; i += 1) {
      await upsert({
        id: ID,
        name: `visit-${i}`,
        avatar: null,
        region: "us",
        ip: "1.2.3.4",
        firstSeen: 1000 + i,
        lastSeen: 2000 + i,
        seenCount: 1,
      });
    }

    const row = await read();
    expect(row.seenCount).toBe(3);
  });

  it("refreshes the identity fields to the most recent visit", async () => {
    await upsert({
      id: ID,
      name: "old",
      avatar: null,
      region: "us",
      ip: "1.1.1.1",
      firstSeen: 1000,
      lastSeen: 2000,
      seenCount: 1,
    });
    await upsert({
      id: ID,
      name: "new",
      avatar: "MTIuNA==",
      region: "eu",
      ip: "2.2.2.2",
      firstSeen: 3000,
      lastSeen: 4000,
      seenCount: 1,
    });

    const row = await read();
    // A ban decision should be made against who they are now, not who they
    // were the first time they were archived.
    expect(row.name).toBe("new");
    expect(row.region).toBe("eu");
    expect(row.ip).toBe("2.2.2.2");
    expect(row.avatar).toBe("MTIuNA==");
    // But the history is still the full span.
    expect(row.firstSeen).toBe(1000);
    expect(row.lastSeen).toBe(4000);
  });
});

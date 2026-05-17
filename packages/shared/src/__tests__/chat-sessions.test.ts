/**
 * Chat & Session mutator tests.
 *
 * Tests message sending/clearing, session management,
 * identity enforcement, and input sanitization.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MockTx,
  serverCtx,
  makeSession,
  makeImposterGame,
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

const { chatMutators } = await import("../zero/mutators/chat");
const { sessionMutators } = await import("../zero/mutators/sessions");
const { fallbackPlayerName } = await import("../player-names");
type Handler = (params: { args: any; tx: any; ctx: any }) => Promise<void>;
const chat = chatMutators as unknown as Record<string, Handler>;
const sessions = sessionMutators as unknown as Record<string, Handler>;

// ───────────────────────────────────────────────────────────
describe("Chat — send message", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("imposter_games", [
      makeImposterGame({
        id: "game1",
        host_id: "host1",
        players: [
          { sessionId: "host1", name: "Host", connected: true, role: "player" },
          { sessionId: "user1", name: "Alice", connected: true, role: "player" },
        ],
      }),
    ]);
  });

  it("sends a valid message", async () => {
    await chat.send({
      args: {
        id: "msg1",
        gameType: "imposter",
        gameId: "game1",
        senderId: "user1",
        senderName: "Alice",
        text: "Hello everyone!",
      },
      tx,
      ctx: serverCtx("user1"),
    });
    const msg = tx.getById("chat_messages", "msg1") as any;
    expect(msg).toBeDefined();
    expect(msg.text).toBe("Hello everyone!");
    expect(msg.sender_name).toBe("Alice");
  });

  it("sanitizes HTML in message text", async () => {
    await chat.send({
      args: {
        id: "msg2",
        gameType: "imposter",
        gameId: "game1",
        senderId: "user1",
        senderName: "Alice",
        text: '<script>alert("xss")</script>Real message',
      },
      tx,
      ctx: serverCtx("user1"),
    });
    const msg = tx.getById("chat_messages", "msg2") as any;
    expect(msg.text).not.toContain("<script>");
    expect(msg.text).toContain("Real message");
  });

  it("sanitizes HTML in sender name", async () => {
    await chat.send({
      args: {
        id: "msg3",
        gameType: "imposter",
        gameId: "game1",
        senderId: "user1",
        senderName: '<img src=x onerror=alert(1)>Bob',
        text: "Hello",
      },
      tx,
      ctx: serverCtx("user1"),
    });
    const msg = tx.getById("chat_messages", "msg3") as any;
    expect(msg.sender_name).not.toContain("<img");
  });

  it("rejects empty message after sanitization", async () => {
    await expectThrows(
      () =>
        chat.send({
          args: {
            id: "msg4",
            gameType: "imposter",
            gameId: "game1",
            senderId: "user1",
            senderName: "Alice",
            text: "<script></script>",
          },
          tx,
          ctx: serverCtx("user1"),
        }),
      "empty"
    );
  });

  it("blocks sending as someone else (identity spoofing)", async () => {
    await expectThrows(
      () =>
        chat.send({
          args: {
            id: "msg5",
            gameType: "imposter",
            gameId: "game1",
            senderId: "user1",
            senderName: "Alice",
            text: "Hello",
          },
          tx,
          ctx: serverCtx("attacker"),
        }),
      "Not allowed"
    );
  });

  it("falls back to a generated player name for empty sender name", async () => {
    await chat.send({
      args: {
        id: "msg6",
        gameType: "imposter",
        gameId: "game1",
        senderId: "user1",
        senderName: "   ",
        text: "Hello",
      },
      tx,
      ctx: serverCtx("user1"),
    });
    const msg = tx.getById("chat_messages", "msg6") as any;
    expect(msg.sender_name).toBe(fallbackPlayerName("user1"));
  });

  it("blocks outsiders from sending messages into a game", async () => {
    tx.seed("imposter_games", [
      makeImposterGame({
        id: "game1",
        host_id: "host1",
        players: [
          { sessionId: "host1", name: "Host", connected: true, role: "player" },
          { sessionId: "user1", name: "Alice", connected: true, role: "player" },
        ],
      }),
    ]);

    await expectThrows(
      () =>
        chat.send({
          args: {
            id: "msg7",
            gameType: "imposter",
            gameId: "game1",
            senderId: "attacker",
            senderName: "Mallory",
            text: "let me in",
          },
          tx,
          ctx: serverCtx("attacker"),
        }),
      "Only game members can chat"
    );
  });

  it("allows imposter-only chat for real imposters", async () => {
    tx.seed("imposter_games", [
      makeImposterGame({
        id: "game1",
        host_id: "host1",
        players: [
          { sessionId: "host1", name: "Host", connected: true, role: "player" },
          { sessionId: "imp1", name: "Ivy", connected: true, role: "imposter" },
          { sessionId: "imp2", name: "Noah", connected: true, role: "imposter" },
          { sessionId: "user1", name: "Alice", connected: true, role: "player" },
        ],
      }),
    ]);

    await chat.send({
      args: {
        id: "msg8",
        gameType: "imposter",
        gameId: "game1",
        senderId: "imp1",
        senderName: "Ivy",
        channel: "imposter",
        text: "stick with the museum clue",
      },
      tx,
      ctx: serverCtx("imp1"),
    });

    const msg = tx.getById("chat_messages", "msg8") as any;
    expect(msg.channel).toBe("imposter");
  });

  it("blocks non-imposters from using the imposter channel", async () => {
    tx.seed("imposter_games", [
      makeImposterGame({
        id: "game1",
        host_id: "host1",
        players: [
          { sessionId: "host1", name: "Host", connected: true, role: "player" },
          { sessionId: "imp1", name: "Ivy", connected: true, role: "imposter" },
          { sessionId: "imp2", name: "Noah", connected: true, role: "imposter" },
          { sessionId: "user1", name: "Alice", connected: true, role: "player" },
        ],
      }),
    ]);

    await expectThrows(
      () =>
        chat.send({
          args: {
            id: "msg9",
            gameType: "imposter",
            gameId: "game1",
            senderId: "user1",
            senderName: "Alice",
            channel: "imposter",
            text: "hello fellow imposters",
          },
          tx,
          ctx: serverCtx("user1"),
        }),
      "Only imposters can use this channel"
    );
  });
});

// ───────────────────────────────────────────────────────────
describe("Chat — clearForGame", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("chat_messages", [
      { id: "m1", game_type: "imposter", game_id: "game1", text: "Hello" },
      { id: "m2", game_type: "imposter", game_id: "game1", text: "World" },
      { id: "m3", game_type: "imposter", game_id: "game2", text: "Other" },
    ]);
  });

  it("deletes all messages for the specified game", async () => {
    tx.seed("imposter_games", [makeImposterGame({ id: "game1", host_id: "host1" })]);
    await chat.clearForGame({
      args: { gameType: "imposter", gameId: "game1" },
      tx,
      ctx: {},
    });
    // Messages for game1 should be deleted
    expect(tx.getById("chat_messages", "m1")).toBeUndefined();
    expect(tx.getById("chat_messages", "m2")).toBeUndefined();
    // Messages for game2 should remain
    expect(tx.getById("chat_messages", "m3")).toBeDefined();
  });

  it("blocks non-hosts from clearing a game's chat log", async () => {
    tx.seed("imposter_games", [
      makeImposterGame({
        id: "game1",
        host_id: "host1",
        players: [
          { sessionId: "host1", name: "Host", connected: true, role: "player" },
          { sessionId: "user1", name: "Alice", connected: true, role: "player" },
        ],
      }),
    ]);

    await expectThrows(
      () =>
        chat.clearForGame({
          args: { gameType: "imposter", gameId: "game1" },
          tx,
          ctx: serverCtx("user1"),
        }),
      "Only host can do that"
    );
  });
});

// ───────────────────────────────────────────────────────────
describe("Sessions — upsert", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
  });

  it("creates a new session", async () => {
    await sessions.upsert({
      args: { id: "user1", name: "Alice" },
      tx,
      ctx: serverCtx("user1"),
    });
    const session = tx.getById("sessions", "user1") as any;
    expect(session).toBeDefined();
    expect(session.name).toBe("Alice");
  });

  it("sanitizes HTML in name", async () => {
    await sessions.upsert({
      args: { id: "user1", name: "<b>Evil</b>Name" },
      tx,
      ctx: serverCtx("user1"),
    });
    const session = tx.getById("sessions", "user1") as any;
    expect(session.name).not.toContain("<b>");
    expect(session.name).toContain("Evil");
  });

  it("blocks creating a session for someone else", async () => {
    await expectThrows(
      () => sessions.upsert({ args: { id: "victim" }, tx, ctx: serverCtx("attacker") }),
      "Not allowed"
    );
  });
});

// ───────────────────────────────────────────────────────────
describe("Sessions — setName", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [makeSession({ id: "user1", name: "OldName" })]);
  });

  it("updates the name", async () => {
    await sessions.setName({
      args: { id: "user1", name: "NewName" },
      tx,
      ctx: serverCtx("user1"),
    });
    const session = tx.getById("sessions", "user1") as any;
    expect(session.name).toBe("NewName");
  });

  it("sanitizes HTML from new name", async () => {
    await sessions.setName({
      args: { id: "user1", name: '<script>x</script>Clean' },
      tx,
      ctx: serverCtx("user1"),
    });
    const session = tx.getById("sessions", "user1") as any;
    expect(session.name).not.toContain("<script>");
  });

  it("rejects empty name after sanitization", async () => {
    await expectThrows(
      () => sessions.setName({ args: { id: "user1", name: "<b></b>" }, tx, ctx: serverCtx("user1") }),
      "empty"
    );
  });

  it("blocks renaming another user", async () => {
    await expectThrows(
      () => sessions.setName({ args: { id: "user1", name: "Hijacked" }, tx, ctx: serverCtx("attacker") }),
      "Not allowed"
    );
  });
});

// ───────────────────────────────────────────────────────────
describe("Sessions — touchPresence", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("sessions", [makeSession({ id: "user1", last_seen: 1000 })]);
  });

  it("updates last_seen timestamp", async () => {
    await sessions.touchPresence({
      args: { id: "user1" },
      tx,
      ctx: serverCtx("user1"),
    });
    const session = tx.getById("sessions", "user1") as any;
    expect(session.last_seen).toBeGreaterThan(1000);
  });

  it("blocks touching presence for another user", async () => {
    await expectThrows(
      () => sessions.touchPresence({ args: { id: "user1" }, tx, ctx: serverCtx("attacker") }),
      "Not allowed"
    );
  });
});

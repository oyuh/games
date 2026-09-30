/**
 * Chat & Session mutator tests.
 *
 * Tests message sending/clearing, session management,
 * identity enforcement, and input sanitization.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  MockTx,
  serverCtx,
  makeSession,
  expectThrows,
} from "./test-helpers";

import { chatMutators } from "../zero/mutators/chat";
import { sessionMutators } from "../zero/mutators/sessions";
import { fallbackPlayerName } from "../player-names";
import { imposterChatKeyId } from "../zero/mutators/helpers";
import { isEncrypted } from "../crypto";
import { openForTest } from "./test-helpers";
type Handler = (params: { args: any; tx: any; ctx: any }) => Promise<void>;
const chat = chatMutators as unknown as Record<string, Handler>;
const sessions = sessionMutators as unknown as Record<string, Handler>;

// ───────────────────────────────────────────────────────────
describe("Chat: send message", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
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
});

// ───────────────────────────────────────────────────────────
describe("Chat: imposter back-channel", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("imposter_games", [
      {
        id: "game1",
        host_id: "host1",
        players: [
          { sessionId: "imp1", name: "Imp", connected: true, role: "imposter" },
          { sessionId: "inn1", name: "Innocent", connected: true, role: "player" },
        ],
      },
    ]);
  });

  it("seals imposter-channel text so the synced row carries no plaintext", async () => {
    await chat.send({
      args: {
        id: "im1",
        gameType: "imposter",
        gameId: "game1",
        senderId: "imp1",
        senderName: "Imp",
        channel: "imposter",
        text: "meet at blue",
      },
      tx,
      ctx: serverCtx("imp1"),
    });
    const msg = tx.getById("chat_messages", "im1") as any;
    expect(msg.channel).toBe("imposter");
    expect(msg.text).not.toContain("meet at blue");
    expect(isEncrypted(msg.text)).toBe(true);
    // Holders of the back-channel key recover the plaintext.
    expect(await openForTest("imposter", imposterChatKeyId("game1"), msg.text)).toBe("meet at blue");
  });

  it("rejects a non-imposter posting to the imposter channel", async () => {
    await expectThrows(
      () =>
        chat.send({
          args: {
            id: "im2",
            gameType: "imposter",
            gameId: "game1",
            senderId: "inn1",
            senderName: "Innocent",
            channel: "imposter",
            text: "who is it",
          },
          tx,
          ctx: serverCtx("inn1"),
        }),
      "imposter",
    );
    expect(tx.getById("chat_messages", "im2")).toBeUndefined();
  });

  it("leaves the plaintext of the all channel untouched", async () => {
    await chat.send({
      args: {
        id: "im3",
        gameType: "imposter",
        gameId: "game1",
        senderId: "inn1",
        senderName: "Innocent",
        channel: "all",
        text: "gg everyone",
      },
      tx,
      ctx: serverCtx("inn1"),
    });
    const msg = tx.getById("chat_messages", "im3") as any;
    expect(msg.text).toBe("gg everyone");
    expect(isEncrypted(msg.text)).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────
describe("Chat: clearForGame", () => {
  let tx: MockTx;

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed("imposter_games", [{ id: "game1", host_id: "host1" }]);
    tx.seed("chat_messages", [
      { id: "m1", game_type: "imposter", game_id: "game1", text: "Hello" },
      { id: "m2", game_type: "imposter", game_id: "game1", text: "World" },
      { id: "m3", game_type: "imposter", game_id: "game2", text: "Other" },
    ]);
  });

  it("lets the host delete all messages for the specified game", async () => {
    await chat.clearForGame({
      args: { gameType: "imposter", gameId: "game1", hostId: "host1" },
      tx,
      ctx: serverCtx("host1"),
    });
    // Messages for game1 should be deleted
    expect(tx.getById("chat_messages", "m1")).toBeUndefined();
    expect(tx.getById("chat_messages", "m2")).toBeUndefined();
    // Messages for game2 should remain
    expect(tx.getById("chat_messages", "m3")).toBeDefined();
  });

  it("rejects a non-host caller and leaves the chat intact", async () => {
    await expectThrows(
      () =>
        chat.clearForGame({
          args: { gameType: "imposter", gameId: "game1", hostId: "attacker" },
          tx,
          ctx: serverCtx("attacker"),
        }),
      "host",
    );
    // Nothing was deleted.
    expect(tx.getById("chat_messages", "m1")).toBeDefined();
    expect(tx.getById("chat_messages", "m2")).toBeDefined();
  });
});

// ───────────────────────────────────────────────────────────
describe("Sessions: upsert", () => {
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
describe("Sessions: setName", () => {
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
describe("Sessions: touchPresence", () => {
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

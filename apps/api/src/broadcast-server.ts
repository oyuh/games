import { passwordGames } from "@games/shared";
import { eq } from "drizzle-orm";
import { drizzleClient } from "./db-provider";

export type CustomStatusPayload = {
  text: string;
  link?: string | null;
  color?: string | null;
  flash?: boolean;
} | null;

export type BroadcastMessage =
  | { type: "admin:toast"; message: string; level: "error" | "success" | "info"; targetSessionId?: string }
  | { type: "admin:refresh"; countdown?: number }
  | { type: "admin:status"; status: CustomStatusPayload }
  | { type: "admin:kick"; sessionId: string; reason?: string }
  | { type: "admin:name-changed"; sessionId: string; name: string }
  | { type: "admin:name-restricted"; patterns: string[] };

export type PasswordLiveTypingRole = "clue" | "guess";

export type PasswordLiveTypingPayload = {
  sessionId: string;
  clientId?: string;
  roundId: string;
  role: PasswordLiveTypingRole;
  text: string;
  updatedAt: number;
};

export type RealtimeSocketData = {
  sessionId: string;
  subscriptions: Set<string>;
};

type RealtimeInboundMessage =
  | { type: "subscribe"; topic: string }
  | { type: "unsubscribe"; topic: string }
  | { type: "publish"; topic: string; event: string; payload?: unknown }
  | { type: "ping"; ts?: number };

type RealtimeOutboundMessage =
  | { type: "event"; topic: string; event: string; payload: unknown }
  | { type: "subscribed"; topic: string }
  | { type: "unsubscribed"; topic: string }
  | { type: "pong"; ts: number }
  | { type: "error"; message: string; topic?: string; code?: string };

const GLOBAL_BROADCAST_TOPIC = "broadcast";
const USER_TOPIC_PREFIX = "user:";
const PASSWORD_TEAM_TOPIC_PREFIX = "password-team:";
const PASSWORD_TYPING_EVENT = "password:typing";
const MAX_TYPING_TEXT_LENGTH = 120;

let customStatus: CustomStatusPayload = null;
let banChecker: ((sessionId: string, ip: string, region: string) => any) | null = null;
let realtimeServer: Bun.Server<RealtimeSocketData> | null = null;

const sessionSockets = new Map<string, Set<Bun.ServerWebSocket<RealtimeSocketData>>>();

function encodeRealtimeMessage(message: RealtimeOutboundMessage) {
  return JSON.stringify(message);
}

function sendToSocket(socket: Bun.ServerWebSocket<RealtimeSocketData>, message: RealtimeOutboundMessage) {
  try {
    socket.send(encodeRealtimeMessage(message));
  } catch (error) {
    console.error("[realtime] socket send failed", error);
  }
}

function publishToTopic(topic: string, event: string, payload: unknown) {
  if (!realtimeServer) {
    return;
  }
  realtimeServer.publish(topic, encodeRealtimeMessage({ type: "event", topic, event, payload }));
}

function parsePasswordTeamTopic(topic: string) {
  if (!topic.startsWith(PASSWORD_TEAM_TOPIC_PREFIX)) {
    return null;
  }

  const suffix = topic.slice(PASSWORD_TEAM_TOPIC_PREFIX.length);
  const lastColon = suffix.lastIndexOf(":");
  if (lastColon <= 0) {
    return null;
  }

  const gameId = suffix.slice(0, lastColon);
  const teamIndex = Number.parseInt(suffix.slice(lastColon + 1), 10);
  if (!gameId || !Number.isInteger(teamIndex) || teamIndex < 0) {
    return null;
  }

  return { gameId, teamIndex };
}

function normalizeTypingText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, MAX_TYPING_TEXT_LENGTH);
}

function sanitizePasswordTypingPayload(sessionId: string, payload: unknown): PasswordLiveTypingPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as {
    clientId?: unknown;
    roundId?: unknown;
    role?: unknown;
    text?: unknown;
  };

  const clientId = typeof candidate.clientId === "string"
    ? candidate.clientId.trim().replace(/[^\w:.-]/g, "").slice(0, 128)
    : "";
  const roundId = typeof candidate.roundId === "string" ? candidate.roundId.trim().slice(0, 128) : "";
  const role = candidate.role === "clue" || candidate.role === "guess" ? candidate.role : null;
  if (!roundId || !role) {
    return null;
  }

  return {
    sessionId,
    ...(clientId ? { clientId } : {}),
    roundId,
    role,
    text: normalizeTypingText(candidate.text),
    updatedAt: Date.now(),
  };
}

async function isAuthorizedRealtimeTopic(sessionId: string, topic: string) {
  if (topic === GLOBAL_BROADCAST_TOPIC) {
    return true;
  }

  if (topic === `${USER_TOPIC_PREFIX}${sessionId}`) {
    return true;
  }

  const parsedTeamTopic = parsePasswordTeamTopic(topic);
  if (!parsedTeamTopic) {
    return false;
  }

  const [game] = await drizzleClient
    .select({ teams: passwordGames.teams })
    .from(passwordGames)
    .where(eq(passwordGames.id, parsedTeamTopic.gameId))
    .limit(1);
  const team = game?.teams[parsedTeamTopic.teamIndex];
  return Boolean(team?.members.includes(sessionId));
}

function parseInboundMessage(rawMessage: string | Buffer | ArrayBuffer | Uint8Array) {
  const text = typeof rawMessage === "string"
    ? rawMessage
    : Buffer.from(rawMessage instanceof ArrayBuffer ? new Uint8Array(rawMessage) : rawMessage).toString("utf8");
  try {
    return JSON.parse(text) as RealtimeInboundMessage;
  } catch {
    return null;
  }
}

export function buildRealtimeUserTopic(sessionId: string) {
  return `${USER_TOPIC_PREFIX}${sessionId}`;
}

export function buildRealtimePasswordTeamTopic(gameId: string, teamIndex: number) {
  return `${PASSWORD_TEAM_TOPIC_PREFIX}${gameId}:${teamIndex}`;
}

export function attachRealtimeServer(server: Bun.Server<RealtimeSocketData>) {
  realtimeServer = server;
}

export function onRealtimeOpen(socket: Bun.ServerWebSocket<RealtimeSocketData>) {
  const existing = sessionSockets.get(socket.data.sessionId);
  if (existing) {
    existing.add(socket);
  } else {
    sessionSockets.set(socket.data.sessionId, new Set([socket]));
  }
}

export function onRealtimeClose(socket: Bun.ServerWebSocket<RealtimeSocketData>) {
  const existing = sessionSockets.get(socket.data.sessionId);
  if (!existing) {
    return;
  }

  existing.delete(socket);
  if (existing.size === 0) {
    sessionSockets.delete(socket.data.sessionId);
  }
}

export async function onRealtimeMessage(
  socket: Bun.ServerWebSocket<RealtimeSocketData>,
  rawMessage: string | Buffer | ArrayBuffer | Uint8Array
) {
  const message = parseInboundMessage(rawMessage);
  if (!message) {
    sendToSocket(socket, { type: "error", code: "invalid_json", message: "Invalid realtime payload." });
    return;
  }

  switch (message.type) {
    case "subscribe": {
      const topic = typeof message.topic === "string" ? message.topic.trim() : "";
      if (!topic) {
        sendToSocket(socket, { type: "error", code: "invalid_topic", message: "Missing topic." });
        return;
      }

      if (!(await isAuthorizedRealtimeTopic(socket.data.sessionId, topic))) {
        sendToSocket(socket, { type: "error", code: "unauthorized_topic", topic, message: "Unauthorized topic." });
        return;
      }

      socket.data.subscriptions.add(topic);
      socket.subscribe(topic);
      sendToSocket(socket, { type: "subscribed", topic });
      return;
    }

    case "unsubscribe": {
      const topic = typeof message.topic === "string" ? message.topic.trim() : "";
      if (!topic) {
        return;
      }

      socket.data.subscriptions.delete(topic);
      socket.unsubscribe(topic);
      sendToSocket(socket, { type: "unsubscribed", topic });
      return;
    }

    case "publish": {
      const topic = typeof message.topic === "string" ? message.topic.trim() : "";
      if (!topic || message.event !== PASSWORD_TYPING_EVENT) {
        sendToSocket(socket, { type: "error", code: "unsupported_event", message: "Unsupported realtime event." });
        return;
      }

      if (!socket.data.subscriptions.has(topic) || !(await isAuthorizedRealtimeTopic(socket.data.sessionId, topic))) {
        sendToSocket(socket, { type: "error", code: "unauthorized_publish", topic, message: "Unauthorized publish." });
        return;
      }

      const payload = sanitizePasswordTypingPayload(socket.data.sessionId, message.payload);
      if (!payload) {
        sendToSocket(socket, { type: "error", code: "invalid_payload", topic, message: "Invalid realtime payload." });
        return;
      }

      publishToTopic(topic, PASSWORD_TYPING_EVENT, payload);
      return;
    }

    case "ping":
      sendToSocket(socket, { type: "pong", ts: typeof message.ts === "number" ? message.ts : Date.now() });
      return;
  }
}

export function setBanChecker(fn: (sessionId: string, ip: string, region: string) => any) {
  banChecker = fn;
}

export function getBanChecker() {
  return banChecker;
}

export function getCustomStatus(): CustomStatusPayload {
  return customStatus;
}

export function setCustomStatus(status: CustomStatusPayload) {
  customStatus = status;
}

export function broadcastToAll(msg: BroadcastMessage) {
  if ("targetSessionId" in msg && msg.targetSessionId) {
    publishToTopic(buildRealtimeUserTopic(msg.targetSessionId), msg.type, msg);
    return;
  }

  publishToTopic(GLOBAL_BROADCAST_TOPIC, msg.type, msg);
}

export function broadcastToSession(sessionId: string, msg: BroadcastMessage) {
  publishToTopic(buildRealtimeUserTopic(sessionId), msg.type, msg);
}

export function disconnectSession(sessionId: string) {
  const payload: BroadcastMessage = {
    type: "admin:kick",
    sessionId,
    reason: "Kicked by admin",
  };
  const sockets = sessionSockets.get(sessionId);
  if (!sockets || sockets.size === 0) {
    return;
  }

  for (const socket of sockets) {
    sendToSocket(socket, {
      type: "event",
      topic: buildRealtimeUserTopic(sessionId),
      event: "admin:kick",
      payload,
    });
    setTimeout(() => {
      try {
        socket.close(4001, "admin-kick");
      } catch (error) {
        console.error("[realtime] socket close failed", error);
      }
    }, 50);
  }
}

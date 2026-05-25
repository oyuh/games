import { getOrCreateSessionId, getStoredSessionProof } from "./session";

type RealtimeServerMessage =
  | { type: "event"; topic: string; event: string; payload: unknown }
  | { type: "subscribed"; topic: string }
  | { type: "unsubscribed"; topic: string }
  | { type: "pong"; ts: number }
  | { type: "error"; message: string; topic?: string; code?: string };

type RealtimeClientMessage =
  | { type: "subscribe"; topic: string }
  | { type: "unsubscribe"; topic: string }
  | { type: "publish"; topic: string; event: string; payload?: unknown }
  | { type: "ping"; ts: number };

type RealtimeListener = (payload: unknown) => void;

const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 15_000;

function buildRealtimeWsUrl() {
  const explicitUrl = import.meta.env.VITE_WS_URL?.trim();
  if (explicitUrl) {
    const hasProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(explicitUrl);
    const url = new URL(
      hasProtocol
        ? explicitUrl
        : explicitUrl.startsWith("/")
          ? explicitUrl
          : `http://${explicitUrl}`,
      window.location.origin
    );
    url.protocol = url.protocol === "https:" ? "wss:" : url.protocol === "http:" ? "ws:" : url.protocol;
    url.pathname = url.pathname.replace(/\/+$/, "");
    if (!url.pathname.endsWith("/ws")) {
      url.pathname = `${url.pathname}/ws`.replace(/\/{2,}/g, "/");
    }
    return url.toString();
  }

  const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
  const url = new URL(apiBase);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/ws`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function encodeMessage(message: RealtimeClientMessage) {
  return JSON.stringify(message);
}

class RealtimeClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private readonly topicRefCounts = new Map<string, number>();
  private readonly activeTopics = new Set<string>();
  private readonly pendingPublishes = new Map<string, RealtimeClientMessage & { type: "publish" }>();
  private readonly listeners = new Map<string, Map<string, Set<RealtimeListener>>>();

  subscribe<T>(topic: string, event: string, listener: (payload: T) => void) {
    this.addListener(topic, event, listener as RealtimeListener);
    this.retainTopic(topic);
    this.connect();

    return () => {
      this.removeListener(topic, event, listener as RealtimeListener);
      this.releaseTopic(topic);
    };
  }

  publish(topic: string, event: string, payload?: unknown) {
    const message: RealtimeClientMessage = { type: "publish", topic, event, payload };
    if (this.socket?.readyState === WebSocket.OPEN && this.activeTopics.has(topic)) {
      this.socket.send(encodeMessage(message));
      return true;
    }

    this.pendingPublishes.set(`${topic}:${event}`, message);
    this.connect();
    return false;
  }

  private connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const sessionId = getOrCreateSessionId();
    const sessionProof = getStoredSessionProof();
    const wsUrl = new URL(buildRealtimeWsUrl());
    wsUrl.searchParams.set("sessionId", sessionId);
    if (sessionProof) {
      wsUrl.searchParams.set("sessionProof", sessionProof);
    }

    const socket = new WebSocket(wsUrl.toString());
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.reconnectAttempts = 0;
      this.clearReconnectTimer();

      for (const topic of this.topicRefCounts.keys()) {
        socket.send(encodeMessage({ type: "subscribe", topic }));
      }
    });

    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") {
        return;
      }

      let message: RealtimeServerMessage;
      try {
        message = JSON.parse(event.data) as RealtimeServerMessage;
      } catch {
        return;
      }

      if (message.type === "subscribed") {
        this.activeTopics.add(message.topic);
        this.flushPendingPublishes(message.topic);
        return;
      }

      if (message.type === "unsubscribed") {
        this.activeTopics.delete(message.topic);
        return;
      }

      if (message.type === "error") {
        console.warn("[realtime]", message.code ?? "error", message.message, message.topic ?? "");
        return;
      }

      if (message.type === "event") {
        const topicListeners = this.listeners.get(message.topic);
        const eventListeners = topicListeners?.get(message.event);
        if (!eventListeners || eventListeners.size === 0) {
          return;
        }

        for (const listener of eventListeners) {
          listener(message.payload);
        }
      }
    });

    socket.addEventListener("close", () => {
      if (this.socket === socket) {
        this.socket = null;
      }
      this.activeTopics.clear();
      this.scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      socket.close();
    });
  }

  private retainTopic(topic: string) {
    const currentCount = this.topicRefCounts.get(topic) ?? 0;
    this.topicRefCounts.set(topic, currentCount + 1);

    if (currentCount === 0 && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(encodeMessage({ type: "subscribe", topic }));
    }
  }

  private releaseTopic(topic: string) {
    const nextCount = (this.topicRefCounts.get(topic) ?? 1) - 1;
    if (nextCount > 0) {
      this.topicRefCounts.set(topic, nextCount);
      return;
    }

    this.topicRefCounts.delete(topic);
    this.activeTopics.delete(topic);
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(encodeMessage({ type: "unsubscribe", topic }));
    }
  }

  private flushPendingPublishes(topic: string) {
    if (this.socket?.readyState !== WebSocket.OPEN || !this.activeTopics.has(topic)) {
      return;
    }

    for (const [key, message] of this.pendingPublishes) {
      if (message.topic !== topic) {
        continue;
      }

      this.socket.send(encodeMessage(message));
      this.pendingPublishes.delete(key);
    }
  }

  private addListener(topic: string, event: string, listener: RealtimeListener) {
    const topicListeners = this.listeners.get(topic) ?? new Map<string, Set<RealtimeListener>>();
    const eventListeners = topicListeners.get(event) ?? new Set<RealtimeListener>();
    eventListeners.add(listener);
    topicListeners.set(event, eventListeners);
    this.listeners.set(topic, topicListeners);
  }

  private removeListener(topic: string, event: string, listener: RealtimeListener) {
    const topicListeners = this.listeners.get(topic);
    const eventListeners = topicListeners?.get(event);
    if (!topicListeners || !eventListeners) {
      return;
    }

    eventListeners.delete(listener);
    if (eventListeners.size === 0) {
      topicListeners.delete(event);
    }
    if (topicListeners.size === 0) {
      this.listeners.delete(topic);
    }
  }

  private send(message: RealtimeClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(encodeMessage(message));
      return true;
    }

    this.connect();
    return false;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null || this.topicRefCounts.size === 0) {
      return;
    }

    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempts, RECONNECT_MAX_DELAY_MS);
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer === null) {
      return;
    }

    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}

let realtimeClient: RealtimeClient | null = null;

function getRealtimeClient() {
  if (!realtimeClient) {
    realtimeClient = new RealtimeClient();
  }
  return realtimeClient;
}

export function subscribeToRealtimeEvent<T>(
  topic: string,
  event: string,
  listener: (payload: T) => void
) {
  return getRealtimeClient().subscribe(topic, event, listener);
}

export function publishRealtimeEvent(topic: string, event: string, payload?: unknown) {
  return getRealtimeClient().publish(topic, event, payload);
}

export function buildRealtimeUserTopic(sessionId: string) {
  return `user:${sessionId}`;
}

export function buildPasswordTeamTopic(gameId: string, teamIndex: number) {
  return `password-team:${gameId}:${teamIndex}`;
}

export function buildChainReactionGameTopic(gameId: string) {
  return `chain-game:${gameId}`;
}

import { useEffect } from "react";
import {
  addConnectionDebugEvent,
  setPresenceConnectLatency,
  setPresenceConnectionState,
  setApiConnectionProbe
} from "../lib/connection-debug";

type GameType = "imposter" | "password" | "chain_reaction" | "shade_signal";

const PING_INTERVAL_MS = 15_000;

export function usePresenceSocket({
  sessionId,
  gameId,
  gameType
}: {
  sessionId: string;
  gameId: string;
  gameType: GameType;
}) {
  useEffect(() => {
    if (!sessionId || !gameId) {
      return;
    }

    const url = import.meta.env.VITE_PRESENCE_WS_URL ?? "ws://localhost:3001/presence";
    setPresenceConnectionState({ state: "connecting" });
    addConnectionDebugEvent({
      level: "info",
      source: "presence",
      message: "opening websocket",
      details: `${gameType}:${gameId}`
    });

    const ws = new WebSocket(url);
    const connectStartedAt = performance.now();
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let pendingPingTs: number | null = null;

    const sendPresence = () => {
      if (ws.readyState !== WebSocket.OPEN) {
        return;
      }
      ws.send(
        JSON.stringify({
          type: "presence",
          sessionId,
          gameId,
          gameType
        })
      );
    };

    const sendPing = () => {
      if (ws.readyState !== WebSocket.OPEN) return;
      pendingPingTs = performance.now();
      ws.send(JSON.stringify({ type: "ping", ts: pendingPingTs }));
    };

    const onOpen = () => {
      const latencyMs = Math.round(performance.now() - connectStartedAt);
      setPresenceConnectLatency(latencyMs);
      setPresenceConnectionState({ state: "connected" });
      addConnectionDebugEvent({
        level: "info",
        source: "presence",
        message: "websocket connected",
        details: `connect ${latencyMs}ms`
      });
      sendPresence();
      // Start periodic pings for latency measurement
      sendPing();
      pingTimer = setInterval(sendPing, PING_INTERVAL_MS);
    };

    const onMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "pong" && pendingPingTs != null) {
          const rtt = Math.round(performance.now() - pendingPingTs);
          pendingPingTs = null;
          setApiConnectionProbe({
            state: "ok",
            latencyMs: rtt,
            checkedAt: new Date().toISOString()
          });
        }
      } catch {
        // ignore non-JSON or malformed messages
      }
    };

    const onError = () => {
      setPresenceConnectionState({ state: "error", reason: "websocket error" });
      addConnectionDebugEvent({
        level: "error",
        source: "presence",
        message: "websocket error"
      });
    };

    const onClose = (event: CloseEvent) => {
      const reason = `code=${event.code} clean=${event.wasClean}${event.reason ? ` reason=${event.reason}` : ""}`;
      setPresenceConnectionState({ state: "closed", reason });
      addConnectionDebugEvent({
        level: event.wasClean ? "warn" : "error",
        source: "presence",
        message: "websocket closed",
        details: reason
      });
    };

    ws.addEventListener("open", onOpen);
    ws.addEventListener("message", onMessage);
    ws.addEventListener("error", onError);
    ws.addEventListener("close", onClose);
    const interval = setInterval(sendPresence, 10_000);

    return () => {
      clearInterval(interval);
      if (pingTimer) clearInterval(pingTimer);
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("message", onMessage);
      ws.removeEventListener("error", onError);
      ws.removeEventListener("close", onClose);
      ws.close();
      setPresenceConnectionState({ state: "idle" });
    };
  }, [sessionId, gameId, gameType]);
}

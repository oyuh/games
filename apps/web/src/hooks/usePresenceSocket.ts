import { useEffect } from "react";
import {
  addConnectionDebugEvent,
  setPresenceConnectionState
} from "../lib/connection-debug";

type GameType = "imposter" | "password";

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

    const onOpen = () => {
      setPresenceConnectionState({ state: "connected" });
      addConnectionDebugEvent({
        level: "info",
        source: "presence",
        message: "websocket connected"
      });
      sendPresence();
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
    ws.addEventListener("error", onError);
    ws.addEventListener("close", onClose);
    const interval = setInterval(sendPresence, 10_000);

    return () => {
      clearInterval(interval);
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("error", onError);
      ws.removeEventListener("close", onClose);
      ws.close();
      setPresenceConnectionState({ state: "idle" });
    };
  }, [sessionId, gameId, gameType]);
}

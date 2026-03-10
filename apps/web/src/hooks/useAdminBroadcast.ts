import { useEffect, useRef } from "react";
import { showToast } from "../lib/toast";
import { getOrCreateSessionId } from "../lib/session";

type AdminBroadcastMessage =
  | { type: "admin:toast"; message: string; level: "error" | "success" | "info" }
  | { type: "admin:refresh"; countdown?: number }
  | { type: "admin:status"; text: string | null }
  | { type: "admin:kick"; sessionId: string; reason?: string };

const statusListeners = new Set<() => void>();
let currentCustomStatus: string | null = null;

export function getCustomStatus() {
  return currentCustomStatus;
}

export function subscribeCustomStatus(cb: () => void) {
  statusListeners.add(cb);
  return () => { statusListeners.delete(cb); };
}

function setStatus(text: string | null) {
  currentCustomStatus = text;
  statusListeners.forEach((cb) => cb());
}

export function useAdminBroadcast() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sessionId = getOrCreateSessionId();
    const presenceUrl = import.meta.env.VITE_PRESENCE_WS_URL ?? "ws://localhost:3001/presence";
    // Derive broadcast URL from presence URL
    const broadcastUrl = presenceUrl.replace(/\/presence$/, "/broadcast");

    let cancelled = false;

    function connect() {
      if (cancelled) return;

      const ws = new WebSocket(broadcastUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Identify ourselves
        ws.send(JSON.stringify({ type: "identify", sessionId }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as AdminBroadcastMessage;

          switch (msg.type) {
            case "admin:toast":
              showToast(msg.message, msg.level || "info");
              break;

            case "admin:refresh":
              window.location.reload();
              break;

            case "admin:status":
              setStatus(msg.text);
              break;

            case "admin:kick":
              if (msg.sessionId === sessionId) {
                showToast(msg.reason || "You have been disconnected by an admin.", "error");
                // Redirect to home after a moment
                setTimeout(() => {
                  window.location.href = "/";
                }, 2000);
              }
              break;
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        if (!cancelled) {
          // Reconnect after 5 seconds
          reconnectTimer.current = setTimeout(connect, 5000);
        }
      };

      ws.onerror = () => {
        // Will trigger onclose
      };
    }

    connect();

    // Send heartbeat every 30s
    const heartbeat = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        // Include current game context from URL
        const path = window.location.pathname;
        let gameType: string | null = null;
        let gameId: string | null = null;

        const impMatch = path.match(/^\/imposter\/(.+)/);
        const pwMatch = path.match(/^\/password\/(.+)/);
        const chMatch = path.match(/^\/chain\/(.+)/);
        const shMatch = path.match(/^\/shade\/(.+)/);

        if (impMatch?.[1]) { gameType = "imposter"; gameId = impMatch[1]; }
        else if (pwMatch?.[1]) { gameType = "password"; gameId = pwMatch[1]; }
        else if (chMatch?.[1]) { gameType = "chain_reaction"; gameId = chMatch[1]; }
        else if (shMatch?.[1]) { gameType = "shade_signal"; gameId = shMatch[1]; }

        wsRef.current.send(JSON.stringify({
          type: "heartbeat",
          gameId,
          gameType,
        }));
      }
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);
}

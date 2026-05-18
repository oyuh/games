import { useEffect } from "react";
import {
  addConnectionDebugEvent,
  setPresenceConnectLatency,
  setPresenceConnectionState,
  setApiConnectionProbe
} from "../lib/connection-debug";

type GameType = "imposter" | "password" | "chain_reaction" | "shade_signal" | "location_signal";

const HEARTBEAT_INTERVAL_MS = 60_000; // 60s — relaxed interval via HTTP

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

    const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
    setPresenceConnectionState({ state: "connecting" });
    addConnectionDebugEvent({
      level: "info",
      source: "presence",
      message: "starting http heartbeat",
      details: `${gameType}:${gameId}`
    });

    let cancelled = false;

    const sendHeartbeat = async () => {
      if (cancelled) return;
      const start = performance.now();
      try {
        const res = await fetch(`${apiBase}/api/presence/heartbeat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ sessionId, gameId, gameType }),
        });
        const rtt = Math.round(performance.now() - start);
        const payload = await res.json().catch(() => null) as {
          sessionId?: string;
          resetRequired?: boolean;
        } | null;

        if (res.ok) {
          if (payload?.resetRequired || (payload?.sessionId && payload.sessionId !== sessionId)) {
            window.location.reload();
            return;
          }
          setPresenceConnectionState({ state: "connected" });
          setPresenceConnectLatency(rtt);
          setApiConnectionProbe({
            state: "ok",
            latencyMs: rtt,
            checkedAt: new Date().toISOString()
          });
        } else {
          if (res.status === 403) {
            window.location.reload();
            return;
          }
          setPresenceConnectionState({ state: "error", reason: `status ${res.status}` });
        }
      } catch {
        setPresenceConnectionState({ state: "error", reason: "fetch failed" });
        addConnectionDebugEvent({
          level: "error",
          source: "presence",
          message: "heartbeat fetch failed"
        });
      }
    };

    // Send immediately, then on interval
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      setPresenceConnectionState({ state: "idle" });
    };
  }, [sessionId, gameId, gameType]);
}

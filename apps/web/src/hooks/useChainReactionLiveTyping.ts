import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildChainReactionGameTopic, publishRealtimeEvent, subscribeToRealtimeEvent } from "../lib/realtime";

const STALE_AFTER_MS = 5_000;

export type ChainReactionLiveTypingEntry = {
  sessionId: string;
  clientId?: string;
  round: number;
  wordIndex: number;
  text: string;
  updatedAt: number;
};

function createLiveTypingClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function useChainReactionLiveTyping({
  enabled,
  gameId,
  sessionId,
  round,
}: {
  enabled: boolean;
  gameId: string;
  sessionId: string;
  round?: number | null;
}) {
  const [liveBySession, setLiveBySession] = useState<Record<string, ChainReactionLiveTypingEntry>>({});
  const clientIdRef = useRef<string | null>(null);
  if (!clientIdRef.current) {
    clientIdRef.current = createLiveTypingClientId();
  }

  useEffect(() => {
    setLiveBySession({});

    if (!enabled || !gameId || !round) {
      return;
    }

    const topic = buildChainReactionGameTopic(gameId);
    return subscribeToRealtimeEvent<ChainReactionLiveTypingEntry>(topic, "chain:typing", (payload) => {
      const isSameClient = payload?.clientId
        ? payload.clientId === clientIdRef.current
        : payload?.sessionId === sessionId;
      if (!payload || isSameClient || payload.round !== round) {
        return;
      }

      setLiveBySession((current) => {
        if (!payload.text.trim()) {
          if (!(payload.sessionId in current)) {
            return current;
          }

          const next = { ...current };
          delete next[payload.sessionId];
          return next;
        }

        return { ...current, [payload.sessionId]: payload };
      });
    });
  }, [enabled, gameId, round, sessionId]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const interval = setInterval(() => {
      const cutoff = Date.now() - STALE_AFTER_MS;
      setLiveBySession((current) => {
        let changed = false;
        const next: Record<string, ChainReactionLiveTypingEntry> = {};
        for (const [key, value] of Object.entries(current)) {
          if (value.updatedAt >= cutoff) {
            next[key] = value;
            continue;
          }
          changed = true;
        }
        return changed ? next : current;
      });
    }, 1_000);

    return () => clearInterval(interval);
  }, [enabled]);

  const publishDraft = useCallback((wordIndex: number, text: string) => {
    if (!enabled || !gameId || !round) {
      return;
    }

    publishRealtimeEvent(buildChainReactionGameTopic(gameId), "chain:typing", {
      clientId: clientIdRef.current,
      round,
      wordIndex,
      text,
    });
  }, [enabled, gameId, round]);

  const clearDraft = useCallback(() => {
    publishDraft(-1, "");
  }, [publishDraft]);

  const liveEntries = useMemo(
    () => Object.values(liveBySession).sort((a, b) => a.updatedAt - b.updatedAt),
    [liveBySession]
  );

  return {
    liveBySession,
    liveEntries,
    publishDraft,
    clearDraft,
  };
}

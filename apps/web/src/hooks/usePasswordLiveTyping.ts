import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildPasswordTeamTopic, publishRealtimeEvent, subscribeToRealtimeEvent } from "../lib/realtime";

const STALE_AFTER_MS = 5_000;

export type PasswordLiveTypingRole = "clue" | "guess";

export type PasswordLiveTypingEntry = {
  sessionId: string;
  clientId?: string;
  roundId: string;
  role: PasswordLiveTypingRole;
  text: string;
  updatedAt: number;
};

function createLiveTypingClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function usePasswordLiveTyping({
  enabled,
  gameId,
  teamIndex,
  sessionId,
  roundId,
}: {
  enabled: boolean;
  gameId: string;
  teamIndex: number;
  sessionId: string;
  roundId?: string | null;
}) {
  const [liveBySession, setLiveBySession] = useState<Record<string, PasswordLiveTypingEntry>>({});
  const clientIdRef = useRef<string | null>(null);
  if (!clientIdRef.current) {
    clientIdRef.current = createLiveTypingClientId();
  }

  useEffect(() => {
    setLiveBySession({});

    if (!enabled || !gameId || teamIndex < 0 || !roundId) {
      return;
    }

    const topic = buildPasswordTeamTopic(gameId, teamIndex);
    return subscribeToRealtimeEvent<PasswordLiveTypingEntry>(topic, "password:typing", (payload) => {
      const isSameClient = payload?.clientId
        ? payload.clientId === clientIdRef.current
        : payload?.sessionId === sessionId;
      if (!payload || isSameClient || payload.roundId !== roundId) {
        return;
      }

      const sourceKey = payload.clientId ?? `${payload.sessionId}:${payload.role}`;
      setLiveBySession((current) => {
        if (!payload.text.trim()) {
          if (!(sourceKey in current)) {
            return current;
          }

          const next = { ...current };
          delete next[sourceKey];
          return next;
        }

        return { ...current, [sourceKey]: payload };
      });
    });
  }, [enabled, gameId, roundId, sessionId, teamIndex]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const interval = setInterval(() => {
      const cutoff = Date.now() - STALE_AFTER_MS;
      setLiveBySession((current) => {
        let changed = false;
        const next: Record<string, PasswordLiveTypingEntry> = {};
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

  const publishDraft = useCallback((role: PasswordLiveTypingRole, text: string) => {
    if (!enabled || !gameId || teamIndex < 0 || !roundId) {
      return;
    }

    publishRealtimeEvent(buildPasswordTeamTopic(gameId, teamIndex), "password:typing", {
      clientId: clientIdRef.current,
      roundId,
      role,
      text,
    });
  }, [enabled, gameId, roundId, teamIndex]);

  const clearDraft = useCallback((role: PasswordLiveTypingRole) => {
    publishDraft(role, "");
  }, [publishDraft]);

  const liveEntries = useMemo(
    () =>
      Object.values(liveBySession).sort((a, b) => {
        if (a.role !== b.role) {
          return a.role === "clue" ? -1 : 1;
        }
        return a.updatedAt - b.updatedAt;
      }),
    [liveBySession]
  );

  return {
    liveBySession,
    liveEntries,
    publishDraft,
    clearDraft,
  };
}

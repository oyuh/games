import { useEffect } from "react";
import { showToast } from "../lib/toast";
import { getDisplayName, getOrCreateSessionId, setStoredName } from "../lib/session";
import { buildRealtimeUserTopic, subscribeToRealtimeEvent } from "../lib/realtime";

type CustomStatusPayload = {
  text: string;
  link?: string | null;
  color?: string | null;
  flash?: boolean;
} | null;

type AdminBroadcastMessage =
  | { type: "admin:toast"; message: string; level: "error" | "success" | "info" }
  | { type: "admin:refresh"; countdown?: number }
  | { type: "admin:status"; status: CustomStatusPayload }
  | { type: "admin:kick"; sessionId: string; reason?: string }
  | { type: "admin:name-changed"; sessionId: string; name: string }
  | { type: "admin:name-restricted"; patterns: string[] };

const statusListeners = new Set<() => void>();
let currentCustomStatus: CustomStatusPayload = null;

// Restricted name patterns (synced from server)
const restrictedListeners = new Set<() => void>();
let restrictedPatterns: string[] = [];

export function getCustomStatus(): CustomStatusPayload {
  return currentCustomStatus;
}

export function subscribeCustomStatus(cb: () => void) {
  statusListeners.add(cb);
  return () => { statusListeners.delete(cb); };
}

function setStatus(status: CustomStatusPayload) {
  currentCustomStatus = status;
  statusListeners.forEach((cb) => cb());
}

function getRestrictedPatterns(): string[] {
  return restrictedPatterns;
}

function subscribeRestrictedPatterns(cb: () => void) {
  restrictedListeners.add(cb);
  return () => { restrictedListeners.delete(cb); };
}

export function isNameRestricted(name: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase().trim();
  return restrictedPatterns.some((pattern) => {
    if (pattern.includes("*")) {
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$", "i");
      return regex.test(lower);
    }
    return lower === pattern;
  });
}

function handleMessage(msg: AdminBroadcastMessage) {
  const sessionId = getOrCreateSessionId();

  switch (msg.type) {
    case "admin:toast":
      showToast(msg.message, msg.level || "info");
      break;

    case "admin:refresh":
      window.location.reload();
      break;

    case "admin:status":
      setStatus(msg.status);
      break;

    case "admin:kick":
      if (msg.sessionId === sessionId) {
        showToast(msg.reason || "You have been disconnected by an admin.", "error");
        setTimeout(() => {
          window.location.href = "/";
        }, 2000);
      }
      break;

    case "admin:name-changed":
      if (msg.sessionId === sessionId) {
        const nextName = getDisplayName(msg.name, sessionId);
        setStoredName(nextName);
        if (msg.name) {
          showToast(`Your name has been changed to "${nextName}" by an admin.`, "info");
        } else {
          showToast(`Your display name is now ${nextName}.`, "info");
        }
      }
      break;

    case "admin:name-restricted":
      if (msg.patterns) {
        restrictedPatterns = msg.patterns;
        restrictedListeners.forEach((cb) => cb());
      }
      break;
  }
}

export function useAdminBroadcast() {
  useEffect(() => {
    const sessionId = getOrCreateSessionId();
    const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

    // Fetch initial restricted patterns
    fetch(`${apiBase}/api/public/names/restricted`)
      .then((r) => r.json())
      .then((data) => {
        if (data.patterns) {
          restrictedPatterns = data.patterns;
          restrictedListeners.forEach((cb) => cb());
        }
      })
      .catch(() => {});

    // Fetch initial custom status
    fetch(`${apiBase}/api/admin-status`)
      .then((r) => r.json())
      .then((data) => {
        if (data.status) {
          setStatus(data.status);
        }
      })
      .catch(() => {});

    const cleanup = [
      subscribeToRealtimeEvent<AdminBroadcastMessage>("broadcast", "admin:toast", handleMessage),
      subscribeToRealtimeEvent<AdminBroadcastMessage>("broadcast", "admin:refresh", handleMessage),
      subscribeToRealtimeEvent<AdminBroadcastMessage>("broadcast", "admin:status", handleMessage),
      subscribeToRealtimeEvent<AdminBroadcastMessage>("broadcast", "admin:name-restricted", handleMessage),
      subscribeToRealtimeEvent<AdminBroadcastMessage>(buildRealtimeUserTopic(sessionId), "admin:toast", handleMessage),
      subscribeToRealtimeEvent<AdminBroadcastMessage>(buildRealtimeUserTopic(sessionId), "admin:kick", handleMessage),
      subscribeToRealtimeEvent<AdminBroadcastMessage>(buildRealtimeUserTopic(sessionId), "admin:name-changed", handleMessage),
    ];

    return () => {
      cleanup.forEach((unsubscribe) => unsubscribe());
    };
  }, []);
}

import { useEffect, useRef } from "react";
import Pusher from "pusher-js";
import { showToast } from "../lib/toast";
import { getOrCreateSessionId, getStoredName, setStoredName } from "../lib/session";

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

export function getRestrictedPatterns(): string[] {
  return restrictedPatterns;
}

export function subscribeRestrictedPatterns(cb: () => void) {
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

// Singleton Pusher instance so multiple components share one connection
let pusherInstance: Pusher | null = null;

function getPusherInstance(): Pusher {
  if (pusherInstance) return pusherInstance;

  const sessionId = getOrCreateSessionId();
  const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

  pusherInstance = new Pusher(import.meta.env.VITE_PUSHER_KEY ?? "", {
    cluster: import.meta.env.VITE_PUSHER_CLUSTER ?? "us2",
    channelAuthorization: {
      endpoint: `${apiBase}/api/pusher/auth`,
      transport: "ajax",
      params: { session_id: sessionId },
    },
  });

  return pusherInstance;
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
        setStoredName(msg.name ?? "");
        if (msg.name) {
          showToast(`Your name has been changed to "${msg.name}" by an admin.`, "info");
        } else {
          showToast("Your name was cleared by an admin. Choose a new one to keep playing.", "info");
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
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

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

    const pusher = getPusherInstance();

    // Subscribe to global broadcast channel
    const broadcastChannel = pusher.subscribe("games-broadcast");
    broadcastChannel.bind("admin:toast", (data: any) => handleMessage(data));
    broadcastChannel.bind("admin:refresh", (data: any) => handleMessage(data));
    broadcastChannel.bind("admin:status", (data: any) => handleMessage(data));
    broadcastChannel.bind("admin:name-restricted", (data: any) => handleMessage(data));

    // Subscribe to private user channel for targeted messages
    const userChannel = pusher.subscribe(`private-user-${sessionId}`);
    userChannel.bind("admin:toast", (data: any) => handleMessage(data));
    userChannel.bind("admin:kick", (data: any) => handleMessage(data));
    userChannel.bind("admin:name-changed", (data: any) => handleMessage(data));

    // No cleanup — this is app-level, stays active for the entire session
  }, []);
}

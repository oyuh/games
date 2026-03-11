import Pusher from "pusher";

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

let customStatus: CustomStatusPayload = null;
let banChecker: ((sessionId: string, ip: string, region: string) => any) | null = null;

// ─── Pusher instance ────────────────────────────────────────
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID ?? "",
  key: process.env.PUSHER_KEY ?? "",
  secret: process.env.PUSHER_SECRET ?? "",
  cluster: process.env.PUSHER_CLUSTER ?? "us2",
  useTLS: true,
});

export { pusher };

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
  // If targetSessionId, send to that user's private channel instead
  if ("targetSessionId" in msg && msg.targetSessionId) {
    pusher.trigger(`private-user-${msg.targetSessionId}`, msg.type, msg).catch(console.error);
    return;
  }
  pusher.trigger("games-broadcast", msg.type, msg).catch(console.error);
}

export function broadcastToSession(sessionId: string, msg: BroadcastMessage) {
  pusher.trigger(`private-user-${sessionId}`, msg.type, msg).catch(console.error);
}

export function disconnectSession(sessionId: string) {
  // Send a kick message; the client will disconnect itself
  pusher.trigger(`private-user-${sessionId}`, "admin:kick", {
    type: "admin:kick",
    sessionId,
    reason: "Kicked by admin",
  }).catch(console.error);
}

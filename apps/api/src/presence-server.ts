import { sessions } from "@games/shared";
import { and, eq } from "drizzle-orm";
import { drizzleClient } from "./db-provider";
import { WebSocketServer } from "ws";

type PresenceMessage = {
  type: "presence";
  sessionId: string;
  gameId?: string;
  gameType?: "imposter" | "password";
};

const heartbeatMs = 10_000;

export function startPresenceServer(server: { on: (...args: any[]) => void }, path = "/presence") {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request: any, socket: any, head: any) => {
    const requestUrl = request.url ?? "";
    if (!requestUrl.startsWith(path)) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (socket) => {
    let lastSessionId: string | null = null;

    const markSeen = async (payload: PresenceMessage) => {
      lastSessionId = payload.sessionId;
      await drizzleClient
        .update(sessions)
        .set({
          gameId: payload.gameId ?? null,
          gameType: payload.gameType ?? null,
          lastSeen: Date.now()
        })
        .where(eq(sessions.id, payload.sessionId));
    };

    socket.on("message", async (raw) => {
      try {
        const parsed = JSON.parse(raw.toString()) as PresenceMessage;
        if (parsed.type !== "presence" || !parsed.sessionId) {
          return;
        }
        await markSeen(parsed);
      } catch {
      }
    });

    const interval = setInterval(async () => {
      if (!lastSessionId) {
        return;
      }
      await drizzleClient
        .update(sessions)
        .set({ lastSeen: Date.now() })
        .where(and(eq(sessions.id, lastSessionId)));
    }, heartbeatMs);

    socket.on("close", async () => {
      clearInterval(interval);
      if (lastSessionId) {
        await drizzleClient
          .update(sessions)
          .set({ lastSeen: Date.now() })
          .where(eq(sessions.id, lastSessionId));
      }
    });
  });

  console.log(`Presence WS mounted at ${path}`);
  return wss;
}

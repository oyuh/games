import { WebSocketServer, WebSocket } from "ws";

export type BroadcastMessage =
  | { type: "admin:toast"; message: string; level: "error" | "success" | "info"; targetSessionId?: string }
  | { type: "admin:refresh"; countdown?: number }
  | { type: "admin:status"; text: string | null }
  | { type: "admin:kick"; sessionId: string; reason?: string };

type ConnectedClient = {
  ws: WebSocket;
  sessionId: string | null;
  ip: string;
  userAgent: string;
  region: string;
  connectedAt: number;
  lastSeen: number;
  gameId: string | null;
  gameType: string | null;
};

const clients = new Map<WebSocket, ConnectedClient>();

let customStatus: string | null = null;
let banChecker: ((sessionId: string, ip: string, region: string) => any) | null = null;

export function setBanChecker(fn: (sessionId: string, ip: string, region: string) => any) {
  banChecker = fn;
}

export function getCustomStatus() {
  return customStatus;
}

export function setCustomStatus(text: string | null) {
  customStatus = text;
}

export function getConnectedClients(): Array<{
  sessionId: string | null;
  ip: string;
  userAgent: string;
  region: string;
  connectedAt: number;
  lastSeen: number;
  gameId: string | null;
  gameType: string | null;
}> {
  const result: Array<{
    sessionId: string | null;
    ip: string;
    userAgent: string;
    region: string;
    connectedAt: number;
    lastSeen: number;
    gameId: string | null;
    gameType: string | null;
  }> = [];
  for (const client of clients.values()) {
    result.push({
      sessionId: client.sessionId,
      ip: client.ip,
      userAgent: client.userAgent,
      region: client.region,
      connectedAt: client.connectedAt,
      lastSeen: client.lastSeen,
      gameId: client.gameId,
      gameType: client.gameType,
    });
  }
  return result;
}

export function broadcastToAll(msg: BroadcastMessage) {
  const payload = JSON.stringify(msg);
  for (const [ws, client] of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      // If targetSessionId is set, only send to that client
      if ("targetSessionId" in msg && msg.targetSessionId) {
        if (client.sessionId === msg.targetSessionId) {
          ws.send(payload);
        }
      } else {
        ws.send(payload);
      }
    }
  }
}

export function broadcastToSession(sessionId: string, msg: BroadcastMessage) {
  const payload = JSON.stringify(msg);
  for (const [ws, client] of clients) {
    if (ws.readyState === WebSocket.OPEN && client.sessionId === sessionId) {
      ws.send(payload);
    }
  }
}

export function disconnectSession(sessionId: string) {
  for (const [ws, client] of clients) {
    if (client.sessionId === sessionId) {
      ws.close(4001, "Kicked by admin");
    }
  }
}

export function startBroadcastServer(server: { on: (...args: any[]) => void }, path = "/broadcast") {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request: any, socket: any, head: any) => {
    const requestUrl: string = request.url ?? "";
    if (!requestUrl.startsWith(path)) {
      return; // Let other upgrade handlers run
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws, request: any) => {
    const ip =
      (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      request.socket?.remoteAddress ||
      "unknown";
    const userAgent = (request.headers["user-agent"] as string) || "unknown";
    const region = (request.headers["cf-ipcountry"] as string) ||
      (request.headers["x-vercel-ip-country"] as string) ||
      "unknown";

    const client: ConnectedClient = {
      ws,
      sessionId: null,
      ip,
      userAgent,
      region,
      connectedAt: Date.now(),
      lastSeen: Date.now(),
      gameId: null,
      gameType: null,
    };
    clients.set(ws, client);

    // Send current custom status on connect
    if (customStatus) {
      ws.send(JSON.stringify({ type: "admin:status", text: customStatus }));
    }

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "identify" && typeof msg.sessionId === "string") {
          client.sessionId = msg.sessionId;
          client.lastSeen = Date.now();
          if (msg.gameId) client.gameId = msg.gameId;
          if (msg.gameType) client.gameType = msg.gameType;

          // Check if this client is banned
          if (banChecker && client.sessionId) {
            const ban = banChecker(client.sessionId, client.ip, client.region);
            if (ban) {
              ws.send(JSON.stringify({
                type: "admin:kick",
                sessionId: client.sessionId,
                reason: `Banned: ${ban.reason || ban.type}`,
              }));
              ws.close(4003, "Banned");
              return;
            }
          }
        }
        if (msg.type === "heartbeat") {
          client.lastSeen = Date.now();
          if (msg.gameId !== undefined) client.gameId = msg.gameId;
          if (msg.gameType !== undefined) client.gameType = msg.gameType;
        }
      } catch {
        // ignore
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
    });
  });

  console.log(`Broadcast WS mounted at ${path}`);
  return wss;
}

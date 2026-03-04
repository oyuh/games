import { useEffect } from "react";

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

    ws.addEventListener("open", sendPresence);
    const interval = setInterval(sendPresence, 10_000);

    return () => {
      clearInterval(interval);
      ws.close();
    };
  }, [sessionId, gameId, gameType]);
}

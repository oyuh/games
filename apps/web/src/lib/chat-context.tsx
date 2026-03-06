import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { queries } from "@games/shared";
import { useQuery } from "@rocicorp/zero/react";

type ChatState = {
  open: boolean;
  toggle: () => void;
  unread: number;
  /** Whether the current route is inside a game */
  inGame: boolean;
  gameType: "imposter" | "password" | null;
  gameId: string;
};

const ChatContext = createContext<ChatState>({
  open: false,
  toggle: () => {},
  unread: 0,
  inGame: false,
  gameType: null,
  gameId: "",
});

export function useChatContext() {
  return useContext(ChatContext);
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // Derive game info from route
  const imposterMatch = location.pathname.match(/^\/imposter\/([^/]+)/);
  const passwordMatch = location.pathname.match(/^\/password\/([^/]+)/);
  const gameType: "imposter" | "password" | null = imposterMatch ? "imposter" : passwordMatch ? "password" : null;
  const gameId = imposterMatch?.[1] ?? passwordMatch?.[1] ?? "";
  const inGame = Boolean(gameType && gameId);

  // Close chat when navigating away from a game
  const prevGameId = useRef(gameId);
  useEffect(() => {
    if (prevGameId.current !== gameId) {
      setOpen(false);
      prevGameId.current = gameId;
    }
  }, [gameId]);

  // Query messages for unread tracking
  const [messages] = useQuery(
    inGame
      ? queries.chat.byGame({ gameType: gameType!, gameId })
      : queries.chat.byGame({ gameType: "imposter", gameId: "__none__" })
  );

  const lastReadCount = useRef(0);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (open) {
      lastReadCount.current = messages.length;
      setUnread(0);
    } else {
      const diff = messages.length - lastReadCount.current;
      if (diff > 0) setUnread(diff);
    }
  }, [messages.length, open]);

  const toggle = useCallback(() => setOpen((o) => !o), []);

  return (
    <ChatContext.Provider value={{ open, toggle, unread, inGame, gameType, gameId }}>
      {children}
    </ChatContext.Provider>
  );
}

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

  // Track the timestamp of the newest "seen" message instead of counts.
  // Count-based tracking breaks because useQuery returns [] before data loads,
  // setting a baseline of 0 and treating all pre-existing messages as unread.
  const baselineTs = useRef<number | null>(null);
  const [unread, setUnread] = useState(0);

  // Reset when entering a new game so existing messages aren't "unread"
  const prevTrackingId = useRef(gameId);
  useEffect(() => {
    if (prevTrackingId.current !== gameId) {
      baselineTs.current = null;
      setUnread(0);
      prevTrackingId.current = gameId;
    }
  }, [gameId]);

  useEffect(() => {
    const latest = messages.length > 0 ? messages[messages.length - 1]!.created_at : null;

    if (open) {
      if (latest !== null) baselineTs.current = latest;
      setUnread(0);
    } else if (baselineTs.current === null) {
      // First data load for this game — set baseline without showing unread
      if (latest !== null) baselineTs.current = latest;
    } else {
      const newCount = messages.filter(m => m.created_at > baselineTs.current!).length;
      setUnread(newCount);
    }
  }, [messages.length, open]);

  const toggle = useCallback(() => setOpen((o) => !o), []);

  return (
    <ChatContext.Provider value={{ open, toggle, unread, inGame, gameType, gameId }}>
      {children}
    </ChatContext.Provider>
  );
}

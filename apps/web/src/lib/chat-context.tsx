import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { queries } from "@games/shared";
import { useQuery } from "@rocicorp/zero/react";
import { getOrCreateSessionId } from "./session";

type ChatState = {
  open: boolean;
  toggle: () => void;
  unread: number;
  /** Whether the current route is inside a game */
  inGame: boolean;
  /** Whether the current user is spectating */
  isSpectator: boolean;
  /** Whether the current user is an imposter (imposter game only) */
  isImposter: boolean;
  /** Whether the game has multiple imposters (imposter game only) */
  multipleImposters: boolean;
  gameType: "imposter" | "password" | "chain_reaction" | "shade_signal" | null;
  gameId: string;
};

const ChatContext = createContext<ChatState>({
  open: false,
  toggle: () => {},
  unread: 0,
  inGame: false,
  isSpectator: false,
  isImposter: false,
  multipleImposters: false,
  gameType: null,
  gameId: "",
});

export function useChatContext() {
  return useContext(ChatContext);
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const sessionId = getOrCreateSessionId();

  // Derive game info from route
  const imposterMatch = location.pathname.match(/^\/imposter\/([^/]+)/);
  const passwordMatch = location.pathname.match(/^\/password\/([^/]+)/);
  const chainMatch = location.pathname.match(/^\/chain\/([^/]+)/);
  const shadeMatch = location.pathname.match(/^\/shade\/([^/]+)/);
  const gameType: "imposter" | "password" | "chain_reaction" | "shade_signal" | null = imposterMatch ? "imposter" : passwordMatch ? "password" : chainMatch ? "chain_reaction" : shadeMatch ? "shade_signal" : null;
  const gameId = imposterMatch?.[1] ?? passwordMatch?.[1] ?? chainMatch?.[1] ?? shadeMatch?.[1] ?? "";
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

  // Baseline = timestamp of the newest message we consider "read".
  // Initialised to Date.now() so pre-existing messages (older timestamps)
  // are never counted as unread, while anything sent after page-load is.
  const baselineTs = useRef(Date.now());
  const [unread, setUnread] = useState(0);

  // Reset when entering a new game
  const prevTrackingId = useRef(gameId);
  useEffect(() => {
    if (prevTrackingId.current !== gameId) {
      baselineTs.current = Date.now();
      setUnread(0);
      prevTrackingId.current = gameId;
    }
  }, [gameId]);

  useEffect(() => {
    if (open) {
      const latest = messages.length > 0 ? messages[messages.length - 1]!.created_at : baselineTs.current;
      baselineTs.current = latest;
      setUnread(0);
    } else {
      const newCount = messages.filter(m => m.created_at > baselineTs.current && m.sender_id !== sessionId).length;
      setUnread(newCount);
    }
  }, [messages.length, open]);

  // Query current game for spectator detection
  const [impGames] = useQuery(gameType === "imposter" ? queries.imposter.byId({ id: gameId }) : queries.imposter.byId({ id: "__none__" }));
  const [pwdGames] = useQuery(gameType === "password" ? queries.password.byId({ id: gameId }) : queries.password.byId({ id: "__none__" }));
  const [chrGames] = useQuery(gameType === "chain_reaction" ? queries.chainReaction.byId({ id: gameId }) : queries.chainReaction.byId({ id: "__none__" }));
  const [shdGames] = useQuery(gameType === "shade_signal" ? queries.shadeSignal.byId({ id: gameId }) : queries.shadeSignal.byId({ id: "__none__" }));
  const currentGame = gameType === "imposter" ? impGames[0] : gameType === "password" ? pwdGames[0] : gameType === "chain_reaction" ? chrGames[0] : gameType === "shade_signal" ? shdGames[0] : null;
  const isSpectator = currentGame?.spectators?.some((s: { sessionId: string }) => s.sessionId === sessionId) ?? false;

  // Imposter role detection for private chat channels
  const imposterGame = impGames[0];
  const isImposter = gameType === "imposter" && imposterGame?.players?.some((p: { sessionId: string; role?: string }) => p.sessionId === sessionId && p.role === "imposter") || false;
  const multipleImposters = gameType === "imposter" && (imposterGame?.players?.filter((p: { role?: string }) => p.role === "imposter").length ?? 0) >= 2 || false;

  const toggle = useCallback(() => setOpen((o) => !o), []);

  return (
    <ChatContext.Provider value={{ open, toggle, unread, inGame, isSpectator, isImposter, multipleImposters, gameType, gameId }}>
      {children}
    </ChatContext.Provider>
  );
}

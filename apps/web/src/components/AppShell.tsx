import { Outlet } from "react-router-dom";
import { queries } from "@games/shared";
import "../styles/layout.css";
import "../styles/modals.css";
import "../styles/host-chat.css";
import { lazy, Suspense } from "react";
import { useQuery } from "@rocicorp/zero/react";
import { Sidebar } from "./FloatingHeader";
import { Footer } from "./Footer";
import { ToastContainer } from "./shared/ToastContainer";
import { TooltipLayer } from "./shared/Tooltip";
import { CustomCursor } from "./shared/CustomCursor";
import { ChatProvider, useChatContext } from "../lib/chat-context";
import { getDisplayName, getOrCreateSessionId } from "../lib/session";
import { useGameMeta } from "../hooks/useGameMeta";
import { useIsMobile } from "../hooks/useIsMobile";
import { usePresence } from "../hooks/usePresence";

const ChatWindow = lazy(() => import("./shared/ChatWindow").then(({ ChatWindow }) => ({ default: ChatWindow })));
const ConnectionDebugPanel = lazy(() =>
  import("./shared/ConnectionDebugPanel").then(({ ConnectionDebugPanel }) => ({ default: ConnectionDebugPanel }))
);
const MobileLayout = lazy(() => import("../mobile/MobileLayout").then(({ MobileLayout }) => ({ default: MobileLayout })));

export function AppShell() {
  return (
    <ChatProvider>
      <AppShellInner />
      <CustomCursor />
    </ChatProvider>
  );
}

function AppShellInner() {
  useGameMeta();
  // Global presence heartbeat for EVERY client (home, single-player, and
  // multiplayer) so they all stay visible on the admin panel.
  usePresence(getOrCreateSessionId());
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Suspense fallback={<div className="route-loading" />}>
        <MobileLayout />
      </Suspense>
    );
  }
  return <AppShellDesktop />;
}

function AppShellDesktop() {
  const { inGame, isSpectator, gameType, gameId } = useChatContext();
  const sessionId = getOrCreateSessionId();

  // Query current game for host_id
  const [imposterGames] = useQuery(
    gameType === "imposter"
      ? queries.imposter.byId({ id: gameId })
      : queries.imposter.byId({ id: "__none__" })
  );
  const [passwordGames] = useQuery(
    gameType === "password"
      ? queries.password.byId({ id: gameId })
      : queries.password.byId({ id: "__none__" })
  );
  const [chainGames] = useQuery(
    gameType === "chain_reaction"
      ? queries.chainReaction.byId({ id: gameId })
      : queries.chainReaction.byId({ id: "__none__" })
  );
  const [shadeGames] = useQuery(
    gameType === "shade_signal"
      ? queries.shadeSignal.byId({ id: gameId })
      : queries.shadeSignal.byId({ id: "__none__" })
  );
  const [locationGames] = useQuery(
    gameType === "location_signal"
      ? queries.locationSignal.byId({ id: gameId })
      : queries.locationSignal.byId({ id: "__none__" })
  );
  const [sessions] = useQuery(queries.sessions.byId({ id: sessionId }));

  const hostId = gameType === "imposter" ? (imposterGames[0]?.host_id ?? "")
    : gameType === "password" ? (passwordGames[0]?.host_id ?? "")
    : gameType === "chain_reaction" ? (chainGames[0]?.host_id ?? "")
    : gameType === "shade_signal" ? (shadeGames[0]?.host_id ?? "")
    : gameType === "location_signal" ? (locationGames[0]?.host_id ?? "")
    : "";

  const myName = getDisplayName(sessions[0]?.name, sessionId);

  return (
    <div className="shell">
      <Sidebar />
      <div className="shell-content">
        <main className="shell-main">
          <Outlet />
        </main>
      <Footer />
      </div>
      <ToastContainer />
      <TooltipLayer />
      <Suspense fallback={null}>
        <ConnectionDebugPanel />
        {inGame && !isSpectator && <ChatWindow hostId={hostId} myName={myName} />}
      </Suspense>
    </div>
  );
}

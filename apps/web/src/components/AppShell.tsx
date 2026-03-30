import { Outlet } from "react-router-dom";
import { queries } from "@games/shared";
import "../styles/layout.css";
import "../styles/modals.css";
import "../styles/host-chat.css";
import { useQuery } from "@rocicorp/zero/react";
import { ConnectionDebugPanel } from "./shared/ConnectionDebugPanel";
import { ChatWindow } from "./shared/ChatWindow";
import { Sidebar } from "./FloatingHeader";
import { Footer } from "./Footer";
import { ToastContainer } from "./shared/ToastContainer";
import { TooltipLayer } from "./shared/Tooltip";
import { ChatProvider, useChatContext } from "../lib/chat-context";
import { getOrCreateSessionId } from "../lib/session";
import { useGameMeta } from "../hooks/useGameMeta";
import { useIsMobile } from "../hooks/useIsMobile";
import { MobileLayout } from "../mobile/MobileLayout";

export function AppShell() {
  return (
    <ChatProvider>
      <AppShellInner />
    </ChatProvider>
  );
}

function AppShellInner() {
  useGameMeta();
  const isMobile = useIsMobile();

  if (isMobile) return <MobileLayout />;
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

  const myName = sessions[0]?.name ?? sessionId.slice(0, 6);

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
      <ConnectionDebugPanel />
      {inGame && !isSpectator && <ChatWindow hostId={hostId} myName={myName} />}
    </div>
  );
}

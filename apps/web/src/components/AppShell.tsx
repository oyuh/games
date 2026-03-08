import { useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { ConnectionDebugPanel } from "./shared/ConnectionDebugPanel";
import { ChatWindow } from "./shared/ChatWindow";
import { WelcomeModal } from "./shared/WelcomeModal";
import { Sidebar } from "./FloatingHeader";
import { Footer } from "./Footer";
import { ToastContainer } from "./shared/ToastContainer";
import { TooltipLayer } from "./shared/Tooltip";
import { ChatProvider, useChatContext } from "../lib/chat-context";
import { getOrCreateSessionId, hasVisited, markVisited, setStoredName } from "../lib/session";

export function AppShell() {
  return (
    <ChatProvider>
      <AppShellInner />
    </ChatProvider>
  );
}

function AppShellInner() {
  const { inGame, gameType, gameId } = useChatContext();
  const zero = useZero();
  const sessionId = getOrCreateSessionId();
  const [showWelcome, setShowWelcome] = useState(() => !hasVisited());

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
  const [shadeGames] = useQuery(
    gameType === "shade_signal"
      ? queries.shadeSignal.byId({ id: gameId })
      : queries.shadeSignal.byId({ id: "__none__" })
  );
  const [sessions] = useQuery(queries.sessions.byId({ id: sessionId }));

  const hostId = gameType === "imposter"
    ? imposterGames[0]?.host_id ?? ""
    : gameType === "password"
      ? passwordGames[0]?.host_id ?? ""
      : gameType === "shade_signal"
        ? shadeGames[0]?.host_id ?? ""
        : "";

  const myName = sessions[0]?.name ?? sessionId.slice(0, 6);

  const handleWelcomeDone = (chosenName: string) => {
    setStoredName(chosenName);
    void zero.mutate(mutators.sessions.upsert({ id: sessionId, name: chosenName }));
    markVisited();
    setShowWelcome(false);
  };

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
      {inGame && <ChatWindow hostId={hostId} myName={myName} />}
      {showWelcome && <WelcomeModal onDone={handleWelcomeDone} />}
    </div>
  );
}

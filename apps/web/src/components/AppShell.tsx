import { useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { queries } from "@games/shared";
import { useQuery } from "@rocicorp/zero/react";
import { ConnectionDebugPanel } from "./shared/ConnectionDebugPanel";
import { ChatWindow } from "./shared/ChatWindow";
import { Sidebar } from "./FloatingHeader";
import { Footer } from "./Footer";
import { ToastContainer } from "./shared/ToastContainer";
import { ChatProvider, useChatContext } from "../lib/chat-context";
import { getOrCreateSessionId } from "../lib/session";

export function AppShell() {
  return (
    <ChatProvider>
      <AppShellInner />
    </ChatProvider>
  );
}

function AppShellInner() {
  const { inGame, gameType, gameId } = useChatContext();
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
  const [sessions] = useQuery(queries.sessions.byId({ id: sessionId }));

  const hostId = gameType === "imposter"
    ? imposterGames[0]?.host_id ?? ""
    : gameType === "password"
      ? passwordGames[0]?.host_id ?? ""
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
      <ConnectionDebugPanel />
      {inGame && <ChatWindow hostId={hostId} myName={myName} />}
    </div>
  );
}

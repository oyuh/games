import { Outlet, Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { FiHome, FiMessageCircle, FiInfo, FiSettings, FiX, FiAward, FiGrid, FiHash, FiRepeat } from "react-icons/fi";
import { PiCrownSimpleFill } from "react-icons/pi";
import { useChatContext } from "../lib/chat-context";
import { MobileHostProvider, useMobileHost } from "../lib/mobile-host-context";
import { getOrCreateSessionId } from "../lib/session";
import { BottomSheet } from "./components/BottomSheet";
import { MobileChatSheet } from "./components/MobileChatSheet";
import { MobileOptionsSheet } from "./components/MobileOptionsSheet";
import { MobileInfoSheet } from "./components/MobileInfoSheet";
import { MobileHostControlsSheet } from "./components/MobileHostControlsSheet";
import { MobileLeaderboardSheet } from "./components/MobileLeaderboardSheet";
import { ToastContainer } from "../components/shared/ToastContainer";
import { ConnectionDebugPanel } from "../components/shared/ConnectionDebugPanel";
import { showToast } from "../lib/toast";

export function MobileLayout() {
  return (
    <MobileHostProvider>
      <MobileLayoutInner />
    </MobileHostProvider>
  );
}

function MobileLayoutInner() {
  const location = useLocation();
  const chat = useChatContext();
  const { hostGame } = useMobileHost();
  const [sheet, setSheet] = useState<"chat" | "info" | "options" | "host" | "leaderboard" | null>(null);
  const isHome = location.pathname === "/";
  const isShikaku = /^\/shikaku(\/|$)/.test(location.pathname);
  const sessionId = getOrCreateSessionId();

  // Track Shikaku infinite mode state
  const [infiniteEnabled, setInfiniteEnabled] = useState(false);
  const [infiniteCanToggle, setInfiniteCanToggle] = useState(true);

  // Track full game state for game-mode indicator
  const [shikakuState, setShikakuState] = useState<{
    phase: string; infiniteMode: boolean; customMode: boolean;
    showSeedInput: boolean; difficulty: string; seed: number | null;
  }>({ phase: "menu", infiniteMode: false, customMode: false, showSeedInput: false, difficulty: "easy", seed: null });

  useEffect(() => {
    if (!isShikaku) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { enabled: boolean; canToggle: boolean };
      setInfiniteEnabled(detail.enabled);
      setInfiniteCanToggle(detail.canToggle);
    };
    const stateHandler = (e: Event) => {
      setShikakuState((e as CustomEvent).detail);
    };
    window.addEventListener("shikaku-infinite-state", handler);
    window.addEventListener("shikaku-game-state", stateHandler);
    return () => {
      window.removeEventListener("shikaku-infinite-state", handler);
      window.removeEventListener("shikaku-game-state", stateHandler);
    };
  }, [isShikaku]);

  return (
    <div className="m-shell">
      <div className="m-shell-content">
        <Outlet />
      </div>

      {/* Bottom Navigation */}
      <nav className="m-bottomnav">
        <Link
          to="/"
          className={`m-nav-item${isHome ? " m-nav-item--active" : ""}`}
          onClick={(e) => {
            if (isHome) e.preventDefault();
          }}
        >
          <FiHome size={20} />
          <span>Home</span>
        </Link>

        {chat.inGame && !chat.isSpectator && (
          <button
            className={`m-nav-item${sheet === "chat" ? " m-nav-item--active" : ""}`}
            onClick={() => setSheet(sheet === "chat" ? null : "chat")}
          >
            <span style={{ position: "relative" }}>
              <FiMessageCircle size={20} />
              {chat.unread > 0 && (
                <span className="m-nav-badge">{chat.unread > 99 ? "99+" : chat.unread}</span>
              )}
            </span>
            <span>Chat</span>
          </button>
        )}

        {hostGame && (
          <button
            className={`m-nav-item${sheet === "host" ? " m-nav-item--active" : ""}`}
            onClick={() => setSheet(sheet === "host" ? null : "host")}
          >
            <PiCrownSimpleFill size={20} />
            <span>Host</span>
          </button>
        )}

        {isShikaku && (
          <button
            className={`m-nav-item${shikakuState.phase !== "menu" ? " m-nav-item--active" : ""}`}
            onClick={() => {
              const mode = shikakuState.customMode ? "Seeded" : shikakuState.infiniteMode ? "Infinite" : "Regular";
              const diff = shikakuState.difficulty.charAt(0).toUpperCase() + shikakuState.difficulty.slice(1);
              const phase = shikakuState.phase.charAt(0).toUpperCase() + shikakuState.phase.slice(1);
              const parts = [`${mode} — ${diff}`, `Phase: ${phase}`];
              if (shikakuState.seed) parts.push(`Seed: ${shikakuState.seed}`);
              parts.push(shikakuState.customMode || shikakuState.infiniteMode ? "Unranked" : "Ranked");
              showToast(parts.join(" — "), "info");
            }}
          >
            {shikakuState.customMode || shikakuState.showSeedInput
              ? <FiHash size={20} />
              : shikakuState.infiniteMode
                ? <FiRepeat size={20} />
                : <FiGrid size={20} />
            }
            <span>{shikakuState.customMode || shikakuState.showSeedInput ? "Seed" : shikakuState.infiniteMode ? "Infinite" : "Regular"}</span>
          </button>
        )}

        {isShikaku && (
          <button
            className={`m-nav-item${sheet === "leaderboard" ? " m-nav-item--active" : ""}`}
            onClick={() => setSheet(sheet === "leaderboard" ? null : "leaderboard")}
          >
            <FiAward size={20} />
            <span>Scores</span>
          </button>
        )}

        <button
          className={`m-nav-item${sheet === "info" ? " m-nav-item--active" : ""}`}
          onClick={() => setSheet(sheet === "info" ? null : "info")}
        >
          <FiInfo size={20} />
          <span>Info</span>
        </button>

        <button
          className={`m-nav-item${sheet === "options" ? " m-nav-item--active" : ""}`}
          onClick={() => setSheet(sheet === "options" ? null : "options")}
        >
          <FiSettings size={20} />
          <span>Options</span>
        </button>
      </nav>

      {/* Sheets */}
      {sheet === "chat" && chat.inGame && !chat.isSpectator && (
        <MobileChatSheet onClose={() => setSheet(null)} />
      )}
      {sheet === "host" && hostGame && (
        <MobileHostControlsSheet
          game={hostGame}
          sessionId={sessionId}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "info" && (
        <MobileInfoSheet onClose={() => setSheet(null)} />
      )}
      {sheet === "options" && (
        <MobileOptionsSheet onClose={() => setSheet(null)} />
      )}
      {sheet === "leaderboard" && (
        <MobileLeaderboardSheet onClose={() => setSheet(null)} />
      )}

      <ToastContainer />
      <ConnectionDebugPanel />
    </div>
  );
}

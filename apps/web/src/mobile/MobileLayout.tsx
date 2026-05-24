import { Outlet, Link, useLocation } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  FiAward,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiChevronUp,
  FiCornerUpLeft,
  FiEye,
  FiFlag,
  FiHash,
  FiHome,
  FiInfo,
  FiMessageCircle,
  FiMoreHorizontal,
  FiRepeat,
  FiSettings,
  FiSkipForward,
  FiTrash2,
} from "react-icons/fi";
import { FaCrown } from "react-icons/fa";
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
import { GameIcon } from "../components/shared/GameIcon";

type MobileSheet = "chat" | "info" | "options" | "host" | "leaderboard" | "actions" | null;
type ConfirmAction = "restart" | "give-up";

type ShikakuMobileState = {
  phase: string;
  infiniteMode: boolean;
  customMode: boolean;
  challengeMode: boolean;
  showSeedInput: boolean;
  difficulty: string;
  seed: number | null;
  canUndo: boolean;
  canClear: boolean;
  canRestart: boolean;
  canGiveUp: boolean;
  canLeaderboard: boolean;
  showScrollControls: boolean;
  canScroll: { up: boolean; down: boolean; left: boolean; right: boolean };
};

type PipsMobileState = {
  phase: string;
  runMode: string;
  difficulty: string;
  puzzleIndex: number;
  puzzleCount: number;
  placedCount: number;
  totalDominoes: number;
  remainingMoves: number;
  solved: boolean;
  canLeaderboard: boolean;
  canUndo: boolean;
  showDevTools: boolean;
  canDevSkip: boolean;
};

const DEFAULT_SHIKAKU_STATE: ShikakuMobileState = {
  phase: "menu",
  infiniteMode: false,
  customMode: false,
  challengeMode: false,
  showSeedInput: false,
  difficulty: "easy",
  seed: null,
  canUndo: false,
  canClear: false,
  canRestart: false,
  canGiveUp: false,
  canLeaderboard: true,
  showScrollControls: false,
  canScroll: { up: false, down: false, left: false, right: false },
};

const DEFAULT_PIPS_STATE: PipsMobileState = {
  phase: "menu",
  runMode: "ranked",
  difficulty: "easy",
  puzzleIndex: 0,
  puzzleCount: 3,
  placedCount: 0,
  totalDominoes: 0,
  remainingMoves: 0,
  solved: false,
  canLeaderboard: false,
  canUndo: false,
  showDevTools: false,
  canDevSkip: false,
};

function dispatchGameEvent(name: string) {
  window.dispatchEvent(new CustomEvent(name));
}

function titleCase(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function shikakuModeLabel(state: ShikakuMobileState) {
  if (state.customMode || state.showSeedInput) return "Seeded";
  if (state.infiniteMode) return "Infinite";
  if (state.challengeMode) return "Challenge";
  return "Ranked";
}

function pipsModeLabel(state: PipsMobileState) {
  return titleCase(state.runMode || "ranked");
}

function MobileActionButton({
  icon,
  label,
  detail,
  disabled,
  danger,
  confirm,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  detail: string;
  disabled?: boolean;
  danger?: boolean;
  confirm?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`m-game-action${danger ? " m-game-action--danger" : ""}${confirm ? " m-game-action--confirm" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="m-game-action-icon">{icon}</span>
      <span className="m-game-action-copy">
        <span className="m-game-action-label">{label}</span>
        <span className="m-game-action-detail">{detail}</span>
      </span>
    </button>
  );
}

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
  const [sheet, setSheet] = useState<MobileSheet>(null);
  const [shikakuConfirmAction, setShikakuConfirmAction] = useState<ConfirmAction | null>(null);
  const [pipsConfirmAction, setPipsConfirmAction] = useState<ConfirmAction | null>(null);
  const [shikakuState, setShikakuState] = useState<ShikakuMobileState>(DEFAULT_SHIKAKU_STATE);
  const [pipsState, setPipsState] = useState<PipsMobileState>(DEFAULT_PIPS_STATE);
  const isHome = location.pathname === "/";
  const isShikaku = /^\/shikaku(\/|$)/.test(location.pathname);
  const isPips = /^\/pips(\/|$)/.test(location.pathname);
  const hasGameActions = isShikaku || isPips;
  const sessionId = getOrCreateSessionId();

  useEffect(() => {
    setSheet(null);
    setShikakuConfirmAction(null);
    setPipsConfirmAction(null);
  }, [location.pathname]);

  useEffect(() => {
    if (!isShikaku) {
      setShikakuState(DEFAULT_SHIKAKU_STATE);
      return;
    }

    const stateHandler = (event: Event) => {
      setShikakuState((event as CustomEvent<ShikakuMobileState>).detail);
    };
    const openLeaderboard = () => setSheet("leaderboard");
    const openInfo = () => setSheet("info");

    window.addEventListener("shikaku-game-state", stateHandler);
    window.addEventListener("shikaku-open-leaderboard", openLeaderboard);
    window.addEventListener("shikaku-open-info", openInfo);
    return () => {
      window.removeEventListener("shikaku-game-state", stateHandler);
      window.removeEventListener("shikaku-open-leaderboard", openLeaderboard);
      window.removeEventListener("shikaku-open-info", openInfo);
    };
  }, [isShikaku]);

  useEffect(() => {
    if (!isPips) {
      setPipsState(DEFAULT_PIPS_STATE);
      return;
    }

    const stateHandler = (event: Event) => {
      setPipsState((event as CustomEvent<PipsMobileState>).detail);
    };

    window.addEventListener("pips-game-state", stateHandler);
    return () => window.removeEventListener("pips-game-state", stateHandler);
  }, [isPips]);

  useEffect(() => {
    if (!shikakuConfirmAction) return;
    const timeoutId = window.setTimeout(() => setShikakuConfirmAction(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [shikakuConfirmAction]);

  useEffect(() => {
    if (!pipsConfirmAction) return;
    const timeoutId = window.setTimeout(() => setPipsConfirmAction(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [pipsConfirmAction]);

  const handleShikakuConfirmedAction = useCallback((action: ConfirmAction) => {
    if (shikakuConfirmAction === action) {
      setShikakuConfirmAction(null);
      dispatchGameEvent(action === "restart" ? "shikaku-restart-run" : "shikaku-give-up");
      setSheet(null);
      return;
    }

    setShikakuConfirmAction(action);
    showToast(action === "restart" ? "Tap restart again to restart this run" : "Tap give up again to abandon this run", "info");
  }, [shikakuConfirmAction]);

  const handlePipsConfirmedAction = useCallback((action: ConfirmAction) => {
    if (pipsConfirmAction === action) {
      setPipsConfirmAction(null);
      dispatchGameEvent(action === "restart" ? "pips-restart-run" : "pips-give-up");
      setSheet(null);
      return;
    }

    setPipsConfirmAction(action);
    showToast(action === "restart" ? "Tap restart again to start a fresh seed" : "Tap give up again to abandon this run", "info");
  }, [pipsConfirmAction]);

  const renderGameActionsSheet = () => {
    if (isShikaku) {
      const mode = shikakuModeLabel(shikakuState);
      const difficulty = titleCase(shikakuState.difficulty);
      const phase = titleCase(shikakuState.phase);
      const ranked = shikakuState.customMode || shikakuState.showSeedInput || shikakuState.infiniteMode ? "Unranked" : "Ranked";

      return (
        <BottomSheet title="Shikaku Actions" onClose={() => setSheet(null)}>
          <div className="m-game-actions m-game-actions--shikaku">
            <section className="m-game-action-status">
              <div className="m-game-action-status-icon">
                {shikakuState.customMode || shikakuState.showSeedInput ? (
                  <FiHash size={22} />
                ) : shikakuState.infiniteMode ? (
                  <FiRepeat size={22} />
                ) : (
                  <GameIcon game="shikaku" size={22} />
                )}
              </div>
              <div className="m-game-action-status-copy">
                <span>{mode} - {difficulty}</span>
                <strong>{phase}</strong>
                <small>{shikakuState.seed ? `Seed ${shikakuState.seed} - ${ranked}` : ranked}</small>
              </div>
            </section>

            <div className="m-game-action-grid">
              <MobileActionButton
                icon={<FiCornerUpLeft size={18} />}
                label="Undo"
                detail="Last rectangle"
                disabled={!shikakuState.canUndo}
                onClick={() => {
                  dispatchGameEvent("shikaku-undo");
                  setSheet(null);
                }}
              />
              <MobileActionButton
                icon={<FiTrash2 size={18} />}
                label="Clear"
                detail="Placed rectangles"
                disabled={!shikakuState.canClear}
                onClick={() => {
                  dispatchGameEvent("shikaku-clear-board");
                  setSheet(null);
                }}
              />
              <MobileActionButton
                icon={<FiRepeat size={18} />}
                label={shikakuConfirmAction === "restart" ? "Confirm Restart" : "Restart"}
                detail="Fresh run"
                disabled={!shikakuState.canRestart}
                confirm={shikakuConfirmAction === "restart"}
                onClick={() => handleShikakuConfirmedAction("restart")}
              />
              <MobileActionButton
                icon={<FiFlag size={18} />}
                label={shikakuConfirmAction === "give-up" ? "Confirm Give Up" : "Give Up"}
                detail="End run"
                disabled={!shikakuState.canGiveUp}
                danger
                confirm={shikakuConfirmAction === "give-up"}
                onClick={() => handleShikakuConfirmedAction("give-up")}
              />
              <MobileActionButton
                icon={<FiAward size={18} />}
                label="Leaderboard"
                detail="Best times"
                disabled={!shikakuState.canLeaderboard}
                onClick={() => setSheet("leaderboard")}
              />
            </div>

            {shikakuState.showScrollControls && (
              <section className="m-game-actions-section">
                <h3>Large Puzzle Scroll</h3>
                <div className="m-game-scroll-grid">
                  <MobileActionButton
                    icon={<FiChevronUp size={18} />}
                    label="Up"
                    detail="Nudge board"
                    disabled={!shikakuState.canScroll.up}
                    onClick={() => {
                      dispatchGameEvent("shikaku-scroll-up");
                      setSheet(null);
                    }}
                  />
                  <MobileActionButton
                    icon={<FiChevronDown size={18} />}
                    label="Down"
                    detail="Nudge board"
                    disabled={!shikakuState.canScroll.down}
                    onClick={() => {
                      dispatchGameEvent("shikaku-scroll-down");
                      setSheet(null);
                    }}
                  />
                  <MobileActionButton
                    icon={<FiChevronLeft size={18} />}
                    label="Left"
                    detail="Nudge board"
                    disabled={!shikakuState.canScroll.left}
                    onClick={() => {
                      dispatchGameEvent("shikaku-scroll-left");
                      setSheet(null);
                    }}
                  />
                  <MobileActionButton
                    icon={<FiChevronRight size={18} />}
                    label="Right"
                    detail="Nudge board"
                    disabled={!shikakuState.canScroll.right}
                    onClick={() => {
                      dispatchGameEvent("shikaku-scroll-right");
                      setSheet(null);
                    }}
                  />
                </div>
              </section>
            )}
          </div>
        </BottomSheet>
      );
    }

    const phase = titleCase(pipsState.phase);
    const difficulty = titleCase(pipsState.difficulty);
    const progressText = pipsState.phase === "menu"
      ? `${pipsModeLabel(pipsState)} setup`
      : `Puzzle ${Math.min(pipsState.puzzleIndex + 1, pipsState.puzzleCount)} of ${pipsState.puzzleCount}`;

    return (
      <BottomSheet title="Pips Actions" onClose={() => setSheet(null)}>
        <div className="m-game-actions m-game-actions--pips">
          <section className="m-game-action-status">
            <div className="m-game-action-status-icon">
              <GameIcon game="pips" size={22} />
            </div>
            <div className="m-game-action-status-copy">
              <span>{pipsModeLabel(pipsState)} - {difficulty}</span>
              <strong>{phase}</strong>
              <small>{progressText} - {pipsState.placedCount}/{pipsState.totalDominoes} placed</small>
            </div>
          </section>

          <div className="m-game-action-grid">
            <MobileActionButton
              icon={<FiCornerUpLeft size={18} />}
              label="Undo"
              detail="Last domino"
              disabled={pipsState.phase !== "playing" || !pipsState.canUndo}
              onClick={() => {
                dispatchGameEvent("pips-undo");
                setSheet(null);
              }}
            />
            <MobileActionButton
              icon={<FiRepeat size={18} />}
              label={pipsConfirmAction === "restart" ? "Confirm Restart" : "Restart"}
              detail="Fresh seed"
              disabled={pipsState.phase === "menu"}
              confirm={pipsConfirmAction === "restart"}
              onClick={() => handlePipsConfirmedAction("restart")}
            />
            <MobileActionButton
              icon={<FiFlag size={18} />}
              label={pipsConfirmAction === "give-up" ? "Confirm Give Up" : "Give Up"}
              detail="End run"
              disabled={pipsState.phase === "menu" || pipsState.phase === "complete"}
              danger
              confirm={pipsConfirmAction === "give-up"}
              onClick={() => handlePipsConfirmedAction("give-up")}
            />
            <MobileActionButton
              icon={<FiAward size={18} />}
              label="Leaderboard"
              detail="Best runs"
              disabled={!pipsState.canLeaderboard}
              onClick={() => {
                dispatchGameEvent("pips-toggle-leaderboard");
                setSheet(null);
              }}
            />
          </div>

          {pipsState.showDevTools && (
            <section className="m-game-actions-section">
              <h3>Dev Tools</h3>
              <div className="m-game-action-grid">
                <MobileActionButton
                  icon={<FiEye size={18} />}
                  label="DEV Solve"
                  detail="Reveal answer"
                  onClick={() => {
                    dispatchGameEvent("pips-dev-solution");
                    setSheet(null);
                  }}
                />
                <MobileActionButton
                  icon={<FiSkipForward size={18} />}
                  label="DEV Skip"
                  detail="Next puzzle"
                  disabled={!pipsState.canDevSkip}
                  onClick={() => {
                    dispatchGameEvent("pips-dev-skip");
                    setSheet(null);
                  }}
                />
              </div>
            </section>
          )}
        </div>
      </BottomSheet>
    );
  };

  return (
    <div className="m-shell">
      <div className="m-shell-content">
        <Outlet />
      </div>

      <nav className="m-bottomnav" aria-label="Mobile navigation">
        <Link
          to="/"
          className={`m-nav-item${isHome ? " m-nav-item--active" : ""}`}
          onClick={(event) => {
            if (isHome) event.preventDefault();
          }}
        >
          <FiHome size={20} />
          <span>Home</span>
        </Link>

        {chat.inGame && !chat.isSpectator && (
          <button
            type="button"
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
            type="button"
            className={`m-nav-item${sheet === "host" ? " m-nav-item--active" : ""}`}
            onClick={() => setSheet(sheet === "host" ? null : "host")}
          >
            <FaCrown size={19} />
            <span>Host</span>
          </button>
        )}

        {hasGameActions && (
          <button
            type="button"
            className={`m-nav-item${sheet === "actions" ? " m-nav-item--active" : ""}`}
            onClick={() => setSheet(sheet === "actions" ? null : "actions")}
          >
            <FiMoreHorizontal size={20} />
            <span>Actions</span>
          </button>
        )}

        <button
          type="button"
          className={`m-nav-item${sheet === "info" ? " m-nav-item--active" : ""}`}
          onClick={() => setSheet(sheet === "info" ? null : "info")}
        >
          <FiInfo size={20} />
          <span>Info</span>
        </button>

        <button
          type="button"
          className={`m-nav-item${sheet === "options" ? " m-nav-item--active" : ""}`}
          onClick={() => setSheet(sheet === "options" ? null : "options")}
        >
          <FiSettings size={20} />
          <span>Options</span>
        </button>
      </nav>

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
      {sheet === "actions" && hasGameActions && renderGameActionsSheet()}

      <ToastContainer />
      <ConnectionDebugPanel />
    </div>
  );
}

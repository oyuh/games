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
  FiHome,
  FiInfo,
  FiMessageCircle,
  FiMoreHorizontal,
  FiRepeat,
  FiSettings,
  FiSkipForward,
  FiTarget,
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
import { ToastContainer } from "../components/shared/ToastContainer";
import { DebugPanels } from "../components/shared/DebugPanels";
import { showToast } from "../lib/toast";
import { emitSolo, useSoloEvent, type PipsState, type ShikakuState, type ZipState } from "../lib/solo-bus";

type MobileSheet = "chat" | "info" | "options" | "host" | "actions" | null;
type ConfirmAction = "restart" | "give-up";

/* These used to be hand-copied from what the pages dispatch, with every
   field widened to `string`. They come from the bus now, so a change to
   either page's payload fails the build here instead of silently. */
const DEFAULT_SHIKAKU_STATE: ShikakuState = {
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
  showDevTools: false,
  canDevSkip: false,
};

const DEFAULT_PIPS_STATE: PipsState = {
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

const DEFAULT_ZIP_STATE: ZipState = {
  phase: "menu",
  canUndo: false,
  canClear: false,
  hint: true,
  canRestart: false,
  canGiveUp: false,
  showDevTools: false,
  canDevSolve: false,
  canDevSkip: false,
};

function titleCase(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function shikakuModeLabel(state: ShikakuState) {
  if (state.customMode || state.showSeedInput) return "Seeded";
  if (state.infiniteMode) return "Infinite";
  if (state.challengeMode) return "Challenge";
  return "Ranked";
}

function pipsModeLabel(state: PipsState) {
  return titleCase(state.runMode || "ranked");
}

type SheetAction = {
  icon: ReactNode;
  label: string;
  detail: string;
  disabled?: boolean;
  danger?: boolean;
  confirm?: boolean;
  onClick: () => void;
};

function ActionList({ actions }: { actions: SheetAction[] }) {
  return (
    <ul className="m-list">
      {actions.map((action, index) => (
        <li key={index}>
          <button
            type="button"
            className={`m-row${action.danger ? " m-row--danger" : ""}${action.confirm ? " m-row--confirm" : ""}`}
            disabled={action.disabled}
            onClick={action.onClick}
          >
            <span className="m-row-icon">{action.icon}</span>
            <span className="m-row-text">
              <span className="m-row-title">{action.label}</span>
              <span className="m-row-meta">{action.detail}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
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
  const [shikakuState, setShikakuState] = useState<ShikakuState>(DEFAULT_SHIKAKU_STATE);
  const [pipsState, setPipsState] = useState<PipsState>(DEFAULT_PIPS_STATE);
  const [zipConfirmAction, setZipConfirmAction] = useState<ConfirmAction | null>(null);
  const [zipState, setZipState] = useState<ZipState>(DEFAULT_ZIP_STATE);
  const isHome = location.pathname === "/";
  /* Home drops you out of whatever you are in the middle of, so it takes a
     second tap there, like Restart and Give up do. */
  const [homeArmed, setHomeArmed] = useState(false);
  const isShikaku = /^\/shikaku(\/|$)/.test(location.pathname);
  const isPips = /^\/pips(\/|$)/.test(location.pathname);
  const isZip = /^\/zip(\/|$)/.test(location.pathname);
  const hasGameActions = isShikaku || isPips || isZip;
  const sessionId = getOrCreateSessionId();

  useEffect(() => {
    setSheet(null);
    setShikakuConfirmAction(null);
    setPipsConfirmAction(null);
    setZipConfirmAction(null);
    setHomeArmed(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!homeArmed) return;
    const timeoutId = window.setTimeout(() => setHomeArmed(false), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [homeArmed]);

  /* Only the mounted page emits these, and a page is only mounted on its own
     route, so subscribing unconditionally is the same as the old per-route
     listeners. The effects below still clear state on the way out. */
  useSoloEvent("shikaku-game-state", setShikakuState);
  useSoloEvent("pips-game-state", setPipsState);
  useSoloEvent("zip-game-state", setZipState);

  useEffect(() => {
    if (!isZip) setZipState(DEFAULT_ZIP_STATE);
  }, [isZip]);

  useEffect(() => {
    if (!zipConfirmAction) return;
    const timeoutId = window.setTimeout(() => setZipConfirmAction(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [zipConfirmAction]);

  const handleZipConfirmedAction = (action: ConfirmAction) => {
    if (zipConfirmAction === action) {
      setZipConfirmAction(null);
      emitSolo(action === "restart" ? "zip-restart-run" : "zip-give-up");
      setSheet(null);
      return;
    }
    setZipConfirmAction(action);
    showToast(action === "restart" ? "Tap restart again to restart this run" : "Tap give up again to end this run", "info");
  };

  useEffect(() => {
    if (!isShikaku) setShikakuState(DEFAULT_SHIKAKU_STATE);
  }, [isShikaku]);

  useEffect(() => {
    if (!isPips) setPipsState(DEFAULT_PIPS_STATE);
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
      emitSolo(action === "restart" ? "shikaku-restart-run" : "shikaku-give-up");
      setSheet(null);
      return;
    }

    setShikakuConfirmAction(action);
    showToast(action === "restart" ? "Tap restart again to restart this run" : "Tap give up again to abandon this run", "info");
  }, [shikakuConfirmAction]);

  const handlePipsConfirmedAction = useCallback((action: ConfirmAction) => {
    if (pipsConfirmAction === action) {
      setPipsConfirmAction(null);
      emitSolo(action === "restart" ? "pips-restart-run" : "pips-give-up");
      setSheet(null);
      return;
    }

    setPipsConfirmAction(action);
    showToast(action === "restart" ? "Tap restart again to start a fresh seed" : "Tap give up again to abandon this run", "info");
  }, [pipsConfirmAction]);

  const midGame = (chat.inGame && !chat.isSpectator)
    || (isShikaku && shikakuState.phase === "playing")
    || (isPips && pipsState.phase === "playing")
    || (isZip && zipState.phase === "playing");

  const renderGameActionsSheet = () => {
    if (isZip) {
      return (
        <BottomSheet title="Zip" onClose={() => setSheet(null)}>
          <div className="m-sheet-stack">
            <p className="m-sheet-meta meta-parts"><span>{titleCase(zipState.phase)}</span></p>
            <ActionList
              actions={[
                { icon: <FiCornerUpLeft size={18} />, label: "Undo", detail: "Last square", disabled: !zipState.canUndo, onClick: () => { emitSolo("zip-undo"); setSheet(null); } },
                { icon: <FiTrash2 size={18} />, label: "Clear", detail: "Whole line", disabled: !zipState.canClear, onClick: () => { emitSolo("zip-clear"); setSheet(null); } },
                { icon: <FiTarget size={18} />, label: zipState.hint ? "Hint on" : "Hint off", detail: "Ring the next number", onClick: () => emitSolo("zip-toggle-hint") },
                { icon: <FiRepeat size={18} />, label: zipConfirmAction === "restart" ? "Tap again to restart" : "Restart", detail: "Fresh run", disabled: !zipState.canRestart, confirm: zipConfirmAction === "restart", onClick: () => handleZipConfirmedAction("restart") },
                { icon: <FiFlag size={18} />, label: zipConfirmAction === "give-up" ? "Tap again to give up" : "Give up", detail: "End run", disabled: !zipState.canGiveUp, danger: true, confirm: zipConfirmAction === "give-up", onClick: () => handleZipConfirmedAction("give-up") },
                { icon: <FiAward size={18} />, label: "Leaderboard", detail: "Best times", onClick: () => { emitSolo("zip-toggle-leaderboard"); setSheet(null); } },
              ]}
            />

            {zipState.showDevTools && (
              <section className="m-section">
                <h3 className="m-label">Dev tools</h3>
                <ActionList
                  actions={[
                    { icon: <FiEye size={18} />, label: "Solve", detail: "This board", disabled: !zipState.canDevSolve, onClick: () => { emitSolo("zip-dev-solve"); setSheet(null); } },
                    { icon: <FiSkipForward size={18} />, label: "Skip", detail: "Solve the rest", disabled: !zipState.canDevSkip, onClick: () => { emitSolo("zip-dev-skip"); setSheet(null); } },
                  ]}
                />
              </section>
            )}
          </div>
        </BottomSheet>
      );
    }

    if (isShikaku) {
      const ranked = shikakuState.customMode || shikakuState.showSeedInput || shikakuState.infiniteMode ? "Unranked" : "Ranked";
      const summary = [shikakuModeLabel(shikakuState), titleCase(shikakuState.difficulty), titleCase(shikakuState.phase)];
      if (shikakuState.seed) summary.push(`Seed ${shikakuState.seed}`);
      if (ranked !== shikakuModeLabel(shikakuState)) summary.push(ranked);

      return (
        <BottomSheet title="Shikaku" onClose={() => setSheet(null)}>
          <div className="m-sheet-stack">
            <p className="m-sheet-meta meta-parts">{summary.map((part, i) => <span key={i}>{part}</span>)}</p>
            <ActionList
              actions={[
                { icon: <FiCornerUpLeft size={18} />, label: "Undo", detail: "Last rectangle", disabled: !shikakuState.canUndo, onClick: () => { emitSolo("shikaku-undo"); setSheet(null); } },
                { icon: <FiTrash2 size={18} />, label: "Clear", detail: "Placed rectangles", disabled: !shikakuState.canClear, onClick: () => { emitSolo("shikaku-clear-board"); setSheet(null); } },
                { icon: <FiRepeat size={18} />, label: shikakuConfirmAction === "restart" ? "Tap again to restart" : "Restart", detail: "Fresh run", disabled: !shikakuState.canRestart, confirm: shikakuConfirmAction === "restart", onClick: () => handleShikakuConfirmedAction("restart") },
                { icon: <FiFlag size={18} />, label: shikakuConfirmAction === "give-up" ? "Tap again to give up" : "Give up", detail: "End run", disabled: !shikakuState.canGiveUp, danger: true, confirm: shikakuConfirmAction === "give-up", onClick: () => handleShikakuConfirmedAction("give-up") },
                { icon: <FiAward size={18} />, label: "Leaderboard", detail: "Best times", disabled: !shikakuState.canLeaderboard, onClick: () => { emitSolo("shikaku-toggle-leaderboard"); setSheet(null); } },
              ]}
            />

            {shikakuState.showScrollControls && (
              <section className="m-section">
                <h3 className="m-label">Move the board</h3>
                <ActionList
                  actions={[
                    { icon: <FiChevronUp size={18} />, label: "Up", detail: "Nudge board", disabled: !shikakuState.canScroll.up, onClick: () => { emitSolo("shikaku-scroll-up"); setSheet(null); } },
                    { icon: <FiChevronDown size={18} />, label: "Down", detail: "Nudge board", disabled: !shikakuState.canScroll.down, onClick: () => { emitSolo("shikaku-scroll-down"); setSheet(null); } },
                    { icon: <FiChevronLeft size={18} />, label: "Left", detail: "Nudge board", disabled: !shikakuState.canScroll.left, onClick: () => { emitSolo("shikaku-scroll-left"); setSheet(null); } },
                    { icon: <FiChevronRight size={18} />, label: "Right", detail: "Nudge board", disabled: !shikakuState.canScroll.right, onClick: () => { emitSolo("shikaku-scroll-right"); setSheet(null); } },
                  ]}
                />
              </section>
            )}

            {shikakuState.showDevTools && (
              <section className="m-section">
                <h3 className="m-label">Dev tools</h3>
                <ActionList
                  actions={[
                    { icon: <FiEye size={18} />, label: "Solve", detail: "Fill answer", disabled: shikakuState.phase !== "playing", onClick: () => { emitSolo("shikaku-dev-solve"); setSheet(null); } },
                    { icon: <FiSkipForward size={18} />, label: "Skip", detail: "Next puzzle", disabled: !shikakuState.canDevSkip, onClick: () => { emitSolo("shikaku-dev-skip"); setSheet(null); } },
                  ]}
                />
              </section>
            )}
          </div>
        </BottomSheet>
      );
    }

    const progressText = pipsState.phase === "menu"
      ? `${pipsModeLabel(pipsState)} setup`
      : `Puzzle ${Math.min(pipsState.puzzleIndex + 1, pipsState.puzzleCount)} of ${pipsState.puzzleCount}`;
    const summary = [pipsModeLabel(pipsState), titleCase(pipsState.difficulty), progressText, `${pipsState.placedCount}/${pipsState.totalDominoes} placed`];

    return (
      <BottomSheet title="Pips" onClose={() => setSheet(null)}>
        <div className="m-sheet-stack">
          <p className="m-sheet-meta meta-parts">{summary.map((part, i) => <span key={i}>{part}</span>)}</p>
          <ActionList
            actions={[
              { icon: <FiCornerUpLeft size={18} />, label: "Undo", detail: "Last domino", disabled: pipsState.phase !== "playing" || !pipsState.canUndo, onClick: () => { emitSolo("pips-undo"); setSheet(null); } },
              { icon: <FiRepeat size={18} />, label: pipsConfirmAction === "restart" ? "Tap again to restart" : "Restart", detail: "Fresh seed", disabled: pipsState.phase === "menu", confirm: pipsConfirmAction === "restart", onClick: () => handlePipsConfirmedAction("restart") },
              { icon: <FiFlag size={18} />, label: pipsConfirmAction === "give-up" ? "Tap again to give up" : "Give up", detail: "End run", disabled: pipsState.phase === "menu" || pipsState.phase === "complete", danger: true, confirm: pipsConfirmAction === "give-up", onClick: () => handlePipsConfirmedAction("give-up") },
              { icon: <FiAward size={18} />, label: "Leaderboard", detail: "Best runs", disabled: !pipsState.canLeaderboard, onClick: () => { emitSolo("pips-toggle-leaderboard"); setSheet(null); } },
            ]}
          />

          {pipsState.showDevTools && (
            <section className="m-section">
              <h3 className="m-label">Dev tools</h3>
              <ActionList
                actions={[
                  { icon: <FiEye size={18} />, label: "Solve", detail: "Reveal answer", onClick: () => { emitSolo("pips-dev-solution"); setSheet(null); } },
                  { icon: <FiSkipForward size={18} />, label: "Skip", detail: "Next puzzle", disabled: !pipsState.canDevSkip, onClick: () => { emitSolo("pips-dev-skip"); setSheet(null); } },
                ]}
              />
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
          className={`m-nav-item${isHome && sheet === null ? " m-nav-item--active" : ""}${homeArmed ? " m-nav-item--armed" : ""}`}
          aria-current={isHome ? "page" : undefined}
          onClick={(event) => {
            if (isHome) {
              event.preventDefault();
              return;
            }
            if (midGame && !homeArmed) {
              event.preventDefault();
              setHomeArmed(true);
              showToast(chat.inGame ? "Tap Home again to leave the game" : "Tap Home again to leave this run", "info");
            }
          }}
        >
          <FiHome size={20} />
          <span>{homeArmed ? "Leave?" : "Home"}</span>
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
      {sheet === "actions" && hasGameActions && renderGameActionsSheet()}

      <ToastContainer />
      <DebugPanels />
    </div>
  );
}

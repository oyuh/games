import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { FiHome, FiMenu, FiX, FiSettings, FiInfo, FiMessageCircle, FiAward, FiHash, FiRepeat, FiCornerUpLeft, FiEye, FiFlag, FiSkipForward, FiChevronUp, FiChevronDown, FiChevronLeft, FiChevronRight, FiTrash2 } from "react-icons/fi";
import { FaCrown } from "react-icons/fa";
import { queries } from "@games/shared";
import { useQuery } from "@rocicorp/zero/react";
import type { GameContext } from "./shared/HostControlsModal";
import { updateSettings, useSettings } from "../lib/settings";
import { useIsMobile } from "../hooks/useIsMobile";
import { getDisplayName, getOrCreateSessionId } from "../lib/session";
import { useChatContext } from "../lib/chat-context";
import { showToast } from "../lib/toast";
import { GameIcon } from "./shared/GameIcon";

const ImposterDemo = lazy(() => import("./demos/ImposterDemo").then(({ ImposterDemo }) => ({ default: ImposterDemo })));
const PasswordDemo = lazy(() => import("./demos/PasswordDemo").then(({ PasswordDemo }) => ({ default: PasswordDemo })));
const ChainDemo = lazy(() => import("./demos/ChainDemo").then(({ ChainDemo }) => ({ default: ChainDemo })));
const ShadeDemo = lazy(() => import("./demos/ShadeDemo").then(({ ShadeDemo }) => ({ default: ShadeDemo })));
const LocationDemo = lazy(() => import("./demos/LocationDemo").then(({ LocationDemo }) => ({ default: LocationDemo })));
const ShikakuDemo = lazy(() => import("./demos/ShikakuDemo").then(({ ShikakuDemo }) => ({ default: ShikakuDemo })));
const PipsDemo = lazy(() => import("./demos/PipsDemo").then(({ PipsDemo }) => ({ default: PipsDemo })));
const OptionsModal = lazy(() => import("./shared/OptionsModal").then(({ OptionsModal }) => ({ default: OptionsModal })));
const InfoModal = lazy(() => import("./shared/InfoModal").then(({ InfoModal }) => ({ default: InfoModal })));
const HostControlsModal = lazy(() =>
  import("./shared/HostControlsModal").then(({ HostControlsModal }) => ({ default: HostControlsModal }))
);

function useGameContext(): GameContext | null {
  const { pathname } = useLocation();
  const sessionId = getOrCreateSessionId();

  // Parse route to find game type + id
  const imposterMatch = pathname.match(/^\/imposter\/([^/]+)/);
  const passwordMatch = pathname.match(/^\/password\/([^/]+)/);
  const chainMatch2 = pathname.match(/^\/chain\/([^/]+)/);
  const shadeMatch = pathname.match(/^\/shade\/([^/]+)/);
  const locationMatch = pathname.match(/^\/location\/([^/]+)/);
  const gameType = imposterMatch ? "imposter" as const : passwordMatch ? "password" as const : chainMatch2 ? "chain_reaction" as const : shadeMatch ? "shade_signal" as const : locationMatch ? "location_signal" as const : null;
  const gameId = imposterMatch?.[1] ?? passwordMatch?.[1] ?? chainMatch2?.[1] ?? shadeMatch?.[1] ?? locationMatch?.[1] ?? "";

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

  const [sessions] = useQuery(
    gameType === "password" && gameId
      ? queries.sessions.byGame({ gameType: "password", gameId })
      : queries.sessions.byGame({ gameType: "password", gameId: "__none__" })
  );

  return useMemo(() => {
    if (gameType === "imposter") {
      const game = imposterGames[0];
      if (!game || game.host_id !== sessionId) return null;
      return {
        type: "imposter",
        gameId: game.id,
        hostId: game.host_id,
        isPublic: game.is_public,
        players: game.players,
        spectators: game.spectators ?? [],
      };
    }
    if (gameType === "password") {
      const game = passwordGames[0];
      if (!game || game.host_id !== sessionId) return null;
      const sessionNames = sessions.reduce<Record<string, string>>((acc, s) => {
        acc[s.id] = getDisplayName(s.name, s.id);
        return acc;
      }, {});
      const allPlayers = game.teams.flatMap((t) =>
        t.members.map((id) => ({ id, name: sessionNames[id] ?? getDisplayName(null, id) }))
      );
      return {
        type: "password",
        gameId: game.id,
        hostId: game.host_id,
        isPublic: game.is_public,
        players: allPlayers,
        spectators: game.spectators ?? [],
      };
    }
    if (gameType === "chain_reaction") {
      const game = chainGames[0];
      if (!game || game.host_id !== sessionId) return null;
      return {
        type: "chain_reaction",
        gameId: game.id,
        hostId: game.host_id,
        isPublic: game.is_public,
        players: game.players,
        spectators: game.spectators ?? [],
      };
    }
    if (gameType === "shade_signal") {
      const game = shadeGames[0];
      if (!game || game.host_id !== sessionId) return null;
      return {
        type: "shade_signal",
        gameId: game.id,
        hostId: game.host_id,
        isPublic: game.is_public,
        players: game.players,
        spectators: game.spectators ?? [],
      };
    }
    if (gameType === "location_signal") {
      const game = locationGames[0];
      if (!game || game.host_id !== sessionId) return null;
      return {
        type: "location_signal",
        gameId: game.id,
        hostId: game.host_id,
        isPublic: game.is_public,
        players: game.players,
        spectators: game.spectators ?? [],
      };
    }
    return null;
  }, [gameType, imposterGames, passwordGames, chainGames, shadeGames, locationGames, sessions, sessionId]);
}

/* ── Phase → demo step mappings ─────────────────────────── */

const IMPOSTER_STEP: Record<string, number> = { lobby: 0, playing: 1, voting: 3, results: 4, finished: 4 };
const PASSWORD_STEP: Record<string, number> = { lobby: 0, playing: 1, results: 3, finished: 3 };
const CHAIN_STEP: Record<string, number> = { lobby: 0, submitting: 1, playing: 2, finished: 4 };
const SHADE_STEP: Record<string, number> = { lobby: 0, picking: 1, clue1: 2, guess1: 2, clue2: 3, guess2: 3, reveal: 4, finished: 4 };
const LOCATION_STEP: Record<string, number> = { lobby: 0, picking: 1, clue1: 2, guess1: 2, clue2: 3, guess2: 3, clue3: 3, guess3: 3, clue4: 3, guess4: 3, reveal: 4, finished: 4 };

function useGameDemoInfo(): { gameType: "imposter" | "password" | "chain" | "shade" | "location" | "shikaku" | "pips" | null; step: number } {
  const { pathname } = useLocation();
  const imposterMatch = pathname.match(/^\/imposter\/([^/]+)/);
  const passwordMatch = pathname.match(/^\/password\/([^/]+)/);
  const chainMatch = pathname.match(/^\/chain\/([^/]+)/);
  const shadeMatch = pathname.match(/^\/shade\/([^/]+)/);
  const locationMatch = pathname.match(/^\/location\/([^/]+)/);
  const shikakuMatch = /^\/shikaku(\/|$)/.test(pathname);
  const pipsMatch = /^\/pips(\/|$)/.test(pathname);

  const detected = imposterMatch ? "imposter" as const
    : passwordMatch ? "password" as const
    : chainMatch ? "chain" as const
    : shadeMatch ? "shade" as const
    : locationMatch ? "location" as const
    : shikakuMatch ? "shikaku" as const
    : pipsMatch ? "pips" as const
    : null;

  const gameId = imposterMatch?.[1] ?? passwordMatch?.[1] ?? chainMatch?.[1] ?? shadeMatch?.[1] ?? locationMatch?.[1] ?? "";

  const [imp] = useQuery(detected === "imposter" ? queries.imposter.byId({ id: gameId }) : queries.imposter.byId({ id: "__none__" }));
  const [pwd] = useQuery(detected === "password" ? queries.password.byId({ id: gameId }) : queries.password.byId({ id: "__none__" }));
  const [chr] = useQuery(detected === "chain" ? queries.chainReaction.byId({ id: gameId }) : queries.chainReaction.byId({ id: "__none__" }));
  const [shd] = useQuery(detected === "shade" ? queries.shadeSignal.byId({ id: gameId }) : queries.shadeSignal.byId({ id: "__none__" }));
  const [loc] = useQuery(detected === "location" ? queries.locationSignal.byId({ id: gameId }) : queries.locationSignal.byId({ id: "__none__" }));

  return useMemo(() => {
    if (detected === "imposter") return { gameType: "imposter", step: IMPOSTER_STEP[imp[0]?.phase ?? "lobby"] ?? 0 };
    if (detected === "password") return { gameType: "password", step: PASSWORD_STEP[pwd[0]?.phase ?? "lobby"] ?? 0 };
    if (detected === "chain") return { gameType: "chain", step: CHAIN_STEP[chr[0]?.phase ?? "lobby"] ?? 0 };
    if (detected === "shade") return { gameType: "shade", step: SHADE_STEP[shd[0]?.phase ?? "lobby"] ?? 0 };
    if (detected === "location") return { gameType: "location", step: LOCATION_STEP[loc[0]?.phase ?? "lobby"] ?? 0 };
    if (detected === "shikaku") return { gameType: "shikaku", step: 0 };
    if (detected === "pips") return { gameType: "pips", step: 0 };
    return { gameType: null, step: 0 };
  }, [detected, imp, pwd, chr, shd, loc]);
}

/** Gap (px) the custom sidebar keeps from the viewport edges. */
const SIDEBAR_MARGIN = 12;
/** Snap grid: N divisions per axis → (N + 1)² placements (24 here = 625 spots). */
const SIDEBAR_GRID_DIVISIONS = 24;

function snapFraction(f: number): number {
  const clamped = Math.min(1, Math.max(0, f));
  return Math.round(clamped * SIDEBAR_GRID_DIVISIONS) / SIDEBAR_GRID_DIVISIONS;
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modal, setModal] = useState<"options" | "info" | "host" | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [shikakuConfirmAction, setShikakuConfirmAction] = useState<"restart" | "give-up" | null>(null);
  const [pipsConfirmAction, setPipsConfirmAction] = useState<"restart" | "give-up" | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shikakuConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pipsConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const settings = useSettings();
  const isMobile = useIsMobile();
  const navRef = useRef<HTMLElement>(null);
  // While dragging we follow the cursor in raw px; on release we convert to a
  // snapped fraction of the viewport (see handleDragEnd) so it survives resizes.
  const [dragPx, setDragPx] = useState<{ x: number; y: number } | null>(null);
  const dragMeta = useRef<{ grabX: number; grabY: number; w: number; h: number } | null>(null);
  // Custom free-placement is desktop-only; on mobile the drawer takes over.
  const customActive = settings.sidebarCustom && !isMobile;

  const handleDragMove = useCallback((e: PointerEvent) => {
    const meta = dragMeta.current;
    if (!meta) return;
    const x = Math.min(Math.max(SIDEBAR_MARGIN, e.clientX - meta.grabX), window.innerWidth - meta.w - SIDEBAR_MARGIN);
    const y = Math.min(Math.max(SIDEBAR_MARGIN, e.clientY - meta.grabY), window.innerHeight - meta.h - SIDEBAR_MARGIN);
    setDragPx({ x, y });
  }, []);

  const handleDragEnd = useCallback(() => {
    window.removeEventListener("pointermove", handleDragMove);
    window.removeEventListener("pointerup", handleDragEnd);
    const nav = navRef.current;
    const meta = dragMeta.current;
    dragMeta.current = null;
    if (nav && meta) {
      const rect = nav.getBoundingClientRect();
      // Convert the dropped pixel position into a snapped fraction of the
      // available travel space, so it stays correct across window resizes.
      const travelX = window.innerWidth - rect.width - 2 * SIDEBAR_MARGIN;
      const travelY = window.innerHeight - rect.height - 2 * SIDEBAR_MARGIN;
      const fx = snapFraction(travelX > 0 ? (rect.left - SIDEBAR_MARGIN) / travelX : 0);
      const fy = snapFraction(travelY > 0 ? (rect.top - SIDEBAR_MARGIN) / travelY : 0);
      updateSettings({ sidebarCustomPos: { fx, fy } });
    }
    setDragPx(null);
  }, [handleDragMove]);

  const handleDragStart = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const nav = navRef.current;
    if (!nav) return;
    const rect = nav.getBoundingClientRect();
    dragMeta.current = { grabX: e.clientX - rect.left, grabY: e.clientY - rect.top, w: rect.width, h: rect.height };
    setDragPx({ x: rect.left, y: rect.top });
    window.addEventListener("pointermove", handleDragMove);
    window.addEventListener("pointerup", handleDragEnd);
  }, [handleDragMove, handleDragEnd]);

  // Detach drag listeners if the sidebar unmounts mid-drag.
  useEffect(() => () => {
    window.removeEventListener("pointermove", handleDragMove);
    window.removeEventListener("pointerup", handleDragEnd);
  }, [handleDragMove, handleDragEnd]);

  const gameContext = useGameContext();
  const demoInfo = useGameDemoInfo();
  const sessionId = getOrCreateSessionId();
  const chat = useChatContext();

  const isInGame = /^\/(imposter|password|chain|shade|location)\/|^\/shikaku(\/|$)|^\/pips(\/|$)/.test(pathname);
  const isShikaku = /^\/shikaku(\/|$)/.test(pathname);
  const isPips = /^\/pips(\/|$)/.test(pathname);

  // Track infinite mode state from ShikakuPage
  const [infiniteEnabled, setInfiniteEnabled] = useState(false);
  const [infiniteCanToggle, setInfiniteCanToggle] = useState(true);

  // Track full game state for game-mode indicator
  const [shikakuState, setShikakuState] = useState<{
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
  }>({
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
  });
  const [pipsState, setPipsState] = useState<{
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
  }>({
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
  });

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

  useEffect(() => {
    if (!isPips) return;
    const stateHandler = (e: Event) => {
      setPipsState((e as CustomEvent).detail);
    };
    window.addEventListener("pips-game-state", stateHandler);
    return () => window.removeEventListener("pips-game-state", stateHandler);
  }, [isPips]);

  useEffect(() => {
    setMobileOpen(false);
    setConfirmLeave(false);
    setShikakuConfirmAction(null);
    setPipsConfirmAction(null);
  }, [pathname]);

  // Auto-dismiss confirm after 3 seconds
  useEffect(() => {
    if (confirmLeave) {
      confirmTimerRef.current = setTimeout(() => setConfirmLeave(false), 3000);
      return () => { if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current); };
    }
  }, [confirmLeave]);

  useEffect(() => {
    if (shikakuConfirmAction) {
      shikakuConfirmTimerRef.current = setTimeout(() => setShikakuConfirmAction(null), 3000);
      return () => { if (shikakuConfirmTimerRef.current) clearTimeout(shikakuConfirmTimerRef.current); };
    }
  }, [shikakuConfirmAction]);

  useEffect(() => {
    if (pipsConfirmAction) {
      pipsConfirmTimerRef.current = setTimeout(() => setPipsConfirmAction(null), 3000);
      return () => { if (pipsConfirmTimerRef.current) clearTimeout(pipsConfirmTimerRef.current); };
    }
  }, [pipsConfirmAction]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const handleHomeClick = useCallback((e: React.MouseEvent) => {
    if (!isInGame) return; // Let normal link behavior work
    e.preventDefault();
    if (confirmLeave) {
      // Second click = confirmed
      setConfirmLeave(false);
      navigate("/");
    } else {
      setConfirmLeave(true);
    }
  }, [isInGame, confirmLeave, navigate]);

  const handlePipsConfirmedAction = useCallback((action: "restart" | "give-up") => {
    if (pipsConfirmAction === action) {
      setPipsConfirmAction(null);
      window.dispatchEvent(new CustomEvent(action === "restart" ? "pips-restart-run" : "pips-give-up"));
      setMobileOpen(false);
      return;
    }

    setPipsConfirmAction(action);
    showToast(action === "restart" ? "Click restart again to start a fresh seed" : "Click give up again to abandon this run", "info");
  }, [pipsConfirmAction]);

  const handleShikakuConfirmedAction = useCallback((action: "restart" | "give-up") => {
    if (shikakuConfirmAction === action) {
      setShikakuConfirmAction(null);
      window.dispatchEvent(new CustomEvent(action === "restart" ? "shikaku-restart-run" : "shikaku-give-up"));
      setMobileOpen(false);
      return;
    }

    setShikakuConfirmAction(action);
    showToast(action === "restart" ? "Click restart again to restart this run" : "Click give up again to abandon this run", "info");
  }, [shikakuConfirmAction]);

  const isTop = settings.sidebarPosition === "top";

  let navStyle: CSSProperties | undefined;
  if (customActive) {
    if (dragPx) {
      navStyle = { left: dragPx.x, top: dragPx.y, right: "auto", bottom: "auto", transform: "none" };
    } else {
      // Position via viewport-percentage + a self-relative translate so the bar
      // spans flush-edge to flush-edge across [0,1] and stays on-screen on resize,
      // keeping a fixed SIDEBAR_MARGIN gap at the extremes — all in pure CSS.
      const { fx, fy } = settings.sidebarCustomPos;
      const m = SIDEBAR_MARGIN;
      navStyle = {
        left: `${fx * 100}%`,
        top: `${fy * 100}%`,
        right: "auto",
        bottom: "auto",
        transform: `translate(calc(${-fx * 100}% + ${(0.5 - fx) * 2 * m}px), calc(${-fy * 100}% + ${(0.5 - fy) * 2 * m}px))`,
      };
    }
  }

  // The tab always sits on the sidebar edge that faces the open screen: a
  // horizontal bar in the right half gets it on the left (and vice versa); a
  // vertical bar in the bottom half gets it on top (and vice versa).
  const tabSide: "left" | "right" | "top" | "bottom" =
    settings.sidebarOrientation === "horizontal"
      ? settings.sidebarCustomPos.fx >= 0.5
        ? "left"
        : "right"
      : settings.sidebarCustomPos.fy >= 0.5
        ? "top"
        : "bottom";

  return (
    <>
      {/* Mobile toggle - always rendered; CSS hides on desktop */}
      <button
        onClick={() => setMobileOpen((o) => !o)}
        aria-label="Toggle menu"
        className="sidebar-mobile-toggle"
      >
        {mobileOpen ? <FiX size={26} /> : <FiMenu size={26} />}
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <button type="button" className="sidebar-overlay" onClick={() => setMobileOpen(false)} aria-label="Close menu" />
      )}

      {/* Floating sidebar / top bar */}
      <nav
        ref={navRef}
        className={`sidebar ${mobileOpen ? "sidebar--open" : ""}${customActive ? " sidebar--custom" : ""}${dragPx ? " sidebar--dragging" : ""}`}
        style={navStyle}
      >
        {customActive && settings.sidebarDragEnabled && (
          <button
            type="button"
            className={`sidebar-drag-tab sidebar-drag-tab--${tabSide}`}
            onPointerDown={handleDragStart}
            aria-label="Drag sidebar to reposition"
          />
        )}
        <Link
          to="/"
          className={`sidebar-link ${pathname === "/" ? "sidebar-link--active" : ""} ${confirmLeave ? "sidebar-link--confirm" : ""}`}
          data-tooltip={confirmLeave ? "Click again to leave game" : "Home"}
          data-tooltip-pos="right"
          data-tooltip-variant={confirmLeave ? "danger" : undefined}
          onClick={handleHomeClick}
        >
          <FiHome size={24} />
          <span className="sidebar-link-label">{confirmLeave ? "Leave?" : "Home"}</span>
        </Link>
        {gameContext && (
          <SidebarButton
            icon={<FaCrown size={22} className="sidebar-host-icon" />}
            label="Host"
            onClick={() => { setModal("host"); setMobileOpen(false); }}
          />
        )}
        {chat.inGame && !chat.isSpectator && (
          <SidebarButton
            icon={
              <span className="sidebar-chat-icon-wrap">
                <FiMessageCircle size={24} />
                {chat.unread > 0 && (
                  <span className="sidebar-chat-badge">{chat.unread > 99 ? "99+" : chat.unread}</span>
                )}
              </span>
            }
            label="Chat"
            onClick={() => { chat.toggle(); setMobileOpen(false); }}
          />
        )}
        {/^\/shikaku(\/|$)/.test(pathname) && (
          <>
            <button
              className={`sidebar-link shikaku-mode-indicator${shikakuState.phase !== "menu" ? " shikaku-mode-indicator--active" : ""}`}
              data-tooltip={
                shikakuState.challengeMode
                  ? `Challenge - ${shikakuState.difficulty} - seed ${shikakuState.seed}`
                  : shikakuState.customMode
                  ? `Seeded - ${shikakuState.difficulty} - seed ${shikakuState.seed}`
                  : shikakuState.infiniteMode
                    ? `Infinite - ${shikakuState.difficulty}`
                    : `Regular - ${shikakuState.difficulty}`
              }
              data-tooltip-pos="right"
              onClick={() => {
                const mode = shikakuState.challengeMode ? "Challenge" : shikakuState.customMode ? "Seeded" : shikakuState.infiniteMode ? "Infinite" : "Regular";
                const diff = shikakuState.difficulty.charAt(0).toUpperCase() + shikakuState.difficulty.slice(1);
                const phase = shikakuState.phase.charAt(0).toUpperCase() + shikakuState.phase.slice(1);
                const parts = [`${mode} - ${diff}`, `Phase: ${phase}`];
                if (shikakuState.seed) parts.push(`Seed: ${shikakuState.seed}`);
                if (shikakuState.challengeMode) parts.push("Challenge");
                else if (shikakuState.customMode) parts.push("Unranked");
                else if (shikakuState.infiniteMode) parts.push("Unranked");
                else parts.push("Ranked");
                showToast(parts.join(" - "), "info");
                setMobileOpen(false);
              }}
            >
              {shikakuState.challengeMode
                ? <FiFlag size={24} />
                : shikakuState.customMode || shikakuState.showSeedInput
                ? <FiHash size={24} />
                : shikakuState.infiniteMode
                  ? <FiRepeat size={24} />
                  : <GameIcon game="shikaku" size={24} />
              }
              <span className="sidebar-link-label">
                {shikakuState.challengeMode ? "Challenge" : shikakuState.customMode || shikakuState.showSeedInput ? "Seed" : shikakuState.infiniteMode ? "Infinite" : "Regular"}
              </span>
            </button>
            <SidebarButton
              icon={<FiCornerUpLeft size={24} />}
              label="Undo"
              disabled={!shikakuState.canUndo}
              className="sidebar-link--shikaku"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("shikaku-undo"));
                setMobileOpen(false);
              }}
            />
            <SidebarButton
              icon={<FiTrash2 size={24} />}
              label="Clear"
              disabled={!shikakuState.canClear}
              className="sidebar-link--shikaku"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("shikaku-clear-board"));
                setMobileOpen(false);
              }}
            />
            <SidebarButton
              icon={<FiRepeat size={24} />}
              label={shikakuConfirmAction === "restart" ? "Confirm Restart" : "Restart"}
              disabled={!shikakuState.canRestart}
              className={`sidebar-link--shikaku${shikakuConfirmAction === "restart" ? " sidebar-link--shikaku-confirm" : ""}`}
              tooltipVariant={shikakuConfirmAction === "restart" ? "danger" : undefined}
              onClick={() => handleShikakuConfirmedAction("restart")}
            />
            <SidebarButton
              icon={<FiFlag size={24} />}
              label={shikakuConfirmAction === "give-up" ? "Confirm Give Up" : "Give Up"}
              disabled={!shikakuState.canGiveUp}
              className={`sidebar-link--shikaku${shikakuConfirmAction === "give-up" ? " sidebar-link--shikaku-confirm" : ""}`}
              tooltipVariant={shikakuConfirmAction === "give-up" ? "danger" : undefined}
              onClick={() => handleShikakuConfirmedAction("give-up")}
            />
            <SidebarButton
              icon={<FiAward size={24} />}
              label="Leaderboard"
              disabled={!shikakuState.canLeaderboard}
              className="sidebar-link--shikaku"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("shikaku-toggle-leaderboard"));
                setMobileOpen(false);
              }}
            />
            {shikakuState.showScrollControls && (
              <>
                <span className="sidebar-separator" aria-hidden="true" />
                <SidebarButton
                  icon={<FiChevronUp size={24} />}
                  label="Scroll Up"
                  disabled={!shikakuState.canScroll.up}
                  className="sidebar-link--shikaku"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("shikaku-scroll-up"));
                    setMobileOpen(false);
                  }}
                />
                <SidebarButton
                  icon={<FiChevronDown size={24} />}
                  label="Scroll Down"
                  disabled={!shikakuState.canScroll.down}
                  className="sidebar-link--shikaku"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("shikaku-scroll-down"));
                    setMobileOpen(false);
                  }}
                />
                <SidebarButton
                  icon={<FiChevronLeft size={24} />}
                  label="Scroll Left"
                  disabled={!shikakuState.canScroll.left}
                  className="sidebar-link--shikaku"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("shikaku-scroll-left"));
                    setMobileOpen(false);
                  }}
                />
                <SidebarButton
                  icon={<FiChevronRight size={24} />}
                  label="Scroll Right"
                  disabled={!shikakuState.canScroll.right}
                  className="sidebar-link--shikaku"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("shikaku-scroll-right"));
                    setMobileOpen(false);
                  }}
                />
              </>
            )}
          </>
        )}
        {isPips && (
          <>
            <SidebarButton
              icon={<FiCornerUpLeft size={24} />}
              label="Undo"
              disabled={pipsState.phase !== "playing" || !pipsState.canUndo}
              className="sidebar-link--pips"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("pips-undo"));
                setMobileOpen(false);
              }}
            />
            <SidebarButton
              icon={<FiRepeat size={24} />}
              label={pipsConfirmAction === "restart" ? "Confirm Restart" : "Restart"}
              disabled={pipsState.phase === "menu"}
              className={`sidebar-link--pips${pipsConfirmAction === "restart" ? " sidebar-link--pips-confirm" : ""}`}
              tooltipVariant={pipsConfirmAction === "restart" ? "danger" : undefined}
              onClick={() => handlePipsConfirmedAction("restart")}
            />
            <SidebarButton
              icon={<FiFlag size={24} />}
              label={pipsConfirmAction === "give-up" ? "Confirm Give Up" : "Give Up"}
              disabled={pipsState.phase === "menu" || pipsState.phase === "complete"}
              className={`sidebar-link--pips${pipsConfirmAction === "give-up" ? " sidebar-link--pips-confirm" : ""}`}
              tooltipVariant={pipsConfirmAction === "give-up" ? "danger" : undefined}
              onClick={() => handlePipsConfirmedAction("give-up")}
            />
            <SidebarButton
              icon={<FiAward size={24} />}
              label="Leaderboard"
              disabled={!pipsState.canLeaderboard}
              className="sidebar-link--pips"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("pips-toggle-leaderboard"));
                setMobileOpen(false);
              }}
            />
            {/* <SidebarButton
              icon={<FiPlusCircle size={24} />}
              label="Add Score"
              className="sidebar-link--pips"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("pips-open-admin-score"));
                setMobileOpen(false);
              }}
            /> */}
            {pipsState.showDevTools && (
              <>
                <span className="sidebar-separator" aria-hidden="true" />
                <SidebarButton
                  icon={<FiEye size={24} />}
                  label="DEV Solve"
                  className="sidebar-link--pips"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("pips-dev-solution"));
                    setMobileOpen(false);
                  }}
                />
                <SidebarButton
                  icon={<FiSkipForward size={24} />}
                  label="DEV Skip"
                  disabled={!pipsState.canDevSkip}
                  className="sidebar-link--pips"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("pips-dev-skip"));
                    setMobileOpen(false);
                  }}
                />
              </>
            )}
          </>
        )}
        <SidebarButton icon={<FiInfo size={24} />} label="Info" onClick={() => { setModal("info"); setMobileOpen(false); }} />
        <SidebarButton icon={<FiSettings size={24} />} label="Options" onClick={() => { setModal("options"); setMobileOpen(false); }} />
      </nav>

      {/* Modals */}
      <Suspense fallback={null}>
        {modal === "options" && <OptionsModal onClose={() => setModal(null)} />}
        {modal === "info" && demoInfo.gameType === "imposter" && <ImposterDemo initialStep={demoInfo.step} onClose={() => setModal(null)} />}
        {modal === "info" && demoInfo.gameType === "password" && <PasswordDemo initialStep={demoInfo.step} onClose={() => setModal(null)} />}
        {modal === "info" && demoInfo.gameType === "chain" && <ChainDemo initialStep={demoInfo.step} onClose={() => setModal(null)} />}
        {modal === "info" && demoInfo.gameType === "shade" && <ShadeDemo initialStep={demoInfo.step} onClose={() => setModal(null)} />}
        {modal === "info" && demoInfo.gameType === "location" && <LocationDemo initialStep={demoInfo.step} onClose={() => setModal(null)} />}
        {modal === "info" && demoInfo.gameType === "shikaku" && <ShikakuDemo onClose={() => setModal(null)} />}
        {modal === "info" && demoInfo.gameType === "pips" && <PipsDemo onClose={() => setModal(null)} />}
        {modal === "info" && !demoInfo.gameType && <InfoModal onClose={() => setModal(null)} />}
        {modal === "host" && gameContext && (
          <HostControlsModal game={gameContext} sessionId={sessionId} onClose={() => setModal(null)} />
        )}
      </Suspense>
    </>
  );
}

function SidebarLink({
  to,
  icon,
  label,
  active,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <Link to={to} className={`sidebar-link ${active ? "sidebar-link--active" : ""}`} data-tooltip={label} data-tooltip-pos="right">
      {icon}
      <span className="sidebar-link-label">{label}</span>
    </Link>
  );
}

function SidebarButton({
  icon,
  label,
  onClick,
  disabled,
  className = "",
  tooltipVariant,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  tooltipVariant?: string | undefined;
}) {
  return (
    <button
      className={`sidebar-link ${className}`}
      data-tooltip={label}
      data-tooltip-pos="right"
      data-tooltip-variant={tooltipVariant}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={disabled ? { opacity: 0.35, cursor: 'not-allowed', pointerEvents: 'none' } : undefined}
    >
      {icon}
      <span className="sidebar-link-label">{label}</span>
    </button>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { FiHome, FiMenu, FiX, FiSettings, FiInfo, FiMessageCircle, FiAward, FiGrid, FiHash, FiRepeat } from "react-icons/fi";
import { PiCrownSimpleFill } from "react-icons/pi";
import { queries } from "@games/shared";
import { useQuery } from "@rocicorp/zero/react";
import { OptionsModal } from "./shared/OptionsModal";
import { InfoModal } from "./shared/InfoModal";
import { HostControlsModal } from "./shared/HostControlsModal";
import { ImposterDemo } from "./demos/ImposterDemo";
import { PasswordDemo } from "./demos/PasswordDemo";
import { ChainDemo } from "./demos/ChainDemo";
import { ShadeDemo } from "./demos/ShadeDemo";
import { LocationDemo } from "./demos/LocationDemo";
import { ShikakuDemo } from "./demos/ShikakuDemo";
import { useSettings } from "../lib/settings";
import { getOrCreateSessionId } from "../lib/session";
import { useChatContext } from "../lib/chat-context";
import { showToast } from "../lib/toast";

type GameContext = Parameters<typeof HostControlsModal>[0]["game"];

function useGameContext(): GameContext | null {
  const location = useLocation();
  const sessionId = getOrCreateSessionId();

  // Parse route to find game type + id
  const imposterMatch = location.pathname.match(/^\/imposter\/([^/]+)/);
  const passwordMatch = location.pathname.match(/^\/password\/([^/]+)/);
  const chainMatch2 = location.pathname.match(/^\/chain\/([^/]+)/);
  const shadeMatch = location.pathname.match(/^\/shade\/([^/]+)/);
  const locationMatch = location.pathname.match(/^\/location\/([^/]+)/);
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
        acc[s.id] = s.name ?? s.id.slice(0, 6);
        return acc;
      }, {});
      const allPlayers = game.teams.flatMap((t) =>
        t.members.map((id) => ({ id, name: sessionNames[id] ?? id.slice(0, 6) }))
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

function useGameDemoInfo(): { gameType: "imposter" | "password" | "chain" | "shade" | "location" | "shikaku" | null; step: number } {
  const location = useLocation();
  const imposterMatch = location.pathname.match(/^\/imposter\/([^/]+)/);
  const passwordMatch = location.pathname.match(/^\/password\/([^/]+)/);
  const chainMatch = location.pathname.match(/^\/chain\/([^/]+)/);
  const shadeMatch = location.pathname.match(/^\/shade\/([^/]+)/);
  const locationMatch = location.pathname.match(/^\/location\/([^/]+)/);
  const shikakuMatch = /^\/shikaku(\/|$)/.test(location.pathname);

  const detected = imposterMatch ? "imposter" as const
    : passwordMatch ? "password" as const
    : chainMatch ? "chain" as const
    : shadeMatch ? "shade" as const
    : locationMatch ? "location" as const
    : shikakuMatch ? "shikaku" as const
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
    return { gameType: null, step: 0 };
  }, [detected, imp, pwd, chr, shd, loc]);
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modal, setModal] = useState<"options" | "info" | "host" | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const settings = useSettings();
  const gameContext = useGameContext();
  const demoInfo = useGameDemoInfo();
  const sessionId = getOrCreateSessionId();
  const chat = useChatContext();

  const isInGame = /^\/(imposter|password|chain|shade|location)\/|^\/shikaku(\/|$)/.test(location.pathname);
  const isShikaku = /^\/shikaku(\/|$)/.test(location.pathname);

  // Track infinite mode state from ShikakuPage
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

  useEffect(() => {
    setMobileOpen(false);
    setConfirmLeave(false);
  }, [location.pathname]);

  // Auto-dismiss confirm after 3 seconds
  useEffect(() => {
    if (confirmLeave) {
      confirmTimerRef.current = setTimeout(() => setConfirmLeave(false), 3000);
      return () => { if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current); };
    }
  }, [confirmLeave]);

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

  const isTop = settings.sidebarPosition === "top";

  return (
    <>
      {/* Mobile toggle — always rendered; CSS hides on desktop */}
      <button
        onClick={() => setMobileOpen((o) => !o)}
        aria-label="Toggle menu"
        className="sidebar-mobile-toggle"
      >
        {mobileOpen ? <FiX size={26} /> : <FiMenu size={26} />}
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}

      {/* Floating sidebar / top bar */}
      <nav className={`sidebar ${mobileOpen ? "sidebar--open" : ""}`}>
        <Link
          to="/"
          className={`sidebar-link ${location.pathname === "/" ? "sidebar-link--active" : ""} ${confirmLeave ? "sidebar-link--confirm" : ""}`}
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
            icon={<PiCrownSimpleFill size={24} className="sidebar-host-icon" />}
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
        {/^\/shikaku(\/|$)/.test(location.pathname) && (
          <>
            <button
              className={`sidebar-link shikaku-mode-indicator${shikakuState.phase !== "menu" ? " shikaku-mode-indicator--active" : ""}`}
              data-tooltip={
                shikakuState.customMode
                  ? `Seeded — ${shikakuState.difficulty} — seed ${shikakuState.seed}`
                  : shikakuState.infiniteMode
                    ? `Infinite — ${shikakuState.difficulty}`
                    : `Regular — ${shikakuState.difficulty}`
              }
              data-tooltip-pos="right"
              onClick={() => {
                const mode = shikakuState.customMode ? "Seeded" : shikakuState.infiniteMode ? "Infinite" : "Regular";
                const diff = shikakuState.difficulty.charAt(0).toUpperCase() + shikakuState.difficulty.slice(1);
                const phase = shikakuState.phase.charAt(0).toUpperCase() + shikakuState.phase.slice(1);
                const parts = [`${mode} — ${diff}`, `Phase: ${phase}`];
                if (shikakuState.seed) parts.push(`Seed: ${shikakuState.seed}`);
                if (shikakuState.customMode) parts.push("Unranked");
                else if (shikakuState.infiniteMode) parts.push("Unranked");
                else parts.push("Ranked");
                showToast(parts.join(" — "), "info");
                setMobileOpen(false);
              }}
            >
              {shikakuState.customMode || shikakuState.showSeedInput
                ? <FiHash size={24} />
                : shikakuState.infiniteMode
                  ? <FiRepeat size={24} />
                  : <FiGrid size={24} />
              }
              <span className="sidebar-link-label">
                {shikakuState.customMode || shikakuState.showSeedInput ? "Seed" : shikakuState.infiniteMode ? "Infinite" : "Regular"}
              </span>
            </button>
            <SidebarButton
              icon={<FiAward size={24} />}
              label="Leaderboard"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("shikaku-toggle-leaderboard"));
                setMobileOpen(false);
              }}
            />
          </>
        )}
        <SidebarButton icon={<FiInfo size={24} />} label="Info" onClick={() => { setModal("info"); setMobileOpen(false); }} />
        <SidebarButton icon={<FiSettings size={24} />} label="Options" onClick={() => { setModal("options"); setMobileOpen(false); }} />
      </nav>

      {/* Modals */}
      {modal === "options" && <OptionsModal onClose={() => setModal(null)} />}
      {modal === "info" && demoInfo.gameType === "imposter" && <ImposterDemo initialStep={demoInfo.step} onClose={() => setModal(null)} />}
      {modal === "info" && demoInfo.gameType === "password" && <PasswordDemo initialStep={demoInfo.step} onClose={() => setModal(null)} />}
      {modal === "info" && demoInfo.gameType === "chain" && <ChainDemo initialStep={demoInfo.step} onClose={() => setModal(null)} />}
      {modal === "info" && demoInfo.gameType === "shade" && <ShadeDemo initialStep={demoInfo.step} onClose={() => setModal(null)} />}
      {modal === "info" && demoInfo.gameType === "location" && <LocationDemo initialStep={demoInfo.step} onClose={() => setModal(null)} />}
      {modal === "info" && demoInfo.gameType === "shikaku" && <ShikakuDemo onClose={() => setModal(null)} />}
      {modal === "info" && !demoInfo.gameType && <InfoModal onClose={() => setModal(null)} />}
      {modal === "host" && gameContext && (
        <HostControlsModal game={gameContext} sessionId={sessionId} onClose={() => setModal(null)} />
      )}
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

function SidebarButton({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      className="sidebar-link"
      data-tooltip={label}
      data-tooltip-pos="right"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={disabled ? { opacity: 0.35, cursor: 'not-allowed', pointerEvents: 'none' } : undefined}
    >
      {icon}
      <span className="sidebar-link-label">{label}</span>
    </button>
  );
}

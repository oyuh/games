import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { FiHome, FiMenu, FiX, FiSettings, FiInfo, FiMessageCircle } from "react-icons/fi";
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
import { useSettings } from "../lib/settings";
import { getOrCreateSessionId } from "../lib/session";
import { useChatContext } from "../lib/chat-context";

type GameContext = Parameters<typeof HostControlsModal>[0]["game"];

function useGameContext(): GameContext | null {
  const location = useLocation();
  const sessionId = getOrCreateSessionId();

  // Parse route to find game type + id
  const imposterMatch = location.pathname.match(/^\/imposter\/([^/]+)/);
  const passwordMatch = location.pathname.match(/^\/password\/([^/]+)/);
  const chainMatch2 = location.pathname.match(/^\/chain\/([^/]+)/);
  const shadeMatch = location.pathname.match(/^\/shade\/([^/]+)/);
  const gameType = imposterMatch ? "imposter" as const : passwordMatch ? "password" as const : chainMatch2 ? "chain_reaction" as const : shadeMatch ? "shade_signal" as const : null;
  const gameId = imposterMatch?.[1] ?? passwordMatch?.[1] ?? chainMatch2?.[1] ?? shadeMatch?.[1] ?? "";

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
        players: game.players,
        spectators: game.spectators ?? [],
      };
    }
    return null;
  }, [gameType, imposterGames, passwordGames, chainGames, shadeGames, sessions, sessionId]);
}

/* ── Phase → demo step mappings ─────────────────────────── */

const IMPOSTER_STEP: Record<string, number> = { lobby: 0, playing: 1, voting: 3, results: 4, finished: 4 };
const PASSWORD_STEP: Record<string, number> = { lobby: 0, playing: 1, results: 3, finished: 3 };
const CHAIN_STEP: Record<string, number> = { lobby: 0, submitting: 1, playing: 2, finished: 4 };
const SHADE_STEP: Record<string, number> = { lobby: 0, picking: 1, clue1: 2, guess1: 2, clue2: 3, guess2: 3, reveal: 4, finished: 4 };

function useGameDemoInfo(): { gameType: "imposter" | "password" | "chain" | "shade" | null; step: number } {
  const location = useLocation();
  const imposterMatch = location.pathname.match(/^\/imposter\/([^/]+)/);
  const passwordMatch = location.pathname.match(/^\/password\/([^/]+)/);
  const chainMatch = location.pathname.match(/^\/chain\/([^/]+)/);
  const shadeMatch = location.pathname.match(/^\/shade\/([^/]+)/);

  const detected = imposterMatch ? "imposter" as const
    : passwordMatch ? "password" as const
    : chainMatch ? "chain" as const
    : shadeMatch ? "shade" as const
    : null;

  const gameId = imposterMatch?.[1] ?? passwordMatch?.[1] ?? chainMatch?.[1] ?? shadeMatch?.[1] ?? "";

  const [imp] = useQuery(detected === "imposter" ? queries.imposter.byId({ id: gameId }) : queries.imposter.byId({ id: "__none__" }));
  const [pwd] = useQuery(detected === "password" ? queries.password.byId({ id: gameId }) : queries.password.byId({ id: "__none__" }));
  const [chr] = useQuery(detected === "chain" ? queries.chainReaction.byId({ id: gameId }) : queries.chainReaction.byId({ id: "__none__" }));
  const [shd] = useQuery(detected === "shade" ? queries.shadeSignal.byId({ id: gameId }) : queries.shadeSignal.byId({ id: "__none__" }));

  return useMemo(() => {
    if (detected === "imposter") return { gameType: "imposter", step: IMPOSTER_STEP[imp[0]?.phase ?? "lobby"] ?? 0 };
    if (detected === "password") return { gameType: "password", step: PASSWORD_STEP[pwd[0]?.phase ?? "lobby"] ?? 0 };
    if (detected === "chain") return { gameType: "chain", step: CHAIN_STEP[chr[0]?.phase ?? "lobby"] ?? 0 };
    if (detected === "shade") return { gameType: "shade", step: SHADE_STEP[shd[0]?.phase ?? "lobby"] ?? 0 };
    return { gameType: null, step: 0 };
  }, [detected, imp, pwd, chr, shd]);
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

  const isInGame = /^\/(imposter|password|chain|shade)\//.test(location.pathname);

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
        {mobileOpen ? <FiX size={22} /> : <FiMenu size={22} />}
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
          <FiHome size={20} />
          <span className="sidebar-link-label">{confirmLeave ? "Leave?" : "Home"}</span>
        </Link>
        {gameContext && (
          <SidebarButton
            icon={<PiCrownSimpleFill size={20} className="sidebar-host-icon" />}
            label="Host"
            onClick={() => { setModal("host"); setMobileOpen(false); }}
          />
        )}
        {chat.inGame && !chat.isSpectator && (
          <SidebarButton
            icon={
              <span className="sidebar-chat-icon-wrap">
                <FiMessageCircle size={20} />
                {chat.unread > 0 && (
                  <span className="sidebar-chat-badge">{chat.unread > 99 ? "99+" : chat.unread}</span>
                )}
              </span>
            }
            label="Chat"
            onClick={() => { chat.toggle(); setMobileOpen(false); }}
          />
        )}
        <SidebarButton icon={<FiInfo size={20} />} label="Info" onClick={() => { setModal("info"); setMobileOpen(false); }} />
        <SidebarButton icon={<FiSettings size={20} />} label="Options" onClick={() => { setModal("options"); setMobileOpen(false); }} />
      </nav>

      {/* Modals */}
      {modal === "options" && <OptionsModal onClose={() => setModal(null)} />}
      {modal === "info" && demoInfo.gameType === "imposter" && <ImposterDemo initialStep={demoInfo.step} onClose={() => setModal(null)} />}
      {modal === "info" && demoInfo.gameType === "password" && <PasswordDemo initialStep={demoInfo.step} onClose={() => setModal(null)} />}
      {modal === "info" && demoInfo.gameType === "chain" && <ChainDemo initialStep={demoInfo.step} onClose={() => setModal(null)} />}
      {modal === "info" && demoInfo.gameType === "shade" && <ShadeDemo initialStep={demoInfo.step} onClose={() => setModal(null)} />}
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

function SidebarButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="sidebar-link" data-tooltip={label} data-tooltip-pos="right" onClick={onClick}>
      {icon}
      <span className="sidebar-link-label">{label}</span>
    </button>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { FiHome, FiMenu, FiX, FiSettings, FiInfo } from "react-icons/fi";
import { PiCrownSimpleFill } from "react-icons/pi";
import { queries } from "@games/shared";
import { useQuery } from "@rocicorp/zero/react";
import { OptionsModal } from "./shared/OptionsModal";
import { InfoModal } from "./shared/InfoModal";
import { HostControlsModal } from "./shared/HostControlsModal";
import { useSettings } from "../lib/settings";
import { getOrCreateSessionId } from "../lib/session";

type GameContext = Parameters<typeof HostControlsModal>[0]["game"];

function useGameContext(): GameContext | null {
  const location = useLocation();
  const sessionId = getOrCreateSessionId();

  // Parse route to find game type + id
  const imposterMatch = location.pathname.match(/^\/imposter\/([^/]+)/);
  const passwordMatch = location.pathname.match(/^\/password\/([^/]+)/);
  const gameType = imposterMatch ? "imposter" as const : passwordMatch ? "password" as const : null;
  const gameId = imposterMatch?.[1] ?? passwordMatch?.[1] ?? "";

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

  return useMemo(() => {
    if (gameType === "imposter") {
      const game = imposterGames[0];
      if (!game || game.host_id !== sessionId) return null;
      return {
        type: "imposter",
        gameId: game.id,
        hostId: game.host_id,
        players: game.players,
      };
    }
    if (gameType === "password") {
      const game = passwordGames[0];
      if (!game || game.host_id !== sessionId) return null;
      const allPlayers = game.teams.flatMap((t) =>
        t.members.map((id) => ({ id, name: id.slice(0, 6) }))
      );
      return {
        type: "password",
        gameId: game.id,
        hostId: game.host_id,
        players: allPlayers,
      };
    }
    return null;
  }, [gameType, imposterGames, passwordGames, sessionId]);
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modal, setModal] = useState<"options" | "info" | "host" | null>(null);
  const location = useLocation();
  const settings = useSettings();
  const gameContext = useGameContext();
  const sessionId = getOrCreateSessionId();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const isTop = settings.sidebarPosition === "top";

  return (
    <>
      {/* Mobile toggle */}
      {!isTop && (
        <button
          onClick={() => setMobileOpen((o) => !o)}
          aria-label="Toggle menu"
          className="sidebar-mobile-toggle"
        >
          {mobileOpen ? <FiX size={18} /> : <FiMenu size={18} />}
        </button>
      )}

      {/* Mobile backdrop */}
      {mobileOpen && !isTop && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}

      {/* Floating sidebar / top bar */}
      <nav className={`sidebar ${mobileOpen ? "sidebar--open" : ""}`}>
        <SidebarLink to="/" icon={<FiHome size={16} />} label="Home" active={location.pathname === "/"} />
        {gameContext && (
          <SidebarButton
            icon={<PiCrownSimpleFill size={16} className="sidebar-host-icon" />}
            label="Host"
            onClick={() => { setModal("host"); setMobileOpen(false); }}
          />
        )}
        <SidebarButton icon={<FiInfo size={16} />} label="Info" onClick={() => { setModal("info"); setMobileOpen(false); }} />
        <SidebarButton icon={<FiSettings size={16} />} label="Options" onClick={() => { setModal("options"); setMobileOpen(false); }} />
      </nav>

      {/* Modals */}
      {modal === "options" && <OptionsModal onClose={() => setModal(null)} />}
      {modal === "info" && <InfoModal onClose={() => setModal(null)} />}
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
    <Link to={to} className={`sidebar-link ${active ? "sidebar-link--active" : ""}`} title={label}>
      {icon}
      <span className="sidebar-link-label">{label}</span>
    </Link>
  );
}

function SidebarButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="sidebar-link" title={label} onClick={onClick}>
      {icon}
      <span className="sidebar-link-label">{label}</span>
    </button>
  );
}

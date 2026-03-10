import { FiEye, FiLogOut } from "react-icons/fi";

interface SpectatorOverlayProps {
  phase: string;
  playerCount: number;
  onLeave: () => void;
}

export function SpectatorOverlay({ phase, playerCount, onLeave }: SpectatorOverlayProps) {
  return (
    <div className="game-section spectator-overlay">
      <div className="game-waiting">
        <FiEye size={20} style={{ opacity: 0.6 }} />
        <p className="spectator-overlay-text">
          You are spectating this game
        </p>
        <p className="spectator-overlay-sub">
          {playerCount} player{playerCount !== 1 ? "s" : ""} &middot; {phase}
        </p>
        <button className="btn btn-muted btn-sm" onClick={onLeave} style={{ marginTop: "0.5rem" }}>
          <FiLogOut size={14} /> Leave
        </button>
      </div>
    </div>
  );
}

export function MobileSpectatorOverlay({ phase, playerCount, onLeave }: SpectatorOverlayProps) {
  return (
    <div className="m-section spectator-overlay">
      <div className="m-waiting">
        <FiEye size={18} style={{ opacity: 0.6 }} />
        <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
          You are spectating this game
        </p>
        <p style={{ fontSize: "0.75rem", opacity: 0.5 }}>
          {playerCount} player{playerCount !== 1 ? "s" : ""} &middot; {phase}
        </p>
        <button className="m-btn m-btn-muted m-btn-sm" onClick={onLeave} style={{ marginTop: "0.5rem" }}>
          <FiLogOut size={12} /> Leave
        </button>
      </div>
    </div>
  );
}

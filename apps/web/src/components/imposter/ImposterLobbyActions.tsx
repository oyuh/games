import { FiPlay, FiLogOut } from "react-icons/fi";
import { type ReactNode } from "react";

export function ImposterLobbyActions({
  canStart,
  isHost,
  playerCount,
  onStart,
  onLeave,
  children
}: {
  canStart: boolean;
  isHost: boolean;
  playerCount: number;
  onStart: () => void;
  onLeave: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="game-section">
      {playerCount < 3 && (
        <p className="game-hint">Need at least 3 players to start ({3 - playerCount} more)</p>
      )}
      {playerCount === 3 && (
        <p className="game-hint" style={{ opacity: 0.7 }}>4+ players recommended for the best experience</p>
      )}
      <div className="game-actions">
        {children}
        {isHost ? (
          <button className="btn btn-primary game-action-btn" disabled={!canStart} onClick={onStart}>
            <FiPlay size={16} /> Start Game
          </button>
        ) : (
          <p className="game-waiting-text">Waiting for host to start…</p>
        )}
        <button className="btn btn-muted game-action-btn" onClick={onLeave}>
          <FiLogOut size={14} /> Leave
        </button>
      </div>
    </div>
  );
}

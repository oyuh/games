import { FiPlay, FiLogOut } from "react-icons/fi";

export function ImposterLobbyActions({
  canStart,
  playerCount,
  onStart,
  onLeave
}: {
  canStart: boolean;
  playerCount: number;
  onStart: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="game-section">
      {playerCount < 3 && (
        <p className="game-hint">Need at least 3 players to start ({3 - playerCount} more)</p>
      )}
      <div className="game-actions">
        <button className="btn btn-primary game-action-btn" disabled={!canStart} onClick={onStart}>
          <FiPlay size={16} /> Start Game
        </button>
        <button className="btn btn-muted game-action-btn" onClick={onLeave}>
          <FiLogOut size={14} /> Leave
        </button>
      </div>
    </div>
  );
}

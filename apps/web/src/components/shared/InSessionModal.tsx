import { GAME_META, multiplayerTypeToGameSlug } from "@games/shared";
import { FiAlertTriangle, FiX } from "react-icons/fi";
import { SessionGameType } from "../../lib/session";

function labelForGameType(gameType: SessionGameType): string {
  return GAME_META[multiplayerTypeToGameSlug(gameType)].title;
}

export function InSessionModal({
  gameType,
  onCancel,
  onConfirm,
  busy,
}: {
  gameType: SessionGameType;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <div
      className="modal-overlay"
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget) {
          onCancel();
        }
      }}
      onKeyDown={(event) => {
        if (!busy && event.key === "Escape") {
          onCancel();
        }
      }}
      role="presentation"
    >
      <div className="modal-panel">
        <div className="modal-header">
          <h2 className="modal-title" style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
            <FiAlertTriangle size={18} /> Already in a game
          </h2>
          <button className="modal-close" onClick={onCancel} disabled={busy}>
            <FiX size={18} />
          </button>
        </div>

        <div className="modal-body">
          <p className="host-section-desc" style={{ marginBottom: "0.75rem" }}>
            You're currently connected to a <strong>{labelForGameType(gameType)}</strong> game.
          </p>
          <p className="host-section-desc" style={{ marginBottom: "1rem" }}>
            Continue to leave that game and join this one?
          </p>
          <div className="game-actions" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-muted" onClick={onCancel} disabled={busy}>Cancel</button>
            <button className="btn btn-primary game-action-btn" onClick={onConfirm} disabled={busy}>
              {busy ? "Joining…" : "Leave & Join"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

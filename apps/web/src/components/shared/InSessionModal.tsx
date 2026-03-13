import { FiAlertTriangle, FiX } from "react-icons/fi";
import { SessionGameType } from "../../lib/session";

function labelForGameType(gameType: SessionGameType): string {
  if (gameType === "chain_reaction") return "Chain Reaction";
  if (gameType === "shade_signal") return "Shade Signal";
  if (gameType === "location_signal") return "Location Signal";
  if (gameType === "imposter") return "Imposter";
  return "Password";
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
    <div className="modal-overlay" onClick={busy ? undefined : onCancel}>
      <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
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

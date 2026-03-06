import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiX, FiUserMinus, FiPower, FiMessageCircle, FiSend } from "react-icons/fi";
import { mutators } from "@games/shared";
import { useZero } from "@rocicorp/zero/react";
import { showToast } from "../../lib/toast";

type GameContext =
  | { type: "imposter"; gameId: string; hostId: string; players: Array<{ sessionId: string; name: string | null }> }
  | { type: "password"; gameId: string; hostId: string; players: Array<{ id: string; name: string }> };

export function HostControlsModal({
  game,
  sessionId,
  onClose,
}: {
  game: GameContext;
  sessionId: string;
  onClose: () => void;
}) {
  const zero = useZero();
  const navigate = useNavigate();
  const [announcement, setAnnouncement] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);

  const kickablePlayersList =
    game.type === "imposter"
      ? game.players.filter((p) => p.sessionId !== sessionId).map((p) => ({ id: p.sessionId, name: p.name ?? p.sessionId.slice(0, 6) }))
      : game.players.filter((p) => p.id !== sessionId);

  const handleKick = (targetId: string, targetName: string) => {
    if (game.type === "imposter") {
      void zero.mutate(mutators.imposter.kick({ gameId: game.gameId, hostId: sessionId, targetId }))
        .client.catch(() => showToast("Couldn't kick player", "error"));
    } else {
      void zero.mutate(mutators.password.kick({ gameId: game.gameId, hostId: sessionId, targetId }))
        .client.catch(() => showToast("Couldn't kick player", "error"));
    }
    showToast(`Kicked ${targetName}`, "info");
  };

  const handleEndGame = () => {
    if (game.type === "imposter") {
      void zero.mutate(mutators.imposter.endGame({ gameId: game.gameId, hostId: sessionId }));
    } else {
      void zero.mutate(mutators.password.endGame({ gameId: game.gameId, hostId: sessionId }));
    }
    showToast("Game ended", "info");
    onClose();
    navigate("/");
  };

  const handleAnnounce = () => {
    const text = announcement.trim();
    if (!text) return;
    if (game.type === "imposter") {
      void zero.mutate(mutators.imposter.announce({ gameId: game.gameId, hostId: sessionId, text }));
    } else {
      void zero.mutate(mutators.password.announce({ gameId: game.gameId, hostId: sessionId, text }));
    }
    setAnnouncement("");
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel modal-panel--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Host Controls</h2>
          <button className="modal-close" onClick={onClose}><FiX size={18} /></button>
        </div>

        <div className="modal-body">
          {/* Announcement */}
          <section className="host-section">
            <h3 className="host-section-title"><FiMessageCircle size={14} /> Announcement</h3>
            <p className="host-section-desc">Send a message to all players (shows as a toast notification).</p>
            <div className="host-announce-row">
              <input
                className="input host-announce-input"
                placeholder="Type a message…"
                value={announcement}
                maxLength={120}
                onChange={(e) => setAnnouncement(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAnnounce(); }}
              />
              <button
                className="btn btn-primary host-announce-btn"
                onClick={handleAnnounce}
                disabled={!announcement.trim()}
              >
                <FiSend size={14} />
              </button>
            </div>
          </section>

          {/* Kick Players */}
          <section className="host-section">
            <h3 className="host-section-title"><FiUserMinus size={14} /> Kick Player</h3>
            <p className="host-section-desc">Remove a player from the game. They won't be able to rejoin.</p>
            {kickablePlayersList.length > 0 ? (
              <div className="host-player-list">
                {kickablePlayersList.map((p) => (
                  <div key={p.id} className="host-player-row">
                    <span className="host-player-name">{p.name}</span>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleKick(p.id, p.name)}
                    >
                      Kick
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="host-empty-text">No other players in the game.</p>
            )}
          </section>

          {/* End Game */}
          <section className="host-section host-section--danger">
            <h3 className="host-section-title"><FiPower size={14} /> End Game</h3>
            <p className="host-section-desc">End the game for all players. Everyone will be sent back to the home screen.</p>
            {!confirmEnd ? (
              <button className="btn btn-danger" onClick={() => setConfirmEnd(true)}>
                End Game
              </button>
            ) : (
              <div className="host-confirm-row">
                <span className="host-confirm-text">Are you sure?</span>
                <button className="btn btn-muted btn-sm" onClick={() => setConfirmEnd(false)}>Cancel</button>
                <button className="btn btn-danger btn-sm" onClick={handleEndGame}>Confirm End</button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

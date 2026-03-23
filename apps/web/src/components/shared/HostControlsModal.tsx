import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiX, FiUserMinus, FiPower, FiMessageCircle, FiSend, FiEye, FiGlobe, FiLock } from "react-icons/fi";
import { mutators } from "@games/shared";
import { useZero } from "../../lib/zero";
import { showToast } from "../../lib/toast";

type GameContext =
  | { type: "imposter"; gameId: string; hostId: string; isPublic: boolean; players: Array<{ sessionId: string; name: string | null }>; spectators?: Array<{ sessionId: string; name: string | null }> }
  | { type: "password"; gameId: string; hostId: string; isPublic: boolean; players: Array<{ id: string; name: string }>; spectators?: Array<{ sessionId: string; name: string | null }> }
  | { type: "shade_signal"; gameId: string; hostId: string; isPublic: boolean; players: Array<{ sessionId: string; name: string | null }>; spectators?: Array<{ sessionId: string; name: string | null }> }
  | { type: "chain_reaction"; gameId: string; hostId: string; isPublic: boolean; players: Array<{ sessionId: string; name: string | null }>; spectators?: Array<{ sessionId: string; name: string | null }> }
  | { type: "location_signal"; gameId: string; hostId: string; isPublic: boolean; players: Array<{ sessionId: string; name: string | null }>; spectators?: Array<{ sessionId: string; name: string | null }> };

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
  const [togglingVisibility, setTogglingVisibility] = useState(false);

  const kickablePlayersList =
    game.type === "password"
      ? game.players.filter((p) => p.id !== sessionId)
      : game.players.filter((p) => p.sessionId !== sessionId).map((p) => ({ id: p.sessionId, name: p.name ?? p.sessionId.slice(0, 6) }));

  const spectatorsList = (game.spectators ?? []).map((s) => ({ id: s.sessionId, name: s.name ?? s.sessionId.slice(0, 6) }));

  const handleKick = (targetId: string, targetName: string) => {
    if (game.type === "imposter") {
      void zero.mutate(mutators.imposter.kick({ gameId: game.gameId, hostId: sessionId, targetId }))
        .client.catch(() => showToast("Couldn't kick player", "error"));
    } else if (game.type === "shade_signal") {
      void zero.mutate(mutators.shadeSignal.kick({ gameId: game.gameId, hostId: sessionId, targetId }))
        .client.catch(() => showToast("Couldn't kick player", "error"));
    } else if (game.type === "chain_reaction") {
      void zero.mutate(mutators.chainReaction.kick({ gameId: game.gameId, hostId: sessionId, targetId }))
        .client.catch(() => showToast("Couldn't kick player", "error"));
    } else if (game.type === "location_signal") {
      void zero.mutate(mutators.locationSignal.kick({ gameId: game.gameId, hostId: sessionId, targetId }))
        .client.catch(() => showToast("Couldn't kick player", "error"));
    } else {
      void zero.mutate(mutators.password.kick({ gameId: game.gameId, hostId: sessionId, targetId }))
        .client.catch(() => showToast("Couldn't kick player", "error"));
    }
    showToast(`Kicked ${targetName}`, "info");
  };

  const handleRemoveSpectator = (targetId: string, targetName: string) => {
    if (game.type === "imposter") {
      void zero.mutate(mutators.imposter.removeSpectator({ gameId: game.gameId, hostId: sessionId, targetId }));
    } else if (game.type === "shade_signal") {
      void zero.mutate(mutators.shadeSignal.removeSpectator({ gameId: game.gameId, hostId: sessionId, targetId }));
    } else if (game.type === "chain_reaction") {
      void zero.mutate(mutators.chainReaction.removeSpectator({ gameId: game.gameId, hostId: sessionId, targetId }));
    } else if (game.type === "location_signal") {
      void zero.mutate(mutators.locationSignal.removeSpectator({ gameId: game.gameId, hostId: sessionId, targetId }));
    } else {
      void zero.mutate(mutators.password.removeSpectator({ gameId: game.gameId, hostId: sessionId, targetId }));
    }
    showToast(`Kicked ${targetName}`, "info");
  };

  const handleEndGame = () => {
    if (game.type === "imposter") {
      void zero.mutate(mutators.imposter.endGame({ gameId: game.gameId, hostId: sessionId }));
    } else if (game.type === "shade_signal") {
      void zero.mutate(mutators.shadeSignal.endGame({ gameId: game.gameId, hostId: sessionId }));
    } else if (game.type === "chain_reaction") {
      void zero.mutate(mutators.chainReaction.endGame({ gameId: game.gameId, hostId: sessionId }));
    } else if (game.type === "location_signal") {
      void zero.mutate(mutators.locationSignal.endGame({ gameId: game.gameId, hostId: sessionId }));
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
    } else if (game.type === "shade_signal") {
      void zero.mutate(mutators.shadeSignal.announce({ gameId: game.gameId, hostId: sessionId, text }));
    } else if (game.type === "chain_reaction") {
      void zero.mutate(mutators.chainReaction.announce({ gameId: game.gameId, hostId: sessionId, text }));
    } else if (game.type === "location_signal") {
      void zero.mutate(mutators.locationSignal.announce({ gameId: game.gameId, hostId: sessionId, text }));
    } else {
      void zero.mutate(mutators.password.announce({ gameId: game.gameId, hostId: sessionId, text }));
    }
    setAnnouncement("");
  };

  const handleToggleVisibility = async () => {
    const newValue = !game.isPublic;
    setTogglingVisibility(true);
    try {
      if (game.type === "imposter") {
        await zero.mutate(mutators.imposter.setPublic({ gameId: game.gameId, hostId: sessionId, isPublic: newValue })).server;
      } else if (game.type === "shade_signal") {
        await zero.mutate(mutators.shadeSignal.setPublic({ gameId: game.gameId, hostId: sessionId, isPublic: newValue })).server;
      } else if (game.type === "chain_reaction") {
        await zero.mutate(mutators.chainReaction.setPublic({ gameId: game.gameId, hostId: sessionId, isPublic: newValue })).server;
      } else if (game.type === "location_signal") {
        await zero.mutate(mutators.locationSignal.setPublic({ gameId: game.gameId, hostId: sessionId, isPublic: newValue })).server;
      } else {
        await zero.mutate(mutators.password.setPublic({ gameId: game.gameId, hostId: sessionId, isPublic: newValue })).server;
      }
      showToast(newValue ? "Game is now public" : "Game is now private", "info");
    } catch {
      showToast("Couldn't change visibility", "error");
    } finally {
      setTogglingVisibility(false);
    }
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

          {/* Game Visibility */}
          <section className="host-section">
            <h3 className="host-section-title">{game.isPublic ? <FiGlobe size={14} /> : <FiLock size={14} />} Game Visibility</h3>
            <p className="host-section-desc">
              {game.isPublic
                ? "This game is public — anyone can find and join it from the Browse Games section."
                : "This game is private — players need the join code to enter."}
            </p>
            <button
              className={`btn ${game.isPublic ? "btn-muted" : "btn-primary"} host-visibility-btn`}
              onClick={() => void handleToggleVisibility()}
              disabled={togglingVisibility}
            >
              {togglingVisibility
                ? "Updating…"
                : game.isPublic
                  ? <><FiLock size={14} /> Make Private</>
                  : <><FiGlobe size={14} /> Make Public</>}
            </button>
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

          {/* Spectators */}
          {spectatorsList.length > 0 && (
            <section className="host-section">
              <h3 className="host-section-title"><FiEye size={14} /> Spectators</h3>
              <p className="host-section-desc">People watching the game. Remove to kick them out.</p>
              <div className="host-player-list">
                {spectatorsList.map((s) => (
                  <div key={s.id} className="host-player-row">
                    <span className="host-player-name">{s.name}</span>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleRemoveSpectator(s.id, s.name)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

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

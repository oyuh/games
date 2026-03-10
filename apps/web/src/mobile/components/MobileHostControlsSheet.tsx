import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiUserMinus, FiPower, FiMessageCircle, FiSend, FiEye } from "react-icons/fi";
import { mutators } from "@games/shared";
import { useZero } from "../../lib/zero";
import { showToast } from "../../lib/toast";
import { BottomSheet } from "./BottomSheet";

type GameContext =
  | { type: "imposter"; gameId: string; hostId: string; players: Array<{ sessionId: string; name: string | null }>; spectators?: Array<{ sessionId: string; name: string | null }> }
  | { type: "password"; gameId: string; hostId: string; players: Array<{ id: string; name: string }>; spectators?: Array<{ sessionId: string; name: string | null }> }
  | { type: "shade_signal"; gameId: string; hostId: string; players: Array<{ sessionId: string; name: string | null }>; spectators?: Array<{ sessionId: string; name: string | null }> }
  | { type: "chain_reaction"; gameId: string; hostId: string; players: Array<{ sessionId: string; name: string | null }>; spectators?: Array<{ sessionId: string; name: string | null }> };

export type { GameContext as MobileHostGameContext };

export function MobileHostControlsSheet({
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
    game.type === "password"
      ? game.players.filter((p) => p.id !== sessionId)
      : game.players.filter((p) => p.sessionId !== sessionId).map((p) => ({ id: p.sessionId, name: p.name ?? p.sessionId.slice(0, 6) }));

  const spectatorsList = (game.spectators ?? []).map((s) => ({ id: s.sessionId, name: s.name ?? s.sessionId.slice(0, 6) }));

  const handleKick = (targetId: string, targetName: string) => {
    if (game.type === "imposter") {
      void zero.mutate(mutators.imposter.kick({ gameId: game.gameId, hostId: sessionId, targetId }));
    } else if (game.type === "shade_signal") {
      void zero.mutate(mutators.shadeSignal.kick({ gameId: game.gameId, hostId: sessionId, targetId }));
    } else if (game.type === "chain_reaction") {
      void zero.mutate(mutators.chainReaction.kick({ gameId: game.gameId, hostId: sessionId, targetId }));
    } else {
      void zero.mutate(mutators.password.kick({ gameId: game.gameId, hostId: sessionId, targetId }));
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
    } else {
      void zero.mutate(mutators.password.removeSpectator({ gameId: game.gameId, hostId: sessionId, targetId }));
    }
    showToast(`Removed spectator ${targetName}`, "info");
  };

  const handleEndGame = () => {
    if (game.type === "imposter") {
      void zero.mutate(mutators.imposter.endGame({ gameId: game.gameId, hostId: sessionId }));
    } else if (game.type === "shade_signal") {
      void zero.mutate(mutators.shadeSignal.endGame({ gameId: game.gameId, hostId: sessionId }));
    } else if (game.type === "chain_reaction") {
      void zero.mutate(mutators.chainReaction.endGame({ gameId: game.gameId, hostId: sessionId }));
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
    } else {
      void zero.mutate(mutators.password.announce({ gameId: game.gameId, hostId: sessionId, text }));
    }
    setAnnouncement("");
    showToast("Announcement sent", "success");
  };

  return (
    <BottomSheet title="Host Controls" onClose={onClose}>
      {/* Announcement */}
      <div className="m-host-section">
        <h3 className="m-host-section-title"><FiMessageCircle size={14} /> Announcement</h3>
        <p className="m-host-section-desc">Send a message to all players.</p>
        <div className="m-home-row">
          <input
            className="m-input"
            style={{ flex: 1 }}
            placeholder="Type a message…"
            value={announcement}
            maxLength={120}
            onChange={(e) => setAnnouncement(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAnnounce(); }}
          />
          <button
            className="m-btn m-btn-primary"
            onClick={handleAnnounce}
            disabled={!announcement.trim()}
          >
            <FiSend size={14} />
          </button>
        </div>
      </div>

      {/* Kick Players */}
      <div className="m-host-section">
        <h3 className="m-host-section-title"><FiUserMinus size={14} /> Kick Player</h3>
        {kickablePlayersList.length > 0 ? (
          <div className="m-host-player-list">
            {kickablePlayersList.map((p) => (
              <div key={p.id} className="m-host-player-row">
                <span className="m-host-player-name">{p.name}</span>
                <button className="m-btn m-btn-danger m-btn-sm" onClick={() => handleKick(p.id, p.name)}>Kick</button>
              </div>
            ))}
          </div>
        ) : (
          <p className="m-host-section-desc">No other players to kick.</p>
        )}
      </div>

      {/* Spectators */}
      {spectatorsList.length > 0 && (
        <div className="m-host-section">
          <h3 className="m-host-section-title"><FiEye size={14} /> Spectators</h3>
          <div className="m-host-player-list">
            {spectatorsList.map((s) => (
              <div key={s.id} className="m-host-player-row">
                <span className="m-host-player-name">{s.name}</span>
                <button className="m-btn m-btn-danger m-btn-sm" onClick={() => handleRemoveSpectator(s.id, s.name)}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* End Game */}
      <div className="m-host-section m-host-section--danger">
        <h3 className="m-host-section-title"><FiPower size={14} /> End Game</h3>
        {!confirmEnd ? (
          <button className="m-btn m-btn-danger" style={{ width: "100%" }} onClick={() => setConfirmEnd(true)}>End Game</button>
        ) : (
          <div className="m-home-row" style={{ justifyContent: "center" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--secondary)" }}>Are you sure?</span>
            <button className="m-btn m-btn-muted m-btn-sm" onClick={() => setConfirmEnd(false)}>Cancel</button>
            <button className="m-btn m-btn-danger m-btn-sm" onClick={handleEndGame}>Confirm</button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

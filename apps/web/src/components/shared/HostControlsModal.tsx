import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiUserMinus, FiPower, FiSend, FiEye, FiGlobe, FiLock, FiSliders } from "react-icons/fi";
import { mutators } from "@games/shared";
import { optimistic, useZero } from "../../lib/zero";
import { showToast } from "../../lib/toast";
import { getDisplayName } from "../../lib/session";
import { Segmented } from "./SoloGameMenu";
import { ModalSection, ModalShell } from "./ModalShell";

export type GameContext =
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
      : game.players.reduce<Array<{ id: string; name: string }>>((players, player) => {
          if (player.sessionId !== sessionId) {
            players.push({ id: player.sessionId, name: getDisplayName(player.name, player.sessionId) });
          }
          return players;
        }, []);

  const spectatorsList = (game.spectators ?? []).map((s) => ({ id: s.sessionId, name: getDisplayName(s.name, s.sessionId) }));

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

  const handleEndGame = async () => {
    try {
      if (game.type === "imposter") {
        await zero.mutate(mutators.imposter.endGame({ gameId: game.gameId, hostId: sessionId })).client;
      } else if (game.type === "shade_signal") {
        await zero.mutate(mutators.shadeSignal.endGame({ gameId: game.gameId, hostId: sessionId })).client;
      } else if (game.type === "chain_reaction") {
        await zero.mutate(mutators.chainReaction.endGame({ gameId: game.gameId, hostId: sessionId })).client;
      } else if (game.type === "location_signal") {
        await zero.mutate(mutators.locationSignal.endGame({ gameId: game.gameId, hostId: sessionId })).client;
      } else {
        await zero.mutate(mutators.password.endGame({ gameId: game.gameId, hostId: sessionId })).client;
      }
      showToast("Game ended", "info");
      onClose();
      navigate("/");
    } catch {
      showToast("Couldn't end game", "error");
    }
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
        await optimistic(zero.mutate(mutators.imposter.setPublic({ gameId: game.gameId, hostId: sessionId, isPublic: newValue })));
      } else if (game.type === "shade_signal") {
        await optimistic(zero.mutate(mutators.shadeSignal.setPublic({ gameId: game.gameId, hostId: sessionId, isPublic: newValue })));
      } else if (game.type === "chain_reaction") {
        await optimistic(zero.mutate(mutators.chainReaction.setPublic({ gameId: game.gameId, hostId: sessionId, isPublic: newValue })));
      } else if (game.type === "location_signal") {
        await optimistic(zero.mutate(mutators.locationSignal.setPublic({ gameId: game.gameId, hostId: sessionId, isPublic: newValue })));
      } else {
        await optimistic(zero.mutate(mutators.password.setPublic({ gameId: game.gameId, hostId: sessionId, isPublic: newValue })));
      }
      showToast(newValue ? "Game is now public" : "Game is now private", "info");
    } catch {
      showToast("Couldn't change visibility", "error");
    } finally {
      setTogglingVisibility(false);
    }
  };

  return (
    <ModalShell
      icon={<FiSliders size={18} />}
      kicker="Host only"
      title="Host Controls"
      size="lg"
      onClose={onClose}
    >
      <ModalSection label="Announcement" hint="Sends a toast to everyone in the game.">
        <div className="host-announce">
          <input
            className="host-announce-input"
            placeholder="Type a message…"
            value={announcement}
            maxLength={120}
            onChange={(e) => setAnnouncement(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAnnounce(); }}
          />
          <button
            className="host-announce-send"
            onClick={handleAnnounce}
            disabled={!announcement.trim()}
            aria-label="Send announcement"
          >
            <FiSend size={15} />
          </button>
        </div>
      </ModalSection>

      <ModalSection
        label="Visibility"
        hint={game.isPublic
          ? "Anyone can find this game in Browse Games."
          : "Players need the join code to get in."}
      >
        <Segmented
          row={{
            label: "Game visibility",
            value: game.isPublic ? "public" : "private",
            onChange: (value) => {
              if ((value === "public") !== game.isPublic && !togglingVisibility) void handleToggleVisibility();
            },
            options: [
              { value: "private", label: "Private", title: "Join code only", icon: <FiLock size={14} /> },
              { value: "public", label: "Public", title: "Listed in Browse Games", icon: <FiGlobe size={14} /> },
            ],
          }}
        />
      </ModalSection>

      <ModalSection label="Players" hint="Kicked players can't rejoin this game.">
        {kickablePlayersList.length > 0 ? (
          <div className="host-people">
            {kickablePlayersList.map((p) => (
              <div key={p.id} className="host-person">
                <span className="host-person-name">{p.name}</span>
                <button className="host-person-btn" onClick={() => handleKick(p.id, p.name)}>
                  <FiUserMinus size={13} /> Kick
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="host-empty">No other players yet.</p>
        )}
      </ModalSection>

      {spectatorsList.length > 0 && (
        <ModalSection label="Spectators" hint="Watching without playing.">
          <div className="host-people">
            {spectatorsList.map((s) => (
              <div key={s.id} className="host-person">
                <span className="host-person-name">{s.name}</span>
                <button className="host-person-btn" onClick={() => handleRemoveSpectator(s.id, s.name)}>
                  <FiEye size={13} /> Remove
                </button>
              </div>
            ))}
          </div>
        </ModalSection>
      )}

      <ModalSection label="End game" tone="danger" hint="Ends it for everyone and sends all players home.">
        {!confirmEnd ? (
          <button className="mshell-action mshell-action--muted mshell-action--wide" onClick={() => setConfirmEnd(true)}>
            <FiPower size={14} /> End Game
          </button>
        ) : (
          <div className="host-confirm">
            <button className="mshell-action mshell-action--muted" onClick={() => setConfirmEnd(false)}>Cancel</button>
            <button className="mshell-action mshell-action--danger" onClick={handleEndGame}>
              <FiPower size={14} /> End it
            </button>
          </div>
        )}
      </ModalSection>
    </ModalShell>
  );
}

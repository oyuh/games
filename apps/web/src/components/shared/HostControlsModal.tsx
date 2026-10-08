import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { FiClock, FiEye, FiFlag, FiHash, FiSend, FiSliders, FiTrash2, FiUsers, FiUserX } from "react-icons/fi";
import { mutators } from "@games/shared";
import { optimistic, useZero } from "../../lib/zero";
import { showToast } from "../../lib/toast";
import { getDisplayName } from "../../lib/session";
import { Button } from "./Button";
import { Elapsed, GameFacts, GameToggle, useArmed } from "./GameKit";
import { GameRoster } from "./GameRoster";
import type { PlayerCardProps } from "./PlayerCard";
import { ModalShell } from "./ModalShell";

type Person = { sessionId: string; name: string | null; connected?: boolean };

/** What the host controls need from whichever game row they were opened on.
 *  The room numbers come from roomStats in lib/host-room. */
export type GameContext = {
  gameId: string;
  hostId: string;
  isPublic: boolean;
  code: string;
  phase: string;
  createdAt: number;
  /** How many have been thrown out. */
  kicked: number;
  spectators?: Array<{ sessionId: string; name: string | null }>;
} & (
  | { type: "password"; players: Array<{ id: string; name: string }> }
  | { type: "imposter" | "shade_signal" | "chain_reaction" | "location_signal"; players: Person[] }
);

/** "clue1" reads as "Clue 1", "submitting" as "Submitting". */
function phaseLabel(phase: string) {
  const spaced = phase.replace(/_/g, " ").replace(/(\D)(\d)/, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The modal's section heads are the lobby's ("SETUP", "PLAYERS"), so the two
 *  read as the same app. */
function HostSection({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <section className="host-section-block">
      <span className="gk-roster-label">{label}</span>
      {children}
      {hint && <p className="host-hint">{hint}</p>}
    </section>
  );
}

type HostControlsProps = {
  game: GameContext;
  sessionId: string;
  onClose: () => void;
};

export function HostControlsModal(props: HostControlsProps) {
  return (
    <ModalShell icon={<FiSliders size={18} />} title="Host Controls" size="lg" onClose={props.onClose}>
      <HostControls {...props} />
    </ModalShell>
  );
}

/** The controls themselves, framed by the desktop modal or the mobile sheet. */
export function HostControls({ game, sessionId, onClose }: HostControlsProps) {
  const zero = useZero();
  const navigate = useNavigate();
  const [announcement, setAnnouncement] = useState("");
  const endArm = useArmed();
  const [togglingVisibility, setTogglingVisibility] = useState(false);

  const people: Person[] =
    game.type === "password"
      ? game.players.map((p) => ({ sessionId: p.id, name: p.name }))
      : game.players.map((p) => ({ sessionId: p.sessionId, name: getDisplayName(p.name, p.sessionId), ...(p.connected === undefined ? {} : { connected: p.connected }) }));
  const spectators = (game.spectators ?? []).map((s) => ({ sessionId: s.sessionId, name: getDisplayName(s.name, s.sessionId) }));
  // Password rows carry no presence, so there it is a head count.
  const hasPresence = people.some((p) => p.connected !== undefined);
  const online = people.filter((p) => p.connected !== false).length;
  const nameOf = (id: string) => [...people, ...spectators].find((p) => p.sessionId === id)?.name ?? "them";

  const toCards = (list: Person[]): PlayerCardProps[] =>
    list.map((p, index) => ({
      sessionId: p.sessionId,
      name: p.name ?? getDisplayName(null, p.sessionId),
      index,
      ...(p.sessionId === sessionId ? { you: true } : {}),
      ...(p.sessionId === game.hostId ? { host: true } : {}),
      ...(p.connected === false ? { disconnected: true, caption: "Dropped out" } : {}),
    }));

  const handleKick = (targetId: string, targetName: string) => {
    if (game.type === "imposter") {
      void zero.mutate(mutators.imposter.kick({ gameId: game.gameId, hostId: sessionId, targetId }))
        .client.catch(() => showToast("Couldn't kick player", "error", { category: "Players" }));
    } else if (game.type === "shade_signal") {
      void zero.mutate(mutators.shadeSignal.kick({ gameId: game.gameId, hostId: sessionId, targetId }))
        .client.catch(() => showToast("Couldn't kick player", "error", { category: "Players" }));
    } else if (game.type === "chain_reaction") {
      void zero.mutate(mutators.chainReaction.kick({ gameId: game.gameId, hostId: sessionId, targetId }))
        .client.catch(() => showToast("Couldn't kick player", "error", { category: "Players" }));
    } else if (game.type === "location_signal") {
      void zero.mutate(mutators.locationSignal.kick({ gameId: game.gameId, hostId: sessionId, targetId }))
        .client.catch(() => showToast("Couldn't kick player", "error", { category: "Players" }));
    } else {
      void zero.mutate(mutators.password.kick({ gameId: game.gameId, hostId: sessionId, targetId }))
        .client.catch(() => showToast("Couldn't kick player", "error", { category: "Players" }));
    }
    showToast(`Kicked ${targetName}`, "info", { category: "Players" });
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
    showToast(`Kicked ${targetName}`, "info", { category: "Players" });
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
      showToast(newValue ? "Game is now public" : "Game is now private", "info", { category: "Visibility" });
    } catch {
      showToast("Couldn't change visibility", "error", { category: "Visibility" });
    } finally {
      setTogglingVisibility(false);
    }
  };

  return (
    <div className="host-controls">
      <GameFacts
        label="Room"
        className="host-stats"
        facts={[
          { value: game.code, icon: <FiHash />, tone: "var(--modal-accent, var(--primary))", tooltip: "The join code" },
          { value: phaseLabel(game.phase), icon: <FiFlag />, tooltip: "Where the game is at" },
          { value: <Elapsed since={game.createdAt} />, label: "open", icon: <FiClock />, tooltip: "Since the room was made" },
          hasPresence
            ? { value: `${online}/${people.length}`, label: "online", icon: <FiUsers />, tooltip: "Players connected right now" }
            : { value: people.length, label: people.length === 1 ? "player" : "players", icon: <FiUsers /> },
          { value: spectators.length, label: "watching", icon: <FiEye />, tooltip: "Spectators" },
          { value: game.kicked, label: "kicked", icon: <FiUserX />, tooltip: "Kicked players can't rejoin" },
        ]}
      />

      <HostSection label="Announcement" hint="Pops up as a toast for everyone in the game.">
        <div className="host-announce">
          <input
            className="host-announce-input"
            placeholder="Type a message…"
            value={announcement}
            maxLength={120}
            onChange={(e) => setAnnouncement(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAnnounce(); }}
            aria-label="Announcement"
          />
          <Button variant="primary" size="sm" icon={<FiSend />} onClick={handleAnnounce} disabled={!announcement.trim()}>
            Send
          </Button>
        </div>
      </HostSection>

      <HostSection label="Access">
        <div className="host-room">
          <GameToggle
            label="Visibility"
            detail={game.isPublic ? "Public" : "Code only"}
            checked={game.isPublic}
            onChange={() => void handleToggleVisibility()}
            disabled={togglingVisibility}
          />
          <p className="host-room-note">
            {game.isPublic ? "Anyone can find it in Browse Games." : "Only people with the code can get in."}
          </p>
        </div>
      </HostSection>

      <section className="host-section-block">
        <GameRoster
          players={toCards(people)}
          emptyLabel="Nobody has joined yet."
          onKick={(id) => handleKick(id, nameOf(id))}
        />
        <p className="host-hint">Press the X twice to kick. Kicked players can't rejoin this game.</p>
      </section>

      {spectators.length > 0 && (
        <GameRoster
          label="Spectators"
          players={toCards(spectators)}
          onKick={(id) => handleRemoveSpectator(id, nameOf(id))}
        />
      )}

      <div className="host-end">
        <div className="host-end-text">
          <span className="host-end-title">End game</span>
          <span className="host-end-hint">Ends it for everyone and sends all players home.</span>
        </div>
        <Button
          variant={endArm.armed ? "danger" : "danger-secondary"}
          icon={<FiTrash2 />}
          onClick={() => { if (endArm.press()) void handleEndGame(); }}
          onBlur={endArm.disarm}
        >
          {endArm.armed ? "Press again" : "End game"}
        </Button>
      </div>
    </div>
  );
}

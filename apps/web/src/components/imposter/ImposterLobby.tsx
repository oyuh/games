import type { ReactNode } from "react";
import { FiAward, FiBookOpen, FiClock, FiEdit3, FiEye, FiFlag, FiLogIn, FiLogOut, FiPlay, FiUsers, FiZap } from "react-icons/fi";
import { DEFAULT_IMPOSTER_CLUE_VISIBILITY, imposterCategoryLabels } from "@games/shared";
import { GameActions, GameButton, GameEmpty, GameFacts, GamePanel } from "../shared/GameKit";
import { GameRoster } from "../shared/GameRoster";
import { playerBadges, type PlayerCardProps } from "../shared/PlayerCard";
import type { GamePhase } from "../shared/GameShellHeader";
import { getDisplayName } from "../../lib/session";

/**
 * Imposter's lobby, built out of the shared kit rather than its own markup.
 * Everything here is props and callbacks, so the dev page at /dev/imposter can
 * drive it with made up players and the real page can hand it zero's.
 */

/** Enough for one imposter and two people to disagree about who it is. */
export const MIN_IMPOSTER_PLAYERS = 3;

/** The ids are the game's own phase values, so the header can be handed
 *  `game.phase` straight from the row with nothing in between. */
export const IMPOSTER_PHASES: GamePhase[] = [
  { id: "lobby", label: "Lobby", icon: <FiUsers />, hint: "Waiting for everyone to join. The host starts the round." },
  { id: "playing", label: "Clues", icon: <FiEdit3 />, hint: "Everyone writes one clue about the secret word." },
  { id: "voting", label: "Voting", icon: <FiEye />, hint: "Pick the player you think never saw the word." },
  { id: "results", label: "Results", icon: <FiAward />, hint: "See who the room voted out, and what they were." },
  { id: "finished", label: "Finished", icon: <FiFlag />, hint: "Every round is done and the imposters are named." },
];

/** The player shape the game row already carries. */
export type ImposterPlayer = {
  sessionId: string;
  name: string | null;
  connected: boolean;
  role?: "imposter" | "player";
  eliminated?: boolean;
};

/** The slice of `settings` the lobby shows. */
export interface ImposterLobbySettings {
  rounds: number;
  imposters: number;
  roundDurationSec: number;
  clueVisibility?: number;
}

/** Shared with the create form, which words this setting the same way. */
export function formatClueVisibility(value = DEFAULT_IMPOSTER_CLUE_VISIBILITY) {
  if (value <= 0) return "None";
  if (value >= 1) return "All";
  return `${Math.round(value * 100)}%`;
}

/**
 * Nobody is ready or waiting in a lobby, they have just turned up, so the only
 * state worth drawing is having dropped off.
 */
export function imposterLobbyCards({
  players,
  sessionId,
  hostId,
  sessionById = {},
}: {
  players: ImposterPlayer[];
  sessionId: string;
  hostId: string;
  sessionById?: Record<string, string>;
}): PlayerCardProps[] {
  return players.map((player, index) => ({
    sessionId: player.sessionId,
    name: sessionById[player.sessionId] ?? getDisplayName(player.name, player.sessionId),
    index,
    ...(player.sessionId === sessionId ? { you: true } : {}),
    ...(player.sessionId === hostId ? { badges: [playerBadges.host()] } : {}),
    ...(player.connected ? {} : { disconnected: true, caption: "Dropped out" }),
  }));
}

export interface ImposterLobbyProps {
  players: ImposterPlayer[];
  sessionId: string;
  hostId: string;
  /** Names from the session table, which beat the ones on the player row. */
  sessionById?: Record<string, string>;
  settings: ImposterLobbySettings;
  category?: string | null;
  isHost: boolean;
  /** In the player list. Someone spectating or following a link is not. */
  inGame: boolean;
  isSpectator?: boolean;
  /** Holds the start button while the mutator is in the air. */
  starting?: boolean;
  onStart: () => void;
  onLeave: () => void;
  onJoin: () => void;
  onKick?: (sessionId: string) => void;
  /** Goes in first on the action row. The visibility toggle lives here so this
   *  component never has to know what zero is. */
  actions?: ReactNode;
}

export function ImposterLobby({
  players,
  sessionId,
  hostId,
  sessionById,
  settings,
  category,
  isHost,
  inGame,
  isSpectator,
  starting,
  onStart,
  onLeave,
  onJoin,
  onKick,
  actions,
}: ImposterLobbyProps) {
  const short = MIN_IMPOSTER_PLAYERS - players.length;

  return (
    <>
      <GameRoster
        players={imposterLobbyCards({ players, sessionId, hostId, ...(sessionById ? { sessionById } : {}) })}
        emptyLabel="Nobody has joined yet. Share the code."
        {...(isHost && onKick ? { onKick } : {})}
      />

      <GameFacts
        label="Setup"
        facts={[
          {
            /* The one fact worth a colour: it is the only setting that
               changes what you will actually be looking at. */
            value: category ? (imposterCategoryLabels[category] ?? category) : "Anything",
            icon: <FiBookOpen />,
            tone: "var(--game-accent)",
            tooltip: "Where the secret word gets picked from",
          },
          { value: settings.rounds, label: "rounds", icon: <FiFlag />, tooltip: "How many words the game runs through" },
          {
            value: settings.imposters,
            label: settings.imposters === 1 ? "imposter" : "imposters",
            icon: <FiZap />,
            tooltip: "How many players never see the word",
          },
          {
            value: formatClueVisibility(settings.clueVisibility),
            label: "peek",
            icon: <FiEye />,
            tooltip: "How much of everyone else's clues the imposter gets to read first",
          },
          {
            value: `${settings.roundDurationSec}s`,
            label: "to write",
            icon: <FiClock />,
            tooltip: "How long each round gives you to write a clue",
          },
        ]}
      />

      {inGame ? (
        <GameActions
          hint={
            short > 0
              ? `${MIN_IMPOSTER_PLAYERS} players to start, ${short} more to go.`
              : players.length === MIN_IMPOSTER_PLAYERS
                ? "Three works. Four or more plays better."
                : undefined
          }
        >
          {actions}

          {isHost ? (
            <GameButton
              variant="primary"
              icon={<FiPlay />}
              disabled={short > 0}
              {...(starting ? { loading: true } : {})}
              onClick={onStart}
            >
              Start the round
            </GameButton>
          ) : (
            <span className="gk-actions-note">Waiting for the host to start…</span>
          )}

          <GameButton variant="ghost" icon={<FiLogOut />} onClick={onLeave}>Leave</GameButton>
        </GameActions>
      ) : (
        <GamePanel>
          <GameEmpty
            icon={<FiLogIn />}
            title={isSpectator ? "You are watching this one" : "You are not in this lobby yet"}
            hint={
              isSpectator
                ? "Spectators see the room but never get a word. Join to play the next round."
                : "Join and you are in the list the moment the host starts."
            }
            action={<GameButton variant="primary" icon={<FiLogIn />} onClick={onJoin}>Join the game</GameButton>}
          />
        </GamePanel>
      )}
    </>
  );
}

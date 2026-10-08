import type { ReactNode } from "react";
import { FiAward, FiBookOpen, FiClock, FiEdit3, FiEye, FiFlag, FiLogIn, FiPlay, FiUsers, FiZap } from "react-icons/fi";
import {
  DEFAULT_IMPOSTER_CLUE_VISIBILITY,
  IMPOSTER_CLUE_VISIBILITY_OPTIONS,
  LOBBY_SETTING_LIMITS,
  imposterCategories,
  imposterCategoryLabels,
} from "@games/shared";
import { Elapsed, GameActions, GameButton, LeaveButton, GameEmpty, GameFacts, GamePanel, type GameFactEdit } from "../shared/GameKit";
import { categoryOptions, durationCustom, durationOptions, formatDuration, numberCustom, numberOptions } from "../../lib/setting-options";
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

/** What the host can change from the lobby. The word bank is a column rather
 *  than a setting, but it is changed from the same setup strip. */
export type ImposterSettingsPatch = Partial<ImposterLobbySettings> & { category?: string };

const LIMITS = LOBBY_SETTING_LIMITS.imposter;
const roundsUnit = (n: number) => (n === 1 ? "round" : "rounds");
const impostersUnit = (n: number) => (n === 1 ? "imposter" : "imposters");

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
    ...(player.sessionId === hostId ? { host: true } : {}),
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
  /** Turns the setup cells into pickers. Only reaches for it when you host. */
  onSettingsChange?: (patch: ImposterSettingsPatch) => void;
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
  onSettingsChange,
}: ImposterLobbyProps) {
  const short = MIN_IMPOSTER_PLAYERS - players.length;
  const clueVisibility = settings.clueVisibility ?? DEFAULT_IMPOSTER_CLUE_VISIBILITY;
  // Everyone gets the name, so a change the host makes can be announced to
  // the room. Only the host gets the picker.
  const edit = (picker: GameFactEdit) => ({
    name: picker.label,
    ...(isHost && onSettingsChange ? { edit: picker } : {}),
  });

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
            ...edit({
              label: "Word bank",
              value: category ?? "",
              options: categoryOptions(imposterCategories, imposterCategoryLabels),
              searchPlaceholder: "Search categories…",
              onChange: (value) => onSettingsChange?.({ category: value }),
            }),
          },
          {
            value: settings.rounds,
            label: roundsUnit(settings.rounds),
            icon: <FiFlag />,
            tooltip: "How many words the game runs through",
            ...edit({
              label: "Rounds",
              value: String(settings.rounds),
              options: numberOptions([1, 2, 3, 5, 7, 10], roundsUnit),
              custom: numberCustom(LIMITS.rounds, roundsUnit),
              onChange: (value) => onSettingsChange?.({ rounds: Number(value) }),
            }),
          },
          {
            value: settings.imposters,
            label: impostersUnit(settings.imposters),
            icon: <FiZap />,
            tooltip: "How many players never see the word",
            ...edit({
              label: "Imposters",
              value: String(settings.imposters),
              options: numberOptions([1, 2, 3, 4, 5], impostersUnit),
              searchable: false,
              onChange: (value) => onSettingsChange?.({ imposters: Number(value) }),
            }),
          },
          {
            value: formatClueVisibility(clueVisibility),
            label: "peek",
            icon: <FiEye />,
            tooltip: "How much of everyone else's clues the imposter gets to read first",
            ...edit({
              label: "Imposter peek",
              value: String(clueVisibility),
              options: IMPOSTER_CLUE_VISIBILITY_OPTIONS.map((v) => ({ value: String(v), label: formatClueVisibility(v), detail: "peek" })),
              searchable: false,
              onChange: (value) => onSettingsChange?.({ clueVisibility: Number(value) }),
            }),
          },
          {
            value: formatDuration(settings.roundDurationSec),
            label: "to write",
            icon: <FiClock />,
            tooltip: "How long each round gives you to write a clue",
            ...edit({
              label: "Time to write",
              value: String(settings.roundDurationSec),
              options: durationOptions([30, 45, 60, 75, 90, 120, 180]),
              custom: durationCustom(LIMITS.roundDurationSec),
              onChange: (value) => onSettingsChange?.({ roundDurationSec: Number(value) }),
            }),
          },
        ]}
        footer={
          inGame ? (
            <GameActions
              status={isHost ? <>Waiting <Elapsed /> to start</> : "Waiting for the host to start"}
              hint={
                short > 0
                  ? `${MIN_IMPOSTER_PLAYERS} players to start, ${short} more to go.`
                  : players.length === MIN_IMPOSTER_PLAYERS
                    ? "Three works. Four or more plays better."
                    : undefined
              }
            >
              {actions}

              <LeaveButton onLeave={onLeave} host={isHost} />

              {isHost && (
                <GameButton
                  variant="primary"
                  icon={<FiPlay />}
                  disabled={short > 0}
                  {...(starting ? { loading: true } : {})}
                  onClick={onStart}
                >
                  Start the round
                </GameButton>
              )}
            </GameActions>
          ) : undefined
        }
      />

      {!inGame && (
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

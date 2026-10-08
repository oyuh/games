import type { ReactNode } from "react";
import { FiAward, FiBookOpen, FiClock, FiEdit3, FiFlag, FiLink, FiLogIn, FiPlay, FiSend, FiUsers } from "react-icons/fi";
import { LOBBY_SETTING_LIMITS, chainCategories, chainCategoryLabels } from "@games/shared";
import { Elapsed, GameActions, GameButton, LeaveButton, GameEmpty, GameFacts, GamePanel, type GameFactEdit } from "../shared/GameKit";
import { categoryOptions, durationCustom, durationOptions, formatDuration, numberCustom, numberOptions } from "../../lib/setting-options";
import { GameVersus, KickButton } from "../shared/GameRoster";
import type { PlayerCardProps } from "../shared/PlayerCard";
import type { GamePhase } from "../shared/GameShellHeader";
import { getDisplayName } from "../../lib/session";
import "../../styles/chain-kit.css";

/**
 * Chain Reaction's lobby, out of the same kit the other two are built from.
 * Everything is props and callbacks, so /dev/chain can drive it with a made up
 * challenger and the real page can hand it zero's.
 *
 * The one thing this game has that the others do not is that it is exactly two
 * people, which GameVersus was already drawn for: two lg cards facing each
 * other with a mark between them. So the only chain shaped thing in this file
 * is what the second card says while nobody has taken the seat.
 */

/** Two, always. The mutator says so, and so does the game. */
export const CHAIN_PLAYERS = 2;

/** Where the seat with nobody in it gets its card from. Not a real session, so
 *  nothing may key off this id beyond drawing the empty half of the duel. */
const OPEN_SEAT = "chain-open-seat";

const PHASE_LOBBY: GamePhase = { id: "lobby", label: "Lobby", icon: <FiUsers />, hint: "Two players, no more. The host starts it." };
const PHASE_SUBMIT: GamePhase = { id: "submitting", label: "Chains", icon: <FiSend />, hint: "Write the chain your opponent has to crack. The ends are given away." };
const PHASE_PLAYING: GamePhase = { id: "playing", label: "Playing", icon: <FiLink />, hint: "Both of you are solving at once. Tap a word to guess it." };
const PHASE_FINISHED: GamePhase = { id: "finished", label: "Result", icon: <FiAward />, hint: "Rounds are done. See how the chains went." };

/**
 * Premade skips the writing phase outright, so a premade game is never shown a
 * step it will not take. The header counts these, and a track with a phase on
 * it that cannot happen counts wrong.
 */
export function chainPhases(mode: "premade" | "custom"): GamePhase[] {
  return mode === "custom"
    ? [PHASE_LOBBY, PHASE_SUBMIT, PHASE_PLAYING, PHASE_FINISHED]
    : [PHASE_LOBBY, PHASE_PLAYING, PHASE_FINISHED];
}

/** The player shape the game row already carries. */
export type ChainPlayer = { sessionId: string; name: string | null; connected: boolean };

/** The slice of `settings` the lobby shows. */
export interface ChainLobbySettings {
  chainLength: number;
  rounds: number;
  turnTimeSec: number | null;
  chainMode: "premade" | "custom";
  category?: string | undefined;
}

/** What the host can change from the lobby. */
export type ChainSettingsPatch = Partial<ChainLobbySettings>;

const LIMITS = LOBBY_SETTING_LIMITS.chain;
const roundsUnit = (n: number) => (n === 1 ? "round" : "rounds");
/** The picker's value for a round with no clock, which the setting stores as null. */
const NO_CLOCK = "none";

/**
 * Why the start button is off, in the words the server would have used. The
 * mutator wants exactly two, so the hint never promises a start that would
 * come straight back as an error.
 */
export function chainStartBlock(players: ChainPlayer[]): string | undefined {
  if (players.length < CHAIN_PLAYERS) return "Nobody to duel yet. Send them the code.";
  return undefined;
}

/**
 * The two seats, in the order you read them: you on the left whenever you are
 * in it, which is the side the scoreboard puts you on once the game starts.
 * An empty seat is still a card, so the duel keeps its shape while you wait.
 */
export function chainSeatCards({
  players,
  sessionId,
  hostId,
  sessionById = {},
  onKick,
  onTakeSeat,
}: {
  players: ChainPlayer[];
  sessionId: string;
  hostId: string;
  /** Names from the session table, which beat the ones on the player row. */
  sessionById?: Record<string, string>;
  /** Host only. Puts the two press remove button on the other card. */
  onKick?: (sessionId: string) => void;
  /** Given, the empty seat is the join button. */
  onTakeSeat?: () => void;
}): [PlayerCardProps, PlayerCardProps] {
  const mine = players.findIndex((p) => p.sessionId === sessionId);
  const seated = mine > 0 ? [players[mine]!, ...players.filter((_, i) => i !== mine)] : players;

  const cards = seated.slice(0, CHAIN_PLAYERS).map((player, index): PlayerCardProps => {
    const name = sessionById[player.sessionId] ?? getDisplayName(player.name, player.sessionId);
    const you = player.sessionId === sessionId;
    const host = player.sessionId === hostId;

    return {
      sessionId: player.sessionId,
      name,
      index,
      /* The lg card is a face, a name and a line, and the line is where the
         only thing a lobby knows about a seat goes: whether they are still
         there, and which of the two is holding the button everyone is
         waiting on. */
      caption: !player.connected ? "Dropped out" : host ? "Starts the duel" : "Waiting on the host",
      ...(you ? { you: true } : {}),
      ...(host ? { host: true } : {}),
      ...(player.connected ? {} : { disconnected: true }),
      ...(onKick && !you ? { action: <KickButton name={name} onKick={() => onKick(player.sessionId)} /> } : {}),
    };
  });

  while (cards.length < CHAIN_PLAYERS) {
    cards.push({
      sessionId: OPEN_SEAT,
      name: onTakeSeat ? "Take the seat" : "Open seat",
      state: "waiting",
      caption: onTakeSeat ? "This one is yours if you want it" : "Waiting for a challenger",
      className: "cr-seat-open",
      ...(onTakeSeat ? { onClick: onTakeSeat } : {}),
    });
  }

  return cards as [PlayerCardProps, PlayerCardProps];
}

export interface ChainLobbyProps {
  players: ChainPlayer[];
  sessionId: string;
  hostId: string;
  sessionById?: Record<string, string>;
  settings: ChainLobbySettings;
  isHost: boolean;
  /** One of the two. Someone spectating or following a link is not. */
  inGame: boolean;
  isSpectator?: boolean;
  /** Holds the start button while the mutator is in the air. */
  starting?: boolean;
  onStart: () => void;
  onLeave: () => void;
  onJoin: () => void;
  onKick?: (sessionId: string) => void;
  /** Goes in first on the action row, where the visibility toggle lives, so
   *  this component never has to know what zero is. */
  actions?: ReactNode;
  /** Turns the setup cells into pickers. Only reaches for it when you host. */
  onSettingsChange?: (patch: ChainSettingsPatch) => void;
}

export function ChainLobby({
  players,
  sessionId,
  hostId,
  sessionById,
  settings,
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
}: ChainLobbyProps) {
  const blocked = chainStartBlock(players);
  const full = players.length >= CHAIN_PLAYERS;
  const custom = settings.chainMode === "custom";
  // Everyone gets the name, so a change the host makes can be announced to
  // the room. Only the host gets the picker.
  const edit = (picker: GameFactEdit) => ({
    name: picker.label,
    ...(isHost && onSettingsChange ? { edit: picker } : {}),
  });

  return (
    <>
      <GameVersus
        label="The duel"
        players={chainSeatCards({
          players,
          sessionId,
          hostId,
          ...(sessionById ? { sessionById } : {}),
          ...(isHost && onKick ? { onKick } : {}),
          /* Anybody who is not in it yet can have the seat by pressing it,
             which is one less place to look than a button further down. */
          ...(!inGame && !isSpectator ? { onTakeSeat: onJoin } : {}),
        })}
      />

      <GameFacts
        label="Setup"
        facts={[
          {
            /* The setting that decides what the whole game is: solving a chain
               somebody wrote for you, or one the word bank picked. */
            value: custom ? "Your own chains" : "Premade chains",
            icon: custom ? <FiEdit3 /> : <FiLink />,
            tone: "var(--game-accent)",
            tooltip: custom
              ? "You each write the chain the other one has to crack"
              : "Both chains come out of the word bank",
            ...edit({
              label: "Chains",
              value: settings.chainMode,
              options: [
                { value: "premade", label: "Premade chains", detail: "from the word bank" },
                { value: "custom", label: "Your own chains", detail: "you write them" },
              ],
              searchable: false,
              onChange: (value) => onSettingsChange?.({ chainMode: value as ChainLobbySettings["chainMode"] }),
            }),
          },
          {
            value: settings.category ? (chainCategoryLabels[settings.category] ?? settings.category) : "Anything",
            icon: <FiBookOpen />,
            tooltip: custom ? "What to write about, if you want a steer" : "Where the chains get picked from",
            ...edit({
              label: "Word bank",
              value: settings.category ?? "",
              options: categoryOptions(chainCategories, chainCategoryLabels),
              searchPlaceholder: "Search categories…",
              onChange: (value) => onSettingsChange?.({ category: value }),
            }),
          },
          {
            value: settings.chainLength,
            label: "words",
            icon: <FiLink />,
            tooltip: "How long each chain is. The two ends are given to you",
            ...edit({
              label: "Chain length",
              value: String(settings.chainLength),
              options: numberOptions([5, 6, 7, 8, 9, 10], () => "words"),
              searchable: false,
              onChange: (value) => onSettingsChange?.({ chainLength: Number(value) }),
            }),
          },
          {
            value: settings.rounds,
            label: roundsUnit(settings.rounds),
            icon: <FiFlag />,
            tooltip: "How many chains you play through",
            ...edit({
              label: "Rounds",
              value: String(settings.rounds),
              options: numberOptions([1, 2, 3, 5, 7, 10], roundsUnit),
              custom: numberCustom(LIMITS.rounds, roundsUnit),
              onChange: (value) => onSettingsChange?.({ rounds: Number(value) }),
            }),
          },
          {
            value: settings.turnTimeSec ? formatDuration(settings.turnTimeSec) : "No clock",
            ...(settings.turnTimeSec ? { label: "a round" } : {}),
            icon: <FiClock />,
            tooltip: settings.turnTimeSec ? "How long a round runs before it ends itself" : "Rounds run until both of you are done",
            ...edit({
              label: "Round clock",
              value: settings.turnTimeSec ? String(settings.turnTimeSec) : NO_CLOCK,
              options: [
                { value: NO_CLOCK, label: "No clock", detail: "until you're both done", keywords: ["off", "none", "unlimited"] },
                ...durationOptions([30, 60, 90, 120, 180, 300]),
              ],
              custom: durationCustom(LIMITS.turnTimeSec),
              onChange: (value) => onSettingsChange?.({ turnTimeSec: value === NO_CLOCK ? null : Number(value) }),
            }),
          },
        ]}
        footer={
          inGame ? (
            <GameActions
              status={isHost ? <>Waiting <Elapsed /> to start</> : "Waiting for the host to start"}
              hint={blocked}
            >
              {actions}

              <LeaveButton onLeave={onLeave} host={isHost} />

              {isHost && (
                <GameButton
                  variant="primary"
                  icon={<FiPlay />}
                  disabled={!!blocked}
                  {...(starting ? { loading: true } : {})}
                  onClick={onStart}
                >
                  {custom ? "Start writing" : "Start the duel"}
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
            title={isSpectator ? "You are watching this one" : full ? "Both seats are taken" : "You are not in this duel yet"}
            hint={
              isSpectator
                ? "Spectators see both chains and solve neither."
                : full
                  ? "It is two players and no more. You can watch this one out."
                  : "Take the seat and it is you against them."
            }
            {...(full || isSpectator
              ? {}
              : { action: <GameButton variant="primary" icon={<FiLogIn />} onClick={onJoin}>Join the duel</GameButton> })}
          />
        </GamePanel>
      )}
    </>
  );
}

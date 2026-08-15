import { useState, type ReactNode } from "react";
import {
  FiAward, FiClock, FiCrosshair, FiDroplet, FiEdit3, FiEye, FiFlag, FiGrid,
  FiLogIn, FiLogOut, FiPlay, FiRotateCcw, FiSlash, FiUsers,
} from "react-icons/fi";
import { GameActions, GameButton, GameEmpty, GameFacts, GamePanel } from "../shared/GameKit";
import { GameRoster } from "../shared/GameRoster";
import type { PlayerCardProps } from "../shared/PlayerCard";
import type { GamePhase } from "../shared/GameShellHeader";
import { getDisplayName } from "../../lib/session";
import { SHADE_BANDS, ShadeGrid, type ShadeCell } from "./ShadeGrid";
import "../../styles/shade-kit.css";

/**
 * Shade Signal's lobby, out of the same kit the other three are built from.
 * Everything is props and callbacks, so /dev/shade can drive it with a made up
 * room and the real page can hand it zero's.
 *
 * The one thing this lobby has that the others do not is the board. Shade is
 * the only game here whose rules are a picture: nobody reads "one away is
 * three points" and pictures the ring it makes. So the lobby hands you the
 * grid with nothing riding on it and lets you find the ladder out by pressing
 * it, which is cheaper than a paragraph and it is the phase where everyone is
 * standing around anyway.
 */

/** One leader and two people to disagree about the colour. The mutator says
 *  so, so the hint below never promises a start that comes straight back. */
export const MIN_SHADE_PLAYERS = 3;

const PHASE_LOBBY: GamePhase = { id: "lobby", label: "Lobby", icon: <FiUsers />, hint: "Waiting for everyone to turn up. The host starts the round." };
const PHASE_PICKING: GamePhase = { id: "picking", label: "The shade", icon: <FiDroplet />, hint: "The leader is choosing the colour everyone else has to find." };
const PHASE_CLUE1: GamePhase = { id: "clue1", label: "Clue 1", icon: <FiEdit3 />, hint: "One word from the leader, and it has to point at a colour." };
const PHASE_GUESS1: GamePhase = { id: "guess1", label: "Guess 1", icon: <FiCrosshair />, hint: "Pick the cell you think they mean. Closest wins the most." };
const PHASE_CLUE2: GamePhase = { id: "clue2", label: "Clue 2", icon: <FiEdit3 />, hint: "A second clue, up to two words. The leader can see where you all went." };
const PHASE_GUESS2: GamePhase = { id: "guess2", label: "Guess 2", icon: <FiCrosshair />, hint: "Move if the second clue changed your mind, or stay where you are." };
const PHASE_REVEAL: GamePhase = { id: "reveal", label: "Reveal", icon: <FiEye />, hint: "The colour, everybody's guesses, and what each of them paid." };
const PHASE_FINISHED: GamePhase = { id: "finished", label: "Finished", icon: <FiAward />, hint: "Everyone has led. The scores are final." };

/**
 * The leader only picks their own colour when the host turned that on. Left
 * off, the grid deals one and the game opens straight into the first clue, so
 * a track with a picking step on it would be counting a phase that never
 * happens.
 */
export function shadePhases(leaderPick?: boolean): GamePhase[] {
  const rest = [PHASE_CLUE1, PHASE_GUESS1, PHASE_CLUE2, PHASE_GUESS2, PHASE_REVEAL, PHASE_FINISHED];
  return leaderPick ? [PHASE_LOBBY, PHASE_PICKING, ...rest] : [PHASE_LOBBY, ...rest];
}

/** The player shape the game row already carries. */
export type ShadePlayer = { sessionId: string; name: string | null; connected: boolean };

/** The slice of `settings` the lobby shows. */
export interface ShadeLobbySettings {
  hardMode: boolean;
  clueDurationSec: number;
  guessDurationSec: number;
  roundsPerPlayer: number;
  leaderPick?: boolean;
}

/** Why the start button is off, in the words the mutator would have used. */
export function shadeStartBlock(players: ShadePlayer[]): string | undefined {
  const short = MIN_SHADE_PLAYERS - players.length;
  if (short > 0) return `${MIN_SHADE_PLAYERS} players to start, ${short} more to go.`;
  return undefined;
}

/**
 * Nobody is ready or waiting in a lobby, they have just turned up, so the only
 * state worth drawing is having dropped off. Nobody is the leader yet either:
 * the order is shuffled when the host starts, so a lobby that marked one would
 * be guessing.
 */
export function shadeLobbyCards({
  players,
  sessionId,
  hostId,
  sessionById = {},
}: {
  players: ShadePlayer[];
  sessionId: string;
  hostId: string;
  /** Names from the session table, which beat the ones on the player row. */
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

/**
 * The board, with nothing riding on it. Press a cell and it stands in for the
 * leader's colour, so the rings around it are the ones you would have been
 * scored against, and hovering anything says what that guess would have paid.
 *
 * The pills only appear once there is a colour to measure from. A scoring
 * ladder with no ladder on screen is four numbers to take on trust.
 */
export function ShadeExplorer({ rows, cols, seed }: { rows: number; cols: number; seed: number }) {
  const [pretend, setPretend] = useState<ShadeCell | null>(null);

  return (
    <GamePanel
      title="The grid"
      action={
        pretend && (
          <GameButton size="sm" variant="ghost" icon={<FiRotateCcw />} onClick={() => setPretend(null)}>
            Clear
          </GameButton>
        )
      }
    >
      <div className="sk-explore">
        <p className="sk-explore-hint">
          {pretend
            ? "That is the colour, and those are the rings you get paid inside. Point at any cell to see what guessing it would have been worth."
            : "This is the board you will be guessing on. Press a cell to pretend it is the leader's colour and see how the scoring falls around it."}
        </p>

        <ShadeGrid rows={rows} cols={cols} seed={seed} target={pretend} zones scores onSelect={setPretend} />

        {pretend && (
          <GameFacts
            facts={SHADE_BANDS.map((band) => ({
              value: `${band.points} pt${band.points === 1 ? "" : "s"}`,
              label: band.label,
              /* One colour getting quieter as the guess gets worse, which is
                 the same slope the rings on the board are drawn with. */
              tone: `color-mix(in srgb, var(--game-accent) ${100 - band.dist * 24}%, var(--secondary))`,
            }))}
          />
        )}
      </div>
    </GamePanel>
  );
}

export interface ShadeLobbyProps {
  players: ShadePlayer[];
  sessionId: string;
  hostId: string;
  sessionById?: Record<string, string>;
  settings: ShadeLobbySettings;
  /** The board's shape and its colours, so the explorer is the real one. */
  grid: { rows: number; cols: number; seed: number };
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
  /** Goes in first on the action row, where the visibility toggle lives, so
   *  this component never has to know what zero is. */
  actions?: ReactNode;
}

export function ShadeLobby({
  players,
  sessionId,
  hostId,
  sessionById,
  settings,
  grid,
  isHost,
  inGame,
  isSpectator,
  starting,
  onStart,
  onLeave,
  onJoin,
  onKick,
  actions,
}: ShadeLobbyProps) {
  const blocked = shadeStartBlock(players);

  /* Everyone leads, so the length of the game is the room, and it grows as
     people arrive. Worth showing live rather than as a setting: "3 rounds"
     means something different in a room of three than the setting behind it
     does. */
  const rounds = players.length * settings.roundsPerPlayer;

  return (
    <>
      <GameRoster
        players={shadeLobbyCards({ players, sessionId, hostId, ...(sessionById ? { sessionById } : {}) })}
        emptyLabel="Nobody has joined yet. Share the code."
        {...(isHost && onKick ? { onKick } : {})}
      />

      <ShadeExplorer rows={grid.rows} cols={grid.cols} seed={grid.seed} />

      <GameFacts
        label="Setup"
        facts={[
          {
            /* The one that changes how the game feels rather than how long it
               runs, so it is the one that gets the colour, and only when it is
               actually on. Off is the ordinary way to play. */
            value: settings.hardMode ? "No colour names" : "Any clue goes",
            icon: settings.hardMode ? <FiSlash /> : <FiEdit3 />,
            ...(settings.hardMode ? { tone: "var(--game-accent)" } : {}),
            tooltip: settings.hardMode
              ? "The leader cannot say red, blue, green and the rest, so the clues have to come at it sideways"
              : "The leader can name a colour outright if they want to",
          },
          {
            value: settings.leaderPick ? "Leader picks" : "Grid picks",
            icon: <FiDroplet />,
            tooltip: settings.leaderPick
              ? "Whoever is leading chooses the colour they have to describe"
              : "The colour is dealt at random, so the leader gets what everyone else gets",
          },
          {
            value: rounds || settings.roundsPerPlayer,
            label: rounds === 1 ? "round" : "rounds",
            icon: <FiFlag />,
            tooltip: `Everyone leads ${settings.roundsPerPlayer === 1 ? "once" : `${settings.roundsPerPlayer} times`}, so the game gets longer as people join`,
          },
          {
            value: `${grid.cols} x ${grid.rows}`,
            label: "grid",
            icon: <FiGrid />,
            tooltip: `${grid.rows * grid.cols} colours to pick out of`,
          },
          {
            value: `${settings.clueDurationSec}s`,
            label: "to clue",
            icon: <FiClock />,
            tooltip: "How long the leader gets to write each clue",
          },
          {
            value: `${settings.guessDurationSec}s`,
            label: "to guess",
            icon: <FiCrosshair />,
            tooltip: "How long everyone else gets to lock a cell in",
          },
        ]}
      />

      {inGame ? (
        <GameActions
          hint={
            blocked ??
            (players.length === MIN_SHADE_PLAYERS ? "Three works. More guessers makes the leader's job harder." : undefined)
          }
        >
          {actions}

          {isHost ? (
            <GameButton
              variant="primary"
              icon={<FiPlay />}
              disabled={!!blocked}
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
            title={isSpectator ? "You are watching this one" : "You are not in this room yet"}
            hint={
              isSpectator
                ? "Spectators see the colour and every guess, and score neither. Join to take a turn leading."
                : "Join and you are in the order the moment the host starts. Everyone leads a round."
            }
            action={<GameButton variant="primary" icon={<FiLogIn />} onClick={onJoin}>Join the game</GameButton>}
          />
        </GamePanel>
      )}
    </>
  );
}

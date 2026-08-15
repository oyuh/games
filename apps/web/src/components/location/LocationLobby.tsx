import { useState, type ReactNode } from "react";
import { haversineKm, scoreForDistance, PERFECT_KM } from "@games/shared";
import {
  FiAward, FiClock, FiCrosshair, FiEdit3, FiEye, FiFlag, FiLogIn, FiLogOut,
  FiMapPin, FiPlay, FiRotateCcw, FiUsers,
} from "react-icons/fi";
import { GameActions, GameButton, GameEmpty, GameFacts, GamePanel } from "../shared/GameKit";
import { GameRoster } from "../shared/GameRoster";
import type { PlayerCardProps } from "../shared/PlayerCard";
import type { GamePhase } from "../shared/GameShellHeader";
import { getDisplayName } from "../../lib/session";
import { WorldMap, type MapMarker } from "./WorldMap";
import "../../styles/location-kit.css";

/**
 * Location Signal's lobby, out of the same kit the other four are built from.
 * Everything is props and callbacks, so /dev/location can drive it with a made
 * up room and the real page can hand it zero's.
 *
 * Like Shade, this lobby has the thing you play on in it, and for the same
 * reason: nobody reads "five thousand points inside seventy five miles" and
 * pictures how forgiving that is. So the lobby hands you the map with nothing
 * riding on it, lets you drop a place and then guess at it, and tells you what
 * the miss would have paid. Cheaper than a paragraph, and the lobby is the
 * phase where everyone is standing around anyway.
 */

/** One leader and one person to guess. The mutator says so, so the hint below
 *  never promises a start that comes straight back. */
export const MIN_LOCATION_PLAYERS = 2;

const PHASE_LOBBY: GamePhase = { id: "lobby", label: "Lobby", icon: <FiUsers />, hint: "Waiting for everyone to turn up. The host starts the round." };
/* Picking the place and writing the first clue are one step for whoever is
   leading, so they are one step on the track. The server still moves through
   `clue1` on the way, but nobody is ever sat looking at it. */
const PHASE_PICKING: GamePhase = { id: "picking", label: "The place", icon: <FiMapPin />, hint: "The leader is picking somewhere and writing the first clue about it." };
const PHASE_REVEAL: GamePhase = { id: "reveal", label: "Reveal", icon: <FiEye />, hint: "Where it was, where everybody went, and what the distance paid." };
const PHASE_FINISHED: GamePhase = { id: "finished", label: "Finished", icon: <FiAward />, hint: "Everyone has led. The scores are final." };

/**
 * The host picks how many clue-and-guess pairs a round runs, one to four, so
 * the track is built to match rather than assuming the usual two. A track with
 * a clue 3 on it in a game that stops at two would be counting phases that
 * never happen.
 */
export function locationPhases(cluePairs = 2): GamePhase[] {
  const pairs: GamePhase[] = [];

  for (let n = 1; n <= cluePairs; n++) {
    /* The first clue is written on the same screen as the pin, so it is not a
       step of its own. Every clue after it is. */
    if (n > 1) {
      pairs.push({
        id: `clue${n}`,
        label: `Clue ${n}`,
        icon: <FiEdit3 />,
        hint: "Another line. The leader can see where everybody went last time.",
      });
    }
    pairs.push({
      id: `guess${n}`,
      label: `Guess ${n}`,
      icon: <FiCrosshair />,
      hint: n === 1
        ? "Drop your pin. The closer you land, the more it pays."
        : "Move your pin if the new clue changed your mind, or leave it there.",
    });
  }

  return [PHASE_LOBBY, PHASE_PICKING, ...pairs, PHASE_REVEAL, PHASE_FINISHED];
}

/**
 * Which step on the track a live phase belongs to. `clue1` is written on the
 * picking screen, so it has no step of its own and the track stays on the
 * place while the server passes through it.
 */
export function locationTrackPhase(phase: string) {
  return phase === "clue1" ? "picking" : phase;
}

/** The player shape the game row already carries. */
export type LocationPlayer = { sessionId: string; name: string | null; connected: boolean; totalScore: number };

/** The slice of `settings` the lobby shows. */
export interface LocationLobbySettings {
  clueDurationSec: number;
  guessDurationSec: number;
  roundsPerPlayer: number;
  cluePairs?: number;
}

/** Why the start button is off, in the words the mutator would have used. */
export function locationStartBlock(players: LocationPlayer[]): string | undefined {
  const short = MIN_LOCATION_PLAYERS - players.length;
  if (short > 0) return `${MIN_LOCATION_PLAYERS} players to start, ${short} more to go.`;
  return undefined;
}

/**
 * Nobody is ready or waiting in a lobby, they have just turned up, so the only
 * state worth drawing is having dropped off. Nobody is the leader yet either:
 * the order is shuffled when the host starts, so a lobby that marked one would
 * be guessing.
 */
export function locationLobbyCards({
  players,
  sessionId,
  hostId,
  sessionById = {},
}: {
  players: LocationPlayer[];
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

/** Distances worth knowing what they pay, run through the server's own maths.
 *  The first one is the band where everything is a bullseye. */
const BAND_KM = [PERFECT_KM, 500, 1500, 3000, 6000];

export function locationKmLabel(km: number) {
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

/**
 * What a miss is worth, at a handful of distances. Read out of the same
 * function that does the scoring, so the ladder the lobby shows you and the
 * one you get paid on are one ladder.
 */
export function LocationBands({ plain }: { plain?: boolean }) {
  return (
    <div className={`lk-bands${plain ? " lk-bands--plain" : ""}`}>
      {BAND_KM.map((km, i) => (
        <span key={km} className="lk-band" style={{ "--lk-band": 1 - i / BAND_KM.length } as React.CSSProperties}>
          <span className="lk-band-dist">{i === 0 ? `within ${locationKmLabel(km)}` : locationKmLabel(km)}</span>
          <span className="lk-band-pts">{scoreForDistance(km).toLocaleString()}</span>
        </span>
      ))}
    </div>
  );
}

type Coords = { lat: number; lng: number };

/**
 * The map, with nothing riding on it. Drop a place, then guess at it, and it
 * says how far off you were and what that would have paid. Two clicks is the
 * whole round, which is the fastest way to learn that the scoring is far
 * kinder than it sounds.
 *
 * All of it is said on the map rather than under it. A caption below a map is
 * a caption you read after you have stopped looking at the thing it is about,
 * and the numbers here only mean anything next to the two pins they came from.
 */
export function LocationExplorer({ height = "clamp(360px, 56vh, 620px)" }: { height?: number | string }) {
  const [place, setPlace] = useState<Coords | null>(null);
  const [guess, setGuess] = useState<Coords | null>(null);

  const km = place && guess ? haversineKm(place.lat, place.lng, guess.lat, guess.lng) : null;
  const points = km === null ? null : scoreForDistance(km);

  const markers: MapMarker[] = [];
  if (place) markers.push({ ...place, color: "#ffd166", label: "The place", icon: <FiMapPin />, ring: true });
  if (guess) markers.push({ ...guess, color: "#06d6a0", label: "Your guess", icon: <FiCrosshair />, ring: true, pulse: true });

  return (
    <div className="lk-map">
      <WorldMap
        height={height}
        interactive
        markers={markers}
        onClick={(coords) => (place ? setGuess(coords) : setPlace(coords))}
        overlay={
          <div className="lk-hud">
            {km !== null && (
              <div className="lk-hud-score">
                <span className="lk-hud-km">{locationKmLabel(km)}</span>
                <span className="lk-hud-pts">{points!.toLocaleString()}<small>pts</small></span>

                <GameButton
                  className="locsig-map-ui lk-hud-btn"
                  size="sm"
                  variant="ghost"
                  icon={<FiRotateCcw />}
                  aria-label="Clear the map"
                  onClick={() => { setPlace(null); setGuess(null); }}
                >
                  Reset
                </GameButton>
              </div>
            )}

            {/* One line, and only the one that applies. Once there is a score
                the ladder says more than a sentence would, so it takes over. */}
            {place && guess ? (
              <LocationBands />
            ) : (
              <p className="lk-hud-hint">
                {place
                  ? "Now click somewhere else, the way you would with only a clue to go on."
                  : "Click anywhere to pretend it is the leader's place."}
              </p>
            )}
          </div>
        }
      />
    </div>
  );
}

export interface LocationLobbyProps {
  players: LocationPlayer[];
  sessionId: string;
  hostId: string;
  sessionById?: Record<string, string>;
  settings: LocationLobbySettings;
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

export function LocationLobby({
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
}: LocationLobbyProps) {
  const blocked = locationStartBlock(players);
  const pairs = settings.cluePairs ?? 2;

  /* Everyone leads, so the length of the game is the room, and it grows as
     people arrive. Worth showing live rather than as a setting: "3 rounds"
     means something different in a room of three than the setting behind it
     does. */
  const rounds = players.length * settings.roundsPerPlayer;

  return (
    <>
      <GameRoster
        players={locationLobbyCards({ players, sessionId, hostId, ...(sessionById ? { sessionById } : {}) })}
        emptyLabel="Nobody has joined yet. Share the code."
        {...(isHost && onKick ? { onKick } : {})}
      />

      <LocationExplorer />

      <GameFacts
        label="Setup"
        facts={[
          {
            /* The one that changes how the game feels rather than how long it
               runs, so it is the one that gets the color. Two chances is the
               ordinary way to play. */
            value: pairs,
            label: pairs === 1 ? "clue and guess" : "clues and guesses",
            icon: <FiEdit3 />,
            ...(pairs === 2 ? {} : { tone: "var(--game-accent)" }),
            tooltip: pairs === 1
              ? "One clue, one guess, and that is the round. No second chances"
              : `The leader writes ${pairs} clues, and you get a go after each one. Only where you finish counts`,
          },
          {
            value: rounds || settings.roundsPerPlayer,
            label: rounds === 1 ? "round" : "rounds",
            icon: <FiFlag />,
            tooltip: `Everyone leads ${settings.roundsPerPlayer === 1 ? "once" : `${settings.roundsPerPlayer} times`}, so the game gets longer as people join`,
          },
          {
            value: "5,000",
            label: "for a bullseye",
            icon: <FiCrosshair />,
            tooltip: `Anywhere inside ${locationKmLabel(PERFECT_KM)} of the place is full marks, and it falls away slowly from there`,
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
            icon: <FiMapPin />,
            tooltip: "How long everyone else gets to drop a pin",
          },
        ]}
      />

      {inGame ? (
        <GameActions
          hint={
            blocked ??
            (players.length === MIN_LOCATION_PLAYERS ? "Two works. More guessers makes the leader's clue harder to write." : undefined)
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
                ? "Spectators see the place and every pin, and score neither. Join to take a turn leading."
                : "Join and you are in the order the moment the host starts. Everyone leads a round."
            }
            action={<GameButton variant="primary" icon={<FiLogIn />} onClick={onJoin}>Join the game</GameButton>}
          />
        </GamePanel>
      )}
    </>
  );
}

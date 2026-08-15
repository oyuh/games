import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { FiCheck, FiCornerUpLeft, FiCrosshair, FiMapPin, FiSend, FiX } from "react-icons/fi";
import { haversineKm, scoreForDistance } from "@games/shared";
import { GameButton } from "../shared/GameKit";
import { GameTimer } from "../shared/GameShellHeader";
import { PlayerAvatar } from "../shared/PlayerAvatar";
import { LocationBands, locationKmLabel } from "./LocationLobby";
import { WorldMap, type MapMarker } from "./WorldMap";
import "../../styles/location-kit.css";

/**
 * The phases you actually play, on the map they are played on.
 *
 * Shade puts its board on the left and everything you do with it in a rail down
 * the right. A map does not take that: it is already as wide as the screen will
 * give it, and a 17rem column stolen off the side is 17rem of map gone. So the
 * same idea is turned on its side here. The map keeps the full width and the
 * things you do with it are welded to the bottom edge of it, close enough that
 * the two read as one object rather than a picture with a form under it.
 *
 * What goes on the map is what belongs to the map: the pins, the clues already
 * said, the timer. What goes in the console is what you do: type here, press
 * this.
 */

export type Coords = { lat: number; lng: number };

/** A clue once it has been said. Over the map, because it is the thing you are
 *  reading the map against. */
export function LocationClueTag({ round, text }: { round: number; text: string }) {
  return (
    <span className="lk-clue">
      <span className="lk-clue-tag">{round}</span>
      <span className="lk-clue-text">{text}</span>
    </span>
  );
}

/** Somebody else is doing the work. A face, so it is a person waiting on a
 *  person rather than a page waiting on a phase. */
function LocationWaitingOn({ sessionId, name, children }: { sessionId: string; name: string; children: ReactNode }) {
  return (
    <div className="lk-waiting">
      <span className="lk-waiting-face">
        <PlayerAvatar seed={sessionId} />
      </span>
      <span><strong>{name}</strong> {children}</span>
    </div>
  );
}

/**
 * The map with its console welded to the bottom. Everything a phase draws goes
 * through here so the seam is in one place and every phase sits at the same
 * height.
 */
export function LocationStage({
  height = "clamp(340px, 52vh, 560px)",
  markers,
  center,
  zoom,
  onClick,
  overlay,
  endsAt,
  duration,
  onHideClock,
  children,
}: {
  height?: number | string;
  markers?: MapMarker[];
  center?: [number, number];
  zoom?: number;
  onClick?: (coords: Coords) => void;
  /** Sits on the map. Clues, and anything else about the map itself. */
  overlay?: ReactNode;
  endsAt?: number | null;
  duration?: number;
  /** Given, the clock grows a button on hover that sends it back to the shell
   *  header. Some people want the time by the thing being timed, some would
   *  rather have the map. */
  onHideClock?: () => void;
  /** The console. What you do, as opposed to what you are looking at. */
  children: ReactNode;
}) {
  return (
    <div className="lk-stage">
      <div className="lk-map lk-map--joined">
        <WorldMap
          height={height}
          interactive
          {...(markers ? { markers } : {})}
          {...(center ? { center } : {})}
          {...(zoom !== undefined ? { zoom } : {})}
          {...(onClick ? { onClick } : {})}
          {...(overlay || endsAt
            ? {
                overlay: (
                  <>
                    {/* The clock rides on the map rather than in the console,
                        because it is a fact about the phase and the console is
                        only ever the things you press. */}
                    {endsAt != null && (
                      <div className="lk-clock locsig-map-ui">
                        <GameTimer endsAt={endsAt} {...(duration !== undefined ? { duration } : {})} />

                        {onHideClock && (
                          <button
                            type="button"
                            className="lk-clock-hide"
                            onClick={onHideClock}
                            aria-label="Move the clock to the header"
                            data-tooltip="Put it back in the header"
                            data-tooltip-variant="game"
                          >
                            <FiX aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    )}
                    {overlay}
                  </>
                ),
              }
            : {})}
        />
      </div>

      <div className="lk-console">{children}</div>
    </div>
  );
}

/**
 * Picking the place and writing the first clue, which used to be two phases and
 * is one screen now.
 *
 * They were split because the server does them in two steps, but for the leader
 * it was one thought interrupted: drop a pin, wait for the page to turn over,
 * then describe the pin you can no longer remember choosing. Together you pick
 * somewhere and say the thing about it while it is still under your cursor, and
 * the round starts on one press.
 *
 * The composer stays until there is a pin to describe. Handing somebody a text
 * box for a place they have not chosen is asking them to write a clue about
 * nothing.
 */
export function LocationPickClue({
  isLeader,
  leader,
  target,
  value,
  submitting,
  endsAt,
  duration,
  onHideClock,
  onPick,
  onChange,
  onSubmit,
}: {
  isLeader: boolean;
  leader: { sessionId: string; name: string };
  /** Where they have dropped it. Null until they do. */
  target: Coords | null;
  value: string;
  submitting?: boolean;
  endsAt?: number | null;
  duration?: number;
  onHideClock?: () => void;
  onPick: (coords: Coords) => void;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  /* The box appears the moment the pin lands, so the cursor goes into it then
     rather than making them reach for it. */
  useEffect(() => {
    if (!target || !isLeader) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [target, isLeader]);

  const markers: MapMarker[] = target
    ? [{ ...target, color: "#ffd166", label: "Your place", icon: <FiMapPin />, ring: true, pulse: !value }]
    : [];

  if (!isLeader) {
    return (
      <LocationStage
        markers={[]}
        {...(endsAt !== undefined ? { endsAt } : {})}
        {...(duration !== undefined ? { duration } : {})}
        {...(onHideClock ? { onHideClock } : {})}
      >
        <LocationWaitingOn sessionId={leader.sessionId} name={leader.name}>
          is finding somewhere and working out how to describe it.
        </LocationWaitingOn>
      </LocationStage>
    );
  }

  return (
    <LocationStage
      markers={markers}
      onClick={onPick}
      {...(endsAt !== undefined ? { endsAt } : {})}
      {...(duration !== undefined ? { duration } : {})}
      {...(onHideClock ? { onHideClock } : {})}
    >
      <form className="lk-composer" onSubmit={onSubmit}>
        <span className={`lk-step${target ? " is-done" : ""}`}>
          <FiMapPin aria-hidden="true" />
          {target ? "Place set" : "Click the map"}
        </span>

        <input
          ref={inputRef}
          className="lk-composer-input"
          value={value}
          maxLength={80}
          disabled={!target}
          placeholder={target ? "Say something that points at it…" : "Drop your pin first, then describe it…"}
          aria-label="Clue 1"
          onChange={(event) => onChange(event.target.value)}
        />

        <span className="lk-composer-count" aria-hidden="true">{80 - value.length}</span>

        <GameButton
          type="submit"
          variant="primary"
          icon={<FiSend />}
          disabled={!target || !value.trim()}
          {...(submitting ? { loading: true } : {})}
        >
          Send it
        </GameButton>
      </form>

      <p className="lk-console-hint">
        {!target
          ? "Anywhere on earth. Nobody else can see where you put it."
          : "One line, and it cannot just name the place. Move the pin any time before you send."}
      </p>
    </LocationStage>
  );
}

/** How many have handed one in, as dots and as words. Same shape Shade's uses,
 *  because a guess phase is a guess phase. */
function LocationTally({ locked, total }: { locked: number; total: number }) {
  return (
    <span className="lk-tally">
      <span className="lk-tally-dots" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={i < locked ? "is-in" : ""} />
        ))}
      </span>
      <span className="lk-tally-text">{locked} of {total} in</span>
    </span>
  );
}

export interface LocationGuessProps {
  /** Which guess this is. Anything past the first is a move, not a fresh pick. */
  round: number;
  /** You are one of the people guessing. The leader and anyone who wandered in
   *  watch instead. */
  isGuessing: boolean;
  leader: { sessionId: string; name: string };
  /** Every clue said so far, oldest first. They go on the map, because they are
   *  the thing you are reading the map against. */
  clues: Array<{ round: number; text: string }>;
  /**
   * The place. Only ever passed to somebody allowed to see it, which during a
   * guess is the leader alone. Everyone else is not sent the answer to the
   * question they are being asked.
   */
  target?: Coords | null;
  /** Where everybody else went, for the leader watching it happen. */
  others?: MapMarker[];
  /** What you are holding. Not handed over until the button. */
  selected: Coords | null;
  onSelect: (coords: Coords) => void;
  /** Handed over. Still movable, since the mutator takes the newest one. */
  locked?: boolean;
  onLock: () => void;
  /** Round 2 and up: where you went last time. */
  previous?: Coords | null;
  /** Locks the previous spot without hunting for it on the map again. */
  onKeep?: () => void;
  submitting?: boolean;
  lockedCount: number;
  guesserCount: number;
  endsAt?: number | null;
  duration?: number;
  onHideClock?: () => void;
}

/**
 * Dropping a pin on where you think it is.
 *
 * The second guess onwards is a move rather than a fresh start, so where you
 * went last time stays on the map in a quieter colour and there is a button to
 * stay there. Making somebody find their own last guess again to say "still
 * that one" is the kind of busywork that loses a round to the clock.
 *
 * Locking does not take the map away. The mutator keeps the newest guess for
 * the round, so moving after you have locked is allowed, and a board that went
 * dead on you would be inventing a rule the server does not have.
 */
export function LocationGuess({
  round,
  isGuessing,
  leader,
  clues,
  target,
  others,
  selected,
  onSelect,
  locked,
  onLock,
  previous,
  onKeep,
  submitting,
  lockedCount,
  guesserCount,
  endsAt,
  duration,
  onHideClock,
}: LocationGuessProps) {
  const markers: MapMarker[] = [...(others ?? [])];

  /* Where you went last time, kept quiet. It is context, not your answer. */
  if (previous && !(selected && selected.lat === previous.lat && selected.lng === previous.lng)) {
    markers.push({ ...previous, color: "#7b8794", label: `Guess ${round - 1}`, size: 1.6, hideLabel: true });
  }

  if (target) markers.push({ ...target, color: "#ffd166", label: "The place", icon: <FiMapPin />, ring: true });

  if (selected) {
    markers.push({
      ...selected,
      color: "#06d6a0",
      label: locked ? "Locked in" : "Your guess",
      icon: locked ? <FiCheck /> : <FiCrosshair />,
      ring: true,
      pulse: !locked,
    });
  }

  const onPrevious = !!(selected && previous && selected.lat === previous.lat && selected.lng === previous.lng);

  return (
    <LocationStage
      markers={markers}
      {...(isGuessing ? { onClick: onSelect } : {})}
      {...(endsAt !== undefined ? { endsAt } : {})}
      {...(duration !== undefined ? { duration } : {})}
      {...(onHideClock ? { onHideClock } : {})}
      overlay={
        clues.length > 0 ? (
          <div className="lk-clues">
            {clues.map((clue) => <LocationClueTag key={clue.round} round={clue.round} text={clue.text} />)}
          </div>
        ) : undefined
      }
    >
      {isGuessing ? (
        <>
          <div className="lk-controls">
            <span className={`lk-step${selected ? " is-done" : ""}`}>
              <FiCrosshair aria-hidden="true" />
              {locked ? "Locked in" : selected ? "Pin dropped" : "Click the map"}
            </span>

            {/* Only while they are still stood on it. Once they move off, the
                old pin is on the map to click and the button is a third way to
                do a thing there are already two ways to do. */}
            {previous && !onPrevious && onKeep && (
              <GameButton size="sm" variant="secondary" icon={<FiCornerUpLeft />} onClick={onKeep}>
                Stay where I was
              </GameButton>
            )}

            <GameButton
              variant="primary"
              icon={locked ? <FiCheck /> : <FiMapPin />}
              disabled={!selected}
              {...(submitting ? { loading: true } : {})}
              onClick={onLock}
            >
              {locked ? "Move it here" : "Lock it in"}
            </GameButton>

            <LocationTally locked={lockedCount} total={guesserCount} />
          </div>

          <p className="lk-console-hint">
            {!selected
              ? round > 1
                ? "Your last guess is the grey pin. Click anywhere to move, or stay where you were."
                : "Anywhere on earth. The closer you land, the more it pays."
              : locked
                ? "That is your answer. You can still move it until the clock runs out."
                : "Lock it in before the time goes, or it does not count."}
          </p>
        </>
      ) : (
        <>
          <div className="lk-controls">
            <LocationWaitingOn sessionId={leader.sessionId} name={leader.name}>
              {target ? "is watching everyone hunt for it." : "already knows where it is."}
            </LocationWaitingOn>
            <LocationTally locked={lockedCount} total={guesserCount} />
          </div>

          <p className="lk-console-hint">
            {target
              ? "Your place is the gold pin. Everyone else's guesses come in as they lock them."
              : "Sit tight. The pins come in as they are locked."}
          </p>
        </>
      )}
    </LocationStage>
  );
}

/**
 * One player's round, and why it came out the way it did.
 *
 * The bar is the point of this row. Two numbers on their own do not tell you
 * whether 2,900 was a good result, but a bar that is most of the way along next
 * to one that is barely started says it before you have read either figure. It
 * is drawn against a full score rather than against the winner, so a round
 * everybody misses looks like a round everybody missed.
 */
function LocationScoreRow({
  name,
  sessionId,
  km,
  points,
  you,
  rank,
}: {
  name: string;
  sessionId: string;
  km: number | null;
  points: number;
  you?: boolean;
  rank: number;
}) {
  return (
    <li className={`lk-score${you ? " is-you" : ""}`}>
      <span className="lk-score-rank">{rank}</span>

      <span className="lk-score-face">
        <PlayerAvatar seed={sessionId} />
      </span>

      <span className="lk-score-name">
        {name}
        {you && <span className="lk-score-you">you</span>}
      </span>

      {/* Distance first, because it is the thing that caused the points. */}
      <span className="lk-score-dist">
        {km === null ? "never guessed" : locationKmLabel(km)}
      </span>

      <span className="lk-score-bar" aria-hidden="true">
        <span style={{ width: `${Math.round((points / 5000) * 100)}%` }} />
      </span>

      <span className="lk-score-pts">{points > 0 ? `+${points.toLocaleString()}` : "0"}</span>
    </li>
  );
}

export interface LocationResultProps {
  /** Where it actually was. */
  target: Coords;
  clues: Array<{ round: number; text: string }>;
  leader: { sessionId: string; name: string; you?: boolean };
  /** Everyone who was guessing, and where they finished. Points are worked out
   *  here from the distance rather than passed in, so the number and the reason
   *  for it cannot drift apart. */
  players: Array<{ sessionId: string; name: string; guess?: Coords | null; you?: boolean }>;
  /** Nothing else is coming after this one. */
  last?: boolean;
  endsAt?: number | null;
  duration?: number;
  onHideClock?: () => void;
}

/**
 * The few seconds between rounds. Where it was, where everybody went, and what
 * that paid.
 *
 * The whole screen is built to answer one question, which is "why did I get
 * that". So the distance sits next to the points on every row, the ladder the
 * points came off is on the map, and the pins are labelled with how far out
 * they were rather than with whose they are, since by now you know whose.
 */
export function LocationResult({
  target,
  clues,
  leader,
  players,
  last,
  endsAt,
  duration,
  onHideClock,
}: LocationResultProps) {
  const scored = players
    .map((player) => {
      const km = player.guess ? haversineKm(target.lat, target.lng, player.guess.lat, player.guess.lng) : null;
      return { ...player, km, points: km === null ? 0 : scoreForDistance(km) };
    })
    .sort((a, b) => b.points - a.points);

  const markers: MapMarker[] = [
    { ...target, color: "#ffd166", label: "It was here", icon: <FiMapPin />, ring: true, pulse: true, size: 4 },
    ...scored.flatMap((player) =>
      player.guess
        ? [{
            lat: player.guess.lat,
            lng: player.guess.lng,
            color: player.points > 0 ? "#06d6a0" : "#7b8794",
            /* How far out, not whose. By the reveal you know which pin is
               yours, and the thing you want off the map is the damage. */
            label: `${player.name} · ${locationKmLabel(player.km!)}`,
            size: 2.4,
            ring: true,
          }]
        : [],
    ),
  ];

  const best = scored[0];

  return (
    <LocationStage
      markers={markers}
      {...(endsAt !== undefined ? { endsAt } : {})}
      {...(duration !== undefined ? { duration } : {})}
      {...(onHideClock ? { onHideClock } : {})}
      overlay={
        <>
          {clues.length > 0 && (
            <div className="lk-clues">
              {clues.map((clue) => <LocationClueTag key={clue.round} round={clue.round} text={clue.text} />)}
            </div>
          )}
          <LocationBands />
        </>
      }
    >
      <ol className="lk-scores">
        {scored.map((player, index) => (
          <LocationScoreRow
            key={player.sessionId}
            sessionId={player.sessionId}
            name={player.name}
            km={player.km}
            points={player.points}
            rank={index + 1}
            {...(player.you ? { you: true } : {})}
          />
        ))}
      </ol>

      {/* The leader is the one person on the board who cannot score, and a zero
          with no explanation next to it reads as a bug. */}
      <p className="lk-console-hint">
        <strong>{leader.name}{leader.you ? " (you)" : ""}</strong> was leading, so {leader.you ? "you score" : "they score"} nothing this round.
        {" "}
        {best && best.points > 0
          ? `Closest was ${best.you ? "you" : best.name}, ${locationKmLabel(best.km!)} out.`
          : "Nobody landed close enough to score."}
        {" "}
        {last ? "That was the last round." : "Next round in a moment."}
      </p>
    </LocationStage>
  );
}

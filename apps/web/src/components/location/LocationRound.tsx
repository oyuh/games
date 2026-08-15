import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { FiMapPin, FiSend } from "react-icons/fi";
import { GameButton } from "../shared/GameKit";
import { GameTimer } from "../shared/GameShellHeader";
import { PlayerAvatar } from "../shared/PlayerAvatar";
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

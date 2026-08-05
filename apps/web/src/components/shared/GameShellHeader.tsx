import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FaCrown } from "react-icons/fa";
import { FiCheck, FiCopy, FiEye, FiKey } from "react-icons/fi";
import type { GameSlug } from "@games/shared";
import { GameIcon } from "./GameIcon";
import "../../styles/game-shell.css";

/**
 * The top of every multiplayer game. One header instead of one per game, so
 * the phase, the clock and the room code sit in the same place whichever game
 * you wandered into.
 *
 * Four things live up here and each is drawn as what it is, rather than all
 * four being pills:
 *   - the phase, as a track you can see your way along
 *   - the clock, as a clock, draining
 *   - who you are, as icons in one case
 *   - the code, hidden until asked for
 * Anything else a game wants to say is a pill, via `pills`.
 */

export interface GamePhase {
  /** Matched against the `phase` prop. */
  id: string;
  /** Shown while this is the current phase. */
  label: string;
  /** One line saying what is happening. Worth writing: it is the difference
   *  between knowing the phase's name and knowing what to do. */
  hint?: string;
}

export interface GameShellHeaderProps {
  game: GameSlug;
  title: string;
  /** In play order. The track fills up to whichever one is current. */
  phases: GamePhase[];
  /** Which phase is now. An id not in `phases` just shows itself, unfilled. */
  phase: string;
  round?: { current: number; total?: number };
  /** Epoch ms. No clock without one. */
  endsAt?: number | null;
  /** Seconds the phase started with, so the drain has a scale. Left off, the
   *  clock takes the first reading it sees as full. */
  duration?: number;
  /** Left off, there is no code button at all. */
  code?: string;
  isHost?: boolean;
  isSpectator?: boolean;
  /** Whatever else this game is doing: a category, a word bank, a turn. */
  pills?: ReactNode;
  className?: string;
}

/** The pill every game reaches for, so nobody re-picks the padding. */
export function ShellPill({
  icon,
  tone,
  tooltip,
  children,
}: {
  icon?: ReactNode;
  /** Any css colour. Left off it is the quiet grey one. */
  tone?: string;
  tooltip?: string;
  children: ReactNode;
}) {
  return (
    <span
      className="gsh-pill"
      style={tone ? ({ "--gsh-pill": tone } as CSSProperties) : undefined}
      {...(tooltip ? { "data-tooltip": tooltip, "data-tooltip-variant": "game" } : {})}
    >
      {icon && <span className="gsh-pill-icon">{icon}</span>}
      {children}
    </span>
  );
}

/**
 * The clock, on its own. Not a pill: a pill is for a fact that sits still, and
 * this is the one thing on the header that is always moving.
 */
export function GameTimer({
  endsAt,
  duration,
}: {
  endsAt?: number | null | undefined;
  duration?: number | undefined;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  /* Without a duration the first reading is treated as full, which is right
     as long as the clock mounts with the phase. Re-armed whenever endsAt
     moves, so the next phase drains from its own start and not this one's. */
  const scale = useRef({ key: null as number | null | undefined, secs: 1 });
  const left = endsAt ? Math.max(0, Math.round((endsAt - now) / 1000)) : null;

  if (endsAt !== scale.current.key) {
    scale.current = { key: endsAt, secs: duration ?? Math.max(1, left ?? 1) };
  }

  if (left === null) return null;

  const total = duration ?? scale.current.secs;
  const done = left <= 0;
  const urgent = left <= 10 && !done;

  return (
    <div
      className={`gsh-timer${done ? " is-done" : ""}${urgent ? " is-urgent" : ""}`}
      role="timer"
      aria-label={done ? "Time is up" : `${left} seconds left`}
      data-tooltip={done ? "Time is up" : "Time left in this phase"}
      data-tooltip-variant="game"
    >
      <span className="gsh-timer-value">
        {String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}
      </span>
      <span className="gsh-timer-track" aria-hidden="true">
        <span className="gsh-timer-fill" style={{ transform: `scaleX(${Math.min(1, left / total)})` }} />
      </span>
    </div>
  );
}

/**
 * The room code, behind a click. Mid-game the only reason to want it is to
 * pull a spectator in, so it does not sit on screen being readable by whoever
 * is stood behind you for the whole match. Revealing also copies, because
 * wanting to see it and wanting to send it are the same wish.
 */
function CodeButton({ code }: { code: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!shown) return;
    const id = setTimeout(() => {
      setShown(false);
      setCopied(false);
    }, 10_000);
    return () => clearTimeout(id);
  }, [shown, copied]);

  function reveal() {
    setShown(true);
    setCopied(true);
    void navigator.clipboard?.writeText(code).catch(() => setCopied(false));
  }

  return (
    <button
      type="button"
      className={`gsh-code${shown ? " is-shown" : ""}`}
      onClick={reveal}
      aria-label={shown ? `Room code ${code.split("").join(" ")}, click to copy again` : "Show the room code"}
      data-tooltip={shown ? (copied ? "Copied. Hides again shortly" : "Click to copy") : "Show the code to invite someone"}
      data-tooltip-variant="game"
    >
      <span className="gsh-code-icon">
        {!shown ? <FiKey /> : copied ? <FiCheck /> : <FiCopy />}
      </span>
      <span className="gsh-code-value">{shown ? code : "Invite"}</span>
    </button>
  );
}

export function GameShellHeader({
  game,
  title,
  phases,
  phase,
  round,
  endsAt,
  duration,
  code,
  isHost,
  isSpectator,
  pills,
  className = "",
}: GameShellHeaderProps) {
  const index = phases.findIndex((p) => p.id === phase);
  const current = phases[index];

  return (
    <header className={`gsh ${className}`.trim()}>
      <div className="gsh-top">
        <span className="gsh-game">
          <span className="gsh-game-icon"><GameIcon game={game} size={18} /></span>
          <h1 className="gsh-title">{title}</h1>
        </span>

        <span className="gsh-pills">
          {round && (
            <ShellPill tooltip="Which round you are on">
              Round {round.current}{round.total ? ` / ${round.total}` : ""}
            </ShellPill>
          )}
          {pills}
        </span>

        {(isHost || isSpectator) && (
          <span className="gsh-roles">
            {isSpectator && (
              <span className="gsh-role" role="img" aria-label="You are spectating"
                data-tooltip="You are spectating, so you see everything and play nothing" data-tooltip-variant="game">
                <FiEye aria-hidden="true" />
              </span>
            )}
            {isHost && (
              <span className="gsh-role gsh-role--host" role="img" aria-label="You are the host"
                data-tooltip="You are the host, so the round is yours to start" data-tooltip-variant="game">
                <FaCrown aria-hidden="true" />
              </span>
            )}
          </span>
        )}

        {code && <CodeButton code={code} />}
      </div>

      <div className="gsh-bottom">
        <div className="gsh-phase">
          <ol className="gsh-track">
            {phases.map((p, i) => (
              <li
                key={p.id}
                className={`gsh-tick${i < index ? " is-done" : ""}${i === index ? " is-now" : ""}`}
                {...(i === index ? { "aria-current": "step" as const } : {})}
                data-tooltip={p.label}
                data-tooltip-variant="game"
              />
            ))}
          </ol>

          <p className="gsh-phase-text">
            <span className="gsh-phase-name">{current?.label ?? phase}</span>
            {index >= 0 && <span className="gsh-phase-count">{index + 1} of {phases.length}</span>}
          </p>

          {current?.hint && <p className="gsh-phase-hint">{current.hint}</p>}
        </div>

        <GameTimer endsAt={endsAt} duration={duration} />
      </div>
    </header>
  );
}

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FaCrown } from "react-icons/fa";
import { FiBookOpen, FiCheck, FiChevronUp, FiCopy, FiEye, FiFlag, FiKey } from "react-icons/fi";
import { GAME_META, type GameSlug } from "@games/shared";
import { showToast } from "../../lib/toast";
import { GameIcon } from "./GameIcon";
import "../../styles/game-shell.css";

/**
 * The top of every multiplayer game. One header instead of one per game, so
 * the phase, the clock and the room code sit in the same place whichever game
 * you wandered into.
 *
 * Only the panel gets a container: the phase and the clock, which are what
 * you keep glancing back at. The title, the word bank beside it, the host and
 * spectator marks and the buttons sit straight on the page.
 *
 * The round, your team and your role are marks by the clock: stacked small
 * beside it while the panel is open, one comma separated line once it is
 * folded. Each has its full sentence on hover. Nothing up here is a pill.
 */

/* Storage throws in a few real browsers, private windows among them, and
   nobody should lose a game page over remembering a chevron. */
const COLLAPSED_KEY = (game: GameSlug) => `gsh-collapsed:${game}`;

function readCollapsed(game: GameSlug): boolean | null {
  try {
    const saved = localStorage.getItem(COLLAPSED_KEY(game));
    return saved === null ? null : saved === "1";
  } catch {
    return null;
  }
}

function writeCollapsed(game: GameSlug, value: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY(game), value ? "1" : "0");
  } catch {
    /* Remembering it was never the point of the press. */
  }
}

export interface GamePhase {
  /** Matched against the `phase` prop. */
  id: string;
  /** Shown while this is the current phase. */
  label: string;
  /** One line saying what is happening. Worth writing: it is the difference
   *  between knowing the phase's name and knowing what to do. */
  hint?: string;
  /** Sits beside the name. Belongs in each game's metadata eventually, so a
   *  phase looks the same everywhere it is mentioned. */
  icon?: ReactNode;
}

/** Something about you this round: your role, or your team. */
export interface GameMark {
  icon: ReactNode;
  /** The word beside the icon. Left off, the mark is the icon and its dot. */
  text?: string;
  /** What the folded line says, where there is room. Left off it is `text`. */
  label?: string;
  /** Any css colour, drawn as a dot. Password's team colour. */
  dot?: string;
  /** Any css colour for the word. */
  tone?: string;
  tooltip: string;
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
  /** The word bank, by its label. */
  category?: string | null;
  /** Left off for games where everybody plays the same part. */
  /** Your role, your team. Left off for games where everybody plays the same part. */
  marks?: GameMark[];
  /** Overrides the game's own accent from its metadata. Rarely wanted. */
  accent?: string;
  /** Adds the button that folds the phase panel away. Folded, the container
   *  goes with it and only the marks and the clock are left. */
  collapsible?: boolean;
  /** Start folded, for anyone who would rather have the room back. */
  defaultCollapsed?: boolean;
  /** Given, the header's clock grows a button on hover that moves it. For
   *  games that can also show the time next to what is being timed. */
  timerMove?: { label: string; icon: ReactNode; onClick: () => void };
  className?: string;
}

/**
 * The clock, on its own. Not a fact: a fact sits still, and this is the one
 * thing on the header that is always moving.
 */
export function GameTimer({
  endsAt,
  duration,
  move,
}: {
  endsAt?: number | null | undefined;
  duration?: number | undefined;
  /** Given, the clock grows a small button on hover that sends it somewhere
   *  else. Games that keep a second clock nearer the thing you are timing use
   *  it to let people choose which one they want. */
  move?: { label: string; icon: ReactNode; onClick: () => void } | undefined;
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

  /* How much of the phase has gone, not how much is left. The line fills
     toward the end of the phase rather than retreating from it, which is the
     direction people read a progress bar in. */
  const progress = Math.min(1, Math.max(0, 1 - left / Math.max(1, total)));

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
      {/* The progress rides on a var so the fill and the little head that
          marks its leading edge can both read it and stay together. */}
      <span
        className="gsh-timer-track"
        aria-hidden="true"
        style={{ "--gsh-progress": progress } as CSSProperties}
      >
        <span className="gsh-timer-fill" />
      </span>

      {move && (
        <button
          type="button"
          className="gsh-timer-move"
          onClick={move.onClick}
          aria-label={move.label}
          data-tooltip={move.label}
          data-tooltip-variant="game"
        >
          {move.icon}
        </button>
      )}
    </div>
  );
}


/* About three times a normal toast, long enough to read six letters out loud. */
const CODE_TOAST_MS = 15_000;

/**
 * The room code, behind a click. Mid-game the only reason to want it is to
 * pull a spectator in, so it does not sit on screen being readable by whoever
 * is stood behind you for the whole match. Revealing also copies, because
 * wanting to see it and wanting to send it are the same wish, and raises a
 * toast with the code large enough to read out, which copies again on a click.
 */
function CodeButton({ code, compact }: { code: string; compact?: boolean }) {
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
    showToast("Here's the room code", "info", { category: "Room code", duration: CODE_TOAST_MS, copy: code });
    if (!navigator.clipboard) return;
    setCopied(true);
    navigator.clipboard.writeText(code).catch(() => setCopied(false));
  }

  return (
    <button
      type="button"
      className={`gsh-code${shown ? " is-shown" : ""}${compact ? " gsh-code--compact" : ""}`}
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
  category,
  marks = [],
  accent,
  collapsible,
  defaultCollapsed,
  timerMove,
  className = "",
}: GameShellHeaderProps) {
  /* Folding the panel is a preference, not a phase, so it outlives the visit.
     Kept per game rather than globally: whether you want Imposter's phase
     panel says nothing about whether you want Location Signal's, and it is
     not per lobby either, or you would be re-folding it every time somebody
     started a new room. */
  const [collapsed, setCollapsed] = useState(() => {
    if (!collapsible) return !!defaultCollapsed;
    const saved = readCollapsed(game);
    return saved ?? !!defaultCollapsed;
  });

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      writeCollapsed(game, !v);
      return !v;
    });
  };

  const index = phases.findIndex((p) => p.id === phase);
  const current = phases[index];

  /* Each game already carries an accent in its metadata, so the header wears
     it without every caller having to hand it over. */
  const tone = accent ?? GAME_META[game]?.accent;

  const folded = !!collapsible && collapsed;

  /* In the lobby the code is the point of the screen, so it sits there
     readable. Once play starts the only reason to want it is to pull a
     spectator in, so it shrinks to its key and opens on a click. The lobby is
     taken to be the phase a game opens on. */
  const inLobby = index === 0;

  /* The round is a mark like the rest, just one the header can work out on
     its own: the number alone while it is stacked, the sentence once folded. */
  const allMarks: GameMark[] = [];
  if (round) {
    const short = round.total ? `Round ${round.current}/${round.total}` : `Round ${round.current}`;
    const whole = round.total ? `Round ${round.current} of ${round.total}` : short;
    allMarks.push({ icon: <FiFlag />, text: String(round.current), label: short, tooltip: whole });
  }
  allMarks.push(...marks);

  return (
    <header
      className={`gsh${folded ? " gsh--folded" : ""} ${className}`.trim()}
      style={tone ? ({ "--gsh-accent": tone } as CSSProperties) : undefined}
    >
      <div className="gsh-top">
        <span className="gsh-game">
          <span className="gsh-game-icon"><GameIcon game={game} size={20} /></span>
          <h1 className="gsh-title">{title}</h1>
          {category && (
            <span className="gsh-bank" data-tooltip="The word bank" data-tooltip-variant="game">
              <FiBookOpen aria-hidden="true" />
              <span className="gsh-bank-name">{category}</span>
            </span>
          )}
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

        {(code || collapsible) && (
          <span className="gsh-actions">
            {code && <CodeButton code={code} compact={!inLobby} />}

            {collapsible && (
              <button
                type="button"
                className="gsh-fold"
                onClick={toggleCollapsed}
                aria-expanded={!collapsed}
                aria-label={`${collapsed ? "Show" : "Hide"} the phase panel`}
                /* Folded, the phase name is the thing you gave up, so the
                   button that gives it back is where it goes. */
                data-tooltip={collapsed ? `Show the panel. ${current?.label ?? phase}` : "Hide the panel, keep the clock"}
                data-tooltip-variant="game"
              >
                <FiChevronUp aria-hidden="true" />
              </button>
            )}
          </span>
        )}
      </div>

      <div className="gsh-bottom">
        {/* Kept mounted and collapsed rather than removed, so folding has
            something to animate. Hidden from screen readers once it is shut,
            since it is still in the tree at nothing high. */}
        <div className="gsh-phase-wrap" {...(folded ? { inert: true, "aria-hidden": true } : {})}>
          <div className="gsh-phase">
            <p className="gsh-phase-text">
              {current?.icon && <span className="gsh-phase-icon" aria-hidden="true">{current.icon}</span>}
              <span className="gsh-phase-name">{current?.label ?? phase}</span>
            </p>

            {current?.hint && <p className="gsh-phase-hint">{current.hint}</p>}
          </div>
        </div>

        {allMarks.length > 0 && (
          <span className="gsh-marks">
            {allMarks.map((mark) => (
              <span
                key={mark.tooltip}
                className="gsh-mark"
                role="img"
                aria-label={mark.tooltip}
                data-tooltip={mark.tooltip}
                data-tooltip-variant="game"
                style={mark.tone ? ({ "--gsh-mark": mark.tone } as CSSProperties) : undefined}
              >
                <span className="gsh-mark-icon" aria-hidden="true">{mark.icon}</span>
                {mark.dot && <span className="gsh-mark-dot" style={{ background: mark.dot }} />}
                {mark.text && <span className="gsh-mark-text">{mark.text}</span>}
                {(mark.label ?? mark.text) && <span className="gsh-mark-label">{mark.label ?? mark.text}</span>}
              </span>
            ))}
          </span>
        )}

        <GameTimer endsAt={endsAt} duration={duration} move={timerMove} />
      </div>
    </header>
  );
}

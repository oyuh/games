import type { CSSProperties, ReactNode } from "react";

/**
 * The strip of numbers above a solo board: which puzzle you are on, how it is
 * going, and the clock. Built from the same surfaces as the solo menu, so a
 * run looks like the screen you started it from.
 */

/** mm:ss.cc. One format for every clock in the solo games. */
export function formatTime(ms: number): string {
  const safeMs = Math.max(0, ms);
  const minutes = Math.floor(safeMs / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  const centis = Math.floor((safeMs % 1000) / 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

export function GameStatBar({ children }: { children: ReactNode }) {
  return <div className="game-stat-bar">{children}</div>;
}

export function GameStat({
  icon,
  value,
  hint,
  accent,
  tooltip,
  onClick,
}: {
  icon?: ReactNode;
  value: ReactNode;
  /** The quiet half: a difficulty, a unit, whatever the number is counting. */
  hint?: ReactNode | undefined;
  /** Colours the icon and the number. Defaults to plain foreground. */
  accent?: string | undefined;
  tooltip?: string | undefined;
  onClick?: (() => void) | undefined;
}) {
  const style = accent ? ({ "--stat-accent": accent } as CSSProperties) : undefined;
  const inner = (
    <>
      {icon && <span className="game-stat-icon">{icon}</span>}
      <span className="game-stat-value">{value}</span>
      {hint && <span className="game-stat-hint">{hint}</span>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className="game-stat game-stat--action"
        style={style}
        data-tooltip={tooltip}
        data-tooltip-variant="info"
        onClick={onClick}
      >
        {inner}
      </button>
    );
  }

  return (
    <div className="game-stat" style={style} data-tooltip={tooltip} data-tooltip-variant="info">
      {inner}
    </div>
  );
}

/**
 * A stopwatch. The minutes and seconds are the number you read; the
 * hundredths are along for the ride, so they sit smaller and dimmer. The dot
 * only pulses while the clock is actually running, which is the whole reason
 * it is there.
 */
export function GameTimer({
  ms,
  running = false,
  accent,
  tooltip = "Elapsed time",
}: {
  ms: number;
  running?: boolean;
  accent?: string;
  tooltip?: string;
}) {
  const [clock, centis] = formatTime(ms).split(".");

  return (
    <div
      className="game-stat game-timer"
      style={accent ? ({ "--stat-accent": accent } as CSSProperties) : undefined}
      data-running={running || undefined}
      data-tooltip={tooltip}
      data-tooltip-variant="info"
      role="timer"
    >
      <span className="game-timer-dot" aria-hidden="true" />
      <span className="game-timer-clock">{clock}</span>
      <span className="game-timer-centis">.{centis}</span>
    </div>
  );
}

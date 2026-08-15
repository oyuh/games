import type { CSSProperties, ReactNode } from "react";
import { FiClock } from "react-icons/fi";

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
  className,
}: {
  icon?: ReactNode;
  value: ReactNode;
  /** The quiet half: a difficulty, a unit, whatever the number is counting. */
  hint?: ReactNode | undefined;
  /** Colours the icon and the number. Defaults to plain foreground. */
  accent?: string | undefined;
  tooltip?: string | undefined;
  onClick?: (() => void) | undefined;
  className?: string | undefined;
}) {
  const style = accent ? ({ "--stat-accent": accent } as CSSProperties) : undefined;
  const classes = `game-stat${className ? ` ${className}` : ""}`;
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
        className={`${classes} game-stat--action`}
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
    <div className={classes} style={style} data-tooltip={tooltip} data-tooltip-variant="info">
      {inner}
    </div>
  );
}

/**
 * The stopwatch is a stat like any other: clock icon, the number you read,
 * and the hundredths in the quiet slot. Same parts as the rest of the strip
 * so the digits line up with the text either side of them.
 */
export function GameTimer({
  ms,
  accent,
  tooltip = "Elapsed time",
}: {
  ms: number;
  accent?: string | undefined;
  tooltip?: string | undefined;
}) {
  const [clock, centis] = formatTime(ms).split(".");

  return (
    <GameStat
      className="game-timer"
      icon={<FiClock size={13} />}
      value={clock}
      hint={`.${centis}`}
      accent={accent}
      tooltip={tooltip}
    />
  );
}

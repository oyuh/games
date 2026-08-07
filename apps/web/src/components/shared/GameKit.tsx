import type { ButtonHTMLAttributes, ReactNode } from "react";
import "../../styles/game-kit.css";

/**
 * The bits every multiplayer game needs and none of them should own.
 *
 * Games are mostly their own thing, so this is deliberately short: a button, a
 * panel to put things in, and something to show when there is nothing to show.
 * Anything only one game wants belongs in that game.
 *
 * The look comes from the same three rules the player cards and the shell
 * header follow: depth is borders and fills, never a shadow or a glow; colour
 * means something rather than decorating; and one accent per surface, taken
 * from --game-accent so a game sets it once and everything below agrees.
 */

/* ── Button ─────────────────────────────────────────────────── */

export type GameButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type GameButtonSize = "sm" | "md" | "lg";

export interface GameButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  /** primary carries the accent, secondary is the ordinary one, ghost has no
   *  edge at all, danger is for the thing you cannot take back. */
  variant?: GameButtonVariant;
  size?: GameButtonSize;
  /** Sits before the label. */
  icon?: ReactNode;
  /** Sits after it, for a count or a chevron. */
  trailing?: ReactNode;
  /** Spins in place of the icon and blocks the press. The label stays, so the
   *  button keeps its width and the row does not jump while you wait. */
  loading?: boolean;
  /** Takes the width it is given. */
  full?: boolean;
  className?: string;
}

export function GameButton({
  variant = "secondary",
  size = "md",
  icon,
  trailing,
  loading,
  full,
  disabled,
  children,
  className = "",
  ...rest
}: GameButtonProps) {
  const classes = [
    "gk-btn",
    `gk-btn--${variant}`,
    `gk-btn--${size}`,
    full ? "gk-btn--full" : "",
    loading ? "is-loading" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      className={classes}
      disabled={disabled || loading}
      {...(loading ? { "aria-busy": true } : {})}
      {...rest}
    >
      {loading ? <span className="gk-spinner" aria-hidden="true" /> : icon && <span className="gk-btn-icon">{icon}</span>}
      <span className="gk-btn-label">{children}</span>
      {trailing && !loading && <span className="gk-btn-icon">{trailing}</span>}
    </button>
  );
}

/* ── Panel ──────────────────────────────────────────────────── */

export interface GamePanelProps {
  /** Left of the header. Without one there is no header row at all. */
  title?: ReactNode;
  /** Right of the header: a count, a button, a toggle. */
  action?: ReactNode;
  /** Runs along the bottom behind a hairline, like the card's badge strip. */
  footer?: ReactNode;
  /** Drops the body padding, for a panel holding its own rows or a board. */
  flush?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * A bordered section. The shell header's bottom half and the solo end screen's
 * stat blocks are both this shape, so games stop drawing their own.
 */
export function GamePanel({ title, action, footer, flush, children, className = "" }: GamePanelProps) {
  return (
    <section className={`gk-panel ${className}`.trim()}>
      {(title || action) && (
        <header className="gk-panel-head">
          {title && <h3 className="gk-panel-title">{title}</h3>}
          {action && <span className="gk-panel-action">{action}</span>}
        </header>
      )}

      <div className={`gk-panel-body${flush ? " gk-panel-body--flush" : ""}`}>{children}</div>

      {footer && <footer className="gk-panel-foot">{footer}</footer>}
    </section>
  );
}

/* ── Empty ──────────────────────────────────────────────────── */

export interface GameEmptyProps {
  icon?: ReactNode;
  /** One short line. Name the space rather than apologising for it. */
  title: ReactNode;
  /** One more line saying what would fill it. */
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** What a lobby, a vote list or a results table shows before it has anything. */
export function GameEmpty({ icon, title, hint, action, className = "" }: GameEmptyProps) {
  return (
    <div className={`gk-empty ${className}`.trim()}>
      {icon && <span className="gk-empty-icon" aria-hidden="true">{icon}</span>}
      <p className="gk-empty-title">{title}</p>
      {hint && <p className="gk-empty-hint">{hint}</p>}
      {action && <div className="gk-empty-action">{action}</div>}
    </div>
  );
}

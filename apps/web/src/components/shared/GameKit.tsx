import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
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

/* ── Facts ──────────────────────────────────────────────────── */

export interface GameFact {
  value: ReactNode;
  /** Reads straight after the value, so write it that way: "5 rounds". Left
   *  off for a value that already says what it is, like a word bank's name. */
  label?: string;
  icon?: ReactNode;
  /** Any css colour, for the one fact worth picking out of the row. */
  tone?: string;
  /** Worth writing. Half of these settings need a sentence to mean anything. */
  tooltip?: string;
}

/**
 * What a game was set up with, read only: rounds, timers, word bank, whatever
 * the host picked before anyone joined.
 *
 * Pills, like every other small fact on the site. They are quiet by default
 * because five of them in a row all shouting is five of them saying nothing;
 * `tone` is there for the one that is actually worth a colour.
 */
export function GameFacts({ label, facts, className = "" }: { label?: ReactNode; facts: GameFact[]; className?: string }) {
  return (
    <div className={`gk-facts-block ${className}`.trim()}>
      {label && <span className="gk-roster-label">{label}</span>}

      <div className="gk-facts">
        {facts.map((fact, i) => (
          <span
            key={i}
            className="gk-fact"
            style={fact.tone ? ({ "--gk-fact-tone": fact.tone } as CSSProperties) : undefined}
            {...(fact.tooltip ? { "data-tooltip": fact.tooltip, "data-tooltip-variant": "game" } : {})}
          >
            {fact.icon && <span className="gk-fact-icon" aria-hidden="true">{fact.icon}</span>}
            <span className="gk-fact-value">{fact.value}</span>
            {fact.label && <span className="gk-fact-label">{fact.label}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Actions ────────────────────────────────────────────────── */

/**
 * The row a phase ends on. The hint goes above rather than beside, because the
 * reason a button is disabled should not be competing with the button.
 */
export function GameActions({ hint, children, className = "" }: { hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`gk-actions ${className}`.trim()}>
      {hint && <p className="gk-actions-hint">{hint}</p>}
      <div className="gk-actions-row">{children}</div>
    </div>
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

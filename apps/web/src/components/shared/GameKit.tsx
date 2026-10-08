import { useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { FiEdit2, FiLogOut, FiTrash2 } from "react-icons/fi";
import { Button, Loader } from "./Button";
import { Combobox, type ComboboxProps } from "./Combobox";
import { Switch } from "./Switch";
import { formatDuration } from "../../lib/setting-options";
import { showDedupedToast } from "../../lib/toast";
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

/* ── Two presses ────────────────────────────────────────────── */

/**
 * For the small buttons that cannot be taken back: throwing somebody out of a
 * lobby, throwing the word away. The first press arms it and the button says
 * so; it disarms itself a few seconds later, so a misclick costs nothing and
 * nobody is left holding a live button they have forgotten about.
 *
 * `armed` is what to draw, `press` is what to do on click: it returns true
 * once the thing has actually been confirmed.
 */
export function useArmed(timeout = 3000) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), timeout);
    return () => clearTimeout(id);
  }, [armed, timeout]);

  return {
    armed,
    /** True when this press was the confirming one. */
    press: () => {
      if (armed) {
        setArmed(false);
        return true;
      }
      setArmed(true);
      return false;
    },
    disarm: () => setArmed(false),
  };
}

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
  ...rest
}: GameButtonProps) {
  // Drawn by the shared Button now, to try its look on the real game pages.
  // danger goes to danger-secondary: it sits beside a primary on every game
  // over screen, and a solid red there would outshout "Run it back".
  return (
    <Button
      variant={variant === "danger" ? "danger-secondary" : variant}
      size={size}
      {...rest}
    />
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
  /** Hands the host a picker for it: the cell turns into the button that
   *  opens one. Left off for anything the lobby cannot change. */
  edit?: GameFactEdit;
  /** The setting's name, like "Rounds". A named fact whose value changes
   *  while the strip is up gets a toast, so a host's change reaches the
   *  whole room. Every client diffs the game row Zero syncs to it. */
  name?: string;
}

/** Just the value, since the fact's label repeats the name: "Rounds to 5". */
function factText(fact: GameFact): string | null {
  return typeof fact.value === "string" || typeof fact.value === "number" ? String(fact.value) : null;
}

function useFactChangeToasts(facts: GameFact[]) {
  const previous = useRef<Map<string, string> | null>(null);
  const snapshot = JSON.stringify(facts.map((fact) => [fact.name, factText(fact)]));

  useEffect(() => {
    const next = new Map<string, string>();
    for (const fact of facts) {
      const text = factText(fact);
      if (fact.name && text !== null) next.set(fact.name, text);
    }
    const before = previous.current;
    previous.current = next;
    // The first render is the setup as it stands, not a change to it.
    if (!before) return;

    const changed = [...next].filter(([name, text]) => before.has(name) && before.get(name) !== text);
    if (changed.length === 0) return;
    // A fact with a picker means this client is the host, who made the change.
    const byYou = facts.some((fact) => fact.edit);
    const parts = changed.map(([name, text]) => `${name} to ${text}`).join(", ");
    showDedupedToast(byYou ? `You set ${parts}` : `Host set ${parts}`, "info");
    // Keyed on the snapshot so a re-render with the same values stays quiet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);
}

/** What the picker needs. The cell itself is the trigger, so none of the
 *  trigger props are here, and the fact's icon and tone carry over. */
export type GameFactEdit = Omit<
  ComboboxProps,
  "children" | "triggerClassName" | "triggerStyle" | "triggerAttrs" | "icon" | "tone"
>;

/**
 * What a game was set up with, read only: rounds, timers, word bank, whatever
 * the host picked before anyone joined.
 *
 * One flat strip of cells split by hairlines. They are quiet by default
 * because five of them in a row all shouting is five of them saying nothing;
 * `tone` colors the icon of the one that is actually worth a colour.
 *
 * A fact with `edit` is a button instead, marked with a pencil, that opens a
 * picker for the setting. Only the host gets those, and only in the lobby.
 */
export function GameFacts({
  label,
  facts,
  footer,
  className = "",
}: {
  label?: ReactNode;
  facts: GameFact[];
  /** Docks under the strip as one block, for the lobby's action bar. */
  footer?: ReactNode;
  className?: string;
}) {
  useFactChangeToasts(facts);
  return (
    <div className={`gk-facts-block ${className}`.trim()}>
      {label && <span className="gk-roster-label">{label}</span>}

      <div className="gk-facts">
        {facts.map((fact, i) => {
          const style = fact.tone ? ({ "--gk-fact-tone": fact.tone } as CSSProperties) : undefined;
          const tooltip = fact.tooltip ? { "data-tooltip": fact.tooltip, "data-tooltip-variant": "game" } : {};
          const body = (
            <>
              {fact.icon && <span className="gk-fact-icon" aria-hidden="true">{fact.icon}</span>}
              <span className="gk-fact-value">{fact.value}</span>
              {fact.label && <span className="gk-fact-label">{fact.label}</span>}
            </>
          );

          if (!fact.edit) {
            return <span key={i} className="gk-fact" style={style} {...tooltip}>{body}</span>;
          }

          return (
            <Combobox
              key={i}
              {...fact.edit}
              {...(fact.icon ? { icon: fact.icon } : {})}
              {...(fact.tone ? { tone: fact.tone } : {})}
              triggerClassName="gk-fact gk-fact--editable"
              {...(style ? { triggerStyle: style } : {})}
              triggerAttrs={tooltip}
            >
              {body}
              <span className="gk-fact-edit" aria-hidden="true"><FiEdit2 /></span>
            </Combobox>
          );
        })}
      </div>

      {footer}
    </div>
  );
}

/* ── Actions ────────────────────────────────────────────────── */

/**
 * The bar a phase ends on. The left says what is going on, the controls hold
 * the right, and the button you are meant to press goes last so it always
 * lands in the same corner. On a phone the left takes its own line above.
 */
export function GameActions({
  status,
  hint,
  children,
  className = "",
}: {
  /** Something you are waiting on, like the host. Gets the level meter. */
  status?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`gk-actions ${className}`.trim()}>
      {(status || hint) && (
        <div className="gk-actions-info">
          {status && (
            <p className="gk-actions-status">
              <Loader />
              <span>{status}</span>
            </p>
          )}
          {hint && <p className="gk-actions-hint">{hint}</p>}
        </div>
      )}
      <div className="gk-actions-row">{children}</div>
    </div>
  );
}

/**
 * Leaving a lobby gives your seat away, and it sits right beside Start, so it
 * takes two presses like the kick does. The host leaving ends the game for
 * everyone (every game's leave mutator does that), so for them it says so.
 */
export function LeaveButton({ onLeave, host = false }: { onLeave: () => void; host?: boolean }) {
  const { armed, press, disarm } = useArmed();
  const label = host ? "End game" : "Leave";

  return (
    <GameButton
      variant={armed ? "danger" : "secondary"}
      icon={host ? <FiTrash2 /> : <FiLogOut />}
      onClick={() => { if (press()) onLeave(); }}
      onBlur={disarm}
      {...(armed
        ? { "data-tooltip": host ? "Press again to end it for everyone" : "Press again to leave", "data-tooltip-variant": "danger" }
        : {})}
    >
      {armed ? `${label}?` : label}
    </GameButton>
  );
}

/** How long it has been on screen, ticking, or since `since` when given (a
 *  room's created_at, say). Client side only, so without `since` a reload
 *  starts it over. Its own component so only it renders every second. */
export function Elapsed({ since }: { since?: number }) {
  const [start] = useState(() => since ?? Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  const text = seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m` : formatDuration(seconds);
  return <span className="gk-elapsed">{text}</span>;
}

/**
 * An on or off setting that lives in the action bar, like a lobby being public.
 * A switch rather than a button, so the state is on show instead of being
 * worked out from what the button offers to do. The switch stands on end so
 * the name and its state can sit beside it at a readable size, and the whole
 * label presses it.
 */
export function GameToggle({
  label,
  detail,
  checked,
  onChange,
  disabled,
  tooltip,
}: {
  label: string;
  /** The state in words, under the name: "Public", "Locked". */
  detail?: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean | undefined;
  tooltip?: string;
}) {
  return (
    <label
      className="gk-toggle"
      {...(tooltip ? { "data-tooltip": tooltip, "data-tooltip-variant": "info" } : {})}
    >
      <Switch label={label} checked={checked} onChange={onChange} disabled={disabled} orientation="vertical" />
      <span className="gk-toggle-text">
        <span className="gk-toggle-label">{label}</span>
        {detail && <span className="gk-toggle-detail">{detail}</span>}
      </span>
    </label>
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

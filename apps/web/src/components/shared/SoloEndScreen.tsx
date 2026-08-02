import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FiAlertTriangle, FiCheckCircle, FiCopy, FiInfo, FiLoader } from "react-icons/fi";
import { Segmented, type SoloSetupOption } from "./SoloGameMenu";

/** One number in the stat row across the top. */
export interface SoloEndStat {
  label: string;
  value: string;
  /** Small trailing note, e.g. "unranked". Stays out of the big number. */
  note?: string;
  accent?: string;
  /** Turns the tile into a copy button, used for the seed. */
  onCopy?: () => void;
}

export interface SoloEndSplit {
  label: string;
  value: string;
}

/**
 * A leaderboard row. `rank` is the real standing, not the array index, because
 * the standings view is deliberately full of holes: top 3, you and your
 * neighbours, bottom 3. The gaps get drawn from the jumps between ranks.
 */
export interface SoloEndScore {
  id: string;
  rank: number;
  name: string;
  isOwn?: boolean;
  seed?: number;
  /** One string per column, in the same order as `board.columns`. */
  cells: string[];
}

export interface SoloEndBoard {
  columns: string[];
  rows: SoloEndScore[];
  loading?: boolean;
  /** Shown in place of the rows when there are none. */
  empty: string;
  total?: number;
  /** The filter row. Views are the caller's business, this only renders them. */
  view: string;
  views: SoloSetupOption[];
  onViewChange: (view: string) => void;
}

export interface SoloEndAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  /** Arms on the first press and only fires on the second, so a stray click
   *  on the way past does not throw away a result you have not submitted. */
  confirm?: boolean;
}

export interface SoloEndStatus {
  tone: "info" | "success" | "error";
  /** Still waiting on the server. Spins the icon and holds the message. */
  pending?: boolean;
  /** Two or three words: "Submitted", "Not submitted", "Verifying". */
  title: string;
  message: string;
  /** Short chips under the message: where you placed, your time, the seed. */
  facts?: string[];
}

const STATUS_ICONS = {
  info: <FiInfo size={18} />,
  success: <FiCheckCircle size={18} />,
  error: <FiAlertTriangle size={18} />,
} as const;

/** How long an armed confirm stays armed, matching the sidebar's give-up. */
const CONFIRM_MS = 3000;

/**
 * The two or three words above the status message. Both games run the same
 * submission flow, so they name its states the same way.
 */
export function soloStatusTitle(state: {
  tone: "info" | "success" | "error";
  pending?: boolean;
  submitting?: boolean;
  submitted?: boolean;
  canSubmit?: boolean;
}): string {
  if (state.submitting) return "Submitting";
  if (state.pending) return "Verifying";
  // A submitted run with an info tone is one the server already had.
  if (state.submitted) return state.tone === "success" ? "Submitted" : "Already counted";
  if (state.tone === "error") return "Not submitted";
  if (state.canSubmit) return "Ready to submit";
  return "Unranked";
}

/**
 * The end-of-run screen for the solo games, built from the same pieces as
 * SoloGameMenu: centred hero, bordered controls with a drawer hanging off
 * them, one primary button, plain text links. No shadows, no glows.
 */
export function SoloEndScreen({
  title,
  subtitle,
  tone,
  stats,
  splits,
  board,
  status,
  primary,
  links,
}: {
  title: string;
  subtitle: string;
  tone: "success" | "ended";
  stats: SoloEndStat[];
  /** Per-puzzle times, in the drawer under the stat row. Empty hides it. */
  splits: SoloEndSplit[];
  /** Left off for runs that never touch a leaderboard, like a one-off challenge. */
  board?: SoloEndBoard;
  status?: SoloEndStatus;
  primary: SoloEndAction;
  links: SoloEndAction[];
}) {
  const seedColumn = board?.rows.some((row) => row.seed != null) ?? false;
  // In a table of nothing but your own runs, marking each one "you" is noise.
  const allOwn = (board?.rows.length ?? 0) > 0 && board!.rows.every((row) => row.isOwn);

  // Centre your own run in the table rather than making you find it. Keyed on
  // the row id so a scroll you did yourself is not undone on every render.
  const selfRow = useRef<HTMLDivElement>(null);
  const selfId = board?.rows.find((row) => row.isOwn)?.id;
  useEffect(() => {
    const row = selfRow.current;
    const scroller = row?.closest<HTMLElement>(".solo-end-table-scroll");
    if (!row || !scroller) return;
    scroller.scrollTop = row.offsetTop - (scroller.clientHeight - row.offsetHeight) / 2;
  }, [selfId]);

  // Which link is armed for its second press, by label. Disarms itself so an
  // armed button never sits there waiting to catch a later, unrelated click.
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(null), CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [armed]);

  const runAction = (action: SoloEndAction) => {
    if (!action.confirm || armed === action.label) {
      setArmed(null);
      action.onClick();
      return;
    }
    setArmed(action.label);
  };

  return (
    <main className="solo-end" data-tone={tone}>
      <header className="solo-menu-hero">
        <h1 className="solo-menu-title solo-end-title">{title}</h1>
        <p className="solo-menu-sub">{subtitle}</p>
      </header>

      <section className="solo-end-summary">
        <div
          className="solo-end-stats"
          data-attached={splits.length > 0 ? "" : undefined}
          style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
        >
          {stats.map((stat) => (
            <div
              className="solo-end-stat"
              key={stat.label}
              style={{ "--stat-accent": stat.accent ?? "var(--primary)" } as CSSProperties}
            >
              <span className="solo-end-stat-label">{stat.label}</span>
              <span className="solo-end-stat-value">
                {stat.value}
                {stat.note && <em className="solo-end-stat-note">{stat.note}</em>}
              </span>
              {stat.onCopy && (
                <button
                  className="solo-end-stat-copy"
                  type="button"
                  onClick={stat.onCopy}
                  aria-label={`Copy ${stat.label.toLowerCase()}`}
                  data-tooltip={`Copy ${stat.label.toLowerCase()}`}
                  data-tooltip-pos="top"
                >
                  <FiCopy size={11} />
                </button>
              )}
            </div>
          ))}
        </div>

        {splits.length > 0 && (
          <div className="solo-drawer solo-end-splits">
            {splits.map((split) => (
              <span className="solo-end-split" key={split.label}>
                <span className="solo-end-split-label">{split.label}</span>
                <strong>{split.value}</strong>
              </span>
            ))}
          </div>
        )}
      </section>

      {board && (
      <section className="solo-end-board" aria-label="Standings">
        <Segmented
          row={{
            label: "Standings filter",
            value: board.view,
            options: board.views,
            onChange: board.onViewChange,
          }}
          attached
        />

        <div className="solo-drawer solo-end-table" data-loading={board.loading ? "" : undefined}>
          <div className="solo-end-table-scroll">
            <div
              className="solo-end-table-grid"
              style={{ "--metric-cols": board.columns.length } as CSSProperties}
            >
              <div className="solo-end-row solo-end-row--head" role="row">
                <span className="solo-end-cell solo-end-cell--rank">#</span>
                <span className="solo-end-cell solo-end-cell--name">Player</span>
                {board.columns.map((column) => (
                  <span className="solo-end-cell solo-end-cell--metric" key={column}>{column}</span>
                ))}
                {seedColumn && <span className="solo-end-cell solo-end-cell--seed">Seed</span>}
              </div>

              {board.rows.length === 0 ? (
                <p className="solo-end-empty">{board.loading ? "Loading standings" : board.empty}</p>
              ) : (
                board.rows.map((row, index) => {
                  const previous = board.rows[index - 1];
                  const skipped = previous ? row.rank - previous.rank - 1 : 0;
                  return (
                    <Fragment key={row.id}>
                      {skipped > 0 && (
                        <p className="solo-end-gap">
                          {skipped} more {skipped === 1 ? "run" : "runs"}
                        </p>
                      )}
                      <div
                        className="solo-end-row"
                        ref={row.isOwn ? selfRow : undefined}
                        data-self={row.isOwn && !allOwn ? "" : undefined}
                        data-medal={row.rank <= 3 ? row.rank : undefined}
                      >
                        <span className="solo-end-cell solo-end-cell--rank">{row.rank}</span>
                        <span className="solo-end-cell solo-end-cell--name">
                          <span className="solo-end-name">{row.name}</span>
                          {row.isOwn && !allOwn && <span className="solo-end-you">You</span>}
                        </span>
                        {row.cells.map((cell, cellIndex) => (
                          <span className="solo-end-cell solo-end-cell--metric" key={board.columns[cellIndex] ?? cellIndex}>
                            {cell}
                          </span>
                        ))}
                        {seedColumn && (
                          <span className="solo-end-cell solo-end-cell--seed">
                            {row.seed != null ? row.seed : "-"}
                          </span>
                        )}
                      </div>
                    </Fragment>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </section>
      )}

      {status && (
        <section
          className={`solo-end-status solo-end-status--${status.tone}`}
          data-pending={status.pending ? "" : undefined}
          role="status"
        >
          <span className="solo-end-status-icon" aria-hidden="true">
            {status.pending ? <FiLoader size={18} /> : STATUS_ICONS[status.tone]}
          </span>
          <div className="solo-end-status-body">
            <p className="solo-end-status-title">{status.title}</p>
            <p className="solo-end-status-message">{status.message}</p>
            {status.facts && status.facts.length > 0 && (
              <p className="solo-end-status-facts">
                {status.facts.map((fact) => (
                  <span className="solo-end-fact" key={fact}>{fact}</span>
                ))}
              </p>
            )}
          </div>
        </section>
      )}

      <button
        className="solo-start solo-end-start"
        type="button"
        onClick={() => runAction(primary)}
        disabled={primary.disabled}
        data-tooltip={primary.title}
      >
        <span className="solo-start-label">{armed === primary.label ? "Press again to confirm" : primary.label}</span>
        {primary.icon}
      </button>

      <nav className="solo-menu-links">
        {links.map((link) => (
          <button
            className="solo-menu-link"
            type="button"
            key={link.label}
            data-armed={armed === link.label ? "" : undefined}
            onClick={() => runAction(link)}
            onBlur={() => setArmed((current) => (current === link.label ? null : current))}
            disabled={link.disabled}
            data-tooltip={armed === link.label ? "Press again to confirm" : link.title}
          >
            {link.icon} {armed === link.label ? "Press again" : link.label}
          </button>
        ))}
      </nav>
    </main>
  );
}

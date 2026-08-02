import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { FiClock } from "react-icons/fi";
import { Segmented, type SoloSetupOption } from "./SoloGameMenu";
import { SoloScoreTable, type SoloScoreRow } from "./SoloScoreTable";

/** One number in the stat row across the top. */
export interface SoloEndStat {
  label: string;
  value: string;
  /** Small trailing note, e.g. "unranked". Stays out of the big number. */
  note?: string;
  accent?: string;
  /** Turns the whole tile into a copy button, used for the seed. */
  onCopy?: () => void;
}

export interface SoloEndSplit {
  label: string;
  value: string;
}

export type SoloEndScore = SoloScoreRow;

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
  /** Still waiting on the server. Pulses the title and holds the message. */
  pending?: boolean;
  /** Two or three words: "Submitted", "Not submitted", "Verifying". */
  title: string;
  message: string;
  /** Short chips under the message: where you placed, your time, the seed. */
  facts?: string[];
}

/** How long an armed confirm stays armed, matching the sidebar's give-up. */
const CONFIRM_MS = 3000;

/** The run's own puzzle times, as one more view of the standings table. */
export const SPLITS_VIEW = "splits";

const SPLITS_OPTION: SoloSetupOption = {
  value: SPLITS_VIEW,
  label: "Times",
  icon: <FiClock size={15} />,
  weight: 15,
  title: "How long each puzzle in this run took",
};

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
  /** Per-puzzle times, shown as their own view of the table. Empty hides it. */
  splits: SoloEndSplit[];
  /** Left off for runs that never touch a leaderboard, like a one-off challenge. */
  board?: SoloEndBoard;
  status?: SoloEndStatus;
  primary: SoloEndAction;
  links: SoloEndAction[];
}) {
  // The times share the standings table instead of sitting in a strip of their
  // own, so the screen has one table with four views rather than two widgets.
  const splitsView = board?.view === SPLITS_VIEW;
  const columns = splitsView ? ["Time"] : board?.columns ?? [];
  const rows: SoloEndScore[] = splitsView
    ? splits.map((split, index) => ({
        id: split.label,
        rank: index + 1,
        name: split.label,
        cells: [split.value],
      }))
    : board?.rows ?? [];

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

      <div
        className="solo-end-stats"
        style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
      >
        {stats.map((stat) => {
          // A copyable stat is the whole tile, so the target is the number you
          // are looking at rather than a hover-only icon beside it.
          const Tile = stat.onCopy ? "button" : "div";
          return (
            <Tile
              className="solo-end-stat"
              key={stat.label}
              {...(stat.onCopy
                ? {
                    type: "button" as const,
                    onClick: stat.onCopy,
                    "aria-label": `Copy ${stat.label.toLowerCase()}`,
                    "data-tooltip": "Click to copy",
                    "data-tooltip-pos": "top",
                    "data-copy": "",
                  }
                : {})}
              style={{ "--stat-accent": stat.accent ?? "var(--primary)" } as CSSProperties}
            >
              <span className="solo-end-stat-label">{stat.label}</span>
              <span className="solo-end-stat-value">
                {stat.value}
                {stat.note && <em className="solo-end-stat-note">{stat.note}</em>}
              </span>
            </Tile>
          );
        })}
      </div>

      {board && (
      <section className="solo-end-board" aria-label="Standings">
        <Segmented
          row={{
            label: "Standings filter",
            value: board.view,
            options: splits.length > 0 ? [...board.views, SPLITS_OPTION] : board.views,
            onChange: board.onViewChange,
          }}
          attached
        />

        {/* The times are already in hand, so a stalled fetch never dims them. */}
        <SoloScoreTable
          columns={columns}
          rows={rows}
          nameLabel={splitsView ? "Puzzle" : "Player"}
          empty={board.empty}
          loading={board.loading && !splitsView}
          scrollKey={board.view}
        />
      </section>
      )}

      {status && (
        <section
          className={`solo-end-status solo-end-status--${status.tone}`}
          data-pending={status.pending ? "" : undefined}
          role="status"
        >
          <div className="solo-end-status-main">
            <p className="solo-end-status-title">{status.title}</p>
            <p className="solo-end-status-message">{status.message}</p>
          </div>
          {status.facts && status.facts.length > 0 && (
            <div className="solo-drawer solo-end-status-facts">
              {status.facts.map((fact) => (
                <span className="solo-end-fact" key={fact}>{fact}</span>
              ))}
            </div>
          )}
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

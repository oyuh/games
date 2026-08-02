import { Fragment, useEffect, useRef, type CSSProperties } from "react";
import { showToast } from "../../lib/toast";

/**
 * A leaderboard row. `rank` is the real standing, not the array index, because
 * some views are deliberately full of holes: top 3, you and your neighbours,
 * bottom 3. The gaps get drawn from the jumps between ranks.
 */
export interface SoloScoreRow {
  id: string;
  rank: number;
  name: string;
  isOwn?: boolean;
  seed?: number;
  /** One string per column, in the same order as `columns`. */
  cells: string[];
}

/** Every seed on screen is copyable, and they all land here. */
export function copySeed(seed: number | string) {
  return navigator.clipboard.writeText(String(seed))
    .then(() => showToast("Seed copied", "success"))
    .catch(() => showToast("Could not copy the seed", "error"));
}

/**
 * The standings table shared by the end screen and the full leaderboard: same
 * columns, same medals, same "you" row, same copyable seeds. Only the height
 * and what gets fed in changes between the two.
 */
export function SoloScoreTable({
  columns,
  rows,
  nameLabel = "Player",
  empty,
  loading,
  scrollKey,
  height,
}: {
  columns: string[];
  rows: SoloScoreRow[];
  /** What the second column is a list of, e.g. "Puzzle" for the times view. */
  nameLabel?: string;
  /** Shown in place of the rows when there are none. */
  empty: string;
  loading?: boolean | undefined;
  /** Changing this re-centres your own row, e.g. when the view switches. */
  scrollKey?: unknown;
  /** CSS length for the scroll box. Fixed, so the panel never resizes. */
  height?: string;
}) {
  const seedColumn = rows.some((row) => row.seed != null);
  // In a table of nothing but your own runs, marking each one "you" is noise.
  const allOwn = rows.length > 0 && rows.every((row) => row.isOwn);

  // Centre your own run in the table rather than making you find it. Keyed on
  // the row id so a scroll you did yourself is not undone on every render.
  const selfRow = useRef<HTMLDivElement>(null);
  const selfId = rows.find((row) => row.isOwn)?.id;
  useEffect(() => {
    const row = selfRow.current;
    const scroller = row?.closest<HTMLElement>(".solo-end-table-scroll");
    if (!row || !scroller) return;
    scroller.scrollTop = row.offsetTop - (scroller.clientHeight - row.offsetHeight) / 2;
  }, [selfId, scrollKey]);

  return (
    <div className="solo-drawer solo-end-table" data-loading={loading ? "" : undefined}>
      <div
        className="solo-end-table-scroll"
        style={height ? ({ "--table-h": height } as CSSProperties) : undefined}
      >
        <div
          className="solo-end-table-grid"
          data-seed={seedColumn ? "" : undefined}
          style={{ "--metric-cols": columns.length } as CSSProperties}
        >
          <div className="solo-end-row solo-end-row--head" role="row">
            <span className="solo-end-cell solo-end-cell--rank">#</span>
            <span className="solo-end-cell solo-end-cell--name">{nameLabel}</span>
            {columns.map((column) => (
              <span className="solo-end-cell solo-end-cell--metric" key={column}>{column}</span>
            ))}
            {seedColumn && <span className="solo-end-cell solo-end-cell--seed">Seed</span>}
          </div>

          {rows.length === 0 ? (
            <p className="solo-end-empty">{loading ? "Loading standings" : empty}</p>
          ) : (
            rows.map((row, index) => {
              const previous = rows[index - 1];
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
                      <span className="solo-end-cell solo-end-cell--metric" key={columns[cellIndex] ?? cellIndex}>
                        {cell}
                      </span>
                    ))}
                    {seedColumn && (
                      row.seed != null ? (
                        <button
                          className="solo-end-cell solo-end-cell--seed solo-end-seed"
                          type="button"
                          onClick={() => copySeed(row.seed!)}
                          aria-label={`Copy seed ${row.seed}`}
                          data-tooltip="Click to copy"
                          data-tooltip-pos="top"
                        >
                          {row.seed}
                        </button>
                      ) : (
                        <span className="solo-end-cell solo-end-cell--seed">-</span>
                      )
                    )}
                  </div>
                </Fragment>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

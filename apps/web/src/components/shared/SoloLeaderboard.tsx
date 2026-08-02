import { useEffect } from "react";
import { createPortal } from "react-dom";
import { FiChevronLeft, FiChevronRight, FiSearch, FiX } from "react-icons/fi";
import { Segmented, type SoloSetupRow } from "./SoloGameMenu";
import { SoloScoreTable, type SoloScoreRow } from "./SoloScoreTable";

export interface SoloLeaderboardSearch {
  /** Open swaps the facts drawer for the input. */
  open: boolean;
  value: string;
  onToggle: () => void;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * The full leaderboard for the solo games, built from the same pieces as the
 * menu and the end screen: centred hero, segmented pickers with a drawer hung
 * off the last one, the shared standings table, plain text links. It is bigger
 * than the end screen's board and it paginates, which is the only real
 * difference between the two.
 */
export function SoloLeaderboard({
  game,
  title,
  subtitle,
  filters,
  facts,
  search,
  columns,
  rows,
  loading,
  empty,
  page,
  totalPages,
  onPageChange,
  onClose,
}: {
  /** Colours the modal, since a portal sits outside the page's theme scope. */
  game: "pips" | "shikaku";
  title: string;
  /** One line under the title, usually the total run count. */
  subtitle: string;
  /** Difficulty, view, whatever the game filters by. Rendered top to bottom. */
  filters: SoloSetupRow[];
  /** Your own numbers, in the drawer under the last filter. */
  facts?: string[] | undefined;
  /** Left off for boards with nothing worth searching. */
  search?: SoloLeaderboardSearch | undefined;
  columns: string[];
  rows: SoloScoreRow[];
  loading: boolean;
  empty: string;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock the page behind the modal so scrolling the list does not move it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  const pages = Math.max(1, totalPages);
  const searching = Boolean(search?.open);
  // The search box lives in the drawer the facts do, and the drawer is always
  // there, so the panel is exactly one size no matter what is in it.
  const factLines = facts && facts.length > 0 ? facts : ["Nothing of yours on this board yet"];

  return createPortal(
    <div
      className="solo-lb-overlay"
      data-game-theme={game}
      role="presentation"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      onWheel={(event) => event.stopPropagation()}
    >
      <section className="solo-lb" role="dialog" aria-modal="true" aria-label={title}>
        <button className="solo-lb-close" type="button" onClick={onClose} aria-label="Close" data-tooltip="Close">
          <FiX size={16} />
        </button>

        <header className="solo-menu-hero solo-lb-hero">
          <h1 className="solo-menu-title solo-lb-title">{title}</h1>
          <p className="solo-menu-sub">{subtitle}</p>
        </header>

        <div className="solo-lb-filters">
          {filters.map((row, index) => {
            const last = index === filters.length - 1;
            return (
              <div className="solo-lb-filter" key={row.label}>
                <div className="solo-lb-filter-bar">
                  {last && search && (
                    <button
                      className="solo-lb-search-toggle"
                      type="button"
                      onClick={search.onToggle}
                      aria-pressed={searching}
                      aria-label={searching ? "Close search" : "Search the leaderboard"}
                      data-tooltip={searching ? "Close search" : "Search names and seeds"}
                      data-tooltip-pos="top"
                    >
                      {searching ? <FiX size={15} /> : <FiSearch size={15} />}
                    </button>
                  )}
                  <Segmented row={row} attached={last} />
                </div>
                {last && (
                  searching ? (
                    <div className="solo-drawer solo-lb-search">
                      <FiSearch className="solo-lb-search-icon" size={14} aria-hidden="true" />
                      <input
                        className="solo-lb-search-input"
                        type="search"
                        value={search!.value}
                        placeholder={search!.placeholder ?? "Search names and seeds"}
                        aria-label="Search the leaderboard"
                        autoFocus
                        maxLength={40}
                        onChange={(event) => search!.onChange(event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Escape" && search!.value) { event.stopPropagation(); search!.onChange(""); } }}
                      />
                      {search!.value && (
                        <button
                          className="solo-lb-search-clear"
                          type="button"
                          onClick={() => search!.onChange("")}
                          aria-label="Clear search"
                          data-tooltip="Clear"
                          data-tooltip-pos="top"
                        >
                          <FiX size={14} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="solo-drawer solo-end-status-facts">
                      {factLines.map((fact) => (
                        <span className="solo-end-fact" key={fact}>{fact}</span>
                      ))}
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>

        {/* Height comes from the panel's row vars, so it is exactly one page. */}
        <SoloScoreTable
          columns={columns}
          rows={rows}
          empty={empty}
          loading={loading}
          scrollKey={page}
        />

        <nav className="solo-menu-links solo-lb-pages">
          <button
            className="solo-menu-link"
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={loading || page <= 1}
          >
            <FiChevronLeft size={14} /> Prev
          </button>
          <span className="solo-lb-page-count">Page {Math.min(page, pages)} of {pages}</span>
          <button
            className="solo-menu-link"
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={loading || page >= pages}
          >
            Next <FiChevronRight size={14} />
          </button>
        </nav>
      </section>
    </div>,
    document.body,
  );
}

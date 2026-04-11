import { useEffect } from "react";
import { createPortal } from "react-dom";
import { FiAward, FiCopy, FiX } from "react-icons/fi";
import { Difficulty, DIFFICULTY_CONFIG } from "../lib/shikaku-engine";
import { showToast } from "../lib/toast";

/* ── Types (exported so ShikakuPage can use them) ─────────── */
export interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  timeMs: number;
  difficulty: Difficulty;
  createdAt: number;
  seed: number;
  isOwn: boolean;
}

export interface PersonalBest {
  score: number;
  timeMs: number;
  rank: number;
}

export type LeaderboardView = "all" | "mine";

/* ═══════════════════════════════════════════════════════════ */
/*  ShikakuLeaderboard — modal popup (props-based)             */
/* ═══════════════════════════════════════════════════════════ */
export function ShikakuLeaderboard({
  entries,
  loading,
  difficulty,
  view,
  personalBest,
  onDiffChange,
  onViewChange,
  onClose,
  formatTime,
  page,
  totalPages,
  total,
  onPageChange,
}: {
  entries: LeaderboardEntry[];
  loading: boolean;
  difficulty: Difficulty;
  view: LeaderboardView;
  personalBest: PersonalBest | null;
  onDiffChange: (d: Difficulty) => void;
  onViewChange: (view: LeaderboardView) => void;
  onClose: () => void;
  formatTime: (ms: number) => string;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pageSize = 10;
  const safeTotalPages = Math.max(totalPages, 1);

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return createPortal(
    <div
      className="shikaku-leaderboard-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Shikaku leaderboard"
    >
      <div className="shikaku-leaderboard">
        {/* Header */}
        <div className="shikaku-lb-header">
          <h2><FiAward size={14} /> Leaderboard <span className="shikaku-lb-count" style={{ marginLeft: 4 }}>{total}</span></h2>
          <button className="btn btn-muted" onClick={onClose} data-tooltip="Close" style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}>
            <FiX size={13} />
          </button>
        </div>

        <div className="shikaku-lb-tabs">
          {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map((d) => (
            <button
              key={d}
              className={`shikaku-lb-tab ${d === difficulty ? "shikaku-lb-tab--active" : ""}`}
              onClick={() => onDiffChange(d)}
              data-tooltip={`${DIFFICULTY_CONFIG[d].label} grid`}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="shikaku-lb-personal-best">
          {personalBest ? (
            <>
              <span className="shikaku-lb-pb-label" data-tooltip="Your highest score on this difficulty">Your Best — #{personalBest.rank}</span>
              <span className="shikaku-lb-pb-value">{personalBest.score.toLocaleString()} — {formatTime(personalBest.timeMs)}</span>
            </>
          ) : (
            <span className="shikaku-lb-pb-none">No personal best yet — play a round!</span>
          )}
        </div>

        <div className="shikaku-lb-toolbar">
          <div className="shikaku-lb-view-toggle" role="tablist" aria-label="Leaderboard view filter">
            <button
              className={`shikaku-lb-view-btn ${view === "all" ? "shikaku-lb-view-btn--active" : ""}`}
              onClick={() => onViewChange("all")}
            >
              All
            </button>
            <button
              className={`shikaku-lb-view-btn ${view === "mine" ? "shikaku-lb-view-btn--active" : ""}`}
              onClick={() => onViewChange("mine")}
            >
              Mine
            </button>
          </div>
          <span className="shikaku-lb-count">{total} {total === 1 ? "score" : "scores"}</span>
        </div>

        <div className="shikaku-lb-content">
          <div className="shikaku-lb-col-header" aria-hidden="true">
            <span>#</span>
            <span>Player</span>
            <span>Score</span>
            <span>Time</span>
            <span>Seed</span>
          </div>
          {loading ? (
            <div className="shikaku-lb-spinner-wrap">
              <div className="shikaku-lb-spinner" />
              <span className="shikaku-lb-spinner-text">Loading scores…</span>
            </div>
          ) : entries.length === 0 ? (
            <div className="shikaku-lb-empty-stable">{view === "mine" ? "You have no saved scores on this difficulty yet." : "No scores yet — be the first!"}</div>
          ) : (
            <div className="shikaku-lb-list">
              {entries.map((entry, i) => {
                const rank = (page - 1) * pageSize + i + 1;
                return (
                  <div
                    key={entry.id}
                    className={`shikaku-lb-row${rank <= 3 ? ` shikaku-lb-row--top${rank}` : ""}${entry.isOwn ? " shikaku-lb-row--self" : ""}`}
                    data-tooltip={entry.isOwn ? "Your score" : undefined}
                  >
                    <span className="shikaku-lb-rank">#{rank}</span>
                    <div className="shikaku-lb-player">
                      <span className="shikaku-lb-name">{entry.name}</span>
                      {entry.isOwn && <span className="shikaku-lb-badge">You</span>}
                    </div>
                    <span className="shikaku-lb-score">{entry.score.toLocaleString()}</span>
                    <span className="shikaku-lb-time">{formatTime(entry.timeMs)}</span>
                    <button
                      className="shikaku-lb-copy-seed"
                      data-tooltip={`Copy seed: ${entry.seed}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(String(entry.seed)).then(() => showToast("Seed copied!", "info")).catch(() => {});
                      }}
                    >
                      <FiCopy size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="shikaku-lb-pagination">
          <button
            className="shikaku-lb-page-btn"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1 || loading || safeTotalPages <= 1}
          >
            ←
          </button>
          <span className="shikaku-lb-page-info">
            {`Page ${Math.min(page, safeTotalPages)} of ${safeTotalPages} (${total} ${total === 1 ? "score" : "scores"})`}
          </span>
          <button
            className="shikaku-lb-page-btn"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= safeTotalPages || loading || safeTotalPages <= 1}
          >
            →
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

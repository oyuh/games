import { useCallback, useEffect, useState } from "react";
import { FiAward, FiCopy } from "react-icons/fi";
import { Difficulty, DIFFICULTY_CONFIG } from "../../lib/shikaku-engine";
import { getOrCreateSessionId } from "../../lib/session";
import { showToast } from "../../lib/toast";
import { BottomSheet } from "./BottomSheet";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const PAGE_SIZE = 10;

interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  timeMs: number;
  difficulty: Difficulty;
  createdAt: number;
  seed: number;
  isOwn: boolean;
}

interface PersonalBest {
  score: number;
  timeMs: number;
  rank: number;
}

type LeaderboardView = "all" | "mine";

function formatTime(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const centis = Math.floor((ms % 1000) / 10);
  return `${min}:${sec.toString().padStart(2, "0")}.${centis.toString().padStart(2, "0")}`;
}

export function MobileLeaderboardSheet({ onClose }: { onClose: () => void }) {
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [view, setView] = useState<LeaderboardView>("all");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [personalBest, setPersonalBest] = useState<PersonalBest | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchLeaderboard = useCallback(async (diff: Difficulty, pg: number, v: LeaderboardView) => {
    setLoading(true);
    try {
      const sessionId = getOrCreateSessionId();
      const params = new URLSearchParams({
        difficulty: diff,
        limit: String(PAGE_SIZE),
        page: String(pg),
        sessionId,
      });
      if (v === "mine") params.set("mineOnly", "1");

      const res = await fetch(`${API_BASE}/api/shikaku/leaderboard?${params.toString()}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries ?? []);
        setPersonalBest(data.personalBest ?? null);
        setPage(data.page ?? 1);
        setTotalPages(data.totalPages ?? 1);
        setTotal(data.total ?? 0);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard(difficulty, 1, view);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDiffChange = (d: Difficulty) => {
    setDifficulty(d);
    setPage(1);
    fetchLeaderboard(d, 1, view);
  };

  const handleViewChange = (v: LeaderboardView) => {
    setView(v);
    setPage(1);
    fetchLeaderboard(difficulty, 1, v);
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    fetchLeaderboard(difficulty, p, view);
  };

  return (
    <BottomSheet title="Leaderboard" onClose={onClose}>
      <div className="m-lb">
        {/* Difficulty tabs */}
        <div className="m-lb-tabs">
          {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map((d) => (
            <button
              key={d}
              className={`m-lb-tab${d === difficulty ? " m-lb-tab--active" : ""}`}
              onClick={() => handleDiffChange(d)}
            >
              {d}
            </button>
          ))}
        </div>

        {/* Personal best */}
        <div className="m-lb-pb">
          {personalBest ? (
            <>
              <span className="m-lb-pb-label">Your Best — #{personalBest.rank}</span>
              <span className="m-lb-pb-value">{personalBest.score.toLocaleString()} — {formatTime(personalBest.timeMs)}</span>
            </>
          ) : (
            <span className="m-lb-pb-none">No personal best yet</span>
          )}
        </div>

        {/* View toggle + count */}
        <div className="m-lb-toolbar">
          <div className="m-lb-view-toggle">
            <button
              className={`m-lb-view-btn${view === "all" ? " m-lb-view-btn--active" : ""}`}
              onClick={() => handleViewChange("all")}
            >
              All
            </button>
            <button
              className={`m-lb-view-btn${view === "mine" ? " m-lb-view-btn--active" : ""}`}
              onClick={() => handleViewChange("mine")}
            >
              Mine
            </button>
          </div>
          <span className="m-lb-count">{total} {total === 1 ? "score" : "scores"}</span>
        </div>

        {/* Content */}
        {loading ? (
          <p className="m-lb-empty">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="m-lb-empty">
            {view === "mine" ? "No scores on this difficulty yet." : "No scores yet — be the first!"}
          </p>
        ) : (
          <div className="m-lb-list">
            {entries.map((entry, i) => {
              const rank = (page - 1) * PAGE_SIZE + i + 1;
              return (
                <div
                  key={entry.id}
                  className={`m-lb-row${rank <= 3 ? ` m-lb-row--top${rank}` : ""}${entry.isOwn ? " m-lb-row--self" : ""}`}
                >
                  <span className="m-lb-rank">#{rank}</span>
                  <div className="m-lb-player">
                    <span className="m-lb-name">{entry.name}</span>
                    {entry.isOwn && <span className="m-lb-you">You</span>}
                  </div>
                  <span className="m-lb-score">{entry.score.toLocaleString()}</span>
                  <span className="m-lb-time">{formatTime(entry.timeMs)}</span>
                  <button
                    className="m-lb-copy"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(String(entry.seed))
                        .then(() => showToast("Seed copied!", "info"))
                        .catch(() => {});
                    }}
                  >
                    <FiCopy size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="m-lb-pagination">
            <button
              className="m-lb-page-btn"
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1 || loading}
            >
              ←
            </button>
            <span className="m-lb-page-info">
              {page} / {totalPages}
            </span>
            <button
              className="m-lb-page-btn"
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages || loading}
            >
              →
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

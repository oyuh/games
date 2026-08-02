import { useEffect, useState } from "react";
import { getOrCreateSessionId } from "../lib/session";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/**
 * The three ways to slice the end screen's table.
 * - standings: top 3, your rank plus and minus 3, bottom 3 (server-side window)
 * - top: the fastest ten, full stop
 * - mine: your own submitted runs, best first
 */
export type SoloEndView = "standings" | "top" | "mine";

interface SoloEndEntry {
  rank?: number;
  isOwn?: boolean;
}

/**
 * Loads the solo end screen's leaderboard slice. Both single-player games hit
 * the same endpoint shape, so the only differences are the game name and, for
 * Shikaku, the difficulty. Bump `refreshKey` to reload in place, which is what
 * submitting a score does so your new rank appears without a reload.
 */
export function useSoloEndBoard<E extends SoloEndEntry, P>({
  game,
  active,
  view,
  difficulty,
  refreshKey,
}: {
  game: "pips" | "shikaku";
  /** False on every screen but the end screen, so nothing is fetched. */
  active: boolean;
  view: SoloEndView;
  difficulty?: string;
  refreshKey?: unknown;
}) {
  const [entries, setEntries] = useState<E[]>([]);
  const [personalBest, setPersonalBest] = useState<P | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active) return;
    const params = new URLSearchParams({ sessionId: getOrCreateSessionId() });
    if (difficulty) params.set("difficulty", difficulty);
    if (view === "standings") {
      params.set("window", "me");
    } else {
      params.set("limit", "10");
      if (view === "mine") params.set("mineOnly", "1");
    }

    let cancelled = false;
    setLoading(true);
    fetch(`${API_BASE}/api/${game}/leaderboard?${params.toString()}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Leaderboard unavailable"))))
      .then((data: { entries?: E[]; personalBest?: P | null; total?: number }) => {
        if (cancelled) return;
        const rows = data.entries ?? [];
        // Only the standings window sends real ranks, because only it has gaps.
        setEntries(rows.map((entry, index) => ({ ...entry, rank: entry.rank ?? index + 1 })));
        setPersonalBest(data.personalBest ?? null);
        setTotal(data.total ?? rows.length);
      })
      .catch(() => {
        if (cancelled) return;
        setEntries([]);
        setPersonalBest(null);
        setTotal(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [game, active, view, difficulty, refreshKey]);

  return { entries, personalBest, total, loading };
}

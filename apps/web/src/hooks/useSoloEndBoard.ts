import { useEffect, useState } from "react";
import { getOrCreateSessionId } from "../lib/session";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/**
 * The three ways to slice the end screen's table.
 * - standings: top 3, this run (or your best) plus and minus 3, bottom 3
 * - top: the fastest ten, full stop
 * - mine: your own submitted runs, best first
 */
export type SoloEndView = "standings" | "top" | "mine";

interface SoloEndEntry {
  rank?: number;
  isOwn?: boolean;
}

/** Where the run you just finished sits on the whole board. */
export interface SoloEndRun {
  rank: number;
  of: number;
}

/**
 * Loads the solo end screen's leaderboard slice. All the single-player games hit
 * the same endpoint shape, so the only differences are the game name and the
 * board. Pass `runSeed` once the run is on the board: a session holds one score
 * per seed, so the server can find it, center the standings on it, and send its
 * rank with every view. Setting it also reloads the board, so a fresh submit
 * shows where the run landed.
 */
export function useSoloEndBoard<E extends SoloEndEntry, P>({
  game,
  active,
  view,
  difficulty,
  runSeed,
}: {
  game: "pips" | "shikaku" | "zip";
  /** False on every screen but the end screen, so nothing is fetched. */
  active: boolean;
  view: SoloEndView;
  difficulty?: string;
  runSeed?: number | null;
}) {
  const [entries, setEntries] = useState<E[]>([]);
  const [personalBest, setPersonalBest] = useState<P | null>(null);
  const [run, setRun] = useState<SoloEndRun | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active) return;
    const params = new URLSearchParams({ sessionId: getOrCreateSessionId() });
    if (difficulty) params.set("difficulty", difficulty);
    if (runSeed != null) params.set("runSeed", String(runSeed));
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
      .then((data: { entries?: E[]; personalBest?: P | null; run?: SoloEndRun | null }) => {
        if (cancelled) return;
        setEntries(data.entries ?? []);
        setPersonalBest(data.personalBest ?? null);
        setRun(data.run ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setEntries([]);
        setPersonalBest(null);
        setRun(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [game, active, view, difficulty, runSeed]);

  return { entries, personalBest, run, loading };
}

/** The status chips for where a run placed: this run, plus your best when that is a different run. */
export function placementFacts(run: SoloEndRun | null, best: { rank: number } | null): string[] {
  return [
    ...(run ? [`Rank #${run.rank} of ${run.of}`] : []),
    ...(best && best.rank !== run?.rank ? [`Your best #${best.rank}`] : []),
  ];
}

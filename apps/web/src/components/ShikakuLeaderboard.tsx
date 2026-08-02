import { FiAward, FiUser } from "react-icons/fi";
import { Difficulty, DIFFICULTY_CONFIG } from "../lib/shikaku-engine";
import { SoloLeaderboard, type SoloLeaderboardSearch } from "./shared/SoloLeaderboard";
import type { SoloSetupOption } from "./shared/SoloGameMenu";

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
  /** Real standing. Only the search and the end screen's window send it. */
  rank?: number;
}

export interface PersonalBest {
  score: number;
  timeMs: number;
  rank: number;
}

export type LeaderboardView = "all" | "mine";

const PAGE_SIZE = 10;

/** One colour per rung of the ladder. The menu and the end screen use it too. */
export const SHIKAKU_DIFFICULTY_ACCENTS: Record<Difficulty, string> = {
  easy: "#34d399",
  medium: "#60a5fa",
  hard: "#f59e0b",
  expert: "#f87171",
};

const VIEW_OPTIONS: SoloSetupOption[] = [
  { value: "all", label: "Everyone", icon: <FiAward size={15} />, title: "Every submitted score, highest first" },
  { value: "mine", label: "Yours", icon: <FiUser size={15} />, title: "Your own submitted scores" },
];

/** The difficulty ladder, drawn like the menu's picker: one filled arc per rank. */
const DIFFICULTY_OPTIONS: SoloSetupOption[] = (Object.keys(DIFFICULTY_CONFIG) as Difficulty[])
  .map((difficulty, index, all) => ({
    value: difficulty,
    label: difficulty.charAt(0).toUpperCase() + difficulty.slice(1),
    ring: { total: all.length, filled: index + 1 },
    accent: SHIKAKU_DIFFICULTY_ACCENTS[difficulty],
    title: `${difficulty}, ${DIFFICULTY_CONFIG[difficulty].label} grid`,
  }));

/**
 * Shikaku's full leaderboard. Everything but the columns and the two filter
 * rows lives in SoloLeaderboard, which Pips uses too.
 */
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
  search,
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
  search?: SoloLeaderboardSearch;
}) {
  return (
    <SoloLeaderboard
      game="shikaku"
      title="Shikaku Leaderboard"
      subtitle={search?.open && search.value.trim()
        ? `${total.toLocaleString()} ${difficulty} match${total === 1 ? "" : "es"}`
        : `${total.toLocaleString()} ${difficulty} score${total === 1 ? "" : "s"}`}
      {...(search ? { search } : {})}
      filters={[
        {
          label: "Difficulty",
          value: difficulty,
          options: DIFFICULTY_OPTIONS,
          onChange: (next) => onDiffChange(next as Difficulty),
        },
        {
          label: "Leaderboard view",
          value: view,
          options: VIEW_OPTIONS,
          onChange: (next) => onViewChange(next as LeaderboardView),
        },
      ]}
      facts={personalBest
        ? [
            `Your best #${personalBest.rank}`,
            `${personalBest.score.toLocaleString()} points`,
            formatTime(personalBest.timeMs),
          ]
        : undefined}
      columns={["Score", "Time"]}
      rows={entries.map((entry, index) => ({
        id: entry.id,
        // Searching sends the standing each score actually holds; a plain page
        // is in order, so its position is the rank.
        rank: entry.rank ?? (page - 1) * PAGE_SIZE + index + 1,
        name: entry.name,
        isOwn: entry.isOwn,
        seed: entry.seed,
        cells: [entry.score.toLocaleString(), formatTime(entry.timeMs)],
      }))}
      loading={loading}
      empty={search?.open && search.value.trim()
        ? `Nothing on the ${difficulty} board matches that.`
        : view === "mine"
          ? `No saved ${difficulty} scores on this device yet.`
          : `No ${difficulty} scores yet, be the first.`}
      page={page}
      totalPages={totalPages}
      onPageChange={onPageChange}
      onClose={onClose}
    />
  );
}

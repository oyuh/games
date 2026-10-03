import { useEffect, useState } from "react";
import { FiAward, FiUser } from "react-icons/fi";
import { formatTime } from "../shared/GameStatBar";
import { SoloLeaderboard, type SoloLeaderboardSearch } from "../shared/SoloLeaderboard";
import type { SoloSetupOption } from "../shared/SoloGameMenu";
import { DIFFICULTY_CONFIG, GRID_SIZES, RUN_LENGTH, type Difficulty, type GridSize } from "../../lib/zip-engine";
import {
  fetchZipLeaderboard,
  type ZipLeaderboardEntry,
  type ZipLeaderboardPage,
  type ZipLeaderboardView,
  type ZipPersonalBest,
} from "../../lib/zip-api";

const PAGE_SIZE = 10;

const DIFFICULTY_OPTIONS: SoloSetupOption[] = (Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map((difficulty, index, all) => ({
  value: difficulty,
  label: DIFFICULTY_CONFIG[difficulty].label,
  ring: { total: all.length, filled: index + 1 },
  title: `${DIFFICULTY_CONFIG[difficulty].label}, ${RUN_LENGTH[difficulty]} puzzles a run`,
}));

const SIZE_OPTIONS: SoloSetupOption[] = GRID_SIZES.map((size) => ({
  value: String(size),
  label: `${size}×${size}`,
  title: `${size} by ${size} grid`,
}));

const VIEW_OPTIONS: SoloSetupOption[] = [
  { value: "all", label: "Everyone", icon: <FiAward size={15} />, title: "Every submitted run, fastest first" },
  { value: "mine", label: "Yours", icon: <FiUser size={15} />, title: "Your own submitted runs" },
];

/**
 * Zip's full leaderboard. Every board is one difficulty at one size, so both
 * pick the board and the view row sits under them. Runs rank by total time,
 * and Avg is that time spread over the run's puzzles, which is
 * the number that compares across difficulties.
 */
export function ZipLeaderboard({
  entries,
  loading,
  difficulty,
  size,
  view,
  personalBest,
  page,
  totalPages,
  total,
  search,
  onDifficultyChange,
  onSizeChange,
  onViewChange,
  onPageChange,
  onClose,
}: {
  entries: ZipLeaderboardEntry[];
  loading: boolean;
  difficulty: Difficulty;
  size: GridSize;
  view: ZipLeaderboardView;
  personalBest: ZipPersonalBest | null;
  page: number;
  totalPages: number;
  total: number;
  search?: SoloLeaderboardSearch;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onSizeChange: (size: GridSize) => void;
  onViewChange: (view: ZipLeaderboardView) => void;
  onPageChange: (page: number) => void;
  onClose: () => void;
}) {
  const board = `${DIFFICULTY_CONFIG[difficulty].label.toLowerCase()} ${size}×${size}`;
  const searching = Boolean(search?.open && search.value.trim());
  const runs = RUN_LENGTH[difficulty];

  return (
    <SoloLeaderboard
      game="zip"
      title="Zip Leaderboard"
      subtitle={searching
        ? `${total.toLocaleString()} ${board} match${total === 1 ? "" : "es"}`
        : `${total.toLocaleString()} ${board} run${total === 1 ? "" : "s"}`}
      {...(search ? { search } : {})}
      filters={[
        { label: "Difficulty", value: difficulty, options: DIFFICULTY_OPTIONS, onChange: (next) => onDifficultyChange(next as Difficulty) },
        { label: "Grid size", value: String(size), options: SIZE_OPTIONS, onChange: (next) => onSizeChange(Number(next) as GridSize) },
        { label: "Leaderboard view", value: view, options: VIEW_OPTIONS, onChange: (next) => onViewChange(next as ZipLeaderboardView) },
      ]}
      facts={personalBest
        ? [`Your best #${personalBest.rank}`, formatTime(personalBest.timeMs), `${formatTime(personalBest.timeMs / runs)} a puzzle`]
        : undefined}
      columns={["Time", "Avg"]}
      rows={entries.map((entry, index) => ({
        id: entry.id,
        rank: entry.rank ?? (page - 1) * PAGE_SIZE + index + 1,
        name: entry.name,
        isOwn: entry.isOwn,
        seed: entry.seed,
        cells: [formatTime(entry.timeMs), formatTime(entry.timeMs / runs)],
      }))}
      loading={loading}
      empty={searching
        ? `Nothing on the ${board} board matches that.`
        : view === "mine"
          ? `No saved ${board} runs on this device yet.`
          : `No ${board} runs yet, be the first.`}
      page={page}
      totalPages={totalPages}
      onPageChange={onPageChange}
      onClose={onClose}
    />
  );
}

/**
 * The leaderboard with its own fetching, for anywhere that just wants to open
 * it: the menu, the sidebar, the end screen. It opens on the board you were
 * looking at. With the API down it opens empty rather than pretending.
 */
export function ZipLeaderboardModal({
  initialDifficulty,
  initialSize,
  onClose,
}: {
  initialDifficulty: Difficulty;
  initialSize: GridSize;
  onClose: () => void;
}) {
  const [difficulty, setDifficulty] = useState(initialDifficulty);
  const [size, setSize] = useState(initialSize);
  const [view, setView] = useState<ZipLeaderboardView>("all");
  const [page, setPage] = useState(1);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [data, setData] = useState<ZipLeaderboardPage | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchZipLeaderboard({ difficulty, size, page, view, q: searchOpen ? query.trim() : "" })
      .then((next) => { if (!cancelled) setData(next); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [difficulty, size, page, view, searchOpen, query]);

  // A new board, view, or search starts back on its first page.
  const pick = <T,>(set: (value: T) => void) => (value: T) => { set(value); setPage(1); };

  return (
    <ZipLeaderboard
      entries={data?.entries ?? []}
      loading={loading}
      difficulty={difficulty}
      size={size}
      view={view}
      personalBest={data?.personalBest ?? null}
      page={page}
      totalPages={data?.totalPages ?? 1}
      total={data?.total ?? 0}
      search={{
        open: searchOpen,
        value: query,
        onToggle: () => { setSearchOpen((open) => !open); setQuery(""); setPage(1); },
        onChange: pick(setQuery),
      }}
      onDifficultyChange={pick(setDifficulty)}
      onSizeChange={pick(setSize)}
      onViewChange={pick(setView)}
      onPageChange={setPage}
      onClose={onClose}
    />
  );
}

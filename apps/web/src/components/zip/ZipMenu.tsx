import { FiFlag, FiHash, FiRepeat } from "react-icons/fi";
import { SoloGameMenu, type SoloSetupRow } from "../shared/SoloGameMenu";
import { DIFFICULTY_CONFIG, GRID_SIZES, RUN_LENGTH, type Difficulty, type GridSize } from "../../lib/zip-engine";

export type ZipMenuMode = "ranked" | "endless" | "seed";

const DIFFICULTIES = Object.keys(DIFFICULTY_CONFIG) as Difficulty[];

export const sizeRow = (value: GridSize, onChange: (size: GridSize) => void): SoloSetupRow => ({
  label: "Grid size",
  value: String(value),
  options: GRID_SIZES.map((size) => ({ value: String(size), label: `${size}×${size}`, title: `${size} by ${size} grid` })),
  onChange: (next) => onChange(Number(next) as GridSize),
});

export const difficultyRow = (value: Difficulty, onChange: (difficulty: Difficulty) => void): SoloSetupRow => ({
  label: "Difficulty",
  value,
  options: DIFFICULTIES.map((difficulty, i) => ({
    value: difficulty,
    label: DIFFICULTY_CONFIG[difficulty].label,
    title: `${DIFFICULTY_CONFIG[difficulty].label}, ${RUN_LENGTH[difficulty]} puzzles a run`,
    ring: { total: DIFFICULTIES.length, filled: i + 1 },
  })),
  onChange: (next) => onChange(next as Difficulty),
});

// Keep every note at or under 40 chars, see .solo-setup-note.
const modeNote = (mode: ZipMenuMode, puzzles: number) => ({
  ranked: `${puzzles} puzzles, timed and ranked.`,
  endless: "Endless puzzles at one size. Unranked.",
  seed: `Your seed, ${puzzles} puzzles. Unranked.`,
})[mode];

const START_LABELS: Record<ZipMenuMode, string> = {
  ranked: "Start Ranked Run",
  endless: "Start Endless Run",
  seed: "Start Seeded Run",
};

/**
 * Zip's menu, laid out like Shikaku's: run type and the seed drawer up top,
 * then difficulty and size under the note. Ranked shows the run as a ladder.
 */
export function ZipMenu({
  mode,
  difficulty,
  size,
  seed,
  starting,
  onModeChange,
  onDifficultyChange,
  onSizeChange,
  onSeedChange,
  onStart,
  onOpenLeaderboard,
  onOpenHowTo,
}: {
  mode: ZipMenuMode;
  difficulty: Difficulty;
  size: GridSize;
  seed: string;
  /** A ranked start waits on the server for its seed. */
  starting?: boolean;
  onModeChange: (mode: ZipMenuMode) => void;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onSizeChange: (size: GridSize) => void;
  onSeedChange: (seed: string) => void;
  onStart: () => void;
  onOpenLeaderboard: () => void;
  onOpenHowTo: () => void;
}) {
  const puzzles = RUN_LENGTH[difficulty];
  return (
    <SoloGameMenu
      title="Zip"
      subtitle="Draw one line through every square, hitting the numbers in order."
      modeRow={{
        label: "Run type",
        value: mode,
        onChange: (value) => onModeChange(value as ZipMenuMode),
        options: [
          { value: "ranked", label: "Ranked", icon: <FiFlag size={17} />, weight: 2, title: `Ranked run, ${puzzles} puzzles` },
          { value: "endless", icon: <FiRepeat size={17} />, title: "Endless run, no puzzle limit" },
          { value: "seed", icon: <FiHash size={17} />, title: "Replay a run from a seed" },
        ],
      }}
      difficultyRow={difficultyRow(difficulty, onDifficultyChange)}
      sizeRow={sizeRow(size, onSizeChange)}
      note={modeNote(mode, puzzles)}
      seed={{
        open: mode !== "ranked",
        value: seed,
        onChange: onSeedChange,
        placeholder: mode === "endless" ? "Optional seed" : "Enter a seed to replay a run",
      }}
      {...(mode === "ranked"
        ? { ladder: Array.from({ length: puzzles }, (_, i) => (i === 0 ? "Puzzle 1" : String(i + 1))) }
        : {})}
      startLabel={starting ? "Starting..." : START_LABELS[mode]}
      onStart={starting ? () => {} : onStart}
      onOpenLeaderboard={onOpenLeaderboard}
      onOpenHowTo={onOpenHowTo}
    />
  );
}

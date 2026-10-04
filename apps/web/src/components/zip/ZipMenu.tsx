import { FiFlag, FiHash, FiRepeat } from "react-icons/fi";
import { SoloGameMenu, type SoloSetupRow } from "../shared/SoloGameMenu";
import { DIFFICULTY_CONFIG, RUN_LENGTH, type Difficulty } from "../../lib/zip-engine";

export type ZipMenuMode = "ranked" | "endless" | "seed";

const DIFFICULTIES = Object.keys(DIFFICULTY_CONFIG) as Difficulty[];

export const difficultyRow = (value: Difficulty, onChange: (difficulty: Difficulty) => void): SoloSetupRow => ({
  label: "Difficulty",
  value,
  options: DIFFICULTIES.map((difficulty, i) => ({
    value: difficulty,
    label: DIFFICULTY_CONFIG[difficulty].label,
    hint: `${DIFFICULTY_CONFIG[difficulty].size}×${DIFFICULTY_CONFIG[difficulty].size}`,
    title: difficultyTitle(difficulty),
    ring: { total: DIFFICULTIES.length, filled: i + 1 },
  })),
  onChange: (next) => onChange(next as Difficulty),
});

/** What each difficulty plays like, for its tooltip in the menu and the leaderboard. */
export function difficultyTitle(difficulty: Difficulty): string {
  const { size, label } = DIFFICULTY_CONFIG[difficulty];
  return difficulty === "expert"
    ? `${label}, ${size}×${size} with a random number of dots`
    : `${label}, ${size}×${size}`;
}

// Keep every note at or under 40 chars, see .solo-setup-note.
const NOTES: Record<ZipMenuMode, string> = {
  ranked: `${RUN_LENGTH} puzzles, timed and ranked.`,
  endless: "Puzzles until you stop. Unranked.",
  seed: `Your seed, ${RUN_LENGTH} puzzles. Unranked.`,
};

const START_LABELS: Record<ZipMenuMode, string> = {
  ranked: "Start Ranked Run",
  endless: "Start Endless Run",
  seed: "Start Seeded Run",
};

/**
 * Zip's menu, laid out like Shikaku's: run type and the seed drawer up top,
 * then difficulty under the note, which also sets the grid size. Ranked shows
 * the run as a ladder.
 */
export function ZipMenu({
  mode,
  difficulty,
  seed,
  starting,
  onModeChange,
  onDifficultyChange,
  onSeedChange,
  onStart,
  onOpenLeaderboard,
  onOpenHowTo,
}: {
  mode: ZipMenuMode;
  difficulty: Difficulty;
  seed: string;
  /** A ranked start waits on the server for its seed. */
  starting?: boolean;
  onModeChange: (mode: ZipMenuMode) => void;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onSeedChange: (seed: string) => void;
  onStart: () => void;
  onOpenLeaderboard: () => void;
  onOpenHowTo: () => void;
}) {
  return (
    <SoloGameMenu
      title="Zip"
      subtitle="Draw one line through every square, hitting the numbers in order."
      modeRow={{
        label: "Run type",
        value: mode,
        onChange: (value) => onModeChange(value as ZipMenuMode),
        options: [
          { value: "ranked", label: "Ranked", icon: <FiFlag size={17} />, weight: 2, title: `Ranked run, ${RUN_LENGTH} puzzles` },
          { value: "endless", icon: <FiRepeat size={17} />, title: "Endless run, no puzzle limit" },
          { value: "seed", icon: <FiHash size={17} />, title: "Replay a run from a seed" },
        ],
      }}
      difficultyRow={difficultyRow(difficulty, onDifficultyChange)}
      note={NOTES[mode]}
      seed={{
        open: mode !== "ranked",
        value: seed,
        onChange: onSeedChange,
        placeholder: mode === "endless" ? "Optional seed" : "Enter a seed to replay a run",
      }}
      {...(mode === "ranked"
        ? { ladder: Array.from({ length: RUN_LENGTH }, (_, i) => (i === 0 ? "Puzzle 1" : String(i + 1))) }
        : {})}
      startLabel={starting ? "Starting..." : START_LABELS[mode]}
      onStart={starting ? () => {} : onStart}
      onOpenLeaderboard={onOpenLeaderboard}
      onOpenHowTo={onOpenHowTo}
    />
  );
}

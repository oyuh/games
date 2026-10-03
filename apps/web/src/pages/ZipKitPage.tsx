import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FiAward, FiGrid, FiHash, FiRefreshCw } from "react-icons/fi";
import { GameButton } from "../components/shared/GameKit";
import { GameStat, GameStatBar, GameTimer } from "../components/shared/GameStatBar";
import { Segmented } from "../components/shared/SoloGameMenu";
import { ZipBoard, nextCheckpoint } from "../components/zip/ZipBoard";
import { ZipLeaderboardModal } from "../components/zip/ZipLeaderboard";
import { ZipMenu, difficultyRow, sizeRow, type ZipMenuMode } from "../components/zip/ZipMenu";
import {
  DIFFICULTY_CONFIG,
  GRID_SIZES,
  generatePuzzle,
  mulberry32,
  validatePath,
  type Difficulty,
  type GridSize,
} from "../lib/zip-engine";
import { emitSolo, useSoloEvent } from "../lib/solo-bus";
import "../styles/game-shared.css";

/**
 * Every part of Zip, on one page, driven by fixed seeds. Same idea as
 * /dev/shade and /dev/chain: get each state of the board right here before
 * the real page exists, so the look is settled by the time the game is.
 */

/* Fixed seeds, so every board on this page looks the same each time it's
   opened and a change to the drawing is visible instead of lost in a reshuffle. */
const EASY_6 = generatePuzzle(6, "easy", mulberry32(101));
const MEDIUM_8 = generatePuzzle(8, "medium", mulberry32(202));
const HARD_8 = generatePuzzle(8, "hard", mulberry32(303));

const NOOP = () => {};

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="game-section">
      <h3 className="game-section-label">{title}</h3>
      {note && <p className="game-section-subtle">{note}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "0.75rem" }}>{children}</div>
    </section>
  );
}

/**
 * The board the way a player meets it: pick a size, draw, back up, solve.
 * Undo, clear, and the hint live on the sidebar, same as Shikaku's, so this
 * talks to it over the solo bus the way the real page will.
 */
function Live() {
  const [size, setSize] = useState<GridSize>(6);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [seed, setSeed] = useState(1);
  const [path, setPath] = useState<number[]>([]);
  const [hint, setHint] = useState(true);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  const puzzle = useMemo(() => generatePuzzle(size, difficulty, mulberry32(seed * 7919 + size)), [size, difficulty, seed]);
  const solved = validatePath(puzzle, path);

  // A new board is a new run: empty line, clock back to zero.
  useEffect(() => {
    setPath([]);
    setStartedAt(Date.now());
  }, [puzzle]);

  useEffect(() => {
    if (solved) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [solved]);

  const next = nextCheckpoint(puzzle, path);
  const canEdit = path.length > 0 && !solved;

  useEffect(() => {
    emitSolo("zip-game-state", { phase: "playing", canUndo: canEdit, canClear: canEdit, hint, canRestart: false, canGiveUp: false, showDevTools: false, canDevSolve: false, canDevSkip: false });
  }, [canEdit, hint]);
  useSoloEvent("zip-undo", () => setPath((p) => p.slice(0, -1)));
  useSoloEvent("zip-clear", () => setPath([]));
  useSoloEvent("zip-toggle-hint", () => setHint((h) => !h));

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", width: "100%" }}>
      <div style={{ display: "grid", gap: "0.5rem", width: "min(500px, 100%)" }}>
        <Segmented row={sizeRow(size, setSize)} />
        <Segmented row={difficultyRow(difficulty, setDifficulty)} />
      </div>

      <GameStatBar>
        <GameStat icon={<FiGrid size={13} />} value={`${size}×${size}`} hint={DIFFICULTY_CONFIG[difficulty].label} />
        <GameStat
          icon={<FiHash size={13} />}
          value={solved ? "Done" : String(next + 1)}
          hint={solved ? undefined : `of ${puzzle.checkpoints.length}`}
          tooltip="The number the line needs next"
        />
        <GameTimer ms={now - startedAt} />
        <GameStat icon={<FiRefreshCw size={13} />} value="New" tooltip="Another puzzle at this size" onClick={() => setSeed((s) => s + 1)} />
      </GameStatBar>

      <ZipBoard puzzle={puzzle} path={path} onPathChange={setPath} hint={hint} solved={solved} />

      {solved && (
        <GameButton variant="primary" icon={<FiRefreshCw />} onClick={() => setSeed((s) => s + 1)}>
          Next puzzle
        </GameButton>
      )}
    </div>
  );
}

function Menu() {
  const [mode, setMode] = useState<ZipMenuMode>("ranked");
  const [size, setSize] = useState<GridSize>(6);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [seed, setSeed] = useState("");
  return (
    <ZipMenu
      mode={mode}
      difficulty={difficulty}
      size={size}
      seed={seed}
      onModeChange={setMode}
      onDifficultyChange={setDifficulty}
      onSizeChange={setSize}
      onSeedChange={setSeed}
      onStart={NOOP}
      onOpenLeaderboard={NOOP}
      onOpenHowTo={NOOP}
    />
  );
}

/** The real leaderboard modal, reading the real API. */
function LiveLeaderboard() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <GameButton variant="primary" icon={<FiAward />} onClick={() => setOpen(true)}>Open the leaderboard</GameButton>
      {open && <ZipLeaderboardModal initialDifficulty="easy" initialSize={6} onClose={() => setOpen(false)} />}
    </>
  );
}

export function ZipKitPage() {
  const half = MEDIUM_8.solution.slice(0, Math.floor(MEDIUM_8.solution.length / 2));
  const sizes = useMemo(() => GRID_SIZES.map((size) => generatePuzzle(size, "medium", mulberry32(size))), []);

  return (
    <main
      className="game-page"
      data-game-theme="zip"
      style={{ display: "flex", flexDirection: "column", gap: "1.5rem", padding: "2rem 1rem", margin: "0 auto", maxWidth: "56rem" }}
    >
      <header>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, letterSpacing: "0.04em" }}>Zip</h1>
        <p className="game-section-subtle">Every part of the game, in every state, before the real page exists.</p>
      </header>

      <Section title="Live" note="drag from 1, or use the arrow keys once the board has focus. drag back over the line to back it up. undo, clear, and the hint are on the sidebar">
        <Live />
      </Section>

      <Section title="The menu" note="same as shikaku's: ranked, endless, or seeded up top with the seed drawer under it, then difficulty and size below the line">
        <Menu />
      </Section>

      <Section title="The leaderboard" note="live off the api. one board per difficulty and size, fastest run first, and avg spreads the time over the run's puzzles">
        <LiveLeaderboard />
      </Section>

      <Section title="A fresh board" note="nothing drawn yet. the numbers are the whole puzzle, so they're the loudest thing on it">
        <ZipBoard puzzle={EASY_6} path={[]} onPathChange={NOOP} />
      </Section>

      <Section title="Halfway, with the hint on" note="every stretch between two numbers gets its own color, and each ball's ring shows the two it joins: coming in on the left, going out on the right. the next number gets the hint ring">
        <ZipBoard puzzle={MEDIUM_8} path={half} onPathChange={NOOP} hint />
      </Section>

      <Section title="Walls" note="a hard board leans on walls instead of numbers. the line can't cross one, so they're drawn over everything else">
        <ZipBoard puzzle={HARD_8} path={[]} onPathChange={NOOP} />
      </Section>

      <Section title="Solved" note="the line keeps its colors and the edge goes green. the board stops taking input">
        <ZipBoard puzzle={MEDIUM_8} path={MEDIUM_8.solution} solved />
      </Section>

      <Section title="Every size" note="6, 8, 10, and 12. the numbers scale with the cell, so a 12x12 still reads at thumbnail size">
        {sizes.map((puzzle) => (
          <ZipBoard key={puzzle.size} puzzle={puzzle} path={[]} size="sm" />
        ))}
      </Section>

    </main>
  );
}

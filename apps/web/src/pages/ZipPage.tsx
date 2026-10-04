import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FiAward, FiFlag, FiHash, FiHome, FiLayers, FiTarget, FiUploadCloud, FiUser } from "react-icons/fi";
import { formatTime, GameStat, GameStatBar, GameTimer } from "../components/shared/GameStatBar";
import { SoloEndScreen, SPLITS_VIEW, soloStatusTitle } from "../components/shared/SoloEndScreen";
import type { SoloSetupOption } from "../components/shared/SoloGameMenu";
import { copySeed } from "../components/shared/SoloScoreTable";
import { ZipBoard } from "../components/zip/ZipBoard";
import { ZipDemo } from "../components/zip/ZipDemo";
import { ZipLeaderboardModal } from "../components/zip/ZipLeaderboard";
import { ZipMenu, type ZipMenuMode } from "../components/zip/ZipMenu";
import { useSoloEndBoard, type SoloEndView } from "../hooks/useSoloEndBoard";
import { emitSolo, useSoloEvent } from "../lib/solo-bus";
import { playCountdownTick, playCorrect, playGameOver } from "../lib/sounds";
import { showToast } from "../lib/toast";
import {
  checkZipEligibility,
  startZipRankedRun,
  submitZipScore,
  type ZipLeaderboardEntry,
  type ZipPersonalBest,
} from "../lib/zip-api";
import {
  DIFFICULTY_CONFIG,
  RUN_LENGTH,
  generatePuzzle,
  mulberry32,
  validatePath,
  type Difficulty,
  type ZipPuzzle,
} from "../lib/zip-engine";
import "../styles/game-shared.css";
import "../styles/zip.css";

type Phase = "menu" | "countdown" | "playing" | "finished";

interface Run {
  mode: ZipMenuMode;
  difficulty: Difficulty;
  seed: number;
  /** Only ranked runs have one; it's what the score gets submitted with. */
  ticket: string | null;
  /** Null for endless, which runs until you give up. */
  length: number | null;
}

interface Submission {
  tone: "info" | "success" | "error";
  pending: boolean;
  canSubmit: boolean;
  message: string;
}

/** How long a solved board stays up, green, before the next one. Off the clock. */
const SOLVED_PAUSE_MS = 900;

/** Endless has no end, so it keeps this many boards built ahead of you. */
const ENDLESS_AHEAD = 3;

/** Dev-only solve and skip, same pair Pips and Shikaku carry. Stripped from a prod build. */
const SHOW_DEV_TOOLS = import.meta.env.DEV;

const END_VIEWS: SoloSetupOption[] = [
  { value: "standings", label: "Standings", icon: <FiTarget size={15} />, weight: 35, title: "Top 3, your run and its neighbors, bottom 3" },
  { value: "mine", label: "Yours", icon: <FiUser size={15} />, weight: 35, title: "Your own submitted runs, fastest first" },
  { value: "top", label: "Top 10", icon: <FiAward size={15} />, weight: 15, title: "The ten fastest runs on this board" },
];

const MODE_LABELS: Record<ZipMenuMode, string> = { ranked: "Ranked", endless: "Endless", seed: "Seeded" };

const sizeOf = (difficulty: Difficulty) => DIFFICULTY_CONFIG[difficulty].size;
const boardLabel = (difficulty: Difficulty) => `${DIFFICULTY_CONFIG[difficulty].label} ${sizeOf(difficulty)}×${sizeOf(difficulty)}`;

function randomSeed() {
  return Math.floor(Math.random() * 2_147_483_646) + 1;
}

export function ZipPage() {
  const [phase, setPhase] = useState<Phase>("menu");
  const [menuMode, setMenuMode] = useState<ZipMenuMode>("ranked");
  const [menuDifficulty, setMenuDifficulty] = useState<Difficulty>("medium");
  const [seedInput, setSeedInput] = useState("");
  const [starting, setStarting] = useState(false);

  const [run, setRun] = useState<Run | null>(null);
  const [index, setIndex] = useState(0);
  const [puzzle, setPuzzle] = useState<ZipPuzzle | null>(null);
  const [path, setPath] = useState<number[]>([]);
  const [hint, setHint] = useState(true);
  const [splits, setSplits] = useState<number[]>([]);
  const [paths, setPaths] = useState<number[][]>([]);
  const [puzzleStartedAt, setPuzzleStartedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [countdown, setCountdown] = useState(3);
  const [solved, setSolved] = useState(false);
  const [outcome, setOutcome] = useState<"completed" | "gave-up">("completed");

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [panel, setPanel] = useState<"leaderboard" | "how-to" | null>(null);

  // Boards come off one rng in order, exactly like generateRun, so a seed
  // means the same boards here as on the server. Built one at a time so a big
  // hard run never stalls the page up front.
  const boards = useRef<{ rng: () => number; puzzles: ZipPuzzle[] } | null>(null);
  const boardAt = (i: number, r: Run): ZipPuzzle => {
    const state = boards.current!;
    while (state.puzzles.length <= i) state.puzzles.push(generatePuzzle(sizeOf(r.difficulty), r.difficulty, state.rng));
    return state.puzzles[i]!;
  };

  const begin = (next: Run) => {
    boards.current = { rng: mulberry32(next.seed), puzzles: [] };
    setRun(next);
    setIndex(0);
    setPuzzle(null);
    setPath([]);
    setSplits([]);
    setPaths([]);
    setSolved(false);
    setSubmission(null);
    setSubmitting(false);
    setSubmitted(false);
    setOutcome("completed");
    setCountdown(3);
    setPanel(null);
    setPhase("countdown");
  };

  /** How many boards to have ready: the whole run, or a few ahead for endless. */
  const preloadCount = (r: Run, from: number) => (r.length === null ? from + ENDLESS_AHEAD : r.length);

  const startRun = async (mode: ZipMenuMode, difficulty: Difficulty, seed?: number) => {
    const length = mode === "endless" ? null : RUN_LENGTH;
    if (mode !== "ranked") {
      begin({ mode, difficulty, seed: seed ?? randomSeed(), ticket: null, length });
      return;
    }
    setStarting(true);
    try {
      const ranked = await startZipRankedRun(difficulty);
      begin({ mode, difficulty, seed: ranked.seed, ticket: ranked.ticket, length });
    } catch {
      showToast("Couldn't reach the server for a ranked run. Endless and Seeded still work.", "error");
    } finally {
      setStarting(false);
    }
  };

  const startFromMenu = () => {
    const typed = Number(seedInput);
    const seed = Number.isInteger(typed) && typed > 0 ? Math.min(typed, 2_147_483_647) : undefined;
    if (menuMode === "seed" && seed === undefined) {
      showToast("Enter a seed first", "info");
      return;
    }
    void startRun(menuMode, menuDifficulty, menuMode === "ranked" ? undefined : seed);
  };

  // Ranked never replays a seed, so a restart there asks for a fresh one.
  const restart = () => {
    if (!run) return;
    // Ranked waits on the server, which toasts on its own if it fails.
    if (run.mode !== "ranked") showToast(run.mode === "seed" ? "Seeded run restarted" : "Run restarted", "info");
    void startRun(run.mode, run.difficulty, run.mode === "ranked" ? undefined : run.seed);
  };

  const finish = (how: "completed" | "gave-up") => {
    setOutcome(how);
    setSolved(false);
    setPhase("finished");
    playGameOver();
    if (how === "gave-up") showToast("Run abandoned", "info");
    else if (run?.length === null) showToast(`Endless run over, ${splits.length} solved`, "info");
    else showToast("Run complete", "success");
  };

  /* ── Countdown ─────────────────────────────────────────── */
  // The whole run is built while the numbers count down, one board per tick
  // so the animation never stalls, and the first board shows up already made.
  useEffect(() => {
    if (phase !== "countdown" || !run) return;
    let cancelled = false;
    const buildNext = () => {
      if (cancelled || !boards.current) return;
      const built = boards.current.puzzles.length;
      if (built >= preloadCount(run, 0)) return;
      boardAt(built, run);
      window.setTimeout(buildNext, 0);
    };
    const timer = window.setTimeout(buildNext, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, run]);

  useEffect(() => {
    if (phase !== "countdown" || !run) return;
    if (countdown <= 0) {
      const timer = window.setTimeout(() => {
        // Anything the ticks didn't get to gets built now, before the clock starts.
        boardAt(preloadCount(run, 0) - 1, run);
        setPuzzle(boardAt(0, run));
        setPuzzleStartedAt(Date.now());
        setNow(Date.now());
        setPhase("playing");
      }, 650);
      return () => window.clearTimeout(timer);
    }
    playCountdownTick();
    const timer = window.setTimeout(() => setCountdown((n) => n - 1), 800);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown, phase, run]);

  /* ── Clock ─────────────────────────────────────────────── */
  useEffect(() => {
    if (phase !== "playing" || solved) return;
    const id = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(id);
  }, [phase, solved]);

  const doneMs = splits.reduce((total, split) => total + split, 0);
  const elapsedMs = doneMs + (phase === "playing" && !solved ? Math.max(0, now - puzzleStartedAt) : 0);

  /* ── Solving ───────────────────────────────────────────── */
  const onPathChange = (next: number[]) => {
    if (phase !== "playing" || solved || !puzzle) return;
    setPath(next);
    if (!validatePath(puzzle, next)) return;
    setSplits((all) => [...all, Date.now() - puzzleStartedAt]);
    setPaths((all) => [...all, next]);
    setSolved(true);
    playCorrect();
  };

  // ponytail: dev solves log at least 30 ms a square, so a dev-tested ranked
  // run clears the server's time floors instead of striking your local session.
  const devSplit = (r: Run) => Math.max(Date.now() - puzzleStartedAt, sizeOf(r.difficulty) ** 2 * 30);

  const devSolve = () => {
    if (phase !== "playing" || solved || !puzzle || !run) return;
    setPath(puzzle.solution);
    setSplits((all) => [...all, devSplit(run)]);
    setPaths((all) => [...all, puzzle.solution]);
    setSolved(true);
  };

  // Solves every board left in the run and jumps to the end screen. The board
  // on screen gets its real time; the ones never shown get the floor.
  const devSkip = () => {
    if (phase !== "playing" || !run || run.length === null) return;
    const first = solved ? index + 1 : index;
    const remaining = Array.from({ length: run.length - first }, (_, i) => boardAt(first + i, run));
    const floor = sizeOf(run.difficulty) ** 2 * 30;
    setSplits((all) => [...all, ...remaining.map((_, i) => (i === 0 && !solved ? devSplit(run) : floor))]);
    setPaths((all) => [...all, ...remaining.map((board) => board.solution)]);
    finish("completed");
  };

  useEffect(() => {
    if (!solved || !run) return;
    const lastBoard = run.length !== null && index + 1 >= run.length;
    // The last board gets "Run complete" from finish instead.
    if (!lastBoard) showToast(`Puzzle ${index + 1} solved`, "success");
    const timer = window.setTimeout(() => {
      const nextIndex = index + 1;
      if (lastBoard) {
        finish("completed");
        return;
      }
      setIndex(nextIndex);
      setPuzzle(boardAt(nextIndex, run));
      setPath([]);
      setSolved(false);
      setPuzzleStartedAt(Date.now());
    }, SOLVED_PAUSE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solved]);

  // Endless keeps a few boards built ahead while this one is being played.
  useEffect(() => {
    if (phase !== "playing" || !run || run.length !== null) return;
    const timer = window.setTimeout(() => boardAt(preloadCount(run, index) - 1, run), 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index, run]);

  /* ── Ranked submission ─────────────────────────────────── */
  const rankedFinish = phase === "finished" && run?.mode === "ranked" && outcome === "completed" && Boolean(run.ticket);
  const replay = { puzzleTimes: splits, paths };

  useEffect(() => {
    if (!rankedFinish || !run?.ticket) return;
    let cancelled = false;
    setSubmission({ tone: "info", pending: true, canSubmit: false, message: "Checking your run with the server." });
    checkZipEligibility({ ticket: run.ticket, timeMs: doneMs, replayData: replay })
      .then((result) => {
        if (cancelled) return;
        setSubmission({ tone: result.ok ? "info" : "error", pending: false, canSubmit: result.ok, message: result.reason });
        if (!result.ok) showToast(result.reason, "error");
      })
      .catch(() => {
        if (cancelled) return;
        setSubmission({ tone: "error", pending: false, canSubmit: false, message: "Couldn't reach the server to check this run." });
        showToast("Couldn't reach the server to check this run.", "error");
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankedFinish]);

  const submit = async () => {
    if (!run?.ticket || submitting) return;
    setSubmitting(true);
    try {
      const result = await submitZipScore({ ticket: run.ticket, timeMs: doneMs, replayData: replay });
      setSubmission({ tone: result.ok ? "success" : "error", pending: false, canSubmit: !result.ok && result.code !== "duplicate", message: result.reason });
      showToast(result.reason, result.ok ? "success" : "error");
      if (result.ok || result.code === "duplicate") setSubmitted(true);
    } catch {
      setSubmission({ tone: "error", pending: false, canSubmit: true, message: "Couldn't reach the server. Your run is kept, try again." });
      showToast("Couldn't reach the server. Your run is kept, try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Sidebar ───────────────────────────────────────────── */
  const canEdit = phase === "playing" && !solved && path.length > 0;
  useEffect(() => {
    emitSolo("zip-game-state", {
      phase,
      canUndo: canEdit,
      canClear: canEdit,
      hint,
      canRestart: phase === "playing" || phase === "countdown",
      canGiveUp: phase === "playing",
      showDevTools: SHOW_DEV_TOOLS,
      canDevSolve: phase === "playing" && !solved,
      canDevSkip: phase === "playing" && run?.length != null,
    });
  }, [phase, canEdit, hint, solved, run]);

  useSoloEvent("zip-undo", () => { if (canEdit) setPath((p) => p.slice(0, -1)); });
  useSoloEvent("zip-clear", () => { if (canEdit) setPath([]); });
  useSoloEvent("zip-toggle-hint", () => setHint((h) => !h));
  useSoloEvent("zip-restart-run", restart);
  useSoloEvent("zip-give-up", () => { if (phase === "playing") finish(run?.length === null ? "completed" : "gave-up"); });
  useSoloEvent("zip-dev-solve", devSolve);
  useSoloEvent("zip-dev-skip", devSkip);
  useSoloEvent("zip-toggle-leaderboard", () => setPanel((open) => (open === "leaderboard" ? null : "leaderboard")));

  /* ── Screens ───────────────────────────────────────────── */
  const panels = (
    <>
      {panel === "leaderboard" && (
        <ZipLeaderboardModal
          initialDifficulty={run?.difficulty ?? menuDifficulty}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "how-to" && <ZipDemo onClose={() => setPanel(null)} />}
    </>
  );

  if (phase === "menu" || !run) {
    return (
      <>
        <div className="game-page zip-page" data-game-theme="zip" data-phase="menu">
          <ZipMenu
            mode={menuMode}
            difficulty={menuDifficulty}
            seed={seedInput}
            starting={starting}
            onModeChange={setMenuMode}
            onDifficultyChange={setMenuDifficulty}
            onSeedChange={setSeedInput}
            onStart={startFromMenu}
            onOpenLeaderboard={() => setPanel("leaderboard")}
            onOpenHowTo={() => setPanel("how-to")}
          />
        </div>
        {panels}
      </>
    );
  }

  if (phase === "finished") {
    return (
      <>
        <div className="game-page zip-page" data-game-theme="zip" data-phase="finished">
          <ZipEndScreen
            run={run}
            outcome={outcome}
            splits={splits}
            submission={submission}
            submitting={submitting}
            submitted={submitted}
            onSubmit={() => void submit()}
            onPlayAgain={() => void startRun(run.mode, run.difficulty, run.mode === "seed" ? run.seed : undefined)}
            onMenu={() => { setPanel(null); setPhase("menu"); }}
            onOpenLeaderboard={() => setPanel("leaderboard")}
          />
        </div>
        {panels}
      </>
    );
  }

  return (
    <>
      <div className="game-page zip-page" data-game-theme="zip" data-phase={phase}>
        <main className="zip-stage">
          <header className="zip-head">
            <h1 className="game-title">Zip</h1>
            <GameStatBar>
              <GameStat
                icon={<FiLayers size={13} />}
                value={run.length === null ? String(index + 1) : `${index + 1}/${run.length}`}
                hint={run.length === null ? "puzzle" : MODE_LABELS[run.mode]}
                tooltip={run.length === null ? `Puzzle ${index + 1} of an endless run` : `Puzzle ${index + 1} of ${run.length}`}
              />
              <GameTimer ms={elapsedMs} />
              <GameStat icon={<FiHash size={13} />} value={String(run.seed)} tooltip="Seed, click to copy" onClick={() => void copySeed(run.seed)} />
            </GameStatBar>
          </header>

          {phase === "playing" && puzzle ? (
            <ZipBoard puzzle={puzzle} path={path} onPathChange={onPathChange} hint={hint} solved={solved} />
          ) : (
            <div className="zip-board zip-board-placeholder" style={{ "--zip-n": sizeOf(run.difficulty) } as CSSProperties} aria-hidden="true" />
          )}

        {/* Inside the stage rather than straight under .game-page, whose
            `> *` rule would force it to position: relative and drop it
            below the board instead of over the screen. */}
        {phase === "countdown" && (
          <div className="game-start-countdown" aria-live="polite">
            <p className="game-start-countdown-kicker">{MODE_LABELS[run.mode]} Run</p>
            <div className="game-start-countdown-number" key={countdown}>
              {countdown > 0 ? countdown : "GO!"}
            </div>
            <p className="game-start-countdown-label">
              {run.mode === "seed" ? `Seed ${run.seed}, ` : ""}{boardLabel(run.difficulty)}
            </p>
          </div>
        )}
        </main>
      </div>
      {panels}
    </>
  );
}

/* ── End screen ──────────────────────────────────────────── */

function ZipEndScreen({
  run,
  outcome,
  splits,
  submission,
  submitting,
  submitted,
  onSubmit,
  onPlayAgain,
  onMenu,
  onOpenLeaderboard,
}: {
  run: Run;
  outcome: "completed" | "gave-up";
  splits: number[];
  submission: Submission | null;
  submitting: boolean;
  submitted: boolean;
  onSubmit: () => void;
  onPlayAgain: () => void;
  onMenu: () => void;
  onOpenLeaderboard: () => void;
}) {
  const [view, setView] = useState<SoloEndView | typeof SPLITS_VIEW>("standings");
  const board = useSoloEndBoard<ZipLeaderboardEntry, ZipPersonalBest>({
    game: "zip",
    active: view !== SPLITS_VIEW,
    view: view === SPLITS_VIEW ? "standings" : view,
    difficulty: run.difficulty,
    refreshKey: submitted,
  });

  const ranked = run.mode === "ranked";
  const endless = run.length === null;
  const completed = outcome === "completed";
  const totalMs = splits.reduce((total, split) => total + split, 0);
  const label = boardLabel(run.difficulty);
  const canSubmit = ranked && completed && !submitted && !submitting && Boolean(submission?.canSubmit) && !submission?.pending;
  const shownSplits = endless ? splits.slice(-6) : splits;
  const firstShown = splits.length - shownSplits.length;

  const rankValue = board.personalBest
    ? `#${board.personalBest.rank}`
    : submitted ? "Submitted" : canSubmit ? "Ready" : "Unranked";

  return (
    <SoloEndScreen
      title={endless ? "Endless Run Over" : completed ? "Run Complete" : "Run Over"}
      subtitle={endless
        ? `Solved ${splits.length} ${label} puzzle${splits.length === 1 ? "" : "s"}`
        : completed
          ? `All ${run.length} ${label} puzzles solved`
          : `Gave up after ${splits.length} of ${run.length} on ${label}`}
      tone={completed ? "success" : "ended"}
      stats={[
        { label: "Time", value: formatTime(totalMs) },
        endless
          ? { label: "Puzzles", value: String(splits.length), note: "unranked" }
          : { label: "Rank", value: rankValue, ...(ranked ? {} : { note: "unranked" }) },
        { label: "Board", value: `${sizeOf(run.difficulty)}×${sizeOf(run.difficulty)}`, note: DIFFICULTY_CONFIG[run.difficulty].label.toLowerCase(), accent: "var(--muted-foreground)" },
        { label: "Seed", value: String(run.seed), accent: "var(--muted-foreground)", onCopy: () => void copySeed(run.seed) },
      ]}
      splits={shownSplits.map((split, i) => ({ label: `Puzzle ${firstShown + i + 1}`, value: formatTime(split) }))}
      board={{
        columns: ["Time", "Avg"],
        rows: board.entries.map((entry) => ({
          id: entry.id,
          rank: entry.rank ?? 0,
          name: entry.name,
          isOwn: Boolean(entry.isOwn),
          seed: entry.seed,
          cells: [formatTime(entry.timeMs), formatTime(entry.timeMs / RUN_LENGTH)],
        })),
        loading: board.loading,
        empty: view === "mine" ? `No submitted ${label} runs on this device yet.` : `No ranked ${label} runs yet, be the first.`,
        total: board.total,
        view,
        views: END_VIEWS,
        onViewChange: (next) => setView(next as SoloEndView | typeof SPLITS_VIEW),
      }}
      {...(submission ? {
        status: {
          tone: submission.tone,
          pending: submission.pending,
          title: soloStatusTitle({
            tone: submission.tone,
            pending: submission.pending,
            submitting,
            submitted,
            canSubmit: submission.canSubmit,
          }),
          message: submission.message,
          facts: [
            ...(board.personalBest ? [`Best #${board.personalBest.rank} of ${board.total}`] : []),
            `This run ${formatTime(totalMs)}`,
            `Seed ${run.seed}`,
          ],
        },
      } : {})}
      primary={canSubmit || submitting
        ? {
            label: submitting ? "Submitting" : "Submit Score",
            icon: <FiUploadCloud size={18} />,
            onClick: onSubmit,
            disabled: submitting,
            title: "Submit your verified Zip run",
          }
        : {
            label: ranked ? "New Ranked Run" : "Play Again",
            icon: <FiFlag size={18} />,
            onClick: onPlayAgain,
          }}
      links={[
        ...(canSubmit || submitting
          ? [{ label: "New Ranked Run", icon: <FiFlag size={14} />, onClick: onPlayAgain, confirm: true }]
          : []),
        { label: "Menu", icon: <FiHome size={14} />, onClick: onMenu, confirm: true },
        { label: "Full Leaderboard", icon: <FiAward size={14} />, onClick: onOpenLeaderboard },
      ]}
    />
  );
}

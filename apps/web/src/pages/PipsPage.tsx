import { type CSSProperties, type MouseEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  FiAward,
  FiCheck,
  FiClipboard,
  FiClock,
  FiCopy,
  FiFlag,
  FiHash,
  FiHelpCircle,
  FiPlay,
  FiRefreshCw,
  FiRepeat,
  FiUploadCloud,
  FiX,
} from "react-icons/fi";
import { GiDominoTiles } from "react-icons/gi";
import "../styles/game-shared.css";
import "../styles/pips.css";
import { PipsDemo } from "../components/demos/PipsDemo";
import {
  evaluateRegionRule,
  generateRun,
  getPlacementValueGrid,
  getRunScoreTime,
  validateSolution,
  type PipsCell,
  type PipsDifficulty,
  type PipsDomino,
  type PipsPlacement,
  type PipsPuzzle,
  type PipsRegion,
  type PipsRegionRule,
} from "../lib/pips-engine";
import { getDisplayName, getOrCreateSessionId, getSessionRequestHeaders, syncSessionIdentity } from "../lib/session";
import { playCorrect, playCountdownTick, playGameOver } from "../lib/sounds";
import { showToast } from "../lib/toast";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type RunPhase = "menu" | "countdown" | "playing" | "complete";
type PipsRunMode = "ranked" | "seeded" | "infinite";
type PipsRunOutcome = "completed" | "abandoned" | null;
type ScoreStatusTone = "info" | "success" | "error";
type PipsLeaderboardView = "all" | "mine";
type PipsAdvanceStep = "solved" | number;
type Rotation = 0 | 1 | 2 | 3;

type PipsDragOrigin = { kind: "tray" } | { kind: "board"; placement: PipsPlacement };

type PipsPanel = "leaderboard" | "how-to" | null;
type PipsRunSplits = Partial<Record<PipsDifficulty, number>>;
type PipsPuzzleRun = ReturnType<typeof generateRun>;

interface PipsLeaderboardEntry {
  id: string;
  name: string;
  seed: number;
  totalMs: number;
  easyMs?: number;
  mediumMs?: number;
  hardMs?: number;
  createdAt?: number;
  isOwn?: boolean;
}

interface PipsPersonalBest {
  totalMs: number;
  rank: number;
  seed?: number;
  easyMs?: number;
  mediumMs?: number;
  hardMs?: number;
  createdAt?: number;
  name?: string;
}

interface PipsRankedDecorDomino {
  id: string;
  left: number;
  top: number;
  z: number;
  scale: number;
  rotate: number;
  duration: number;
  delay: number;
  blur: number;
  opacity: number;
  hoverOpacity: number;
  a: number;
  b: number;
  path: 1 | 2 | 3 | 4;
}

interface ScoreSubmissionStatus {
  canSubmit: boolean;
  pending: boolean;
  tone: ScoreStatusTone;
  message: string;
}

interface ScoreEligibilityResponse {
  canSubmit?: boolean;
  code?: string;
  reason?: string;
  willReplace?: boolean;
}

interface PipsProgress {
  label: string;
  placedCount: number;
  totalDominoes: number;
  remainingMoves: number;
  coveredCells: number;
  totalCells: number;
  completedRegions: number;
  satisfiedRegions: number;
  totalRegions: number;
  pendingRegions: number;
  unsatisfiedRegions: number;
  solved: boolean;
}

interface PipsDragState {
  dominoId: string;
  origin: PipsDragOrigin;
  rotation: Rotation;
  x: number;
  y: number;
  startX: number;
  startY: number;
  hasMoved: boolean;
}

const REGION_COLORS = [
  "#e11d48",
  "#0891b2",
  "#7c3aed",
  "#f97316",
  "#2563eb",
  "#65a30d",
  "#ca8a04",
  "#db2777",
  "#0f766e",
  "#9333ea",
];

const DROP_OFFSETS: Record<Rotation, PipsCell[]> = {
  0: [{ r: 0, c: 1 }, { r: 0, c: -1 }],
  1: [{ r: 1, c: 0 }, { r: -1, c: 0 }],
  2: [{ r: 0, c: -1 }, { r: 0, c: 1 }],
  3: [{ r: -1, c: 0 }, { r: 1, c: 0 }],
};

const ROTATION_DIRECTIONS: Record<Rotation, PipsCell> = {
  0: { r: 0, c: 1 },
  1: { r: 1, c: 0 },
  2: { r: 0, c: -1 },
  3: { r: -1, c: 0 },
};

const BOARD_BUFFER_CELLS = 1;
const SHOW_PIPS_DEV_TOOLS = import.meta.env.DEV;
const PIPS_DIFFICULTIES: PipsDifficulty[] = ["easy", "medium", "hard"];
const PIPS_RANKED_DECOR_COUNT = 16;
const PIPS_LEADERBOARD_PAGE_SIZE = 10;
const PIPS_SEEDED_LEADERBOARD: PipsLeaderboardEntry[] = [
  makePipsLeaderboardEntry("seeded-1", "Tile Witch", 216336, 18_400, 34_200, 58_900),
  makePipsLeaderboardEntry("seeded-2", "Lawson", 963317, 21_100, 37_400, 61_800),
  makePipsLeaderboardEntry("seeded-3", "Dot Matrix", 482019, 19_900, 41_700, 64_300),
  makePipsLeaderboardEntry("seeded-4", "June Bug", 734221, 24_500, 40_800, 68_700),
  makePipsLeaderboardEntry("seeded-5", "Pip Squeak", 119804, 23_700, 45_100, 71_200),
  makePipsLeaderboardEntry("seeded-6", "Mango", 681452, 29_600, 46_900, 76_400),
  makePipsLeaderboardEntry("seeded-7", "Seven Seven", 337710, 27_300, 52_500, 81_200),
  makePipsLeaderboardEntry("seeded-8", "Soft Lock", 592188, 31_800, 54_900, 88_600),
  makePipsLeaderboardEntry("seeded-9", "Gridline", 808246, 36_400, 59_200, 95_300),
  makePipsLeaderboardEntry("seeded-10", "Orange Peel", 410762, 39_700, 64_100, 102_500),
  makePipsLeaderboardEntry("seeded-11", "Half Step", 775930, 42_300, 70_600, 115_700),
  makePipsLeaderboardEntry("seeded-12", "Corner Case", 152644, 48_900, 76_500, 126_100),
];

export function PipsPage() {
  const [seed, setSeed] = useState(() => makeRunSeed());
  const [run, setRun] = useState(() => generateRun(seed));
  const [runMode, setRunMode] = useState<PipsRunMode>("ranked");
  const [runOutcome, setRunOutcome] = useState<PipsRunOutcome>(null);
  const [menuDifficulty, setMenuDifficulty] = useState<PipsDifficulty>("easy");
  const [infiniteDifficulty, setInfiniteDifficulty] = useState<PipsDifficulty>("easy");
  const [infiniteSeedBase, setInfiniteSeedBase] = useState<number | null>(null);
  const [customSeedInput, setCustomSeedInput] = useState("");
  const [countdownNum, setCountdownNum] = useState(3);
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [placements, setPlacements] = useState<PipsPlacement[]>([]);
  const [selectedDominoId, setSelectedDominoId] = useState<string | null>(run.puzzles[0]?.dominoes[0]?.id ?? null);
  const [rotation, setRotation] = useState<Rotation>(0);
  const [dominoRotations, setDominoRotations] = useState<Record<string, Rotation>>({});
  const [dragState, setDragState] = useState<PipsDragState | null>(null);
  const dragStateRef = useRef<PipsDragState | null>(null);
  const [phase, setPhase] = useState<RunPhase>("menu");
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [puzzleStartedAt, setPuzzleStartedAt] = useState(() => Date.now());
  const [runSplits, setRunSplits] = useState<PipsRunSplits>({});
  const [infiniteTimes, setInfiniteTimes] = useState<number[]>([]);
  const [infiniteSolved, setInfiniteSolved] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [openPanel, setOpenPanel] = useState<PipsPanel>(null);
  const [leaderboardEntries, setLeaderboardEntries] = useState<PipsLeaderboardEntry[]>(PIPS_SEEDED_LEADERBOARD);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const [leaderboardTotalPages, setLeaderboardTotalPages] = useState(1);
  const [leaderboardTotal, setLeaderboardTotal] = useState(PIPS_SEEDED_LEADERBOARD.length);
  const [leaderboardView, setLeaderboardView] = useState<PipsLeaderboardView>("all");
  const [personalBest, setPersonalBest] = useState<PipsPersonalBest | null>(null);
  const [finishedLeaderboard, setFinishedLeaderboard] = useState<PipsLeaderboardEntry[]>([]);
  const [finishedPersonalBest, setFinishedPersonalBest] = useState<PipsPersonalBest | null>(null);
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const [submittingScore, setSubmittingScore] = useState(false);
  const [scoreSubmissionStatus, setScoreSubmissionStatus] = useState<ScoreSubmissionStatus | null>(null);
  const [flashingDominoIds, setFlashingDominoIds] = useState<Set<string>>(() => new Set());
  const [advanceCountdown, setAdvanceCountdown] = useState<PipsAdvanceStep | null>(null);
  const [devSolutionPreview, setDevSolutionPreview] = useState(false);
  const solvedAnnouncedRef = useRef<string>("");
  const lastSubmitTime = useRef(0);
  const flashTimerRef = useRef<number | null>(null);
  const advancePuzzleRef = useRef<() => void>(() => {});

  const puzzle = run.puzzles[puzzleIndex]!;
  const draggingDominoId = dragState?.dominoId ?? null;
  const movingDominoId = dragState?.origin.kind === "board" ? dragState.dominoId : null;
  const usedDominoIds = useMemo(() => new Set(placements.map((placement) => placement.dominoId)), [placements]);
  const selectedPlacement = selectedDominoId ? placements.find((placement) => placement.dominoId === selectedDominoId) ?? null : null;
  const draggingDomino = draggingDominoId ? puzzle.dominoes.find((domino) => domino.id === draggingDominoId) ?? null : null;
  const placementByCell = useMemo(() => buildPlacementByCell(placements), [placements]);
  const regionByCell = useMemo(() => buildRegionByCell(puzzle.regions), [puzzle.regions]);
  const regionAnchorById = useMemo(() => buildRegionAnchors(puzzle.regions), [puzzle.regions]);
  const activeCells = useMemo(() => new Set(puzzle.cells.map(cellKey)), [puzzle.cells]);
  const boardRows = puzzle.rows + BOARD_BUFFER_CELLS * 2;
  const boardCols = puzzle.cols + BOARD_BUFFER_CELLS * 2;
  const gridCells = useMemo(() => makeBufferedGridCells(puzzle.rows, puzzle.cols, BOARD_BUFFER_CELLS), [puzzle.rows, puzzle.cols]);
  const solved = validateSolution(puzzle, placements);
  const splitTotalMs = getRunSplitTotal(runSplits);
  const infiniteTotalMs = getRunScoreTime(infiniteTimes.reduce((total, time) => total + time, 0));
  const scoredTotalMs = runMode === "infinite" ? infiniteTotalMs : splitTotalMs;
  const livePuzzleMs = phase === "playing" && advanceCountdown == null && !solved ? now - puzzleStartedAt : 0;
  const elapsedMs = getRunScoreTime(finishedAt && phase === "complete" ? scoredTotalMs : scoredTotalMs + livePuzzleMs);
  const placedCount = placements.length;
  const progress = useMemo(() => getPuzzleProgress(puzzle, placements, solved), [puzzle, placements, solved]);
  const currentLeaderboardEntry = useMemo(
    () => runMode !== "infinite" && getRunSplitTotal(runSplits) > 0
      ? makeCurrentPipsLeaderboardEntry("Your Run", seed, runSplits, elapsedMs)
      : null,
    [elapsedMs, runMode, runSplits, seed],
  );

  const fetchLeaderboard = async (page = leaderboardPage, view = leaderboardView) => {
    setLeaderboardLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PIPS_LEADERBOARD_PAGE_SIZE),
        page: String(page),
        sessionId: getOrCreateSessionId(),
      });
      if (view === "mine") {
        params.set("mineOnly", "true");
      }
      const res = await fetch(`${API_BASE}/api/pips/leaderboard?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Leaderboard unavailable");
      const data = await res.json() as {
        entries?: PipsLeaderboardEntry[];
        personalBest?: PipsPersonalBest | null;
        page?: number;
        totalPages?: number;
        total?: number;
      };
      const entries = (data.entries ?? []).map(normalizePipsLeaderboardEntry).filter(Boolean) as PipsLeaderboardEntry[];
      setLeaderboardEntries(entries);
      setPersonalBest(data.personalBest ?? null);
      setLeaderboardPage(data.page ?? page);
      setLeaderboardTotalPages(Math.max(1, data.totalPages ?? 1));
      setLeaderboardTotal(data.total ?? entries.length);
      if (phase === "complete") {
        setFinishedLeaderboard(entries);
        setFinishedPersonalBest(data.personalBest ?? null);
      }
    } catch {
      const sorted = sortPipsLeaderboardEntries(PIPS_SEEDED_LEADERBOARD);
      const start = (page - 1) * PIPS_LEADERBOARD_PAGE_SIZE;
      const fallbackEntries = view === "mine" ? [] : sorted.slice(start, start + PIPS_LEADERBOARD_PAGE_SIZE);
      setLeaderboardEntries(fallbackEntries);
      setPersonalBest(null);
      setLeaderboardPage(page);
      setLeaderboardTotalPages(view === "mine" ? 1 : Math.max(1, Math.ceil(sorted.length / PIPS_LEADERBOARD_PAGE_SIZE)));
      setLeaderboardTotal(view === "mine" ? 0 : sorted.length);
      if (phase === "complete") {
        setFinishedLeaderboard(fallbackEntries);
        setFinishedPersonalBest(null);
      }
    } finally {
      setLeaderboardLoading(false);
    }
  };

  const setLiveDragState = (next: PipsDragState | null) => {
    dragStateRef.current = next;
    setDragState(next);
  };

  const clearFlashingDominoes = () => {
    if (flashTimerRef.current) {
      window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
    setFlashingDominoIds(new Set());
  };

  const flashDominoes = (dominoIds: Set<string>) => {
    clearFlashingDominoes();
    if (dominoIds.size === 0) return;
    setFlashingDominoIds(new Set(dominoIds));
    flashTimerRef.current = window.setTimeout(() => {
      setFlashingDominoIds(new Set());
      flashTimerRef.current = null;
    }, 1800);
  };

  const updateLiveDragState = (updater: (current: PipsDragState) => PipsDragState | null) => {
    const current = dragStateRef.current;
    if (!current) return;
    const next = updater(current);
    dragStateRef.current = next;
    setDragState(next);
  };

  const getDominoRotation = (dominoId: string): Rotation => dominoRotations[dominoId] ?? 0;

  const setDominoRotation = (dominoId: string, next: Rotation) => {
    setDominoRotations((current) => ({ ...current, [dominoId]: next }));
    setRotation(next);
  };

  const rotateDraggingDomino = () => {
    const current = dragStateRef.current;
    if (!current) return;
    const next = nextRotation(current.rotation);
    if (current.origin.kind === "tray") {
      setDominoRotations((stored) => ({ ...stored, [current.dominoId]: next }));
    }
    updateLiveDragState((state) => ({ ...state, rotation: next }));
  };

  const rotateSelected = () => {
    if (dragStateRef.current) {
      rotateDraggingDomino();
      return;
    }
    if (!selectedDominoId) return;
    if (selectedPlacement) {
      rotatePlacedDomino(selectedPlacement);
      return;
    }
    const next = nextRotation(getDominoRotation(selectedDominoId));
    setDominoRotation(selectedDominoId, next);
  };

  const getDragPositionUpdate = (current: PipsDragState, x: number, y: number): PipsDragState => ({
    ...current,
    x,
    y,
    hasMoved: current.hasMoved || Math.hypot(x - current.startX, y - current.startY) > 4,
  });

  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setInterval(() => setNow(Date.now()), 120);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    void fetchLeaderboard(1, leaderboardView);
    // Initial leaderboard hydrate; subsequent modal pagination calls fetch directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdownNum <= 0) {
      const timer = window.setTimeout(() => {
        setPuzzleStartedAt(Date.now());
        setNow(Date.now());
        setPhase("playing");
      }, 650);
      return () => window.clearTimeout(timer);
    }

    playCountdownTick();
    const timer = window.setTimeout(() => {
      setCountdownNum((current) => current - 1);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [countdownNum, phase]);

  useEffect(() => () => {
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (phase !== "playing") return;
      if (event.key.toLowerCase() !== "r") return;
      if (!selectedDominoId && !dragState) return;
      event.preventDefault();
      rotateSelected();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dragState, phase, selectedDominoId, selectedPlacement, dominoRotations]);

  useEffect(() => {
    setSelectedDominoId((current) => {
      if (current && puzzle.dominoes.some((domino) => domino.id === current)) {
        return current;
      }
      return puzzle.dominoes.find((domino) => !usedDominoIds.has(domino.id))?.id ?? null;
    });
  }, [puzzle.dominoes, usedDominoIds]);

  const beginRun = (
    nextRun: PipsPuzzleRun,
    nextSeed: number,
    nextMode: PipsRunMode,
    nextInfiniteDifficulty = infiniteDifficulty,
    nextInfiniteSeedBase: number | null = null,
  ) => {
    const firstPuzzle = nextRun.puzzles[0];
    if (!firstPuzzle) return;
    setSeed(nextSeed);
    setRun(nextRun);
    setRunMode(nextMode);
    setRunOutcome(null);
    setInfiniteDifficulty(nextInfiniteDifficulty);
    setInfiniteSeedBase(nextInfiniteSeedBase);
    setPuzzleIndex(0);
    setPlacements([]);
    setRotation(0);
    setPhase("countdown");
    setCountdownNum(3);
    setFinishedAt(null);
    setPuzzleStartedAt(Date.now());
    setRunSplits({});
    setInfiniteTimes([]);
    setInfiniteSolved(0);
    setScoreSubmitted(false);
    setSubmittingScore(false);
    setScoreSubmissionStatus(null);
    setFinishedLeaderboard([]);
    setFinishedPersonalBest(null);
    setNow(Date.now());
    setDominoRotations({});
    setLiveDragState(null);
    setOpenPanel(null);
    clearFlashingDominoes();
    setAdvanceCountdown(null);
    solvedAnnouncedRef.current = "";
    setDevSolutionPreview(false);
    setSelectedDominoId(firstPuzzle.dominoes[0]?.id ?? null);
  };

  const startRankedRun = () => {
    const nextSeed = makeRunSeed();
    const nextRun = generateRun(nextSeed);
    beginRun(nextRun, nextSeed, "ranked");
  };

  const startSeededRun = (difficulty?: PipsDifficulty) => {
    const parsedSeed = parseInt(customSeedInput, 10);
    if (!Number.isFinite(parsedSeed) || parsedSeed <= 0) {
      showToast("Enter a positive seed first", "info");
      return;
    }
    const nextRun = difficulty ? generateSingleDifficultyRun(parsedSeed, difficulty) : generateRun(parsedSeed);
    beginRun(nextRun, parsedSeed, "seeded", difficulty ?? infiniteDifficulty);
    setCustomSeedInput("");
  };

  const startInfiniteRun = (difficulty = menuDifficulty) => {
    const nextSeed = makeRunSeed();
    beginRun(generateSingleDifficultyRun(nextSeed, difficulty), nextSeed, "infinite", difficulty);
  };

  const startSeededInfiniteRun = (difficulty: PipsDifficulty) => {
    const parsedSeed = parseInt(customSeedInput, 10);
    if (!Number.isFinite(parsedSeed) || parsedSeed <= 0) {
      showToast("Enter a positive seed first", "info");
      return;
    }
    beginRun(generateSingleDifficultyRun(parsedSeed, difficulty), parsedSeed, "infinite", difficulty, parsedSeed);
    setCustomSeedInput("");
  };

  const restartRun = () => {
    const restartedRun = runMode === "infinite" ? generateSingleDifficultyRun(seed, infiniteDifficulty) : generateRun(seed);
    beginRun(restartedRun, seed, runMode, infiniteDifficulty, runMode === "infinite" ? infiniteSeedBase : null);
    showToast("Run restarted", "info");
  };

  const giveUpRun = () => {
    if (phase === "menu" || phase === "complete") return;
    setRunOutcome("abandoned");
    setPhase("complete");
    setFinishedAt(Date.now());
    setOpenPanel(null);
    setAdvanceCountdown(null);
    setLiveDragState(null);
    setScoreSubmitted(false);
    setSubmittingScore(false);
    setScoreSubmissionStatus(null);
    playGameOver();
    showToast("Run abandoned", "info");
  };

  const undoPlacement = () => {
    if (phase !== "playing" || advanceCountdown != null) return;
    setDevSolutionPreview(false);
    setPlacements((current) => {
      const next = current.slice(0, -1);
      const removed = current[current.length - 1];
      if (removed) setSelectedDominoId(removed.dominoId);
      return next;
    });
    setRotation(0);
  };

  const advancePuzzle = () => {
    if (!solved) return;
    if (runMode === "infinite") {
      const nextSeed = infiniteSeedBase == null ? makeRunSeed() : infiniteSeedBase + infiniteSolved + 1;
      const nextRun = generateSingleDifficultyRun(nextSeed, infiniteDifficulty);
      setSeed(nextSeed);
      setRun(nextRun);
      setPuzzleIndex(0);
      setPlacements([]);
      setRotation(0);
      setDominoRotations({});
      setPuzzleStartedAt(Date.now());
      setLiveDragState(null);
      setOpenPanel(null);
      clearFlashingDominoes();
      setAdvanceCountdown(null);
      setDevSolutionPreview(false);
      solvedAnnouncedRef.current = "";
      setSelectedDominoId(nextRun.puzzles[0]?.dominoes[0]?.id ?? null);
      showToast(`${difficultyLabel(infiniteDifficulty)} puzzle generated`, "success");
      return;
    }

    if (puzzleIndex < run.puzzles.length - 1) {
      const nextIndex = puzzleIndex + 1;
      goToPuzzle(nextIndex);
      showToast(`${difficultyLabel(run.puzzles[nextIndex]!.difficulty)} unlocked`, "success");
      return;
    }

    setPhase("complete");
    setRunOutcome("completed");
    setFinishedAt(Date.now());
    setOpenPanel(null);
    playGameOver();
    showToast("Run complete", "success");
  };

  advancePuzzleRef.current = advancePuzzle;

  const goToPuzzle = (nextIndex: number) => {
    const nextPuzzle = run.puzzles[nextIndex];
    if (!nextPuzzle) return;
    setPuzzleIndex(nextIndex);
    setPlacements([]);
    setRotation(0);
    setDominoRotations({});
    setPuzzleStartedAt(Date.now());
    setLiveDragState(null);
    setOpenPanel(null);
    clearFlashingDominoes();
    setAdvanceCountdown(null);
    setDevSolutionPreview(false);
    setSelectedDominoId(nextPuzzle.dominoes[0]?.id ?? null);
  };

  const showSolvedPuzzle = () => {
    if (phase !== "playing") return;
    const solution = puzzle.solution.map((placement) => ({ ...placement }));
    setPlacements(solution);
    setDominoRotations(Object.fromEntries(solution.map((placement) => [placement.dominoId, placementToRotation(placement)])));
    setRotation(0);
    setLiveDragState(null);
    setDevSolutionPreview(true);
    clearFlashingDominoes();
    setAdvanceCountdown(null);
    setSelectedDominoId(solution[0]?.dominoId ?? null);
    showToast("Dev solution placed", "info");
  };

  const inspectPuzzle = () => {
    const invalidDominoIds = getInvalidDominoIds(puzzle, placements);
    if (invalidDominoIds.size > 0) {
      flashDominoes(invalidDominoIds);
      showToast(`${invalidDominoIds.size} domino${invalidDominoIds.size === 1 ? "" : "es"} conflict with completed rules`, "info");
      return;
    }

    clearFlashingDominoes();
    if (solved) {
      showToast("Puzzle solved", "success");
      return;
    }

    const unfinishedRules = progress.pendingRegions + progress.unsatisfiedRegions;
    const cellsLeft = Math.max(0, progress.totalCells - progress.coveredCells);
    showToast(`${progress.remainingMoves} move${progress.remainingMoves === 1 ? "" : "s"} left - ${cellsLeft} cell${cellsLeft === 1 ? "" : "s"} open - ${unfinishedRules} rule${unfinishedRules === 1 ? "" : "s"} unfinished`, "info");
  };

  const skipDifficulty = () => {
    if (phase !== "playing") return;
    if (puzzleIndex >= run.puzzles.length - 1) {
      showToast("Already on hard", "info");
      return;
    }
    goToPuzzle(puzzleIndex + 1);
    showToast(`Skipped to ${difficultyLabel(run.puzzles[puzzleIndex + 1]!.difficulty)}`, "info");
  };

  const placeDomino = (domino: PipsDomino, first: PipsCell, second: PipsCell, nextRotation = rotation): boolean => {
    if (phase !== "playing" || advanceCountdown != null) return false;
    if (usedDominoIds.has(domino.id) && movingDominoId !== domino.id) return false;
    if (!areAdjacent(first, second)) return false;
    if (!activeCells.has(cellKey(first)) || !activeCells.has(cellKey(second))) return false;
    const nextPlacement = createPlacementFromCells(domino.id, first, second, nextRotation);
    if (!nextPlacement) return false;
    const firstOccupant = placementByCell.get(cellKey(first));
    const secondOccupant = placementByCell.get(cellKey(second));
    if (firstOccupant && firstOccupant.dominoId !== domino.id) return false;
    if (secondOccupant && secondOccupant.dominoId !== domino.id) return false;

    setPlacements((current) => [
      ...current.filter((placement) => placement.dominoId !== domino.id),
      nextPlacement,
    ]);
    setDevSolutionPreview(false);
    setDominoRotation(domino.id, nextRotation);
    if (movingDominoId === domino.id) {
      setSelectedDominoId(domino.id);
    } else {
      setSelectedDominoId(puzzle.dominoes.find((item) => item.id !== domino.id && !usedDominoIds.has(item.id))?.id ?? domino.id);
    }
    setLiveDragState(null);
    return true;
  };

  const placeDominoFromCell = (domino: PipsDomino, cell: PipsCell, nextRotation = rotation): boolean => {
    for (const offset of DROP_OFFSETS[nextRotation]) {
      const second = { r: cell.r + offset.r, c: cell.c + offset.c };
      if (placeDomino(domino, cell, second, nextRotation)) return true;
    }
    return false;
  };

  const rotatePlacedDomino = (placement: PipsPlacement) => {
    if (phase !== "playing" || advanceCountdown != null) return;
    const nextPlacement = getClockwisePlacement(placement);
    const nextCells = [
      { r: nextPlacement.r1, c: nextPlacement.c1 },
      { r: nextPlacement.r2, c: nextPlacement.c2 },
    ];
    const blocked = nextCells.some((cell) => {
      const occupant = placementByCell.get(cellKey(cell));
      return !isCellInBufferedBoard(cell, puzzle.rows, puzzle.cols) || (occupant && occupant.dominoId !== placement.dominoId);
    });

    setSelectedDominoId(placement.dominoId);
    if (blocked) {
      showToast("No room to rotate there", "info");
      return;
    }

    setDevSolutionPreview(false);
    setPlacements((current) =>
      current.map((item) => (item.dominoId === placement.dominoId ? nextPlacement : item)),
    );
    setDominoRotation(placement.dominoId, placementToRotation(nextPlacement));
  };

  const returnPlacedDomino = (event: MouseEvent<HTMLButtonElement>, placement: PipsPlacement) => {
    event.preventDefault();
    if (phase !== "playing" || advanceCountdown != null) return;
    setDevSolutionPreview(false);
    setPlacements((current) => current.filter((item) => item.dominoId !== placement.dominoId));
    setSelectedDominoId(placement.dominoId);
    setDominoRotation(placement.dominoId, placementToRotation(placement));
  };

  const handleStationaryTrayClick = (domino: PipsDomino, nextClickRotation: Rotation) => {
    if (phase !== "playing" || advanceCountdown != null) return;
    if (usedDominoIds.has(domino.id)) return;
    setDevSolutionPreview(false);
    setSelectedDominoId(domino.id);
    setDominoRotation(domino.id, nextClickRotation);
  };

  const beginTrayDrag = (event: PointerEvent<HTMLButtonElement>, domino: PipsDomino) => {
    if (event.button !== 0) return;
    if (phase !== "playing" || advanceCountdown != null) return;
    if (usedDominoIds.has(domino.id)) {
      return;
    }

    const startRotation = getDominoRotation(domino.id);
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setSelectedDominoId(domino.id);
    setRotation(startRotation);
    setLiveDragState({
      dominoId: domino.id,
      origin: { kind: "tray" },
      rotation: startRotation,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      hasMoved: false,
    });
  };

  const beginBoardDrag = (event: PointerEvent<HTMLButtonElement>, placement: PipsPlacement) => {
    if (event.button !== 0) return;
    if (phase !== "playing" || advanceCountdown != null) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setSelectedDominoId(placement.dominoId);
    setLiveDragState({
      dominoId: placement.dominoId,
      origin: { kind: "board", placement },
      rotation: placementToRotation(placement),
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      hasMoved: false,
    });
  };

  const finishPointerDrag = (event: PointerEvent | globalThis.PointerEvent) => {
    const currentDrag = dragStateRef.current;
    if (!currentDrag) return;

    const distance = Math.hypot(event.clientX - currentDrag.startX, event.clientY - currentDrag.startY);
    const domino = puzzle.dominoes.find((item) => item.id === currentDrag.dominoId);
    const cell = getDropCellFromPoint(event.clientX, event.clientY);
    const isOverTray = Boolean(document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-pips-tray]"));

    if (!domino) {
      setLiveDragState(null);
      return;
    }

    if (distance < 7) {
      if (currentDrag.origin.kind === "board") {
        rotatePlacedDomino(currentDrag.origin.placement);
      } else {
        handleStationaryTrayClick(domino, nextRotation(currentDrag.rotation));
      }
      setLiveDragState(null);
      return;
    }

    if (cell) {
      if (!placeDominoFromCell(domino, cell, currentDrag.rotation)) {
        showToast("That domino does not fit there", "info");
      }
      setLiveDragState(null);
      return;
    }

    if (isOverTray && currentDrag.origin.kind === "board") {
      setDevSolutionPreview(false);
      setPlacements((current) => current.filter((placement) => placement.dominoId !== currentDrag.dominoId));
      setSelectedDominoId(currentDrag.dominoId);
      setDominoRotation(currentDrag.dominoId, currentDrag.rotation);
    }
    setLiveDragState(null);
  };

  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      updateLiveDragState((current) => getDragPositionUpdate(current, event.clientX, event.clientY));
    };
    const handlePointerUp = (event: globalThis.PointerEvent) => finishPointerDrag(event);
    const handlePointerCancel = () => setLiveDragState(null);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [dragState, finishPointerDrag]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("pips-game-state", {
      detail: {
        phase,
        runMode,
        difficulty: puzzle.difficulty,
        puzzleIndex,
        puzzleCount: run.puzzles.length,
        placedCount,
        totalDominoes: puzzle.dominoes.length,
        remainingMoves: progress.remainingMoves,
        solved,
        canLeaderboard: phase === "menu" || phase === "complete",
        canUndo: phase === "playing" && advanceCountdown == null && placements.length > 0,
        showDevTools: SHOW_PIPS_DEV_TOOLS,
        canDevSkip: phase === "playing" && puzzleIndex < run.puzzles.length - 1,
      },
    }));
  }, [phase, runMode, puzzle.difficulty, puzzleIndex, run.puzzles.length, placedCount, puzzle.dominoes.length, progress.remainingMoves, solved, placements.length, advanceCountdown]);

  useEffect(() => {
    const handleUndo = () => undoPlacement();
    const handleRestart = () => restartRun();
    const handleGiveUp = () => giveUpRun();
    const handleLeaderboard = () => {
      if (phase === "playing" || phase === "countdown") {
        showToast("Leaderboard opens when the run is over", "info");
        return;
      }
      setOpenPanel("leaderboard");
    };
    const handleDevSolution = () => showSolvedPuzzle();
    const handleDevSkip = () => skipDifficulty();

    window.addEventListener("pips-undo", handleUndo);
    window.addEventListener("pips-restart-run", handleRestart);
    window.addEventListener("pips-give-up", handleGiveUp);
    window.addEventListener("pips-toggle-leaderboard", handleLeaderboard);
    window.addEventListener("pips-dev-solution", handleDevSolution);
    window.addEventListener("pips-dev-skip", handleDevSkip);
    return () => {
      window.removeEventListener("pips-undo", handleUndo);
      window.removeEventListener("pips-restart-run", handleRestart);
      window.removeEventListener("pips-give-up", handleGiveUp);
      window.removeEventListener("pips-toggle-leaderboard", handleLeaderboard);
      window.removeEventListener("pips-dev-solution", handleDevSolution);
      window.removeEventListener("pips-dev-skip", handleDevSkip);
    };
  }, [undoPlacement, restartRun, giveUpRun, showSolvedPuzzle, skipDifficulty]);

  useEffect(() => {
    if (!solved || phase !== "playing" || devSolutionPreview) return;
    const solvedKey = `${seed}-${puzzleIndex}`;
    if (solvedAnnouncedRef.current === solvedKey) return;
    solvedAnnouncedRef.current = solvedKey;
    const solvedAt = Date.now();
    const solvedMs = getRunScoreTime(solvedAt - puzzleStartedAt);
    if (runMode === "infinite") {
      setInfiniteTimes((current) => [...current, solvedMs]);
      setInfiniteSolved((current) => current + 1);
    } else {
      setRunSplits((current) => {
        if (current[puzzle.difficulty] != null) return current;
        return { ...current, [puzzle.difficulty]: solvedMs };
      });
    }
    if (runMode !== "infinite" && puzzleIndex >= run.puzzles.length - 1) {
      setFinishedAt(solvedAt);
      setRunOutcome("completed");
      setPhase("complete");
      setOpenPanel(null);
      playCorrect();
      playGameOver();
      showToast("Run complete", "success");
      void fetchLeaderboard(1, leaderboardView);
      return;
    }
    setAdvanceCountdown("solved");
    showToast(`${difficultyLabel(puzzle.difficulty)} solved`, "success");
  }, [solved, phase, devSolutionPreview, seed, puzzleIndex, puzzle.difficulty, puzzleStartedAt, run.puzzles.length, runMode, leaderboardView]);

  useEffect(() => {
    if (advanceCountdown == null) return;

    if (advanceCountdown === "solved") {
      playCorrect();
      const timer = window.setTimeout(() => setAdvanceCountdown(3), 850);
      return () => window.clearTimeout(timer);
    }

    if (advanceCountdown <= 0) {
      const timer = window.setTimeout(() => {
        setAdvanceCountdown(null);
        advancePuzzleRef.current();
      }, 450);
      return () => window.clearTimeout(timer);
    }

    playCountdownTick();
    const timer = window.setTimeout(() => {
      setAdvanceCountdown((current) => (typeof current === "number" ? current - 1 : current));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [advanceCountdown]);

  const resolveScoreEligibility = async (): Promise<ScoreSubmissionStatus> => {
    if (!hasAllRankedSplits(runSplits)) {
      return {
        canSubmit: false,
        pending: false,
        tone: "info",
        message: "Only fully completed ranked runs can be submitted.",
      };
    }

    try {
      const identity = await syncSessionIdentity(API_BASE, { allowCreate: true, reason: "pips-eligibility" });
      const activeSessionId = identity.sessionId;
      const activeName = getDisplayName(identity.name, identity.sessionId);
      const res = await fetch(`${API_BASE}/api/pips/score/eligibility`, {
        method: "POST",
        credentials: "include",
        headers: getSessionRequestHeaders(activeSessionId, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          sessionId: activeSessionId,
          name: activeName,
          seed,
          totalMs: getRunSplitTotal(runSplits),
          easyMs: runSplits.easy,
          mediumMs: runSplits.medium,
          hardMs: runSplits.hard,
          puzzleCount: PIPS_DIFFICULTIES.length,
        }),
      });
      const data = await res.json().catch(() => null) as ScoreEligibilityResponse | null;
      if (!res.ok || !data) throw new Error("Eligibility unavailable");
      return {
        canSubmit: Boolean(data.canSubmit),
        pending: false,
        tone: data.canSubmit ? "success" : "info",
        message: data.reason ?? (data.canSubmit ? "This run is verified and ready to submit." : "This run cannot be submitted right now."),
      };
    } catch {
      return {
        canSubmit: false,
        pending: false,
        tone: "error",
        message: "We couldn't verify leaderboard eligibility right now. Check your connection and try again.",
      };
    }
  };

  const submitScore = async () => {
    const nowMs = Date.now();
    if (nowMs - lastSubmitTime.current < 5_000) {
      setScoreSubmissionStatus({
        canSubmit: true,
        pending: false,
        tone: "info",
        message: "Please wait a moment before trying to submit again.",
      });
      return;
    }
    if (submittingScore || scoreSubmitted || !scoreSubmissionStatus?.canSubmit || !hasAllRankedSplits(runSplits)) return;

    setSubmittingScore(true);
    setScoreSubmissionStatus({
      canSubmit: false,
      pending: true,
      tone: "info",
      message: "Submitting verified score!",
    });

    try {
      const identity = await syncSessionIdentity(API_BASE, { allowCreate: true, reason: "pips-submit" });
      const activeSessionId = identity.sessionId;
      const activeName = getDisplayName(identity.name, identity.sessionId);
      const res = await fetch(`${API_BASE}/api/pips/score`, {
        method: "POST",
        credentials: "include",
        headers: getSessionRequestHeaders(activeSessionId, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          sessionId: activeSessionId,
          name: activeName,
          seed,
          totalMs: getRunSplitTotal(runSplits),
          easyMs: runSplits.easy,
          mediumMs: runSplits.medium,
          hardMs: runSplits.hard,
          puzzleCount: PIPS_DIFFICULTIES.length,
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null) as { id?: string | null; reason?: string } | null;
        lastSubmitTime.current = nowMs;
        setScoreSubmitted(true);
        if (data?.id === null) {
          setScoreSubmissionStatus({
            canSubmit: false,
            pending: false,
            tone: "info",
            message: data.reason || "This run was verified, but it did not enter your saved leaderboard runs.",
          });
        } else {
          setScoreSubmissionStatus({
            canSubmit: false,
            pending: false,
            tone: "success",
            message: "Score submitted to the leaderboard.",
          });
        }
        await fetchLeaderboard(1, "all");
        return;
      }

      const data = await res.json().catch(() => null) as { error?: string } | null;
      if (res.status === 409) {
        lastSubmitTime.current = nowMs;
        setScoreSubmitted(true);
        setScoreSubmissionStatus({
          canSubmit: false,
          pending: false,
          tone: "info",
          message: "This run has already been submitted to the leaderboard.",
        });
      } else if (res.status === 403) {
        setScoreSubmissionStatus(await resolveScoreEligibility());
      } else if (res.status === 429) {
        setScoreSubmissionStatus({
          canSubmit: true,
          pending: false,
          tone: "info",
          message: "Too many requests - try again in a moment.",
        });
      } else if (data?.error === "Score rejected") {
        setScoreSubmissionStatus({
          canSubmit: false,
          pending: false,
          tone: "error",
          message: "This run could not be verified by the server.",
        });
      } else {
        setScoreSubmissionStatus({
          canSubmit: true,
          pending: false,
          tone: "error",
          message: data?.error || "Failed to submit score.",
        });
      }
    } catch {
      setScoreSubmissionStatus({
        canSubmit: true,
        pending: false,
        tone: "error",
        message: "Network error - this score was not submitted.",
      });
    } finally {
      setSubmittingScore(false);
    }
  };

  useEffect(() => {
    if (phase !== "complete" || scoreSubmitted) return;

    if (runMode === "infinite") {
      setScoreSubmissionStatus({
        canSubmit: false,
        pending: false,
        tone: "info",
        message: "Infinite mode runs are unranked and cannot be submitted.",
      });
      return;
    }

    if (runMode === "seeded") {
      setScoreSubmissionStatus({
        canSubmit: false,
        pending: false,
        tone: "info",
        message: "Seeded runs are unranked and cannot be submitted.",
      });
      return;
    }

    if (runOutcome !== "completed" || !hasAllRankedSplits(runSplits)) {
      setScoreSubmissionStatus({
        canSubmit: false,
        pending: false,
        tone: "info",
        message: "Only fully completed ranked runs can be submitted.",
      });
      return;
    }

    let cancelled = false;
    setScoreSubmissionStatus({
      canSubmit: false,
      pending: true,
      tone: "info",
      message: "Checking leaderboard eligibility!",
    });
    void resolveScoreEligibility().then((status) => {
      if (!cancelled) setScoreSubmissionStatus(status);
    });
    return () => {
      cancelled = true;
    };
  }, [phase, scoreSubmitted, runMode, runOutcome, runSplits, seed]);

  const leaderboardPanel = openPanel === "leaderboard" ? (
    <PipsLeaderboardPanel
      entries={leaderboardEntries}
      loading={leaderboardLoading}
      currentRun={phase === "complete" && runMode !== "ranked" ? currentLeaderboardEntry : null}
      personalBest={personalBest}
      view={leaderboardView}
      page={leaderboardPage}
      totalPages={leaderboardTotalPages}
      total={leaderboardTotal}
      onClose={() => setOpenPanel(null)}
      onViewChange={(nextView) => {
        setLeaderboardView(nextView);
        setLeaderboardPage(1);
        void fetchLeaderboard(1, nextView);
      }}
      onPageChange={(nextPage) => {
        const safePage = Math.min(Math.max(1, nextPage), Math.max(1, leaderboardTotalPages));
        setLeaderboardPage(safePage);
        void fetchLeaderboard(safePage, leaderboardView);
      }}
    />
  ) : null;

  const howToPanel = openPanel === "how-to" ? (
    <PipsDemo onClose={() => setOpenPanel(null)} />
  ) : null;

  if (phase === "menu") {
    return (
      <>
        <div className="game-page pips-page pips-page--menu" data-game-theme="pips" data-phase={phase}>
          <div className="pips-container pips-container--menu">
            <PipsMenu
              customSeedInput={customSeedInput}
              onDifficultyChange={setMenuDifficulty}
              onSeedChange={setCustomSeedInput}
              onStartRanked={startRankedRun}
              onStartSeeded={startSeededRun}
              onStartInfinite={startInfiniteRun}
              onStartSeededInfinite={startSeededInfiniteRun}
              onOpenLeaderboard={() => setOpenPanel("leaderboard")}
              onOpenHowTo={() => setOpenPanel("how-to")}
            />
          </div>
        </div>
        {leaderboardPanel}
        {howToPanel}
      </>
    );
  }

  if (phase === "countdown") {
    return (
      <>
        <div className="game-page pips-page pips-page--countdown" data-game-theme="pips" data-phase={phase}>
          <div className="pips-container pips-container--countdown">
            <div className="pips-start-countdown">
              <p className="pips-start-countdown-kicker">{runModeLabel(runMode)} Run</p>
              <div className="pips-start-countdown-number" key={countdownNum}>
                {countdownNum > 0 ? countdownNum : "GO!"}
              </div>
              <p className="pips-start-countdown-label">
                {runMode === "infinite"
                  ? `${difficultyLabel(infiniteDifficulty)} forever`
                  : runMode === "seeded"
                    ? `Seed ${seed}`
                    : "Easy, Medium, Hard"}
              </p>
            </div>
          </div>
        </div>
        {leaderboardPanel}
        {howToPanel}
      </>
    );
  }

  if (phase === "complete") {
    return (
      <>
        <div className="game-page pips-page pips-page--complete" data-game-theme="pips" data-phase={phase}>
          <div className="pips-container pips-container--complete">
            <PipsEndScreen
              mode={runMode}
              outcome={runOutcome}
              seed={seed}
              elapsedMs={elapsedMs}
              runSplits={runSplits}
              infiniteDifficulty={infiniteDifficulty}
              infiniteSolved={infiniteSolved}
              infiniteTimes={infiniteTimes}
              leaderboardEntries={finishedLeaderboard.length > 0 ? finishedLeaderboard : leaderboardEntries}
              personalBest={finishedPersonalBest ?? personalBest}
              scoreSubmitted={scoreSubmitted}
              submittingScore={submittingScore}
              scoreSubmissionStatus={scoreSubmissionStatus}
              onSubmitScore={submitScore}
              onPlayAgain={restartRun}
              onNewRanked={startRankedRun}
              onMenu={() => {
                setOpenPanel(null);
                setPhase("menu");
              }}
              onOpenLeaderboard={() => setOpenPanel("leaderboard")}
            />
          </div>
        </div>
        {leaderboardPanel}
        {howToPanel}
      </>
    );
  }

  return (
    <div
      className="game-page pips-page"
      data-game-theme="pips"
      data-phase={phase}
      onPointerMoveCapture={(event) => {
        if (!dragStateRef.current) return;
        updateLiveDragState((current) => getDragPositionUpdate(current, event.clientX, event.clientY));
      }}
      onPointerUpCapture={(event) => finishPointerDrag(event)}
      onPointerCancelCapture={() => setLiveDragState(null)}
    >
      <div
        className="pips-container"
        data-pips-difficulty={puzzle.difficulty}
        style={{ "--pips-rows": boardRows, "--pips-cols": boardCols } as CSSProperties}
      >
        <main className="pips-stage">
          <section className="pips-board-zone" aria-label="Pips board">
            <div className="pips-puzzle-stack">
              <div className="game-header pips-game-header">
                <div className="game-header-left">
                  <h1 className="game-title">Pips</h1>
                  <span className="badge badge-warn" data-tooltip={`Puzzle ${puzzleIndex + 1} of ${run.puzzles.length}`} data-tooltip-variant="info">
                    {puzzleIndex + 1} / {run.puzzles.length} - {difficultyLabel(puzzle.difficulty)}
                  </span>
                  <span className={`badge pips-progress-badge${solved ? " pips-progress-badge--solved" : ""}`} data-tooltip="Puzzle progress" data-tooltip-variant="info">
                    {progress.label}
                  </span>
                  <span className="badge" data-tooltip="Elapsed time" data-tooltip-variant="info" style={{ fontVariantNumeric: "tabular-nums" }}>
                    <FiClock size={12} /> {formatTime(elapsedMs)}
                  </span>
                  <button
                    className="badge pips-seed-badge"
                    data-tooltip="Copy seed"
                    data-tooltip-variant="info"
                    onClick={() => {
                      navigator.clipboard.writeText(String(seed)).then(() => showToast("Seed copied", "info")).catch(() => {});
                    }}
                  >
                    <FiHash size={12} /> {seed}
                  </button>
                </div>
              </div>

              <div className="pips-board-shell">
                <div
                  className="pips-board"
                  style={{
                    gridTemplateColumns: `repeat(${boardCols}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${boardRows}, minmax(0, 1fr))`,
                    "--pips-cols": boardCols,
                    "--pips-rows": boardRows,
                  } as CSSProperties}
                >
                  {gridCells.map((cell) => {
                    const key = cellKey(cell);
                    const isActive = activeCells.has(key);
                    const region = regionByCell.get(key);
                    const color = region ? REGION_COLORS[region.colorIndex % REGION_COLORS.length] : "#6b7280";
                    const canReceiveDrop = isActive && Boolean(selectedDominoId || draggingDominoId) && !placementByCell.has(key);

                    return (
                      <div
                        key={key}
                        data-pips-cell={isActive ? key : undefined}
                        className={`pips-cell${isActive ? "" : " pips-cell--void"}${canReceiveDrop ? " pips-cell--drop" : ""}`}
                        style={
                          {
                            gridColumn: cell.c + BOARD_BUFFER_CELLS + 1,
                            gridRow: cell.r + BOARD_BUFFER_CELLS + 1,
                            "--region-color": color,
                          } as CSSProperties
                        }
                        aria-hidden={!isActive}
                      />
                    );
                  })}

                  {placements.map((placement) => {
                    const domino = puzzle.dominoes.find((item) => item.id === placement.dominoId);
                    if (!domino) return null;
                    return (
                      <BoardDominoTile
                        key={placement.dominoId}
                        domino={domino}
                        placement={placement}
                        selected={selectedDominoId === placement.dominoId}
                        dragging={draggingDominoId === placement.dominoId}
                        flashing={flashingDominoIds.has(placement.dominoId)}
                        onPointerDown={(event) => beginBoardDrag(event, placement)}
                        onContextMenu={(event) => returnPlacedDomino(event, placement)}
                      />
                    );
                  })}

                  {puzzle.regions.map((region) => {
                    const anchor = regionAnchorById.get(region.id);
                    if (!anchor) return null;
                    const color = REGION_COLORS[region.colorIndex % REGION_COLORS.length];
                    return (
                      <span
                        key={region.id}
                        className="pips-constraint-anchor"
                        style={
                          {
                            gridColumn: anchor.c + BOARD_BUFFER_CELLS + 1,
                            gridRow: anchor.r + BOARD_BUFFER_CELLS + 1,
                            "--region-color": color,
                          } as CSSProperties
                        }
                      >
                        <span className={`pips-constraint pips-constraint--${ruleKind(region.rule)}`}>
                          <span>{formatRule(region.rule)}</span>
                        </span>
                      </span>
                    );
                  })}
                </div>
                <button
                  className="pips-puzzle-info-btn"
                  type="button"
                  onClick={inspectPuzzle}
                  data-tooltip="Check puzzle"
                  aria-label="Check puzzle"
                >
                  <FiHelpCircle size={18} />
                </button>
              </div>
            </div>
          </section>

          <aside className="pips-domino-rail" aria-label="Domino collection" data-pips-tray>
            <div className="pips-rail-head">
              <span>{placedCount}</span>
              <span>/</span>
              <span>{puzzle.dominoes.length}</span>
            </div>
            <div className="pips-tray">
              {puzzle.dominoes.map((domino) => {
                const isTrayDragGhost = dragState?.origin.kind === "tray" && dragState.hasMoved && draggingDominoId === domino.id;
                const showPlaceholder = usedDominoIds.has(domino.id) || isTrayDragGhost;

                return (
                  <div className={`pips-tray-slot${showPlaceholder ? " pips-tray-slot--placeholder" : ""}`} key={domino.id}>
                    {showPlaceholder ? (
                      <div className="pips-domino-placeholder" aria-hidden="true">
                        <span />
                        <span />
                      </div>
                    ) : (
                    <DominoTile
                      domino={domino}
                      rotation={getDominoRotation(domino.id)}
                      selected={selectedDominoId === domino.id}
                      dragging={draggingDominoId === domino.id}
                      showRotation
                      onPointerDown={(event) => beginTrayDrag(event, domino)}
                    />
                    )}
                  </div>
                );
              })}
            </div>
          </aside>
        </main>

        {advanceCountdown != null && (
          <div className={`pips-advance-countdown${advanceCountdown === "solved" ? " pips-advance-countdown--solved" : ""}`} aria-live="polite">
            <div className="pips-advance-countdown-number" key={advanceCountdown}>
              {advanceCountdown === "solved" ? (
                <span className="pips-advance-solved">
                  <FiCheck size={54} />
                  Solved!
                </span>
              ) : advanceCountdown > 0 ? advanceCountdown : runMode === "infinite" || puzzleIndex < run.puzzles.length - 1 ? "NEXT!" : "DONE!"}
            </div>
            <p className="pips-advance-countdown-label">
              {advanceCountdown === "solved"
                ? `${difficultyLabel(puzzle.difficulty)} cleared`
                : runMode === "infinite"
                  ? `${difficultyLabel(infiniteDifficulty)} puzzle next`
                  : puzzleIndex < run.puzzles.length - 1
                  ? `${difficultyLabel(run.puzzles[puzzleIndex + 1]!.difficulty)} puzzle next`
                  : "Run complete"}
            </p>
          </div>
        )}

        {dragState?.hasMoved && draggingDomino && (
          <div
            className="pips-drag-preview"
            style={{ left: dragState.x, top: dragState.y } as CSSProperties}
            aria-hidden="true"
          >
            <DominoTile domino={draggingDomino} rotation={dragState.rotation} selected dragging showRotation />
          </div>
        )}

        {leaderboardPanel}
        {howToPanel}
      </div>
    </div>
  );
}

function PipsMenu({
  customSeedInput,
  onDifficultyChange,
  onSeedChange,
  onStartRanked,
  onStartSeeded,
  onStartInfinite,
  onStartSeededInfinite,
  onOpenLeaderboard,
  onOpenHowTo,
}: {
  customSeedInput: string;
  onDifficultyChange: (difficulty: PipsDifficulty) => void;
  onSeedChange: (value: string) => void;
  onStartRanked: () => void;
  onStartSeeded: (difficulty?: PipsDifficulty) => void;
  onStartInfinite: (difficulty: PipsDifficulty) => void;
  onStartSeededInfinite: (difficulty: PipsDifficulty) => void;
  onOpenLeaderboard: () => void;
  onOpenHowTo: () => void;
}) {
  const [menuMode, setMenuMode] = useState<"ranked" | "infinite">("ranked");
  const [showSeedInput, setShowSeedInput] = useState(false);
  const rankedDecorDominoes = useMemo(makeRankedDecorDominoes, []);
  const showDifficultyCards = menuMode === "infinite" || showSeedInput;
  const seedReady = customSeedInput.trim().length > 0;

  return (
    <main className="pips-menu">
      <section className="pips-menu-hero" aria-label="Pips">
        <h1 className="pips-title">Pips</h1>
        <p className="pips-subtitle">Place every domino so each colored region satisfies its rule.</p>
      </section>

      <section className="pips-mode-bar" aria-label="Pips mode">
        <div className="pips-tabs">
          <button
            className={`pips-tab${menuMode === "ranked" ? " pips-tab--active" : ""}`}
            type="button"
            onClick={() => setMenuMode("ranked")}
            data-tooltip="Easy, medium, and hard. Ranked by total time."
            data-tooltip-pos="bottom"
          >
            <FiFlag size={14} />
            Regular
          </button>
          <button
            className={`pips-tab${menuMode === "infinite" ? " pips-tab--active" : ""}`}
            type="button"
            onClick={() => {
              setMenuMode("infinite");
              setShowSeedInput(false);
            }}
            data-tooltip="Endless puzzles at one difficulty, unranked."
            data-tooltip-pos="bottom"
          >
            <FiRepeat size={14} />
            Infinite
          </button>
        </div>
        <button
          className={`pips-seed-toggle${showSeedInput ? " pips-seed-toggle--on" : ""}`}
          type="button"
          onClick={() => {
            setShowSeedInput((value) => !value);
          }}
          data-tooltip={showSeedInput ? "Seeded run on - click to disable" : "Play a specific run seed"}
          data-tooltip-pos="bottom"
          aria-label="Toggle seeded run"
        >
          <FiHash size={16} />
        </button>
      </section>

      {!showDifficultyCards ? (
        <button
          className="pips-ranked-start"
          type="button"
          onClick={onStartRanked}
          data-tooltip="Start the ranked Easy / Medium / Hard run"
          data-tooltip-pos="bottom"
        >
          <span className="pips-ranked-start-text">
            <span className="pips-ranked-start-title">
              <GiDominoTiles className="pips-ranked-start-title-icon" size={22} />
              Start Ranked Run
            </span>
            <span className="pips-ranked-start-copy">Easy / Medium / Hard - fastest total time ranks.</span>
          </span>
          <span className="pips-ranked-start-dominoes" aria-hidden="true">
            {rankedDecorDominoes.map((domino) => (
              <span
                className={`pips-ranked-mini pips-ranked-mini--path-${domino.path}`}
                key={domino.id}
                style={{
                  "--ranked-x": `${domino.left}%`,
                  "--ranked-y": `${domino.top}%`,
                  "--ranked-z": `${domino.z}px`,
                  "--ranked-scale": domino.scale,
                  "--ranked-rotate": `${domino.rotate}deg`,
                  "--ranked-duration": `${domino.duration}s`,
                  "--ranked-delay": `${domino.delay}s`,
                  "--ranked-blur": `${domino.blur}px`,
                  "--ranked-opacity": domino.opacity,
                  "--ranked-hover-opacity": domino.hoverOpacity,
                } as CSSProperties}
              >
                <span><PipFace value={domino.a} /></span>
                <span><PipFace value={domino.b} /></span>
              </span>
            ))}
          </span>
        </button>
      ) : (
        <section className="pips-diff-cards">
          {PIPS_DIFFICULTIES.map((difficulty) => (
            <button
              key={`${menuMode}-${showSeedInput ? "seeded" : "random"}-${difficulty}`}
              className={`pips-diff-card${showSeedInput ? " pips-diff-card--selected" : ""}`}
              data-diff={difficulty}
              type="button"
              onClick={() => {
                onDifficultyChange(difficulty);
                if (showSeedInput) {
                  if (!seedReady) {
                    showToast("Enter a positive seed first", "info");
                    return;
                  }
                  if (menuMode === "infinite") {
                    onStartSeededInfinite(difficulty);
                  } else {
                    onStartSeeded(difficulty);
                  }
                  return;
                }
                onStartInfinite(difficulty);
              }}
              data-tooltip={
                showSeedInput
                  ? menuMode === "infinite"
                    ? `Start seeded infinite ${difficultyLabel(difficulty)}`
                    : `Start seeded ${difficultyLabel(difficulty)} puzzle`
                  : `Start infinite ${difficultyLabel(difficulty)}`
              }
              data-tooltip-pos="bottom"
            >
              <span className="pips-diff-card-size">{difficultyLabel(difficulty)}</span>
              <span className="pips-diff-card-name">{showSeedInput ? (menuMode === "infinite" ? "Seeded ∞" : "Seeded") : "Infinite"}</span>
              <span className="pips-diff-card-play"><FiPlay size={12} /></span>
            </button>
          ))}
        </section>
      )}

      {!showSeedInput && (
        <p className="pips-menu-hint">
          {menuMode === "infinite"
            ? "click a difficulty to start endless puzzles"
            : "one ranked run: easy, medium, then hard"}
        </p>
      )}

      {showSeedInput && (
        <section className="pips-seed-section" aria-label="Seeded run">
          <div className="pips-seed-row">
            <div className="pips-seed-field">
              <FiHash size={14} className="pips-seed-icon" />
              <input
                type="text"
                className="pips-seed-input"
                inputMode="numeric"
                maxLength={9}
                placeholder="Enter seed"
                value={customSeedInput}
                onChange={(event) => onSeedChange(event.target.value.replace(/[^0-9]/g, ""))}
              />
              <button
                className="pips-seed-paste"
                type="button"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    const cleaned = text.replace(/[^0-9]/g, "").slice(0, 9);
                    if (cleaned) onSeedChange(cleaned);
                  } catch {
                    // Clipboard access is optional.
                  }
                }}
                data-tooltip="Paste from clipboard"
                data-tooltip-pos="top"
                aria-label="Paste seed"
              >
                <FiClipboard size={13} />
              </button>
            </div>
          </div>
          <p className="pips-seed-note">
            {menuMode === "infinite" ? "Choose a difficulty to start seeded infinite mode" : "Choose a difficulty to start a seeded puzzle"} - unranked
          </p>
        </section>
      )}

      <div className="pips-menu-links">
        <button className="pips-menu-link" type="button" onClick={onOpenLeaderboard} data-tooltip="View leaderboard" data-tooltip-pos="bottom">
          <FiAward size={14} /> Leaderboard
        </button>
        <button className="pips-menu-link" type="button" onClick={onOpenHowTo} data-tooltip="Learn how to play" data-tooltip-pos="bottom">
          <GiDominoTiles size={14} /> How to Play
        </button>
      </div>
    </main>
  );
}

function PipsEndScreen({
  mode,
  outcome,
  seed,
  elapsedMs,
  runSplits,
  infiniteDifficulty,
  infiniteSolved,
  infiniteTimes,
  leaderboardEntries,
  personalBest,
  scoreSubmitted,
  submittingScore,
  scoreSubmissionStatus,
  onSubmitScore,
  onPlayAgain,
  onNewRanked,
  onMenu,
  onOpenLeaderboard,
}: {
  mode: PipsRunMode;
  outcome: PipsRunOutcome;
  seed: number;
  elapsedMs: number;
  runSplits: PipsRunSplits;
  infiniteDifficulty: PipsDifficulty;
  infiniteSolved: number;
  infiniteTimes: number[];
  leaderboardEntries: PipsLeaderboardEntry[];
  personalBest: PipsPersonalBest | null;
  scoreSubmitted: boolean;
  submittingScore: boolean;
  scoreSubmissionStatus: ScoreSubmissionStatus | null;
  onSubmitScore: () => void;
  onPlayAgain: () => void;
  onNewRanked: () => void;
  onMenu: () => void;
  onOpenLeaderboard: () => void;
}) {
  const completed = outcome === "completed";
  const ranked = mode === "ranked";
  const [endListTab, setEndListTab] = useState<"splits" | "scores">("splits");
  const showSubmitButton = ranked && completed && (
    scoreSubmitted ||
    submittingScore ||
    Boolean(scoreSubmissionStatus?.canSubmit) ||
    Boolean(scoreSubmissionStatus?.pending)
  );
  const statusLabel = scoreSubmissionStatus?.pending
    ? "Verifying"
    : scoreSubmitted
      ? "Submitted"
      : scoreSubmissionStatus?.canSubmit
        ? "Ready"
        : "Status";
  const splitRows = ranked
    ? PIPS_DIFFICULTIES.map((difficulty) => ({ label: difficultyLabel(difficulty), time: runSplits[difficulty] }))
    : mode === "seeded"
      ? PIPS_DIFFICULTIES.filter((difficulty) => runSplits[difficulty] != null)
        .map((difficulty) => ({ label: difficultyLabel(difficulty), time: runSplits[difficulty] }))
    : infiniteTimes.slice(-6).map((time, index) => ({ label: `Puzzle ${Math.max(1, infiniteSolved - infiniteTimes.slice(-6).length + index + 1)}`, time }));
  const topEntries = leaderboardEntries.slice(0, 5);
  const hasSplits = splitRows.length > 0;
  const hasLeaderboard = ranked && topEntries.length > 0;
  const rankedStatus = personalBest
    ? `#${personalBest.rank}`
    : scoreSubmitted
      ? "Submitted"
      : scoreSubmissionStatus?.canSubmit
        ? "Ready"
        : ranked
          ? "Unsubmitted"
          : "Unranked";
  const endTitle = mode === "infinite"
    ? "Infinite Run Over"
    : completed
      ? "Run Complete!"
      : "Run Over";
  const endSub = mode === "infinite"
    ? `Solved ${infiniteSolved} ${difficultyLabel(infiniteDifficulty)} puzzle${infiniteSolved === 1 ? "" : "s"}`
    : mode === "seeded"
      ? completed
        ? `Seed ${seed} - all 3 puzzles solved`
        : `Seed ${seed} - run abandoned`
      : completed
        ? "All 3 puzzles solved"
        : "Run abandoned before every board was cleared";
  const splitListLabel = mode === "infinite" ? "Recent Solves" : "Splits";

  return (
    <main className="pips-end-wrap">
      <div className="pips-finished pips-finished-enter">
        <section className={`pips-end-header ${completed || mode === "infinite" ? "pips-end-header--success" : "pips-end-header--abandoned"}`}>
          <p className="pips-end-title">{endTitle}</p>
          <p className="pips-end-sub">{endSub}</p>
        </section>

        <section className={`pips-end-grid${hasSplits || hasLeaderboard ? "" : " pips-end-grid--stats-only"}`}>
          <div className={`pips-end-stats${mode === "infinite" ? " pips-end-stats--infinite" : ""}`}>
            <div className="pips-end-tile pips-stat-pop" style={{ animationDelay: "0.1s" }}>
              <span className="pips-end-tile-label">Time</span>
              <span className="pips-end-tile-value">{formatTime(elapsedMs)}</span>
            </div>
            <div className="pips-end-tile pips-stat-pop" style={{ animationDelay: "0.2s" }}>
              <span className="pips-end-tile-label">{mode === "infinite" ? "Puzzles" : "Status"}</span>
              <span className="pips-end-tile-value">
                {mode === "infinite" ? infiniteSolved : rankedStatus}
                {mode !== "ranked" && <span className="pips-end-unranked">(unranked)</span>}
              </span>
            </div>
            <div className="pips-end-tile pips-stat-pop" style={{ animationDelay: "0.3s" }}>
              <span className="pips-end-tile-label">Mode</span>
              <span className="pips-end-tile-value">{runModeLabel(mode)}</span>
            </div>
            {personalBest && ranked && (
              <div className="pips-end-tile pips-end-tile--accent pips-stat-pop" style={{ animationDelay: "0.36s" }}>
                <span className="pips-end-tile-label">Rank</span>
                <span className="pips-end-tile-value">#{personalBest.rank}</span>
              </div>
            )}
            <div className="pips-end-tile pips-end-tile--seed pips-stat-pop" style={{ animationDelay: "0.42s" }}>
              <button
                className="pips-seed-copy-btn"
                type="button"
                onClick={() => navigator.clipboard.writeText(String(seed)).then(() => showToast("Seed copied", "info")).catch(() => undefined)}
                aria-label="Copy seed"
                data-tooltip="Copy seed"
              >
                <FiHash size={12} />
              </button>
              <span className="pips-end-tile-label">Seed</span>
              <span className="pips-end-tile-value">{seed}</span>
            </div>
          </div>

          {(hasSplits || hasLeaderboard) && (
            <section className="pips-end-list-tile">
              {hasSplits && hasLeaderboard ? (
                <div className="pips-end-tab-bar">
                  <button
                    className={`pips-end-tab${endListTab === "splits" ? " pips-end-tab--active" : ""}`}
                    type="button"
                    onClick={() => setEndListTab("splits")}
                  >
                    <FiClock size={12} /> {splitListLabel}
                  </button>
                  <button
                    className={`pips-end-tab${endListTab === "scores" ? " pips-end-tab--active" : ""}`}
                    type="button"
                    onClick={() => setEndListTab("scores")}
                  >
                    <FiAward size={12} /> Top Times
                  </button>
                </div>
              ) : (
                <div className="pips-end-list-header">
                  <span>{hasLeaderboard ? <><FiAward size={12} /> Top Times</> : splitListLabel}</span>
                  <span>Time</span>
                </div>
              )}

              <div className="pips-end-list-body">
                {(endListTab === "splits" || !hasLeaderboard) && hasSplits && (
                  splitRows.map((row) => (
                    <div className="pips-end-list-row" key={row.label}>
                      <span>{row.label}</span>
                      <span>{formatSplitTime(row.time)}</span>
                    </div>
                  ))
                )}

                {(endListTab === "scores" || !hasSplits) && hasLeaderboard && (
                  topEntries.map((entry, index) => (
                    <div className={`pips-end-list-row${entry.isOwn ? " pips-end-list-row--self" : ""}`} key={entry.id}>
                      <span>#{index + 1} {entry.name}</span>
                      <span>{formatTime(entry.totalMs)}</span>
                    </div>
                  ))
                )}

                {!hasSplits && !hasLeaderboard && (
                  <div className="pips-end-list-empty">No solved puzzles yet</div>
                )}
              </div>
            </section>
          )}
        </section>

        <div className="pips-end-actions">
          {showSubmitButton && (
            <button
              className={`btn ${scoreSubmitted ? "btn-muted" : "btn-primary"} game-action-btn`}
              type="button"
              onClick={onSubmitScore}
              disabled={scoreSubmitted || submittingScore || scoreSubmissionStatus?.pending}
              data-tooltip={scoreSubmitted ? "Score already submitted" : "Submit your verified Pips run"}
            >
              {submittingScore ? (
                <>Submitting...</>
              ) : scoreSubmitted ? (
                <><FiCheck size={16} /> Submitted</>
              ) : (
                <><FiUploadCloud size={16} /> Submit Score</>
              )}
            </button>
          )}
          <button className="btn btn-primary game-action-btn" type="button" onClick={onPlayAgain}>
            <FiRefreshCw size={16} /> Play Again
          </button>
          <button className="btn btn-muted game-action-btn" type="button" onClick={onNewRanked}>
            <FiFlag size={16} /> New Ranked
          </button>
          <button className="btn btn-muted" type="button" onClick={onMenu}>
            Menu
          </button>
          <button className="btn btn-muted game-action-btn" type="button" onClick={onOpenLeaderboard}>
            <FiAward size={16} /> Leaderboard
          </button>
        </div>

        {scoreSubmissionStatus && (
          <div className={`pips-end-status pips-end-status--${scoreSubmissionStatus.tone}${scoreSubmissionStatus.pending ? " pips-end-status--pending" : ""}`}>
            <span className="pips-end-status-label">{statusLabel}</span>
            <p className="pips-end-status-message">{scoreSubmissionStatus.message}</p>
          </div>
        )}
      </div>
    </main>
  );
}

function DominoTile({
  domino,
  rotation,
  selected,
  dragging,
  showRotation,
  onPointerDown,
}: {
  domino: PipsDomino;
  rotation: Rotation;
  selected?: boolean;
  dragging?: boolean;
  showRotation?: boolean;
  onPointerDown?: (event: PointerEvent<HTMLButtonElement>) => void;
}) {
  const first = showRotation || rotation < 2 ? domino.a : domino.b;
  const second = showRotation || rotation < 2 ? domino.b : domino.a;

  return (
    <button
      type="button"
      className={`pips-domino${showRotation ? " pips-domino--show-rotation" : ""}${rotation !== 0 ? " pips-domino--rotated" : ""}${selected ? " pips-domino--selected" : ""}${dragging ? " pips-domino--dragging" : ""}`}
      data-rotation={rotation}
      onPointerDown={onPointerDown}
      aria-label={`Domino ${domino.a}-${domino.b}`}
    >
      <span className="pips-domino-half">
        <PipFace value={first} />
      </span>
      <span className="pips-domino-half">
        <PipFace value={second} />
      </span>
    </button>
  );
}

function BoardDominoTile({
  domino,
  placement,
  selected,
  dragging,
  flashing,
  onPointerDown,
  onContextMenu,
}: {
  domino: PipsDomino;
  placement: PipsPlacement;
  selected?: boolean;
  dragging?: boolean;
  flashing?: boolean;
  onPointerDown?: (event: PointerEvent<HTMLButtonElement>) => void;
  onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const values = getPlacementDisplayValues(domino, placement);
  const vertical = placement.c1 === placement.c2;

  return (
    <button
      type="button"
      className={`pips-domino pips-board-domino${vertical ? " pips-domino--vertical" : ""}${selected ? " pips-domino--selected" : ""}${dragging ? " pips-domino--dragging" : ""}${flashing ? " pips-domino--flash" : ""}`}
      style={getBoardDominoStyle(placement)}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
      aria-label={`Placed domino ${domino.a}-${domino.b}`}
    >
      <span className="pips-domino-half">
        <PipFace value={values.first} />
      </span>
      <span className="pips-domino-half">
        <PipFace value={values.second} />
      </span>
    </button>
  );
}

function PipFace({ value }: { value: number }) {
  return (
    <span className={`pips-face pips-face--${value}`} aria-label={`${value} pips`}>
      {Array.from({ length: value }, (_, index) => (
        <span key={index} className="pips-dot" />
      ))}
    </span>
  );
}

function PipsLeaderboardPanel({
  onClose,
  entries,
  currentRun,
  loading,
  personalBest,
  view,
  page,
  totalPages,
  total,
  onViewChange,
  onPageChange,
}: {
  onClose: () => void;
  entries: PipsLeaderboardEntry[];
  currentRun?: PipsLeaderboardEntry | null;
  loading: boolean;
  personalBest: PipsPersonalBest | null;
  view: PipsLeaderboardView;
  page: number;
  totalPages: number;
  total: number;
  onViewChange: (view: PipsLeaderboardView) => void;
  onPageChange: (page: number) => void;
}) {
  const leaderboardRows = useMemo(
    () => currentRun ? sortPipsLeaderboardEntries([currentRun, ...entries]).slice(0, PIPS_LEADERBOARD_PAGE_SIZE) : entries,
    [currentRun, entries],
  );
  const ownEntry = leaderboardRows.find((entry) => entry.isOwn);
  const pageBaseRank = currentRun ? 0 : (page - 1) * PIPS_LEADERBOARD_PAGE_SIZE;
  const ownRank = ownEntry ? pageBaseRank + leaderboardRows.findIndex((entry) => entry.id === ownEntry.id) + 1 : personalBest?.rank ?? 0;
  const personalBestTime = ownEntry?.totalMs ?? personalBest?.totalMs;
  const fastestRun = ownEntry ?? personalBest;

  return (
    <div
      className="pips-panel-overlay"
      role="presentation"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      onWheel={(event) => event.stopPropagation()}
    >
      <section className="pips-panel pips-panel--leaderboard" role="dialog" aria-modal="true" aria-label="Pips leaderboard">
        <div className="pips-panel-head">
          <h2><FiAward size={16} /> Leaderboard</h2>
          <button className="pips-panel-close" type="button" onClick={onClose} aria-label="Close">
            <FiX size={18} />
          </button>
        </div>

        {fastestRun && personalBestTime != null && (
          <div className="pips-lb-current">
            <div>
              <span className="pips-lb-current-label">{ownEntry ? "This Run" : "Your Best"}</span>
              <strong>#{ownRank} / {formatTime(personalBestTime)}</strong>
            </div>
            <div className="pips-lb-current-splits" aria-label="Your split times">
              <span>Easy <strong>{formatSplitTime(fastestRun.easyMs)}</strong></span>
              <span>Medium <strong>{formatSplitTime(fastestRun.mediumMs)}</strong></span>
              <span>Hard <strong>{formatSplitTime(fastestRun.hardMs)}</strong></span>
              {fastestRun.seed != null && <span>Seed <strong>{fastestRun.seed}</strong></span>}
            </div>
          </div>
        )}

        <div className="pips-lb-toolbar">
          <div className="pips-lb-view-toggle" role="group" aria-label="Leaderboard view">
            <button
              className={`pips-lb-view-btn${view === "all" ? " pips-lb-view-btn--active" : ""}`}
              type="button"
              onClick={() => onViewChange("all")}
            >
              All
            </button>
            <button
              className={`pips-lb-view-btn${view === "mine" ? " pips-lb-view-btn--active" : ""}`}
              type="button"
              onClick={() => onViewChange("mine")}
            >
              Mine
            </button>
          </div>
          <span className="pips-lb-count">{total.toLocaleString()} run{total === 1 ? "" : "s"}</span>
        </div>

        <div className="pips-lb-table">
          <div className="pips-lb-col-header" aria-hidden="true">
            <span>Rank</span>
            <span>Player</span>
            <span>Total</span>
            <span>Easy</span>
            <span>Medium</span>
            <span>Hard</span>
            <span>Seed</span>
          </div>
          {loading ? (
            <div className="pips-lb-spinner-wrap">
              <span className="pips-lb-spinner" />
              <span className="pips-lb-spinner-text">Loading leaderboard</span>
            </div>
          ) : leaderboardRows.length === 0 ? (
            <div className="pips-lb-empty-stable">
              {view === "mine" ? "No submitted Pips runs yet." : "No leaderboard runs yet."}
            </div>
          ) : (
            <div className="pips-lb-list">
              {leaderboardRows.map((entry, index) => {
                const rank = pageBaseRank + index + 1;
                return (
                  <div
                    className={`pips-lb-row${rank <= 3 ? ` pips-lb-row--top${rank}` : ""}${entry.isOwn ? " pips-lb-row--self" : ""}`}
                    key={entry.id}
                  >
                    <span className="pips-lb-rank">#{rank}</span>
                    <span className="pips-lb-player">
                      <span className="pips-lb-name">{entry.name}</span>
                      {entry.isOwn && <span className="pips-lb-badge">You</span>}
                    </span>
                    <span className="pips-lb-total">{formatTime(entry.totalMs)}</span>
                    <span className="pips-lb-split">{formatSplitTime(entry.easyMs)}</span>
                    <span className="pips-lb-split">{formatSplitTime(entry.mediumMs)}</span>
                    <span className="pips-lb-split">{formatSplitTime(entry.hardMs)}</span>
                    <span className="pips-lb-seed">
                      <button
                        className="pips-lb-seed-copy"
                        type="button"
                        onClick={() => navigator.clipboard.writeText(String(entry.seed)).then(() => showToast("Seed copied", "info")).catch(() => undefined)}
                        data-tooltip="Copy seed"
                        aria-label={`Copy seed ${entry.seed}`}
                      >
                        <FiCopy size={11} />
                      </button>
                      {entry.seed}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="pips-lb-pagination">
          <button type="button" onClick={() => onPageChange(page - 1)} disabled={loading || page <= 1}>
            Prev
          </button>
          <span>Page {page} / {Math.max(1, totalPages)}</span>
          <button type="button" onClick={() => onPageChange(page + 1)} disabled={loading || page >= totalPages}>
            Next
          </button>
        </div>
      </section>
    </div>
  );
}

function makePipsLeaderboardEntry(
  id: string,
  name: string,
  seed: number,
  easyMs: number,
  mediumMs: number,
  hardMs: number,
): PipsLeaderboardEntry {
  return {
    id,
    name,
    seed,
    easyMs,
    mediumMs,
    hardMs,
    totalMs: easyMs + mediumMs + hardMs,
  };
}

function makeCurrentPipsLeaderboardEntry(
  name: string,
  seed: number,
  runSplits: PipsRunSplits,
  elapsedMs: number,
  id = "current-run",
): PipsLeaderboardEntry {
  const splitTotal = getRunSplitTotal(runSplits);
  const currentRun: PipsLeaderboardEntry = {
    id,
    name,
    seed,
    totalMs: splitTotal > 0 ? splitTotal : elapsedMs,
    isOwn: true,
  };
  if (runSplits.easy != null) currentRun.easyMs = runSplits.easy;
  if (runSplits.medium != null) currentRun.mediumMs = runSplits.medium;
  if (runSplits.hard != null) currentRun.hardMs = runSplits.hard;
  return currentRun;
}

function normalizePipsLeaderboardEntry(entry: Partial<PipsLeaderboardEntry> | null | undefined): PipsLeaderboardEntry | null {
  if (!entry || !entry.id || !entry.name || !Number.isFinite(entry.seed) || !Number.isFinite(entry.totalMs)) return null;
  const normalized: PipsLeaderboardEntry = {
    id: String(entry.id),
    name: String(entry.name),
    seed: Number(entry.seed),
    totalMs: getRunScoreTime(Number(entry.totalMs)),
    isOwn: Boolean(entry.isOwn),
  };
  if (Number.isFinite(entry.easyMs)) normalized.easyMs = getRunScoreTime(Number(entry.easyMs));
  if (Number.isFinite(entry.mediumMs)) normalized.mediumMs = getRunScoreTime(Number(entry.mediumMs));
  if (Number.isFinite(entry.hardMs)) normalized.hardMs = getRunScoreTime(Number(entry.hardMs));
  if (Number.isFinite(entry.createdAt)) normalized.createdAt = Number(entry.createdAt);
  return normalized;
}

function sortPipsLeaderboardEntries(entries: PipsLeaderboardEntry[]): PipsLeaderboardEntry[] {
  return [...entries].sort((a, b) => a.totalMs - b.totalMs || a.name.localeCompare(b.name));
}

function hasAllRankedSplits(runSplits: PipsRunSplits): runSplits is Required<PipsRunSplits> {
  return runSplits.easy != null && runSplits.medium != null && runSplits.hard != null;
}

function getRunSplitTotal(runSplits: PipsRunSplits): number {
  return getRunScoreTime((runSplits.easy ?? 0) + (runSplits.medium ?? 0) + (runSplits.hard ?? 0));
}

function formatSplitTime(ms: number | undefined): string {
  return ms == null ? "--" : formatTime(ms);
}

function makeRankedDecorDominoes(): PipsRankedDecorDomino[] {
  return Array.from({ length: PIPS_RANKED_DECOR_COUNT }, (_, index) => {
    const scale = randomBetween(0.38, 1.08);
    const distance = Math.max(0, 1 - scale);
    const opacity = randomBetween(0.42, 0.92) - distance * 0.22;
    return {
      id: `ranked-decor-${index}-${Math.round(Math.random() * 100000)}`,
      left: randomBetween(-3, 103),
      top: randomBetween(-8, 108),
      z: randomBetween(-80, 90),
      scale,
      rotate: randomBetween(-34, 34) + (index % 4 === 0 ? 90 : 0),
      duration: randomBetween(4.6, 8.8),
      delay: randomBetween(-7.5, 0),
      blur: randomBetween(distance * 0.6, distance * 2.2),
      opacity,
      hoverOpacity: Math.max(0.16, opacity * 0.48),
      a: Math.floor(randomBetween(0, 7)),
      b: Math.floor(randomBetween(0, 7)),
      path: ((index % 4) + 1) as PipsRankedDecorDomino["path"],
    };
  });
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function makeRunSeed(): number {
  return Math.floor(100000 + Math.random() * 900000);
}

function generateSingleDifficultyRun(seed: number, difficulty: PipsDifficulty): PipsPuzzleRun {
  const generated = generateRun(seed);
  const puzzle = generated.puzzles.find((item) => item.difficulty === difficulty) ?? generated.puzzles[0]!;
  return {
    seed,
    puzzles: [puzzle],
  };
}

function difficultyLabel(difficulty: PipsDifficulty): string {
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}

function runModeLabel(mode: PipsRunMode): string {
  if (mode === "ranked") return "Ranked";
  if (mode === "seeded") return "Seeded";
  return "Infinite";
}

function formatRule(rule: PipsRegionRule): string {
  if (rule.type === "sum") return String(rule.target);
  if (rule.type === "greaterThan") return `>${rule.target}`;
  if (rule.type === "lessThan") return `<${rule.target}`;
  if (rule.type === "equal") return "=";
  return "!=";
}

function ruleKind(rule: PipsRegionRule): string {
  if (rule.type === "sum") return "sum";
  if (rule.type === "greaterThan") return "gt";
  if (rule.type === "lessThan") return "lt";
  if (rule.type === "equal") return "eq";
  return "diff";
}

function formatTime(ms: number): string {
  const safeMs = Math.max(0, ms);
  const minutes = Math.floor(safeMs / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  const tenths = Math.floor((safeMs % 1000) / 100);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

function getPuzzleProgress(puzzle: PipsPuzzle, placements: PipsPlacement[], solved: boolean): PipsProgress {
  const valueGrid = getPlacementValueGrid(puzzle, placements);
  const coveredCells = new Set(
    placements.flatMap((placement) => [
      cellKey({ r: placement.r1, c: placement.c1 }),
      cellKey({ r: placement.r2, c: placement.c2 }),
    ]),
  ).size;
  let completedRegions = 0;
  let satisfiedRegions = 0;
  let unsatisfiedRegions = 0;

  for (const region of puzzle.regions) {
    const values = valueGrid
      ? region.cells
          .map((cell) => valueGrid.get(cellKey(cell)))
          .filter((value): value is number => value != null)
      : [];
    if (values.length !== region.cells.length) continue;
    completedRegions++;
    if (evaluateRegionRule(region.rule, values)) {
      satisfiedRegions++;
    } else {
      unsatisfiedRegions++;
    }
  }

  const remainingMoves = Math.max(0, puzzle.dominoes.length - placements.length);
  return {
    label: solved ? "Solved" : `${remainingMoves} move${remainingMoves === 1 ? "" : "s"} left`,
    placedCount: placements.length,
    totalDominoes: puzzle.dominoes.length,
    remainingMoves,
    coveredCells,
    totalCells: puzzle.cells.length,
    completedRegions,
    satisfiedRegions,
    totalRegions: puzzle.regions.length,
    pendingRegions: puzzle.regions.length - completedRegions,
    unsatisfiedRegions,
    solved,
  };
}

function getInvalidDominoIds(puzzle: PipsPuzzle, placements: PipsPlacement[]): Set<string> {
  const valueGrid = getPlacementValueGrid(puzzle, placements);
  const placementByCell = buildPlacementByCell(placements);
  const invalidDominoIds = new Set<string>();
  const activeCells = new Set(puzzle.cells.map(cellKey));
  const usedCells = new Set<string>();

  for (const placement of placements) {
    const first = { r: placement.r1, c: placement.c1 };
    const second = { r: placement.r2, c: placement.c2 };
    const firstKey = cellKey(first);
    const secondKey = cellKey(second);
    if (!areAdjacent(first, second) || !activeCells.has(firstKey) || !activeCells.has(secondKey) || usedCells.has(firstKey) || usedCells.has(secondKey)) {
      invalidDominoIds.add(placement.dominoId);
    }
    usedCells.add(firstKey);
    usedCells.add(secondKey);
  }

  if (!valueGrid) return invalidDominoIds;

  for (const region of puzzle.regions) {
    const values = region.cells
      .map((cell) => valueGrid.get(cellKey(cell)))
      .filter((value): value is number => value != null);
    if (values.length !== region.cells.length || evaluateRegionRule(region.rule, values)) continue;

    for (const cell of region.cells) {
      const placement = placementByCell.get(cellKey(cell));
      if (placement) invalidDominoIds.add(placement.dominoId);
    }
  }

  return invalidDominoIds;
}

function makeBufferedGridCells(rows: number, cols: number, buffer: number): PipsCell[] {
  const boardRows = rows + buffer * 2;
  const boardCols = cols + buffer * 2;
  return Array.from({ length: boardRows * boardCols }, (_, index) => ({
    r: Math.floor(index / boardCols) - buffer,
    c: (index % boardCols) - buffer,
  }));
}

function buildPlacementByCell(placements: PipsPlacement[]): Map<string, PipsPlacement> {
  const map = new Map<string, PipsPlacement>();
  placements.forEach((placement) => {
    map.set(cellKey({ r: placement.r1, c: placement.c1 }), placement);
    map.set(cellKey({ r: placement.r2, c: placement.c2 }), placement);
  });
  return map;
}

function buildRegionByCell(regions: PipsRegion[]): Map<string, PipsRegion> {
  const map = new Map<string, PipsRegion>();
  regions.forEach((region) => {
    region.cells.forEach((cell) => map.set(cellKey(cell), region));
  });
  return map;
}

function buildRegionAnchors(regions: PipsRegion[]): Map<string, PipsCell> {
  const map = new Map<string, PipsCell>();
  regions.forEach((region) => {
    const anchor = [...region.cells].sort((a, b) => b.c - a.c || b.r - a.r)[0]!;
    map.set(region.id, anchor);
  });
  return map;
}

function getPlacementDisplayValues(domino: PipsDomino, placement: PipsPlacement): { first: number; second: number } {
  const firstCell = { r: placement.r1, c: placement.c1 };
  const secondCell = { r: placement.r2, c: placement.c2 };
  const firstValue = placement.flipped ? domino.b : domino.a;
  const secondValue = placement.flipped ? domino.a : domino.b;
  const visualFirst =
    placement.r1 === placement.r2
      ? placement.c1 < placement.c2
        ? firstCell
        : secondCell
      : placement.r1 < placement.r2
        ? firstCell
        : secondCell;

  if (cellKey(visualFirst) === cellKey(firstCell)) {
    return { first: firstValue, second: secondValue };
  }
  return { first: secondValue, second: firstValue };
}

function getBoardDominoStyle(placement: PipsPlacement): CSSProperties {
  const rowStart = Math.min(placement.r1, placement.r2) + BOARD_BUFFER_CELLS + 1;
  const colStart = Math.min(placement.c1, placement.c2) + BOARD_BUFFER_CELLS + 1;
  const vertical = placement.c1 === placement.c2;

  return {
    gridRow: vertical ? `${rowStart} / span 2` : rowStart,
    gridColumn: vertical ? colStart : `${colStart} / span 2`,
  };
}

function isCellInBufferedBoard(cell: PipsCell, rows: number, cols: number): boolean {
  return (
    cell.r >= -BOARD_BUFFER_CELLS &&
    cell.c >= -BOARD_BUFFER_CELLS &&
    cell.r < rows + BOARD_BUFFER_CELLS &&
    cell.c < cols + BOARD_BUFFER_CELLS
  );
}

function getClockwisePlacement(placement: PipsPlacement): PipsPlacement {
  const next = nextRotation(placementToRotation(placement));
  const nextDirection = ROTATION_DIRECTIONS[next];
  const anchor = { r: placement.r1, c: placement.c1 };
  const second = {
    r: anchor.r + nextDirection.r,
    c: anchor.c + nextDirection.c,
  };

  return createPlacementFromCells(placement.dominoId, anchor, second, next) ?? placement;
}

function placementToRotation(placement: PipsPlacement): Rotation {
  const horizontal = placement.r1 === placement.r2;
  const visualFirstIsFirstCell = horizontal ? placement.c1 < placement.c2 : placement.r1 < placement.r2;
  const aAtVisualFirst = visualFirstIsFirstCell ? !placement.flipped : placement.flipped;

  if (horizontal) return aAtVisualFirst ? 0 : 2;
  return aAtVisualFirst ? 1 : 3;
}

function createPlacementFromCells(dominoId: string, first: PipsCell, second: PipsCell, rotation: Rotation): PipsPlacement | null {
  if (!areAdjacent(first, second)) return null;
  const horizontal = first.r === second.r;
  if (horizontal !== (rotation === 0 || rotation === 2)) return null;

  const visualFirst =
    horizontal
      ? first.c < second.c
        ? first
        : second
      : first.r < second.r
        ? first
        : second;
  const visualSecond = cellKey(visualFirst) === cellKey(first) ? second : first;

  return {
    dominoId,
    r1: visualFirst.r,
    c1: visualFirst.c,
    r2: visualSecond.r,
    c2: visualSecond.c,
    flipped: rotation >= 2,
  };
}

function nextRotation(rotation: Rotation): Rotation {
  return ((rotation + 1) % 4) as Rotation;
}

function getDropCellFromPoint(clientX: number, clientY: number): PipsCell | null {
  const target = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-pips-cell]");
  const rawCell = target?.dataset.pipsCell;
  if (!rawCell) return null;
  return parseCellKey(rawCell);
}

function cellKey(cell: PipsCell): string {
  return `${cell.r},${cell.c}`;
}

function parseCellKey(key: string): PipsCell {
  const [r, c] = key.split(",").map(Number);
  return { r: r ?? 0, c: c ?? 0 };
}

function areAdjacent(a: PipsCell, b: PipsCell): boolean {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

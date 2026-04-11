import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { FiAward, FiCheck, FiChevronDown, FiChevronLeft, FiChevronRight, FiChevronUp, FiClipboard, FiClock, FiCopy, FiCornerUpLeft, FiFlag, FiGrid, FiHash, FiHelpCircle, FiPlay, FiRepeat, FiTrash2, FiUploadCloud, FiX } from "react-icons/fi";
import { ShikakuLeaderboard, LeaderboardEntry, LeaderboardView, PersonalBest } from "../components/ShikakuLeaderboard";
import {
  calculateScore,
  Difficulty,
  DIFFICULTY_CONFIG,
  getAutoFilledRects,
  generatePuzzle,
  generateRun,
  mulberry32,
  PlacedRect,
  PUZZLES_PER_RUN,
  Rect,
  ShikakuPuzzle,
  validateSolution,
} from "../lib/shikaku-engine";
import { getOrCreateSessionId, getSessionRequestHeaders, syncSessionIdentity } from "../lib/session";
import { showToast } from "../lib/toast";
import "../styles/game-shared.css";
import "../styles/shikaku.css";
import { ShikakuDemo } from "../components/demos/ShikakuDemo";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/* ── Max play time: 1hr base + 30min per difficulty tier ──── */
const MAX_TIME_MS: Record<Difficulty, number> = {
  easy:   3_600_000,
  medium: 3_600_000 + 1_800_000,
  hard:   3_600_000 + 3_600_000,
  expert: 3_600_000 + 5_400_000,
};

/* ── Palette for rectangles ───────────────────────────────── */
const RECT_COLORS = [
  "#34d399", "#60a5fa", "#f472b6", "#a78bfa", "#fb923c",
  "#facc15", "#4ade80", "#38bdf8", "#f87171", "#c084fc",
  "#2dd4bf", "#fbbf24", "#818cf8", "#e879f9", "#22d3ee",
  "#a3e635", "#fb7185", "#fdba74", "#86efac", "#93c5fd",
];

function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const fullHex = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;
  const red = Number.parseInt(fullHex.slice(0, 2), 16);
  const green = Number.parseInt(fullHex.slice(2, 4), 16);
  const blue = Number.parseInt(fullHex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

type GamePhase = "menu" | "generating" | "countdown" | "playing" | "puzzle-complete" | "finished";

type ScoreStatusTone = "info" | "success" | "error";

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

/* ═══════════════════════════════════════════════════════════ */
/*  ShikakuPage                                               */
/* ═══════════════════════════════════════════════════════════ */
export function ShikakuPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [phase, setPhase] = useState<GamePhase>("menu");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [lbDifficulty, setLbDifficulty] = useState<Difficulty>("easy");
  const [lbView, setLbView] = useState<LeaderboardView>("all");
  const [countdownNum, setCountdownNum] = useState(3);

  // Game state
  const [seed, setSeed] = useState<number>(0);
  const [puzzles, setPuzzles] = useState<ShikakuPuzzle[]>([]);
  const [currentPuzzleIdx, setCurrentPuzzleIdx] = useState(0);
  const [placedRects, setPlacedRects] = useState<PlacedRect[]>([]);
  const [colorCounter, setColorCounter] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [puzzleTimes, setPuzzleTimes] = useState<number[]>([]);
  const [puzzleStartTime, setPuzzleStartTime] = useState(0);

  // Drag state
  const [dragStart, setDragStart] = useState<{ r: number; c: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ r: number; c: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Refs mirror drag state synchronously so native touch handlers always see current values
  // (React may not re-render between touchstart→touchmove→touchend)
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ r: number; c: number } | null>(null);
  const dragEndRef = useRef<{ r: number; c: number } | null>(null);

  // Flash invalid rects
  const [flashingRects, setFlashingRects] = useState<Set<number>>(new Set());

  // Undo stack
  const [undoStack, setUndoStack] = useState<PlacedRect[][]>([]);

  // Give-up confirmation
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);

  // Scroll API from grid wrapper (for expert scroll buttons in footer)
  const [scrollApi, setScrollApi] = useState<ScrollApi | null>(null);
  const handleScrollApi = useCallback((api: ScrollApi) => setScrollApi(api), []);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [personalBest, setPersonalBest] = useState<PersonalBest | null>(null);
  const [endListTab, setEndListTab] = useState<"times" | "scores">("times");
  // Snapshot of leaderboard at game finish — immune to modal tab changes
  const [finishedLeaderboard, setFinishedLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [finishedPersonalBest, setFinishedPersonalBest] = useState<PersonalBest | null>(null);
  const finishedLbSnapshotted = useRef(false);

  // Final score
  const [finalScore, setFinalScore] = useState(0);
  const [finalTimeMs, setFinalTimeMs] = useState(0);

  // Score submission state
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const [submittingScore, setSubmittingScore] = useState(false);
  const [scoreSubmissionStatus, setScoreSubmissionStatus] = useState<ScoreSubmissionStatus | null>(null);
  const lastSubmitTime = useRef(0);

  // Completion animation
  const [showPuzzleSolvedAnim, setShowPuzzleSolvedAnim] = useState(false);

  // Infinite mode
  const [infiniteMode, setInfiniteMode] = useState(false);
  const [infiniteSolved, setInfiniteSolved] = useState(0);
  const infiniteRng = useRef<(() => number) | null>(null);

  // Custom seed mode
  const [customMode, setCustomMode] = useState(false);
  const [customSeedInput, setCustomSeedInput] = useState("");
  const [showSeedInput, setShowSeedInput] = useState(false);

  // Challenge mode — single puzzle from puzzle image page play button
  const [challengeMode, setChallengeMode] = useState(false);

  // Pause tracking — freeze timer during solved animation (non-abusable, system-controlled only)
  const pausedMsRef = useRef(0);
  const pauseStartRef = useRef<number | null>(null);

  // Debug mode — enable via browser console: window.shikakuDebug(true)
  const debugRef = useRef(false);
  useEffect(() => {
    const dbg = (enabled?: boolean) => {
      if (typeof enabled === "undefined") {
        debugRef.current = !debugRef.current;
      } else {
        debugRef.current = !!enabled;
      }
      console.log(
        `%c[Shikaku Debug] ${debugRef.current ? "ENABLED" : "DISABLED"}`,
        `color: ${debugRef.current ? "#34d399" : "#f87171"}; font-weight: bold;`,
      );
      if (debugRef.current) {
        console.log(
          "%c[Shikaku Debug] Debug logs will appear here. Auto-disabled for ranked runs.",
          "color: #60a5fa;",
        );
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).shikakuDebug = dbg;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return () => { delete (window as any).shikakuDebug; };
  }, []);
  const debugLog = useCallback((...args: unknown[]) => {
    if (debugRef.current) {
      console.log("%c[Shikaku]", "color: #a78bfa; font-weight: bold;", ...args);
    }
  }, []);

  /* ── Prefill seed from puzzle image page ─────────────────── */
  const prefillHandled = useRef(false);
  const pendingChallenge = useRef<{ seed: number; diff: Difficulty } | null>(null);
  useEffect(() => {
    if (prefillHandled.current || phase !== "menu") return;
    const params = new URLSearchParams(location.search);
    if (params.get("from") !== "puzzle") return;
    prefillHandled.current = true;
    const seedParam = params.get("seed");
    const diffParam = params.get("difficulty");
    const isChallenge = params.get("challenge") === "1";
    const validDiffs: Difficulty[] = ["easy", "medium", "hard", "expert"];
    if (seedParam) {
      const parsed = parseInt(seedParam, 10);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 2_147_483_647) {
        const diff = (diffParam && validDiffs.includes(diffParam as Difficulty)) ? diffParam as Difficulty : "medium";
        if (isChallenge) {
          // Auto-start single-puzzle challenge
          pendingChallenge.current = { seed: parsed, diff };
        } else {
          setCustomSeedInput(String(parsed));
          setShowSeedInput(true);
          setDifficulty(diff);
        }
      }
    }
    // Clean up URL params without triggering a navigation
    navigate("/shikaku", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Leaderboard fetch + cache ─────────────────────────── */
  const [lbPage, setLbPage] = useState(1);
  const [lbTotalPages, setLbTotalPages] = useState(1);
  const [lbTotal, setLbTotal] = useState(0);
  const LB_PAGE_SIZE = 10;
  const LB_CACHE_TTL = 30_000; // 30 seconds
  const lbCacheRef = useRef<Map<string, { data: any; ts: number }>>(new Map());

  const fetchLeaderboard = useCallback(async (diff: Difficulty, pg = 1, view: LeaderboardView = lbView, forceRefresh = false) => {
    const cacheKey = `${diff}:${pg}:${view}`;
    const cached = lbCacheRef.current.get(cacheKey);
    if (!forceRefresh && cached && Date.now() - cached.ts < LB_CACHE_TTL) {
      const data = cached.data;
      setLeaderboard(data.entries ?? []);
      setPersonalBest(data.personalBest ?? null);
      setLbPage(data.page ?? 1);
      setLbTotalPages(data.totalPages ?? 1);
      setLbTotal(data.total ?? 0);
      setLeaderboardLoading(false);
      return;
    }
    setLeaderboardLoading(true);
    try {
      const activeSessionId = getOrCreateSessionId();
      const params = new URLSearchParams({
        difficulty: diff,
        limit: String(LB_PAGE_SIZE),
        page: String(pg),
        sessionId: activeSessionId,
      });
      if (view === "mine") {
        params.set("mineOnly", "1");
      }
      const res = await fetch(`${API_BASE}/api/shikaku/leaderboard?${params.toString()}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        lbCacheRef.current.set(cacheKey, { data, ts: Date.now() });
        setLeaderboard(data.entries ?? []);
        setPersonalBest(data.personalBest ?? null);
        setLbPage(data.page ?? 1);
        setLbTotalPages(data.totalPages ?? 1);
        setLbTotal(data.total ?? 0);
      }
    } catch {
      // silent
    } finally {
      setLeaderboardLoading(false);
    }
  }, [lbView]);

  // Snapshot leaderboard for the finished screen once after data arrives
  useEffect(() => {
    if (phase === "finished" && !finishedLbSnapshotted.current && leaderboard.length > 0) {
      setFinishedLeaderboard(leaderboard);
      setFinishedPersonalBest(personalBest);
      finishedLbSnapshotted.current = true;
    }
  }, [phase, leaderboard, personalBest]);

  // Reset snapshot flag when leaving finished phase
  useEffect(() => {
    if (phase !== "finished") {
      finishedLbSnapshotted.current = false;
    }
  }, [phase]);

  const resolveScoreEligibility = useCallback(async (
    runSeed: number,
    diff: Difficulty,
    score: number,
    timeMs: number,
  ): Promise<ScoreSubmissionStatus> => {
    try {
      const identity = await syncSessionIdentity(API_BASE, { allowCreate: true, reason: "shikaku-eligibility" });
      const activeSessionId = identity.sessionId;
      const activeName = identity.name || "Anonymous";

      const res = await fetch(`${API_BASE}/api/shikaku/score/eligibility`, {
        method: "POST",
        credentials: "include",
        headers: getSessionRequestHeaders(activeSessionId, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          sessionId: activeSessionId,
          name: activeName,
          seed: runSeed,
          difficulty: diff,
          score,
          timeMs,
          puzzleCount: PUZZLES_PER_RUN,
        }),
      });

      const data = await res.json().catch(() => null) as ScoreEligibilityResponse | null;
      const canSubmit = Boolean(data?.canSubmit);
      const code = data?.code ?? "unknown";
      const message = typeof data?.reason === "string" && data.reason.trim()
        ? data.reason
        : canSubmit
          ? "This score is verified and ready to submit."
          : "This score cannot be submitted right now.";
      const tone: ScoreStatusTone = canSubmit
        ? "info"
        : code === "duplicate" || code === "not-ranked"
          ? "info"
          : "error";

      return {
        canSubmit,
        pending: false,
        tone,
        message,
      };
    } catch {
      return {
        canSubmit: false,
        pending: false,
        tone: "error",
        message: "We couldn't verify leaderboard eligibility right now. Check your connection and try again.",
      };
    }
  }, []);

  // Timer — pauses automatically during solved animation (system-controlled, non-abusable)
  useEffect(() => {
    if (phase !== "playing") return;
    const iv = setInterval(() => {
      // Freeze timer while solved overlay is visible
      if (pauseStartRef.current !== null) return;
      const elapsed = Date.now() - startTime - pausedMsRef.current;
      setElapsedMs(elapsed);
      // Auto-end run if max play time exceeded
      const maxMs = MAX_TIME_MS[difficulty];
      if (elapsed >= maxMs) {
        clearInterval(iv);
        showToast("Time limit reached — run ended", "info");
        // Force-end via giveUp-like logic
        const totalTime = maxMs;
        const puzzleTime = Date.now() - puzzleStartTime;
        setPuzzleTimes((prev) => [...prev, puzzleTime]);
        if (infiniteMode) {
          const DIFF_MULT: Record<Difficulty, number> = { easy: 1, medium: 1.5, hard: 2.2, expert: 3 };
          setFinalScore(Math.round(infiniteSolved * 500 * DIFF_MULT[difficulty]));
        } else {
          const completedPuzzles = puzzleTimes.length;
          const partialMultiplier = completedPuzzles / PUZZLES_PER_RUN;
          const rawScore = calculateScore(totalTime, difficulty);
          setFinalScore(Math.round(rawScore * partialMultiplier * 0.5));
        }
        setFinalTimeMs(totalTime);
        setPhase("finished");
        setScoreSubmitted(false);
        setSubmittingScore(false);
        setScoreSubmissionStatus(null);
        fetchLeaderboard(difficulty, 1, lbView);
      }
    }, 50);
    return () => clearInterval(iv);
  }, [phase, startTime, difficulty, puzzleStartTime, infiniteMode, infiniteSolved, puzzleTimes, fetchLeaderboard, lbView]);

  const currentPuzzle = puzzles[currentPuzzleIdx] ?? null;
  const autoFilledRects = useMemo<PlacedRect[]>(() => {
    if (!currentPuzzle) return [];
    return getAutoFilledRects(currentPuzzle).map((rect, index) => ({
      ...rect,
      colorIndex: index % RECT_COLORS.length,
    }));
  }, [currentPuzzle]);
  const autoFilledCellKeys = useMemo(
    () => new Set(autoFilledRects.map((rect) => `${rect.r},${rect.c}`)),
    [autoFilledRects],
  );

  const isAutoFilledRect = useCallback((rect: Rect): boolean => {
    return rect.w === 1 && rect.h === 1 && autoFilledCellKeys.has(`${rect.r},${rect.c}`);
  }, [autoFilledCellKeys]);

  const autoCompleteCheckedRef = useRef<string>("");
  // Ref to latest handlePuzzleSolved to avoid TDZ (it's declared later)
  const handlePuzzleSolvedRef = useRef<(rects: PlacedRect[]) => void>(() => {});
  useEffect(() => {
    setPlacedRects(autoFilledRects);
    setColorCounter(autoFilledRects.length);
    setFlashingRects(new Set());
    setUndoStack([]);
  }, [autoFilledRects]);

  // Auto-advance trivially solved puzzles (e.g. all-1×1 fallback puzzles)
  useEffect(() => {
    if (phase !== "playing" || !currentPuzzle || showPuzzleSolvedAnim) return;
    const puzzleKey = `${seed}-${currentPuzzleIdx}`;
    if (autoCompleteCheckedRef.current === puzzleKey) return;
    autoCompleteCheckedRef.current = puzzleKey;
    const rects = autoFilledRects.map(({ r, c, w, h }) => ({ r, c, w, h }));
    if (rects.length > 0 && validateSolution(currentPuzzle, rects)) {
      debugLog("auto-advancing trivially solved puzzle", { puzzleKey });
      handlePuzzleSolvedRef.current(autoFilledRects);
    }
  }, [phase, currentPuzzle, autoFilledRects, showPuzzleSolvedAnim, seed, currentPuzzleIdx, debugLog]);

  /* ── Countdown logic ────────────────────────────────────── */
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdownNum <= 0) {
      setPhase("playing");
      setStartTime(Date.now());
      setPuzzleStartTime(Date.now());
      return;
    }
    const t = setTimeout(() => setCountdownNum((n) => n - 1), 700);
    return () => clearTimeout(t);
  }, [phase, countdownNum]);

  /* ── Start a new run ────────────────────────────────────── */
  const pendingGenRef = useRef<{ diff: Difficulty; newSeed: number; custom: boolean; challenge?: boolean } | null>(null);

  const startRun = useCallback((diff: Difficulty) => {
    // Auto-disable debug for ranked runs
    if (!infiniteMode && debugRef.current) {
      debugRef.current = false;
      console.log("%c[Shikaku Debug] Auto-disabled for ranked run", "color: #f87171; font-weight: bold;");
    }
    const newSeed = Math.floor(Math.random() * 2147483647);
    setSeed(newSeed);
    setCurrentPuzzleIdx(0);
    setPlacedRects([]);
    setColorCounter(0);
    setElapsedMs(0);
    setPuzzleTimes([]);
    setFlashingRects(new Set());
    setUndoStack([]);
    setDifficulty(diff);
    setCountdownNum(3);
    setScoreSubmitted(false);
    setSubmittingScore(false);
    setScoreSubmissionStatus(null);
    lastSubmitTime.current = 0;
    setCustomMode(false);
    setChallengeMode(false);
    pausedMsRef.current = 0;
    pauseStartRef.current = null;

    pendingGenRef.current = { diff, newSeed, custom: false };
    setPhase("generating");
    debugLog("startRun", { diff, seed: newSeed, infiniteMode });
  }, [infiniteMode, debugLog]);

  /* ── Start a custom seed run ─────────────────────────────── */
  const startCustomRun = useCallback((diff: Difficulty, customSeed: number) => {
    setSeed(customSeed);
    setCurrentPuzzleIdx(0);
    setPlacedRects([]);
    setColorCounter(0);
    setElapsedMs(0);
    setPuzzleTimes([]);
    setFlashingRects(new Set());
    setUndoStack([]);
    setDifficulty(diff);
    setCountdownNum(3);
    setScoreSubmitted(false);
    setSubmittingScore(false);
    setScoreSubmissionStatus(null);
    lastSubmitTime.current = 0;
    setCustomMode(true);
    setChallengeMode(false);
    pausedMsRef.current = 0;
    pauseStartRef.current = null;

    pendingGenRef.current = { diff, newSeed: customSeed, custom: true };
    setPhase("generating");
    debugLog("startCustomRun", { diff, seed: customSeed, infiniteMode });
  }, [infiniteMode, debugLog]);

  /* ── Start a challenge (single puzzle from puzzle image page) ── */
  const startChallenge = useCallback((diff: Difficulty, challengeSeed: number) => {
    setSeed(challengeSeed);
    setCurrentPuzzleIdx(0);
    setPlacedRects([]);
    setColorCounter(0);
    setElapsedMs(0);
    setPuzzleTimes([]);
    setFlashingRects(new Set());
    setUndoStack([]);
    setDifficulty(diff);
    setCountdownNum(3);
    setScoreSubmitted(false);
    setSubmittingScore(false);
    setScoreSubmissionStatus(null);
    lastSubmitTime.current = 0;
    setCustomMode(true);
    setChallengeMode(true);
    setInfiniteMode(false);
    pausedMsRef.current = 0;
    pauseStartRef.current = null;

    pendingGenRef.current = { diff, newSeed: challengeSeed, custom: true, challenge: true };
    setPhase("generating");
    debugLog("startChallenge", { diff, seed: challengeSeed });
  }, [debugLog]);

  // Deferred challenge start — runs after startChallenge is available
  useEffect(() => {
    if (!pendingChallenge.current || phase !== "menu") return;
    const { seed: challengeSeed, diff } = pendingChallenge.current;
    pendingChallenge.current = null;
    startChallenge(diff, challengeSeed);
  }, [phase, startChallenge]);

  /* ── Deferred puzzle generation (lets animation paint first) ── */
  useEffect(() => {
    if (phase !== "generating") return;
    const gen = pendingGenRef.current;
    if (!gen) return;

    const raf = requestAnimationFrame(() => {
      const timer = setTimeout(() => {
        if (infiniteMode) {
          const rng = mulberry32(gen.newSeed);
          infiniteRng.current = rng;
          const { rows, cols } = DIFFICULTY_CONFIG[gen.diff];
          const firstPuzzle = generatePuzzle(rows, cols, rng);
          setPuzzles([firstPuzzle]);
          setInfiniteSolved(0);
          debugLog("generated infinite first puzzle", { seed: gen.newSeed, diff: gen.diff, custom: gen.custom, autoFilled: getAutoFilledRects(firstPuzzle).length, totalRects: firstPuzzle.solution.length });
        } else if (gen.challenge) {
          infiniteRng.current = null;
          const rng = mulberry32(gen.newSeed);
          const { rows, cols } = DIFFICULTY_CONFIG[gen.diff];
          const puzzle = generatePuzzle(rows, cols, rng);
          setPuzzles([puzzle]);
          debugLog("generated challenge puzzle", { seed: gen.newSeed, diff: gen.diff });
        } else {
          infiniteRng.current = null;
          const generated = generateRun(gen.newSeed, gen.diff);
          setPuzzles(generated);
          debugLog("generated run", { seed: gen.newSeed, diff: gen.diff, puzzles: generated.length, custom: gen.custom });
        }
        pendingGenRef.current = null;
        setPhase("countdown");
      }, 0);
      return () => clearTimeout(timer);
    });
    return () => cancelAnimationFrame(raf);
  }, [phase, infiniteMode, debugLog]);

  /* ── Check if a placed rect is "valid" (exactly 1 number, area matches) ── */
  const isRectValid = useCallback((rect: Rect): boolean => {
    if (!currentPuzzle) return false;
    const nums = currentPuzzle.numbers.filter(
      (n) => n.r >= rect.r && n.r < rect.r + rect.h && n.c >= rect.c && n.c < rect.c + rect.w
    );
    const targetNumber = nums[0];
    return nums.length === 1 && targetNumber !== undefined && targetNumber.value === rect.w * rect.h;
  }, [currentPuzzle]);

  /* ── Place a rectangle (with overlap override) ──────────── */
  const placeRect = useCallback((rect: Rect) => {
    if (!currentPuzzle) return;

    // Validate bounds
    if (rect.r < 0 || rect.c < 0 || rect.r + rect.h > currentPuzzle.rows || rect.c + rect.w > currentPuzzle.cols) return;
    if (autoFilledRects.some((lockedRect) => rectsOverlap(rect, lockedRect))) return;

    // Remove any overlapping existing rects (override behavior)
    const surviving = placedRects.filter((pr) => isAutoFilledRect(pr) || !rectsOverlap(rect, pr));

    const newColor = colorCounter % RECT_COLORS.length;
    const placed: PlacedRect = { ...rect, colorIndex: newColor };

    // Save undo state
    setUndoStack((prev) => [...prev, placedRects]);

    const newRects = [...surviving, placed];
    setPlacedRects(newRects);
    setColorCounter((c) => c + 1);

    // Flash any invalid rects (wrong number count or wrong area)
    const nextFlashing = new Set<number>();
    newRects.forEach((pr, i) => {
      if (!isRectValid(pr)) nextFlashing.add(i);
    });
    setFlashingRects(nextFlashing);

    // Check if puzzle is solved
    const justRects = newRects.map(({ r, c, w, h }) => ({ r, c, w, h }));
    if (validateSolution(currentPuzzle, justRects)) {
      debugLog("puzzle solved via placeRect", { rectCount: newRects.length });
      handlePuzzleSolved(newRects);
    }
  }, [autoFilledRects, colorCounter, currentPuzzle, isAutoFilledRect, isRectValid, placedRects, debugLog]);

  /* ── Puzzle solved handler ──────────────────────────────── */
  const handlePuzzleSolved = useCallback((rects: PlacedRect[]) => {
    const now = Date.now();
    const puzzleTime = now - puzzleStartTime;

    setShowPuzzleSolvedAnim(true);
    // Pause timer during solved animation
    pauseStartRef.current = now;

    if (infiniteMode) {
      // Infinite mode: always generate next puzzle
      setPuzzleTimes((prev) => [...prev, puzzleTime]);
      setInfiniteSolved((n) => n + 1);
      debugLog("puzzle solved (infinite)", { puzzleTime, solved: infiniteSolved + 1 });
      setTimeout(() => {
        // Resume timer — accumulate paused duration
        if (pauseStartRef.current !== null) {
          pausedMsRef.current += Date.now() - pauseStartRef.current;
          pauseStartRef.current = null;
        }
        setShowPuzzleSolvedAnim(false);
        const { rows, cols } = DIFFICULTY_CONFIG[difficulty];
        if (!infiniteRng.current) {
          debugLog("ERROR: infiniteRng is null — cannot generate next puzzle");
          return;
        }
        const nextPuzzle = generatePuzzle(rows, cols, infiniteRng.current);
        debugLog("generated next infinite puzzle", { autoFilled: getAutoFilledRects(nextPuzzle).length, totalRects: nextPuzzle.solution.length });
        setPuzzles([nextPuzzle]);
        setCurrentPuzzleIdx(0);
        setPlacedRects([]);
        setColorCounter(0);
        setFlashingRects(new Set());
        setUndoStack([]);
        setPuzzleStartTime(Date.now());
      }, 1200);
    } else if (challengeMode) {
      // Challenge mode — single puzzle complete
      const totalTime = now - startTime - pausedMsRef.current;
      setFinalScore(0); // no score for challenge
      setFinalTimeMs(totalTime);
      setPuzzleTimes((prev) => [...prev, puzzleTime]);

      setTimeout(() => {
        setShowPuzzleSolvedAnim(false);
        setPhase("finished");
        setScoreSubmitted(false);
        setSubmittingScore(false);
        setScoreSubmissionStatus(null);
      }, 1200);
    } else if (currentPuzzleIdx < PUZZLES_PER_RUN - 1) {
      // Show solve animation, then next puzzle
      setPuzzleTimes((prev) => [...prev, puzzleTime]);
      setTimeout(() => {
        // Resume timer — accumulate paused duration
        if (pauseStartRef.current !== null) {
          pausedMsRef.current += Date.now() - pauseStartRef.current;
          pauseStartRef.current = null;
        }
        setShowPuzzleSolvedAnim(false);
        setCurrentPuzzleIdx((i) => i + 1);
        setPlacedRects([]);
        setColorCounter(0);
        setFlashingRects(new Set());
        setUndoStack([]);
        setPuzzleStartTime(Date.now());
      }, 1200);
    } else {
      // Run complete!
      const totalTime = now - startTime - pausedMsRef.current;
      const score = calculateScore(totalTime, difficulty);
      setFinalScore(score);
      setFinalTimeMs(totalTime);
      setPuzzleTimes((prev) => [...prev, puzzleTime]);

      setTimeout(() => {
        setShowPuzzleSolvedAnim(false);
        setPhase("finished");
        setScoreSubmitted(false);
        setSubmittingScore(false);
        setScoreSubmissionStatus(null);

        // Fetch leaderboard for finished screen
        fetchLeaderboard(difficulty, 1, lbView);
      }, 1200);
    }
  }, [currentPuzzleIdx, puzzleStartTime, startTime, difficulty, infiniteMode, fetchLeaderboard, lbView, debugLog, infiniteSolved]);
  handlePuzzleSolvedRef.current = handlePuzzleSolved;

  /* ── Remove a rectangle by index ─────────────────────────── */
  const removeRect = useCallback((index: number) => {
    const targetRect = placedRects[index];
    if (!targetRect || isAutoFilledRect(targetRect)) return;

    setUndoStack((prev) => [...prev, placedRects]);
    const newRects = placedRects.filter((_, i) => i !== index);
    setPlacedRects(newRects);
    // Recompute flashing
    const nextFlashing = new Set<number>();
    newRects.forEach((pr, i) => { if (!isRectValid(pr)) nextFlashing.add(i); });
    setFlashingRects(nextFlashing);
  }, [isAutoFilledRect, isRectValid, placedRects]);

  /* ── Undo last action ───────────────────────────────────── */
  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack.at(-1);
    if (!prev) return;
    setUndoStack((s) => s.slice(0, -1));
    setPlacedRects(prev);
    // Recompute flashing
    const nextFlashing = new Set<number>();
    prev.forEach((pr, i) => { if (!isRectValid(pr)) nextFlashing.add(i); });
    setFlashingRects(nextFlashing);
  }, [undoStack, isRectValid]);

  // Track whether mouse moved during press (to distinguish click vs drag)
  const didDrag = useRef(false);
  // Track which rect index was under the initial mousedown (for click-to-remove)
  const pressedRectIdx = useRef<number>(-1);

  /* ── Drag handling ──────────────────────────────────────── */
  const handleCellMouseDown = useCallback((r: number, c: number) => {
    if (showPuzzleSolvedAnim) return;
    didDrag.current = false;
    // Check if clicking on existing rect — always allow drag to start from filled cells
    const existingIdx = placedRects.findIndex(
      (pr) => r >= pr.r && r < pr.r + pr.h && c >= pr.c && c < pr.c + pr.w
    );
    if (existingIdx !== -1) {
      const existingRect = placedRects[existingIdx];
      if (existingRect && isAutoFilledRect(existingRect)) {
        pressedRectIdx.current = -1;
        return;
      }
    }
    pressedRectIdx.current = existingIdx;
    setDragStart({ r, c });
    setDragEnd({ r, c });
    // Sync refs immediately — native touch events may fire before React re-renders
    dragStartRef.current = { r, c };
    dragEndRef.current = { r, c };
    isDraggingRef.current = true;
    setIsDragging(true);
  }, [isAutoFilledRect, placedRects, showPuzzleSolvedAnim]);

  const handleCellMouseEnter = useCallback((r: number, c: number) => {
    // Read from ref, not closure — touchmove may fire before React commits the isDragging state
    if (!isDraggingRef.current) return;
    didDrag.current = true;
    setDragEnd({ r, c });
    dragEndRef.current = { r, c };
  }, []);

  const handleMouseUp = useCallback(() => {
    // Read ALL drag state from refs to avoid stale closures on touch devices
    // (touchend fires before React commits state updates from touchstart/touchmove)
    const currentDragStart = dragStartRef.current;
    const currentDragEnd = dragEndRef.current;
    const wasDragging = isDraggingRef.current;

    // Always clear refs synchronously
    isDraggingRef.current = false;
    dragStartRef.current = null;
    dragEndRef.current = null;

    if (!wasDragging || !currentDragStart || !currentDragEnd) {
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      return;
    }

    // Single click (no drag movement) on a filled cell → remove that rect
    if (!didDrag.current && pressedRectIdx.current !== -1) {
      removeRect(pressedRectIdx.current);
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      pressedRectIdx.current = -1;
      return;
    }

    const r1 = Math.min(currentDragStart.r, currentDragEnd.r);
    const c1 = Math.min(currentDragStart.c, currentDragEnd.c);
    const r2 = Math.max(currentDragStart.r, currentDragEnd.r);
    const c2 = Math.max(currentDragStart.c, currentDragEnd.c);

    placeRect({ r: r1, c: c1, w: c2 - c1 + 1, h: r2 - r1 + 1 });

    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
    pressedRectIdx.current = -1;
  }, [placeRect, removeRect]);

  /* ── Right-click to remove rect ─────────────────────────── */
  const handleCellRightClick = useCallback((r: number, c: number) => {
    if (showPuzzleSolvedAnim) return;
    const existingIdx = placedRects.findIndex(
      (pr) => r >= pr.r && r < pr.r + pr.h && c >= pr.c && c < pr.c + pr.w
    );
    if (existingIdx !== -1) {
      removeRect(existingIdx);
    }
  }, [placedRects, removeRect, showPuzzleSolvedAnim]);

  // Global mouseup listener
  useEffect(() => {
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseUp]);

  /* ── Preview rect from drag ─────────────────────────────── */
  const previewRect = useMemo((): Rect | null => {
    if (!isDragging || !dragStart || !dragEnd) return null;
    return {
      r: Math.min(dragStart.r, dragEnd.r),
      c: Math.min(dragStart.c, dragEnd.c),
      w: Math.abs(dragEnd.c - dragStart.c) + 1,
      h: Math.abs(dragEnd.r - dragStart.r) + 1,
    };
  }, [isDragging, dragStart, dragEnd]);

  /* ── Give up / finish run early ─────────────────────────── */
  const openGiveUp = useCallback(() => setConfirmGiveUp(true), []);
  const cancelGiveUp = useCallback(() => setConfirmGiveUp(false), []);
  const giveUp = useCallback(() => {
    setConfirmGiveUp(false);
    const now = Date.now();
    const currentPause = pauseStartRef.current ? now - pauseStartRef.current : 0;
    const totalTime = now - startTime - pausedMsRef.current - currentPause;
    const puzzleTime = now - puzzleStartTime;
    setPuzzleTimes((prev) => [...prev, puzzleTime]);

    if (infiniteMode) {
      // Infinite mode: show stats but don't submit
      const solved = infiniteSolved;
      // Simple score: 500 pts per puzzle solved × difficulty multiplier
      const DIFF_MULT: Record<Difficulty, number> = { easy: 1, medium: 1.5, hard: 2.2, expert: 3 };
      const score = Math.round(solved * 500 * DIFF_MULT[difficulty]);
      setFinalScore(score);
      setFinalTimeMs(totalTime);
      setPhase("finished");
      setScoreSubmitted(false);
      setSubmittingScore(false);
      setScoreSubmissionStatus(null);
    } else {
      // Calculate partial score (penalized)
      const completedPuzzles = puzzleTimes.length;
      const partialMultiplier = completedPuzzles / PUZZLES_PER_RUN;
      const rawScore = calculateScore(totalTime, difficulty);
      const score = Math.round(rawScore * partialMultiplier * 0.5); // 50% penalty on top of partial
      setFinalScore(score);
      setFinalTimeMs(totalTime);
      setPhase("finished");
      setScoreSubmitted(false);
      setSubmittingScore(false);
      setScoreSubmissionStatus(null);
      fetchLeaderboard(difficulty, 1, lbView);
    }
  }, [startTime, puzzleTimes, difficulty, puzzleStartTime, infiniteMode, infiniteSolved, fetchLeaderboard, lbView]);

  // Listen for sidebar leaderboard toggle
  useEffect(() => {
    const handler = () => {
      setShowLeaderboard((v) => {
        if (!v) { setLbDifficulty(difficulty); fetchLeaderboard(difficulty, 1, lbView); }
        return !v;
      });
    };
    window.addEventListener("shikaku-toggle-leaderboard", handler);
    return () => window.removeEventListener("shikaku-toggle-leaderboard", handler);
  }, [difficulty, fetchLeaderboard, lbView]);

  // Listen for sidebar infinite mode toggle
  useEffect(() => {
    const handler = () => {
      if (phase === "menu") {
        setInfiniteMode((v) => !v);
      }
    };
    window.addEventListener("shikaku-toggle-infinite", handler);
    return () => window.removeEventListener("shikaku-toggle-infinite", handler);
  }, [phase]);

  // Broadcast game state so sidebar knows mode + phase
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("shikaku-infinite-state", {
      detail: { enabled: infiniteMode, canToggle: phase === "menu" },
    }));
    window.dispatchEvent(new CustomEvent("shikaku-game-state", {
      detail: {
        phase,
        infiniteMode,
        customMode,
        showSeedInput,
        difficulty,
        seed: seed ?? null,
      },
    }));
  }, [infiniteMode, phase, customMode, showSeedInput, difficulty, seed]);

  useEffect(() => {
    if (phase !== "finished" || scoreSubmitted) {
      return;
    }

    const completedCount = puzzleTimes.length;
    if (infiniteMode) {
      setScoreSubmissionStatus({
        canSubmit: false,
        pending: false,
        tone: "info",
        message: "Infinite mode scores are unranked and cannot be submitted.",
      });
      return;
    }

    if (customMode) {
      setScoreSubmissionStatus({
        canSubmit: false,
        pending: false,
        tone: "info",
        message: "Custom seed scores are unranked and cannot be submitted.",
      });
      return;
    }

    if (completedCount < PUZZLES_PER_RUN) {
      setScoreSubmissionStatus({
        canSubmit: false,
        pending: false,
        tone: "info",
        message: "Only fully completed runs can be submitted to the leaderboard.",
      });
      return;
    }

    let cancelled = false;
    setScoreSubmissionStatus({
      canSubmit: false,
      pending: true,
      tone: "info",
      message: "Checking leaderboard eligibility...",
    });

    void resolveScoreEligibility(seed, difficulty, finalScore, finalTimeMs).then((status) => {
      if (!cancelled) {
        setScoreSubmissionStatus(status);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [phase, scoreSubmitted, puzzleTimes.length, infiniteMode, customMode, seed, difficulty, finalScore, finalTimeMs, resolveScoreEligibility]);

  /* ── Score submission ───────────────────────────────────── */
  const submitScore = useCallback(async (
    runSeed: number, diff: Difficulty, score: number, timeMs: number
  ) => {
    // Anti-spam: 5s cooldown between submissions
    const now = Date.now();
    if (now - lastSubmitTime.current < 5_000) {
      setScoreSubmissionStatus({
        canSubmit: true,
        pending: false,
        tone: "info",
        message: "Please wait a moment before trying to submit again.",
      });
      return;
    }
    if (submittingScore || scoreSubmitted || !scoreSubmissionStatus?.canSubmit) return;

    setSubmittingScore(true);
    setScoreSubmissionStatus({
      canSubmit: false,
      pending: true,
      tone: "info",
      message: "Submitting verified score...",
    });

    try {
      const identity = await syncSessionIdentity(API_BASE, { allowCreate: true, reason: "shikaku-submit" });
      const activeSessionId = identity.sessionId;
      const activeName = identity.name || "Anonymous";

      const res = await fetch(`${API_BASE}/api/shikaku/score`, {
        method: "POST",
        credentials: "include",
        headers: getSessionRequestHeaders(activeSessionId, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          sessionId: activeSessionId,
          name: activeName,
          seed: runSeed,
          difficulty: diff,
          score,
          timeMs,
          puzzleCount: PUZZLES_PER_RUN,
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null) as { id?: string | null; reason?: string } | null;
        lastSubmitTime.current = now;
        setScoreSubmitted(true);
        lbCacheRef.current.clear(); // invalidate cache so leaderboard picks up new score
        if (data?.id === null) {
          setScoreSubmissionStatus({
            canSubmit: false,
            pending: false,
            tone: "info",
            message: data.reason || "This score was verified, but it did not enter your saved leaderboard scores.",
          });
        } else {
          setScoreSubmissionStatus({
            canSubmit: false,
            pending: false,
            tone: "success",
            message: "Score submitted to the leaderboard.",
          });
        }
      } else {
        const data = await res.json().catch(() => null) as { error?: string } | null;
        if (res.status === 409) {
          lastSubmitTime.current = now;
          setScoreSubmitted(true);
          setScoreSubmissionStatus({
            canSubmit: false,
            pending: false,
            tone: "info",
            message: "This run has already been submitted to the leaderboard.",
          });
        } else if (res.status === 403) {
          const nextStatus = await resolveScoreEligibility(runSeed, diff, score, timeMs);
          setScoreSubmissionStatus(nextStatus);
        } else if (res.status === 429) {
          setScoreSubmissionStatus({
            canSubmit: true,
            pending: false,
            tone: "info",
            message: "Too many requests — try again in a moment.",
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
      }
    } catch {
      setScoreSubmissionStatus({
        canSubmit: true,
        pending: false,
        tone: "error",
        message: "Network error — this score was not submitted.",
      });
    } finally {
      setSubmittingScore(false);
    }
    // Refresh leaderboard + re-snapshot for finished screen
    finishedLbSnapshotted.current = false;
    fetchLeaderboard(diff, 1, lbView);
  }, [fetchLeaderboard, lbView, resolveScoreEligibility, scoreSubmissionStatus?.canSubmit, submittingScore, scoreSubmitted]);

  /* ── Format time ────────────────────────────────────────── */
  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    const centis = Math.floor((ms % 1000) / 10);
    return `${min}:${sec.toString().padStart(2, "0")}.${centis.toString().padStart(2, "0")}`;
  };

  /* ── Number cell lookup ─────────────────────────────────── */
  const numberMap = useMemo(() => {
    const map = new Map<string, number>();
    if (currentPuzzle) {
      for (const n of currentPuzzle.numbers) {
        map.set(`${n.r},${n.c}`, n.value);
      }
    }
    return map;
  }, [currentPuzzle]);

  const leaderboardPanel = showLeaderboard ? (
    <ShikakuLeaderboard
      entries={leaderboard}
      loading={leaderboardLoading}
      difficulty={lbDifficulty}
      view={lbView}
      personalBest={personalBest}
      onDiffChange={(d: Difficulty) => { setLbDifficulty(d); setLbPage(1); fetchLeaderboard(d, 1, lbView); }}
      onViewChange={(v: LeaderboardView) => { setLbView(v); setLbPage(1); fetchLeaderboard(lbDifficulty, 1, v); }}
      onClose={() => setShowLeaderboard(false)}
      formatTime={formatTime}
      page={lbPage}
      totalPages={lbTotalPages}
      total={lbTotal}
      onPageChange={(p: number) => { setLbPage(p); fetchLeaderboard(lbDifficulty, p, lbView); }}
    />
  ) : null;

  /* ═══════════════════════════════════════════════════════════
   *  RENDER
   * ═══════════════════════════════════════════════════════════ */

  // Generating
  if (phase === "generating") {
    return (
      <>
        <div className="game-page shikaku-page" data-game-theme="shikaku">
          <div className="shikaku-container">
            <div className="shikaku-generating">
              <div className="shikaku-generating-spinner" />
              <p className="shikaku-generating-label">Generating puzzles…</p>
              <p className="shikaku-generating-sub">
                {difficulty} — {customMode ? "custom seed" : infiniteMode ? "∞ mode" : `${PUZZLES_PER_RUN} puzzles`}
              </p>
            </div>
          </div>
        </div>
        {leaderboardPanel}
      </>
    );
  }

  // Countdown
  if (phase === "countdown") {
    return (
      <>
        <div className="game-page shikaku-page" data-game-theme="shikaku">
          <div className="shikaku-container">
            <div className="shikaku-countdown">
              <div className="shikaku-countdown-number" key={countdownNum}>
                {countdownNum > 0 ? countdownNum : "GO!"}
              </div>
              <p className="shikaku-countdown-label">
                {difficulty} — {customMode ? "custom seed" : infiniteMode ? "∞ mode" : `${PUZZLES_PER_RUN} puzzles`}
              </p>
            </div>
          </div>
        </div>
        {leaderboardPanel}
      </>
    );
  }

  // Menu
  if (phase === "menu") {
    const diffKeys = Object.keys(DIFFICULTY_CONFIG) as Difficulty[];
    return (
      <>
        <div className="game-page shikaku-page" data-game-theme="shikaku">
          <div className="shikaku-container">
            <div className="shikaku-menu">
            {/* ── Title ── */}
            <div className="shikaku-menu-hero">
              <h1 className="shikaku-title">Shikaku</h1>
              <p className="shikaku-subtitle">Divide the grid into rectangles — each containing exactly one number equal to its area</p>
            </div>

            {/* ── Mode bar: tabs + seed toggle ── */}
            <div className="shikaku-mode-bar">
              <div className="shikaku-tabs">
                <button
                  className={`shikaku-tab${!infiniteMode ? " shikaku-tab--active" : ""}`}
                  onClick={() => setInfiniteMode(false)}
                  data-tooltip={`${PUZZLES_PER_RUN} puzzles, ranked on leaderboard`}
                  data-tooltip-pos="bottom"
                >
                  <FiFlag size={14} />
                  Regular
                </button>
                <button
                  className={`shikaku-tab${infiniteMode ? " shikaku-tab--active" : ""}`}
                  onClick={() => setInfiniteMode(true)}
                  data-tooltip="Endless puzzles, unranked"
                  data-tooltip-pos="bottom"
                >
                  <FiRepeat size={14} />
                  Infinite
                </button>
              </div>
              <button
                className={`shikaku-seed-toggle${showSeedInput ? " shikaku-seed-toggle--on" : ""}`}
                onClick={() => setShowSeedInput((v) => !v)}
                data-tooltip={showSeedInput ? "Custom seed on — click to disable" : "Play a specific seed"}
                data-tooltip-pos="bottom"
              >
                <FiHash size={16} />
              </button>
            </div>

            {/* ── Difficulty cards — click to start (or select when seed is on) ── */}
            <div className="shikaku-diff-cards">
              {diffKeys.map((d) => (
                <button
                  key={d}
                  className={`shikaku-diff-card${showSeedInput && d === difficulty ? " shikaku-diff-card--selected" : ""}`}
                  data-diff={d}
                  onClick={() => {
                    setDifficulty(d);
                    if (!showSeedInput) startRun(d);
                  }}
                  data-tooltip={
                    showSeedInput
                      ? `Select ${d} (${DIFFICULTY_CONFIG[d].label})`
                      : `Start ${infiniteMode ? "infinite " : ""}${d} — ${DIFFICULTY_CONFIG[d].label}${!infiniteMode ? ` — ${PUZZLES_PER_RUN} puzzles` : ""}`
                  }
                  data-tooltip-pos="bottom"
                >
                  <span className="shikaku-diff-card-size">{DIFFICULTY_CONFIG[d].label}</span>
                  <span className="shikaku-diff-card-name">{d}</span>
                  {!showSeedInput && <span className="shikaku-diff-card-play"><FiPlay size={12} /></span>}
                </button>
              ))}
            </div>

            {/* ── Hint ── */}
            {!showSeedInput && (
              <p className="shikaku-menu-hint">
                {infiniteMode ? "click a difficulty to start endless puzzles" : "click a difficulty to start"}
              </p>
            )}

            {/* ── Custom seed input ── */}
            {showSeedInput && (
              <div className="shikaku-seed-section">
                <div className="shikaku-seed-row">
                  <div className="shikaku-seed-field">
                    <FiHash size={14} className="shikaku-seed-icon" />
                    <input
                      type="text"
                      className="shikaku-seed-input"
                      placeholder="Enter seed"
                      value={customSeedInput}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, "");
                        setCustomSeedInput(val);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const parsed = parseInt(customSeedInput, 10);
                          if (!isNaN(parsed) && parsed > 0) {
                            startCustomRun(difficulty, parsed);
                            setCustomSeedInput("");
                          }
                        }
                      }}
                      maxLength={10}
                    />
                    <button
                      className="shikaku-seed-paste"
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard.readText();
                          const cleaned = text.replace(/[^0-9]/g, "").slice(0, 10);
                          if (cleaned) setCustomSeedInput(cleaned);
                        } catch { /* clipboard not available */ }
                      }}
                      data-tooltip="Paste from clipboard"
                      data-tooltip-pos="top"
                    >
                      <FiClipboard size={13} />
                    </button>
                  </div>
                  <button
                    className="shikaku-seed-go"
                    onClick={() => {
                      const parsed = parseInt(customSeedInput, 10);
                      if (!isNaN(parsed) && parsed > 0) {
                        startCustomRun(difficulty, parsed);
                        setCustomSeedInput("");
                      }
                    }}
                    disabled={!customSeedInput || isNaN(parseInt(customSeedInput, 10)) || parseInt(customSeedInput, 10) <= 0}
                    data-tooltip="Start with this seed"
                    data-tooltip-pos="top"
                  >
                    <FiPlay size={13} /> Start
                  </button>
                </div>
                <p className="shikaku-seed-note">
                  {difficulty} — {DIFFICULTY_CONFIG[difficulty].label} — {infiniteMode ? "infinite" : `${PUZZLES_PER_RUN} puzzles`} — unranked
                </p>
              </div>
            )}

            {/* ── Bottom links ── */}
            <div className="shikaku-menu-links">
              <button
                className="shikaku-menu-link"
                onClick={() => { setLbDifficulty(difficulty); setShowLeaderboard(true); fetchLeaderboard(difficulty, 1, lbView); }}
                data-tooltip="View leaderboard"
                data-tooltip-pos="bottom"
              >
                <FiAward size={14} /> Leaderboard
              </button>
              <button
                className="shikaku-menu-link"
                onClick={() => setShowDemo(true)}
                data-tooltip="Learn how to play"
                data-tooltip-pos="bottom"
              >
                <FiHelpCircle size={14} /> How to Play
              </button>
            </div>
          </div>

          {showDemo && <ShikakuDemo onClose={() => setShowDemo(false)} />}
        </div>
        </div>
        {leaderboardPanel}
      </>
    );
  }

  // Challenge complete — single puzzle from puzzle image page
  if (phase === "finished" && challengeMode) {
    const solved = puzzleTimes.length > 0 && finalTimeMs > 0;
    const puzzlePageUrl = `${API_BASE}/api/shikaku/puzzle?difficulty=${difficulty}&seed=${seed}`;
    return (
      <>
        <div className="game-page shikaku-page" data-game-theme="shikaku" data-phase="finished">
          <div className="shikaku-end-wrap">
            <div className="shikaku-finished shikaku-finished-enter">
              <div className={`shikaku-end-header ${solved ? "shikaku-end-header--success" : "shikaku-end-header--fail"}`}>
                <p className="shikaku-end-title">{solved ? "Puzzle Solved!" : "Puzzle Abandoned"}</p>
                <p className="shikaku-end-sub">
                  {difficulty} / {DIFFICULTY_CONFIG[difficulty].label} / seed {seed}
                </p>
              </div>

              <div className="shikaku-end-grid shikaku-end-grid--stats-only">
                <div className="shikaku-end-stats">
                  <div className="shikaku-end-tile shikaku-stat-pop" style={{ animationDelay: "0.1s" }}>
                    <span className="shikaku-end-tile-label">Time</span>
                    <span className="shikaku-end-tile-value">{formatTime(finalTimeMs)}</span>
                  </div>
                  <div className="shikaku-end-tile shikaku-stat-pop" style={{ animationDelay: "0.2s" }}>
                    <span className="shikaku-end-tile-label">Difficulty</span>
                    <span className="shikaku-end-tile-value" style={{ textTransform: "capitalize" }}>{difficulty}</span>
                  </div>
                  <div className="shikaku-end-tile shikaku-end-tile--seed shikaku-stat-pop" style={{ animationDelay: "0.3s" }}>
                    <button
                      className="shikaku-seed-copy-btn"
                      data-tooltip="Copy seed"
                      onClick={() => { navigator.clipboard.writeText(String(seed)).then(() => showToast("Seed copied!", "info")).catch(() => {}); }}
                    >
                      <FiCopy size={12} />
                    </button>
                    <span className="shikaku-end-tile-label">Seed</span>
                    <span className="shikaku-end-tile-value">{seed}</span>
                  </div>
                </div>
              </div>

              <div className="shikaku-end-actions">
                <button
                  className="btn btn-primary game-action-btn"
                  onClick={() => startChallenge(difficulty, seed)}
                  data-tooltip="Try this puzzle again"
                >
                  <FiRepeat size={16} /> Retry Puzzle
                </button>
                <button
                  className="btn btn-muted game-action-btn"
                  onClick={() => { setChallengeMode(false); setCustomMode(false); setPhase("menu"); }}
                  data-tooltip="Play the full game"
                >
                  <FiPlay size={16} /> Play Full Game
                </button>
                <a
                  className="btn btn-muted game-action-btn"
                  href={puzzlePageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-tooltip="Back to puzzle page"
                  style={{ textDecoration: "none" }}
                >
                  <FiGrid size={16} /> Puzzle Page
                </a>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Finished
  if (phase === "finished") {
    const completedCount = puzzleTimes.length;
    const gavUp = infiniteMode ? true : completedCount < PUZZLES_PER_RUN;
    const hasLeaderboard = finishedLeaderboard.length > 0 && !infiniteMode && !customMode;
    const hasPuzzleTimes = puzzleTimes.length > 0;
    const showSubmitButton = !infiniteMode && !customMode && (scoreSubmitted || submittingScore || Boolean(scoreSubmissionStatus?.canSubmit));
    const statusLabel = scoreSubmissionStatus?.pending
      ? (submittingScore ? "Submitting" : "Checking")
      : scoreSubmitted && scoreSubmissionStatus?.tone === "success"
        ? "Submitted"
        : scoreSubmissionStatus?.canSubmit
          ? "Ready"
          : "Submission";
    return (
      <>
        <div className="game-page shikaku-page" data-game-theme="shikaku" data-phase="finished">
          <div className="shikaku-end-wrap">
            <div className="shikaku-finished shikaku-finished-enter">
            {/* ── Header tile ── */}
            <div className={`shikaku-end-header ${gavUp && !infiniteMode && !customMode ? "shikaku-end-header--fail" : "shikaku-end-header--success"}`}>
              <p className="shikaku-end-title">
                {customMode && infiniteMode ? "∞ Custom Run Over" : customMode ? "Custom Run Over" : infiniteMode ? "∞ Run Over" : gavUp ? "Run Over" : "Run Complete!"}
              </p>
              <p className="shikaku-end-sub">
                {customMode && infiniteMode
                  ? `Seed ${seed} — solved ${infiniteSolved} puzzle${infiniteSolved !== 1 ? "s" : ""} in infinite mode`
                  : customMode
                  ? `Custom seed ${seed} — ${gavUp ? `completed ${completedCount - 1} of ${PUZZLES_PER_RUN} puzzles` : `all ${PUZZLES_PER_RUN} puzzles solved!`}`
                  : infiniteMode
                  ? `Solved ${infiniteSolved} puzzle${infiniteSolved !== 1 ? "s" : ""} in infinite mode`
                  : gavUp ? `Completed ${completedCount - 1} of ${PUZZLES_PER_RUN} puzzles` : `All ${PUZZLES_PER_RUN} puzzles solved!`}
              </p>
            </div>

            {/* ── Grid tile area ── */}
            <div className={`shikaku-end-grid${hasPuzzleTimes || hasLeaderboard ? "" : " shikaku-end-grid--stats-only"}`}>
              {/* Left column: stat tiles */}
              <div className={`shikaku-end-stats${infiniteMode ? " shikaku-end-stats--infinite" : ""}`}>
                <div className="shikaku-end-tile shikaku-stat-pop" style={{ animationDelay: "0.1s" }}>
                  <span className="shikaku-end-tile-label">Time</span>
                  <span className="shikaku-end-tile-value">{formatTime(finalTimeMs)}</span>
                </div>
                <div className="shikaku-end-tile shikaku-stat-pop" style={{ animationDelay: "0.2s" }}>
                  <span className="shikaku-end-tile-label">Score</span>
                  <span className="shikaku-end-tile-value">
                    {finalScore.toLocaleString()}
                    {(infiniteMode || customMode) && <span style={{ fontSize: "0.6em", opacity: 0.5, marginLeft: 4 }}>(unranked)</span>}
                  </span>
                </div>
                <div className="shikaku-end-tile shikaku-stat-pop" style={{ animationDelay: "0.3s" }}>
                  <span className="shikaku-end-tile-label">Difficulty</span>
                  <span className="shikaku-end-tile-value" style={{ textTransform: "capitalize" }}>{difficulty}</span>
                </div>
                {infiniteMode && (
                  <div className="shikaku-end-tile shikaku-stat-pop" style={{ animationDelay: "0.35s" }}>
                    <span className="shikaku-end-tile-label">Puzzles</span>
                    <span className="shikaku-end-tile-value">{infiniteSolved}</span>
                  </div>
                )}
                {finishedPersonalBest && !infiniteMode && (
                  <div className="shikaku-end-tile shikaku-end-tile--accent shikaku-stat-pop" style={{ animationDelay: "0.4s" }}>
                    <span className="shikaku-end-tile-label">Rank</span>
                    <span className="shikaku-end-tile-value">#{finishedPersonalBest.rank}</span>
                  </div>
                )}
                <div className="shikaku-end-tile shikaku-end-tile--seed shikaku-stat-pop" style={{ animationDelay: "0.45s" }}>
                  <button
                    className="shikaku-seed-copy-btn"
                    data-tooltip="Copy seed"
                    onClick={() => { navigator.clipboard.writeText(String(seed)).then(() => showToast("Seed copied!", "info")).catch(() => {}); }}
                  >
                    <FiCopy size={12} />
                  </button>
                  <span className="shikaku-end-tile-label">Seed</span>
                  <span className="shikaku-end-tile-value">{seed}</span>
                </div>
              </div>

              {/* Right column: tabbed puzzle times / leaderboard */}
              {(hasPuzzleTimes || hasLeaderboard) && (
                <div className="shikaku-end-list-tile">
                  {/* Tab bar — only show tabs when both views exist */}
                  {hasPuzzleTimes && hasLeaderboard ? (
                    <div className="shikaku-end-tab-bar">
                      <button
                        className={`shikaku-end-tab${endListTab === "times" ? " shikaku-end-tab--active" : ""}`}
                        onClick={() => setEndListTab("times")}
                      >
                        <FiClock size={12} /> Puzzle Times
                      </button>
                      <button
                        className={`shikaku-end-tab${endListTab === "scores" ? " shikaku-end-tab--active" : ""}`}
                        onClick={() => setEndListTab("scores")}
                      >
                        <FiAward size={12} /> Top Scores
                      </button>
                    </div>
                  ) : (
                    <div className="shikaku-end-list-header">
                      <span>{hasLeaderboard ? <><FiAward size={12} style={{ marginRight: 4, verticalAlign: -1 }} />Top Scores</> : "Puzzle Times"}</span>
                      <span>{hasLeaderboard ? "Time" : ""}</span>
                    </div>
                  )}

                  <div className="shikaku-end-list-body">
                    {/* Puzzle Times view */}
                    {(endListTab === "times" || !hasLeaderboard) && hasPuzzleTimes && (
                      <>
                        {puzzleTimes.map((t, i) => (
                          <div key={i} className="shikaku-end-list-row">
                            <span>Puzzle {i + 1}{gavUp && i === puzzleTimes.length - 1 ? " (incomplete)" : ""}</span>
                            <span>{formatTime(t)}</span>
                          </div>
                        ))}
                      </>
                    )}

                    {/* Top Scores view */}
                    {endListTab === "scores" && hasLeaderboard && (() => {
                      const top3 = finishedLeaderboard.slice(0, 3);
                      const ownRank = finishedPersonalBest?.rank ?? -1;
                      const contextEntries: { entry: LeaderboardEntry; rank: number }[] = [];
                      let showSeparator = false;

                      if (ownRank > 3) {
                        const nearbyEntries = finishedLeaderboard
                          .map((e, idx) => ({ entry: e, rank: idx + 1 }))
                          .filter(({ rank }) => rank > 3 && Math.abs(rank - ownRank) <= 5);

                        if (nearbyEntries.length > 0) {
                          showSeparator = true;
                          contextEntries.push(...nearbyEntries);
                        } else if (finishedLeaderboard.some(e => e.isOwn)) {
                          showSeparator = true;
                          finishedLeaderboard.forEach((e, idx) => {
                            if (e.isOwn) contextEntries.push({ entry: e, rank: idx + 1 });
                          });
                        }
                      }

                      return (
                        <>
                          {top3.map((entry, i) => (
                            <div key={entry.id} className={`shikaku-end-list-row${entry.isOwn ? " shikaku-end-list-row--self" : ""}`}>
                              <span>#{i + 1} {entry.name} — {entry.score.toLocaleString()}</span>
                              <span>{formatTime(entry.timeMs)}</span>
                            </div>
                          ))}
                          {showSeparator && (
                            <div className="shikaku-end-list-separator">···</div>
                          )}
                          {contextEntries.map(({ entry, rank }) => (
                            <div key={entry.id} className={`shikaku-end-list-row${entry.isOwn ? " shikaku-end-list-row--self" : ""}`}>
                              <span>#{rank} {entry.name} — {entry.score.toLocaleString()}</span>
                              <span>{formatTime(entry.timeMs)}</span>
                            </div>
                          ))}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* ── Action bar ── */}
            <div className="shikaku-end-actions">
              {showSubmitButton && (
                <button
                  className={`btn ${scoreSubmitted ? "btn-muted" : "btn-primary"} game-action-btn`}
                  onClick={() => submitScore(seed, difficulty, finalScore, finalTimeMs)}
                  disabled={scoreSubmitted || submittingScore || scoreSubmissionStatus?.pending}
                  data-tooltip={scoreSubmitted ? "Score already submitted" : "Submit your score to the leaderboard"}
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
              <button className="btn btn-primary game-action-btn" onClick={() => startRun(difficulty)} data-tooltip="Start a new run">
                <FiRepeat size={16} /> Play Again
              </button>
              <button className="btn btn-muted" onClick={() => setPhase("menu")} data-tooltip="Back to difficulty select">
                Menu
              </button>
              <button
                className="btn btn-muted game-action-btn"
                onClick={() => { setLbDifficulty(difficulty); setShowLeaderboard(true); fetchLeaderboard(difficulty, 1, lbView); }}
                data-tooltip="View top scores"
              >
                <FiAward size={16} /> Leaderboard
              </button>
            </div>

            {scoreSubmissionStatus && (
              <div className={`shikaku-end-status shikaku-end-status--${scoreSubmissionStatus.tone}${scoreSubmissionStatus.pending ? " shikaku-end-status--pending" : ""}`}>
                <span className="shikaku-end-status-label">{statusLabel}</span>
                <p className="shikaku-end-status-message">{scoreSubmissionStatus.message}</p>
              </div>
            )}

          </div>
        </div>
        </div>
        {leaderboardPanel}
      </>
    );
  }

  // Playing
  return (
    <>
      <div className="game-page shikaku-page" data-game-theme="shikaku" data-difficulty={difficulty}>
        <div className="shikaku-container">
        <div className="game-header">
          <div className="game-header-left">
            <div className="game-header-icon">
              <FiGrid size={20} />
            </div>
            <h1 className="game-title">Shikaku</h1>
            <span className="badge badge-warn" data-tooltip={challengeMode ? `Challenge — ${difficulty}` : infiniteMode ? `${infiniteSolved} solved — ∞ mode — ${difficulty}` : `Puzzle ${currentPuzzleIdx + 1} of ${PUZZLES_PER_RUN} — ${difficulty}`} data-tooltip-variant="info">
              {challengeMode
                ? <>Challenge / {difficulty}</>
                : infiniteMode
                  ? <>{infiniteSolved} solved <span style={{ opacity: 0.5 }}>∞</span> / {difficulty}</>
                  : <>{currentPuzzleIdx + 1} / {PUZZLES_PER_RUN} - {difficulty}</>}
            </span>
            <span className="badge" data-tooltip="Elapsed time" data-tooltip-variant="info" style={{ fontVariantNumeric: "tabular-nums" }}>
              <FiClock size={12} /> {formatTime(elapsedMs)}
            </span>
            {(infiniteMode || customMode) && (
              <span className="badge" data-tooltip={`Seed: ${seed} — click to copy`} data-tooltip-variant="info" style={{ cursor: "pointer", fontVariantNumeric: "tabular-nums" }}
                onClick={() => {
                  navigator.clipboard.writeText(String(seed)).then(() => showToast("Seed copied!", "info")).catch(() => {});
                }}
              >
                <FiHash size={12} /> {seed}{customMode && !challengeMode && <span style={{ opacity: 0.5 }}> / custom</span>}
              </span>
            )}
          </div>
        </div>

        {/* Puzzle solved overlay */}
        {showPuzzleSolvedAnim && (
          <div className="shikaku-solved-overlay">
            <div className="shikaku-solved-text"><FiCheck /> Solved!</div>
          </div>
        )}

        <ShikakuGridWrapper
          difficulty={difficulty}
          currentPuzzle={currentPuzzle}
          placedRects={placedRects}
          previewRect={previewRect}
          numberMap={numberMap}
          flashingRects={flashingRects}
          onCellMouseDown={handleCellMouseDown}
          onCellMouseEnter={handleCellMouseEnter}
          onCellRightClick={handleCellRightClick}
          onMouseUp={handleMouseUp}
          onScrollApi={handleScrollApi}
        />

        <div className="shikaku-playing-footer">
          <p className="shikaku-hint">Drag to draw — click to remove — right-click to remove</p>
          <div className="shikaku-footer-btns">
            {/* Scroll left / down — shown on mobile for expert */}
            {scrollApi?.isLarge && (
              <div className="shikaku-scroll-pair">
                <button className={`shikaku-icon-btn shikaku-icon-btn--scroll${scrollApi.canScroll.left ? " shikaku-icon-btn--scroll-active" : ""}`} onClick={() => scrollApi.doScroll(-160, 0)} aria-label="Scroll left">
                  <FiChevronLeft size={16} />
                </button>
                <button className={`shikaku-icon-btn shikaku-icon-btn--scroll${scrollApi.canScroll.down ? " shikaku-icon-btn--scroll-active" : ""}`} onClick={() => scrollApi.doScroll(0, 160)} aria-label="Scroll down">
                  <FiChevronDown size={16} />
                </button>
              </div>
            )}
            <button
              className="shikaku-icon-btn"
              onClick={undo}
              disabled={undoStack.length === 0}
              data-tooltip="Undo"
            >
              <FiCornerUpLeft size={16} />
            </button>
            <button
              className="shikaku-icon-btn"
              onClick={() => {
                setUndoStack((s) => [...s, placedRects]);
                setPlacedRects(autoFilledRects);
                setColorCounter(autoFilledRects.length);
                setFlashingRects(new Set());
              }}
              data-tooltip="Clear all"
            >
              <FiTrash2 size={16} />
            </button>
            <button
              className="shikaku-icon-btn shikaku-icon-btn--danger"
              onClick={() => { setLbDifficulty(difficulty); setShowLeaderboard(true); fetchLeaderboard(difficulty, 1, lbView); }}
              data-tooltip="Leaderboard"
            >
              <FiAward size={16} />
            </button>
            <button
              className="shikaku-icon-btn shikaku-icon-btn--restart"
              onClick={() => startRun(difficulty)}
              disabled={showPuzzleSolvedAnim}
              data-tooltip="Restart"
            >
              <FiRepeat size={16} />
            </button>
            <button
              className="shikaku-icon-btn shikaku-icon-btn--danger"
              onClick={openGiveUp}
              data-tooltip="Give up"
            >
              <FiFlag size={16} />
            </button>
            {/* Scroll up / right — shown on mobile for expert */}
            {scrollApi?.isLarge && (
              <div className="shikaku-scroll-pair">
                <button className={`shikaku-icon-btn shikaku-icon-btn--scroll${scrollApi.canScroll.up ? " shikaku-icon-btn--scroll-active" : ""}`} onClick={() => scrollApi.doScroll(0, -160)} aria-label="Scroll up">
                  <FiChevronUp size={16} />
                </button>
                <button className={`shikaku-icon-btn shikaku-icon-btn--scroll${scrollApi.canScroll.right ? " shikaku-icon-btn--scroll-active" : ""}`} onClick={() => scrollApi.doScroll(160, 0)} aria-label="Scroll right">
                  <FiChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>

        {confirmGiveUp && (
          <div className="shikaku-giveup-overlay" onClick={(e) => { if (e.target === e.currentTarget) cancelGiveUp(); }}>
            <div className="shikaku-giveup-modal">
              <div className="shikaku-giveup-icon"><FiFlag /></div>
              <p className="shikaku-giveup-title">{challengeMode ? "Abandon Puzzle?" : infiniteMode ? "End Run?" : "Give Up?"}</p>
              <p className="shikaku-giveup-sub">
                {challengeMode
                  ? "You haven't finished this challenge puzzle yet."
                  : infiniteMode
                  ? `You've solved ${infiniteSolved} puzzle${infiniteSolved !== 1 ? "s" : ""} so far. End and see your results?`
                  : <>You&apos;ve completed {puzzleTimes.length} of {PUZZLES_PER_RUN} puzzles. Your score will be penalized.</>}
              </p>
              <div className="shikaku-giveup-btns">
                <button className="btn btn-primary" style={{ background: "#f87171", borderColor: "#f87171" }} onClick={giveUp}>Give Up</button>
                <button className="btn btn-muted" onClick={cancelGiveUp}>Cancel</button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
      {leaderboardPanel}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Grid wrapper — scroll buttons for large puzzles on mobile  */
/* ═══════════════════════════════════════════════════════════ */
interface ScrollApi {
  canScroll: { up: boolean; down: boolean; left: boolean; right: boolean };
  doScroll: (dx: number, dy: number) => void;
  isLarge: boolean;
}

function ShikakuGridWrapper({
  difficulty,
  currentPuzzle,
  placedRects,
  previewRect,
  numberMap,
  flashingRects,
  onCellMouseDown,
  onCellMouseEnter,
  onCellRightClick,
  onMouseUp,
  onScrollApi,
}: {
  difficulty: Difficulty;
  currentPuzzle: ShikakuPuzzle | null;
  placedRects: PlacedRect[];
  previewRect: Rect | null;
  numberMap: Map<string, number>;
  flashingRects: Set<number>;
  onCellMouseDown: (r: number, c: number) => void;
  onCellMouseEnter: (r: number, c: number) => void;
  onCellRightClick: (r: number, c: number) => void;
  onMouseUp: () => void;
  onScrollApi?: (api: ScrollApi) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState({ up: false, down: false, left: false, right: false });
  const isLarge = difficulty === "expert" || difficulty === "hard";

  const updateScrollState = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const threshold = 2;
    setCanScroll({
      up: el.scrollTop > threshold,
      down: el.scrollTop + el.clientHeight < el.scrollHeight - threshold,
      left: el.scrollLeft > threshold,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - threshold,
    });
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !isLarge) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", updateScrollState); ro.disconnect(); };
  }, [isLarge, updateScrollState]);

  const doScroll = useCallback((dx: number, dy: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const maxLeft = el.scrollWidth - el.clientWidth;
    const maxTop = el.scrollHeight - el.clientHeight;
    // Compute the exact target — clamp to 0/max so we always reach the edge
    const targetLeft = Math.round(Math.min(Math.max(el.scrollLeft + dx, 0), maxLeft));
    const targetTop = Math.round(Math.min(Math.max(el.scrollTop + dy, 0), maxTop));
    if (targetLeft !== Math.round(el.scrollLeft) || targetTop !== Math.round(el.scrollTop)) {
      el.scrollTo({ left: targetLeft, top: targetTop, behavior: "smooth" });
    }
  }, []);

  // Expose scroll API to parent for footer buttons
  useEffect(() => {
    onScrollApi?.({ canScroll, doScroll, isLarge });
  }, [canScroll, doScroll, isLarge, onScrollApi]);

  return (
    <div className="shikaku-grid-outer">
      <div className="shikaku-grid-wrap" ref={wrapRef}>
        {currentPuzzle && (
          <ShikakuGrid
            puzzle={currentPuzzle}
            placedRects={placedRects}
            previewRect={previewRect}
            numberMap={numberMap}
            flashingRects={flashingRects}
            onCellMouseDown={onCellMouseDown}
            onCellMouseEnter={onCellMouseEnter}
            onCellRightClick={onCellRightClick}
            onMouseUp={onMouseUp}
            scrollContainerRef={isLarge ? wrapRef : null}
          />
        )}

        {/* Drag dimension counter — positioned at the preview rect */}
        {previewRect && currentPuzzle && (
          <div
            className="shikaku-dim-counter"
            style={{
              top: `${((previewRect.r + previewRect.h / 2) / currentPuzzle.rows) * 100}%`,
              left: `${((previewRect.c + previewRect.w / 2) / currentPuzzle.cols) * 100}%`,
            }}
          >
            {previewRect.w}×{previewRect.h}
          </div>
        )}
      </div>

      {/* Floating dim counter for large puzzles on mobile — stays visible during scroll */}
      {previewRect && currentPuzzle && isLarge && (
        <div className="shikaku-dim-counter shikaku-dim-counter--floating">
          {previewRect.w}×{previewRect.h}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Grid component                                             */
/* ═══════════════════════════════════════════════════════════ */
function ShikakuGrid({
  puzzle,
  placedRects,
  previewRect,
  numberMap,
  flashingRects,
  onCellMouseDown,
  onCellMouseEnter,
  onCellRightClick,
  onMouseUp,
  scrollContainerRef,
}: {
  puzzle: ShikakuPuzzle;
  placedRects: PlacedRect[];
  previewRect: Rect | null;
  numberMap: Map<string, number>;
  flashingRects: Set<number>;
  onCellMouseDown: (r: number, c: number) => void;
  onCellMouseEnter: (r: number, c: number) => void;
  onCellRightClick?: (r: number, c: number) => void;
  onMouseUp?: () => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null> | null;
}) {
  const { rows, cols } = puzzle;
  const gridRef = useRef<HTMLDivElement>(null);
  const lastTouchCell = useRef<string>("");

  const getCellFromTouch = useCallback((touch: React.Touch | Touch): { r: number; c: number } | null => {
    const el = gridRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null;
    const c = Math.floor((x / rect.width) * cols);
    const r = Math.floor((y / rect.height) * rows);
    return { r: Math.max(0, Math.min(rows - 1, r)), c: Math.max(0, Math.min(cols - 1, c)) };
  }, [rows, cols]);

  // Use refs to keep callbacks fresh without re-attaching listeners
  const onCellMouseDownRef = useRef(onCellMouseDown);
  const onCellMouseEnterRef = useRef(onCellMouseEnter);
  const onMouseUpRef = useRef(onMouseUp);
  const getCellFromTouchRef = useRef(getCellFromTouch);
  const scrollContainerRefRef = useRef(scrollContainerRef);
  onCellMouseDownRef.current = onCellMouseDown;
  onCellMouseEnterRef.current = onCellMouseEnter;
  onMouseUpRef.current = onMouseUp;
  getCellFromTouchRef.current = getCellFromTouch;
  scrollContainerRefRef.current = scrollContainerRef;

  // Auto-scroll state for dragging near edges
  const autoScrollRaf = useRef<number>(0);
  const autoScrollDir = useRef({ dx: 0, dy: 0 });

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRaf.current) {
      cancelAnimationFrame(autoScrollRaf.current);
      autoScrollRaf.current = 0;
    }
    autoScrollDir.current = { dx: 0, dy: 0 };
  }, []);

  const startAutoScroll = useCallback((dx: number, dy: number) => {
    if (autoScrollDir.current.dx === dx && autoScrollDir.current.dy === dy && autoScrollRaf.current) return;
    stopAutoScroll();
    if (!dx && !dy) return;
    autoScrollDir.current = { dx, dy };
    const tick = () => {
      const el = scrollContainerRefRef.current?.current;
      if (el) el.scrollBy(dx, dy);
      autoScrollRaf.current = requestAnimationFrame(tick);
    };
    autoScrollRaf.current = requestAnimationFrame(tick);
  }, [stopAutoScroll]);

  // Attach touch handlers natively with { passive: false } so preventDefault works
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 1) return; // allow two-finger scroll/zoom
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      const cell = getCellFromTouchRef.current(touch);
      if (!cell) return;
      lastTouchCell.current = `${cell.r},${cell.c}`;
      onCellMouseDownRef.current(cell.r, cell.c);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) return; // allow two-finger scroll/zoom
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;

      // Auto-scroll when dragging near edge of scroll container
      const scrollEl = scrollContainerRefRef.current?.current;
      if (scrollEl) {
        const wrapRect = scrollEl.getBoundingClientRect();
        const edgeZone = 40;
        const scrollSpeed = 4;
        let dx = 0, dy = 0;
        if (touch.clientX < wrapRect.left + edgeZone) dx = -scrollSpeed;
        else if (touch.clientX > wrapRect.right - edgeZone) dx = scrollSpeed;
        if (touch.clientY < wrapRect.top + edgeZone) dy = -scrollSpeed;
        else if (touch.clientY > wrapRect.bottom - edgeZone) dy = scrollSpeed;
        if (dx || dy) {
          startAutoScroll(dx, dy);
        } else {
          stopAutoScroll();
        }
      }

      const cell = getCellFromTouchRef.current(touch);
      if (!cell) return;
      const key = `${cell.r},${cell.c}`;
      if (key !== lastTouchCell.current) {
        lastTouchCell.current = key;
        onCellMouseEnterRef.current(cell.r, cell.c);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      stopAutoScroll();

      // The finger may have moved to a new cell between the last touchmove
      // and touchend — changedTouches has the final lift position
      const touch = e.changedTouches[0];
      if (touch) {
        const cell = getCellFromTouchRef.current(touch);
        if (cell) {
          const key = `${cell.r},${cell.c}`;
          if (key !== lastTouchCell.current) {
            onCellMouseEnterRef.current(cell.r, cell.c);
          }
        }
      }

      lastTouchCell.current = "";
      flushSync(() => {
        onMouseUpRef.current?.();
      });

      // Force browser repaint — mobile compositors sometimes skip painting
      // updated cells after a touch sequence ends
      requestAnimationFrame(() => {
        const g = gridRef.current;
        if (g) {
          void g.offsetHeight; // triggers synchronous reflow → forces repaint
        }
      });
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: false });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: false });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      stopAutoScroll();
    };
  }, [startAutoScroll, stopAutoScroll]);

  // Build a cell→rect lookup
  const cellRectMap = useMemo(() => {
    const map = new Map<string, number>();
    placedRects.forEach((pr, idx) => {
      for (let dr = 0; dr < pr.h; dr++) {
        for (let dc = 0; dc < pr.w; dc++) {
          map.set(`${pr.r + dr},${pr.c + dc}`, idx);
        }
      }
    });
    return map;
  }, [placedRects]);

  // Preview cells
  const previewCells = useMemo(() => {
    const set = new Set<string>();
    if (previewRect) {
      for (let dr = 0; dr < previewRect.h; dr++) {
        for (let dc = 0; dc < previewRect.w; dc++) {
          set.add(`${previewRect.r + dr},${previewRect.c + dc}`);
        }
      }
    }
    return set;
  }, [previewRect]);

  return (
    <div
      ref={gridRef}
      className="shikaku-grid"
      style={{
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const key = `${r},${c}`;
          const num = numberMap.get(key);
          const rectIdx = cellRectMap.get(key);
          const inPreview = previewCells.has(key);
          const placedRect = rectIdx !== undefined ? placedRects[rectIdx] : undefined;
          const rectColor = placedRect ? RECT_COLORS[placedRect.colorIndex] : undefined;
          const isFlashing = rectIdx !== undefined && flashingRects.has(rectIdx);
          const cellStyle = rectColor ? {
            "--rect-color": rectColor,
            "--rect-fill": withAlpha(rectColor, 0.38),
            "--rect-fill-strong": withAlpha(rectColor, 0.48),
            "--rect-fill-soft": withAlpha(rectColor, 0.14),
            "--rect-fill-flash": withAlpha(rectColor, 0.1),
            "--rect-stroke": withAlpha(rectColor, 0.22),
            "--rect-stroke-strong": withAlpha(rectColor, 0.28),
          } as React.CSSProperties : undefined;

          // Determine border edges
          let borderClass = "";
          if (placedRect) {
            if (r === placedRect.r) borderClass += " shikaku-cell--top";
            if (r === placedRect.r + placedRect.h - 1) borderClass += " shikaku-cell--bottom";
            if (c === placedRect.c) borderClass += " shikaku-cell--left";
            if (c === placedRect.c + placedRect.w - 1) borderClass += " shikaku-cell--right";
          }

          return (
            <div
              key={key}
              className={[
                "shikaku-cell",
                rectIdx !== undefined && "shikaku-cell--filled",
                inPreview && "shikaku-cell--preview",
                borderClass,
                num !== undefined && "shikaku-cell--has-num",
                isFlashing && "shikaku-cell--flash",
              ].filter(Boolean).join(" ")}
              style={cellStyle}
              onMouseDown={(e) => { e.preventDefault(); onCellMouseDown(r, c); }}
              onMouseEnter={() => { onCellMouseEnter(r, c); }}
              onContextMenu={(e) => { e.preventDefault(); if (onCellRightClick) onCellRightClick(r, c); }}
            >
              {num !== undefined && <span className="shikaku-num">{num}</span>}
            </div>
          );
        })
      )}
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────── */
function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(a.c + a.w <= b.c || b.c + b.w <= a.c || a.r + a.h <= b.r || b.r + b.h <= a.r);
}

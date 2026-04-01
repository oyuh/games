import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import { FiAward, FiCheck, FiChevronDown, FiChevronLeft, FiChevronRight, FiChevronUp, FiClock, FiCornerUpLeft, FiFlag, FiGrid, FiHelpCircle, FiRepeat, FiTrash2, FiUploadCloud, FiX } from "react-icons/fi";
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

type GamePhase = "menu" | "countdown" | "playing" | "puzzle-complete" | "finished";

/* ── Leaderboard entry type ───────────────────────────────── */
interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  timeMs: number;
  difficulty: Difficulty;
  createdAt: number;
  isOwn: boolean;
}

interface PersonalBest {
  score: number;
  timeMs: number;
  rank: number;
}

type LeaderboardView = "all" | "mine";
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

  /* ── Leaderboard fetch ──────────────────────────────────── */
  const [lbPage, setLbPage] = useState(1);
  const [lbTotalPages, setLbTotalPages] = useState(1);
  const [lbTotal, setLbTotal] = useState(0);
  const LB_PAGE_SIZE = 10;

  const fetchLeaderboard = useCallback(async (diff: Difficulty, pg = 1, view: LeaderboardView = lbView) => {
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

  // Timer
  useEffect(() => {
    if (phase !== "playing") return;
    const iv = setInterval(() => {
      const elapsed = Date.now() - startTime;
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

  useEffect(() => {
    setPlacedRects(autoFilledRects);
    setColorCounter(autoFilledRects.length);
    setFlashingRects(new Set());
    setUndoStack([]);
  }, [autoFilledRects]);

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
  const startRun = useCallback((diff: Difficulty) => {
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

    if (infiniteMode) {
      const rng = mulberry32(newSeed);
      infiniteRng.current = rng;
      const { rows, cols } = DIFFICULTY_CONFIG[diff];
      const firstPuzzle = generatePuzzle(rows, cols, rng);
      setPuzzles([firstPuzzle]);
      setInfiniteSolved(0);
    } else {
      infiniteRng.current = null;
      const generated = generateRun(newSeed, diff);
      setPuzzles(generated);
    }

    setPhase("countdown");
  }, [infiniteMode]);

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
      handlePuzzleSolved(newRects);
    }
  }, [autoFilledRects, colorCounter, currentPuzzle, isAutoFilledRect, isRectValid, placedRects]);

  /* ── Puzzle solved handler ──────────────────────────────── */
  const handlePuzzleSolved = useCallback((rects: PlacedRect[]) => {
    const now = Date.now();
    const puzzleTime = now - puzzleStartTime;

    setShowPuzzleSolvedAnim(true);

    if (infiniteMode) {
      // Infinite mode: always generate next puzzle
      setPuzzleTimes((prev) => [...prev, puzzleTime]);
      setInfiniteSolved((n) => n + 1);
      setTimeout(() => {
        setShowPuzzleSolvedAnim(false);
        const { rows, cols } = DIFFICULTY_CONFIG[difficulty];
        const nextPuzzle = generatePuzzle(rows, cols, infiniteRng.current!);
        setPuzzles([nextPuzzle]);
        setCurrentPuzzleIdx(0);
        setPlacedRects([]);
        setColorCounter(0);
        setFlashingRects(new Set());
        setUndoStack([]);
        setPuzzleStartTime(Date.now());
      }, 1200);
    } else if (currentPuzzleIdx < PUZZLES_PER_RUN - 1) {
      // Show solve animation, then next puzzle
      setPuzzleTimes((prev) => [...prev, puzzleTime]);
      setTimeout(() => {
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
      const totalTime = now - startTime;
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
  }, [currentPuzzleIdx, puzzleStartTime, startTime, difficulty, infiniteMode, fetchLeaderboard, lbView]);

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
    const totalTime = now - startTime;
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

  // Broadcast infinite mode + phase state so sidebar knows button state
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("shikaku-infinite-state", {
      detail: { enabled: infiniteMode, canToggle: phase === "menu" },
    }));
  }, [infiniteMode, phase]);

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
  }, [phase, scoreSubmitted, puzzleTimes.length, infiniteMode, seed, difficulty, finalScore, finalTimeMs, resolveScoreEligibility]);

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
    // Refresh leaderboard
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

  /* ═══════════════════════════════════════════════════════════
   *  RENDER
   * ═══════════════════════════════════════════════════════════ */

  // Countdown
  if (phase === "countdown") {
    return (
      <div className="game-page shikaku-page" data-game-theme="shikaku">
        <div className="shikaku-container">
          <div className="shikaku-countdown">
            <div className="shikaku-countdown-number" key={countdownNum}>
              {countdownNum > 0 ? countdownNum : "GO!"}
            </div>
            <p className="shikaku-countdown-label">
              {difficulty} — {infiniteMode ? "∞ mode" : `${PUZZLES_PER_RUN} puzzles`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Menu
  if (phase === "menu") {
    return (
      <div className="game-page shikaku-page" data-game-theme="shikaku">
        <div className="shikaku-container">
          <div className="shikaku-menu">
            <div className="shikaku-menu-hero">
              <h1 className="shikaku-title">Shikaku</h1>
              <p className="shikaku-subtitle">Divide the grid into rectangles — each must contain exactly one number equal to its area</p>
              <p className="shikaku-subtitle shikaku-scoring-hint">Score = 5,000 base pts × difficulty multiplier × speed bonus — beat the par time for a 2× bonus!</p>
            </div>

            <div className="shikaku-diff-grid">
              {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map((d) => (
                <button
                  key={d}
                  className={`shikaku-diff-btn ${d === difficulty ? "shikaku-diff-btn--active" : ""}`}
                  data-diff={d}
                  title={`${d.charAt(0).toUpperCase() + d.slice(1)} — ${DIFFICULTY_CONFIG[d].label} grid`}
                  onClick={() => {
                    if (d === difficulty) {
                      startRun(d);
                    } else {
                      setDifficulty(d);
                    }
                  }}
                >
                  <span className="shikaku-diff-label">{DIFFICULTY_CONFIG[d].label}</span>
                  <span className="shikaku-diff-name">{d}</span>
                </button>
              ))}
            </div>

            <p className="shikaku-menu-hint">
              {infiniteMode
                ? "∞ Infinite mode — play endlessly, no score submission"
                : `${PUZZLES_PER_RUN} puzzles per run — click selected to start`}
            </p>
            <button className="btn btn-muted shikaku-info-btn" onClick={() => setShowDemo(true)}>
              <FiHelpCircle size={16} /> How to Play
            </button>
          </div>

          {showLeaderboard && (
            <ShikakuLeaderboard
              entries={leaderboard}
              loading={leaderboardLoading}
              difficulty={lbDifficulty}
              view={lbView}
              personalBest={personalBest}
              onDiffChange={(d) => { setLbDifficulty(d); setLbPage(1); fetchLeaderboard(d, 1, lbView); }}
              onViewChange={(view) => { setLbView(view); setLbPage(1); fetchLeaderboard(lbDifficulty, 1, view); }}
              onClose={() => setShowLeaderboard(false)}
              formatTime={formatTime}
              page={lbPage}
              totalPages={lbTotalPages}
              total={lbTotal}
              onPageChange={(p) => { setLbPage(p); fetchLeaderboard(lbDifficulty, p, lbView); }}
            />
          )}
          {showDemo && <ShikakuDemo onClose={() => setShowDemo(false)} />}
        </div>
      </div>
    );
  }

  // Finished
  if (phase === "finished") {
    const completedCount = puzzleTimes.length;
    const gavUp = infiniteMode ? true : completedCount < PUZZLES_PER_RUN;
    const hasLeaderboard = leaderboard.length > 0 && !infiniteMode;
    const hasPuzzleTimes = puzzleTimes.length > 0;
    const showSubmitButton = !infiniteMode && (scoreSubmitted || submittingScore || Boolean(scoreSubmissionStatus?.canSubmit));
    const statusLabel = scoreSubmissionStatus?.pending
      ? (submittingScore ? "Submitting" : "Checking")
      : scoreSubmitted && scoreSubmissionStatus?.tone === "success"
        ? "Submitted"
        : scoreSubmissionStatus?.canSubmit
          ? "Ready"
          : "Submission";
    return (
      <div className="game-page shikaku-page" data-game-theme="shikaku">
        <div className="shikaku-end-wrap">
          <div className="shikaku-finished shikaku-finished-enter">
            {/* ── Header tile ── */}
            <div className={`shikaku-end-header ${gavUp && !infiniteMode ? "shikaku-end-header--fail" : "shikaku-end-header--success"}`}>
              <p className="shikaku-end-title">
                {infiniteMode ? "∞ Run Over" : gavUp ? "Run Over" : "Run Complete!"}
              </p>
              <p className="shikaku-end-sub">
                {infiniteMode
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
                    {infiniteMode && <span style={{ fontSize: "0.6em", opacity: 0.5, marginLeft: 4 }}>(unranked)</span>}
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
                {personalBest && !infiniteMode && (
                  <div className="shikaku-end-tile shikaku-end-tile--accent shikaku-stat-pop" style={{ animationDelay: "0.4s" }}>
                    <span className="shikaku-end-tile-label">Rank</span>
                    <span className="shikaku-end-tile-value">#{personalBest.rank}</span>
                  </div>
                )}
              </div>

              {/* Right column: puzzle times + leaderboard */}
              {(hasPuzzleTimes || hasLeaderboard) && (
                <div className="shikaku-end-lists">
                  {hasPuzzleTimes && (
                    <div className="shikaku-end-list-tile">
                      <div className="shikaku-end-list-header">
                        <span>Puzzle Times</span>
                      </div>
                      <div className="shikaku-end-list-body">
                        {puzzleTimes.map((t, i) => (
                          <div key={i} className="shikaku-end-list-row">
                            <span>Puzzle {i + 1}{gavUp && i === puzzleTimes.length - 1 ? " (incomplete)" : ""}</span>
                            <span>{formatTime(t)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {hasLeaderboard && (
                    <div className="shikaku-end-list-tile">
                      <div className="shikaku-end-list-header">
                        <span><FiAward size={12} style={{ marginRight: 4, verticalAlign: -1 }} />Top Scores</span>
                        <span>Time</span>
                      </div>
                      <div className="shikaku-end-list-body">
                        {leaderboard.slice(0, 5).map((entry, i) => (
                          <div key={entry.id} className={`shikaku-end-list-row${entry.isOwn ? " shikaku-end-list-row--self" : ""}`}>
                            <span>#{i + 1} {entry.name} — {entry.score.toLocaleString()}</span>
                            <span>{formatTime(entry.timeMs)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
                  title={scoreSubmitted ? "Score already submitted" : "Submit your score to the leaderboard"}
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
              <button className="btn btn-primary game-action-btn" onClick={() => startRun(difficulty)} title="Start a new run">
                <FiRepeat size={16} /> Play Again
              </button>
              <button className="btn btn-muted" onClick={() => setPhase("menu")} title="Back to difficulty select">
                Menu
              </button>
              {!infiniteMode && (
                <button
                  className="btn btn-muted"
                  onClick={() => { setLbDifficulty(difficulty); setShowLeaderboard(true); fetchLeaderboard(difficulty, 1, lbView); }}
                  title="View top scores"
                >
                  <FiAward size={16} /> Leaderboard
                </button>
              )}
            </div>

            {scoreSubmissionStatus && (
              <div className={`shikaku-end-status shikaku-end-status--${scoreSubmissionStatus.tone}${scoreSubmissionStatus.pending ? " shikaku-end-status--pending" : ""}`}>
                <span className="shikaku-end-status-label">{statusLabel}</span>
                <p className="shikaku-end-status-message">{scoreSubmissionStatus.message}</p>
              </div>
            )}

            {showLeaderboard && (
              <ShikakuLeaderboard
                entries={leaderboard}
                loading={leaderboardLoading}
                difficulty={lbDifficulty}
                view={lbView}
                personalBest={personalBest}
                onDiffChange={(d) => { setLbDifficulty(d); setLbPage(1); fetchLeaderboard(d, 1, lbView); }}
                onViewChange={(view) => { setLbView(view); setLbPage(1); fetchLeaderboard(lbDifficulty, 1, view); }}
                onClose={() => setShowLeaderboard(false)}
                formatTime={formatTime}
                page={lbPage}
                totalPages={lbTotalPages}
                total={lbTotal}
                onPageChange={(p) => { setLbPage(p); fetchLeaderboard(lbDifficulty, p, lbView); }}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // Playing
  return (
    <div className="game-page shikaku-page" data-game-theme="shikaku" data-difficulty={difficulty}>
      <div className="shikaku-container">
        <div className="game-header">
          <div className="game-header-left">
            <div className="game-header-icon">
              <FiGrid size={20} />
            </div>
            <h1 className="game-title">Shikaku</h1>
            <span className="badge badge-warn" data-tooltip={infiniteMode ? `${infiniteSolved} solved — ∞ mode` : `Puzzle ${currentPuzzleIdx + 1} of ${PUZZLES_PER_RUN}`} data-tooltip-variant="info">
              {infiniteMode ? <>{infiniteSolved} solved <span style={{ opacity: 0.5 }}>∞</span></> : `${currentPuzzleIdx + 1} / ${PUZZLES_PER_RUN}`}
            </span>
            <span className="badge" data-tooltip="Elapsed time" data-tooltip-variant="info" style={{ fontVariantNumeric: "tabular-nums" }}>
              <FiClock size={12} /> {formatTime(elapsedMs)}
            </span>
            <span className="badge badge-success" data-tooltip="Difficulty level" data-tooltip-variant="info">
              {difficulty}
            </span>
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

        {showLeaderboard && (
          <ShikakuLeaderboard
            entries={leaderboard}
            loading={leaderboardLoading}
            difficulty={lbDifficulty}
            view={lbView}
            personalBest={personalBest}
            onDiffChange={(d) => { setLbDifficulty(d); setLbPage(1); fetchLeaderboard(d, 1, lbView); }}
            onViewChange={(view) => { setLbView(view); setLbPage(1); fetchLeaderboard(lbDifficulty, 1, view); }}
            onClose={() => setShowLeaderboard(false)}
            formatTime={formatTime}
            page={lbPage}
            totalPages={lbTotalPages}
            total={lbTotal}
            onPageChange={(p) => { setLbPage(p); fetchLeaderboard(lbDifficulty, p, lbView); }}
          />
        )}

        {confirmGiveUp && (
          <div className="shikaku-giveup-overlay" onClick={(e) => { if (e.target === e.currentTarget) cancelGiveUp(); }}>
            <div className="shikaku-giveup-modal">
              <div className="shikaku-giveup-icon"><FiFlag /></div>
              <p className="shikaku-giveup-title">{infiniteMode ? "End Run?" : "Give Up?"}</p>
              <p className="shikaku-giveup-sub">
                {infiniteMode
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

/* ═══════════════════════════════════════════════════════════ */
/*  Leaderboard component                                      */
/* ═══════════════════════════════════════════════════════════ */
function ShikakuLeaderboard({
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
}) {
  const pageSize = 10;
  return (
    <div className="shikaku-leaderboard-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="shikaku-leaderboard">
        <div className="shikaku-lb-header">
          <h2><FiAward size={18} /> Leaderboard</h2>
          <button className="shikaku-icon-btn" onClick={onClose} aria-label="Close" data-tooltip="Close">
            <FiX size={18} />
          </button>
        </div>

        <div className="shikaku-lb-tabs">
          {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map((d) => (
            <button
              key={d}
              className={`shikaku-lb-tab ${d === difficulty ? "shikaku-lb-tab--active" : ""}`}
              onClick={() => onDiffChange(d)}
              data-tooltip={`${DIFFICULTY_CONFIG[d].label} grid`}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="shikaku-lb-personal-best">
          {personalBest ? (
            <>
              <span className="shikaku-lb-pb-label" data-tooltip="Your highest score on this difficulty">Your Best — #{personalBest.rank}</span>
              <span className="shikaku-lb-pb-value">{personalBest.score.toLocaleString()} — {formatTime(personalBest.timeMs)}</span>
            </>
          ) : (
            <span className="shikaku-lb-pb-none">No personal best yet — play a round!</span>
          )}
        </div>

        <div className="shikaku-lb-toolbar">
          <div className="shikaku-lb-view-toggle" role="tablist" aria-label="Leaderboard view filter">
            <button
              className={`shikaku-lb-view-btn ${view === "all" ? "shikaku-lb-view-btn--active" : ""}`}
              onClick={() => onViewChange("all")}
            >
              All Scores
            </button>
            <button
              className={`shikaku-lb-view-btn ${view === "mine" ? "shikaku-lb-view-btn--active" : ""}`}
              onClick={() => onViewChange("mine")}
            >
              My Scores
            </button>
          </div>
          <span className="shikaku-lb-count">{total} {total === 1 ? "score" : "scores"}</span>
        </div>

        {loading ? (
          <p className="shikaku-lb-loading">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="shikaku-lb-empty">{view === "mine" ? "You have no saved scores on this difficulty yet." : "No scores yet — be the first!"}</p>
        ) : (
          <div className="shikaku-lb-list">
            <div className="shikaku-lb-col-header">
              <span data-tooltip="Player ranking">#</span>
              <span data-tooltip="Player name">Player</span>
              <span data-tooltip="Points earned">Score</span>
              <span data-tooltip="Completion time">Time</span>
            </div>
            {entries.map((entry, i) => {
              const rank = (page - 1) * pageSize + i + 1;
              return (
                <div key={entry.id} className={`shikaku-lb-row${rank <= 3 ? ` shikaku-lb-row--top${rank}` : ""}${entry.isOwn ? " shikaku-lb-row--self" : ""}`}
                  data-tooltip={entry.isOwn ? "Your score" : undefined}
                >
                  <span className="shikaku-lb-rank">#{rank}</span>
                  <div className="shikaku-lb-player">
                    <span className="shikaku-lb-name">{entry.name}</span>
                    {entry.isOwn && <span className="shikaku-lb-badge">You</span>}
                  </div>
                  <span className="shikaku-lb-score">{entry.score.toLocaleString()}</span>
                  <span className="shikaku-lb-time">{formatTime(entry.timeMs)}</span>
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="shikaku-lb-pagination">
            <button
              className="shikaku-lb-page-btn"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1 || loading}
            >
              ←
            </button>
            <span className="shikaku-lb-page-info">
              Page {page} of {totalPages} ({total} scores)
            </span>
            <button
              className="shikaku-lb-page-btn"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages || loading}
            >
              →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────── */
function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(a.c + a.w <= b.c || b.c + b.w <= a.c || a.r + a.h <= b.r || b.r + b.h <= a.r);
}

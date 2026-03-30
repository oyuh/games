import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiAward, FiCheck, FiClock, FiCornerUpLeft, FiFlag, FiGrid, FiHelpCircle, FiRepeat, FiTrash2, FiX } from "react-icons/fi";
import {
  calculateScore,
  Difficulty,
  DIFFICULTY_CONFIG,
  generateRun,
  PlacedRect,
  PUZZLES_PER_RUN,
  Rect,
  ShikakuPuzzle,
  validateSolution,
} from "../lib/shikaku-engine";
import { getOrCreateSessionId, getStoredName } from "../lib/session";
import { showToast } from "../lib/toast";
import "../styles/game-shared.css";
import "../styles/shikaku.css";
import { ShikakuDemo } from "../components/demos/ShikakuDemo";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/* ── Palette for rectangles ───────────────────────────────── */
const RECT_COLORS = [
  "#34d399", "#60a5fa", "#f472b6", "#a78bfa", "#fb923c",
  "#facc15", "#4ade80", "#38bdf8", "#f87171", "#c084fc",
  "#2dd4bf", "#fbbf24", "#818cf8", "#e879f9", "#22d3ee",
  "#a3e635", "#fb7185", "#fdba74", "#86efac", "#93c5fd",
];

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

/* ═══════════════════════════════════════════════════════════ */
/*  ShikakuPage                                               */
/* ═══════════════════════════════════════════════════════════ */
export function ShikakuPage() {
  const navigate = useNavigate();
  const sessionId = getOrCreateSessionId();
  const playerName = getStoredName() || "Anonymous";

  const [phase, setPhase] = useState<GamePhase>("menu");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
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

  // Flash invalid rects
  const [flashingRects, setFlashingRects] = useState<Set<number>>(new Set());

  // Undo stack
  const [undoStack, setUndoStack] = useState<PlacedRect[][]>([]);

  // Give-up confirmation
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [personalBest, setPersonalBest] = useState<PersonalBest | null>(null);

  // Final score
  const [finalScore, setFinalScore] = useState(0);
  const [finalTimeMs, setFinalTimeMs] = useState(0);

  // Completion animation
  const [showPuzzleSolvedAnim, setShowPuzzleSolvedAnim] = useState(false);

  // Timer
  useEffect(() => {
    if (phase !== "playing") return;
    const iv = setInterval(() => {
      setElapsedMs(Date.now() - startTime);
    }, 50);
    return () => clearInterval(iv);
  }, [phase, startTime]);

  const currentPuzzle = puzzles[currentPuzzleIdx] ?? null;

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
    const generated = generateRun(newSeed, diff);
    setSeed(newSeed);
    setPuzzles(generated);
    setCurrentPuzzleIdx(0);
    setPlacedRects([]);
    setColorCounter(0);
    setElapsedMs(0);
    setPuzzleTimes([]);
    setFlashingRects(new Set());
    setUndoStack([]);
    setDifficulty(diff);
    setCountdownNum(3);
    setPhase("countdown");
  }, []);

  /* ── Check if a placed rect is "valid" (exactly 1 number, area matches) ── */
  const isRectValid = useCallback((rect: Rect): boolean => {
    if (!currentPuzzle) return false;
    const nums = currentPuzzle.numbers.filter(
      (n) => n.r >= rect.r && n.r < rect.r + rect.h && n.c >= rect.c && n.c < rect.c + rect.w
    );
    return nums.length === 1 && nums[0].value === rect.w * rect.h;
  }, [currentPuzzle]);

  /* ── Place a rectangle (with overlap override) ──────────── */
  const placeRect = useCallback((rect: Rect) => {
    if (!currentPuzzle) return;

    // Validate bounds
    if (rect.r < 0 || rect.c < 0 || rect.r + rect.h > currentPuzzle.rows || rect.c + rect.w > currentPuzzle.cols) return;

    // Remove any overlapping existing rects (override behavior)
    const surviving = placedRects.filter((pr) => !rectsOverlap(rect, pr));

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
  }, [currentPuzzle, placedRects, colorCounter, currentPuzzleIdx, startTime, isRectValid]);

  /* ── Puzzle solved handler ──────────────────────────────── */
  const handlePuzzleSolved = useCallback((rects: PlacedRect[]) => {
    const now = Date.now();
    const puzzleTime = now - puzzleStartTime;

    setShowPuzzleSolvedAnim(true);

    if (currentPuzzleIdx < PUZZLES_PER_RUN - 1) {
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

        // Submit score
        submitScore(seed, difficulty, score, totalTime);
      }, 1200);
    }
  }, [currentPuzzleIdx, puzzleStartTime, startTime, difficulty, seed]);

  /* ── Remove a rectangle by index ─────────────────────────── */
  const removeRect = useCallback((index: number) => {
    setUndoStack((prev) => [...prev, placedRects]);
    const newRects = placedRects.filter((_, i) => i !== index);
    setPlacedRects(newRects);
    // Recompute flashing
    const nextFlashing = new Set<number>();
    newRects.forEach((pr, i) => { if (!isRectValid(pr)) nextFlashing.add(i); });
    setFlashingRects(nextFlashing);
  }, [placedRects, currentPuzzleIdx, startTime, isRectValid]);

  /* ── Undo last action ───────────────────────────────────── */
  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
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
    pressedRectIdx.current = existingIdx;
    setDragStart({ r, c });
    setDragEnd({ r, c });
    setIsDragging(true);
  }, [placedRects, showPuzzleSolvedAnim]);

  const handleCellMouseEnter = useCallback((r: number, c: number) => {
    if (!isDragging) return;
    didDrag.current = true;
    setDragEnd({ r, c });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging || !dragStart || !dragEnd) {
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

    const r1 = Math.min(dragStart.r, dragEnd.r);
    const c1 = Math.min(dragStart.c, dragEnd.c);
    const r2 = Math.max(dragStart.r, dragEnd.r);
    const c2 = Math.max(dragStart.c, dragEnd.c);

    placeRect({ r: r1, c: c1, w: c2 - c1 + 1, h: r2 - r1 + 1 });

    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
    pressedRectIdx.current = -1;
  }, [isDragging, dragStart, dragEnd, placeRect, removeRect]);

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
    // Calculate partial score (penalized)
    const completedPuzzles = puzzleTimes.length;
    const partialMultiplier = completedPuzzles / PUZZLES_PER_RUN;
    const rawScore = calculateScore(totalTime, difficulty);
    const score = Math.round(rawScore * partialMultiplier * 0.5); // 50% penalty on top of partial
    setFinalScore(score);
    setFinalTimeMs(totalTime);
    // Add current puzzle time
    const puzzleTime = now - puzzleStartTime;
    setPuzzleTimes((prev) => [...prev, puzzleTime]);
    setPhase("finished");

    submitScore(seed, difficulty, score, totalTime);
  }, [startTime, puzzleTimes, difficulty, seed, puzzleStartTime]);

  /* ── Leaderboard fetch ──────────────────────────────────── */
  const fetchLeaderboard = useCallback(async (diff: Difficulty) => {
    setLeaderboardLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/shikaku/leaderboard?difficulty=${encodeURIComponent(diff)}&limit=10&sessionId=${encodeURIComponent(sessionId)}`);
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data.entries ?? []);
        setPersonalBest(data.personalBest ?? null);
      }
    } catch {
      // silent
    } finally {
      setLeaderboardLoading(false);
    }
  }, [sessionId]);

  // Listen for sidebar leaderboard toggle
  useEffect(() => {
    const handler = () => {
      setShowLeaderboard((v) => {
        if (!v) fetchLeaderboard(difficulty);
        return !v;
      });
    };
    window.addEventListener("shikaku-toggle-leaderboard", handler);
    return () => window.removeEventListener("shikaku-toggle-leaderboard", handler);
  }, [difficulty, fetchLeaderboard]);

  /* ── Score submission ───────────────────────────────────── */
  const submitScore = useCallback(async (
    runSeed: number, diff: Difficulty, score: number, timeMs: number
  ) => {
    try {
      const res = await fetch(`${API_BASE}/api/shikaku/score`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-zero-user-id": sessionId,
        },
        body: JSON.stringify({
          sessionId,
          name: playerName,
          seed: runSeed,
          difficulty: diff,
          score,
          timeMs,
          puzzleCount: PUZZLES_PER_RUN,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null;
        if (res.status === 409) {
          showToast("Score already submitted for this run", "info");
        } else if (data?.error === "Score rejected") {
          showToast("Score could not be verified", "error");
        }
      }
    } catch {
      // silent — score still shows locally
    }
    // Fetch leaderboard after submission so rank/scores show on the finished screen
    fetchLeaderboard(diff);
  }, [sessionId, playerName, fetchLeaderboard]);

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
              {difficulty} — {PUZZLES_PER_RUN} puzzles
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

            <p className="shikaku-menu-hint">{PUZZLES_PER_RUN} puzzles per run — click selected to start</p>
            <button className="btn btn-muted shikaku-info-btn" onClick={() => setShowDemo(true)}>
              <FiHelpCircle size={16} /> How to Play
            </button>
          </div>

          {showLeaderboard && (
            <ShikakuLeaderboard
              entries={leaderboard}
              loading={leaderboardLoading}
              difficulty={difficulty}
              personalBest={personalBest}
              onDiffChange={(d) => { setDifficulty(d); fetchLeaderboard(d); }}
              onClose={() => setShowLeaderboard(false)}
              formatTime={formatTime}
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
    const gavUp = completedCount < PUZZLES_PER_RUN;
    return (
      <div className="game-page shikaku-page" data-game-theme="shikaku">
        <div className="shikaku-container">
          <div className="shikaku-finished shikaku-finished-enter">
            <div className={`game-reveal-card ${gavUp ? "game-reveal-card--fail" : "game-reveal-card--success"}`}>
              <p className="game-reveal-title">
                {gavUp ? "Run Over" : "Run Complete!"}
              </p>
              <p className="game-reveal-sub">
                {gavUp ? `Completed ${completedCount - 1} of ${PUZZLES_PER_RUN} puzzles` : `All ${PUZZLES_PER_RUN} puzzles solved!`}
              </p>
            </div>

            <div className="shikaku-stats">
              <div className="shikaku-stat shikaku-stat-pop" style={{ animationDelay: "0.1s" }}>
                <span className="shikaku-stat-label">Time</span>
                <span className="shikaku-stat-value">{formatTime(finalTimeMs)}</span>
              </div>
              <div className="shikaku-stat shikaku-stat-pop" style={{ animationDelay: "0.25s" }}>
                <span className="shikaku-stat-label">Score</span>
                <span className="shikaku-stat-value">{finalScore.toLocaleString()}</span>
              </div>
              <div className="shikaku-stat shikaku-stat-pop" style={{ animationDelay: "0.4s" }}>
                <span className="shikaku-stat-label">Difficulty</span>
                <span className="shikaku-stat-value" style={{ textTransform: "capitalize" }}>{difficulty}</span>
              </div>
              {personalBest && (
                <div className="shikaku-stat shikaku-stat-pop" style={{ animationDelay: "0.55s" }}>
                  <span className="shikaku-stat-label">Rank</span>
                  <span className="shikaku-stat-value">#{personalBest.rank}</span>
                </div>
              )}
            </div>

            {puzzleTimes.length > 0 && (
              <div className="shikaku-puzzle-times">
                {puzzleTimes.map((t, i) => (
                  <div key={i} className="shikaku-puzzle-time">
                    <span>Puzzle {i + 1}{gavUp && i === puzzleTimes.length - 1 ? " (incomplete)" : ""}</span>
                    <span>{formatTime(t)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Inline top scores from DB */}
            {leaderboard.length > 0 && (
              <div className="shikaku-puzzle-times" style={{ marginTop: "0.5rem" }}>
                <div className="shikaku-puzzle-time" style={{ opacity: 0.6, fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  <span><FiAward size={12} style={{ marginRight: 4, verticalAlign: -1 }} />Top Scores</span>
                  <span>Time</span>
                </div>
                {leaderboard.slice(0, 5).map((entry, i) => (
                  <div key={entry.id} className={`shikaku-puzzle-time${entry.isOwn ? " shikaku-lb-row--self" : ""}`}>
                    <span>#{i + 1} {entry.name} — {entry.score.toLocaleString()}</span>
                    <span>{formatTime(entry.timeMs)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="game-actions" style={{ justifyContent: "center", width: "100%" }}>
              <button className="btn btn-primary game-action-btn" onClick={() => startRun(difficulty)} title="Start a new run">
                <FiRepeat size={16} /> Play Again
              </button>
              <button className="btn btn-muted" onClick={() => setPhase("menu")} title="Back to difficulty select">
                Menu
              </button>
              <button
                className="btn btn-muted"
                onClick={() => { setShowLeaderboard(true); fetchLeaderboard(difficulty); }}
                title="View top scores"
              >
                <FiAward size={16} /> Leaderboard
              </button>
            </div>

            {showLeaderboard && (
              <ShikakuLeaderboard
                entries={leaderboard}
                loading={leaderboardLoading}
                difficulty={difficulty}
                personalBest={personalBest}
                onDiffChange={(d) => { setDifficulty(d); fetchLeaderboard(d); }}
                onClose={() => setShowLeaderboard(false)}
                formatTime={formatTime}
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
            <span className="badge badge-warn" data-tooltip={`Puzzle ${currentPuzzleIdx + 1} of ${PUZZLES_PER_RUN}`} data-tooltip-variant="info">
              {currentPuzzleIdx + 1} / {PUZZLES_PER_RUN}
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

        <div className="shikaku-grid-wrap">
          {currentPuzzle && (
            <ShikakuGrid
              puzzle={currentPuzzle}
              placedRects={placedRects}
              previewRect={previewRect}
              numberMap={numberMap}
              flashingRects={flashingRects}
              onCellMouseDown={handleCellMouseDown}
              onCellMouseEnter={handleCellMouseEnter}
              onCellRightClick={handleCellRightClick}
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

        <div className="shikaku-playing-footer">
          <p className="shikaku-hint">Drag to draw — click to remove — right-click to remove</p>
          <div className="shikaku-footer-btns">
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
              onClick={() => { setUndoStack((s) => [...s, placedRects]); setPlacedRects([]); setFlashingRects(new Set()); }}
              data-tooltip="Clear all"
            >
              <FiTrash2 size={16} />
            </button>
            <button
              className="shikaku-icon-btn shikaku-icon-btn--danger"
              onClick={() => { setShowLeaderboard(true); fetchLeaderboard(difficulty); }}
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
          </div>
        </div>

        {showLeaderboard && (
          <ShikakuLeaderboard
            entries={leaderboard}
            loading={leaderboardLoading}
            difficulty={difficulty}
            personalBest={personalBest}
            onDiffChange={(d) => { setDifficulty(d); fetchLeaderboard(d); }}
            onClose={() => setShowLeaderboard(false)}
            formatTime={formatTime}
          />
        )}

        {confirmGiveUp && (
          <div className="shikaku-giveup-overlay" onClick={(e) => { if (e.target === e.currentTarget) cancelGiveUp(); }}>
            <div className="shikaku-giveup-modal">
              <div className="shikaku-giveup-icon"><FiFlag /></div>
              <p className="shikaku-giveup-title">Give Up?</p>
              <p className="shikaku-giveup-sub">
                You&apos;ve completed {puzzleTimes.length} of {PUZZLES_PER_RUN} puzzles. Your score will be penalized.
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
}: {
  puzzle: ShikakuPuzzle;
  placedRects: PlacedRect[];
  previewRect: Rect | null;
  numberMap: Map<string, number>;
  flashingRects: Set<number>;
  onCellMouseDown: (r: number, c: number) => void;
  onCellMouseEnter: (r: number, c: number) => void;
  onCellRightClick?: (r: number, c: number) => void;
}) {
  const { rows, cols } = puzzle;

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
          const rectColor = rectIdx !== undefined ? RECT_COLORS[placedRects[rectIdx].colorIndex] : undefined;
          const isFlashing = rectIdx !== undefined && flashingRects.has(rectIdx);

          // Determine border edges
          let borderClass = "";
          if (rectIdx !== undefined) {
            const pr = placedRects[rectIdx];
            if (r === pr.r) borderClass += " shikaku-cell--top";
            if (r === pr.r + pr.h - 1) borderClass += " shikaku-cell--bottom";
            if (c === pr.c) borderClass += " shikaku-cell--left";
            if (c === pr.c + pr.w - 1) borderClass += " shikaku-cell--right";
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
              style={rectColor ? { "--rect-color": rectColor } as React.CSSProperties : undefined}
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
  personalBest,
  onDiffChange,
  onClose,
  formatTime,
}: {
  entries: LeaderboardEntry[];
  loading: boolean;
  difficulty: Difficulty;
  personalBest: PersonalBest | null;
  onDiffChange: (d: Difficulty) => void;
  onClose: () => void;
  formatTime: (ms: number) => string;
}) {
  return (
    <div className="shikaku-leaderboard-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="shikaku-leaderboard">
        <div className="shikaku-lb-header">
          <h2><FiAward size={18} /> Leaderboard</h2>
          <button className="shikaku-icon-btn" onClick={onClose} aria-label="Close" title="Close leaderboard">
            <FiX size={18} />
          </button>
        </div>

        <div className="shikaku-lb-tabs">
          {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map((d) => (
            <button
              key={d}
              className={`shikaku-lb-tab ${d === difficulty ? "shikaku-lb-tab--active" : ""}`}
              onClick={() => onDiffChange(d)}
              title={`${DIFFICULTY_CONFIG[d].label} grid`}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="shikaku-lb-personal-best">
          {personalBest ? (
            <>
              <span className="shikaku-lb-pb-label">Your Best — #{personalBest.rank}</span>
              <span className="shikaku-lb-pb-value">{personalBest.score.toLocaleString()} — {formatTime(personalBest.timeMs)}</span>
            </>
          ) : (
            <span className="shikaku-lb-pb-none">No personal best yet — play a round!</span>
          )}
        </div>

        {loading ? (
          <p className="shikaku-lb-loading">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="shikaku-lb-empty">No scores yet — be the first!</p>
        ) : (
          <div className="shikaku-lb-list">
            {entries.map((entry, i) => (
              <div key={entry.id} className={`shikaku-lb-row${i < 3 ? ` shikaku-lb-row--top${i + 1}` : ""}${entry.isOwn ? " shikaku-lb-row--self" : ""}`}>
                <span className="shikaku-lb-rank">#{i + 1}</span>
                <span className="shikaku-lb-name">{entry.name}</span>
                <span className="shikaku-lb-score">{entry.score.toLocaleString()}</span>
                <span className="shikaku-lb-time">{formatTime(entry.timeMs)}</span>
              </div>
            ))}
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

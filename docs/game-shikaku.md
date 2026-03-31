# Shikaku

> **Status:** Implemented
> **Players:** 1 (single-player)
> **Type:** Timed logic puzzle

---

## Core Idea

Shikaku is a grid-based logic puzzle. The board has numbered cells — each number must be covered by a rectangle whose area equals that number. Every cell on the grid must be covered by exactly one rectangle, and rectangles cannot overlap.

**What it tests:** spatial reasoning, pattern recognition, logic under time pressure.

---

## How to Play

1. **Pick a difficulty** — Choose from Easy (5×5), Medium (9×9), Hard (15×15), or Expert (22×22).
2. **Solve puzzles** — Click and drag on the grid to place rectangles. Each rectangle must contain exactly one number, and the rectangle's area must equal that number.
3. **Complete the run** — Solve all 5 puzzles as fast as possible. Your score is based on speed and difficulty.
4. **Check the leaderboard** — Your score is submitted automatically and ranked against other players per difficulty.

---

## Game Modes

### Standard Mode

- 5 puzzles per run, timed.
- Score is calculated from total solve time and difficulty multiplier.
- Score is submitted to the server-side leaderboard on completion.
- Giving up early submits a penalized partial score (50% penalty on top of the partial completion ratio).

### Infinite Mode

- Endless puzzles generated on-the-fly with seeded RNG.
- No score submission — play for fun or practice.
- Give up at any time to see your stats (puzzles solved, time, unranked score).
- Toggle from the sidebar ∞ button (only available on the menu screen).

---

## Difficulty Levels

| Difficulty | Grid Size | Par Time (per puzzle) | Score Multiplier |
|------------|-----------|----------------------|------------------|
| **Easy** | 5×5 | 30s | 1.0× |
| **Medium** | 9×9 | 60s | 1.5× |
| **Hard** | 15×15 | 90s | 2.2× |
| **Expert** | 22×22 | 120s | 3.0× |

---

## Scoring

```
Score = basePts × difficultyMultiplier × timeBonus
```

- **Base points:** 1,000 per puzzle (5,000 for a full run)
- **Time bonus:** `max(0.1, 2 − totalTime / parTime)` — beating par time doubles the multiplier, slower times reduce it
- **Give-up penalty:** `rawScore × (completedPuzzles / 5) × 0.5`

### Infinite Mode Scoring (Unranked)

- 500 points per puzzle solved × difficulty multiplier
- Not submitted to the leaderboard

---

## Controls

| Action | Input |
|--------|-------|
| Place rectangle | Click and drag on empty cells |
| Remove rectangle | Click on a placed rectangle, or right-click |
| Undo | Undo button in toolbar |
| Clear all | Clear button in toolbar |

Invalid rectangles (wrong area, no number, multiple numbers) flash red and are auto-removed.

---

## Leaderboard

- Top 10 scores displayed per difficulty level.
- Personal best rank and score shown.
- Scores submitted automatically on standard run completion.
- Server-side validation: minimum time checks, max score caps, duplicate seed protection, ban checks.
- Accessible from the sidebar trophy button or the finished screen.

---

## Puzzle Generation

- Puzzles are generated client-side using a seeded PRNG (mulberry32).
- The generator randomly partitions the grid into rectangles, places numbers, then verifies unique solvability with a backtracking solver.
- Standard mode generates all 5 puzzles upfront from one seed. Infinite mode generates one at a time.

---

## Technical Notes

- **Route:** `/shikaku` (no game ID — single-player, no Zero sync)
- **State:** Entirely client-side React state. No multiplayer data model.
- **API:** REST endpoints for leaderboard (`GET /api/shikaku/leaderboard`) and score submission (`POST /api/shikaku/score`).
- **Schema:** `shikaku_scores` table stores sessionId, name, seed, difficulty, score, timeMs, puzzleCount, and replayData.
- **Engine:** `apps/web/src/lib/shikaku-engine.ts` contains generation, validation, scoring, and seeded PRNG.
- **No mobile version** — desktop only.

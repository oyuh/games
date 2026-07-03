# Shikaku

> **Status:** Implemented
> **Players:** 1 (single-player)
> **Type:** Timed logic puzzle

---

## Core Idea

Shikaku is a grid-based logic puzzle. The board has numbered cells, and each number must be covered by a rectangle whose area equals that number. Every cell on the grid has to end up covered by exactly one rectangle, and rectangles can't overlap.

**What it tests:** spatial reasoning, pattern recognition, and logic under time pressure.

---

## How to Play

1. **Pick a difficulty.** Easy (5x5), Medium (9x9), Hard (15x15), or Expert (22x22).
2. **Solve puzzles.** Click and drag on the grid to place rectangles. Each rectangle must contain exactly one number, and its area must equal that number. Cells with a `1` clue are auto-filled as locked `1x1` rectangles when the puzzle starts.
3. **Complete the run.** Solve all 5 puzzles as fast as you can. Your score is based on speed and difficulty.
4. **Check the leaderboard.** Your score is submitted automatically and ranked against other players per difficulty.

---

## Game Modes

### Standard Mode

- 5 puzzles per run, timed.
- Score is calculated from total solve time and the difficulty multiplier.
- A completed run can be submitted to the server-side leaderboard.
- Giving up early ends the run unranked and shows a penalized local score only.

### Infinite Mode

- Endless puzzles generated on the fly with seeded RNG.
- No score submission; this one's for fun or practice.
- Give up at any time to see your stats (puzzles solved, time, unranked score).
- Toggle it from the sidebar ∞ button (only available on the menu screen).

---

## Difficulty Levels

| Difficulty | Grid Size | Par Time (per puzzle) | Score Multiplier |
|------------|-----------|----------------------|------------------|
| **Easy** | 5x5 | 30s | 1.0x |
| **Medium** | 9x9 | 60s | 1.5x |
| **Hard** | 15x15 | 90s | 2.2x |
| **Expert** | 22x22 | 120s | 3.0x |

---

## Scoring

```
Score = basePts x difficultyMultiplier x timeBonus
```

- **Base points:** 1,000 per puzzle (5,000 for a full run)
- **Time bonus:** `max(0.1, 2 - totalTime / parTime)`. Beating par doubles the multiplier; slower times shrink it.
- **Give-up penalty:** `rawScore x (completedPuzzles / 5) x 0.5`

### Infinite Mode Scoring (Unranked)

- 500 points per puzzle solved, times the difficulty multiplier.
- Never submitted to the leaderboard.

---

## Controls

| Action | Input |
|--------|-------|
| Place rectangle | Click and drag on empty cells |
| Remove rectangle | Click a placed rectangle, or right-click |
| Undo | Undo button in the toolbar |
| Clear all | Clear button in the toolbar |

Invalid rectangles (wrong area, no number, multiple numbers) flash red and get auto-removed.

---

## Leaderboard

- Top 10 scores shown per difficulty level.
- Your personal best rank and score are shown too.
- Completed standard runs are checked for eligibility before submission.
- Server-side validation covers a lot: session proof, canonical replay verification, minimum time checks, exact score recalculation, duplicate seed protection, top-20 replacement, rate limits, and ban checks.
- Reachable from the sidebar trophy button or the finished screen.

---

## Puzzle Generation

- Puzzles are generated client-side using a seeded PRNG (mulberry32).
- The generator randomly partitions the grid into rectangles, places numbers, then verifies unique solvability with a backtracking solver.
- Standard mode generates all 5 puzzles upfront from one seed. Infinite mode generates one at a time.

---

## Technical Engine Flow

The Shikaku engine lives in `packages/shared/src/games/shikaku-engine.ts` and is imported by both the web app and the API. The browser still generates and validates puzzles locally, so Shikaku stays playable even when the API is down; ranked leaderboard writes simply wait until the REST API can verify the run.

For generation, the engine feeds a public run seed into `mulberry32`, picks the configured grid size for the difficulty, and creates five puzzles. Each puzzle is built by partitioning the grid into non-overlapping rectangles, placing one numeric clue inside each rectangle, validating the hidden solution, then running a bounded backtracking solver to prefer uniquely solvable boards. If generation ever falls back to an all-`1x1` board, that board stays playable but gets rejected for ranked scoring.

For solving, `validateSolution` builds a coverage grid from the submitted rectangles. It rejects out-of-bounds rectangles, overlaps, uncovered cells, rectangles with zero or multiple clues, and rectangles whose area doesn't match the contained clue.

For ranked validation, the finished client sends the seed, difficulty, time, score, the five puzzle split times, and the solved rectangles for each puzzle. The API calls the shared `validateRankedShikakuRun` helper, regenerates the canonical five-puzzle run from the seed, recalculates the score, checks split-time consistency, and validates every submitted rectangle set against the canonical puzzle before inserting `replayData` into `shikaku_scores`.

---

## Technical Notes

- **Route:** `/shikaku` (no game ID; single-player, no Zero sync)
- **State:** entirely client-side React state. No multiplayer data model.
- **API:** REST endpoints for the leaderboard (`GET /api/shikaku/leaderboard`) and score submission (`POST /api/shikaku/score`).
- **Schema:** the `shikaku_scores` table stores sessionId, name, seed, difficulty, score, timeMs, puzzleCount, and replayData.
- **Engine:** `packages/shared/src/games/shikaku-engine.ts` contains generation, validation, scoring, replay verification, and the seeded PRNG. `apps/web/src/lib/shikaku-engine.ts` re-exports it for the web app.
- **No mobile version.** Desktop only, on purpose.

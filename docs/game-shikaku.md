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

1. **Pick a mode and difficulty.** Ranked, Endless, or Seeded up top, then Easy (5x5), Medium (9x9), Hard (15x15), or Expert (22x22).
2. **Solve puzzles.** Drag on the grid to place rectangles. Each rectangle must contain exactly one number, and its area must equal that number. Cells with a `1` clue are auto-filled as locked `1x1` rectangles when the puzzle starts.
3. **Complete the run.** Solve all 5 puzzles as fast as you can. Your score is based on speed and difficulty.
4. **Submit.** A finished ranked run gets checked for eligibility, and then you can submit it to the leaderboard for that difficulty.

---

## Game Modes

### Ranked

- 5 puzzles per run, timed.
- Score is calculated from total solve time and the difficulty multiplier.
- A completed run can be submitted to the server-side leaderboard.
- Giving up early ends the run unranked and shows a penalized local score only.

### Endless

- Endless puzzles at one size, generated on the fly with seeded RNG.
- No score submission. This one's for fun or practice.
- Give up at any time to see your stats (puzzles solved, time, unranked score).

### Seeded

- The same 5-puzzle run as ranked, on a seed you type in. Unranked.
- A link with `?seed=<n>&difficulty=<level>` opens the menu on that seed.

### Challenge

- `?seed=<n>&difficulty=<level>&challenge=1` starts a single puzzle right away, with no score. The play button on the puzzle image page (`/api/shikaku/puzzle`) links here.

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

### Endless Scoring (Unranked)

- 500 points per puzzle solved, times the difficulty multiplier.
- Never submitted to the leaderboard.

---

## Controls

| Action | Input |
|--------|-------|
| Place rectangle | Click and drag on empty cells |
| Remove rectangle | Click a placed rectangle, or right-click (tap it on a phone) |
| Undo | Undo button in the toolbar |
| Clear all | Clear button in the toolbar |

Invalid rectangles (wrong area, no number, multiple numbers) flash red and get auto-removed.

---

## Leaderboard

- One board per difficulty, 10 scores to a page, with name search.
- Your personal best rank and score are shown too.
- Completed ranked runs are checked for eligibility before you can submit.
- Ranked runs use the shared solo ticket (`apps/api/src/solo-ticket.ts`). `POST /api/shikaku/run` picks the seed and signs a ticket, the eligibility check stamps it with the finish time, and the submit has to bring it back. The run's time has to match the server's clock, less the countdown and solved pauses. The page also logs when every move landed, and the API scores that log for legitimacy (one move per rectangle bigger than 1x1 at least). The Zip doc's anti-cheat section covers the details.
- With the API down, a ranked run still starts on a local seed, but it can't be submitted.
- Server-side validation covers a lot: session proof, the run ticket, canonical replay verification, minimum time checks, exact score recalculation, duplicate seed protection, top-20 replacement, rate limits, and ban checks.
- Three strikes (tampered times, impossible scores, failed replays, and so on) inside 30 minutes bans the session from Shikaku scores, stored in `shikaku_banned_sessions`. Site-wide admin bans and the bot check apply too.

---

## Puzzle Generation

- Puzzles are generated in the browser using a seeded PRNG (mulberry32).
- The generator randomly partitions the grid into rectangles, places numbers, then verifies unique solvability with a backtracking solver.
- Ranked and Seeded generate all 5 puzzles upfront from one seed. Endless generates one at a time.

---

## Technical Engine Flow

The Shikaku engine lives in `packages/shared/src/games/shikaku-engine.ts` and is imported by both the web app and the API. The browser still generates and validates puzzles locally, so Shikaku stays playable even when the API is down. A ranked run started offline plays on a local seed and can't be submitted.

For generation, the engine feeds a public run seed into `mulberry32`, picks the configured grid size for the difficulty, and creates five puzzles. Each puzzle is built by partitioning the grid into non-overlapping rectangles, placing one numeric clue inside each rectangle, validating the hidden solution, then running a bounded backtracking solver to prefer uniquely solvable boards. If generation ever falls back to an all-`1x1` board, that board stays playable but gets rejected for ranked scoring.

For solving, `validateSolution` builds a coverage grid from the submitted rectangles. It rejects out-of-bounds rectangles, overlaps, uncovered cells, rectangles with zero or multiple clues, and rectangles whose area doesn't match the contained clue.

For ranked validation, the finished client sends its ticket (which carries the seed and difficulty), time, score, the five puzzle split times, and the solved rectangles for each puzzle. The API calls the shared `validateRankedShikakuRun` helper, regenerates the canonical five-puzzle run from the ticket's seed, recalculates the score, checks split-time consistency, and validates every submitted rectangle set against the canonical puzzle before inserting `replayData` into `shikaku_scores`.

---

## Technical Notes

- **Route:** `/shikaku` (no game ID; single-player, no Zero sync)
- **State:** entirely client-side React state. No multiplayer data model.
- **API:** REST endpoints for the leaderboard (`GET /api/shikaku/leaderboard`), the ranked seed ticket (`POST /api/shikaku/run`), the eligibility check (`POST /api/shikaku/score/eligibility`), and score submission (`POST /api/shikaku/score`). `GET /api/shikaku/puzzle` serves a shareable puzzle image page.
- **Schema:** the `shikaku_scores` table stores sessionId, name, seed, difficulty, score, timeMs, puzzleCount, replayData, and legitimacy.
- **Engine:** `packages/shared/src/games/shikaku-engine.ts` contains generation, validation, scoring, replay verification, and the seeded PRNG. `apps/web/src/lib/shikaku-engine.ts` re-exports it for the web app.
- **Mobile:** the same page works on phones. Drag to draw, tap a rectangle to remove it, and big boards get scroll controls.

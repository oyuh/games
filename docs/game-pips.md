# Pips - Game Design Document

> **Status:** Planned
> **Players:** 1 (single-player)
> **Type:** Timed domino logic run

---

## Core Idea

Pips is a domino-placement logic puzzle inspired by NYT Pips. The player fills a shaped grid with dominoes. Each domino covers exactly two adjacent cells, and each half contributes its pip value to the cell it covers. Colored regions on the board define math rules that must be satisfied when the grid is filled.

This version is generative and seeded like Shikaku, but it does not ask the player to pick Easy, Medium, or Hard as separate modes. A ranked run always contains three puzzles in order:

1. Easy
2. Medium
3. Hard

The run is timed from start to finish. The leaderboard is ranked by total solve time: lower time is better.

**What it tests:** spatial reasoning, constraint solving, arithmetic pattern recognition, and fast correction under pressure.

---

## How to Play

1. **Start a run** - The game creates one run seed and generates an Easy, Medium, and Hard puzzle from that seed.
2. **Place dominoes** - Drag or click dominoes from the tray onto the board. Each domino can be rotated and must cover two orthogonally adjacent open cells.
3. **Satisfy regions** - Every colored region has a condition, such as a target sum, all equal, all different, greater than a number, or less than a number.
4. **Use every domino** - The puzzle is solved only when every board cell is filled, every supplied domino is placed, and every region condition passes.
5. **Complete the run** - Solving Easy advances to Medium, then Hard. Finishing Hard stops the timer and records the run time.

---

## Game Mode

### Standard Run

- One timed run contains 3 puzzles: Easy, Medium, Hard.
- One seed deterministically generates all three puzzles.
- The run timer continues across puzzle transitions.
- The result is ranked by total time, not points.
- Runs must be fully completed to submit to the leaderboard.

### Practice / Custom Seed

- Optional unranked mode.
- Player may enter a seed and replay the same three-puzzle run.
- Useful for sharing and debugging generated puzzles.
- No leaderboard submission.

---

## Rules

- Domino values use the standard `0` through `6` pip range.
- Each domino may be used once.
- Dominoes cannot overlap.
- Dominoes cannot extend outside the board.
- Dominoes must cover two orthogonally adjacent cells.
- A placed domino can be rotated before or after placement.
- The puzzle is complete when the board is full and all region rules are valid.

### Region Conditions

| Rule | Meaning |
|------|---------|
| `= N` | The region's pip sum must equal `N`. |
| `> N` | The region's pip sum must be greater than `N`. |
| `< N` | The region's pip sum must be less than `N`. |
| `=` | All cells in the region must have the same pip value. |
| `!=` | All cells in the region must have different pip values. |

Start with these five rule types. More rule types can be added later if the generator can guarantee fair, solvable boards.

---

## Run Structure

| Puzzle | Board Target | Domino Count | Rule Density | Goal |
|--------|--------------|---------------|--------------|------|
| Easy | Small board, simple shape | 4-6 dominoes | Low | Teach placement and sums |
| Medium | Wider board, mild branching | 7-10 dominoes | Medium | Add mixed rule interactions |
| Hard | Larger/irregular board | 11-15 dominoes | High | Force deduction and backtracking |

The exact board size can vary by seed. Every generated board must have an even number of cells because it is fully tiled by dominoes.

---

## Scoring

Pips uses elapsed time as the score.

```
Score metric = totalRunTimeMs
Leaderboard order = ascending totalRunTimeMs
```

- Faster time ranks higher.
- There is no points multiplier.
- There is no separate difficulty leaderboard because every ranked run contains Easy, Medium, and Hard.
- If the player gives up, the run ends unranked.
- If the player restarts, the timer and current run are discarded.

### Display

- Primary result: `MM:SS.mmm`
- Secondary stats: puzzle split times for Easy, Medium, and Hard
- Optional share text:

```
Pips Run
Seed 482913
Easy 00:31
Medium 01:24
Hard 03:10
Total 05:05
```

---

## Controls

| Action | Input |
|--------|-------|
| Select domino | Click/tap tray domino |
| Place domino | Click/tap valid board pair, or drag onto board |
| Rotate selected domino | Rotate button, keyboard `R`, or tap selected domino |
| Pick orientation while placing | Hover/drag direction or second-cell tap |
| Remove placed domino | Click/tap placed domino |
| Undo | Undo button |
| Reset current puzzle | Reset button |
| Give up run | Give up button with confirmation |

Mobile should support tap-first placement: select a domino, tap a cell, then tap an adjacent cell or use orientation controls.

---

## Puzzle Generation

Generation should be deterministic from one run seed.

```
runSeed
  -> easySeed
  -> mediumSeed
  -> hardSeed
```

### Generator Pipeline

1. **Create solution tiling** - Generate a connected even-cell board and tile it completely with domino placements.
2. **Assign domino values** - Choose a set of domino values that match the solution tiling.
3. **Partition regions** - Group board cells into colored regions of size 1-4.
4. **Derive clues** - Calculate valid region conditions from the solved board.
5. **Remove unfair clues** - Avoid clues that are either redundant noise or impossible to reason about.
6. **Validate solvability** - Run a solver against the public puzzle data.
7. **Check uniqueness target** - Prefer unique solutions for Easy and Medium. Hard may allow a small number of equivalent solutions if every accepted solution satisfies all regions and uses the same domino set.
8. **Rate difficulty** - Estimate difficulty from branching factor, forced moves, rule mix, and solve depth.

### Difficulty Targets

- **Easy:** Mostly sum rules, compact board, many forced placements.
- **Medium:** Mix sums with equal/different regions, some ambiguous domino orientation.
- **Hard:** Irregular shape, more cross-region dominoes, tighter equality/difference constraints, deeper search.

### Fairness Rules

- No puzzle should require guessing.
- Every puzzle must be solvable from visible constraints and supplied dominoes.
- Avoid huge identical-color regions that hide the useful logic.
- Avoid region labels that are technically true but do not narrow the solution.
- Keep early-run puzzles friendly enough that players learn the interface before the hard puzzle.

---

## Leaderboard

- Single leaderboard for ranked runs.
- Sort by `timeMs` ascending.
- Store split times for auditing and display.
- Store seed and replay metadata for validation.
- Custom seed runs are unranked.
- Duplicate seed submissions can be handled like Shikaku: accept only eligible ranked seeds and reject suspicious repeats if needed.

---

## Technical Notes

- **Route:** `/pips`
- **State:** Client-side React state, like Shikaku.
- **API:** REST endpoints for leaderboard and score submission.
- **Schema:** `pips_scores` table should store sessionId, name, seed, timeMs, easyTimeMs, mediumTimeMs, hardTimeMs, completedAt, and replayData.
- **Engine:** Add `apps/web/src/lib/pips-engine.ts` for seeded RNG, generation, validation, solve checking, and serialization.
- **UI:** Add `PipsPage`, `PipsBoard`, `PipsDominoTray`, `PipsRunHeader`, `PipsResults`, and `PipsLeaderboard`.

---

## Implementation Plan

1. Build the engine types: cells, dominoes, regions, clues, placements, and run payloads.
2. Implement placement validation and region evaluation.
3. Build a solver that can verify solvability and count solutions.
4. Add the seeded generator with fixed difficulty targets.
5. Build the desktop page and board interactions.
6. Add mobile tap placement and responsive board scaling.
7. Add run timer, split tracking, and results screen.
8. Add leaderboard API/schema.
9. Add demo/how-to-play modal.
10. Add tests for clue evaluation, tiling validity, deterministic seeds, and solver sanity.

---

## Open Questions

- Should Hard require unique solutions, or is "all valid completions accepted" enough?
- Should the tray show dominoes sorted by value, shuffled by seed, or grouped by doubles/high pips?
- Should reset-current-puzzle keep the run timer going? Recommended: yes.
- Should hints exist? Recommended: no ranked hints at launch; maybe unranked practice hints later.

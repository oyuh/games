# Pips

> **Status:** Implemented
> **Players:** 1 (single-player)
> **Type:** Timed domino logic run

---

## Core Idea

Pips is a domino-placement logic puzzle inspired by NYT Pips. You fill a shaped grid with dominoes. Each domino covers exactly two adjacent cells, and each half contributes its pip value to the cell it covers. Colored regions on the board define math rules that have to hold once the grid is filled.

This version is generative and seeded like Shikaku, but it doesn't ask you to pick Easy, Medium, or Hard as separate modes. A ranked run always contains three puzzles, in order:

1. Easy
2. Medium
3. Hard

The run is timed from start to finish, and the leaderboard is ranked by total solve time. Lower is better.

**What it tests:** spatial reasoning, constraint solving, arithmetic pattern recognition, and fast correction under pressure.

---

## How to Play

1. **Start a run.** The game creates one run seed and generates an Easy, Medium, and Hard puzzle from it.
2. **Place dominoes.** Drag or click dominoes from the tray onto the board. Each domino can be rotated and must cover two orthogonally adjacent open cells.
3. **Satisfy regions.** Every colored region has a condition: a target sum, all equal, all different, greater than a number, or less than a number.
4. **Use every domino.** The puzzle only counts as solved when every board cell is filled, every supplied domino is placed, and every region condition passes.
5. **Complete the run.** Solving Easy advances to Medium, then Hard. Finishing Hard stops the timer and records the run time.

---

## Game Mode

### Standard Run

- One timed run contains 3 puzzles: Easy, Medium, Hard.
- One seed deterministically generates all three.
- The run timer keeps going across puzzle transitions.
- The result is ranked by total time, not points.
- Only fully completed runs can be submitted to the leaderboard.

### Practice / Custom Seed

- Optional unranked mode.
- You can enter a seed and replay the same three-puzzle run.
- Handy for sharing runs and debugging generated puzzles.
- No leaderboard submission.

---

## Rules

- Domino values use the standard `0` through `6` pip range.
- Each domino can be used once.
- Dominoes can't overlap.
- Dominoes can't hang outside the board.
- Dominoes must cover two orthogonally adjacent cells.
- A placed domino can be rotated before or after placement.
- The puzzle is complete when the board is full and every region rule is valid.

### Region Conditions

| Rule | Meaning |
|------|---------|
| `= N` | The region's pip sum must equal `N`. |
| `> N` | The region's pip sum must be greater than `N`. |
| `< N` | The region's pip sum must be less than `N`. |
| `=` | All cells in the region must have the same pip value. |
| `!=` | All cells in the region must have different pip values. |

These five rule types are the starting set. More can be added later, as long as the generator can still guarantee fair, solvable boards.

---

## Run Structure

| Puzzle | Board Target | Domino Count | Rule Density | Goal |
|--------|--------------|---------------|--------------|------|
| Easy | Small board, simple shape | 4-6 dominoes | Low | Teach placement and sums |
| Medium | Wider board, mild branching | 7-10 dominoes | Medium | Add mixed rule interactions |
| Hard | Larger/irregular board | 11-15 dominoes | High | Force deduction and backtracking |

Exact board size can vary by seed. Every generated board has to have an even number of cells, since it's fully tiled by dominoes.

---

## Scoring

Pips uses elapsed time as the score.

```
Score metric = totalRunTimeMs
Leaderboard order = ascending totalRunTimeMs
```

- Faster time ranks higher.
- There's no points multiplier.
- There's no separate per-difficulty leaderboard, because every ranked run contains Easy, Medium, and Hard.
- If you give up, the run ends unranked.
- If you restart, the timer and the current run are discarded.

### Display

- Primary result: `MM:SS.mmm`
- Secondary stats: split times for Easy, Medium, and Hard
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
| Select domino | Click/tap a tray domino |
| Place domino | Click/tap a valid board pair, or drag onto the board |
| Rotate selected domino | Rotate button, keyboard `R`, or tap the selected domino |
| Pick orientation while placing | Hover/drag direction, or second-cell tap |
| Remove placed domino | Click/tap the placed domino |
| Undo | Undo button |
| Reset current puzzle | Reset button |
| Give up run | Give up button, with confirmation |

Mobile should support tap-first placement: select a domino, tap a cell, then tap an adjacent cell or use the orientation controls.

---

## Puzzle Generation

Generation is deterministic from one run seed.

```
runSeed
  -> easySeed
  -> mediumSeed
  -> hardSeed
```

### Generator Pipeline

1. **Create the solution tiling.** Generate a connected even-cell board and tile it completely with domino placements.
2. **Assign domino values.** Choose a set of domino values that match the solution tiling.
3. **Partition regions.** Group board cells into colored regions of size 1-4.
4. **Derive clues.** Calculate valid region conditions from the solved board.
5. **Remove unfair clues.** Drop clues that are either redundant noise or impossible to actually reason about.
6. **Validate solvability.** Run a solver against the public puzzle data.
7. **Check the uniqueness target.** Prefer unique solutions for Easy and Medium. Hard may allow a small number of equivalent solutions, as long as every accepted solution satisfies all regions and uses the same domino set.
8. **Rate difficulty.** Estimate difficulty from branching factor, forced moves, rule mix, and solve depth.

### Difficulty Targets

- **Easy:** mostly sum rules, compact board, lots of forced placements.
- **Medium:** sums mixed with equal/different regions, some ambiguous domino orientation.
- **Hard:** irregular shape, more cross-region dominoes, tighter equality/difference constraints, deeper search.

### Fairness Rules

- No puzzle should ever require guessing.
- Every puzzle must be solvable from the visible constraints and the supplied dominoes.
- Avoid huge identical-color regions that bury the useful logic.
- Avoid region labels that are technically true but don't narrow the solution at all.
- Keep the early-run puzzles friendly enough that players learn the interface before the hard one hits.

---

## Leaderboard

- One leaderboard for ranked runs.
- Sorted by `timeMs` ascending.
- Split times are stored for auditing and display.
- Seed and solved-placement replay metadata are stored for validation.
- Custom seed runs are unranked.
- Duplicate seed submissions are rejected per session.

---

## Technical Engine Flow

The Pips engine lives in `packages/shared/src/games/pips-engine.ts` and is imported by both the web app and the API. The browser uses it for offline/local generation, placement checks, region progress, and solve detection. The API uses the same engine for ranked replay validation before accepting leaderboard rows.

For generation, one public run seed goes through `mulberry32` and produces Easy, Medium, and Hard in order. Each puzzle grows an irregular connected board as domino-sized cell pairs, trims the shape to compact bounds, chooses a seeded subset of the standard `0-6` dominoes, records a hidden solved placement, derives a solved pip grid, partitions cells into visible regions, and picks region rules that the hidden solution satisfies.

For validation, `validatePuzzleShape` checks that active cells are in bounds, unique, covered by exactly one region, and match the supplied domino count. `validateSolution` checks that every submitted placement uses a real domino exactly once, covers two active adjacent cells, avoids overlaps, fills the board, and satisfies every region rule through `evaluateRegionRule`.

For ranked validation, the finished client sends the seed, total time, the Easy/Medium/Hard splits, and the solved placements for each difficulty. The API calls `validateRankedPipsRun`, regenerates the canonical run from the seed, verifies the split total, checks each generated puzzle against the engine invariants, and validates the submitted placements against the canonical Easy, Medium, and Hard puzzles before storing `replayData` in `pips_scores`.

---

## Technical Notes

- **Route:** `/pips`
- **State:** client-side React state, same as Shikaku.
- **API:** REST endpoints for the leaderboard and score submission.
- **Schema:** `pips_scores` stores sessionId, name, seed, totalMs, easyMs, mediumMs, hardMs, puzzleCount, replayData, and createdAt.
- **Engine:** `packages/shared/src/games/pips-engine.ts` contains the seeded RNG, generation, validation, solver utilities, run scoring, and replay verification. `apps/web/src/lib/pips-engine.ts` re-exports it for the web app.
- **UI:** `PipsPage` renders the board, tray, run header, results, leaderboard, seeded/infinite modes, and the admin score helper.

---

## Implementation Checklist

1. [x] Build the engine types: cells, dominoes, regions, rules, placements, and run payloads.
2. [x] Implement placement validation and region evaluation.
3. [x] Build solver utilities that can verify solvability and count solutions.
4. [x] Add the seeded generator with fixed difficulty targets.
5. [x] Build the desktop page and board interactions.
6. [x] Add the run timer, split tracking, and results screen.
7. [x] Add the leaderboard API/schema and replay validation.
8. [x] Add the demo/how-to-play modal.
9. [x] Add tests for rule evaluation, tiling validity, deterministic seeds, solver sanity, and ranked replay validation.

---

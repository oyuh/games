# Zip

> **Status:** Implemented
> **Players:** 1 (single-player)
> **Type:** Path-drawing logic puzzle

---

## Core Idea

Zip is a path-drawing puzzle on a square grid. Some cells hold numbers, and some edges between cells have walls. You draw one line that starts on 1, passes through every number in order, ends on the highest number, and fills every cell exactly once. The line can't cross a wall or double back over itself.

**What it tests:** planning ahead, spotting dead ends early, and routing around corners you'd otherwise paint yourself into.

---

## How to Play

1. **Pick a difficulty.** Each one plays at its own grid size: Easy is 6x6, Medium 8x8, Hard 10x10, and Expert 12x12. Expert rolls a random number of starting numbers for every puzzle.
2. **Draw the path.** Start on 1 and drag through neighboring cells. You can move up, down, left, or right, never diagonally.
3. **Hit the numbers in order.** You can't step onto a number until you've passed every lower one.
4. **Fill the board.** The puzzle is solved when the line covers every cell and ends on the last number.

---

## Menu

The menu is the shared solo menu, laid out like Shikaku's. Pick Ranked, Endless, or Seeded up top. Endless and Seeded open a seed input under it. Below the mode note, pick a difficulty, which also sets the grid size. Ranked and Seeded show the run as a ladder of puzzles under the picker.

## Game Modes

### Ranked

- 3 puzzles at every difficulty.
- The server picks the seed when the run starts, so a ranked board is never one you've seen before.
- Timed, and submitted to the leaderboard for that difficulty.

### Seeded

- Same run length as ranked, on a seed you type in. Unranked.

### Endless

- Puzzles keep coming at one difficulty. Optional seed. Unranked.

## Difficulty Levels

Difficulty sets the grid size, how many numbers the board starts with, and how the generator settles ambiguous spots. Easy gives you a small board and lots of numbers. Hard gives you a bigger board with fewer numbers and leans on walls instead. Expert is the biggest board, and its starting share is rolled fresh for every puzzle, so one board might hand you 6 numbers and the next 20.

| Difficulty | Grid | Starting clues (share of cells) | Wall chance per fix |
|------------|------|--------------------------------|---------------------|
| **Easy** | 6x6 | 30% | 0% |
| **Medium** | 8x8 | 20% | 35% |
| **Hard** | 10x10 | 12% | 70% |
| **Expert** | 12x12 | random, 4% to 16% | 70% |

The final clue count usually ends up a bit higher than the starting share, because the uniqueness pass adds numbers to rule out alternate paths. "Wall chance per fix" is how often that pass adds a wall instead of a number.

---

## The Run

1. Pick a mode and difficulty, then start. Ranked asks the server for its seed first.
2. A 3-second countdown builds every board in the run while it counts, so none of them load mid-run. Endless keeps 3 built ahead. The board stays hidden until GO, so nobody studies a ranked board early.
3. Each puzzle's clock starts when its board appears. A solved board stays up for 0.9 s, off the clock, then the next one shows.
4. The end screen shows your time, rank, board, and seed, plus standings and per-puzzle times. A finished ranked run is checked with the server, then you press Submit Score.

The top bar holds only the puzzle count, the timer, and the seed. How to Play opens a 5-step walkthrough with a live 4x4 board you can draw on.

---

## Leaderboard

- One board per difficulty, so 4 boards in all.
- Runs rank by total time, fastest first. An earlier run wins a tie.
- Each row also shows the average time per puzzle.
- Each session keeps its 20 fastest runs per board. A full board only takes a faster run, which replaces your slowest.
- The full leaderboard filters by difficulty and everyone or yours, and searches names and seeds.

---

## Anti-Cheat

Zip, Shikaku, and Pips share one ranked ticket system, in `apps/api/src/solo-ticket.ts`.

1. **Run tickets.** Starting a ranked run calls `POST /api/zip/run`. The server picks a random seed and signs a ticket holding the game, session, seed, difficulty, and start time. The submission has to bring that ticket back. A forged, edited, or borrowed ticket is refused. So nobody can practice a seed in Seeded mode and then submit it as ranked.
2. **The server's clock.** The end screen's eligibility check stamps the ticket with the finish time and a digest of the reported run, and the submit sends the stamped ticket. The claimed time has to fit the time between issue and finish from both sides. It can't be longer than that, and it can't be shorter by more than the countdown and solved pauses, which stay off the clock. Those pause lengths live in each engine's `RUN_PACING`, which the page and the API both read. Both sides get 2 seconds of slack. Changing the run after the stamp gets it refused. Tickets expire 10 minutes after the longest allowed run.
3. **Replay check.** The submission carries every path drawn and every split time. The server rebuilds the run from the ticket's seed and checks each path with `validatePath`. The splits have to add up to the total within 2 seconds.
4. **Time floors.** Every split has to be at least 25 ms per square, so 0.9 s on a 6x6 and 3.6 s on a 12x12. Under 12 ms per square counts as a strike, since only a script gets there.
5. **Move timing.** The page logs when every move landed, one entry per square the line grows by. The API checks the log against the replay: at least one move per square, in order, with the last one at the solve. A log that doesn't fit is refused. A log that fits gets a legitimacy score from 0 to 100, saved with the run. Points come off for starting a board faster than anyone reacts, chaining moves faster than a hand moves, and a metronome pace. Below 30 the run is refused as scripted. The check lives in `apps/api/src/move-timing.ts`, and the admin score tables show the score, with anything under 60 marked.
6. **Strikes and bans.** A forged ticket, a failed replay, a bad or scripted move log, or a scripted split each count as a strike. Three strikes in 30 minutes bans the session from Zip scores, stored in `zip_banned_sessions`. Site-wide admin bans apply too, and so does the bot-check limbo gate.
7. **Duplicates.** One submission per seed per session.
8. **Cleanup.** The 15-minute cleanup drops rows with an unknown difficulty, a size that doesn't match it, the wrong puzzle count, or an impossible time, and trims each session to 20 runs per board. It doesn't replay stored runs, since they were checked on the way in.

---

## Controls

| Action | Input |
|--------|-------|
| Draw | Press on 1, then drag through cells. Arrow keys work once the board has focus |
| Back up | Drag back over the line, or press Backspace |
| Undo | Undo on the sidebar (takes one cell off) |
| Clear | Clear on the sidebar |
| Hint | "Highlight Next Number" on the sidebar rings the number you need next |
| Restart / Give up | On the sidebar, each takes a second press. A ranked restart gets a fresh seed |
| Leaderboard | On the sidebar, or from the menu and end screen |
| DEV Solve / DEV Skip | Dev builds only. Solve fills the board, Skip solves the rest of the run |

Each stretch of line between two numbers gets its own color, from a 12-color cycle ordered so neighbors never match. Every number ball has a split ring showing the two stretches it joins: the one coming in on the left half and the one going out on the right. The first and last numbers only join one stretch, so their ring is a single color.

A fast drag that skips squares gets filled in one step at a time, and it stops at the first square the rules refuse. The last number ends the line, so nothing extends past it.

---

## Puzzle Generation

- Puzzles are generated client-side with the shared seeded PRNG (`mulberry32`, the same one Shikaku uses), so a seed always rebuilds the same board.
- The generator draws a random path through every cell first, then places numbers along it. The puzzle is solvable by construction.
- A solver then hunts for a second solution. Each time it finds one, the generator adds a number or a wall that rules that path out, and tries again.
- The solver has a fixed node budget, so generation time stays bounded. Small grids nearly always come out with a single answer. Big sparse grids sometimes ship with more than one, which is fine because any legal path counts as a win.

In benchmarks, Easy generates in about 1 ms and Medium in under 35 ms. Hard takes about 120 ms at the median and Expert about 200 ms, and neither went over 250 ms.

---

## Technical Engine Flow

The engine lives in `packages/shared/src/games/zip-engine.ts`, so the web app and the API both import it. Cells are addressed by a single index, `r * size + c`. A puzzle is `{ size, checkpoints, walls, solution }`: checkpoints are cell indices in number order, walls are pairs of neighboring cells, and `solution` is the intended path.

For the random path, `randomHamiltonianPath` starts from a snake pattern and applies backbite moves. Each move picks one end of the path, links it to a random neighbor, and reverses the tail so the path stays valid. It never fails or backtracks, so this step costs almost nothing.

For uniqueness, `findSolutions` runs a depth-first search that stops after two solutions or when the budget runs out. It skips numbers that come out of order and won't enter the last number early. It cuts a branch when a cell gets stranded (only the last number may have a single way in) or when the unvisited cells split into separate pieces. Both checks run incrementally. When the head moves from one cell to the next, only the old head's neighbors can change, so each step checks at most 3 cells. The connectivity flood fill stops as soon as it reaches them. Moves are tried most-boxed-in neighbor first (Warnsdorff's rule), which finds alternate paths fast.

For solving, `validatePath` checks that the path has the right length, starts and ends on the first and last numbers, visits each cell once, only steps between open neighbors, and hits the numbers in order. It accepts any path that follows the rules, not only the stored solution. The UI can use `canStep(puzzle, a, b)` to decide whether a drag from one cell to the next is legal.

---

## Technical Notes

- **Route:** `/zip` (`apps/web/src/pages/ZipPage.tsx`), sync-free like `/pips` and `/shikaku`. The home page and the mobile home list both link to it. `/dev/zip` shows every component in every state with fixed seeds, plus the live leaderboard.
- **Components:** `apps/web/src/components/zip/ZipBoard.tsx` draws the board and owns the drag and keyboard input (`stepTo` holds the move rules). Undo, clear, and the hint live on the sidebar (`FloatingHeader.tsx`), wired through the `zip-*` events on `apps/web/src/lib/solo-bus.ts` the same way Shikaku's are. Styles live in `apps/web/src/styles/zip.css`.
- **Theme:** `data-game-theme="zip"` sets the accent to yellow (`#facc15`), with a deeper gold (`#ca8a04`) in light mode so it still reads on the light card.
- **State:** client-side play. Like the other solo games, it's not in the `game_type` enum and doesn't touch Zero. It's registered as the `zip` slug in `packages/shared/src/game-metadata.ts`, with a `path` icon.
- **API:** `POST /api/zip/run` issues a ranked seed and ticket. `POST /api/zip/score/eligibility` checks a finished run without saving it. `POST /api/zip/score` saves it. `GET /api/zip/leaderboard?difficulty=` serves a board, with `page`, `limit`, `mineOnly`, `q`, and `window=me` for the end screen slice. Ticket signing and the clock check live in `apps/api/src/solo-ticket.ts` and use `SESSION_COOKIE_SECRET`. Time limits live in `apps/api/src/score-policy.ts`.
- **Web client:** `apps/web/src/lib/zip-api.ts` wraps those four calls for the game page. `apps/web/src/components/zip/ZipLeaderboard.tsx` is the full leaderboard on top of the shared `SoloLeaderboard`.
- **Schema:** `zip_scores` holds sessionId, name, seed, difficulty, size (always the difficulty's grid), timeMs, puzzleCount, replayData (paths and splits), legitimacy, and createdAt. `zip_banned_sessions` holds auto-bans. Both need `bun --filter @games/shared db:push` on each database.
- **Admin:** the Zip page in the admin panel lists runs with a difficulty filter, and supports add, edit, delete, and clear all. "View boards" renders each puzzle of a run from its seed, as the board, the solution, or the player's own line, through `GET /api/admin/zip/scores/:id/puzzle.svg`. The SVG comes from `apps/api/src/zip-image.ts`.
- **Engine:** `packages/shared/src/games/zip-engine.ts`, exported as `@games/shared/games/zip-engine` and as `zipEngine` from `@games/shared`.
- **Tests:** `packages/shared/src/__tests__/zip-engine.test.ts` covers generation across every size and difficulty, seed determinism, and each rule `validatePath` enforces. `ranked-engine-validation.test.ts` covers the ranked replay check, and `apps/api/src/__tests__/solo-ticket.test.ts` covers ticket signing and the clock check.
- **Components:** `ZipMenu.tsx` is the menu (shared with `/dev/zip`), `ZipDemo.tsx` is How to Play, and `ZipLeaderboardModal` in `ZipLeaderboard.tsx` owns its own fetching.

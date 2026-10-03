# Shade Signal

> **Status:** Implemented
> **Players:** 3-8
> **Type:** Competitive color-guessing party game

---

## Core Idea

One **Leader** secretly knows a target color on a shared color grid. Everyone else (the **Guessers**) tries to land on it using only the leader's word clues. Scoring is by how close you get.

**What it tests:** color perception, communication, shared references, and understanding how other people interpret language.

The fun lives in the gap between what the leader meant and what the guessers heard.

---

## How to Play

1. **Create or join.** The host creates a lobby and shares the 6-character join code. The game needs at least 3 players.
2. **Pick (optional).** With leader picking on, the leader chooses the target square. Otherwise the server picks one at random.
3. **First clue.** The leader gives a one-word clue.
4. **First guess.** Every guesser places a marker on the grid.
5. **Second clue.** The leader gives a second clue of up to two words to steer people in.
6. **Final guess.** Guessers can move their marker.
7. **Reveal.** The target shows up, along with everyone's markers and the round's scores.
8. **Rotate.** The next player in the order becomes leader, with a fresh board and target.

---

## Game Phases

| Phase | What happens |
|-------|-------------|
| **Lobby** | Players join. The host changes settings and starts the game. |
| **Picking** | Leader picking only. The leader chooses the target. No timer. |
| **Clue 1** | The leader writes a one-word clue (45 second timer by default). |
| **Guess 1** | Guessers place a marker (30 second timer by default). |
| **Clue 2** | The leader writes a clue of up to two words. |
| **Guess 2** | Guessers can move their marker. |
| **Reveal** | Target and scores shown for 8 seconds, then the next round starts. The host can skip ahead. |
| **Finished** | Every round played. Final scores and round history. |

If the leader runs out of time on a clue, the round moves on with no clue. When every guesser has locked in, the guess phase ends 5 seconds later instead of waiting out the timer.

---

## Configuration

| Setting | Range | Default | Description |
|---------|-------|---------|-------------|
| **Rounds per player** | 1-3 | 1 | How many times each player leads |
| **Clue timer** | 10-180 s | 45 s | Time the leader gets for each clue |
| **Guess timer** | 10-180 s | 30 s | Time guessers get for each guess |
| **Hard mode** | On/Off | Off | Bans color names in clues |
| **Leader picks** | On/Off | Off | The leader chooses the target instead of the server |

The host can change all of these from the lobby. The board is 10 rows by 12 columns.

---

## Rules

- Clue 1 is one word. Clue 2 is two words at most.
- In hard mode, clues can't use color names like "blue", "teal", or "burgundy". The full list is `SHADE_COLOR_WORDS` in `shade-signal.ts`.
- Guessers can change their marker until the phase ends. Your final guess is the one that scores. If you skipped the second guess, your first one counts.
- Multiple guessers can pick the same square.
- The leader order is shuffled once at the start.
- Players who join after the game starts can spectate and chat.
- The host can kick players and remove spectators. Kicked players can't rejoin. The host leaving ends the game for everyone.

---

## Scoring

**Guessers, per round:**

| Distance from target | Points |
|---------------------|--------|
| Exact square        | 5      |
| 1 square away       | 3      |
| 2 squares away      | 2      |
| 3 squares away      | 1      |
| Farther             | 0      |

Distance counts diagonals as one step (Chebyshev distance), so every square touching the target is 1 away.

**Leader:** the average of the guessers' points that round, rounded. A leader who gets everyone close scores well.

Highest total after every round wins.

---

## Implementation Notes

### Color Grid

Colors are generated from a seed, so only the seed is stored. Hue runs across the columns, lightness runs down the rows from 16% to 84%, and saturation gets a small seeded wobble. Every round rolls a new seed. See `generateGridColor` in `apps/web/src/components/shade/ColorGrid.tsx`.

### Hidden target

The target is sealed with a per-game key before it syncs (`encrypted_target`), so guessers' clients never hold it. Only the leader can fetch the key from `/api/game-secret/key` before the reveal. At the reveal the server opens it, scores the round, and writes the target in the clear.

### Data Model

```
shade_signal_games {
  id, code, host_id
  phase: "lobby" | "picking" | "clue1" | "guess1" | "clue2" | "guess2" | "reveal" | "finished" | "ended"
  players: [{ sessionId, name, connected, totalScore }]
  leader_id, leader_order, current_leader_index
  grid_seed, grid_rows, grid_cols
  target_row, target_col, encrypted_target
  clue1, clue2
  guesses: [{ sessionId, round: 1 | 2, row, col }]
  round_history: [{ round, leaderId, target, seed, clue1, clue2, guesses, scores, leaderScore }]
  settings: { hardMode, leaderPick, clueDurationSec, guessDurationSec, roundsPerPlayer, currentRound, phaseEndsAt }
}
```

### Key Mutators

- `shadeSignal.create`, `join`, `leave`, `start`, `updateSettings`
- `shadeSignal.setTarget`: the leader's pick
- `shadeSignal.submitClue`: checked by `shadeClueProblem`, the same function the clue box uses
- `shadeSignal.submitGuess`: place or move a marker
- `shadeSignal.advanceTimer`: moves the phase along when the timer runs out
- `shadeSignal.reveal`: score the round on the server
- `shadeSignal.nextRound`: host skip from the reveal

### UI Components

- `ShadeSignalPage`: main game page
- `ShadeLobby`: settings and players
- `ColorGrid` / `ShadeGrid`: the board, clickable for guessers
- `ShadeClue`: the leader's clue box
- `ShadeGuess`: the guesser's view
- `ShadeResult`: the reveal
- `ShadeGameOver`: final scores and round history

# Shade Signal — Game Design Document

> **Status:** Coming Soon
> **Players:** 3–10
> **Type:** Cooperative/competitive color-guessing party game

---

## Core Idea

One **Leader** secretly knows a target color on a shared color grid. Everyone else (**Guessers**) tries to land on the right square based only on the leader's word clues. Score by proximity.

**What it tests:** color perception, communication, shared references, understanding how others interpret language.

The fun comes from the gap between what the leader meant and what the guessers heard.

---

## Game Phases

### Phase 1: Setup

- Display a visible color grid (e.g., 10×10 or 8×12 grid of distinct hues/shades).
- One player is the **Leader**; all others are **Guessers**.
- The leader secretly receives one target square (random assignment).

### Phase 2: First Clue

The leader gives **one word**.

**Good clue types:**
- Object references: "peach," "ocean," "lavender"
- Mood references: "moody," "toxic," "calm"
- Vibe/style references: "neon," "vintage," "royal"

**Restricted clues:**
- No exact coordinate or position references ("top-left," "row 3")
- No direct color-family names if playing hard mode ("blue," "red")
- No pointing at objects in the room

### Phase 3: First Guess

All guessers place their first guess on the grid **simultaneously**.

- Multiple guessers can pick the same square (stacking allowed).
- Guesses are hidden from other players until everyone has submitted.

### Phase 4: Second Clue

The leader gives a **second clue** (one or two words) to refine the first clue.

Example flow:
- First clue: "sunset"
- Second clue: "dusty orange"

### Phase 5: Final Guess

Each guesser can either:
- **Move** their original marker, or
- **Place a second marker** (if using two-guess scoring variant)

### Phase 6: Reveal

The leader reveals the exact target color. This is the payoff moment.

### Phase 7: Scoring

**Guesser scoring (per guess):**

| Distance from target | Points |
|---------------------|--------|
| Exact square        | 5      |
| 1 square away       | 3      |
| 2 squares away      | 2      |
| 3 squares away      | 1      |
| Farther             | 0      |

"Distance" = Manhattan distance (horizontal + vertical squares).

**Leader scoring:**
- +1 point for each guesser within 3 squares
- +2 bonus if any guesser hit the exact square

This rewards the leader for being understandable, not just clever.

### Phase 8: Rotate Leader

- Next player becomes leader.
- New target color is chosen.
- Repeat until everyone has been leader once (or twice for shorter games).

---

## Rules

- Leader cannot use color-family names in hard mode.
- No board-position clues ("left," "top," "row 2").
- Clue 1 is always one word. Clue 2 can be one or two words.
- Guesses are simultaneous and hidden until all are submitted.
- Stacking (multiple guessers on same square) is allowed.

---

## Implementation Notes

### Color Grid

Generate a grid of distinct, evenly-distributed colors. Options:
1. **HSL grid** — vary hue across columns, lightness across rows. e.g., 10 hues × 8 lightness levels = 80 cells.
2. **Curated palette** — hand-pick ~100 distinct colors for maximum ambiguity and fun.
3. **Named-color board** — each cell has a CSS-named color for easy reference.

Recommended: HSL grid with slight saturation variation. Looks great and generates programmatically.

### Data Model (planned)

```
shade_signal_games {
  id: string
  code: string (6-char join code)
  host_id: string
  phase: "lobby" | "clue1" | "guess1" | "clue2" | "guess2" | "reveal" | "finished" | "ended"

  players: [
    { sessionId, name, connected, totalScore }
  ]

  leader_id: string  // current round's leader
  leader_order: string[]  // rotation order

  grid: {
    rows: number
    cols: number
    // Colors generated deterministically from seed, no need to store each cell
    seed: number
  }

  target: { row: number, col: number }  // leader's secret target

  clue1: string | null
  clue2: string | null

  guesses: [
    { sessionId, round: 1 | 2, row: number, col: number }
  ]

  round_history: [
    { round, leaderId, target, clue1, clue2, guesses, scores }
  ]

  settings: {
    hardMode: boolean  // restricts color-name clues
    clueDurationSec: number
    guessDurationSec: number
    roundsPerPlayer: 1 | 2
  }
}
```

### Manhattan Distance Scoring

```ts
function scoreGuess(guess: {row, col}, target: {row, col}): number {
  const dist = Math.abs(guess.row - target.row) + Math.abs(guess.col - target.col);
  if (dist === 0) return 5;
  if (dist === 1) return 3;
  if (dist === 2) return 2;
  if (dist <= 3) return 1;
  return 0;
}
```

### Key Mutators

- `shadeSignal.create` — create game
- `shadeSignal.join` — player joins
- `shadeSignal.start` — host starts, assigns first leader, generates grid + target
- `shadeSignal.submitClue` — leader submits clue (1 or 2)
- `shadeSignal.submitGuess` — guesser places marker on grid
- `shadeSignal.reveal` — advance to reveal phase, compute scores
- `shadeSignal.nextRound` — rotate leader, new target
- `shadeSignal.leave` — player leaves

### UI Components

- `ShadeSignalPage` — main game page
- `ColorGrid` — interactive color grid (clickable for guessers, display-only for leader)
- `ClueInput` — leader's clue submission
- `ClueDisplay` — shows current clue(s) to guessers
- `GuessMarkers` — overlay markers on grid showing player guesses
- `RevealOverlay` — highlights target square and shows distance lines
- `ScoreBoard` — all player scores with leader bonus
- `LeaderBadge` — indicates current leader

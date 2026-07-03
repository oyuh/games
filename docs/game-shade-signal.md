# Shade Signal (Game Design Document)

> **Status:** Implemented
> **Players:** 3-10
> **Type:** Cooperative/competitive color-guessing party game

---

## Core Idea

One **Leader** secretly knows a target color on a shared color grid. Everyone else (the **Guessers**) tries to land on the right square using only the leader's word clues. Scoring is by proximity.

**What it tests:** color perception, communication, shared references, and understanding how other people interpret language.

The fun lives in the gap between what the leader meant and what the guessers heard.

---

## Game Phases

### Phase 1: Setup

- Display a visible color grid (say, 10x10 or 8x12 squares of distinct hues and shades).
- One player is the **Leader**; everyone else is a **Guesser**.
- The leader secretly receives one target square, assigned at random.

### Phase 2: First Clue

The leader gives **one word**.

**Good clue types:**
- Object references: "peach," "ocean," "lavender"
- Mood references: "moody," "toxic," "calm"
- Vibe/style references: "neon," "vintage," "royal"

**Restricted clues:**
- No coordinates or position references ("top-left," "row 3")
- No direct color-family names in hard mode ("blue," "red")
- No pointing at things in the room

### Phase 3: First Guess

All guessers place their first guess on the grid **simultaneously**.

- Multiple guessers can pick the same square (stacking is allowed).
- Guesses stay hidden from other players until everyone has submitted.

### Phase 4: Second Clue

The leader gives a **second clue** (one or two words) to refine the first one.

Example flow:
- First clue: "sunset"
- Second clue: "dusty orange"

### Phase 5: Final Guess

Each guesser can either:
- **Move** their original marker, or
- **Place a second marker** (if playing the two-guess scoring variant)

### Phase 6: Reveal

The leader reveals the exact target color. This is the payoff moment.

### Phase 7: Scoring

**Guesser scoring, per guess:**

| Distance from target | Points |
|---------------------|--------|
| Exact square        | 5      |
| 1 square away       | 3      |
| 2 squares away      | 2      |
| 3 squares away      | 1      |
| Farther             | 0      |

"Distance" here is Manhattan distance (horizontal plus vertical squares).

**Leader scoring:**
- +1 point for each guesser within 3 squares
- +2 bonus if any guesser hit the exact square

This rewards leaders for being understandable, not just clever.

### Phase 8: Rotate Leader

- The next player becomes leader.
- A new target color is chosen.
- Repeat until everyone has led once (or twice for shorter games).

---

## Rules

- The leader can't use color-family names in hard mode.
- No board-position clues ("left," "top," "row 2").
- Clue 1 is always one word. Clue 2 can be one or two words.
- Guesses are simultaneous and hidden until everyone has submitted.
- Stacking (multiple guessers on the same square) is allowed.

---

## Implementation Notes

### Color Grid

Generate a grid of distinct, evenly-distributed colors. Options:

1. **HSL grid.** Vary hue across columns and lightness across rows, e.g. 10 hues x 8 lightness levels = 80 cells.
2. **Curated palette.** Hand-pick ~100 distinct colors for maximum ambiguity and fun.
3. **Named-color board.** Each cell gets a CSS-named color for easy reference.

The recommendation: an HSL grid with slight saturation variation. It looks great and generates programmatically.

### Data Model

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
    // Colors are generated deterministically from the seed, no need to store each cell
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

- `shadeSignal.create`: create the game
- `shadeSignal.join`: player joins
- `shadeSignal.start`: host starts; assigns the first leader, generates the grid and target
- `shadeSignal.submitClue`: leader submits a clue (1 or 2)
- `shadeSignal.submitGuess`: guesser places a marker on the grid
- `shadeSignal.reveal`: advance to the reveal phase and compute scores
- `shadeSignal.nextRound`: rotate the leader, pick a new target
- `shadeSignal.leave`: player leaves

### UI Components

- `ShadeSignalPage`: main game page
- `ColorGrid`: interactive color grid (clickable for guessers, display-only for the leader)
- `ClueInput`: the leader's clue submission
- `ClueDisplay`: shows the current clue(s) to guessers
- `GuessMarkers`: overlay markers on the grid showing player guesses
- `RevealOverlay`: highlights the target square and draws distance lines
- `ScoreBoard`: all player scores, including the leader bonus
- `LeaderBadge`: marks the current leader

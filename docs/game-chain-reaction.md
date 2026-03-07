# Chain Reaction — Game Design Document

> **Status:** Implemented
> **Players:** 2
> **Type:** Competitive word-chain puzzle

---

## Core Idea

Two players race to solve a chain of associated words. Each hidden word connects naturally to the word above and below it via common phrases or associations.

**Example chain:**
```
FIRE
TRUCK       ← fire truck
STOP        ← truck stop
SIGN        ← stop sign
LANGUAGE    ← sign language
```

**What it tests:** vocabulary, pattern recognition, phrase association, pressure guessing.

---

## Game Phases

### Phase 1: Build the Chain

- Generate a chain of 5–7 words. (should be an option on the homepage for the game for the length of th chain)
- Each word must form a valid/common phrase with the word directly above and below it.
- Reveal only the **first** and **last** word; hide everything in between.

**Starting state example:**
```
FIRE
_ _ _ _ _
_ _ _ _
_ _ _ _
LANGUAGE
```

### Phase 2: Turn Loop

Players alternate turns. On each turn:

1. **Choose** which hidden word to attack (usually adjacent to something already revealed).
2. **Reveal one letter** — the next unrevealed letter of that word appears (keep the final letter hidden until the word is solved, to preserve deduction).
3. **Make one guess** — one attempt to guess the full word. Unless both people havent got it

**Resolve:**
- **Correct** → score the word, reveal it fully.
- **Wrong** → turn ends, partial letters stay visible to both players.

### Phase 3: Clue Escalation

When a word is guessed incorrectly:
- One additional letter is revealed the next time that word is chosen.
- The partial pattern remains visible to both players.

```
First attempt:  _ R _ C K   → wrong
Next attempt:   T R _ C K   → easier to solve as TRUCK
```

### Phase 4: Scoring

**Points per word solved (based on letters revealed):**

| Letters shown | Points |
|---------------|--------|
| 1–2           | 3      |
| 3–4           | 2      |
| 5+            | 1      |

**Bonus:** Whoever solves the final hidden word gets +1 bonus point.

This incentivizes guessing early rather than waiting for more letters.

### Phase 5: End of Round

The round ends when all hidden words are solved.

**Win conditions (pick one per game mode):**
- Best of X rounds (can be selected)
- First to X points (can be selected)
- Timed session — most points at the end

---

## Rules

- Only **one guess** per turn.
- Every link in the chain must be a defensible common phrase or association.
- No hyper-obscure slang unless both players agree.
- If both players dispute a link, replace the chain.

---

## Implementation Notes

### Data Model (planned)

```
chain_reaction_games {
  id: string
  code: string (6-char join code)
  host_id: string (session ID)
  phase: "lobby" | "playing" | "finished" | "ended"

  players: [
    { sessionId, name, connected }  // exactly 2
  ]

  chain: [
    { word: string, revealed: boolean, lettersShown: number }
  ]

  current_turn: string  // sessionId of whose turn it is

  scores: { [sessionId]: number }

  round_history: [
    { round, chain, scores }
  ]

  settings: {
    chainLength: 5 | 6 | 7
    rounds: number
    turnTimeSec: number | null
  }
}
```

### Chain Generation

Need a curated bank of word-chains where each pair forms a common compound word or phrase. Options:
1. **Pre-built chains** — most reliable, curate 50–100+ chains.
2. **Pair-bank with solver** — store valid word pairs, use graph algorithm to build chains of target length.
3. **AI-assisted** — generate and validate at build time, ship as static data.

Recommended: start with pre-built chains, expand later.

### Key Mutators

- `chainReaction.create` — create game, host joins automatically
- `chainReaction.join` — second player joins
- `chainReaction.start` — host starts, generates chain
- `chainReaction.revealLetter` — reveal next letter of chosen word
- `chainReaction.guess` — submit guess for a word
- `chainReaction.leave` — player leaves (ends game)

### UI Components

- `ChainReactionPage` — main game page
- `ChainDisplay` — vertical chain visualization with revealed/hidden words
- `WordSlot` — individual word slot showing partial letters
- `GuessInput` — input for submitting a guess
- `ScoreBoard` — two-player score comparison
- `TurnIndicator` — whose turn it is

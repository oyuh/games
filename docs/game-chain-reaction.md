# Chain Reaction (Game Design Document)

> **Status:** Implemented
> **Players:** 2
> **Type:** Competitive word-chain puzzle

---

## Core Idea

Two players race to solve a chain of associated words. Each hidden word connects naturally to the word above and below it through common phrases or associations.

**Example chain:**
```
FIRE
TRUCK       <- fire truck
STOP        <- truck stop
SIGN        <- stop sign
LANGUAGE    <- sign language
```

**What it tests:** vocabulary, pattern recognition, phrase association, and guessing under pressure.

---

## Game Phases

### Phase 1: Build the Chain

- Generate a chain of 5-7 words. Chain length should be an option on the homepage when setting up the game.
- Each word must form a valid, common phrase with the word directly above and below it.
- Only the **first** and **last** words are revealed; everything in between stays hidden.

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

1. **Choose** which hidden word to attack (usually one adjacent to something already revealed).
2. **Reveal one letter.** The next unrevealed letter of that word appears. The final letter stays hidden until the word is solved, to preserve some deduction.
3. **Make one guess.** One attempt at the full word, unless neither player has gotten it yet.

**Resolution:**
- **Correct:** score the word and reveal it fully.
- **Wrong:** the turn ends, and the partial letters stay visible to both players.

### Phase 3: Clue Escalation

When a word is guessed incorrectly:
- One additional letter is revealed the next time that word is chosen.
- The partial pattern stays visible to both players.

```
First attempt:  _ R _ C K   -> wrong
Next attempt:   T R _ C K   -> much easier to solve as TRUCK
```

### Phase 4: Scoring

**Points per word solved, based on how many letters were showing:**

| Letters shown | Points |
|---------------|--------|
| 1-2           | 3      |
| 3-4           | 2      |
| 5+            | 1      |

**Bonus:** whoever solves the final hidden word gets +1.

The whole point is to reward guessing early instead of camping until the word spells itself out.

### Phase 5: End of Round

The round ends when all hidden words are solved.

**Win conditions (pick one per game mode):**
- Best of X rounds (selectable)
- First to X points (selectable)
- Timed session, most points when time runs out

---

## Rules

- Only **one guess** per turn.
- Every link in the chain must be a defensible common phrase or association.
- No hyper-obscure slang unless both players agree to it.
- If both players dispute a link, replace the chain.

---

## Implementation Notes

### Data Model

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

This needs a curated bank of word chains where each pair forms a common compound word or phrase. Options:

1. **Pre-built chains.** Most reliable; curate 50-100+ chains by hand.
2. **Pair-bank with solver.** Store valid word pairs and use a graph algorithm to build chains of the target length.
3. **AI-assisted.** Generate and validate at build time, ship as static data.

The recommendation: start with pre-built chains and expand later.

### Key Mutators

- `chainReaction.create`: create the game; the host joins automatically
- `chainReaction.join`: second player joins
- `chainReaction.start`: host starts, chain is generated
- `chainReaction.revealLetter`: reveal the next letter of the chosen word
- `chainReaction.guess`: submit a guess for a word
- `chainReaction.leave`: player leaves (ends the game)

### UI Components

- `ChainReactionPage`: main game page
- `ChainDisplay`: vertical chain visualization with revealed/hidden words
- `WordSlot`: individual word slot showing partial letters
- `GuessInput`: input for submitting a guess
- `ScoreBoard`: two-player score comparison
- `TurnIndicator`: whose turn it is

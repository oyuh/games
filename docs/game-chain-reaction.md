# Chain Reaction

> **Status:** Implemented
> **Players:** 2
> **Type:** Competitive word-chain race

---

## Core Idea

Two players race to solve a chain of linked words. Each hidden word makes a common phrase or compound word with the word above it.

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

## How to Play

1. **Create or join.** The host creates a lobby and shares the 6-character join code. The room holds exactly 2 players.
2. **Get your chain.** Each player gets their own chain. Only the first and last words show. Everything in between is blanks.
3. **Solve it.** Both players play at the same time, no turns. Pick any hidden word and guess it, or ask for a hint letter first.
4. **Round over.** The round ends when both chains are fully solved. Then the next round deals new chains.
5. **Game over.** After the last round, the higher score wins. Equal scores are a tie.

**Starting state example:**
```
FIRE
_ _ _ _ _
_ _ _ _
_ _ _ _
LANGUAGE
```

---

## Game Phases

| Phase | What happens |
|-------|-------------|
| **Lobby** | Two players join. The host changes settings and starts the game. |
| **Submitting** | Custom mode only. Each player writes a chain for the other one to solve. |
| **Playing** | Both players solve their own chain at the same time. |
| **Finished** | All rounds done. Final scores and every chain from every round. |

---

## Chain Modes

- **Premade.** The server builds a chain for each player from the chosen category. The two players get different chains.
- **Custom.** Before each round, each player types a chain of the set length. You solve the chain your opponent wrote.

---

## Configuration

| Setting | Range | Default | Description |
|---------|-------|---------|-------------|
| **Chain length** | 5-10 | 5 | Words per chain, including the two given ends |
| **Rounds** | 1-10 | 3 | Rounds to play |
| **Round clock** | Off, or 15-600 s | Off | A countdown shown during each round |
| **Mode** | Premade, Custom | Premade | Where chains come from |
| **Category** | 9 options | Animals | Theme for premade chains |

The host can change all of these from the lobby.

The round clock is display-only right now. Nothing ends the round when it hits zero, so a round always runs until both chains are solved.

### Categories

Animals · Movies & Shows · Disney & Pixar · Shooter Games · Video Games · Food · Drinks · Sports · Around the House

A category only picks the first word. The rest of the chain is whatever the link bank finds from there.

---

## Rules

- **Hint.** Reveals the next letter of a hidden word. The last letter never shows, so you always have to make the final call.
- **Wrong guess.** Reveals one more letter for free, up to the same limit.
- **Give up.** Reveals the word for 0 points.
- Guesses aren't case sensitive. You can guess as often as you like.
- Players who join after the game starts can spectate and chat.
- The host can kick players and remove spectators. Kicked players can't rejoin.
- If either player leaves mid-game, the game ends. The host leaving ends it for everyone.

---

## Scoring

Points per solved word, based on how many letters were showing when you got it:

| Letters shown | Points |
|---------------|--------|
| 0-2           | 3      |
| 3-4           | 2      |
| 5+            | 1      |

**Bonus:** solving the last hidden word in your chain is worth +1.

The whole point is to reward guessing early instead of waiting for the word to spell itself out.

---

## Implementation Notes

### Data Model

```
chain_reaction_games {
  id, code, host_id
  phase: "lobby" | "submitting" | "playing" | "finished" | "ended"
  players: [{ sessionId, name, connected }]          // exactly 2
  chain: { [sessionId]: [{ word, secret, revealed, lettersShown, solvedBy }] }
  submitted_chains: { [sessionId]: string[] }        // custom mode, sealed
  scores: { [sessionId]: number }
  round_history: [{ round, chains, scores }]
  settings: { chainLength, rounds, currentRound, turnTimeSec, phaseEndsAt, chainMode, category }
}
```

`current_turn` is still a column but nothing uses it, since both players play at once.

### Chain Generation

`word-banks.ts` holds a link bank (`chainLinks`): each word maps to the words that can follow it. `pickChain` starts from a random themed word in `chainStarts` and walks the bank until the chain is long enough, without repeating a word.

### Hidden words

A hidden word syncs as a mask (`TR___`) plus a sealed copy only the server can open. Clients never hold their own answers, so guesses, hints, and give-ups are all resolved on the server. No client can fetch the chain key.

### Key Mutators

- `chainReaction.create`, `join`, `leave`, `start`, `updateSettings`
- `chainReaction.submitChain`: custom mode chain entry
- `chainReaction.revealLetter`: hint letter
- `chainReaction.guess`: check a guess on the server
- `chainReaction.giveUp`: reveal a word for 0 points

### UI Components

- `ChainReactionPage`: main game page
- `ChainLobby`: settings and players
- `ChainRound`: the round in play
- `ChainGuessField`: the inline guess input
- `ChainGameOver`: final scores and round history

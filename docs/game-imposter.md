# Imposter

A social deduction game. Every round, players see a secret word — except the imposter. Everyone gives one-word clues, then votes on who the imposter is.

---

## How to play

1. **Create or join** — The host creates a lobby and shares the 6-character join code. Players join via the code on the home page.
2. **Clue phase** — A secret word is revealed to everyone except the imposter(s). Each player submits a single one-word clue that proves they know the word without giving it away. The imposter has to bluff.
3. **Voting phase** — After clues are in, everyone reviews them and votes for who they think is the imposter. You can't vote for yourself.
4. **Results** — The votes are tallied. If the imposter got the most votes, they're caught. Then the next round begins.

The game runs for the configured number of rounds, then shows a full summary.

---

## Game phases

| Phase | What happens |
|-------|-------------|
| **Lobby** | Players join. Host configures settings and starts the game (minimum 3 players). |
| **Playing** | Secret word assigned. All players submit one clue (75 second timer). Auto-advances when all clues are in. |
| **Voting** | Players vote on who the imposter is (45 second timer). Auto-advances when all votes are in. |
| **Results** | Vote tally shown. Reveals whether the imposter was caught. Host advances to next round or finishes. |
| **Finished** | All rounds complete. Full round history displayed. |

---

## Configuration

| Setting | Range | Default | Description |
|---------|-------|---------|-------------|
| **Rounds** | 1–10 | 3 | Number of rounds to play |
| **Imposters** | 1–5 | 1 | Number of imposters per round (capped to `players - 1`) |
| **Category** | 15 options | Animals | Word bank to draw secret words from |

### Categories

Animals · Movies & Shows · Disney & Pixar · FPS Games · Other Games · Food · Drinks · Restaurants · Car Brands · Luxury Brands · Sports · Celebrities · Countries · Cities · Minecraft Mobs

Each category has 15–20 words.

---

## Rules

- Clues must be **one word** and cannot contain the secret word.
- If a player doesn't submit a clue before the timer, it auto-fills as "(no clue)".
- You **cannot vote for yourself**.
- Roles (imposter vs regular) are randomly re-assigned each round.
- Players who join after the game starts can spectate and chat but can't participate.
- The host can kick players from the lobby.

---

## Scoring

There's no explicit point system. Each round is a binary outcome:

- **Caught** — The imposter(s) received the most votes.
- **Not caught** — The imposter(s) blended in.

The round history at the end shows the secret word, all clues, vote distribution, and whether the imposter was caught for every round.

---

## Technical notes

- Real-time sync via Zero (Rocicorp) — all state changes propagate instantly.
- Phase timers are server-authoritative (`phaseEndsAt` timestamp).
- Round history is stored as a JSON array of `{ round, secretWord, imposters, caught, clues, votes }`.
- Join code is a random 6-character uppercase string, unique per game.

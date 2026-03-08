# Password

A team-based word guessing game. Each round, one player gives a one-word clue and their teammates try to guess the secret word. First team to the target score wins.

---

## How to play

1. **Create or join** — The host creates a lobby and shares the 6-character join code. Players join and pick teams.
2. **Clue phase** — Each round, one team member is the **guesser**. Everyone else on the team sees the secret word and submits a single one-word clue.
3. **Guess phase** — The guesser reads the clues and types their best guess before the timer runs out.
4. **Scoring** — Correct guess = +1 point for the team. Wrong guess = the team gets new clues with the same word.
5. **Victory** — First team to reach the target score wins.

---

## Game phases

| Phase | What happens |
|-------|-------------|
| **Lobby** | Players join teams. Host configures settings and starts the game (minimum 2 teams with 2+ members each). |
| **Playing** | Rounds run per-team. Clue givers submit hints, guesser guesses. 75-second timer per round. |
| **Results** | Final scores displayed. Winning team announced. Full round history available. |

---

## Configuration

| Setting | Range | Default | Description |
|---------|-------|---------|-------------|
| **Teams** | 2–6 | 2 | Number of teams |
| **Target Score** | 1–50 | 10 | Points needed to win |

---

## Team mechanics

- **Auto-assignment** — Players joining the lobby are placed on the smallest team.
- **Manual moves** — The host can drag any player to any team.
- **Lock teams** — The host can lock teams so players can't switch mid-game.
- **Minimum** — Each team needs at least 2 members to start (one guesser + one clue giver).

---

## Round flow

1. A random word is assigned to the team from a pool of 150+ common nouns.
2. The **guesser** rotates each round: `members[(round - 1) % teamSize]`.
3. All non-guesser team members submit exactly one clue (one word, can't contain the target word).
4. The guesser sees the clues and submits a guess.
5. **Correct** → Team scores +1. If target score reached, game ends. Otherwise, new round with a new word and rotated guesser.
6. **Wrong** → Clues clear. Same guesser retries with fresh clues from the team. Timer keeps running.

---

## Rules

- Clues must be **one word** and cannot be identical to or contain the target word.
- One clue per clue-giver per attempt.
- The guesser cannot see the target word.
- The timer (75 seconds) is shared for the entire round — wrong guesses don't reset it.
- Players who join after the game starts can spectate and chat but can't join a team.
- The host can kick players from the lobby.

---

## Scoring

| Event | Points |
|-------|--------|
| Correct guess | +1 for the team |
| Wrong guess | 0 (retry with new clues) |
| Timer expires | 0 (round fails) |

**Win condition:** First team to reach the configured target score.

---

## Technical notes

- Real-time sync via Zero (Rocicorp) — clue submission and guesses propagate instantly.
- Each team's rounds run sequentially (not parallel with other teams).
- Round history stores `{ round, teamIndex, guesserId, word, clues, guess, correct }` per round.
- Join code is a random 6-character uppercase string, unique per game.

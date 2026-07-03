# Password

A live team word-guessing game. The clue givers and the guesser work at the same time, with a shared round timeline showing every clue and guess as it happens.

---

## How to play

1. **Create or join.** The host creates a lobby and shares the 6-character join code. Players join and pick teams.
2. **Live round.** One player on each team is the **guesser**. Everyone else on that team sees the secret word and can keep sending one-word clues while the guesser watches and types guesses.
3. **Shared timeline.** Clues and guesses stack into a live history for the round, so teammates can see what's already been tried.
4. **Scoring.** Solving on the first guess is worth the most points. Later solves still score, just less.
5. **Victory.** First team to hit the target score wins.

---

## Game phases

| Phase | What happens |
|-------|-------------|
| **Lobby** | Players join teams. Host configures settings and starts the game (minimum 2 teams with 2+ members each). |
| **Playing** | Every team runs a live round with one guesser, multiple clue givers, and a shared clue/guess timeline. |
| **Results** | Final scores displayed. Winning team announced. Full round history available. |

---

## Configuration

| Setting | Range | Default | Description |
|---------|-------|---------|-------------|
| **Teams** | 2-6 | 2 | Number of teams |
| **Target Score** | 1-50 | 10 | Points needed to win |

---

## Team mechanics

- **Auto-assignment.** Players joining the lobby land on the smallest team.
- **Manual moves.** The host can drag any player to any team.
- **Lock teams.** The host can lock teams so nobody switches mid-game.
- **Minimum.** Each team needs at least 2 members to start (one guesser plus one clue giver).

---

## Round flow

1. A random word is assigned to the team from a pool of common nouns.
2. The **guesser** rotates each solved round: `members[(round - 1) % teamSize]`.
3. All non-guesser teammates can submit one-word clues whenever they want during the round.
4. The guesser can guess at any time and sees the full clue-and-guess history while playing.
5. Duplicate guesses are blocked so the guess history stays meaningful.
6. **Correct guess:** the team scores based on how many guesses it took, then rotates into a fresh word and guesser.
7. **Timer expires:** the in-progress round is recorded as incomplete and the game moves to results.

---

## Rules

- Clues must be **one word** and can't be identical to or contain the target word.
- Clue givers can submit multiple clues in the same round.
- The guesser can't see the target word.
- The timer is shared for the whole game round window.
- Players who join after the game starts can spectate and chat, but can't join a team.
- The host can kick players from the lobby.

---

## Scoring

| Solve timing | Points |
|-------------|--------|
| First guess | 3 |
| Second guess | 2 |
| Third guess or later | 1 |
| Timer expires | 0 |

**Win condition:** first team to reach the configured target score.

---

## Technical notes

- Real-time sync via Zero stores committed clues, guesses, scores, and round history.
- Per-character teammate typing is broadcast on a private team Bun WebSocket topic.
- Other teams can't see your in-progress round; only the scoreboard totals are shared during play.
- Round history stores words, clue events, guess events, attempts, and awarded points for the end-of-game review.

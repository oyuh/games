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
| **Teams** | 2-6 | 2 | Number of teams, picked when the room is created |
| **Target Score** | 1-50 | 10 | Points needed to win |
| **Timer** | 30-900 s | 300 s | How long the whole game lasts |
| **Category** | 23 options | Animals | Word bank to draw words from |

The host can change the target score, timer, and category from the lobby. Categories are the same list Imposter uses.

---

## Team mechanics

- **Auto-assignment.** Players joining the lobby land on the smallest team.
- **Switching.** Players can switch teams themselves in the lobby.
- **Manual moves.** The host can move any player to any team.
- **Lock teams.** The host can lock teams. Then nobody can switch, and new players have to wait for the host to place them.
- **Minimum.** Each team needs at least 2 members to start (one guesser plus one clue giver).

---

## Round flow

1. Each team gets a random word from the chosen category. A word used earlier in the game doesn't come back until the category runs out.
2. The **guesser** rotates after each solved word: `members[(round - 1) % teamSize]`.
3. All non-guesser teammates can submit one-word clues whenever they want during the round.
4. The guesser can guess at any time and sees the full clue-and-guess history while playing.
5. Duplicate guesses are blocked so the guess history stays meaningful.
6. **Skip:** each team gets 3 skips per game. Anyone on the team can use one to swap in a new word.
7. **Correct guess:** the team scores based on how many guesses it took, then rotates into a fresh word and guesser.
8. **Timer expires:** every in-progress round is recorded with 0 points and the game moves to results.

---

## Rules

- Clues and guesses must be **one word**. A clue can't be the target word, start with it, or be the start of it.
- Clue givers can submit multiple clues in the same round.
- The guesser can't see the target word.
- One timer covers the whole game, not each word.
- Players who join after the game starts can spectate and chat, but can't join a team.
- The host can kick players and remove spectators. Kicked players can't rejoin.
- The host leaving ends the game for everyone.

---

## Scoring

| Solve timing | Points |
|-------------|--------|
| First guess | 3 |
| Second guess | 2 |
| Third guess or later | 1 |
| Timer expires | 0 |

**Win condition:** first team to reach the target score. If the timer runs out first, the highest score wins.

---

## Technical notes

- Real-time sync via Zero stores committed clues, guesses, scores, and round history.
- Words are rolled on the server and sealed with a per-game key before they sync. Clue givers fetch the key from `/api/game-secret/key`. Guessers can't get it while a round is live.
- Per-character teammate typing is broadcast on a private team Bun WebSocket topic.
- Other teams can't see your in-progress round; only the scoreboard totals are shared during play.
- Round history stores words, clue events, guess events, attempts, and awarded points for the end-of-game review.

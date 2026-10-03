# Imposter

A social deduction game. Everyone sees a secret word except the imposters, who see nothing. Everyone gives a clue, then votes someone out. Vote out every imposter to win. Let them survive long enough and they win instead.

---

## How to play

1. **Create or join.** The host creates a lobby and shares the 6-character join code. Players join with the code on the home page, or from the public lobby list if the host made the room public.
2. **Clue phase.** The secret word goes to everyone except the imposters. Each player submits a short clue that proves they know the word without giving it away. The imposters have to bluff.
3. **Voting phase.** Once the clues are in, everyone votes for who they think is an imposter. You can't vote for yourself.
4. **Results.** The player with the most votes is out and moves to the spectators. The results screen says whether they were an imposter.
5. **Next round.** If the game isn't over, the survivors get a fresh word and go again with the same roles.

---

## Game phases

| Phase | What happens |
|-------|-------------|
| **Lobby** | Players join. The host changes settings and starts the game (minimum 3 players). |
| **Playing** | Secret word handed out. Every remaining player submits one clue (75 second timer by default). Moves on as soon as every clue is in. |
| **Voting** | Players vote on who the imposter is (45 second timer). Moves on as soon as every vote is in. |
| **Results** | Vote tally and the reveal. Moves on after 8 seconds, or right away if every remaining player votes to skip. |
| **Finished** | Game over. Full round history displayed. |

The host leaving ends the game for everyone.

---

## Configuration

| Setting | Range | Default | Description |
|---------|-------|---------|-------------|
| **Rounds** | 1-10 | 3 | Most rounds the game can run |
| **Imposters** | 1-5 | 1 | Imposters in the game (capped to `players - 1`) |
| **Clue timer** | 15-300 s | 75 s | How long the clue phase lasts |
| **Imposter peek** | 0, 25%, 50%, 65%, 100% | 65% | How much of each clue the imposters can see while clues come in |
| **Category** | 23 options | Animals | Word bank to draw secret words from |

The host can change all of these from the lobby before the game starts.

### Categories

Animals · Movies & Shows · Disney & Pixar · Shooter Games · Video Games · Food · Drinks · Restaurants · Car Brands · Luxury Brands · Sports · Celebrities · Countries · Cities · Minecraft Mobs · Superheroes · Musicians · Anime · Apps & Websites · Pokémon · Jobs · Around the House · Places

Each category has 60-100 words.

---

## Rules

- Clues can be up to 80 characters. If a player doesn't submit one before the timer runs out, it fills in as "(no clue)".
- Regular players only see that someone locked in a clue, not what it says, until voting. Imposters see other players' clues with letters blanked out, as much as the peek setting allows.
- You **cannot vote for yourself**. Nice try.
- The most-voted player is out. A tie knocks out one of the tied players. If nobody votes, nobody is out.
- Roles are picked once, when the game starts, and stay the same every round.
- With more than one imposter, the imposters get a private chat channel only they can read.
- Players who join after the game starts can spectate and chat, but can't play.
- The host can kick players and remove spectators. Kicked players can't rejoin.

---

## Winning

The game ends when any of these happen:

- **Every imposter is out.** The regular players win.
- **Imposters equal or outnumber the regular players.** The imposters win.
- **The last round ends.** Any imposter still in survived.

The round history at the end shows the secret word, every clue, every vote, and who was voted out for every round.

---

## Technical notes

- Real-time sync via Zero (Rocicorp), so every state change shows up for everyone right away.
- Phase timers are server-authoritative (`phaseEndsAt` timestamp).
- Roles and the secret word are rolled on the server only. The secret word is sealed with a per-game key, so it never syncs to clients in the clear. Players fetch the key from `/api/game-secret/key`, and imposters don't get it until the results screen.
- Imposter channel messages are sealed with a separate key from `/api/game-secret/imposter-chat-key`.
- Round history is stored as a JSON array of `{ round, secretWord, votedOutId, votedOutName, wasImposter, clues, votes }`.
- The join code is a random 6-character uppercase string, unique per game.

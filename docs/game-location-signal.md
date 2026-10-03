# Location Signal

> **Status:** Implemented
> **Players:** 2 or more (3-8 is the sweet spot)
> **Type:** Competitive map and clue party game

---

## Core Idea

Each round, one player is the **Leader** and secretly drops a pin anywhere on a world map. The leader gives short clues, and everyone else clicks where they think the pin is. The closer you land, the more points you get.

**Highest total score wins.**

It's basically a social spin on GeoGuessr-style distance guessing, where clue quality and mind games are the core skill.

---

## Round Flow

1. **Pick.** The leader pans the map and drops the target pin. No timer.
2. **Clue.** The leader writes a short clue, like "Mediterranean" or "mountain capital".
3. **Guess.** Every guesser drops a marker on the map.
4. **Repeat.** With more than one clue pair, the leader gives another clue and guessers can move their marker. This repeats once per clue pair.
5. **Reveal.** The real spot and every final marker show up, with each guesser's distance and points. The reveal lasts 10 seconds, or the host can move on sooner.
6. **Rotate.** The next player in the order becomes leader and picks a new spot.

If the leader runs out of time on a clue, the round moves on with no clue. When every guesser has locked in, the guess phase ends 5 seconds later instead of waiting out the timer.

**Duel shortcut:** with exactly one guesser, a guess within 120.7 km (75 miles) of the target ends the round right away with full points.

---

## Scoring

Each guesser scores their last marker of the round:

- Within 120.7 km (75 miles) of the target: **5000 points**.
- Farther out, points fall off smoothly: `5000 × e^(-(km - 120.7) / 3000)`, rounded. That's about 2700 points at 2000 km, and it never quite reaches 0.

The leader doesn't score in their own round.

The scorer is `scoreForDistance` in `location-signal.ts`, and distance is great-circle (haversine) distance.

---

## Rules

- Clues can be up to 80 characters. The game doesn't police what's in them, so naming the exact place is a table rule, not a code rule.
- Guessers can move their marker until the phase ends.
- The leader order is shuffled once at the start.
- Players who join after the game starts can spectate and chat.
- The host can kick players and remove spectators. Kicked players can't rejoin. The host leaving ends the game for everyone.

---

## Settings

| Setting | Range | Default |
|--------|-------|---------|
| Rounds per player | 1-3 | 1 |
| Clue pairs per round | 1-4 | 2 |
| Clue timer | 10-180 s | 45 s |
| Guess timer | 10-180 s | 45 s |

The host can change all of these from the lobby. The game runs `players × rounds per player` rounds.

---

## Implementation Notes

### Map

`WorldMap.tsx` draws its own tile map with Google Hybrid tiles (satellite plus labels), wrapped so the map repeats sideways forever. It loads tiles straight from Google. The API's `/api/maps/config` and `/api/maps/geocode` endpoints exist, but the current map doesn't call them.

### Hidden target

When the leader picks, the server seals the spot with a per-game key (`encrypted_target`), so guessers' clients never hold it. Only the leader can fetch the key from `/api/game-secret/key` before the reveal. At the reveal the server opens it, scores the round, and writes the target in the clear.

### Data Model

```
location_signal_games {
  id, code, host_id
  phase: "lobby" | "picking" | "clue1" | "guess1" | ... | "clue4" | "guess4" | "reveal" | "finished" | "ended"
  players: [{ sessionId, name, connected, totalScore }]
  leader_id, leader_order, current_leader_index
  target_lat, target_lng, encrypted_target
  clue1, clue2, clue3, clue4
  guesses: [{ sessionId, round: 1-4, lat, lng }]
  round_history: [{ round, leaderId, target, clue1, clue2, clue3, clue4, guesses, scores }]
  settings: { clueDurationSec, guessDurationSec, roundsPerPlayer, cluePairs, currentRound, phaseEndsAt }
}
```

`scores` in a round history entry is every player's running total after that round.

---

## Key Mutators

- `locationSignal.create`, `join`, `leave`, `start`, `updateSettings`
- `locationSignal.setTarget`: the leader's pick
- `locationSignal.submitClue`: clue for pair 1-4
- `locationSignal.submitGuess`: place or move a marker
- `locationSignal.advanceTimer`: moves the phase along when the timer runs out, and scores the last guess phase
- `locationSignal.revealRound`: host skip to the next clue or the reveal
- `locationSignal.nextRound`: host skip from the reveal
- `locationSignal.kick`, `endGame`

---

## UI Components

- `LocationSignalPage` (desktop)
- `MobileLocationSignalPage` (mobile)
- `LocationLobby`: settings and players
- `LocationRound`: the round in play
- `WorldMap`: the map, click to pick or guess

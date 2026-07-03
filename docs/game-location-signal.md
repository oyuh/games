# Location Signal (Game Design Document)

> **Status:** Implemented
> **Players:** 2-10
> **Type:** Competitive map + clue party game

---

## Core Idea

Each round, one player is the **Leader** and secretly picks a real-world location (a city, landmark, or region) on a world map. The Leader gives up to **two clues**. Everyone else clicks where they think the location is. Closer guesses collect fewer points.

**Scoring style:** golf. **Lowest total score wins.**

It's basically a social spin on GeoGuessr-style distance guessing, where clue quality and mind games are the core skill.

---

## Round Flow

### Phase 1: Leader Pick

- The leader gets an interactive map and chooses a hidden target point.
- Guessers can't see the target.
- Optional: lock the location scope by category (city-only, country-only, landmark-only).

### Phase 2: Clue 1

- The leader submits a first clue (short text).
- Example clues: "Mediterranean", "mountain capital", "desert coast".

### Phase 3: Guess 1

- All guessers place their first marker on the map.
- Guesses stay hidden until everyone has submitted (or the timer ends).

### Phase 4: Clue 2 (Correction Clue)

- The leader submits a second clue after seeing the first-guess spread.
- The point is to let guessers recover if they're wildly off.

### Phase 5: Final Guess

- Guessers can move their marker and submit a final guess.
- The final guess is what counts for scoring (in the default mode).

### Phase 6: Reveal + Scoring

- The true location and all final markers are revealed.
- Each guesser's distance to the target is computed.
- Distance is converted to penalty points; lower is better.

### Phase 7: Rotate Leader

- The next player becomes leader.
- Repeat until everyone has led once (or for the configured number of rounds).

---

## Scoring Model (Golf)

### Default (Distance Buckets)

| Distance to target | Penalty points |
|--------------------|----------------|
| <= 25 km           | 0              |
| <= 100 km          | 1              |
| <= 250 km          | 2              |
| <= 500 km          | 3              |
| <= 1000 km         | 5              |
| > 1000 km          | 8              |

- Lowest cumulative score after all rounds wins.
- Tie-breaker: best (lowest) single-round score, then most exact/near hits.

### Optional Variant (Raw Distance)

- Use the exact km distance as points (capped); lowest still wins.
- More precise, but less casual-friendly.

---

## Rules

- The leader can't use exact coordinates or lat/long.
- The leader can't name the exact location directly.
- Clue 1 and clue 2 each have a character limit (e.g. 40 chars).
- Guessers can't submit after the timer expires.
- The host can turn second-clue mode on or off.

---

## Suggested Settings

| Setting | Range | Default |
|--------|-------|---------|
| Rounds | 1-10 | player count (everyone leads once) |
| Guess timer | 15-120 sec | 45 sec |
| Clue timer | 10-60 sec | 20 sec |
| Map scope | world / region / category | world |
| Second clue | on/off | on |
| Scoring mode | bucket / raw km | bucket |

---

## Data Model

```ts
location_signal_games {
  id: string
  code: string
  host_id: string
  phase: "lobby" | "pick" | "clue1" | "guess1" | "clue2" | "guess2" | "reveal" | "finished" | "ended"

  players: Array<{ sessionId: string; name: string; connected: boolean }>
  spectators: Array<{ sessionId: string }>

  settings: {
    rounds: number
    clueDurationSec: number
    guessDurationSec: number
    useSecondClue: boolean
    scoringMode: "bucket" | "raw"
    mapScope: "world" | "region" | "country-only" | "landmarks"
  }

  currentRound: number
  leaderOrder: string[]
  leaderId: string

  target: { lat: number; lng: number } | null
  clue1: string | null
  clue2: string | null

  guesses1: Record<string, { lat: number; lng: number }>
  guesses2: Record<string, { lat: number; lng: number }>

  scores: Record<string, number> // golf: lower is better

  roundHistory: Array<{
    round: number
    leaderId: string
    target: { lat: number; lng: number }
    clue1: string
    clue2: string | null
    guesses: Record<string, { lat: number; lng: number }>
    distancesKm: Record<string, number>
    penalties: Record<string, number>
  }>

  kicked: string[]
  endedAt?: number
}
```

---

## Key Mutators

- `locationSignal.create`
- `locationSignal.join`
- `locationSignal.start`
- `locationSignal.pickLocation`
- `locationSignal.submitClue1`
- `locationSignal.submitGuess1`
- `locationSignal.submitClue2`
- `locationSignal.submitGuess2`
- `locationSignal.revealRound`
- `locationSignal.nextRound`
- `locationSignal.leave`
- `locationSignal.kick`
- `locationSignal.end`

---

## UI Components

- `LocationSignalPage` (desktop)
- `MobileLocationSignalPage` (mobile)
- `WorldMapCanvas` / `WorldMap` (click-to-guess)
- `LeaderPickPanel`
- `CluePanel`
- `GuessMarkersOverlay`
- `DistanceResultsPanel`
- `ScoreboardGolf`
- `RoundTimeline`

---

## UX Notes

- Auto-focus the clue inputs when clue phases start.
- Keep the map center/zoom smooth between phases.
- Show a clear phase countdown and lock state.
- On reveal, animate lines from guesses to the target so results read instantly.
- Keep spectators read-only but fully informed.

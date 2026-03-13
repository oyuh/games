# Location Signal — Game Design Document

> **Status:** Implemented
> **Players:** 2–10
> **Type:** Competitive map + clue party game

---

## Core Idea

Each round, one player is the **Leader** and secretly picks a real-world location (city/landmark/region) on a world map. The Leader gives up to **two clues**. Everyone else clicks where they think the location is. Closest guesses get the fewest points.

**Scoring style:** golf — **lowest total score wins**.

This game is a social version of GeoGuessr-style distance guessing, with clue quality and mind-games as the core skill.

---

## Round Flow

### Phase 1: Leader Pick

- Leader is shown an interactive map and chooses a hidden target point.
- Guessers do not see the target.
- Optional: lock location scope by category (city-only, country-only, landmark-only).

### Phase 2: Clue 1

- Leader submits first clue (short text).
- Example clues: "Mediterranean", "mountain capital", "desert coast".

### Phase 3: Guess 1

- All guessers place first guess marker on map.
- Guesses are hidden until all guessers submit (or timer ends).

### Phase 4: Clue 2 (Correction Clue)

- Leader submits second clue after seeing first-guess spread.
- Purpose: allow guessers to recover if they are very far off.

### Phase 5: Final Guess

- Guessers can move marker and submit final guess.
- Final guess is what counts for scoring (default mode).

### Phase 6: Reveal + Scoring

- Reveal true location and all final guess markers.
- Compute each guesser distance to target.
- Convert distance to penalty points (lower is better).

### Phase 7: Rotate Leader

- Next player becomes leader.
- Repeat until everyone leads once (or configured rounds).

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

- Use exact km distance as points (capped), still lowest wins.
- More precise but less casual-friendly.

---

## Rules

- Leader cannot use exact coordinates/lat-long.
- Leader cannot name the exact location directly.
- Clue 1 and clue 2 each have character limit (e.g., 40 chars).
- Guessers cannot submit after timer expires.
- Host can enable/disable second clue mode.

---

## Suggested Settings

| Setting | Range | Default |
|--------|-------|---------|
| Rounds | 1–10 | players count (everyone leads once) |
| Guess timer | 15–120 sec | 45 sec |
| Clue timer | 10–60 sec | 20 sec |
| Map scope | world / region / category | world |
| Second clue | on/off | on |
| Scoring mode | bucket / raw km | bucket |

---

## Data Model (planned)

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

## Key Mutators (planned)

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

## UI Components (planned)

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

- Auto-focus clue inputs when clue phases start.
- Keep map center/zoom smooth between phases.
- Show clear phase countdown + lock state.
- On reveal, animate lines from guesses to target for clarity.
- Keep spectators read-only but fully informed.

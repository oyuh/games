# Security Hardening Plan (Safe Rollout, Low Latency)

Date: 2026-03-17
Scope: API (`apps/api`), web client (`apps/web`), shared mutators/schema (`packages/shared`)

## Goals

- Block obvious abuse paths without hurting normal gameplay.
- Ensure unauthorized actions fail server-side, not only client-side.
- Keep onboarding zero-friction (no account setup; players can still join instantly).
- Keep latency overhead negligible (O(1) checks, in-memory limits, minimal extra DB roundtrips).
- Avoid random breakage via phased rollout + backward-compatible fallbacks.

## Non-negotiables

- **No trust in client-provided `hostId`/`sessionId` for authorization decisions.**
- **No production demo mutators.**
- **Rate-limited responses are user-visible and recoverable** (toast with retry guidance).
- **Security checks are additive and server-first**; old clients continue to work during transition.

---

## Phase 1 — Immediate protections (very low risk)

### 1) Block demo mutators in production

**File:** `packages/shared/src/zero/mutators/demo.ts`

- Add guard at mutator entry: if `name.startsWith("demo.") && NODE_ENV === "production"`, throw.
- Keep dev behavior unchanged.

**Acceptance**
- Dev still seeds demos.
- Prod always rejects `demo.*` mutate calls.

### 2) Server-side route-group rate limiting

**Files:**
- `apps/api/src/rate-limit.ts`
- `apps/api/src/index.ts`

- Keep sliding-window in-memory limiter.
- Add route-group middlewares (after `cors`, before routes):
  - `/api/zero/*` → `120/min`
  - `/api/maps/geocode` → `10/min`
  - `/api/pusher/auth` → `30/min`
  - `/api/presence/heartbeat` → `30/min`
  - `/api/cleanup` → `5/min`
  - `/api/game-secret/*` → `30/min` (for Phase 4 endpoint)
- Return structured 429 payload:
  - `code: "RATE_LIMITED"`
  - `message`
  - `retryAfterMs`
  - `scope` (route group)

**Acceptance**
- Requests over limit return 429 JSON with metadata.
- Typical play traffic never hits limits.

### 3) Global client toasts for 429/403 and forbidden actions

**Files:**
- `apps/web/src/lib/toast.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/lib/zero.ts` (and any centralized fetch wrappers)

- Add one global handler for API/Zero errors:
  - `429` → toast: “You’re doing that too fast — try again in a second.”
  - `403`/authorization failures → toast: “You’re not allowed to do that in this game.”
- Debounce duplicate toasts (same code/message within short window).

**Acceptance**
- User always gets feedback instead of silent fail.
- No toast spam during repeated retries.

---

## Phase 2 — Server-trusted mutator identity (low-med risk)

### 4) Wire caller identity from client to server

**Client files:**
- `apps/web/src/App.tsx`

**Server files:**
- `apps/api/src/index.ts`

- Add Zero `mutateHeaders` with `x-zero-user-id: sessionId`.
- Add `x-zero-user-id` to CORS `allowHeaders`.
- In `/api/zero/mutate` and `/api/zero/query`, read header and set `ctx.userId`.
- Fallback to `"anon"` if header missing (for safe rollout).

**Acceptance**
- Server context receives caller ID for current clients.
- Legacy/missing-header clients still function in fallback mode.

### 5) Add reusable auth guards in mutator helpers

**File:** `packages/shared/src/zero/mutators/helpers.ts`

- Add:
  - `assertCaller(tx, ctx, claimedSessionId)`
  - `assertHost(tx, ctx, claimedHostId, actualHostId)`
- Enforce only when running server-side (`tx.location === "server"`).
- Gracefully skip strict enforcement if `ctx.userId === "anon"` (temporary rollout safety).

**Acceptance**
- Authorization checks are centralized.
- No accidental lockouts during phased deployment.

### 6) Apply assertions across mutators

**Files:**
- `packages/shared/src/zero/mutators/sessions.ts`
- `packages/shared/src/zero/mutators/chat.ts`
- `packages/shared/src/zero/mutators/imposter.ts`
- `packages/shared/src/zero/mutators/password.ts`
- `packages/shared/src/zero/mutators/chain-reaction.ts`
- `packages/shared/src/zero/mutators/shade-signal.ts`
- `packages/shared/src/zero/mutators/location-signal.ts`

- Replace trust in `args.sessionId/hostId` with `assertCaller`/`assertHost` at mutator entry.
- Protect host-only actions (kick/end/reset/start/settings/announce/etc.).

**Acceptance**
- Impersonation via forged IDs is blocked server-side.
- Legitimate host/player actions still work.

---

## Phase 3 — Secret encryption foundation (high risk; staged)

### 7) Add crypto primitives + key table

**Files:**
- `packages/shared/src/crypto.ts` (new)
- `packages/shared/src/drizzle/schema.ts`
- `packages/shared/src/index.ts`
- DB migration (new SQL)

- Implement:
  - `generateGameKey()` (AES-256 key)
  - `encrypt(plaintext, key)`
  - `decrypt(ciphertext, key)`
  - `isEncrypted(value)`
- Add Drizzle-only table: `game_encryption_keys` with index `(game_type, game_id)`.
- Do **not** expose keys via Zero schema.

**Acceptance**
- Keys persist server-side; no client sync.
- Crypto util works in Node 18+ and browser.

### 8) Add key endpoint with authorization

**File:** `apps/api/src/index.ts`

- Add `POST /api/game-secret/key`.
- Input: `{ gameType, gameId, sessionId }`.
- Validate caller authorization per game.
- Return `{ key, myRole? }` or 403.

**Acceptance**
- Only authorized players receive decryption key.
- Endpoint is rate-limited and audited.

### 9) Add client hook for key retrieval

**File:** `apps/web/src/lib/game-secrets.ts` (existing)

- Implement `useGameSecret(gameType, gameId, sessionId)`:
  - fetch/caches key
  - retries on 404 (optimistic mutation race)
  - returns `{ decryptValue, myRole, loading, error }`

**Acceptance**
- UI can decrypt only when authorized.
- No blocking delay on normal render path beyond initial fetch.

---

## Phase 4 — Game-by-game encryption rollout (one game at a time)

### 10) Shade Signal first (lowest complexity)

- Encrypt target coordinates on server set-target path.
- Store encrypted blob + sentinel public values for non-leaders.
- Decrypt only in leader/reveal UI paths.

### 11) Location Signal

- Same pattern as Shade target encryption.

### 12) Imposter

- Encrypt secret word and per-player roles map.
- Only authorized role/key holders decrypt locally.

### 13) Password

- Encrypt active round words and clues where needed.
- Keep guess flow performance intact.

### 14) Chain Reaction (highest complexity)

- Encrypt hidden word values; keep visible hint plaintext.
- Ensure reveal/check flows preserve current game feel.

**Acceptance (all games)**
- DevTools/IndexedDB no longer reveals plaintext secrets during active rounds.
- Reveal/results phases still display expected data.
- Gameplay timing unchanged for players.

---

## Performance & reliability guardrails

- Keep checks O(1) where possible (header compare, map lookup).
- Reuse existing DB reads in mutators; avoid redundant queries.
- Dedupe and cap toasts to prevent UI churn.
- Add short-circuit fallback behavior during rollout (`anon` compatibility).
- Ship in feature-flagged phases; can disable per-phase quickly.

## Test and rollout checklist

### Functional smoke tests (required each phase)

- New player can land and join/start game immediately.
- Host actions work; non-host forbidden actions fail with proper toast.
- Reconnect, spectator, kick, end-game flows still work.
- Rate-limited routes show clear toast and recover after cooldown.

### Load/latency checks (required for Phase 1 & 2)

- Simulate normal game event rates and burst traffic.
- Verify no false positives under normal play.
- Measure p95 latency before/after; rollback if materially regressed.

### Safe deploy order

1. Server changes with fallback ON.
2. Client headers + global toasts.
3. Tighten enforcement after confirming header propagation.
4. Encrypt per game, one release at a time.

## Rollback strategy

- Keep fallback mode for identity checks until telemetry confirms stability.
- Route-level limits remain configurable via constants/env.
- Encryption per game behind flags so any game can revert independently.

## Open implementation notes

- Current API uses `ctx.userId: "anon"` in Zero handlers; this is the core auth gap.
- Current CORS allowlist does not include `x-zero-user-id` yet.
- Current mutators largely trust caller-provided IDs and need centralized guard adoption.
- Current client already has local mutation rate limiting; keep it, but treat server limiter as source of truth.

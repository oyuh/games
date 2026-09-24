# Testing plan

## What was wrong

The suite had around 7,700 lines of tests and most of the risky code had no coverage at all.

- `apps/api/src/__tests__/security.test.ts` (808 lines) and `api-validation.test.ts` (296 lines) pasted private helpers out of `index.ts` and tested the paste. The real mutator auth pipeline had zero coverage. Change `index.ts` and those tests still pass.
- `local/game-lifecycle`, `local/sessions` and `local/chat` inserted a row with Drizzle and read it back. They tested Drizzle and Postgres, not us.
- The same 30-line `vi.mock("@rocicorp/zero")` block was pasted into seven mutator test files.
- Lots of filler: "returns a string", "does not throw", "has 15 colors", "PUZZLES_PER_RUN equals 5", `(dominoes * 2) % 2 === 0`, the same assertion written twice under different names. `toast.test.ts` asserted nothing at all.
- Engine tests lived in `apps/web` while the engines live in `packages/shared`.
- Nothing ran the real stack. Zero sync, the push endpoint, session proofs, and two players seeing the same room were never exercised together.

## Unit tests (done)

Rule of thumb: a test earns its place if it fails when a real bug ships. Tests import the code they cover. No copies.

1. **API mutator auth.** The caller pipeline moved out of `index.ts` into `apps/api/src/mutator-auth.ts` as `authorizeMutation`, which `/api/zero/mutate` now calls. Claimed session checks for the game-secret and score endpoints moved into `verifyClaimedSessionId` in `session-identity.ts`. `mutator-auth.test.ts` and `session-identity.test.ts` cover spoofed ids, missing proofs, anon callers, dev-only mutators in prod, and the canonical id rewrite.
2. **Shared mutators.** One Zero mock in `src/__tests__/zero-mock.ts`, loaded as a vitest setup file. Mutator tests import the mutators normally.
3. **Deleted** the copy-based API tests, the Drizzle round-trip tests, and `toast.test.ts`.
4. **Moved** the Pips and Shikaku engine tests into `packages/shared`.
5. **Trimmed** filler inside files that are otherwise worth keeping.

## End-to-end tests (done)

Playwright, in `e2e/`, against the local stack. Real browsers, real zero-cache, real API, real Postgres. If the stack is not up, Playwright starts it with `node scripts/local.mjs up --only api,web`.

| Spec | What it proves |
| --- | --- |
| `boot.spec.ts` | A returning visitor keeps their session id and name. Two visitors get different sessions. A first visit logs no React render warnings. |
| `imposter.spec.ts` | Three players play a full round: one imposter, the others decrypt the same word, the API refuses the imposter the key (checked on the real `/api/game-secret/key` responses), clues, votes, results. A kicked player can't get back in by code or by link. |
| `password.spec.ts` | Four players on two teams. Only cluers see a word, guessers never get the key or the word on the wire, a clue reaches only the cluer's teammate, and a first-try guess wins at a target of 3. |
| `chain.spec.ts` | A duel. One player solves their chain (looked up from the premade bank by its visible ends), the other makes a wrong guess and gives up the rest, and both see the right winner. |
| `shade.spec.ts` | Only the leader sees the target. A spot-on guess pays 5 and a guess one cell away pays 3, on every player's screen. |
| `location.spec.ts` | The leader drops a pin. A guess on the same spot pays 0.0 km for +5,000 and a far guess pays less. |
| `solo.spec.ts` | Pips and Shikaku start ranked and endless runs with the API and sync server blocked. |

Every player waits for a verified session and a live sync socket before acting (`newPlayer` in `e2e/helpers.ts`), the same as a person looking at a settled page.

First time only, download the browser:

```bash
npx playwright install chromium
```

Then:

```bash
bun run test:e2e
```

Set `PW_CHANNEL=chrome` or `PW_CHANNEL=msedge` to use an installed browser instead.

## CI

The `E2E` job in `.github/workflows/ci.yml` runs next to the quality gate. It installs Chromium (cached by `bun.lock`), then runs `bun run test:e2e`, which brings the stack up with `.env` copied from `.env.example`. On failure it uploads the HTML report and traces as the `playwright-report` artifact. A full cold run takes about 6 minutes.

## Known bugs, pinned by tests

One test is marked `test.fail()`. It fails today because of a real bug. When the bug is fixed, Playwright reports an unexpected pass, which fails the run until you delete the `test.fail()` line. After that it's a normal guard.

| Test | Bug |
| --- | --- |
| Boot: name saved while sync is down survives a reload | The name waits in Zero's queue while zero-cache is unreachable. On reload, `/api/session/sync` still has the old name, answers `resetRequired`, and the client reverts to it. |

Every game's secret is encrypted inside the server mutator with `ctx.resolveGameSecretKey` before the row is written (`sealSecret` in `packages/shared/src/zero/mutators/helpers.ts`). One sync-socket test per game checks nothing plain reaches the player who shouldn't have it. Chain Reaction goes further: an unsolved word syncs as a mask, and no client is ever handed its key, so guesses are checked on the server.

## Later

- **SQL copied into tests.** `local/leaderboard-window.test.ts` and `local/session-archive.test.ts` still run a pasted copy of their query. Export `selectScoreWindow` and the archive upsert from the API and point the tests at the real ones.
- **Admin.** Nothing covers the admin app end to end yet.

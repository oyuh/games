# Games

[![CI](https://github.com/oyuh/games/actions/workflows/ci.yml/badge.svg)](https://github.com/oyuh/games/actions/workflows/ci.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript&logoColor=white)
[![License](https://img.shields.io/badge/license-source--available-blue)](LICENSE)

Games is a TypeScript monorepo for browser party games and logic puzzles. Players use a React + Vite app. Behind it sits a Bun/Hono API, a Next.js admin dashboard for moderation, a shared package with the Drizzle/Zero contracts, and a local Postgres + Zero stack so you can run all of it on your machine.

This is a full rewrite of [oyuh/games-arch](https://github.com/oyuh/games-arch).

Live links:

- Web app: [games.lawsonhart.me](https://games.lawsonhart.me)
- Shikaku puzzle SVG endpoint: [api.games.lawsonhart.me/api/shikaku/puzzle](https://api.games.lawsonhart.me/api/shikaku/puzzle)

## Contents

- [Games](#games-1)
- [Repository layout](#repository-layout)
- [Architecture](#architecture)
- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [Commands](#commands)
- [CI and deployment gates](#ci-and-deployment-gates)
- [Pull requests](#pull-requests)
- [Data model](#data-model)
- [API](#api)
- [Deployment](#deployment)
- [Operations](#operations)

Community files: [Code of Conduct](CODE_OF_CONDUCT.md), [Contributing](CONTRIBUTING.md), [License](LICENSE), [Security](SECURITY.md).

## Games

| Game | Mode | Players | Route | Doc |
|------|------|---------|-------|-----|
| Imposter | Social deduction | 3-12 | `/imposter/:id` | [game-imposter.md](docs/game-imposter.md) |
| Password | Team word guessing | 4+ | `/password/:id/begin`, `/password/:id`, `/password/:id/results` | [game-password.md](docs/game-password.md) |
| Chain Reaction | Word-chain duel | 2 | `/chain/:id` | [game-chain-reaction.md](docs/game-chain-reaction.md) |
| Shade Signal | Color clue guessing | 3-8 | `/shade/:id` | [game-shade-signal.md](docs/game-shade-signal.md) |
| Location Signal | Map clue guessing | 2+ | `/location/:id` | [game-location-signal.md](docs/game-location-signal.md) |
| Shikaku | Timed rectangle logic puzzle | Solo | `/shikaku` | [game-shikaku.md](docs/game-shikaku.md) |
| Pips | Timed domino logic run | Solo | `/pips` | [game-pips.md](docs/game-pips.md) |
| Zip | Timed path-drawing logic puzzle | Solo | `/zip` | [game-zip.md](docs/game-zip.md) |

Each game doc covers rules, flow, scoring, and implementation notes.

The five multiplayer games share the same plumbing: room creation, join codes, a public lobby browser, spectators, host controls, chat, presence, admin kicks, and state synced through Rocicorp Zero.

Shikaku, Pips, and Zip skip the Zero cache. Their puzzle engines run in the browser, and they call REST endpoints only for eligibility checks, leaderboard reads, and score submission. A ranked submission carries replay data. The API runs the same shared engine, regenerates the puzzles from the seed, and checks the replay before it writes a leaderboard row. A ranked run gets its seed from the server in a signed ticket, so nobody can practice a ranked board first. The ticket also holds the run's time to the server's clock.

## Repository layout

```text
.
+-- apps/
|   +-- web/            # React 19 + Vite player app
|   +-- api/            # Bun/Hono API, Zero handlers, REST endpoints
|   +-- admin/          # Next.js 16 admin dashboard
+-- packages/
|   +-- shared/         # Drizzle/Zero contracts, metadata, solo puzzle engines
+-- docs/              # Game docs
+-- e2e/               # Browser tests (bun test + Playwright) against the local stack
+-- scripts/           # Local stack and production DB helper scripts
+-- docker-compose.yml # Postgres + Zero cache, for the manual start path
+-- Dockerfile         # API container image
+-- turbo.json         # Workspace task orchestration
+-- package.json       # Bun workspace scripts
```

## Architecture

### Player app: `apps/web`

A React 19 single-page app built by Vite. It handles:

- Routes for the home page, multiplayer rooms, Shikaku, Pips, Zip, a `/status` connection page, and `/dev/*` sandbox pages.
- A module-scoped Zero client for multiplayer sync.
- Browser-local identity, recent games, display name, and first-visit state.
- HTTP session sync against the API, with presence sent over the realtime WebSocket.
- WebSocket subscriptions for admin broadcasts, targeted user events, and live Password typing.
- Lazy-loaded game pages and vendor chunks to keep the first load small.
- Wake/idle messages for when the Zero cache is cold or paused.
- Separate mobile pages for the multiplayer games (see [Mobile UI](#mobile-ui)).

Key files: `apps/web/src/App.tsx`, `apps/web/src/pages/`, `apps/web/src/mobile/`, `apps/web/src/lib/zero.ts`, `apps/web/src/lib/session.ts`.

### Solo puzzle engines

The Shikaku, Pips, and Zip engines live in `packages/shared/src/games/`, so the browser and the API apply the same ranked rules. The web app imports them through thin wrappers in `apps/web/src/lib/*-engine.ts`. The API imports them directly for leaderboard validation.

- `shikaku-engine.ts` does seeded generation, rectangle validation, scoring, auto-filled `1x1` detection, and replay verification.
- `pips-engine.ts` does seeded generation, board and region validation, domino placement checks, solver utilities, run time scoring, and replay verification.
- `zip-engine.ts` does seeded generation, path validation, and ranked run verification.

Shikaku sends the solved rectangles for all five puzzles. Pips sends the domino placements for Easy, Medium, and Hard. Zip sends the drawn path and split time for each puzzle. Every ranked submission also carries its run ticket. The API regenerates the run from the seed, validates the replay, checks the score and time, then runs duplicate, top-20, rate-limit, and ban checks before writing to Postgres.

### API: `apps/api`

A Bun-powered Hono service. It handles:

- `POST /api/zero/query` and `POST /api/zero/mutate`.
- Signed session cookies and signed Zero session proofs.
- Session sync and WebSocket presence tracking.
- WebSocket upgrade auth and admin event triggers.
- Server-held keys for hidden game data.
- Shikaku, Pips, and Zip leaderboards, eligibility, and score validation.
- Bot scoring, with a Cloudflare Turnstile check for sessions that look scripted.
- Location Signal map tile config and a geocode proxy. The current map loads Google tiles straight from the browser and doesn't call either one.
- The admin API under `/api/admin/*`.
- Scheduled and manual cleanup of stale games and sessions, with a run history.
- `/health` and `/debug/build-info`.

Key files: `apps/api/src/index.ts`, `admin-routes.ts`, `broadcast-server.ts`, `mutator-auth.ts`, `session-identity.ts`, `db-provider.ts`.

### Admin app: `apps/admin`

A Next.js 16 app behind NextAuth, on port `3002` locally. It proxies admin requests to the API with `ADMIN_SECRET` as a bearer token.

| Route | Purpose |
|-------|---------|
| `/login` | GitHub or local dev login |
| `/` | Dashboard summary and broadcast controls |
| `/clients` | Connected sessions and client actions |
| `/games` | Active room inspection and moderation |
| `/bans` | Session/IP/region bans, restricted names, name overrides |
| `/shikaku` | Shikaku leaderboard management |
| `/pips` | Pips leaderboard management |
| `/zip` | Zip leaderboard management |
| `/cleanups` | Cleanup run history |

`/names` redirects to `/bans` and `/broadcast` redirects to `/`.

From the dashboard you can inspect live sessions and games, end one game or all of them, kick players, ban by session, IP, or region, send global or targeted toasts, force-refresh clients, publish a site-wide status, schedule update warnings, override names, maintain restricted name patterns, and edit or bulk-clear Shikaku, Pips, and Zip scores.

Key files: `apps/admin/src/auth.ts`, `apps/admin/src/lib/api.ts`, `apps/admin/src/app/(dashboard)/`, `apps/admin/src/components/admin/`.

### Shared package: `packages/shared`

The contract layer between the web app and the API: the Drizzle Postgres schema, the Zero schema, shared queries, Zero mutators, game types and metadata, and the Drizzle Kit config.

Mutators live in `packages/shared/src/zero/mutators/`, one file per game plus `sessions.ts`, `chat.ts`, `helpers.ts`, and `word-banks.ts`. `demo.ts` and `dev.ts` hold test and bot mutators, and the API rejects any `demo.*` or `dev.*` call in production.

### Mobile UI

The mobile pages live in `apps/web/src/mobile`. Desktop page components call `useIsMobile()` and switch at the `768px` breakpoint. Mobile pages get their own shell, bottom navigation, sheets, and `m-` prefixed CSS classes, so desktop and mobile changes don't collide.

Mobile pages exist for Home, Imposter, Password (begin, game, results), Chain Reaction, Shade Signal, and Location Signal. Shikaku, Pips, and Zip each have one responsive page instead of a separate mobile one.

## Local development

You need Bun 1.3.x or newer, Node 20 or newer (the stack script and the API dev runner use it), Git, and a container engine: Docker Desktop, OrbStack, Colima, Rancher Desktop, or Podman. If the engine is installed but not running, `bun run local:up` starts it for you.

```bash
bun install
bun run local:up
```

Then open:

- Web app: `http://localhost:5173`
- API: `http://localhost:3001`
- Admin app: `http://localhost:3002`
- Zero cache: `http://localhost:4848`

`bun run local:up` runs `scripts/local.mjs`, the same script on macOS, Linux, and Windows. It:

1. Creates `.env` from `.env.example` if it's missing.
2. Checks that the installed `@rocicorp/zero` matches the zero-cache image, and runs `bun install` if it doesn't.
3. Starts the container engine if needed.
4. Starts Postgres and waits until it accepts queries.
5. Pushes the Drizzle schema.
6. Rebuilds the Zero replica and starts zero-cache.
7. Starts the `api`, `web`, and `admin` dev servers under a small supervisor, so you can inspect and restart each one on its own.

### Controlling the stack

The stack listens on a local control socket, so these work from any other terminal:

```bash
bun run local status              # every service, its status, pid, port and uptime
bun run local logs api            # last 200 lines from one service
bun run local logs web -f         # follow one service
bun run local restart admin       # restart one server
bun run local restart api web     # restart several
bun run local restart zero        # rebuild the Zero replica and restart zero-cache
bun run local stop api            # stop one service
bun run local start api           # start it again
bun run local doctor              # check the machine for anything that will break the stack
bun run local:down                # stop everything
```

Service names are `postgres`, `zero-cache`, `api`, `web`, and `admin`, plus the groups `apps`, `infra`, and `all`. Aliases like `db`, `zero`, `ui`, and `backend` work too.

`local:down` stops the dev servers, frees the dev ports, removes the containers, and drops the Zero replica. Postgres data stays unless you pass `--wipe-db`.

Flags:

```bash
bun run local up --host           # expose the web dev server on the local network
bun run local up --detach         # run in the background and return to the prompt
bun run local up --only api,web   # only run some dev servers
bun run local up --skip-dev       # containers and schema only
bun run local up --skip-db-push   # leave the schema alone
bun run local up --auto-restart   # bring a dev server back up if it crashes
bun run local down --wipe-db      # also delete the Postgres volume
```

`bun run local:up` and `bun run local up` are the same command. The `local:*` scripts are shorthand for the common ones.

### Manual start

To run each piece yourself:

```bash
bun install
docker compose up -d
bun run db:push
bun run dev
```

`docker compose` publishes the same ports as the script's containers, so pick one path.

## Environment variables

### Root `.env`

The API and the database tooling load the root `.env`. The local minimum:

```bash
NODE_ENV=development
DATABASE_URL=postgres://postgres:postgres@localhost:5432/games
ZERO_UPSTREAM_DB=postgres://postgres:postgres@localhost:5432/games
ZERO_CVR_DB=postgres://postgres:postgres@localhost:5432/games
ZERO_CHANGE_DB=postgres://postgres:postgres@localhost:5432/games
ZERO_ADMIN_PASSWORD=dev-password
CLEANUP_SECRET=cleanup-local
SESSION_COOKIE_SECRET=games-dev-session-secret
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Optional:

```bash
MAP_TILE_URL_TEMPLATE=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
MAP_TILE_ATTRIBUTION=(c) OpenStreetMap contributors
MAP_GEOCODE_URL=https://nominatim.openstreetmap.org/search
WEB_ORIGIN=https://games.lawsonhart.me   # used in social preview links
TURNSTILE_SECRET_KEY=                    # bot check; blank in dev uses Cloudflare's always-pass test key
```

### Web app

The web app falls back to local endpoints when these are unset:

```bash
VITE_ZERO_CACHE_URL=http://localhost:4848
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001/ws
VITE_STYLE_ONLY=false
VITE_TURNSTILE_SITE_KEY=   # bot check; dev falls back to Cloudflare's test key, production needs a real one
VITE_SENTRY_DSN=           # optional, turns on Sentry error reporting
```

The client derives `VITE_WS_URL` from `VITE_API_URL` plus `/ws`, so you only set it when the socket lives somewhere else.

### Admin app

```bash
GAMES_API_URL=http://localhost:3001
ADMIN_SECRET=<same_secret_used_by_api>
AUTH_SECRET=<long_random_secret>
# NEXTAUTH_SECRET also works if the deployment already relies on it.
GITHUB_CLIENT_ID=<github_oauth_client_id>
GITHUB_CLIENT_SECRET=<github_oauth_client_secret>
ADMIN_GITHUB_IDS=<comma_separated_allowed_github_logins>
ADMIN_DEV_SECRET=<local_admin_password>   # optional, enables a local credentials login
```

The API needs the same `ADMIN_SECRET`.

### Zero cache

```bash
NODE_ENV=production
ZERO_UPSTREAM_DB=<postgres_url>
ZERO_QUERY_URL=https://<api-domain>/api/zero/query
ZERO_MUTATE_URL=https://<api-domain>/api/zero/mutate
ZERO_ADMIN_PASSWORD=<strong_secret>
ZERO_CVR_DB=<postgres_url>      # optional
ZERO_CHANGE_DB=<postgres_url>   # optional
```

Keep the deployed Zero cache on the same version as `@rocicorp/zero` in the workspace. A mismatch passes health checks and breaks browser sync, which is a miserable thing to debug.

## Commands

Run these from the repo root.

| Command | Purpose |
|---------|---------|
| `bun run dev` | Start all workspace dev servers through Turbo |
| `bun run local:up` | Start local DB/Zero, push schema, run the dev servers |
| `bun run local:down` | Stop the dev servers and the containers |
| `bun run local:reset` | Tear the stack down and bring it back up |
| `bun run local:status` | Show every service, its status, pid, port and uptime |
| `bun run local:doctor` | Check the machine for anything that will break the stack |
| `bun run build` | Build all workspaces |
| `bun run typecheck` | Typecheck all workspaces |
| `bun test` | Run every unit test in one process |
| `bun run test` | Run each package's unit tests through Turbo |
| `bun run test:ci` | Run the unit tests the way CI does |
| `bun run test:e2e` | Run the browser tests against the local stack, starting it if it is down |
| `bun run lint` | Placeholder, no linter is configured yet |
| `bun run db:push` | Push the Drizzle schema to the configured database |
| `bun run db:studio` | Open Drizzle Studio |
| `bun run db:push:prod` | Push the schema to `PROD_DB_URL` after a confirmation |

Per-package:

```bash
bun --filter @games/web build
bun --filter @games/web test
bun --filter @games/api test
bun --filter @games/admin typecheck
bun --filter @games/shared db:push
```

React Doctor commands are in [docs/react-doctor-guide.md](docs/react-doctor-guide.md).

## CI and deployment gates

The `CI` workflow runs on pull requests, pushes to `main` or `master`, and merge queue checks. It has two jobs. `Quality Gate` runs:

```bash
bun run lint
bun run typecheck
bun run test:ci
bun run build
```

`E2E` runs `bun run test:e2e` against a fresh local stack, then the database tests. It uploads a Playwright trace for every failed attempt. Open one with `bunx playwright show-trace <zip>`.

The `Deploy Hooks` workflow fires after a successful `CI` run on `main` or `master` and calls the Railway deploy hook. To use it, add this repository secret:

```bash
RAILWAY_DEPLOY_HOOK_URL=<railway_deploy_trigger_url>
```

To keep failing commits out of production, protect the production branch and require `Quality Gate` before merging. Then set up the hosts:

- Railway: turn on Wait for CI for each GitHub-connected service, or turn off automatic deploys and trigger Railway from the post-CI workflow.
- Cloudflare Pages: builds the web app on every push and doesn't wait for CI. See [Cloudflare Pages web app](#cloudflare-pages-web-app).

Don't rename the CI job. GitHub and Railway match on the check name, and a rename un-gates every merge and deploy without any warning.

## Pull requests

Use [#90](https://github.com/oyuh/games/pull/90), the PR that added Zip, as the model for yours. Keep it open next to this section while you write.

### The process

1. Branch off `master` with a short name that says what the branch does, like `feat/zip` or `fix/lobby-timer`.
2. Commit in pieces, one per area. #90 is five commits: engine, API, admin, web, and docs. Each one builds on its own, so a reviewer can read them in order.
3. Write commit subjects as `type(scope): what changed`. The types are `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, and `revert`.
4. Add a `psa:` line when a commit has a deploy gotcha, and a `tests:` line with the pass count when tests changed. Most commits need neither.
5. Run the four `Quality Gate` commands above. If you touched gameplay, run `bun run test:e2e` too.
6. Open the PR against `master` and fill in [the template](.github/PULL_REQUEST_TEMPLATE.md).
7. Keep unrelated fixes out of the PR. Send them as their own PR.

### What the description covers

- **What it does**: two or three sentences a reviewer reads before the diff.
- **What changed**: one entry per commit or area, with the files and the behavior that moved.
- **How you tested it**: each command you ran with its pass count, plus what you clicked through in the browser.
- **Deploy notes**: schema pushes, new environment variables, and anything that adds server load.
- **Checklists**: tick the template boxes that apply. For a box that doesn't apply, say why.
- **Screenshots**: required for UI changes. A new game can point reviewers at its `/dev/<game>` kit page instead.

## Data model

The schema lives in `packages/shared/src/drizzle/schema.ts`.

| Table | Purpose |
|-------|---------|
| `sessions` | Browser-backed player identity, current game, IP/region/fingerprint, last seen |
| `session_archive` | Slim copy of sessions that cleanup deleted, so admins can still find and ban an old id |
| `status` | Footer/database health sentinel |
| `imposter_games` | Imposter room state, players, clues, votes, history, settings |
| `password_games` | Password teams, rounds, scores, settings |
| `chain_reaction_games` | Word-chain state, chains, turn, scores, round history |
| `shade_signal_games` | Color-grid target, leader rotation, clues, guesses, scores |
| `location_signal_games` | Map target, leader rotation, clues, guesses, distance scoring |
| `chat_messages` | Per-game chat history |
| `game_encryption_keys` | Server-held keys for hidden game secrets |
| `shikaku_scores` | Shikaku leaderboard entries and replay metadata |
| `shikaku_banned_sessions` | Shikaku abuse bans |
| `pips_scores` | Pips leaderboard entries with easy/medium/hard splits |
| `pips_banned_sessions` | Pips abuse bans |
| `zip_scores` | Zip leaderboard entries by difficulty, with replay data |
| `zip_banned_sessions` | Zip abuse bans |
| `admin_bans` | Session, IP, and region bans |
| `admin_restricted_names` | Restricted display-name patterns |
| `admin_name_overrides` | Forced display names by session |
| `cleanup_runs` | Recent cleanup runs with aggregate counts |
| `cleanup_run_days` | Cleanup runs older than a week, folded into one row per UTC day |

The multiplayer tables keep most live state in JSON columns on purpose. Room snapshots stay simple, and the game transitions sit next to the mutator logic instead of spreading across a dozen relational tables.

## API

### Public and runtime

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Railway/API healthcheck |
| `GET /debug/build-info` | API build, uptime, platform, and database sentinel status |
| `POST /api/session/sync` | Resolve or create the signed browser session |
| `GET /ws` | Upgrade to the authenticated WebSocket (also carries presence) |
| `GET /api/admin-status` | Current site-wide admin status |
| `GET /api/public/names/restricted` | Public restricted-name pattern list |
| `GET /api/embed/html` | Social/bot preview HTML |
| `GET /api/shikaku/puzzle` | Shikaku puzzle viewer page |
| `GET /api/shikaku/puzzle.svg` | Random Shikaku puzzle SVG |
| `GET /api/maps/config` | Location Signal map tile config |
| `GET /api/maps/geocode` | Location Signal geocoding proxy |
| `POST /api/game-secret/key` | Game secret key for authorized reveal paths |
| `POST /api/game-secret/imposter-chat-key` | Key for the Imposter back-channel chat |
| `GET /api/challenge/status` | Bot check status for the current session |
| `POST /api/challenge/verify` | Verify a Turnstile token |
| `GET/POST /api/cleanup` | Run cleanup, needs `CLEANUP_SECRET` as a bearer token |
| `POST /api/zero/query` | Resolve Zero query requests |
| `POST /api/zero/mutate` | Resolve Zero mutation requests |

### Solo scores

| Endpoint | Purpose |
|----------|---------|
| `GET /api/shikaku/leaderboard` | Read the Shikaku leaderboard |
| `POST /api/shikaku/run` | Start a ranked run and get its signed seed ticket |
| `POST /api/shikaku/score/eligibility` | Check eligibility and replay validity |
| `POST /api/shikaku/score` | Submit a score with the solved-rectangle replay |
| `GET /api/pips/leaderboard` | Read the Pips leaderboard |
| `POST /api/pips/run` | Start a ranked run and get its signed seed ticket |
| `POST /api/pips/score/eligibility` | Check eligibility and replay validity |
| `POST /api/pips/score` | Submit a run with the solved-domino replay |
| `GET /api/zip/leaderboard` | Read the Zip leaderboard |
| `POST /api/zip/run` | Start a ranked run and get its signed seed ticket |
| `POST /api/zip/score/eligibility` | Check eligibility and replay validity |
| `POST /api/zip/score` | Submit a run with the drawn-path replay and its ticket |

### Admin

Admin routes sit under `/api/admin/*` and need `Authorization: Bearer <ADMIN_SECRET>`. The groups are `/dashboard/summary`, `/clients`, `/games`, `/bans`, `/broadcast/*`, `/status`, `/names/*`, `/shikaku/scores`, `/pips/scores`, `/zip/scores`, and `/cleanups`.

## Deployment

Production runs on separate services:

- Cloudflare Pages: `apps/web`
- Railway: `apps/api`, which also serves the WebSockets
- Railway: `apps/admin`
- Railway: Zero cache
- Railway Postgres or Neon: database

### Cloudflare Pages web app

Pages builds from the repo root on every push to `master`. It installs with `bun install`, builds with `bun run --filter @games/web build`, and serves `apps/web/dist`. `apps/web/public/_redirects` sends every path to `/index.html`, and `apps/web/functions/_middleware.js` hands bot and social-preview user agents the API's embed HTML.

Pages doesn't wait for CI, but the API does, so a new client can go live minutes before the API it talks to. Keep API changes working with the previous client, or land the API change first.

Pages build variables. They're read at build time, so changing one needs a rebuild:

```bash
VITE_ZERO_CACHE_URL=https://<zero-domain>
VITE_API_URL=https://<api-domain>
VITE_WS_URL=wss://<api-domain>/ws
VITE_TURNSTILE_SITE_KEY=<turnstile_site_key>
```

### Railway API

Railway builds the API from the `Dockerfile`, which runs `bun apps/api/src/index.ts`.

API variables:

```bash
NODE_ENV=production
DATABASE_URL=<postgres_url>
CLEANUP_SECRET=<strong_secret>
SESSION_COOKIE_SECRET=<long_random_secret>
ADMIN_SECRET=<strong_admin_secret>
CORS_ALLOWED_ORIGINS=https://<web-domain>
TURNSTILE_SECRET_KEY=<turnstile_secret>   # without it, bot scores are tracked but never enforced
```

If Railway autodeploys from GitHub, turn on Wait for CI in the service settings. After a deploy, check `https://<api-domain>/health` and `https://<api-domain>/debug/build-info`.

### Railway Zero cache

Deploy the Zero cache as its own service from the Docker Hub image `rocicorp/zero:1.9.0`, which matches the workspace's `@rocicorp/zero`. Leave the start command empty, since the image's entrypoint starts zero-cache. A `bunx` or `npx` start command fails because the image only ships Node.

To upgrade, change the image tag in the service's source settings to the new workspace version and redeploy. It uses the variables from [Zero cache](#zero-cache).

Don't set `ZERO_PORT` to the literal `"$PORT"`. Railway doesn't shell-expand that field, so Zero tries to listen on a port named `$PORT`.

### Database

Zero needs a direct Postgres connection with logical replication. Locally, `docker-compose.yml` runs Postgres 16 with `wal_level=logical`. In production, point `ZERO_UPSTREAM_DB` at a direct Postgres URL. Logical replication doesn't work through a transaction pooler.

## Operations

### Session identity

Players get a browser-local identity, not an account. The API signs a long-lived `games_session` cookie and issues a signed Zero session proof. The server checks every mutation, so one browser session can't act as another player.

### Presence

The open `/ws` connection is the online signal. The client reports its current route when it changes, the API keeps an in-memory registry per session, and a server-side flush bumps `last_seen` every 60 seconds for connected sessions. No HTTP polling.

### Admin broadcasts

The API's WebSocket service has three topic types:

- `broadcast` for global messages.
- `user:{sessionId}` for targeted kicks, name changes, and direct toasts.
- `password-team:{gameId}:{teamIndex}` for team-only Password live typing.

### Cleanup

The API runs cleanup on a schedule, and you can trigger it with `GET` or `POST /api/cleanup` and `CLEANUP_SECRET` as a bearer token. It ends abandoned games, detaches stale sessions, removes old ended rows, and records each run in `cleanup_runs`. The admin `/cleanups` page shows that history.

### Footer database status

`/debug/build-info` reads the `status` table. If the query answers, the database is up. The sentinel row is optional: when it exists and its value isn't `DB_STATUS_EXPECTED_VALUE`, the footer shows the database as degraded, which you can use as a manual warning. The defaults are `DB_STATUS_KEY=footer` and `DB_STATUS_EXPECTED_VALUE=ok`. Reset the row with:

```sql
INSERT INTO status (key, value, updated_at)
VALUES ('footer', 'ok', EXTRACT(EPOCH FROM NOW())::bigint * 1000)
ON CONFLICT (key)
DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = EXCLUDED.updated_at;
```

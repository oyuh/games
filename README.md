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
- [Data model](#data-model)
- [API](#api)
- [Deployment](#deployment)
- [Operations](#operations)
- [Known constraints](#known-constraints)

Community files: [Code of Conduct](CODE_OF_CONDUCT.md), [Contributing](CONTRIBUTING.md), [License](LICENSE), [Security](SECURITY.md).

## Games

| Game | Mode | Players | Route | Doc |
|------|------|---------|-------|-----|
| Imposter | Social deduction | 3-12 | `/imposter/:id` | [game-imposter.md](docs/game-imposter.md) |
| Password | Team word guessing | 4+ | `/password/:id/begin`, `/password/:id`, `/password/:id/results` | [game-password.md](docs/game-password.md) |
| Chain Reaction | Word-chain duel | 2 | `/chain/:id` | [game-chain-reaction.md](docs/game-chain-reaction.md) |
| Shade Signal | Color clue guessing | 3-8 | `/shade/:id` | [game-shade-signal.md](docs/game-shade-signal.md) |
| Location Signal | Map clue guessing | 3-8 | `/location/:id` | [game-location-signal.md](docs/game-location-signal.md) |
| Shikaku | Timed rectangle logic puzzle | Solo | `/shikaku` | [game-shikaku.md](docs/game-shikaku.md) |
| Pips | Timed domino logic run | Solo | `/pips` | [game-pips.md](docs/game-pips.md) |

Each game doc covers rules, flow, scoring, and implementation notes.

The five multiplayer games share the same plumbing: room creation, join codes, a public lobby browser, spectators, host controls, chat, presence, admin kicks, and state synced through Rocicorp Zero.

Shikaku and Pips skip the Zero cache. Their puzzle engines run in the browser, and they call REST endpoints only for eligibility checks, leaderboard reads, and score submission. A ranked submission carries replay data. The API runs the same shared engine, regenerates the puzzle from the public seed, and checks the replay before it writes a leaderboard row.

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
+-- e2e/               # Playwright suite that runs against the local stack
+-- scripts/           # Local stack and production DB helper scripts
+-- docker-compose.yml # Postgres + Zero cache, for the manual start path
+-- Dockerfile         # API container image
+-- railway.toml       # API Railway deployment config
+-- vercel.json        # Web Vercel config with SPA + bot preview rewrites
+-- turbo.json         # Workspace task orchestration
+-- package.json       # Bun workspace scripts
```

## Architecture

### Player app: `apps/web`

A React 19 single-page app built by Vite. It handles:

- Routes for the home page, multiplayer rooms, Shikaku, Pips, a `/status` connection page, and `/dev/*` sandbox pages.
- A module-scoped Zero client for multiplayer sync.
- Browser-local identity, recent games, display name, and first-visit state.
- HTTP session sync against the API, with presence sent over the realtime WebSocket.
- WebSocket subscriptions for admin broadcasts, targeted user events, and live Password typing.
- Lazy-loaded game pages and vendor chunks to keep the first load small.
- Wake/idle messages for when the Zero cache is cold or paused.
- Separate mobile pages for the multiplayer games (see [Mobile UI](#mobile-ui)).

Key files: `apps/web/src/App.tsx`, `apps/web/src/pages/`, `apps/web/src/mobile/`, `apps/web/src/lib/zero.ts`, `apps/web/src/lib/session.ts`.

### Solo puzzle engines

Shikaku and Pips engines live in `packages/shared/src/games/`, so the browser and the API apply the same ranked rules. The web app imports them through thin wrappers in `apps/web/src/lib/*-engine.ts`. The API imports them directly for leaderboard validation.

- `shikaku-engine.ts` does seeded generation, rectangle validation, scoring, auto-filled `1x1` detection, and replay verification.
- `pips-engine.ts` does seeded generation, board and region validation, domino placement checks, solver utilities, run time scoring, and replay verification.

Shikaku sends the solved rectangles for all five puzzles. Pips sends the domino placements for Easy, Medium, and Hard. The API regenerates the run from the seed, validates the replay, checks the score and time, then runs duplicate, top-20, rate-limit, and ban checks before writing to Postgres.

### API: `apps/api`

A Bun-powered Hono service. It handles:

- `POST /api/zero/query` and `POST /api/zero/mutate`.
- Signed session cookies and signed Zero session proofs.
- Session sync and WebSocket presence tracking.
- WebSocket upgrade auth and admin event triggers.
- Server-held keys for hidden game data.
- Shikaku and Pips leaderboards, eligibility, and score validation.
- Location Signal map tile config and a geocode proxy.
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
| `/cleanups` | Cleanup run history |

`/names` redirects to `/bans` and `/broadcast` redirects to `/`.

From the dashboard you can inspect live sessions and games, end one game or all of them, kick players, ban by session, IP, or region, send global or targeted toasts, force-refresh clients, publish a site-wide status, schedule update warnings, override names, maintain restricted name patterns, and edit or bulk-clear Shikaku and Pips scores.

Key files: `apps/admin/src/auth.ts`, `apps/admin/src/lib/api.ts`, `apps/admin/src/app/(dashboard)/`, `apps/admin/src/components/admin/`.

### Shared package: `packages/shared`

The contract layer between the web app and the API: the Drizzle Postgres schema, the Zero schema, shared queries, Zero mutators, game types and metadata, and the Drizzle Kit config.

Mutators live in `packages/shared/src/zero/mutators/`, one file per game plus `sessions.ts`, `chat.ts`, `helpers.ts`, and `word-banks.ts`. `demo.ts` and `dev.ts` hold test and bot mutators, and the API rejects any `demo.*` or `dev.*` call in production.

### Mobile UI

The mobile pages live in `apps/web/src/mobile`. Desktop page components call `useIsMobile()` and switch at the `768px` breakpoint. Mobile pages get their own shell, bottom navigation, sheets, and `m-` prefixed CSS classes, so desktop and mobile changes don't collide.

Mobile pages exist for Home, Imposter, Password (begin, game, results), Chain Reaction, Shade Signal, and Location Signal. Shikaku is desktop-only on purpose. Pips has one responsive page instead of a separate mobile one.

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
```

### Web app

The web app falls back to local endpoints when these are unset:

```bash
VITE_ZERO_CACHE_URL=http://localhost:4848
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001/ws
VITE_STYLE_ONLY=false
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
| `bun run test` | Run the Vitest suites |
| `bun run test:ci` | Run the Vitest suites the way CI does |
| `bun run test:e2e` | Run the Playwright suite against the local stack |
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

`E2E` runs `bun run test:e2e` against a fresh local stack and uploads the Playwright report when it fails.

The `Deploy Hooks` workflow fires after a successful `CI` run on `main` or `master` and calls the deploy hooks. To use it, add these repository secrets:

```bash
VERCEL_DEPLOY_HOOK_URL=<vercel_deploy_hook_url>
RAILWAY_DEPLOY_HOOK_URL=<optional_custom_or_platform_deploy_trigger_url>
```

To keep failing commits out of production, protect the production branch and require `Quality Gate` before merging. Then set up the hosts:

- Vercel: turn on Deployment Checks with the `Quality Gate` check, or leave Git production deploys off and use the post-CI hook.
- Railway: turn on Wait for CI for each GitHub-connected service, or turn off automatic deploys and trigger Railway from the post-CI workflow.

Don't rename the CI job. GitHub, Vercel, and Railway match on the check name, and a rename un-gates every merge and deploy without any warning.

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
| `GET/POST /api/cleanup` | Run cleanup, needs `CLEANUP_SECRET` as a bearer token |
| `POST /api/zero/query` | Resolve Zero query requests |
| `POST /api/zero/mutate` | Resolve Zero mutation requests |

### Solo scores

| Endpoint | Purpose |
|----------|---------|
| `GET /api/shikaku/leaderboard` | Read the Shikaku leaderboard |
| `POST /api/shikaku/score/eligibility` | Check eligibility and replay validity |
| `POST /api/shikaku/score` | Submit a score with the solved-rectangle replay |
| `GET /api/pips/leaderboard` | Read the Pips leaderboard |
| `POST /api/pips/score/eligibility` | Check eligibility and replay validity |
| `POST /api/pips/score` | Submit a run with the solved-domino replay |

### Admin

Admin routes sit under `/api/admin/*` and need `Authorization: Bearer <ADMIN_SECRET>`. The groups are `/dashboard/summary`, `/clients`, `/games`, `/bans`, `/broadcast/*`, `/status`, `/names/*`, `/shikaku/scores`, `/pips/scores`, and `/cleanups`.

## Deployment

Production runs on separate services:

- Vercel: `apps/web`
- Railway: `apps/api`, which also serves the WebSockets
- Railway: Zero cache
- Railway Postgres or Neon: database

### Vercel web app

`vercel.json` installs with `bun install --frozen-lockfile`, builds with `bun run --filter @games/web build`, and serves `apps/web/dist`. It rewrites bot and social-preview user agents to the API embed endpoint and everything else to `/index.html`.

It also turns off Git deploys from `main` and `master`, so production goes out through the post-CI deploy hook. Store the Vercel hook as `VERCEL_DEPLOY_HOOK_URL`. If you'd rather use Vercel's Deployment Checks, remove the `git.deploymentEnabled` block and make `Quality Gate` the required check.

Vercel variables:

```bash
VITE_ZERO_CACHE_URL=https://<zero-domain>
VITE_API_URL=https://<api-domain>
VITE_WS_URL=wss://<api-domain>/ws
```

### Railway API

`railway.toml` builds from the `Dockerfile` and runs `bun apps/api/src/index.ts`.

API variables:

```bash
NODE_ENV=production
DATABASE_URL=<postgres_url>
CLEANUP_SECRET=<strong_secret>
SESSION_COOKIE_SECRET=<long_random_secret>
ADMIN_SECRET=<strong_admin_secret>
CORS_ALLOWED_ORIGINS=https://<web-domain>
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

`/debug/build-info` reads the `status` table and reports whether the sentinel row exists and matches. The defaults are `DB_STATUS_KEY=footer` and `DB_STATUS_EXPECTED_VALUE=ok`. Seed or repair the row with:

```sql
INSERT INTO status (key, value, updated_at)
VALUES ('footer', 'ok', EXTRACT(EPOCH FROM NOW())::bigint * 1000)
ON CONFLICT (key)
DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = EXCLUDED.updated_at;
```

### Smoke test after a deploy

1. Open the web app.
2. Create one room for each multiplayer game.
3. Join a room from a second tab or device.
4. Check chat, presence, phase changes, and host controls.
5. Play one Shikaku run and one Pips run, and confirm both land on the leaderboard.
6. Open the admin dashboard and check clients, games, broadcasts, bans, scores, and cleanups.
7. Hit `/health`, `/debug/build-info`, and the Zero cache public URL.

## Known constraints

- No player accounts. Identity is browser-local.
- No linter yet. The lint scripts are placeholders.
- Multiplayer state is mostly JSON-column snapshots, by design.
- The API runs TypeScript through Bun in production, with no compiled `dist` entry.
- The Zero cache image and the workspace `@rocicorp/zero` version have to match.
- Shikaku and Pips aren't Zero-synced. They use REST for the leaderboard only.

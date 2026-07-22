# Games

[![CI](https://github.com/oyuh/games/actions/workflows/ci.yml/badge.svg)](https://github.com/oyuh/games/actions/workflows/ci.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)
[![License](https://img.shields.io/badge/license-source--available-blue)](LICENSE)

Games is a TypeScript monorepo for browser party games and logic puzzles. There's a React + Vite app players actually use, a Bun/Hono API behind it, a Next.js admin dashboard for moderation, a shared package holding the Drizzle/Zero contracts, and a local Postgres + Zero stack so you can run the whole thing on your machine.

This project is a full refactor of an earlier version: [oyuh/games-arch](https://github.com/oyuh/games-arch).

Live links:

- Web app: [games.lawsonhart.me](https://games.lawsonhart.me)
- Shikaku puzzle SVG endpoint: [api.games.lawsonhart.me/api/shikaku/puzzle](https://api.games.lawsonhart.me/api/shikaku/puzzle)

## Contents

- [Games](#games)
  - [Contents](#contents)
  - [Games Included](#games-included)
  - [Game Docs](#game-docs)
  - [Repository Layout](#repository-layout)
  - [Architecture](#architecture)
    - [Player App: `apps/web`](#player-app-appsweb)
    - [Shared Solo Puzzle Engines](#shared-solo-puzzle-engines)
    - [API App: `apps/api`](#api-app-appsapi)
    - [Admin App: `apps/admin`](#admin-app-appsadmin)
    - [Shared Package: `packages/shared`](#shared-package-packagesshared)
  - [Local Development](#local-development)
    - [Prerequisites](#prerequisites)
    - [Quick Start](#quick-start)
    - [Manual Local Start](#manual-local-start)
    - [Stop Local Services](#stop-local-services)
    - [Platform-Specific Helpers](#platform-specific-helpers)
  - [Environment Variables](#environment-variables)
    - [Root `.env`](#root-env)
    - [Web App Variables](#web-app-variables)
    - [Admin App Variables](#admin-app-variables)
    - [Zero Service Variables](#zero-service-variables)
  - [Common Commands](#common-commands)
  - [CI and Deployment Gates](#ci-and-deployment-gates)
  - [Data Model](#data-model)
  - [API Surface](#api-surface)
    - [Public and Runtime Endpoints](#public-and-runtime-endpoints)
    - [Zero Endpoints](#zero-endpoints)
    - [Solo Game Score Endpoints](#solo-game-score-endpoints)
    - [Admin API](#admin-api)
  - [Admin Dashboard](#admin-dashboard)
  - [Mobile UI](#mobile-ui)
  - [Deployment](#deployment)
    - [Vercel Web App](#vercel-web-app)
    - [Railway API](#railway-api)
    - [Railway Zero Cache](#railway-zero-cache)
    - [Database Requirements](#database-requirements)
  - [Operational Notes](#operational-notes)
    - [Session Identity](#session-identity)
    - [Presence](#presence)
    - [Admin Broadcasts](#admin-broadcasts)
    - [Cleanup](#cleanup)
    - [Footer Database Status](#footer-database-status)
    - [Smoke Test Checklist](#smoke-test-checklist)
  - [Known Constraints](#known-constraints)

Community files:

- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Contributing](CONTRIBUTING.md)
- [License](LICENSE)
- [Security](SECURITY.md)

## Games Included

Seven games are playable right now.

| Game | Mode | Players | Route | State model |
|------|------|---------|-------|-------------|
| Imposter | Social deduction | 3-12 | `/imposter/:id` | Multiplayer, Zero-synced |
| Password | Team word guessing | 4+ | `/password/:id/begin`, `/password/:id`, `/password/:id/results` | Multiplayer, Zero-synced |
| Chain Reaction | Competitive word-chain duel | 2 | `/chain/:id` | Multiplayer, Zero-synced |
| Shade Signal | Color clue guessing | 3-8 | `/shade/:id` | Multiplayer, Zero-synced |
| Location Signal | Map clue guessing | 3-8 | `/location/:id` | Multiplayer, Zero-synced |
| Shikaku | Timed rectangle logic puzzle | Solo | `/shikaku` | Shared seeded engine + REST leaderboard |
| Pips | Timed domino logic run | Solo | `/pips` | Shared seeded engine + REST leaderboard |

The multiplayer games all share the same plumbing: room creation, join codes, a public lobby browser, spectators, host controls, chat, session presence, admin kicks, and state that syncs through Rocicorp Zero.

The solo games don't need the Zero cache at all. Shikaku and Pips run their puzzle engines right in the browser and only hit REST endpoints for eligibility checks, leaderboard reads, and score submission. Ranked submissions come with replay data, and the API runs the same shared engines to regenerate the puzzle from the public seed and check that the submitted solve is real before it writes a leaderboard row.

## Game Docs

Each game has its own doc with rules, flow, scoring, and implementation notes.

| Game | What it covers | Doc |
|------|----------------|-----|
| Imposter | Clue phase, voting, categories, round history | [docs/game-imposter.md](docs/game-imposter.md) |
| Password | Teams, clue givers, guessers, target score | [docs/game-password.md](docs/game-password.md) |
| Chain Reaction | Word chains, turns, scoring, chain generation | [docs/game-chain-reaction.md](docs/game-chain-reaction.md) |
| Shade Signal | Color grid, leader rotation, clues, proximity scoring | [docs/game-shade-signal.md](docs/game-shade-signal.md) |
| Location Signal | Map picking, clues, distance scoring, leader rounds | [docs/game-location-signal.md](docs/game-location-signal.md) |
| Shikaku | Puzzle generation, run modes, scoring, leaderboard validation | [docs/game-shikaku.md](docs/game-shikaku.md) |
| Pips | Domino placement, seeded runs, split timing, leaderboard design | [docs/game-pips.md](docs/game-pips.md) |


## Repository Layout

```text
.
+-- apps/
|   +-- web/            # React 19 + Vite player app
|   +-- api/            # Bun/Hono API, Zero handlers, REST endpoints
|   +-- admin/          # Next.js 16 admin dashboard
+-- packages/
|   +-- shared/         # Drizzle/Zero contracts, metadata, shared solo puzzle engines
+-- docs/              # Game docs and maintenance notes
+-- scripts/           # Local stack and production DB helper scripts
+-- docker-compose.yml # Local Postgres + Zero cache stack for the Windows script path
+-- Dockerfile         # API container image
+-- railway.toml       # API Railway deployment config
+-- vercel.json        # Web Vercel deployment config with SPA + bot preview rewrites
+-- turbo.json         # Workspace task orchestration
+-- package.json       # Bun workspace scripts
```

## Architecture

### Player App: `apps/web`

The web app is a React 19 single-page app built by Vite. It owns everything players see.

What it handles:

- Browser routes for the home page, multiplayer rooms, Shikaku, Pips, and a score admin helper route.
- A module-scoped Zero client for realtime multiplayer sync.
- Local browser identity, recent games, display name, and first-visit state.
- HTTP session sync against the API, with presence flowing over the realtime WebSocket.
- Bun WebSocket subscriptions for global admin broadcasts, targeted user events, and live Password typing.
- Lazy-loaded game pages and vendor chunks to keep the initial load small.
- Wake/idle messaging for when the multiplayer Zero cache is cold or paused.
- Mobile-specific pages and bottom sheets for the multiplayer games.

Key files:

- `apps/web/src/App.tsx`
- `apps/web/src/pages/`
- `apps/web/src/mobile/`
- `apps/web/src/lib/zero.ts`
- `apps/web/src/lib/session.ts`
- `packages/shared/src/games/shikaku-engine.ts`
- `packages/shared/src/games/pips-engine.ts`

### Shared Solo Puzzle Engines

Shikaku and Pips use shared TypeScript engine modules so the browser and the API agree on the exact same ranked rules, even though the API isn't needed for local play. The web app imports the engines through thin wrappers in `apps/web/src/lib/*-engine.ts`; the API imports the shared modules directly for leaderboard validation.

- `packages/shared/src/games/shikaku-engine.ts` owns seeded Shikaku generation, rectangle validation, scoring, auto-filled `1x1` detection, and ranked replay verification.
- `packages/shared/src/games/pips-engine.ts` owns seeded Pips generation, board/region validation, domino placement validation, solver utilities, run time scoring, and ranked replay verification.
- Ranked score requests include replay payloads: Shikaku sends the solved rectangles for each of the five puzzles, and Pips sends the solved domino placements for Easy, Medium, and Hard.
- On the server, the API regenerates the canonical run from the submitted seed, validates the replay against those generated puzzles, recalculates or checks the score/time invariants, then applies duplicate, top-20, rate-limit, and ban checks before writing to Postgres.

### API App: `apps/api`

The API is a Bun-powered Hono service. It handles REST endpoints, Zero query/mutation forwarding, admin operations, signed session identity, score validation, and cleanup work.

What it handles:

- `POST /api/zero/query` and `POST /api/zero/mutate`
- Signed session cookies and signed Zero session proofs.
- Session sync, plus WebSocket-driven presence tracking.
- Bun WebSocket upgrade auth and admin event triggers.
- Server-held secret keys for hidden game data.
- Shikaku and Pips leaderboards, eligibility, and score validation.
- Location Signal map tile config and a geocode proxy.
- The admin dashboard API under `/api/admin/*`.
- Scheduled and manual cleanup of stale games and sessions.
- `/health` and `/debug/build-info` diagnostics.

Key files:

- `apps/api/src/index.ts`
- `apps/api/src/admin-routes.ts`
- `apps/api/src/broadcast-server.ts`
- `apps/api/src/session-identity.ts`
- `apps/api/src/db-provider.ts`

### Admin App: `apps/admin`

The admin dashboard is a Next.js 16 app behind NextAuth. It proxies admin requests to the API using `ADMIN_SECRET`.

What it handles:

- Dashboard summary and recent activity.
- Browsing connected clients and sessions.
- Inspecting, ending, and kicking players from active games.
- Session, IP, and region bans.
- Restricted name patterns and forced name overrides.
- Global broadcasts, refresh commands, update warnings, and custom status banners.
- Shikaku score management.
- Pips score management.

Key files:

- `apps/admin/src/auth.ts`
- `apps/admin/src/lib/api.ts`
- `apps/admin/src/app/(dashboard)/`
- `apps/admin/src/components/admin/`

### Shared Package: `packages/shared`

The shared package is the contract layer between the web app and the API.

It contains:

- The Drizzle Postgres schema.
- The Zero schema.
- Shared query definitions.
- Zero mutators, split by game domain.
- Shared game types and game metadata.
- The Drizzle Kit config.

Mutators live under `packages/shared/src/zero/mutators/`:

```text
packages/shared/src/zero/mutators/
+-- index.ts
+-- helpers.ts
+-- word-banks.ts
+-- sessions.ts
+-- chat.ts
+-- imposter.ts
+-- password.ts
+-- chain-reaction.ts
+-- shade-signal.ts
+-- location-signal.ts
+-- demo.ts
```

## Local Development

### Prerequisites

- Bun 1.3.x or newer
- Docker Desktop, OrbStack, Colima, or another Docker daemon
- Git

### Quick Start

```bash
bun install
bun run local:up
```

Then open:

- Web app: `http://localhost:5173`
- API: `http://localhost:3001`
- Admin app: `http://localhost:3002`
- Zero cache: `http://localhost:4848`

`bun run local:up` starts local Postgres, pushes the Drizzle schema, resets the Zero replica, starts the Zero cache, and launches the workspace dev servers.

### Manual Local Start

If you'd rather run each piece yourself:

```bash
bun install
docker compose up -d
bun run db:push
bun run dev
```

### Stop Local Services

```bash
# Windows
bun run local:down

# macOS
bun run local:down:mac

# Linux
bun run local:down:linux
```

### Platform-Specific Helpers

```bash
# Windows
bun run local:up
bun run local:reset

# macOS
bun run local:up:mac
bun run local:reset:mac

# Linux
bun run local:up:linux
bun run local:up:linux:host
bun run local:reset:linux
```

The Linux/macOS script uses standalone Docker containers and volumes. The Windows script uses `docker compose`.

## Environment Variables

### Root `.env`

The API and shared database tooling load the repo root `.env`. For local development, this is the practical minimum:

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

Optional map variables:

```bash
MAP_TILE_URL_TEMPLATE=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
MAP_TILE_ATTRIBUTION=(c) OpenStreetMap contributors
MAP_GEOCODE_URL=https://nominatim.openstreetmap.org/search
```

### Web App Variables

The web app falls back to local endpoints when these are omitted:

```bash
VITE_ZERO_CACHE_URL=http://localhost:4848
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001/ws
VITE_STYLE_ONLY=false
```

You can skip `VITE_WS_URL` if it's just the API URL plus `/ws`; the client derives it from `VITE_API_URL`.

### Admin App Variables

The admin app talks to the API through a proxy route and sends `ADMIN_SECRET` as a bearer token.

```bash
GAMES_API_URL=http://localhost:3001
ADMIN_SECRET=<same_secret_used_by_api>
AUTH_SECRET=<long_random_secret>
# NEXTAUTH_SECRET also works if the deployment already relies on it.
GITHUB_CLIENT_ID=<github_oauth_client_id>
GITHUB_CLIENT_SECRET=<github_oauth_client_secret>
ADMIN_GITHUB_IDS=<comma_separated_allowed_github_logins>
```

For local development, you can enable a credentials login:

```bash
ADMIN_DEV_SECRET=<local_admin_password>
```

The API must also have:

```bash
ADMIN_SECRET=<same_secret_used_by_admin_app>
```

### Zero Service Variables

For a deployed Zero cache service:

```bash
NODE_ENV=production
ZERO_UPSTREAM_DB=<postgres_url>
ZERO_QUERY_URL=https://<api-domain>/api/zero/query
ZERO_MUTATE_URL=https://<api-domain>/api/zero/mutate
ZERO_ADMIN_PASSWORD=<strong_secret>
```

Optional:

```bash
ZERO_CVR_DB=<postgres_url>
ZERO_CHANGE_DB=<postgres_url>
```

Keep the deployed Zero cache version in lockstep with `@rocicorp/zero` in the workspace. A version mismatch can pass health checks while quietly breaking browser sync connections, which is a miserable thing to debug.

## Common Commands

Run these from the repo root.

| Command | Purpose |
|---------|---------|
| `bun run dev` | Start all workspace dev servers through Turbo |
| `bun run local:up` | Start local DB/Zero, push schema, run dev servers on Windows |
| `bun run local:up:mac` | Start local DB/Zero, push schema, run dev servers on macOS |
| `bun run local:up:linux` | Start local DB/Zero, push schema, run dev servers on Linux |
| `bun run local:down` | Stop local dev ports and Docker services on Windows |
| `bun run build` | Build all workspaces |
| `bun run typecheck` | Typecheck all workspaces |
| `bun run test` | Run Vitest suites |
| `bun run test:ci` | Run CI-style Vitest suites |
| `bun run test:local` | Run shared local integration tests |
| `bun run lint` | Placeholder lint scripts |
| `bun run db:push` | Push the Drizzle schema to the configured database |
| `bun run db:studio` | Open Drizzle Studio |
| `bun run db:push:prod` | Push schema to `PROD_DB_URL` after confirmation |

Package-scoped examples:

```bash
bun --filter @games/web build
bun --filter @games/web test
bun --filter @games/api test
bun --filter @games/admin typecheck
bun --filter @games/shared db:push
```

React Doctor commands are documented in [docs/react-doctor-guide.md](docs/react-doctor-guide.md).

## CI and Deployment Gates

GitHub Actions runs the `CI` workflow on pull requests, pushes to `main` or `master`, and merge queue checks. The required job is named `Quality Gate` and runs:

```bash
bun run lint
bun run typecheck
bun run test:ci
bun run build
```

The `Deploy Hooks` workflow listens for successful `CI` runs on `main` or `master`, and only calls deploy hooks after CI passes. Add these repository secrets if you want GitHub Actions to trigger deployments:

```bash
VERCEL_DEPLOY_HOOK_URL=<vercel_deploy_hook_url>
RAILWAY_DEPLOY_HOOK_URL=<optional_custom_or_platform_deploy_trigger_url>
```

To keep failing commits out of production, protect the production branch in GitHub and require `Quality Gate` before merging. Also configure the hosts themselves:

- Vercel: use Deployment Checks on the production project and select the GitHub Actions `Quality Gate` check, or disable automatic Git production deploys and rely on the post-CI deploy hook.
- Railway: enable Wait for CI on each GitHub-connected service, or disable automatic deploys and trigger Railway from a post-CI workflow.

Keep the CI job name stable. GitHub, Vercel, and Railway all match on check names to decide what gates a merge or deployment, so renaming the job silently un-gates everything.

## Data Model

The primary schema lives in `packages/shared/src/drizzle/schema.ts`.

The important tables:

| Table | Purpose |
|-------|---------|
| `sessions` | Browser-backed player identity, current game attachment, IP/region/fingerprint, last seen |
| `status` | Footer/database health sentinel |
| `imposter_games` | Imposter room state, players, clues, votes, history, settings |
| `password_games` | Password teams, rounds, active rounds, scores, settings |
| `chain_reaction_games` | Word-chain state, submitted chains, turn, scores, round history |
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

The multiplayer game tables deliberately keep most of their live state in JSON columns. Room snapshots stay simple, and game transitions live right next to the mutator logic instead of being scattered across a dozen relational tables.

## API Surface

### Public and Runtime Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Railway/API healthcheck |
| `GET /debug/build-info` | API build, uptime, platform, and database sentinel status |
| `POST /api/session/sync` | Resolve or create signed browser session identity |
| `GET /ws` | Upgrade to the authenticated Bun WebSocket transport (also carries presence) |
| `GET /api/admin-status` | Current site-wide admin status payload |
| `GET /api/public/names/restricted` | Public restricted-name pattern list |
| `GET /api/embed/html` | Rich social/bot preview HTML |
| `GET /api/shikaku/puzzle` | Shikaku puzzle viewer page |
| `GET /api/shikaku/puzzle.svg` | Dynamic Shikaku puzzle SVG |
| `GET /api/maps/config` | Location Signal map tile configuration |
| `GET /api/maps/geocode` | Location Signal geocoding proxy |
| `POST /api/game-secret/init` | Initialize server-held game secret material |
| `POST /api/game-secret/pre-reveal` | Prepare hidden data before reveal |
| `POST /api/game-secret/key` | Resolve game secret key for authorized reveal paths |
| `GET/POST /api/cleanup` | Run authenticated stale-game/session cleanup |
| `GET/POST /api/activity` | Run authenticated activity report |

### Zero Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/zero/query` | Resolve shared Zero query requests |
| `POST /api/zero/mutate` | Resolve shared Zero mutation requests |

### Solo Game Score Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/shikaku/leaderboard` | Read the Shikaku leaderboard |
| `POST /api/shikaku/score/eligibility` | Check Shikaku score eligibility and canonical replay validity |
| `POST /api/shikaku/score` | Submit a Shikaku score with the solved-rectangle replay |
| `GET /api/pips/leaderboard` | Read the Pips leaderboard |
| `POST /api/pips/score/eligibility` | Check Pips run eligibility and canonical replay validity |
| `POST /api/pips/score` | Submit a Pips run with the solved-domino replay |

### Admin API

Admin routes are mounted under `/api/admin/*` and require `Authorization: Bearer <ADMIN_SECRET>`.

The major groups:

- `/clients`
- `/games`
- `/bans`
- `/broadcast/*`
- `/status`
- `/names/*`
- `/shikaku/scores`
- `/pips/scores`

## Admin Dashboard

The admin app lives in `apps/admin` and runs locally on port `3002`.

Pages:

| Route | Purpose |
|-------|---------|
| `/login` | GitHub or local dev login |
| `/` | Dashboard summary |
| `/clients` | Connected sessions and client actions |
| `/games` | Active room inspection and moderation |
| `/bans` | Session/IP/region bans, restricted names, name overrides |
| `/names` | Redirects to `/bans` |
| `/shikaku` | Shikaku leaderboard management |
| `/pips` | Pips leaderboard management |

What you can do from it:

- Use the broadcast controls from the dashboard shell.
- View live sessions, names, fingerprints, regions, and game attachments.
- Inspect active games by type and phase.
- End one game, or all of them.
- Kick a player from a game.
- Ban by session ID, IP address, or region.
- Send global or targeted toast messages.
- Force refresh all clients.
- Publish a custom site-wide status.
- Schedule update warnings.
- Override player names and maintain restricted name patterns.
- Create, edit, delete, and bulk-clear Shikaku and Pips score records.

## Mobile UI

The web app has a separate mobile surface under `apps/web/src/mobile`.

Mobile routing is chosen by the desktop page components through `useIsMobile()` at the `768px` breakpoint. Mobile pages get their own app shell, bottom navigation, sheets, and `m-` prefixed CSS classes, so desktop and mobile changes stay out of each other's way.

Current mobile-specific pages:

- Home
- Imposter
- Password begin/game/results
- Chain Reaction
- Shade Signal
- Location Signal

Solo games render their own pages. Shikaku is desktop-only on purpose; Pips has its own responsive puzzle interface instead of a separate `MobilePipsPage`.

## Deployment

Production is split across separate services:

- Vercel: `apps/web`
- Railway: `apps/api`
- Railway: Zero cache
- Railway Postgres or Neon: database
- Bun WebSockets: admin broadcasts, targeted events, and live Password typing

`vercel.json` disables automatic Git deploys from `main` and `master`. The default production web path is the post-CI deploy hook, not a raw push that hasn't passed `Quality Gate`. If you'd rather use Vercel's built-in Deployment Checks flow, remove or adjust the `git.deploymentEnabled` block and configure `Quality Gate` as the required deployment check in Vercel.

### Vercel Web App

`vercel.json` currently uses Bun:

- install: `bun install --frozen-lockfile`
- build: `bun run --filter @games/web build`
- output: `apps/web/dist`

It also includes:

- An SPA rewrite to `/index.html`.
- A bot/social-preview rewrite to the API embed endpoint.

Required Vercel variables:

```bash
VITE_ZERO_CACHE_URL=https://<zero-domain>
VITE_API_URL=https://<api-domain>
VITE_WS_URL=wss://<api-domain>/ws
```

If you turn Vercel Git auto-deploys back on, set up Vercel Deployment Checks so production isn't promoted until `Quality Gate` passes. The current repo config disables `main` and `master` Git autodeploys, so the safer default is to store a Vercel deploy hook as `VERCEL_DEPLOY_HOOK_URL` and let GitHub Actions call it after CI passes.

### Railway API

`railway.toml` builds from `Dockerfile` and starts:

```bash
bun apps/api/src/index.ts
```

Required API variables:

```bash
NODE_ENV=production
DATABASE_URL=<postgres_url>
CLEANUP_SECRET=<strong_secret>
SESSION_COOKIE_SECRET=<long_random_secret>
ADMIN_SECRET=<strong_admin_secret>
CORS_ALLOWED_ORIGINS=https://<web-domain>
```

If Railway GitHub autodeploys are on, enable Wait for CI in the Railway service settings so Railway holds deploys until GitHub Actions finishes. If you're using a manual/API trigger instead, disable automatic deploys and trigger Railway from the post-CI workflow after `Quality Gate` passes.

Worth checking after a deploy:

```bash
GET https://<api-domain>/health
GET https://<api-domain>/debug/build-info
```

### Railway Zero Cache

Deploy the Zero cache as its own service using the official Docker image. Keep the image tag on the same `@rocicorp/zero` version the workspace uses (`1.8.0`).

Service configuration:

- **Source**: Docker image `rocicorp/zero:1.8.0` (Docker Hub)
- **Start command**: leave it empty. The image's entrypoint starts zero-cache on its own. Don't set a `bunx`/`npx` start command; the image only contains Node, so `bunx` doesn't exist inside the container.

To upgrade Zero in production, change the image tag in the Railway service's source settings to match the workspace version, then redeploy.

Required Zero variables:

```bash
NODE_ENV=production
ZERO_UPSTREAM_DB=<postgres_url>
ZERO_QUERY_URL=https://<api-domain>/api/zero/query
ZERO_MUTATE_URL=https://<api-domain>/api/zero/mutate
ZERO_ADMIN_PASSWORD=<strong_secret>
```

Don't set `ZERO_PORT` to the literal string `"$PORT"` on Railway. Railway doesn't shell-expand environment variable values in that field, so Zero would try to listen on a port named `$PORT`.

### Database Requirements

Zero needs a direct Postgres connection with logical replication support. For local development, `docker-compose.yml` starts Postgres 16 with:

```bash
postgres -c wal_level=logical
```

For production, point `ZERO_UPSTREAM_DB` at a direct Postgres URL. Don't put a transaction pooler in front of the Zero upstream connection; logical replication doesn't work through one.

## Operational Notes

### Session Identity

Public gameplay uses browser-local identity, not user accounts. The API signs a long-lived `games_session` cookie and issues a signed Zero session proof. Mutations are checked server-side so one browser session can't submit actions on behalf of another player.

### Presence

Presence rides on the realtime WebSocket. The open `/ws` connection itself is the "online" signal: the client reports its current activity (route) when it changes, the API keeps an in-memory presence registry per session, and a server-side flush periodically bumps `last_seen` for sessions that are still connected. There's no HTTP presence polling.

### Admin Broadcasts

Admin broadcasts use the API's Bun WebSocket service:

- `broadcast` for global messages.
- `user:{sessionId}` for targeted kicks, name changes, and direct toasts.
- `password-team:{gameId}:{teamIndex}` for team-only Password live typing.

### Cleanup

The API can clean up stale games and sessions two ways:

- Scheduled cleanup inside the API process.
- A manual `GET` or `POST /api/cleanup` with bearer auth from `CLEANUP_SECRET`.

Cleanup marks abandoned games as ended, detaches stale sessions, and removes old ended rows.

### Footer Database Status

`/debug/build-info` reads the `status` table and reports whether the configured sentinel row exists and matches.

Default values:

```bash
DB_STATUS_KEY=footer
DB_STATUS_EXPECTED_VALUE=ok
```

Seed or repair the row with:

```sql
INSERT INTO status (key, value, updated_at)
VALUES ('footer', 'ok', EXTRACT(EPOCH FROM NOW())::bigint * 1000)
ON CONFLICT (key)
DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = EXCLUDED.updated_at;
```

### Smoke Test Checklist

After a deploy:

1. Open the web app.
2. Create one room for each multiplayer game.
3. Join a room from a second tab or device.
4. Confirm chat, presence, phase transitions, and host controls all work.
5. Play one Shikaku run and verify the leaderboard submission.
6. Play one Pips run and verify the leaderboard submission.
7. Open the admin dashboard and check clients, games, broadcasts, bans, Shikaku scores, and Pips scores.
8. Check `/health`, `/debug/build-info`, and the Zero cache public URL.

## Known Constraints

- Public gameplay is browser-local identity only; there's no player account system.
- The lint scripts are placeholders.
- Multiplayer game state is mostly JSON-column snapshots, by design.
- The API runs TypeScript directly through Bun in production instead of a compiled `dist` entry.
- The Zero cache and workspace `@rocicorp/zero` versions have to stay aligned.
- Shikaku and Pips are not Zero-synced multiplayer games; they only use REST for the leaderboard flows.

# Games

![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111827)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Next.js](https://img.shields.io/badge/Admin-Next.js%2015-000000?logo=nextdotjs&logoColor=white)
![Bun](https://img.shields.io/badge/Runtime-Bun-F9F1E1?logo=bun&logoColor=111827)
![Hono](https://img.shields.io/badge/API-Hono-E36002)
![Zero](https://img.shields.io/badge/Realtime-Rocicorp%20Zero%201.5-111827)
![Postgres](https://img.shields.io/badge/Database-Postgres%2016-4169E1?logo=postgresql&logoColor=white)
![Drizzle](https://img.shields.io/badge/ORM-Drizzle-C5F74F)
![Turbo](https://img.shields.io/badge/Monorepo-Turbo-000000?logo=turborepo&logoColor=white)

Games is a TypeScript monorepo for browser-based party games and logic puzzles. It includes a React + Vite player app, a Bun/Hono API, a Next.js admin dashboard, shared Drizzle/Zero contracts, and a local Postgres + Zero development stack.

This project is a full refactor of an earlier version: [oyuh/games-arch](https://github.com/oyuh/games-arch).

Live links:

- Web app: [games.lawsonhart.me](https://games.lawsonhart.me)
- Shikaku puzzle SVG endpoint: [api.games.lawsonhart.me/api/shikaku/puzzle](https://api.games.lawsonhart.me/api/shikaku/puzzle)

## Contents

- [Games Included](#games-included)
- [Game Docs](#game-docs)
- [Repository Layout](#repository-layout)
- [Architecture](#architecture)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Common Commands](#common-commands)
- [Data Model](#data-model)
- [API Surface](#api-surface)
- [Admin Dashboard](#admin-dashboard)
- [Mobile UI](#mobile-ui)
- [Deployment](#deployment)
- [Operational Notes](#operational-notes)
- [Known Constraints](#known-constraints)

## Games Included

The app currently exposes seven playable experiences.

| Game | Mode | Players | Route | State model |
|------|------|---------|-------|-------------|
| Imposter | Social deduction | 3-12 | `/imposter/:id` | Multiplayer, Zero-synced |
| Password | Team word guessing | 4+ | `/password/:id/begin`, `/password/:id`, `/password/:id/results` | Multiplayer, Zero-synced |
| Chain Reaction | Competitive word-chain duel | 2 | `/chain/:id` | Multiplayer, Zero-synced |
| Shade Signal | Color clue guessing | 3-8 | `/shade/:id` | Multiplayer, Zero-synced |
| Location Signal | Map clue guessing | 3-8 | `/location/:id` | Multiplayer, Zero-synced |
| Shikaku | Timed rectangle logic puzzle | Solo | `/shikaku` | Shared seeded engine + REST leaderboard |
| Pips | Timed domino logic run | Solo | `/pips` | Shared seeded engine + REST leaderboard |

Multiplayer games share room creation, join codes, public lobby visibility, spectators, host controls, chat, session presence, admin kicks, and synchronized state through Rocicorp Zero.

Solo games do not require the Zero cache to be awake. Shikaku and Pips run their puzzle engines in the browser and call REST endpoints only for eligibility checks, leaderboard reads, and score submission. Ranked submissions include replay data, and the API reuses the same shared engines to regenerate the public seed and verify the submitted solve before storing leaderboard rows.

## Game Docs

Each game has its own document with rules, flow, scoring, and implementation notes.

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
|   +-- admin/          # Next.js 15 admin dashboard
+-- packages/
|   +-- shared/         # Drizzle/Zero contracts, metadata, shared solo puzzle engines
+-- docs/              # Game docs and maintenance notes
+-- scripts/           # Local stack and production DB helper scripts
+-- docker-compose.yml # Local Postgres + Zero cache stack for Windows script path
+-- Dockerfile         # API container image
+-- railway.toml       # API Railway deployment config
+-- vercel.json        # Web Vercel deployment config with SPA + bot preview rewrites
+-- turbo.json         # Workspace task orchestration
+-- package.json       # Bun workspace scripts
```

## Architecture

### Player App: `apps/web`

The web app is a React 19 single-page application built by Vite. It owns the public game experience.

Main responsibilities:

- Browser routes for the home page, multiplayer rooms, Shikaku, Pips, and score admin helper route.
- A module-scoped Zero client for realtime multiplayer sync.
- Local browser identity, recent games, display name, and first-visit state.
- HTTP session sync and presence heartbeats against the API.
- Pusher subscriptions for global admin broadcasts and targeted user events.
- Lazy-loaded game pages and vendor chunks for smaller initial loads.
- Sync wake/idle messaging when the multiplayer Zero cache is cold or paused.
- Mobile-specific pages and bottom sheets for the multiplayer experience.

Key files:

- `apps/web/src/App.tsx`
- `apps/web/src/pages/`
- `apps/web/src/mobile/`
- `apps/web/src/lib/zero.ts`
- `apps/web/src/lib/session.ts`
- `packages/shared/src/games/shikaku-engine.ts`
- `packages/shared/src/games/pips-engine.ts`

### Shared Solo Puzzle Engines

Shikaku and Pips use shared TypeScript engine modules so the browser and API agree on the exact same ranked rules even when the API is not needed for local play. The web app imports the engines through thin wrappers in `apps/web/src/lib/*-engine.ts`; the API imports the shared modules directly for leaderboard validation.

- `packages/shared/src/games/shikaku-engine.ts` owns seeded Shikaku generation, rectangle validation, scoring, auto-filled `1x1` detection, and ranked replay verification.
- `packages/shared/src/games/pips-engine.ts` owns seeded Pips generation, board/region validation, domino placement validation, solver utilities, run time scoring, and ranked replay verification.
- Ranked score requests include replay payloads: Shikaku sends solved rectangles for each of the five puzzles, and Pips sends solved domino placements for Easy, Medium, and Hard.
- On the server, the API regenerates the canonical run from the submitted seed, validates the replay against those generated puzzles, recalculates or checks score/time invariants, then applies duplicate, top-20, rate-limit, and ban checks before writing to Postgres.

### API App: `apps/api`

The API is a Bun-powered Hono service. It handles REST endpoints, Zero query/mutation forwarding, admin operations, signed session identity, score validation, and cleanup work.

Main responsibilities:

- `POST /api/zero/query` and `POST /api/zero/mutate`
- Signed session cookies and signed Zero session proofs.
- Session sync and presence heartbeat updates.
- Pusher private-channel auth and admin event triggers.
- Server-held secret keys for hidden game data.
- Shikaku and Pips leaderboard, eligibility, and score validation.
- Location Signal map tile config and geocode proxy.
- Admin dashboard API under `/api/admin/*`.
- Scheduled and manual cleanup of stale games and sessions.
- `/health` and `/debug/build-info` diagnostics.

Key files:

- `apps/api/src/index.ts`
- `apps/api/src/admin-routes.ts`
- `apps/api/src/broadcast-server.ts`
- `apps/api/src/session-identity.ts`
- `apps/api/src/db-provider.ts`

### Admin App: `apps/admin`

The admin dashboard is a Next.js 16 app protected by NextAuth. It proxies admin requests to the API with `ADMIN_SECRET`.

Main responsibilities:

- Dashboard summary and recent activity.
- Connected client/session browsing.
- Active game inspection, ending, and kicking.
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

The shared package is the contract layer used by the web app and API.

It contains:

- Drizzle Postgres schema.
- Zero schema.
- Shared query definitions.
- Domain-split Zero mutators.
- Shared game types and game metadata.
- Drizzle Kit config and migrations.

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

`bun run local:up` starts local Postgres, pushes the Drizzle schema, resets the Zero replica, starts Zero cache, and launches the workspace dev servers.

### Manual Local Start

If you want to run each piece yourself:

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

The API and shared database tooling load the repository root `.env`. For local development, this is the practical minimum:

```bash
NODE_ENV=development
DATABASE_URL=postgres://postgres:postgres@localhost:5432/games
ZERO_UPSTREAM_DB=postgres://postgres:postgres@localhost:5432/games
ZERO_CVR_DB=postgres://postgres:postgres@localhost:5432/games
ZERO_CHANGE_DB=postgres://postgres:postgres@localhost:5432/games
ZERO_ADMIN_PASSWORD=dev-password
CLEANUP_SECRET=cleanup-local
SESSION_COOKIE_SECRET=games-dev-session-secret
```

Optional local Pusher variables:

```bash
PUSHER_APP_ID=<your_pusher_app_id>
PUSHER_KEY=<your_pusher_key>
PUSHER_SECRET=<your_pusher_secret>
PUSHER_CLUSTER=<your_pusher_cluster>
```

Optional map variables:

```bash
MAP_TILE_URL_TEMPLATE=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
MAP_TILE_ATTRIBUTION=(c) OpenStreetMap contributors
MAP_GEOCODE_URL=https://nominatim.openstreetmap.org/search
```

### Web App Variables

The web app defaults to local endpoints when these are omitted:

```bash
VITE_ZERO_CACHE_URL=http://localhost:4848
VITE_API_URL=http://localhost:3001
VITE_STYLE_ONLY=false
```

Pusher broadcasts in the browser require:

```bash
VITE_PUSHER_KEY=<your_pusher_key>
VITE_PUSHER_CLUSTER=<your_pusher_cluster>
```

### Admin App Variables

The admin app talks to the API through a proxy route and sends `ADMIN_SECRET` as a bearer token.

```bash
GAMES_API_URL=http://localhost:3001
ADMIN_SECRET=<same_secret_used_by_api>
AUTH_SECRET=<long_random_secret>
# NEXTAUTH_SECRET can also be used if the deployment already relies on it.
GITHUB_CLIENT_ID=<github_oauth_client_id>
GITHUB_CLIENT_SECRET=<github_oauth_client_secret>
ADMIN_GITHUB_IDS=<comma_separated_allowed_github_logins>
```

For local development, a credentials login can be enabled:

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

For Zero 1.5, keep the Zero cache version aligned with `@rocicorp/zero` in the workspace. A cache/server version mismatch can pass health checks while breaking browser sync connections.

## Common Commands

Run from the repository root.

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
| `bun run db:push` | Push Drizzle schema to the configured database |
| `bun run db:generate` | Generate Drizzle migration files |
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

## Data Model

The primary schema lives in `packages/shared/src/drizzle/schema.ts`.

Important tables:

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

The multiplayer game tables intentionally store much of their live state in JSON columns. That keeps room snapshots simple and keeps game transitions close to the mutator logic.

## API Surface

### Public and Runtime Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Railway/API healthcheck |
| `GET /debug/build-info` | API build, uptime, platform, and database sentinel status |
| `POST /api/session/sync` | Resolve or create signed browser session identity |
| `POST /api/presence/heartbeat` | Refresh session/game presence |
| `POST /api/pusher/auth` | Authenticate private Pusher channels |
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
| `GET /api/shikaku/leaderboard` | Read Shikaku leaderboard |
| `POST /api/shikaku/score/eligibility` | Check Shikaku score eligibility and canonical replay validity |
| `POST /api/shikaku/score` | Submit Shikaku score with solved-rectangle replay |
| `GET /api/pips/leaderboard` | Read Pips leaderboard |
| `POST /api/pips/score/eligibility` | Check Pips run eligibility and canonical replay validity |
| `POST /api/pips/score` | Submit Pips run with solved-domino replay |

### Admin API

Admin routes are mounted under `/api/admin/*` and require `Authorization: Bearer <ADMIN_SECRET>`.

Major groups:

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

Capabilities:

- Use broadcast controls from the dashboard shell.
- View live sessions, names, fingerprints, regions, and game attachments.
- Inspect active games by type and phase.
- End one game or all games.
- Kick a player from a game.
- Ban by session ID, IP address, or region.
- Send global or targeted toast messages.
- Force refresh all clients.
- Publish custom site-wide status.
- Schedule update warnings.
- Override player names and maintain restricted name patterns.
- Create, edit, delete, and bulk-clear Shikaku and Pips score records.

## Mobile UI

The web app has a separate mobile surface under `apps/web/src/mobile`.

Mobile routing is selected by the desktop page components through `useIsMobile()` at the `768px` breakpoint. Mobile pages use their own app shell, bottom navigation, sheets, and `m-` prefixed CSS classes so desktop and mobile changes stay isolated.

Current mobile-specific pages include:

- Home
- Imposter
- Password begin/game/results
- Chain Reaction
- Shade Signal
- Location Signal

Solo games render their own pages. Shikaku is documented as desktop-only; Pips owns its own responsive puzzle interface rather than a separate `MobilePipsPage`.

## Deployment

Production is split across separate services:

- Vercel: `apps/web`
- Railway: `apps/api`
- Railway: Zero cache
- Railway Postgres or Neon: database
- Pusher Channels: admin broadcasts and targeted events

### Vercel Web App

`vercel.json` currently uses Bun:

- install: `bun install --frozen-lockfile`
- build: `bun run --filter @games/web build`
- output: `apps/web/dist`

It also includes:

- SPA rewrite to `/index.html`.
- Bot/social-preview rewrite to the API embed endpoint.

Required Vercel variables:

```bash
VITE_ZERO_CACHE_URL=https://<zero-domain>
VITE_API_URL=https://<api-domain>
VITE_PUSHER_KEY=<pusher_key>
VITE_PUSHER_CLUSTER=<pusher_cluster>
```

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
PUSHER_APP_ID=<pusher_app_id>
PUSHER_KEY=<pusher_key>
PUSHER_SECRET=<pusher_secret>
PUSHER_CLUSTER=<pusher_cluster>
```

Useful API checks after deploy:

```bash
GET https://<api-domain>/health
GET https://<api-domain>/debug/build-info
```

### Railway Zero Cache

Deploy Zero cache as a separate service. Keep it on the same `@rocicorp/zero` version used by the workspace (`1.5.0`).

Recommended start command:

```bash
bunx @rocicorp/zero@1.5.0 zero-cache --port "$PORT"
```

Required Zero variables:

```bash
NODE_ENV=production
ZERO_UPSTREAM_DB=<postgres_url>
ZERO_QUERY_URL=https://<api-domain>/api/zero/query
ZERO_MUTATE_URL=https://<api-domain>/api/zero/mutate
ZERO_ADMIN_PASSWORD=<strong_secret>
```

Do not set `ZERO_PORT` to the literal string `"$PORT"` on Railway. Railway does not shell-expand environment variable values in that field.

### Database Requirements

Zero needs a direct Postgres connection with logical replication support. For local development, `docker-compose.yml` starts Postgres 16 with:

```bash
postgres -c wal_level=logical
```

For production, use a direct Postgres URL for `ZERO_UPSTREAM_DB`; avoid transaction poolers for the Zero upstream connection.

## Operational Notes

### Session Identity

The app uses browser-local identity rather than user accounts for public gameplay. The API signs a long-lived `games_session` cookie and issues a signed Zero session proof. Mutations are checked so one browser session cannot submit actions for another player.

### Presence

Presence is inferred from HTTP heartbeats, not WebSockets. Game pages periodically call `POST /api/presence/heartbeat`, and the API updates `sessions.lastSeen` plus the current game attachment.

### Admin Broadcasts

Admin broadcasts use Pusher Channels:

- `games-broadcast` for global messages.
- `private-user-{sessionId}` for targeted kicks, name changes, and direct toasts.

### Cleanup

The API can clean stale games and sessions in two ways:

- scheduled cleanup inside the API process
- manual `GET` or `POST /api/cleanup` with bearer auth from `CLEANUP_SECRET`

Cleanup marks abandoned games as ended, detaches stale sessions, and removes old ended rows.

### Footer Database Status

`/debug/build-info` reads the `status` table and reports whether the configured sentinel exists and matches.

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
4. Confirm chat, presence, phase transitions, and host controls.
5. Play one Shikaku run and verify leaderboard submission.
6. Play one Pips run and verify leaderboard submission.
7. Open the admin dashboard and verify clients, games, broadcasts, bans, Shikaku scores, and Pips scores.
8. Check `/health`, `/debug/build-info`, and the Zero cache public URL.

## Known Constraints

- Public gameplay has browser-local identity only; there is no player account system.
- Lint scripts are placeholders.
- Multiplayer game state is mostly JSON-column snapshots by design.
- The API runs TypeScript directly through Bun in production instead of a compiled `dist` entry.
- The Zero cache and workspace `@rocicorp/zero` versions should stay aligned.
- Shikaku and Pips are not Zero-synced multiplayer games; they use REST only for leaderboard flows.

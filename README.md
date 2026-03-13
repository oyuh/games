# Games

![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111827)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Node](https://img.shields.io/badge/Node-Server-5FA04E?logo=node.js&logoColor=white)
![Hono](https://img.shields.io/badge/API-Hono-E36002)
![Zero](https://img.shields.io/badge/Realtime-Rocicorp%20Zero-111827)
![Pusher](https://img.shields.io/badge/Broadcast-Pusher%20Channels-300D4F?logo=pusher&logoColor=white)
![Postgres](https://img.shields.io/badge/Database-Postgres-4169E1?logo=postgresql&logoColor=white)
![Drizzle](https://img.shields.io/badge/ORM-Drizzle-C5F74F&logoColor=111827)
![Turbo](https://img.shields.io/badge/Monorepo-Turbo-000000?logo=turborepo&logoColor=white)
![pnpm](https://img.shields.io/badge/Package%20Manager-pnpm-F69220?logo=pnpm&logoColor=white)
![Deploy](https://img.shields.io/badge/Deploy-Vercel%20%2B%20Railway-0F172A)

Games is a TypeScript monorepo for browser-based multiplayer party games. The frontend is a React 19 + Vite single-page app, the backend is a Hono-powered Node service, realtime state replication is handled through Rocicorp Zero, admin broadcasts and targeted messages flow through Pusher Channels, presence is tracked via periodic HTTP heartbeats, and persistent state lives in Postgres via Drizzle schema definitions.

This repository currently contains four implemented game flows at the data/model level:

- Imposter
- Password
- Chain Reaction
- Shade Signal
- Location Signal

## Table of Contents

- [Project Summary](#project-summary)
- [Monorepo Layout](#monorepo-layout)
- [Technology Stack](#technology-stack)
- [How the System Works](#how-the-system-works)
- [Data Model and Shared Contracts](#data-model-and-shared-contracts)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Build, Typecheck, Test, and Database Tasks](#build-typecheck-test-and-database-tasks)
- [Deployment](#deployment)
- [Operational Notes](#operational-notes)
- [Known Constraints](#known-constraints)
- [Mobile UI](#mobile-ui)
- [Reference Docs](#reference-docs)

## Project Summary

The core idea of the repo is simple:

1. The browser loads a React SPA from `apps/web`.
2. The app creates or restores a local session ID in the browser.
3. The browser connects to Rocicorp Zero for synchronized query/mutation state.
4. Zero forwards query and mutation work to the API service in `apps/api`.
5. The API service executes queries and mutators backed by Postgres.
6. In parallel, the browser sends periodic HTTP heartbeats to the API so the server can keep session `lastSeen` values fresh.
7. The browser subscribes to Pusher Channels to receive admin broadcasts (toasts, kicks, status updates).
8. Game state updates are persisted in Postgres and reflected back into the UI through Zero subscriptions.

This architecture gives the project a fairly clean separation:

- `apps/web` is responsible for rendering, routing, local session persistence, and client-side subscriptions.
- `apps/api` is responsible for HTTP endpoints, Zero query/mutation handling, Pusher event triggers, presence heartbeats, and cleanup jobs.
- `packages/shared` is the contract layer used by both apps: schema, types, queries, and mutators.

## Monorepo Layout

```text
.
├─ apps/
│  ├─ api/              # Hono + Node server, Zero query/mutate endpoints, Pusher broadcast
│  └─ web/              # React 19 + Vite frontend
├─ packages/
│  └─ shared/           # Shared schema, types, Zero queries, Zero mutators (modular), Drizzle config
├─ docs/                # Deployment notes and game design docs
├─ docker-compose.yml   # Local Postgres + Zero cache container stack
├─ turbo.json           # Monorepo task orchestration
├─ pnpm-workspace.yaml  # Workspace package discovery
├─ vercel.json          # Web deployment config
└─ railway.toml         # API deployment config
```

### apps/web

This is the client application. It is a Vite-built React SPA with React Router. The frontend does not contain a traditional REST data layer; instead it consumes Rocicorp Zero queries and mutators from the shared package, which keeps the client and server contract aligned.

Important responsibilities in the web app:

- Bootstrap React and mount the SPA
- Configure a singleton Zero client
- Generate or restore a persistent browser session ID
- Maintain local display name and recent-game history in `localStorage`
- Send periodic HTTP presence heartbeats to the API service
- Subscribe to Pusher Channels for admin broadcasts and targeted messages
- Render game routes and game-specific UI
- Expose connection/debug state for Zero, API metadata, and presence connectivity

### apps/api

This is the backend service. It uses Hono on Node, exposes health and debug endpoints, receives Zero query/mutate requests, triggers Pusher events for admin broadcasts, and periodically cleans stale games and sessions.

Important responsibilities in the API app:

- Handle `POST /api/zero/query`
- Handle `POST /api/zero/mutate`
- Handle `GET /health`
- Handle `GET /debug/build-info`
- Handle `GET|POST /api/cleanup` with bearer auth
- Handle `POST /api/pusher/auth` for Pusher channel authentication
- Handle `POST /api/presence/heartbeat` for session liveness
- Trigger Pusher events for admin broadcasts (toasts, kicks, status, name restrictions)
- Run scheduled stale-session / stale-game cleanup

### packages/shared

This package is the technical center of the system. It contains the shared contracts used everywhere else.

Important contents:

- Drizzle Postgres schema definitions
- Zero schema and query definitions
- Zero mutator implementations (modular — see structure below)
- Shared TypeScript types for game state
- Drizzle migration configuration

This design keeps the frontend and backend from drifting. The web app imports the same mutators and query definitions that the backend resolves and executes.

#### Mutators directory structure

The Zero mutators live in `packages/shared/src/zero/mutators/` and are split by domain:

```text
packages/shared/src/zero/mutators/
├─ index.ts            # Barrel — composes defineMutators, re-exports public symbols
├─ word-banks.ts       # Word banks and category data (imposter, chain reaction, password)
├─ helpers.ts          # Shared utility functions (now, code, shuffle, pickRandom, etc.)
├─ sessions.ts         # Session mutators (upsert, setName, attachGame, touchPresence)
├─ imposter.ts         # Imposter game mutators (12 mutators)
├─ password.ts         # Password game mutators (15 mutators)
├─ chat.ts             # Chat mutators (send, clearForGame)
├─ chain-reaction.ts   # Chain Reaction game mutators (12 mutators)
├─ shade-signal.ts     # Shade Signal game mutators (15 mutators)
└─ demo.ts             # Dev-only demo seeders (4 seeders)
```

The barrel `index.ts` imports all domain-specific mutator objects and composes them into a single `mutators` export via `defineMutators()`. Consumers still import everything from `@games/shared` — the split is internal to the shared package.

## Technology Stack

### Core platform

- TypeScript 5.8 across the entire monorepo
- pnpm workspaces for package management
- Turbo for cross-package task orchestration

### Frontend

- React 19
- React Router 7
- Vite 6
- Tailwind CSS 4 via `@tailwindcss/vite`
- Flowbite / Flowbite React for some UI building blocks
- `react-icons` for iconography

### Realtime and state sync

- Rocicorp Zero `0.25.13`
- Zero React bindings in the frontend
- Zero server request handlers in the API service
- A separate Zero cache service in deployment and Docker-based development

### Backend

- Hono 4 for HTTP routing
- `@hono/node-server` for Node-based serving
- `pusher` for server-side Pusher Channels event triggers
- `dotenv` for local environment loading

### Database and schema management

- PostgreSQL 16 in local Docker setup
- Drizzle ORM for typed schema access
- Drizzle Kit for schema generation, push, and studio
- `pg` for database connections

### Deployment targets

- Vercel for the frontend SPA
- Railway for the Node API service
- Railway for the Zero cache service
- Railway Postgres or Neon for the database

## How the System Works

This section focuses on technical flow rather than UX flow.

### 1. Browser boot

When the web app starts:

- React mounts from `apps/web/src/main.tsx`
- `App.tsx` creates a module-scoped Zero singleton exactly once per page load
- the app resolves a browser session ID from `localStorage` or creates one with `nanoid`
- the app reads the user display name from `localStorage`
- the app upserts the session into the shared `sessions` table through a Zero mutator

Why the Zero instance is module-scoped:

- recreating the Zero client can reset mutation counters and destabilize synchronization
- keeping one client per page load produces more stable realtime behavior

### 2. Routing model

The frontend is a single-page application using browser routing. The major routes are:

- `/` for the home screen and game creation/join flow
- `/imposter/:id` for Imposter games
- `/password/:id/begin` for Password pre-round setup
- `/password/:id` for active Password rounds
- `/password/:id/results` for Password results
- `/chain/:id` for Chain Reaction
- `/shade/:id` for Shade Signal

Because this is an SPA, production hosting requires a rewrite rule that sends unknown paths back to `index.html`. That is already configured in [vercel.json](vercel.json).

### 3. Session persistence

The browser stores lightweight identity and convenience state locally:

- session ID
- player name
- recent games
- a visited flag

This is handled client-side so a returning browser tab behaves like the same player identity without requiring account auth.

Server-side, the `sessions` table stores:

- session ID
- name
- current game type and game ID
- created timestamp
- `lastSeen` timestamp

That means session presence is a hybrid model:

- identity originates in browser local storage
- liveliness is maintained server-side through HTTP heartbeat updates

### 4. Query and mutation flow with Zero

The app uses Rocicorp Zero as the main synchronization layer.

High-level flow:

1. The frontend imports shared query and mutator definitions from `@games/shared`.
2. The frontend issues `useQuery(...)` calls and `zero.mutate(...)` calls.
3. Zero sends those requests to the Zero cache service.
4. The Zero cache service forwards query requests to the API service at `/api/zero/query`.
5. The Zero cache service forwards mutation requests to the API service at `/api/zero/mutate`.
6. The API service resolves query names and mutator names against the shared definitions.
7. Drizzle-backed database operations run against Postgres.
8. Updated data becomes visible to subscribers through Zero.

This is the main reason the app feels realtime without the frontend manually polling game state.

### 5. Presence flow

Presence is not handled by Zero directly in this repo. It is handled with periodic HTTP heartbeats from the client to the API service.

Flow:

1. A game page calls the `usePresenceSocket` hook.
2. The hook sends a `POST /api/presence/heartbeat` request with the session ID, game ID, and game type.
3. Every 60 seconds the client sends another heartbeat request.
4. The API service updates the `sessions` row `lastSeen` field and game association.

This lets the system infer connected/disconnected state from `lastSeen` freshness.

### 6. Admin broadcast flow

Admin broadcasts (toasts, kicks, custom status messages, restricted names) are delivered through Pusher Channels.

Flow:

1. The admin dashboard triggers an action (e.g. broadcast toast, kick user, set custom status).
2. The API service calls `pusher.trigger()` to send the event on the appropriate channel.
3. Global events go on the `games-broadcast` channel.
4. Targeted events (e.g. kicks) go on `private-user-{sessionId}` channels.
5. The client subscribes to both channels via the `useAdminBroadcast` hook using `pusher-js`.
6. Pusher channel authentication is handled through `POST /api/pusher/auth`, which validates session ownership and checks bans.

### 7. Cleanup flow

The API service has two cleanup paths:

- scheduled cleanup every 15 minutes
- manual cleanup through `/api/cleanup` with a bearer token

Cleanup behavior includes:

- marking stale games as `ended`
- detaching stale sessions from ended games
- deleting old ended game rows
- deleting very stale session rows

This matters operationally because multiplayer game rows are long-lived enough to support reconnects, but not intended to accumulate forever.

### 8. API diagnostics flow

The frontend periodically probes `/debug/build-info` on the API service. That endpoint exposes:

- deployment platform hint
- commit SHA / branch metadata when available
- build timestamp metadata when available
- service start time
- uptime
- Node version
- environment name

This is used for connection diagnostics and for understanding which backend build a browser is currently talking to.

## Data Model and Shared Contracts

The main persistent entities are defined in `packages/shared/src/drizzle/schema.ts`.

### sessions

Tracks browser-backed users and their current association with a game.

Key fields:

- `id`
- `name`
- `gameType`
- `gameId`
- `createdAt`
- `lastSeen`

### imposter_games

Stores the full state machine for an Imposter match.

Notable data stored directly in JSON columns:

- players
- clues
- votes
- kicked players
- round history
- announcement
- settings

This is a denormalized game-state model. It is intentionally optimized more for simple state snapshots and mutation logic than for highly normalized relational analysis.

### password_games

Stores Password game state, including:

- teams
- rounds
- scores
- active rounds
- kicked players
- settings

### chain_reaction_games

Stores Chain Reaction game state, including:

- players
- current chain data
- submitted custom chains
- current turn
- scores
- round history
- kicked players
- settings

### shade_signal_games

Stores Shade Signal game state, including:

- players (with cumulative scores)
- leader rotation order
- grid seed, target coordinates
- clues (two per round)
- guesses per round
- round history with scoring
- kicked players
- settings (hard mode, leader pick, durations, rounds per player)

### chat_messages

Stores per-game chat history keyed by game type and game ID.

### Query definitions

Shared query definitions cover:

- sessions by ID
- sessions by game
- Imposter by ID and join code
- Password by ID and join code
- Chain Reaction by ID and join code
- Shade Signal by ID and join code
- chat messages by game

Because these definitions live in the shared package, the browser and server reference the same query names and argument contracts.

### Mutator definitions

Shared mutators cover:

- session upsert / naming / attachment / presence touch
- game creation
- join / leave flows
- game-phase transitions
- per-game action flows such as clue submission, voting, guessing, scoring, and progression

The mutators are the real source of game-state transitions. If you are changing behavior, this is usually the first place to inspect.

Mutators are organized into separate files by game domain under `packages/shared/src/zero/mutators/`. Each game has its own file (e.g. `imposter.ts`, `password.ts`, `chain-reaction.ts`, `shade-signal.ts`), with shared utilities in `helpers.ts` and word bank data in `word-banks.ts`. The barrel `index.ts` composes them all via `defineMutators()`.

## Local Development

### Prerequisites

Install the following before starting:

- Node.js 20+ recommended
- pnpm 10.x or really any node
- Docker Desktop or a compatible Docker runtime

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start Postgres and Zero cache

The repo includes [docker-compose.yml](docker-compose.yml), which starts:

- Postgres 16 with `wal_level=logical`
- a Zero cache service

Start it with:

```bash
docker compose up -d
```

Why `wal_level=logical` matters:

- Zero relies on logical replication semantics
- if this is not enabled on the upstream Postgres instance, Zero will fail or behave incorrectly

### 3. Create a local environment file

At the repository root, create `.env` with at least:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/games
PORT=3001
API_PORT=3001
CLEANUP_SECRET=cleanup-local
```

The API service explicitly loads `../../.env`, so the root `.env` file is the expected local configuration source.

### 4. Push the schema to the database

```bash
pnpm db:push
```

### 5. Run the web app and API app together

```bash
pnpm dev
```

This runs the workspace `dev` scripts in parallel through Turbo.

Expected local endpoints:

- web: `http://localhost:5173`
- api: `http://localhost:3001`
- zero cache: `http://localhost:4848`

### 6. Local frontend environment

The web app defaults to local endpoints if environment variables are not set:

- `VITE_ZERO_CACHE_URL=http://localhost:4848`
- `VITE_API_URL=http://localhost:3001`

If you want to be explicit, create `apps/web/.env.local`:

```bash
VITE_ZERO_CACHE_URL=http://localhost:4848
VITE_API_URL=http://localhost:3001
```

For Pusher Channels to work locally, you also need:

```bash
VITE_PUSHER_KEY=<your_pusher_key>
VITE_PUSHER_CLUSTER=<your_pusher_cluster>
```

And in the root `.env` for the API:

```bash
PUSHER_APP_ID=<your_pusher_app_id>
PUSHER_KEY=<your_pusher_key>
PUSHER_SECRET=<your_pusher_secret>
PUSHER_CLUSTER=<your_pusher_cluster>
```

## Environment Variables

### Frontend variables

The frontend only exposes Vite-prefixed variables to browser code.

#### `VITE_ZERO_CACHE_URL`

- Required for production
- URL of the Zero cache service
- Example local value: `http://localhost:4848`
- Example production value: `https://<zero-domain>`

#### `VITE_API_URL`

- Required for production
- Base URL of the API service (used for Pusher auth, presence heartbeats, admin status)
- Example local value: `http://localhost:3001`
- Example production value: `https://<api-domain>`

#### `VITE_PUSHER_KEY`

- Required for production
- Pusher Channels app key (from dashboard.pusher.com)

#### `VITE_PUSHER_CLUSTER`

- Required for production
- Pusher Channels cluster (e.g. `us2`, `eu`, `ap1`)

#### `VITE_STYLE_ONLY`

- Optional
- If set to `true`, the app renders the style preview route instead of the full realtime app

### API variables

#### `DATABASE_URL`

- Primary Postgres connection string for the API service

#### `ZERO_UPSTREAM_DB`

- Fallback DB source used by the API database provider if `DATABASE_URL` is absent
- also required by the Zero service itself

#### `PORT` / `API_PORT`

- API listen port
- `PORT` is preferred by many hosting platforms

#### `NODE_ENV`

- Standard runtime environment hint

#### `CLEANUP_SECRET`

- Bearer token required for manual cleanup endpoint access

#### `PUSHER_APP_ID`

- Pusher Channels app ID (from dashboard.pusher.com)

#### `PUSHER_KEY`

- Pusher Channels app key

#### `PUSHER_SECRET`

- Pusher Channels app secret

#### `PUSHER_CLUSTER`

- Pusher Channels cluster (e.g. `us2`, `eu`, `ap1`)

#### `DB_STATUS_KEY`

- Optional database sentinel key checked by the footer status probe
- Defaults to `footer`

#### `DB_STATUS_EXPECTED_VALUE`

- Optional database sentinel value checked by the footer status probe
- Defaults to `ok`
- If the row exists but the value does not match, the footer shows `Unknown`

### Zero service variables

For deployed Zero cache:

- `ZERO_UPSTREAM_DB`
- `ZERO_QUERY_URL`
- `ZERO_MUTATE_URL`
- `ZERO_ADMIN_PASSWORD`
- optionally `ZERO_CVR_DB`
- optionally `ZERO_CHANGE_DB`

Important constraint:

- do not define `ZERO_PORT` as the literal string `"$PORT"` on Railway
- Railway does not shell-expand env values in that way

## Build, Typecheck, Test, and Database Tasks

At the repository root:

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm db:push
pnpm db:generate
pnpm db:studio
```

### What these do

#### `pnpm dev`

Runs the `dev` script in workspace packages in parallel through Turbo.

#### `pnpm build`

Runs workspace builds through Turbo.

- web: Vite production build
- api: TypeScript compile to `dist`
- shared: TypeScript type validation through its build script

#### `pnpm typecheck`

Runs package-level TypeScript checks.

#### `pnpm test`

Runs package `vitest` scripts through Turbo.

#### `pnpm lint`

Currently present at the workspace level, but linting is effectively a placeholder right now. The package scripts currently print `No lint configured yet` rather than running a real linter.

#### Database tasks

- `pnpm db:push` applies schema changes to the target database
- `pnpm db:generate` generates Drizzle migration artifacts
- `pnpm db:studio` opens Drizzle Studio

### Footer database status sentinel

The footer status now checks the API's `/debug/build-info` response, and that API route performs a direct Postgres read against a sentinel row in the `status` table.

The status logic is:

- `Operational` when the database is reachable and `status.key = DB_STATUS_KEY` matches `DB_STATUS_EXPECTED_VALUE`
- `Unknown` when the database is reachable but the row is missing or the value does not match
- `Offline` when the API cannot reach Postgres at all

Recommended setup:

1. Push the latest schema:

```bash
pnpm db:push
```

2. Insert or upsert the sentinel row:

```sql
INSERT INTO status (key, value, updated_at)
VALUES ('footer', 'ok', EXTRACT(EPOCH FROM NOW())::bigint * 1000)
ON CONFLICT (key)
DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = EXCLUDED.updated_at;
```

3. Set API environment variables:

```bash
DB_STATUS_KEY=footer
DB_STATUS_EXPECTED_VALUE=ok
```

If you want to force the footer into the `Unknown` state for testing, update the row to a different value than `DB_STATUS_EXPECTED_VALUE`.

## Deployment

The intended production architecture is:

- frontend on Vercel
- API service on Railway
- Zero cache on Railway as a separate service
- Postgres on Railway Postgres or Neon

### Architecture at deploy time

```text
Browser
  |
  |  HTTPS (static SPA)
  v
Vercel: apps/web
  |                          Pusher Channels
  |  HTTPS for presence       (admin broadcasts,
  |  heartbeat + Pusher auth   targeted messages)
  |  Zero cache URL for          |
  |  realtime sync               v
  v                          Pusher Cloud
Railway API -----------------------> Postgres
  ^                                    ^
  |                                    |
  +----------- Railway Zero -----------+
```

### Deploying the frontend on Vercel

The repo already includes [vercel.json](vercel.json) with the correct monorepo settings.

Current Vercel config:

- install command: `pnpm install --frozen-lockfile`
- build command: `pnpm --filter @games/web build`
- output directory: `apps/web/dist`
- SPA rewrite to `/index.html`

#### Vercel setup steps

1. Import the GitHub repository into Vercel.
2. Keep the project root at the repository root.
3. Confirm the build settings match [vercel.json](vercel.json).
4. Add the required environment variables.

Required Vercel variables:

```bash
VITE_ZERO_CACHE_URL=https://<zero-domain>
VITE_API_URL=https://<api-domain>
VITE_PUSHER_KEY=<pusher_key>
VITE_PUSHER_CLUSTER=<pusher_cluster>
```

#### Why the rewrite matters

Without the rewrite, deep links like `/imposter/<id>` or `/chain/<id>` will 404 when refreshed directly in the browser.

### Deploying the API on Railway

The repo includes [railway.toml](railway.toml).

Current Railway config in the repo:

- builder: Nixpacks
- build command: `pnpm --filter @games/api build`
- start command: `pnpm --filter @games/api exec tsx src/index.ts`
- healthcheck path: `/health`

That means the current Railway deployment starts the TypeScript entrypoint through `tsx` even though a compiled `dist` build is also available. This works, but you should be aware of it because it differs from a stricter `node dist/index.js` production model.

#### Railway API environment variables

```bash
NODE_ENV=production
DATABASE_URL=<postgres_url>
CLEANUP_SECRET=<strong_secret>
PUSHER_APP_ID=<pusher_app_id>
PUSHER_KEY=<pusher_key>
PUSHER_SECRET=<pusher_secret>
PUSHER_CLUSTER=<pusher_cluster>
```

#### API service validation checklist

After deploy, verify:

- `GET https://<api-domain>/health` returns `{ "ok": true }`
- `GET https://<api-domain>/debug/build-info` returns metadata JSON
- Pusher auth endpoint `POST https://<api-domain>/api/pusher/auth` is reachable

### Deploying Zero cache on Railway

Zero should be deployed as its own service, separate from the API service.

Recommended start command:

```bash
pnpm dlx @rocicorp/zero@0.25.13 zero-cache --port "$PORT"
```

Required Zero service environment variables:

```bash
NODE_ENV=production
ZERO_UPSTREAM_DB=<postgres_url>
ZERO_QUERY_URL=https://<api-domain>/api/zero/query
ZERO_MUTATE_URL=https://<api-domain>/api/zero/mutate
ZERO_ADMIN_PASSWORD=<strong_secret>
```

Optional variables:

```bash
ZERO_CVR_DB=<postgres_url>
ZERO_CHANGE_DB=<postgres_url>
```

#### Zero deployment requirements

- the upstream Postgres endpoint must support `wal_level=logical`
- use a direct Postgres endpoint rather than a transaction pooler for `ZERO_UPSTREAM_DB`
- `VITE_ZERO_CACHE_URL` in Vercel must point at the Zero public domain

### Database deployment notes

You can use either:

- Railway Postgres
- Neon

Requirements regardless of provider:

- direct connection string available to the API
- direct connection string available to Zero
- logical replication support for the Zero upstream DB path

### End-to-end production setup sequence

1. Push the repository to GitHub.
2. Provision Postgres.
3. Deploy the API service to Railway.
4. Deploy the Zero cache service to Railway.
5. Configure the Zero service with the API query and mutate URLs.
6. Deploy the web app to Vercel.
7. Configure Vercel with the Zero cache URL, API URL, and Pusher key/cluster.
8. Open the web app and run smoke tests.

### Smoke test checklist after deploy

1. Open the production web app.
2. Create an Imposter room.
3. Create a Password room.
4. Create a Chain Reaction room.
5. Create a Shade Signal room.
6. Join from a second browser tab or second device.
7. Verify that player presence updates.
8. Verify that game actions propagate in near realtime.
9. Verify `/health` and `/debug/build-info` on the API.
10. Verify the Zero service is reachable and not returning 502s.

### Rollback approach

- Vercel: promote the previous successful frontend deployment
- Railway API: rollback to the previous working deployment
- Railway Zero: rollback independently if only the cache service broke
- Database: restore from backup if the issue is schema or data related

## Operational Notes

### Connection debugging

The frontend includes connection-debug plumbing that tracks:

- Zero connection state
- Zero online/offline events
- API heartbeat latency
- API metadata probe status and latency

This is useful when diagnosing issues that otherwise look like generic “realtime is broken” symptoms.

### Presence semantics

Presence is inferred from recent HTTP heartbeats (every 60 seconds) rather than a durable authentication/session framework. If you change the heartbeat cadence or timeout assumptions, make sure to update both:

- client heartbeat timing in `usePresenceSocket`
- backend stale/presence cutoff logic

### Cleanup semantics

The cleanup job uses two broad windows:

- a stale window that ends abandoned games
- a delete window that removes older ended games and stale sessions

If you extend reconnect tolerance, you will likely also want to revisit those cleanup constants.

## Known Constraints

- Authentication is browser-local identity only; there is no account system.
- Linting is not fully configured yet even though `lint` scripts exist.
- Game state is heavily JSON-column based, which is pragmatic for mutable party-game state but less ideal for analytical querying.
- The Railway config currently starts the API through `tsx src/index.ts` instead of `node dist/index.js`.
- Shade Signal is fully implemented with desktop and mobile UI, including leader picking, hard mode, and auto-advance timers.

## Mobile UI

The application includes a fully separate mobile UI that activates automatically on screens 768px or narrower. The mobile UI lives entirely under `apps/web/src/mobile/` and does not share any page components with the desktop UI — this is intentional to prevent mobile changes from regressing the desktop experience.

### Architecture

- **Detection**: A `useIsMobile` hook (in `apps/web/src/hooks/useIsMobile.ts`) uses `matchMedia` via `useSyncExternalStore` to detect viewport width at the 768px breakpoint.
- **Routing**: Each desktop page component checks `useIsMobile()` and returns the corresponding mobile component early if true. The desktop code path is never reached on mobile.
- **Layout**: `MobileLayout.tsx` provides the mobile app shell with a bottom navigation bar (Home, Chat, Info, Options) and bottom-sheet modals.
- **Styling**: All mobile CSS is in `apps/web/src/mobile/mobile.css`, using the `m-` prefix for all class names. No Tailwind utility classes are used in mobile components — all styling is custom CSS with the same CSS variables as desktop.

### File Structure

```text
apps/web/src/mobile/
├─ MobileLayout.tsx              # App shell with bottom nav + sheet modals
├─ mobile.css                    # All mobile-specific CSS (~2100+ lines, m-* prefix)
├─ components/
│  ├─ BottomSheet.tsx            # Reusable bottom sheet overlay
│  ├─ MobileChatSheet.tsx        # Chat bottom sheet
│  ├─ MobileGameHeader.tsx       # Compact game header with code + phase
│  ├─ MobileInfoSheet.tsx        # Info/rules bottom sheet
│  └─ MobileOptionsSheet.tsx     # Options + dev demo tools
└─ pages/
   ├─ MobileHomePage.tsx         # Home, join, create game
   ├─ MobileImposterPage.tsx     # Imposter game (all phases)
   ├─ MobilePasswordBeginPage.tsx # Password pre-round
   ├─ MobilePasswordGamePage.tsx  # Password active rounds
   ├─ MobilePasswordResultsPage.tsx # Password results
   ├─ MobileChainReactionPage.tsx # Chain Reaction (all phases)
   └─ MobileShadeSignalPage.tsx   # Shade Signal (all phases)
```

### Development Guidelines

- **Never** modify desktop components to accommodate mobile. Mobile gets its own components.
- All mobile class names use the `m-` prefix to avoid collisions with desktop CSS.
- When adding a new game, create a corresponding `Mobile<Game>Page.tsx` in the mobile pages directory.
- Use the dev demo buttons in the mobile Options sheet (visible in `DEV` mode only) to quickly test any game phase on mobile.
- Run `npx vite build` to verify both desktop and mobile code compile cleanly.

## Reference Docs

- [docs/deployment-vercel-railway.md](docs/deployment-vercel-railway.md)
- [docs/game-chain-reaction.md](docs/game-chain-reaction.md)
- [docs/game-location-signal.md](docs/game-location-signal.md)
- [docs/game-shade-signal.md](docs/game-shade-signal.md)

## Quick Start

If you just want to get the repo running locally:

```bash
pnpm install
docker compose up -d
pnpm db:push
pnpm dev
```

Then open `http://localhost:5173`.

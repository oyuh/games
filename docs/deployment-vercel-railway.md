# Deployment + Automation Guide (Vercel + Railway)

This guide is for deploying this monorepo with:
- **Web (React/Vite)** on **Vercel**
- **API (Hono/Node)** on **Railway**
- **Zero Cache** on **Railway** (separate service)
- **Postgres** on Railway Postgres or Neon
- **Pusher Channels** for admin broadcasts and targeted messaging

It is written as a setup runbook so you can wire everything once and then get automated deploys from Git pushes.

---

## 1) Deployment architecture

- `apps/web` → static frontend on Vercel
- `apps/api` → Node server on Railway (serves HTTP API, Pusher auth, presence heartbeats)
- `zero-cache` → dedicated Railway service running `@rocicorp/zero`
- DB → Postgres (`DATABASE_URL`)
- Zero cache URL used by web client via `VITE_ZERO_CACHE_URL`

---

## 2) One-time prerequisites

1. Push this repo to GitHub.
2. Ensure `pnpm-lock.yaml` is committed.
3. Decide environments:
   - `main` branch = production
   - optional `develop` branch = staging

---

## 3) Railway setup (API + Zero + DB)

## 3.1 Create project and services

1. In Railway, create a new project from this GitHub repo.
2. Add an **API service** (from repo).
3. Add a **Zero service** (from repo, same project).
4. Add a **Postgres** plugin/service (or use Neon external DB).

### API service commands

- **Install Command**
  - `pnpm install --frozen-lockfile`
- **Build Command**
  - `pnpm --filter @games/api build`
- **Start Command**
  - `pnpm --filter @games/api start`

### Zero service commands

- **Install Command**
  - `pnpm install --frozen-lockfile`
- **Build Command**
  - (empty)
- **Start Command**
  - `pnpm dlx @rocicorp/zero@0.25.13 zero-cache --port "$PORT"`

> Important: do **not** set `ZERO_PORT` in Railway variables. Railway does not shell-expand env values, so `ZERO_PORT="$PORT"` is treated as a literal string and crashes with `Invalid input for ZERO_PORT: "$PORT"`.

## 3.2 API environment variables (Railway)

Set these in Railway **API** service:

```bash
NODE_ENV=production

# Database
DATABASE_URL=<railway_or_neon_postgres_url>

# Pusher Channels (from dashboard.pusher.com → Channels → App Keys)
PUSHER_APP_ID=<your_app_id>
PUSHER_KEY=<your_key>
PUSHER_SECRET=<your_secret>
PUSHER_CLUSTER=<your_cluster>

# Cleanup
CLEANUP_SECRET=<strong_secret>
```

## 3.3 Zero environment variables (Railway)

Set these in Railway **Zero** service:

```bash
NODE_ENV=production

ZERO_UPSTREAM_DB=<railway_or_neon_postgres_url>
ZERO_QUERY_URL=https://<api-domain>/api/zero/query
ZERO_MUTATE_URL=https://<api-domain>/api/zero/mutate
ZERO_ADMIN_PASSWORD=<strong_secret>

# Optional explicit overrides (if omitted, Zero defaults change/cvr DB to upstream)
# ZERO_CVR_DB=<railway_or_neon_postgres_url>
# ZERO_CHANGE_DB=<railway_or_neon_postgres_url>
```

Postgres requirements for Zero:

- `wal_level` must be `logical`
- Use a direct Postgres endpoint for `ZERO_UPSTREAM_DB` (avoid transaction pooler endpoints)

## 3.4 Networking / domains

1. Generate Railway domains for both services:
   - API domain: `https://<api-domain>`
   - Zero domain: `https://<zero-domain>`
2. Confirm health endpoints:
   - API: `GET /health` → `{ "ok": true }`
   - Zero: `GET /` should return a non-502 response once running.

## 3.5 Presence and broadcasts

Presence is handled via HTTP heartbeats (`POST /api/presence/heartbeat`) every 60 seconds from the client.

Admin broadcasts (toasts, kicks, custom status) are delivered through Pusher Channels. The API triggers events on Pusher, and clients subscribe using `pusher-js`. Channel authentication goes through `POST /api/pusher/auth`.

No WebSocket servers are hosted by the API service.

---

## 4) Vercel setup (Web)

1. Create a Vercel project from the same GitHub repo.
2. Keep project root at monorepo root.
3. Configure build settings:
   - **Install Command**: `pnpm install --frozen-lockfile`
   - **Build Command**: `pnpm --filter @games/web build`
   - **Output Directory**: `apps/web/dist`

4. Add Vercel env vars:

```bash
VITE_ZERO_CACHE_URL=https://<zero-domain>
VITE_API_URL=https://<api-domain>
VITE_PUSHER_KEY=<pusher_key>
VITE_PUSHER_CLUSTER=<pusher_cluster>
```

5. Add SPA fallback rewrite in Vercel project settings (or `vercel.json`):
   - Source: `/(.*)`
   - Destination: `/index.html`

---

## 5) Automation flow (recommended)

After setup, use native Git-based automation:

- **Vercel**
  - Preview deploy on every PR
  - Production deploy on merge to `main`
- **Railway**
  - Auto-deploy API + Zero services on merge to `main`

Recommended branch policy:
1. Open PR → Vercel preview auto-builds
2. Merge to `main` → Vercel + Railway production deploy automatically

---

## 6) Optional: deploy hooks for controlled releases

If you prefer “manual promote” while keeping automation:

1. Disable auto-deploy on `main`.
2. Create deploy hooks in both platforms.
3. Trigger hooks from CI only after checks pass.

Example CI idea:
- Run `pnpm typecheck`
- Run `pnpm build`
- If green, call Railway + Vercel deploy hooks

---

## 7) Post-deploy smoke test checklist

Run after each production deploy:

1. Open web URL.
2. Create/join Imposter room.
3. Create/join Password room.
4. Confirm realtime updates across two browser tabs.
5. Confirm presence heartbeats update session liveness.
6. Confirm admin broadcasts (toasts) arrive via Pusher.
7. Confirm timers advance phases correctly.
7. Confirm API health endpoint returns OK.
8. Confirm Zero endpoint responds and no `ZERO_PORT` parse errors in logs.

---

## 8) Rollback process

- **Vercel**: promote previous successful deployment.
- **Railway**: rollback API and Zero services from Deployments tab.
- If issue is DB migration-related, restore DB backup before re-deploy.

---

## 9) Common gotchas

- Do not define `ZERO_PORT` as `"$PORT"` in Railway variables.
- `VITE_API_URL` must point to your Railway API domain (e.g. `https://<api-domain>`).
- `VITE_PUSHER_KEY` and `VITE_PUSHER_CLUSTER` must match your Pusher Channels app (not Pusher Beams — they are different products).
- `VITE_ZERO_CACHE_URL` must point to the Zero service public domain.
- If deep links (`/imposter/:id`) 404 on refresh, SPA rewrite is missing.
- If Zero logs show `wal_level=replica`, fix Postgres to `wal_level=logical` on the exact upstream endpoint.

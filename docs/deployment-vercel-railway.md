# Deployment + Automation Guide (Vercel + Railway)

This guide is for deploying this monorepo with:
- **Web (React/Vite)** on **Vercel**
- **API + Presence WebSocket (Hono/Node)** on **Railway**
- **Postgres** on Railway Postgres or Neon

It is written as a setup runbook so you can wire everything once and then get automated deploys from Git pushes.

---

## 1) Deployment architecture

- `apps/web` → static frontend on Vercel
- `apps/api` → Node server on Railway (serves HTTP API + Presence WS)
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

## 3) Railway setup (API + DB)

## 3.1 Create project and service

1. In Railway, create a new project from this GitHub repo.
2. Add a **service** for API (from repo).
3. Add a **Postgres** plugin/service (or use Neon external DB).
4. Configure API service commands:
   - **Install Command**
     - `pnpm install --frozen-lockfile`
   - **Build Command**
     - `pnpm --filter @games/api build`
   - **Start Command**
     - `node apps/api/dist/apps/api/src/index.js`

> Note: Start command uses the current TypeScript output path.

## 3.2 API environment variables (Railway)

Set these in Railway API service:

```bash
NODE_ENV=production

# API ports (Railway provides PORT automatically for HTTP)
API_PORT=${{PORT}}
PRESENCE_PORT=3002

# Database
DATABASE_URL=<railway_or_neon_postgres_url>
ZERO_UPSTREAM_DB=<same_as_DATABASE_URL>
ZERO_CVR_DB=<same_as_DATABASE_URL>
ZERO_CHANGE_DB=<same_as_DATABASE_URL>

# Zero/cache/auth
ZERO_CACHE_URL=<your_zero_cache_url>
ZERO_ADMIN_PASSWORD=<strong_secret>
```

## 3.3 Networking / domains

1. Generate Railway domain for API service (example: `https://games-api.up.railway.app`).
2. Confirm health endpoint:
   - `GET /health`
   - Expect `{ "ok": true }`.

## 3.4 Presence WebSocket

You have two options:

- **Option A (recommended): same domain + reverse proxy path**
  - Route WS to `/presence` internally to `PRESENCE_PORT`.
  - Client uses `wss://<api-domain>/presence`.
- **Option B: separate WS domain/service**
  - Expose WS service/port separately.
  - Client uses that `wss://...` URL directly.

If Railway routing setup for dual ports is inconvenient, split Presence into a second Railway service.

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
VITE_ZERO_CACHE_URL=<your_zero_cache_url>
VITE_PRESENCE_WS_URL=wss://<your_presence_host_or_path>
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
  - Auto-deploy API service on merge to `main`

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
5. Confirm disconnect/reconnect updates presence.
6. Confirm timers advance phases correctly.
7. Confirm API health endpoint returns OK.

---

## 8) Rollback process

- **Vercel**: promote previous successful deployment.
- **Railway**: rollback to previous deployment from Deployments tab.
- If issue is DB migration-related, restore DB backup before re-deploy.

---

## 9) Common gotchas

- `VITE_PRESENCE_WS_URL` must be `wss://` in production.
- Ensure frontend can reach the same Zero cache URL/API environment intended for production.
- If deep links (`/imposter/:id`) 404 on refresh, SPA rewrite is missing.
- Keep `DATABASE_URL` and `ZERO_*_DB` aligned unless intentionally split.

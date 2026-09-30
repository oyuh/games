# Admin (Next 16) image. Mirrors apps/api's Dockerfile but builds and runs the
# admin app. Build context is the repo root so the bun workspace resolves and
# @games/shared installs like it does locally.
FROM oven/bun:1 AS base
WORKDIR /app

# Workspace root + the manifests this app needs, for dependency resolution.
COPY package.json bun.lock* ./
COPY apps/admin/package.json apps/admin/
COPY packages/shared/package.json packages/shared/

# Install the whole workspace (dev deps included - next build needs them).
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# Source.
COPY packages/shared/ packages/shared/
COPY apps/admin/ apps/admin/

# Build the Next app.
RUN bun run --filter @games/admin build

# next start reads PORT; keep it in sync with the custom domain's target port.
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["bun", "run", "--filter", "@games/admin", "start"]

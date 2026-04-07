FROM oven/bun:1 AS base
WORKDIR /app

# Copy workspace root files
COPY package.json bun.lock* ./

# Copy package manifests for dependency resolution
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

# Install dependencies
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# Copy source code
COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/

# Expose port
EXPOSE 3001

# Run the API server
CMD ["bun", "apps/api/src/index.ts"]

# syntax=docker/dockerfile:1

# Build stage: full install for workspace + compile @forge/ai to dist.
FROM oven/bun:1 AS build
WORKDIR /app
COPY bun.lock package.json ./
COPY packages/gateway/package.json packages/gateway/
COPY packages/ai/package.json packages/ai/
RUN bun install --frozen-lockfile
COPY packages/gateway packages/gateway
COPY packages/ai packages/ai
RUN bun run --cwd packages/ai build

# Runtime stage: production deps + compiled dist for the workspace packages.
FROM oven/bun:1-slim AS runtime
WORKDIR /app
COPY bun.lock package.json ./
COPY packages/gateway/package.json packages/gateway/
COPY packages/ai/package.json packages/ai/
COPY packages/gateway packages/gateway
COPY packages/ai packages/ai
RUN bun install --production --frozen-lockfile
ENV PORT=8787
EXPOSE 8787
CMD ["bun", "run", "./packages/gateway/src/cli.ts"]
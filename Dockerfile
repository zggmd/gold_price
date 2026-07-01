# syntax=docker/dockerfile:1
#
# Multi-stage, multi-arch build for the gold-price service.
# Build for multiple architectures with buildx:
#   docker buildx build --platform linux/amd64,linux/arm64 \
#     -t ghcr.io/yourorg/gold-price:latest --push .
#
# Local single-arch build:
#   docker build -t gold-price .

# ---------------------------------------------------------------------------
# Builder: install deps (compiles the better-sqlite3 native addon for the
# target arch), then produce Next.js standalone output.
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS builder

# better-sqlite3 ships prebuilds for common glibc arches, but arm64 under buildx
# may need to compile from source — make the toolchain available.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
# `npm install` (not `npm ci`): Tailwind 3.4's tree carries a benign picomatch
# dedup quirk (fdir wants picomatch@^4 but is deduped to @2). Strict `npm ci`
# rejects that lockfile state in some npm versions; `npm install` reconciles it.
RUN npm install --no-audit --no-fund

COPY . .

# Prevent the background poller from starting (and holding the event loop)
# during `next build`. Cleared at runtime below.
ENV DISABLE_GOLD_POLLER=true
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------------------------------------------------------------------------
# Runner: lean image carrying only the standalone server + its native binding.
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Reachable outside the container.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# SQLite file lives here — mount a volume to persist data across restarts.
ENV DATA_DIR=/app/data

WORKDIR /app

# Non-root user for the running server.
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs \
    && mkdir -p /app/data \
    && chown -R nextjs:nodejs /app

# Standalone server (includes the traced better-sqlite3 native binding thanks to
# outputFileTracingIncludes in next.config.mjs).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

# Persist the SQLite DB (and its WAL/SHM siblings) across container restarts.
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/prices/latest').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

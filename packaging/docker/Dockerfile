# SPDX-License-Identifier: AGPL-3.0-or-later
# Multi-stage build: build with Bun, run with Bun on a minimal base.

FROM oven/bun:1.3.11 AS build
WORKDIR /app

# Install deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build SvelteKit (adapter-node output in build/)
# --bun forces Bun's module resolver so bun:sqlite is understood during build
RUN bun run build

# Production stage
FROM oven/bun:1.3.11-slim

WORKDIR /app

# Copy built output (adapter-node: index.js + handler.js + client/ + server/)
COPY --from=build /app/build ./build

# Copy council and persona JSON files for seeding
COPY --from=build /app/councils ./councils
COPY --from=build /app/personas ./personas

# Data directory — mount a volume here for persistence
ENV AHWA_DATA_DIR=/data
ENV PORT=3000
VOLUME /data

EXPOSE 3000

CMD ["bun", "build/index.js"]

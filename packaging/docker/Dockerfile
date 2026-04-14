# SPDX-License-Identifier: AGPL-3.0-or-later
# Multi-stage build: build with Bun, run with Bun on a minimal base.

FROM oven/bun:1 AS build
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
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Bun runtime
COPY --from=build /usr/local/bin/bun /usr/local/bin/bun

# Copy built output (adapter-node produces build/)
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

# Copy council and persona JSON files for seeding
COPY --from=build /app/councils ./councils
COPY --from=build /app/personas ./personas

# Data directory — mount a volume here for persistence
ENV AHWA_DATA_DIR=/data
ENV PORT=3000
VOLUME /data

EXPOSE 3000

CMD ["bun", "build/index.js"]

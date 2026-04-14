# SPDX-License-Identifier: AGPL-3.0-or-later
# Multi-stage build: compile with Bun into a standalone binary.

FROM oven/bun:1.3.11 AS build
WORKDIR /app

# Install deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build SvelteKit then compile to standalone binary
# --bun forces Bun's module resolver so bun:sqlite is understood during build
RUN bun run build && bun build --compile build/index.js --outfile ahwa

# Production stage — no Bun, no Node, just the binary
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the standalone binary
COPY --from=build /app/ahwa ./ahwa

# Copy council and persona JSON files for seeding
COPY --from=build /app/councils ./councils
COPY --from=build /app/personas ./personas

# SvelteKit adapter-node serves static assets from build/client
COPY --from=build /app/build/client ./build/client

# Data directory — mount a volume here for persistence
ENV AHWA_DATA_DIR=/data
ENV PORT=3000
VOLUME /data

EXPOSE 3000

CMD ["./ahwa"]

# SPDX-License-Identifier: AGPL-3.0-or-later
# Multi-stage build: compile with Bun, run the binary standalone.

FROM oven/bun:1 AS build
WORKDIR /app

# Install deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build SvelteKit + compile to single binary
RUN bun run build

# Production stage — no Bun needed at runtime
FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

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

# Run with Bun (included in oven/bun image) — or if binary compiled:
# For now, use the adapter-node output with Bun
COPY --from=build /usr/local/bin/bun /usr/local/bin/bun
CMD ["bun", "build/index.js"]

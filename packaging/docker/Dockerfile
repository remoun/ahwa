# SPDX-License-Identifier: AGPL-3.0-or-later
# Multi-stage build: build with Bun, run with Bun on a minimal base.
#
# Bun version comes from the repo's .bun-version (single source of
# truth, also consumed by the YunoHost install script). Build with:
#
#   docker build --build-arg BUN_VERSION=$(cat .bun-version) \
#     -f packaging/docker/Dockerfile .
#
# .github/workflows/docker.yml passes the arg automatically.
ARG BUN_VERSION=1.3.12

FROM oven/bun:${BUN_VERSION} AS build
WORKDIR /app

# Install deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build SvelteKit (adapter-node output in build/)
# --bun forces Bun's module resolver so bun:sqlite is understood during build
RUN bun run build

# Production stage — copy the whole /app directory, which includes
# build/, node_modules/, councils/, personas/, package.json, etc.
FROM oven/bun:${BUN_VERSION}-slim

WORKDIR /app
COPY --from=build /app ./

# Data directory — mount a volume here for persistence
ENV AHWA_DATA_DIR=/data
ENV PORT=3000
VOLUME /data

EXPOSE 3000

# Use --bun so Bun's module resolver handles bun:sqlite at runtime
CMD ["bun", "--bun", "build/index.js"]

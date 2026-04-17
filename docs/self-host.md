# Self-Hosting Ahwa

## Prerequisites

- Docker and Docker Compose, OR
- [Bun](https://bun.sh) runtime (v1.0+)
- At least one configured LLM provider (see
  [Environment variables](#environment-variables) below). Without one,
  Ahwa will refuse to start a deliberation with a clear error message.

## Docker (recommended)

```bash
# Grab the compose file
curl -O https://raw.githubusercontent.com/remoun/ahwa/main/packaging/docker/compose.yaml

# Create your env file
cat > .env <<EOF
ANTHROPIC_API_KEY=your-key-here
# Or use OpenAI:
# OPENAI_API_KEY=your-key-here
# Or OpenRouter:
# OPENROUTER_API_KEY=your-key-here
EOF

# Start
docker compose up -d
```

Ahwa is now running at `http://localhost:3000`.

## From source

```bash
git clone https://github.com/remoun/ahwa && cd ahwa
bun install
cp .env.example .env   # edit with your API key(s)
bun run dev             # http://localhost:5173
```

For production, build and run:

```bash
bun run build
PORT=3000 bun build/index.js
```

## Reverse proxy with Caddy

Ahwa has no built-in auth (by design). For a personal instance, put it
behind Caddy with basic auth:

```caddyfile
ahwa.example.com {
    basicauth {
        your-username $2a$14$... # bcrypt hash from: caddy hash-password
    }
    reverse_proxy localhost:3000
}
```

## TLS

Caddy handles TLS automatically with Let's Encrypt. No configuration
needed beyond the Caddyfile above.

## Backups

Ahwa stores all data in a single SQLite file at `$AHWA_DATA_DIR/ahwa.db`
(defaults to `./data/ahwa.db`). Back it up by copying the file while
Ahwa is stopped, or use SQLite's `.backup` command for a hot backup.

## Data directory

Set `AHWA_DATA_DIR` to control where the database lives:

| Environment         | Default                       |
| ------------------- | ----------------------------- |
| Dev (`bun run dev`) | `./data`                      |
| Docker              | `/data` (mounted as a volume) |
| YunoHost            | Set by install script         |

## Environment variables

| Variable                | Required | Description                                                                                                                                                                                         |
| ----------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                  | No       | HTTP port (default: 3000)                                                                                                                                                                           |
| `AHWA_DATA_DIR`         | No       | Data directory path                                                                                                                                                                                 |
| `AHWA_SHARE_SECRET`     | No       | Hex secret used to sign share-link tokens. If unset, a random one is generated at startup — fine for dev, but links will break across restarts in production. Generate with `openssl rand -hex 32`. |
| `ANTHROPIC_API_KEY`     | No\*     | Anthropic API key                                                                                                                                                                                   |
| `OPENAI_API_KEY`        | No\*     | OpenAI API key                                                                                                                                                                                      |
| `OPENROUTER_API_KEY`    | No\*     | OpenRouter API key (includes a free tier — easiest to start with)                                                                                                                                   |
| `OLLAMA_BASE_URL`       | No\*     | Ollama URL, e.g. `http://localhost:11434/api`. Must be set explicitly — not inferred — so hosted deploys without a reachable Ollama don't silently fail.                                            |
| `AHWA_ANTHROPIC_MODEL`  | No       | Override the default Anthropic model (default: `claude-sonnet-4-20250514`). Applies only when no council has an explicit `model_config`.                                                            |
| `AHWA_OPENAI_MODEL`     | No       | Override the default OpenAI model (default: `gpt-4o`). Same precedence as above.                                                                                                                    |
| `AHWA_OPENROUTER_MODEL` | No       | Override the default OpenRouter model (default: `anthropic/claude-sonnet-4-6`). Useful for trying a cheaper or different-vendor model without a code change.                                        |
| `AHWA_OLLAMA_MODEL`     | No       | Override the default Ollama model (default: `llama3.1`). Handy when you pulled a different local model and don't want to edit each council.                                                         |

\*At least one of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, or `OLLAMA_BASE_URL` must be set.

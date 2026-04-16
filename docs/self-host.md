# Self-Hosting Ahwa

## Prerequisites

- Docker and Docker Compose, OR
- [Bun](https://bun.sh) runtime (v1.0+)
- An API key for at least one LLM provider (or Ollama for local models)

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

| Variable             | Required | Description                                        |
| -------------------- | -------- | -------------------------------------------------- |
| `PORT`               | No       | HTTP port (default: 3000)                          |
| `AHWA_DATA_DIR`      | No       | Data directory path                                |
| `ANTHROPIC_API_KEY`  | No\*     | Anthropic API key                                  |
| `OPENAI_API_KEY`     | No\*     | OpenAI API key                                     |
| `OPENROUTER_API_KEY` | No\*     | OpenRouter API key                                 |
| `OLLAMA_BASE_URL`    | No       | Ollama URL (default: `http://localhost:11434/api`) |

\*At least one provider must be configured, or Ollama must be running locally.

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

## YunoHost

Install via the dedicated packaging repo:

```bash
sudo yunohost app install https://github.com/remoun/ahwa_ynh
```

SSO is wired through SSOwat — log in via the YunoHost portal and
the resulting party gets your YNH user as its identity. See
[ahwa_ynh](https://github.com/remoun/ahwa_ynh) for the package
sources, dev loop, and CI.

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

| Environment         | Default                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| Dev (`bun run dev`) | `./data`                                                                   |
| Docker              | `/data` (mounted as a volume)                                              |
| YunoHost            | Set by install script (see [ahwa_ynh](https://github.com/remoun/ahwa_ynh)) |

## Environment variables

### Runtime

| Variable            | Required | Description                                                                                                                                                                                         |
| ------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`              | No       | HTTP port (default: 3000)                                                                                                                                                                           |
| `AHWA_DATA_DIR`     | No       | Data directory path                                                                                                                                                                                 |
| `AHWA_SHARE_SECRET` | No       | Hex secret used to sign share-link tokens. If unset, a random one is generated at startup — fine for dev, but links will break across restarts in production. Generate with `openssl rand -hex 32`. |

### LLM providers

At least one provider must be configured via its API key (or base URL for
Ollama). The matching `AHWA_{PROVIDER}_MODEL` override is optional and only
applies when the council being run has no explicit `model_config`.

| Variable                | Required | Description                                                                                                                                                                                                                                                                 |
| ----------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`     | No\*     | Anthropic API key                                                                                                                                                                                                                                                           |
| `AHWA_ANTHROPIC_MODEL`  | No       | Override the default Anthropic model (default: `claude-sonnet-4-20250514`)                                                                                                                                                                                                  |
| `OPENAI_API_KEY`        | No\*     | OpenAI API key                                                                                                                                                                                                                                                              |
| `AHWA_OPENAI_MODEL`     | No       | Override the default OpenAI model (default: `gpt-4o`)                                                                                                                                                                                                                       |
| `OPENROUTER_API_KEY`    | No\*     | OpenRouter API key (includes a free tier — easiest to start with)                                                                                                                                                                                                           |
| `AHWA_OPENROUTER_MODEL` | No       | Override the default OpenRouter model (default: `anthropic/claude-sonnet-4.6`)                                                                                                                                                                                              |
| `OLLAMA_BASE_URL`       | No\*     | Ollama URL, e.g. `http://localhost:11434/api`. Must be set explicitly — not inferred — so hosted deploys without a reachable Ollama don't silently fail.                                                                                                                    |
| `AHWA_OLLAMA_MODEL`     | No       | Override the default Ollama model (default: `llama3.1`)                                                                                                                                                                                                                     |
| `AHWA_SYNTHESIS_MODEL`  | No       | Use a different model for the synthesis turn only (the load-bearing output users act on). If unset, synthesis uses the same model as the persona turns. Example: `anthropic/claude-opus-4.7` on OpenRouter to spend a bit more on synthesis while keeping personas cheaper. |

\*At least one of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, or `OLLAMA_BASE_URL` must be set.

### Public-demo mode (only set these for an ahwa.app-style instance)

Most self-hosters do NOT want public-demo mode — it changes `/` from
"your tables" to a landing page with a public demo CTA, opens
`/api/demo/tables` to anonymous traffic, and runs a TTL sweep that
deletes demo tables. Per invariant #11, demo tables are excluded from
your owned-table queries; they live alongside your data on the same
SQLite file but are kept separate.

| Variable                           | Default   | Description                                                                                                                 |
| ---------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------- |
| `AHWA_PUBLIC_DEMO`                 | unset     | Set to `1` to render `/` as the public-demo landing page. Leave unset for normal self-host behavior.                        |
| `AHWA_DEMO_DAILY_TOKEN_CAP`        | `500000`  | Hard cap on demo tokens per UTC day. New demos refused (503) once today's pre-charged + reconciled total would exceed this. |
| `AHWA_DEMO_ESTIMATE_TOKENS`        | `5000`    | Per-demo pre-charge against the cap. Reconciled to actual tokens after the deliberation finishes.                           |
| `AHWA_DEMO_USD_PER_MILLION_TOKENS` | `0.75`    | $/M tokens used to compute the soft `cost_micro_usd` log alongside the enforced token cap. Adjust to match your demo model. |
| `AHWA_DEMO_RATE_BURST`             | `5`       | Per-IP rate-limit burst capacity (token-bucket).                                                                            |
| `AHWA_DEMO_RATE_PER_SECOND`        | `0.0167`  | Per-IP rate-limit refill rate (~1/min).                                                                                     |
| `AHWA_DEMO_TTL_HOURS`              | `24`      | Demo tables older than this are deleted on each cleanup sweep.                                                              |
| `AHWA_DEMO_SWEEP_MS`               | `3600000` | Cleanup sweep interval (default: hourly). Set lower in tests if needed.                                                     |

**About the cap math.** Pre-charge is atomic (single SQLite
transaction) so two parallel demos can't both pass the cap check;
reconcile fires after the deliberation closes, refunding the
estimate when actual tokens come in lower (and adding when they
come in higher). On stream errors / aborts the full pre-charge is
refunded — failed demos don't drain the cap.

**Demo council.** Demos are pinned to `councils/demo.json` (three
personas, single round, Claude Haiku 4.5). Caller-supplied council
IDs are ignored on `/api/demo/tables`. To use a cheaper or different
model, edit the council's `model_config` field.

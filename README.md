# Ahwa

**A private council of voices, around your table.**

Ahwa is a privacy-first, FOSS multi-persona deliberation tool. You set a
table, invite a council of AI personas, and pose a dilemma. The council
debates it across structured rounds. A synthesizer produces a recommendation
that preserves real disagreement rather than flattening it.

Inspired by [Moot](https://getmoot.app) and [Auralink](https://auralink.com),
but forkable, self-hostable, and built around user-owned data.

> *Ahwa* (قهوة) is Egyptian Arabic for coffee, and by extension the
> coffeehouse — where friends gather to think through problems together.
> Pronounced "AH-wah."

## Try it (coming soon)

Ahwa is not yet packaged for install. To try it from source:

```bash
git clone https://github.com/remoun/ahwa && cd ahwa
bun install
cp .env.example .env      # add your OpenRouter API key
bun run dev                # http://localhost:5173
```

Self-host via [Docker](#install-via-docker) and
[YunoHost](#install-via-yunohost) is planned for M1/M2.

## What it does

You describe a decision you're wrestling with. A council of AI personas —
each with a distinct worldview and voice — takes it on. They open with
their first takes. They cross-examine each other. A synthesizer reads the
whole deliberation and gives you back:

- What the council actually agreed on
- Where they genuinely disagreed, and why it matters
- A specific recommended next step
- How confident the synthesizer is, and what would change that

The defaults ship with two councils:

- **The Default Council** — Elder, Mirror, Engineer, Weaver, Instigator.
  A balanced five-persona set for any dilemma.
- **The Federation Council** — Federation Delegate, Ancestor, Organizer,
  Therapist, Trickster. Opinionated on purpose: collectivist, long-horizon,
  unafraid of the absurd. A demonstration of what a forked council looks
  like.

You can edit both, fork either, write your own from scratch, or combine
personas from the standalone `personas/` library. Councils are plain JSON.
Fork one, share it, put it in a GitHub repo for your friends.

## What makes it different

**Privacy by design.** No telemetry. No analytics. No phone-home. Not even
anonymous. Your tables and memory live on your server, encrypted at rest
(optional), synced across your devices end-to-end encrypted (optional).
When you self-host with your own API keys, Ahwa itself knows nothing about
you beyond what you type into it.

**Bring your own model.** Anthropic, OpenAI, OpenRouter, or a fully local
Ollama install. Switch providers per council. Run entirely offline if you
want.

**Memory that's yours.** Your memory file is plain markdown, editable by
hand, visible in the UI, exportable anytime. Personas that use it (like the
Historian, who remembers your patterns across time) read from it, but you
own it — not us, not the model provider.

**Two-party mediation.** Share a table with another person. You each talk
to the council separately, on your own time. The synthesizer sees both
sides. Raw turns stay party-scoped until you both opt in to share.

**Forkable councils, forkable personas.** The best councils will come from
the community, not from us. Ship JSON. Open a pull request. The tool
improves as its users shape it.

**AGPL-3.0.** Hosted forks stay open. No extractive re-licensing.

## What it isn't

Ahwa is not a therapist, a crisis resource, or a replacement for human
connection. It's a deliberation tool — a way to hear your own thinking
more clearly by hearing it argued from angles you wouldn't generate on
your own.

If you're in crisis, please reach out to a real person. In the US:
988 (Suicide and Crisis Lifeline). In the UK: Samaritans on 116 123.
Internationally: [findahelpline.com](https://findahelpline.com).

## Install via YunoHost

1. In your YunoHost admin panel, go to **Applications → Install**
2. Search for "Ahwa"
3. Click install, enter your domain, confirm
4. Set your Anthropic API key (or skip and configure Ollama later)
5. Done — Ahwa is running at your chosen domain, with Let's Encrypt TLS
   and SSOwat single sign-on already set up

## Install via Docker

```bash
# Grab the compose file
curl -O https://raw.githubusercontent.com/remoun/ahwa/main/packaging/docker/compose.yaml

# Create a data directory
mkdir -p ./ahwa-data

# Set your API key
export ANTHROPIC_API_KEY=your-key-here

# Run it
docker compose up -d
```

Ahwa is now running at `http://localhost:3000`. Point your reverse proxy
(Caddy recommended) at it. See [docs/self-host.md](./docs/self-host.md)
for TLS, backups, and running with Ollama for fully local operation.

## Install with Ollama (fully local)

```bash
# Install Ollama, pull a capable model
ollama pull qwen2.5:14b

# Point Ahwa at Ollama in your config
# See docs/ollama.md for the details
```

Everything runs on your machine. No external API calls. No costs beyond
the electricity.

## Development

```bash
git clone https://github.com/remoun/ahwa
cd ahwa
bun install
bun test          # red-green TDD enforced; see CLAUDE.md
bun run dev       # http://localhost:5173
```

See [CLAUDE.md](./CLAUDE.md) for architecture, invariants, and the
project's working-style contract.

## Writing your own council

A council is a JSON file with a name, a set of personas, a round structure,
and a synthesis prompt. The simplest way to write one is to copy
`councils/default.json` and edit. See [docs/councils.md](./docs/councils.md)
for the full schema.

Community-contributed councils live in the `councils/` directory of this
repo. Open a PR to add yours. Good candidates:

- Councils for specific communities (relationship anarchist, DSA praxis,
  coop governance, polyamorous scheduling, parenting with a co-parent)
- Councils from specific traditions (Stoic, Buddhist, liberation theology,
  Afrofuturist, Indigenous futures)
- Councils for specific domains (startup cofounder disputes, grad-school
  decisions, career transitions, aging-parent care)

The council library is the project's center of gravity. The tool is the
frame; the councils are the picture.

## Status

Ahwa is pre-release. The core deliberation loop works locally (M0 complete):
you can pose a dilemma, watch five personas deliberate across two rounds,
and read a synthesis. 37 tests cover the invariants.

**What's built:** Drizzle schema, typed SSE streaming, orchestrator state
machine, OpenRouter provider, seed loader for council/persona JSON files.

**What's next (M1):** table list UI, persona/council CRUD, markdown export,
multi-provider routing, Docker image, self-host README.

See [CLAUDE.md](./CLAUDE.md) for the full milestone plan.

## Credits

Ahwa is built by [Remoun](https://remoun.dev) and contributors. The
architectural inspiration comes from Moot (the multi-persona deliberation
idea) and Auralink (the two-party mediation pattern). The project exists
because both were closed-source and neither was private enough.

## License

[AGPL-3.0-or-later](./LICENSE). If you host a modified version for others,
you must publish your changes.

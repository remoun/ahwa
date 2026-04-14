## Project Configuration

- **Language**: TypeScript
- **Package Manager**: npm
- **Add-ons**: tailwindcss, drizzle

---

# Ahwa

**A private council of voices, around your table.**

A privacy-first, FOSS multi-persona deliberation tool. You set a table, invite
a council of AI personas, pose a dilemma; the council debates it across
structured rounds; a synthesizer produces a recommendation that preserves
real disagreement rather than flattening it. Local-first, bring-your-own-model,
AGPL-3.0.

Inspired by Moot (getmoot.app) and Auralink, but forkable, self-hostable, and
built around user-owned data and custom councils.

## The name and metaphor

*Ahwa* (قهوة) is Egyptian Arabic for coffee, and by extension the coffeehouse
— the traditional space where friends gather to think through problems
together, argue, and work out what to do. The project takes its name from
that practice: a deliberation tool should feel like the table, not the
chamber.

Pronounced "AH-wah."

The metaphor nests cleanly across the product:

- **Ahwa** is the venue.
- **Tables** are individual deliberations — you set a table for one specific
  question.
- **Councils** are the configured groups of personas you invite to a table.
- **Personas** are the individual voices.

Product copy follows the metaphor: "set a new table," "your last three tables,"
"who's at the table," "the Federation Council, around your table."

## How to work on this repo

This project is built largely via voice-driven agentic coding during eye
surgery recovery. Optimize for:

- **Minimal screen time.** When reporting results, summarize in 2-3 sentences
  before dumping details. Never paste full stack traces unless asked; surface
  the failing assertion or error message and propose a fix.
- **Testable specs before code.** For any non-trivial task, the first output
  is a short spec stated as observable behavior: given X, when Y, then Z.
  Specs describe inputs, outputs, and side effects — never implementation.
  If you cannot write a testable spec for the task, the task is underspecified;
  stop and ask the user for clarification.
- **Red-green TDD, strictly.** Every behavior change follows this loop:
  1. Write the test. Run it. Confirm it fails for the right reason (red).
     "Right reason" means the assertion fires on the behavior under test, not
     an import error or missing file.
  2. Write the minimum code to make the test pass (green). Resist the urge
     to add code the failing test doesn't demand.
  3. Refactor if needed, with tests green throughout.
  4. Commit.
  Skipping red is the most common failure mode — it produces tests that pass
  regardless of whether the code works. If a test passes on first run, it is
  suspect; make it fail deliberately (break the code, tweak the assertion)
  to confirm it actually exercises the behavior, then restore.
- **Commit after each green step** with a descriptive message so the user can
  `git reset` by voice without reading diffs. Commit messages follow
  conventional-commits lightly: `feat:`, `fix:`, `test:`, `refactor:`, `chore:`.
- **Ask before major structural decisions.** Don't silently choose an ORM, a
  test framework, a CSS approach. These decisions compound.
- **"Done" means tests pass and the feature works end-to-end**, not "I wrote
  the code." A task isn't done until the user could observe the behavior the
  spec described.

When in doubt, do less and check in.

## Stack

- **Runtime:** Bun.
- **Framework:** SvelteKit, full-stack, one repo, one deploy. `+server.ts`
  endpoints for the backend; no separate orchestrator service. SvelteKit was
  chosen over Astro because Ahwa is interaction-heavy from first paint
  (long-lived SSE streams, reactive UI as personas stream their turns,
  SPA-style navigation between tables) — Astro's static-first model would
  fight every one of those.
- **DB:** SQLite via `bun:sqlite`. Drizzle for the query layer and migrations.
- **Model routing:** Vercel AI SDK (`ai` + `@ai-sdk/anthropic`,
  `@ai-sdk/openai`, `ollama-ai-provider`). Wrap it once in
  `src/lib/server/llm.ts` so provider shapes never leak into orchestrator code.
- **Validation:** Zod for all schemas (personas, councils, SSE events, API
  bodies).
- **Styling:** Tailwind. Defer visual polish until the user can look at a screen.
- **Production builds:** `bun build --compile` produces a single
  self-contained binary. Both the Docker image and the YunoHost package
  distribute this binary; no runtime Bun dependency on the host.

## Distribution

Ahwa ships through two parallel paths that share one runtime contract. The
contract: a single binary that reads `AHWA_DATA_DIR` and `PORT` plus a small
set of config env vars, writes only to its data directory, and handles its
own SQLite migrations on startup.

**Docker** — developer-friendly install path. Official image
`ghcr.io/remoun/ahwa:latest`, compose file in repo root, one-command
self-host. Users bring their own reverse proxy (Caddy recommended).

**YunoHost** — one-click install path for digital-sovereignty-minded users
who want a web-UI install experience, not a terminal. The YunoHost package
wraps the same binary as a native systemd service, integrates with SSOwat
for single sign-on, gets automatic Let's Encrypt and backup/restore via
YunoHost's machinery. Submitted to the official app catalog; lives in
`packaging/yunohost/` in the repo.

Both paths consume the same release binary from GitHub Releases. Cutting a
release is: tag → CI builds the binary for linux-x64 and linux-arm64 →
attaches to the release → Docker image and YunoHost package pick it up.

## Hosting model

Ahwa supports three hosting modes. Only the first two are in scope — Ahwa
will never become a multi-tenant SaaS.

**1. Self-hosted (always the primary path).** Users run their own instance
via Docker or YunoHost. This is the canonical mode; everything else is
secondary. README and install instructions optimize for this.

**2. Personal public instance.** A single user (initially Remoun) runs their
own instance at a public URL. Architecturally identical to self-hosted.

**3. Public demo mode.** Ephemeral, rate-limited, cost-capped tables at
ahwa.app so visitors can try Ahwa before installing. Demo tables are marked
`is_demo = true` (see invariant #11), auto-expire, use the cheapest available
model, and are walled off from every owned-data feature (memory, two-party,
sync). Demo mode is part of the M2 public launch because it is the primary
acquisition path — people who try the thing are 10x more likely to install
than people who read the README alone.

**What demo mode can and can't show.** Demo exhibits the core loop:
dilemma → council deliberation → synthesis. It does not demo the
differentiators (memory, Historian, two-party mediation) because those
require persistent you-ness and break in anonymous ephemeral tables. That's
a feature, not a limitation: the landing page frames it as *"try the
council, self-host to get the rest."* Install is the path to the deeper
product, which reinforces the local-first thesis.

**Never in scope: full multi-tenant SaaS.** No user accounts, billing,
support tiers, GDPR data-subject workflows, or hosted paid plans. If the
project ever needs a sustainable funding model, explore donations, a
paid setup service, or cooperative/mutual-aid patterns before going SaaS.

## License

**AGPL-3.0-or-later from commit one.** Every source file gets:

```
// SPDX-License-Identifier: AGPL-3.0-or-later
```

`LICENSE` at repo root contains the full AGPL-3.0 text.

## Architectural invariants (do not violate)

These are the decisions that keep later milestones cheap. If a change would
break one of these, stop and ask.

1. **Parties, not users.** Every table has one or more `parties`. Every
   `turn` is authored by a `party_id`. Single-user mode has one party named
   "me." Two-party mediation (M3) adds a second party without schema changes.

2. **Memory is per-party.** The persistent memory feature stores
   `(party_id, content, updated_at)`. Never a global singleton memory file.

3. **Synthesis prompt lives on the council config**, not in code. Every
   council has a `synthesis_prompt` field with a sensible default. Same for
   `round_structure` — parameterize even though M1 ships one shape.

4. **SSE events are typed, not flat text.** Define the event union in Zod:
   `table_opened`, `round_started`, `persona_turn_started`, `token`,
   `persona_turn_completed`, `synthesis_started`, `synthesis_token`,
   `table_closed`, `error`. Frontend dispatches on event type.

5. **No in-app auth.** M1 is localhost-only. M1's personal public instance
   sits behind Caddy basic-auth at the reverse proxy; Ahwa itself knows
   nothing about login. M2 delivers real auth via SSOwat on YunoHost, which
   Ahwa consumes by trusting reverse-proxy-supplied identity headers. Never
   key anything off "the logged-in user" — everything is party-scoped via
   UUIDs. Share links are `/t/{table_id}?party={party_id}&token={hmac}`.

6. **Provider abstraction is request-shaped.** The orchestrator calls
   `llm.complete({ model, system, messages, stream })` and nothing else. No
   `anthropic.messages.create` anywhere outside `src/lib/server/llm.ts`.

7. **Data directory is configurable.** `AHWA_DATA_DIR` env var, defaults to
   `./data` in dev and `/var/lib/ahwa` in the Docker image. YunoHost sets
   its own path via the install script. No hardcoded paths.

8. **Turns carry `visible_to`.** A turn's visibility is an array of party IDs.
   In single-party tables, `visible_to = [all parties]`. In two-party mode,
   each party's raw turns are visible only to themselves and the synthesizer
   until both opt into sharing. Cross-leak prevention is a query filter, not
   new plumbing bolted on later.

9. **Zero telemetry.** No analytics, no crash reporting, no phone-home. Not
   even anonymous. This is a core product promise and appears in the README.

10. **Personas can declare feature requirements.** A persona may include a
    `requires: ["memory", "two_party", ...]` array. The UI filters out or
    warns on personas whose required features aren't available in the current
    build. This is how M3's Historian persona ships cleanly without breaking
    earlier councils that might want to include it.

11. **Demo tables are second-class.** Any table created via the public demo
    carries `is_demo = true`. Demo tables:
    - Are excluded by default from all table lists and user-owned queries
    - Must never participate in two-party mode, memory, or sync
    - Are auto-deleted by a cleanup job after a short TTL
    - Are rendered with visible "demo" chrome in the UI so users never confuse
      them with owned tables
    If a query could plausibly mix demo and owned tables, the query is wrong.

12. **Production builds are single binaries.** Releases are cut as statically
    linked binaries via `bun build --compile`. Docker images and YunoHost
    packages consume the same binary. No path leaks into "runs only via
    `bun run`" that would make packaging painful later.

## Data model

The three core entities create a clean separation:
**who** (parties) × **what** (tables/dilemmas) × **how** (councils/personas).
Parties are the people at the table, tables are the specific deliberations,
councils define the deliberation shape. This triple means two-party mode,
new council types, and memory all land as additive changes — nothing existing
needs restructuring.

Note on naming: the deliberation concept is "table" throughout the product
and code. The SQL table that stores them is also named `tables`, which is
visually awkward at the schema-definition layer but contained — Drizzle
defines them as named exports (`export const tables = sqliteTable("tables",
...)`) and the collision doesn't propagate to queries or app code. If this
becomes irritating in practice, rename the SQL table to `deliberation_tables`
in a migration; the app concept stays "table."

```
parties
  id           TEXT PRIMARY KEY  -- uuid
  display_name TEXT
  created_at   INTEGER

tables
  id           TEXT PRIMARY KEY  -- uuid
  title        TEXT
  dilemma      TEXT
  council_id   TEXT
  status       TEXT  -- 'pending' | 'running' | 'completed' | 'failed'
  synthesis    TEXT  -- null until complete
  is_demo      INTEGER DEFAULT 0  -- 1 for public-demo tables
  created_at   INTEGER
  updated_at   INTEGER

table_parties
  table_id     TEXT
  party_id     TEXT
  role         TEXT  -- 'initiator' | 'invited'
  PRIMARY KEY (table_id, party_id)

turns
  id           TEXT PRIMARY KEY
  table_id     TEXT
  round        INTEGER
  party_id     TEXT       -- author; the synthesizer is a special party_id
  persona_name TEXT       -- null for human dilemma input
  text         TEXT
  visible_to   TEXT       -- JSON array of party_ids
  created_at   INTEGER

personas
  id            TEXT PRIMARY KEY
  name          TEXT
  emoji         TEXT
  system_prompt TEXT
  requires      TEXT       -- JSON array of required features, e.g. ["memory"]
  owner_party   TEXT       -- null means template/shared
  created_at    INTEGER

councils
  id                TEXT PRIMARY KEY
  name              TEXT
  persona_ids       TEXT   -- JSON array
  synthesis_prompt  TEXT
  round_structure   TEXT   -- JSON, see below
  owner_party       TEXT   -- null means template
  created_at        INTEGER

memory
  party_id    TEXT PRIMARY KEY
  content     TEXT         -- plain markdown, user-editable
  updated_at  INTEGER
```

`round_structure` JSON shape:
```json
{
  "rounds": [
    { "kind": "opening", "prompt_suffix": "Give a 2-3 paragraph opening take." },
    { "kind": "cross_examination", "prompt_suffix": "..." }
  ],
  "synthesize": true
}
```

## Feature flags

The orchestrator maintains a set of available features. Personas whose
`requires` array contains any unavailable feature are filtered out (with a
visible warning in the UI) before a table opens.

| Feature     | Available from | Notes                                      |
|-------------|----------------|--------------------------------------------|
| `memory`    | M3             | Per-party markdown memory passed to LLMs   |
| `two_party` | M3             | Second party via share link                |
| `sync`      | M4             | E2E-encrypted cross-device sync            |

## Milestones

### M0 — Foundation (checkpoint, not a shippable artifact)

Prove the architectural invariants hold in real code before investing in the
scaffolding around them. Time-box to half a weekend; if it runs longer, stop
and re-examine the invariants rather than push through.

- Scaffold SvelteKit + Drizzle + SQLite + Zod schemas per the data model
- Hardcoded Anthropic provider, hardcoded default council
- One table opens, runs end-to-end via typed SSE events, persists to DB,
  renders in the UI
- Happy path only — no table list, no settings UI, no error recovery beyond
  "it crashed, here's why"

**Definition of done:** A single deliberation runs start-to-finish locally,
the schema matches the invariants, typed SSE events drive the UI, and
Vitest is wired up with at least one red-then-green test cycle completed
(proving the TDD loop works before the real work begins).

### M1 — Self-host v1

The first real shippable milestone. Private circle only; don't announce
publicly.

- Table list, table view, basic UI polish
- Persona and council CRUD in the UI
- Markdown export of a table
- Vercel AI SDK fully integrated; Anthropic, OpenAI, OpenRouter, Ollama
- Provider + model selectable per council
- Production single-binary build via `bun build --compile` in CI
- Docker image (`ghcr.io/remoun/ahwa`) and compose file
- README with screenshots, Ollama quickstart, AGPL notice, zero-telemetry promise
- Community councils directory: `councils/` and `personas/` folders loadable
  from UI
- Ships with two councils: `default.json` (Elder / Mirror / Engineer / Weaver
  / Instigator) and `federation.json` (Federation Delegate / Ancestor /
  Organizer / Therapist / Trickster)
- Personal public instance goes live behind Caddy basic-auth on ahwa.app (or
  subdomain) for real-world usage and bug-shakedown

**Definition of done:** A technically-comfortable friend can follow the
README and self-host a working instance in 15 minutes. You've used the
personal public instance for real decisions for a week without major bugs.

### M2 — Public launch (demo + YunoHost)

The announced v1. Two distribution paths and one demo landing page, launched
together.

- Demo mode at ahwa.app: `is_demo` flag, rate limiting per IP, daily spend
  cap, short TTL cleanup cron, prompt-injection/abuse defenses, cheap model
  (Haiku or hosted small model)
- Landing page: clear demo CTA, equally clear self-host CTA, plain-language
  note about what the demo sends where
- YunoHost package: `manifest.toml`, install/remove/upgrade/backup/restore
  scripts, systemd unit, Caddy/nginx fragment, SSOwat integration (auth via
  reverse-proxy-supplied identity headers, no in-app auth code)
- YunoHost app-catalog submission PR merged; app listed in official catalog
- Public announcement: HN, Mastodon, relevant communities

**Definition of done:** A visitor to ahwa.app can try the tool in under 30
seconds, and a YunoHost user can install it in under 5 minutes.

### M3 — Differentiators

The features that demo mode can't show, and the reason to install. Biggest
milestone in the plan; budget accordingly.

- **Per-party memory**: markdown file per party, shown to every persona as
  additional system context, editable in UI, exportable
- **The Historian persona** (from `personas/historian.json`) becomes
  available and is added to a revised federation council. Flagship use case
  for memory — pattern recognition across time.
- **Two-party mediation**: share link creates second party, each talks to
  council separately, synthesizer sees both, raw turns stay party-scoped
  until both opt in to reveal
- Second announcement: "here's what self-hosting unlocks that the demo
  can't." Reinforces the local-first story.

### M4 — Polish and reach

- Optional SQLCipher encryption at rest
- E2E-encrypted sync across devices (age or libsodium)
- PWA manifest + offline shell
- Tauri desktop wrapper (uses `AHWA_DATA_DIR` cleanly)
- iOS/Android via PWA; native wrapper only if PWA limits bite

## Directory layout

```
/
  CLAUDE.md                    -- this file
  README.md                    -- user-facing
  LICENSE                      -- AGPL-3.0
  package.json                 -- name: "ahwa"
  svelte.config.js
  tailwind.config.ts
  drizzle.config.ts
  councils/                    -- JSON council definitions, shipped with repo
    default.json
    federation.json
    relationship-anarchist.json   -- M1+
    dsa-praxis.json               -- M1+
  personas/                    -- standalone personas users can add to any council
    historian.json                -- requires memory (M3)
  packaging/
    docker/
      Dockerfile
      compose.yaml
    yunohost/                  -- M2
      manifest.toml
      scripts/
        install
        remove
        upgrade
        backup
        restore
      conf/
        systemd.service
        nginx.conf
  src/
    lib/
      server/
        db/
          schema.ts            -- Drizzle schema
          client.ts
          migrations/
        llm.ts                 -- single provider abstraction
        orchestrator.ts        -- debate state machine
        events.ts              -- SSE event Zod types
        features.ts            -- feature-flag registry
        identity.ts            -- reads reverse-proxy identity headers (M2+)
      schemas/                 -- shared Zod (persona, council, etc.)
      components/
    routes/
      +layout.svelte
      +page.svelte             -- table list + new table
      t/[id]/
        +page.svelte           -- table view
        +server.ts             -- SSE stream endpoint
      api/
        tables/
        councils/
        personas/
  tests/
    orchestrator.test.ts
    llm.test.ts
    schemas.test.ts
    features.test.ts
```

## Testing

Tests are executable documentation — they are how someone new to this
codebase learns what the system does and doesn't do. Test names read as
behavior descriptions; failures read as violated contracts. Write them
accordingly.

Strict red-green TDD (see "How to work on this repo"). Testing is not a
step after coding; it is the way coding happens.

**Framework:** Vitest via `bun test` (runs Vitest-compatible specs natively;
confirm compatibility during M0 setup).

**What to test:**

- Every orchestrator state transition has a test covering its pre- and
  post-conditions.
- Every Zod schema has round-trip tests (valid input parses, invalid input
  rejects with a useful error).
- Every SSE event type has a test that the emitter produces it and the
  consumer handles it.
- Every query that filters by party, visibility, or `is_demo` has a test
  that confirms the filter actually excludes what it should. These are the
  invariant-protecting tests; they matter most.
- Every feature-flag-gated persona has a test that it is filtered out when
  its required features are unavailable.

**What not to test:**

- Trivial getters, thin passthroughs, or framework code you don't own.
- Visual styling. Add tests for component *behavior* (click this, see that
  state change); do not test CSS.
- Third-party libraries. Test your own adapter layer around them instead.

**Mock the LLM provider always.** Never hit real APIs in tests or CI. The
provider abstraction in `src/lib/server/llm.ts` exists partly to make this
easy — mock it at that boundary, not deeper.

**Spec format.** Tests read as specs. Prefer `describe("orchestrator")` →
`it("emits table_opened before the first round")`. The test name is the
spec. If the test name doesn't describe observable behavior, rewrite it.

**CI.** `bun test` runs on every push; no merge without green. A single
failing test blocks the commit claiming "done."

## Reporting back to the user

When the user is recovering and driving by voice:

- Lead with a one-sentence status: "M0 scaffold done, tests pass" or
  "Hit an error, need your call."
- If asking a question, make it binary or multiple-choice, not open-ended.
- If proposing code, describe it in English first; only read code aloud if asked.
- Batch questions. Don't interrupt every 30 seconds.

# Changelog

All notable changes to Ahwa are documented here. The format is loosely
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [M1] — Self-host v1

See [CLAUDE.md](./CLAUDE.md#milestones) for the full milestone plan.

### Added

- Table list with council picker, streaming table view, historical
  view for completed/failed tables, council/persona CRUD UI
- Markdown rendering in persona turns and synthesis (`marked` +
  `DOMPurify`); copy-markdown-to-clipboard button with emoji icon
  and hover tooltip
- Council descriptions shown inline on cards and in tooltips
- Visual polish: sticky dilemma card that shrinks when it sticks,
  thread gutter, breathing dots while a persona speaks, synthesis
  "ceremony" on completion
- Personas within a round now deliberate in parallel — each persona's
  turn kicks off concurrently, tokens interleave in the UI, and the
  full round completes in roughly `max(single-turn-time)` instead of
  `N × avg-turn-time`. Render order stays consistent with the council's
  declared order regardless of which finishes first.
- Multi-provider LLM routing (Anthropic, OpenAI, OpenRouter, Ollama)
  with per-council `model_config` and auto-detect fallback
- Semantic theme tokens with light/dark modes and a toggle
- Feature-flag registry: personas declaring `requires: [...]` are
  filtered out (with UI warning) when their features are unavailable
- HMAC share tokens on table URLs (`AHWA_SHARE_SECRET`) wired through
  to the UI, with a dev-only ephemeral fallback and warning
- `is_demo` boundary enforced in request guards
- SSE wire format, guard logic, and orchestrator state machine all
  broken out into testable modules
- Playwright E2E suite covering the streaming flow, historical view,
  council CRUD, error surfacing, and markdown export
- Docker image, PR preview deploys on Fly.io, CI on every PR,
  auto-deploy to ahwa.app (Fly) on main merge via a CD workflow
- Dependabot (npm, GitHub Actions, Docker base), ESLint + Prettier
  flat config
- SPDX license headers on all source files; optional `license` field
  on council and persona JSONs
- README: screenshots, CI badge, link to the M1 write-up
- Drizzle-kit migrations (initial baseline from the schema)
- Orphan recovery: `running` tables at startup are marked `failed`
  with a user-facing message
- Abort signal threads through the orchestrator — client disconnects
  stop the deliberation between turns

### Changed

- Orchestrator no longer creates the table row; the HTTP layer does
  this and passes the `tableId` in
- Table claim is atomic (`UPDATE ... WHERE status='pending'`) to
  eliminate the race between concurrent SSE requests
- Error messages persist to `tables.error_message` so failed
  deliberations show the real cause on reload
- Palette swapped from amber/warm to sky blues
- Default OpenRouter model bumped

### Fixed

- Fail loudly when no LLM provider is configured (previously silent)
- Surface silent empty-LLM responses to the user instead of hanging

## [M0] — Foundation checkpoint

- Core deliberation loop: dilemma in, typed SSE events out, synthesis
  persisted
- Drizzle schema (7 tables), orchestrator state machine, Zod-validated
  SSE events, seed loader for council/persona JSON files
- 37 invariant-protecting tests

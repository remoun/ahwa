# Changelog

All notable changes to Ahwa are documented here. The format is loosely
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [M1] — Self-host v1

See [CLAUDE.md](./CLAUDE.md#milestones) for the full milestone plan.

### Added

- Table list with council picker, streaming table view, historical
  view for completed/failed tables, markdown export, council/persona
  CRUD UI
- Multi-provider LLM routing (Anthropic, OpenAI, OpenRouter, Ollama)
  with per-council `model_config` and auto-detect fallback
- Semantic theme tokens with light/dark modes and a toggle
- SSE wire format, guard logic, and orchestrator state machine all
  broken out into testable modules
- Playwright E2E suite covering the streaming flow, historical view,
  council CRUD, error surfacing, and markdown export
- Docker image, PR preview deploys on Fly.io, CI on every push/PR
- Drizzle-kit migrations (initial baseline from the schema)
- Orphan recovery: `running` tables at startup are marked `failed`
- Abort signal threads through the orchestrator — client disconnects
  stop the deliberation between turns

### Changed

- Orchestrator no longer creates the table row; the HTTP layer does
  this and passes the `tableId` in
- Table claim is atomic (`UPDATE ... WHERE status='pending'`) to
  eliminate the race between concurrent SSE requests
- Error messages persist to `tables.error_message` so failed
  deliberations show the real cause on reload

## [M0] — Foundation checkpoint

- Core deliberation loop: dilemma in, typed SSE events out, synthesis
  persisted
- Drizzle schema (7 tables), orchestrator state machine, Zod-validated
  SSE events, seed loader for council/persona JSON files
- 37 invariant-protecting tests

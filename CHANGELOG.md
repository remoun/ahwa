# Changelog

All notable changes to Ahwa are documented here. The format is loosely
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.2](https://github.com/remoun/ahwa/compare/v0.2.1...v0.2.2) (2026-04-19)


### Bug Fixes

* **release-assets:** checkout targetCommitish for draft releases ([fa36b66](https://github.com/remoun/ahwa/commit/fa36b66cf76731d98c781bdfa2c50a15067d3fe1))
* **release-assets:** checkout targetCommitish, not the not-yet-existing tag ([3d381fb](https://github.com/remoun/ahwa/commit/3d381fb8f33fd3897213a0ab18d9cc3f3d160a17))
* **release-assets:** leave release as draft for manual publish ([f2c1a5c](https://github.com/remoun/ahwa/commit/f2c1a5c92a285b0bfbc2ec4162bab2c3a83a6505))
* **release-assets:** set GH_REPO env so gh works before checkout ([ded8d47](https://github.com/remoun/ahwa/commit/ded8d4722f81779213c5fd635ba7aa1b4d508afd))
* **release-assets:** set GH_REPO so gh works before checkout ([b894687](https://github.com/remoun/ahwa/commit/b89468750e021dae16d2f4f260b9010b959cfcc0))
* **release-assets:** wrap tarball in ahwa-VERSION/ directory ([3235a1d](https://github.com/remoun/ahwa/commit/3235a1d275c0490c7916d897a75f7ea5063b83ec))

## [0.2.1](https://github.com/remoun/ahwa/compare/v0.2.0...v0.2.1) (2026-04-19)


### Bug Fixes

* **release:** drop inline release-type so release-please reads the config ([2637ef4](https://github.com/remoun/ahwa/commit/2637ef49eab35d228ce46347ac4617710246e277))
* **release:** read draft:true from config (was silently ignored) ([f29947f](https://github.com/remoun/ahwa/commit/f29947f7ec047acc293acd36d9fa66e3e24cb700))

## [0.2.0](https://github.com/remoun/ahwa/compare/v0.1.0...v0.2.0) (2026-04-19)


### Features

* **release:** create as draft, attach asset, then publish ([d83e0b9](https://github.com/remoun/ahwa/commit/d83e0b925f4a042b0d40175e29dbc43f769bc3e8))
* **release:** create as draft, attach asset, then publish ([a58a770](https://github.com/remoun/ahwa/commit/a58a7702bd28937a50e3c4b8a32b514e251e7697))

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

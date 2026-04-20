# Changelog

All notable changes to Ahwa are documented here. The format is loosely
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0](https://github.com/remoun/ahwa/compare/v0.2.2...v0.3.0) (2026-04-20)


### Features

* **invite:** mint placeholder party + share URL on POST /api/tables/:id/invite ([ea1aa57](https://github.com/remoun/ahwa/commit/ea1aa57a5b7607120e763cc09269a7f85a9faf0e))
* **lifecycle:** graceful shutdown — SIGTERM drains in-flight deliberations ([d903bf5](https://github.com/remoun/ahwa/commit/d903bf529d60f80342eb3212d475566d14637793))
* **lifecycle:** graceful shutdown drains in-flight deliberations on SIGTERM ([3f7235c](https://github.com/remoun/ahwa/commit/3f7235c9b0b3ce8918ca60bdce289a164fe62a3d))
* **m3:** live broadcast — per-table event bus, single SSE channel ([2759749](https://github.com/remoun/ahwa/commit/2759749db6d468045dd018d7135fb278138038bf))
* **m3:** multi-party mediation — invite, stance, deferred synthesis ([47d3365](https://github.com/remoun/ahwa/commit/47d33653f6b1203e3d9cba1fe38aa2c5e3c8f9e8))
* **m3:** per-party errorMessage column + UI surface ([3eb635f](https://github.com/remoun/ahwa/commit/3eb635f765e2717ffe69bb37bacf26fa968bd49c))
* **orchestrator:** consensus mode — stop early when council aligns ([1f6fae7](https://github.com/remoun/ahwa/commit/1f6fae749335661192dd77562cb7369afbfe22ef))
* **orchestrator:** per-party run gating + deferred multi-party synthesis ([15f1961](https://github.com/remoun/ahwa/commit/15f196103964ccadef6b99c8a8426307045e5922))
* **orchestrator:** until-consensus mode for deliberation rounds ([61646ac](https://github.com/remoun/ahwa/commit/61646ac8d361853e7fb86b47497a09f2ba1983f4))
* **orchestrator:** wire tables.max_rounds as per-table override of round count ([87e7660](https://github.com/remoun/ahwa/commit/87e7660eae331202b81c8254f64169ccd797d2ec))
* **reveal:** one-way per-recipient share via POST /api/turns/:id/reveal ([e8dc621](https://github.com/remoun/ahwa/commit/e8dc62175a8fc869e79114c06fb0b24ae20bb923))
* **stance:** per-party stance editing + run-gate requires stance for multi-party ([2c0275f](https://github.com/remoun/ahwa/commit/2c0275fc6c154cf74be9f90d3d106018aadd96b7))
* **synthesize:** manual synthesis trigger for multi-party tables ([4974ecd](https://github.com/remoun/ahwa/commit/4974ecd60dcb28b8ffff78d1c6680ad66c82c2ab))
* **ui:** mediation mode — stance editor, invite flow, synthesis trigger ([90c17b8](https://github.com/remoun/ahwa/commit/90c17b80793cd287a27faa694e3423b9e5d41d96))
* **ui:** per-turn reveal — small button on own private turns ([c907d68](https://github.com/remoun/ahwa/commit/c907d6805857aabe6c34e3d38f2484cd658beb70))
* **uncommit:** revoke a finished party run before synthesis fires ([ebc4306](https://github.com/remoun/ahwa/commit/ebc4306b923bdd9f511128121d8a505b877853ab))
* **visibility:** private persona turns + viewer-scoped page replay for multi-party ([2ad857a](https://github.com/remoun/ahwa/commit/2ad857a0b5050f0e934bde0931fa173e05641b0e))


### Bug Fixes

* **docs:** prevent prettier from italicizing persona_turn_* in CLAUDE.md ([748df8a](https://github.com/remoun/ahwa/commit/748df8acd579583bceb479139ce485d71b5cea47))
* **m3:** address PR [#58](https://github.com/remoun/ahwa/issues/58) review findings ([45ed939](https://github.com/remoun/ahwa/commit/45ed9398d0594ace234008379e75700f947d78a8))
* **orchestrator:** preserve preflight semantics — table-not-found / terminal-state errors don't degrade party status ([9fa6803](https://github.com/remoun/ahwa/commit/9fa68031e4cac4feb26cb0eea0e4b4df0d386400))
* **prepare:** noop svelte-kit sync when devDeps absent (prod installs) ([b75534c](https://github.com/remoun/ahwa/commit/b75534c76845c59f9cf3abc1f01438a79ff32011))
* **prepare:** skip svelte-kit sync on prod installs ([197aaba](https://github.com/remoun/ahwa/commit/197aabad5b8c163d5ffee9c85b7b724f7956ff29))
* **release-assets:** restore auto-publish after asset upload ([9e8c06d](https://github.com/remoun/ahwa/commit/9e8c06d7ce6b7f3d74107cff0ce32876dd3ccd93))
* **release-assets:** restore auto-publish after asset upload ([dfdb978](https://github.com/remoun/ahwa/commit/dfdb978dfc4a97ab294cd3478118ee95ab786330))
* wrap multi-write handlers in db.transaction; restore dropped comments ([303d3ea](https://github.com/remoun/ahwa/commit/303d3eadc1b3d293a2a5a5354d6bf98c510bb85a))

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

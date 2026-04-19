# Changelog

All notable changes to Ahwa are documented here. The format is loosely
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0](https://github.com/remoun/ahwa/compare/v0.2.2...v0.3.0) (2026-04-19)


### Features

* /api/me endpoint for SSO end-to-end checks ([005d5d9](https://github.com/remoun/ahwa/commit/005d5d98215be298b4da12574723f690d2416c61))
* /api/me returns the resolved party identity ([6ae80c3](https://github.com/remoun/ahwa/commit/6ae80c39544d546901da936992f804df692ddcad))
* add The Dreamer as 6th voice in default council ([c333dbb](https://github.com/remoun/ahwa/commit/c333dbb00f56b881e06470d8e22f1a95fd3666d1))
* add The Uncommitted to Praxis and The Body to RA councils ([e68d3ae](https://github.com/remoun/ahwa/commit/e68d3ae35a680fcd3521479a1e3a1f7e276da38d))
* AHWA_SYNTHESIS_MODEL env var for per-deliberation model split ([892de27](https://github.com/remoun/ahwa/commit/892de27e3b81645e2254bf4e603abd7610149448))
* api routes for table creation and sse streaming ([949c1bf](https://github.com/remoun/ahwa/commit/949c1bfa0bc69e9e0cb29df0ec9d83ed66598fd2))
* council and persona seed loader ([6dae885](https://github.com/remoun/ahwa/commit/6dae885188c64f5a94ca11f5c125ffbf3244f062))
* demo mode (Block A of M2) ([d0ca976](https://github.com/remoun/ahwa/commit/d0ca9768b46e53a8268e0741165255c3783220b1))
* **demo:** atomic pre-charge for budget enforcement ([68ef9ec](https://github.com/remoun/ahwa/commit/68ef9ec46c5e7c139f1d3353ffb80beda1fb5d55))
* **demo:** chrome banner on demo tables (A5 of M2 Block A) ([446eb09](https://github.com/remoun/ahwa/commit/446eb09d55c369ae934ecafc82e38db675978a7d))
* **demo:** councils/demo.json pinned to Haiku 4.5 (A7 of M2 Block A) ([46be096](https://github.com/remoun/ahwa/commit/46be096fc7b476859291730cfe76375e8cefc012))
* **demo:** createDemoTable primitive (A1 of M2 Block A) ([33d5349](https://github.com/remoun/ahwa/commit/33d53497f89aa6b1af1268e374b2327eb60c8d4f))
* **demo:** daily token cap + dollar-cost logging (A3 of M2 Block A) ([e0a10df](https://github.com/remoun/ahwa/commit/e0a10df1b36158cb2c1f49331322d39914737d17))
* **demo:** enable demo mode on PR previews ([5ee2cc8](https://github.com/remoun/ahwa/commit/5ee2cc812f587be83369f678fa0844125bb98d35))
* **demo:** in-memory token-bucket rate limiter (A2 of M2 Block A) ([4112295](https://github.com/remoun/ahwa/commit/4112295ec7863b7061fdc065ee0685189ecf984b))
* **demo:** POST /api/demo/tables route + TTL cleanup interval ([53e54a0](https://github.com/remoun/ahwa/commit/53e54a0919e7c10c99a8ac22aefca25ae257de57))
* **demo:** reconcile estimate vs actual tokens after deliberation ([c7cc60c](https://github.com/remoun/ahwa/commit/c7cc60cc7957255268723c89ff50db5c99782c51))
* **demo:** TTL cleanup of expired demo tables (A4 of M2 Block A) ([f0f1ae8](https://github.com/remoun/ahwa/commit/f0f1ae8883573dfb2413aee1b8f01b6128028b4b))
* drizzle schema for all seven tables ([e781318](https://github.com/remoun/ahwa/commit/e7813182644547eb4ffbae884d2c596a723ea512))
* flag truncated turns when LLM hits maxOutputTokens ([14319ba](https://github.com/remoun/ahwa/commit/14319bad2b57c3ac1a6a437aa0c8632aff622653))
* fold smoke into CD as post-deploy jobs + add Playwright UI smoke ([d54b697](https://github.com/remoun/ahwa/commit/d54b697925615cb3defe4abf80720584d2ea8373))
* **identity:** get-or-create party from reverse-proxy headers ([127e00b](https://github.com/remoun/ahwa/commit/127e00bfb2add132f451c883777fcee7a13c6414))
* **identity:** get-or-create party from reverse-proxy headers (Block C of M2) ([592af23](https://github.com/remoun/ahwa/commit/592af230ccd5d9e465252d9ef5539d5a551f449c))
* **identity:** wire hooks.server.ts to set event.locals.party ([1a12342](https://github.com/remoun/ahwa/commit/1a12342eefb5465afc34eaee47f555f460bc2011))
* **landing:** public-demo landing page (Block B of M2) ([f84b30d](https://github.com/remoun/ahwa/commit/f84b30d79beb9d09c4ec3ec432b0f4c946a42cc4))
* llm provider abstraction with anthropic ([01c5dd7](https://github.com/remoun/ahwa/commit/01c5dd7f9d5a24a5009c5ef097a9e078d735c6b4))
* **llm:** per-council model override via AHWA_COUNCIL_&lt;ID&gt;_* env ([e6b981e](https://github.com/remoun/ahwa/commit/e6b981ee4dd09a3c5bf1bf472e9d5d6856ff6973))
* **llm:** per-council model override via AHWA_COUNCIL_&lt;ID&gt;_* env ([9fb304e](https://github.com/remoun/ahwa/commit/9fb304e4373c8f28c3b1dd0b62e2cac9cb5f2467))
* M1 self-host v1 implementation ([#1](https://github.com/remoun/ahwa/issues/1)) ([0013b6a](https://github.com/remoun/ahwa/commit/0013b6a56043d7d4b9b218bf38744226189933c2))
* minimal deliberation ui with streaming turns ([2bf32c3](https://github.com/remoun/ahwa/commit/2bf32c3ddbc0af9c450b7db4762637c85a93b0cd))
* opinionated council voices + invariant [#13](https://github.com/remoun/ahwa/issues/13) ([b39d876](https://github.com/remoun/ahwa/commit/b39d87684270ded722ce7039b537a798071c2db0))
* orchestrator state machine with typed sse events ([7c06903](https://github.com/remoun/ahwa/commit/7c06903cb93352e70bfb2f4df35c456e92003ca7))
* **personas:** user-facing description field, surfaced across UI ([85e556c](https://github.com/remoun/ahwa/commit/85e556c993c00e96c3daefae5d1bc59efdcd669f))
* post-deploy smoke (API + UI) folded into CD ([81d7cde](https://github.com/remoun/ahwa/commit/81d7cde964a104e44cc38188d299c0e4d7125e3f))
* post-deploy smoke test against real LLM provider ([d49a5ff](https://github.com/remoun/ahwa/commit/d49a5ff4d79f7b1a7a4634641b6008f349f9c83a))
* public-demo landing page (Block B of M2) ([2b8fb9c](https://github.com/remoun/ahwa/commit/2b8fb9c8227ca9e8fd94ea7f6f11894ddc7ad578))
* **release:** create as draft, attach asset, then publish ([d83e0b9](https://github.com/remoun/ahwa/commit/d83e0b925f4a042b0d40175e29dbc43f769bc3e8))
* **release:** create as draft, attach asset, then publish ([a58a770](https://github.com/remoun/ahwa/commit/a58a7702bd28937a50e3c4b8a32b514e251e7697))
* show council name beside the dilemma label ([773f1c7](https://github.com/remoun/ahwa/commit/773f1c7ec2f409961ff51c2b0f7fbf8395ea414d))
* show council name beside the dilemma label ([cf8e33b](https://github.com/remoun/ahwa/commit/cf8e33bf05748bdeb37ef87ced4636442702a2f5))
* swap anthropic for openrouter provider ([0f8b53e](https://github.com/remoun/ahwa/commit/0f8b53ee79d82362999b0fb5de3165909ef20c4e))
* user-facing persona descriptions, surfaced across the UI ([0ad9601](https://github.com/remoun/ahwa/commit/0ad9601988061289317b0dbd542e9528db8e0753))
* YunoHost packaging — install verified, lifecycle pending ([cf14343](https://github.com/remoun/ahwa/commit/cf143434a8207e1d612de8595919fd122300ff0f))
* YunoHost packaging (Block D of M2) ([5878acd](https://github.com/remoun/ahwa/commit/5878acdcc4868f8c2418beccdde66020c05f2367))
* **yunohost:** wire package_check on a self-hosted runner ([fe7ab4e](https://github.com/remoun/ahwa/commit/fe7ab4e9e7a67cb915b17bc9a2555fc3421149fa))
* zod schemas for councils, personas, sse events ([cd5e927](https://github.com/remoun/ahwa/commit/cd5e927316534f8e7824cdbc7e8dabdf1b29b495))


### Bug Fixes

* **a11y:** figcaption as direct child of figure; suppress conditional-tabindex false positive ([f2d9fee](https://github.com/remoun/ahwa/commit/f2d9fee3a4b1d5cdf1d036f2bae182d9da3389e4))
* **a11y:** split svelte-ignore directive from explanation ([5601957](https://github.com/remoun/ahwa/commit/56019576074a7b07b9ae5bb0b32c77a4683559af))
* bump @openrouter/ai-sdk-provider 2.5.1 → 2.8.0 ([f55fd18](https://github.com/remoun/ahwa/commit/f55fd18b8e3bebac5afc8c8b135e9ab0089d314c))
* cap streamText output + surface stream errors properly ([3b51462](https://github.com/remoun/ahwa/commit/3b5146276d23a2cbe3d9096be3175c818bcf6b12))
* **db:** lazy-init via getDb(); rename Db type to DB ([2307793](https://github.com/remoun/ahwa/commit/23077932ced2d0e4a5c50fc66bd62191f5bd5802))
* **db:** lazy-init via getDb(); rename Db type to DB ([383a129](https://github.com/remoun/ahwa/commit/383a129529102c0253ffaea74b4ef96ecd8cb8ff))
* **db:** use client.run for PRAGMA (client.exec is deprecated) ([b0ebd5b](https://github.com/remoun/ahwa/commit/b0ebd5b6a63ed9f541d7a0d1c63aafb633bbd7be))
* **demo:** apply remaining review findings ([2065e46](https://github.com/remoun/ahwa/commit/2065e4654b2a226d31d224680d3578ceb563e578))
* **demo:** drop unused recordDemoTokens import in test ([eb15568](https://github.com/remoun/ahwa/commit/eb155681249f5b3f0795531a3fe924cbc5b85c92))
* **demo:** drop unused schema import in reconcile test ([64fae89](https://github.com/remoun/ahwa/commit/64fae895895bfc48d6f202a54fbcaae85d468f0c))
* **demo:** refund pre-charge on stream error / abort (critical review fix) ([17be5f0](https://github.com/remoun/ahwa/commit/17be5f0fd02395fce3c552a45b81e4ac6cafdbc4))
* **e2e:** scope click-expansion assertion to the System prompt panel ([8a8f15a](https://github.com/remoun/ahwa/commit/8a8f15a495ac92a7e71cc3865ccde95d2236f8d0))
* gate smoke jobs on preview being reachable, not just deployed ([9318eb5](https://github.com/remoun/ahwa/commit/9318eb5d8948256ad274c876587b6c0187eb8750))
* gate smoke jobs on preview being reachable, not just deployed ([9782f99](https://github.com/remoun/ahwa/commit/9782f99249c2efef362ee60b81ea036a913e223f))
* **landing:** match codebase pattern for form onsubmit (drop event type) ([8d9f848](https://github.com/remoun/ahwa/commit/8d9f8486e2cf482d19d475fd1c500c9b398cbf0c))
* **landing:** smoke handles both renderings + use existing README anchor ([b43ce10](https://github.com/remoun/ahwa/commit/b43ce109338d96bf25b0f292e6d1a12fa2bf5953))
* **landing:** type tryDemo event as Event (eslint no-undef on SubmitEvent) ([6dee511](https://github.com/remoun/ahwa/commit/6dee511043b19af564877d44ba05b45cd94007fc))
* OpenRouter Sonnet 4.6 model ID uses dots, not dashes ([3a421ea](https://github.com/remoun/ahwa/commit/3a421eacc4c9876d2f8359845a5b1ef1c8e81fd7))
* OpenRouter Sonnet 4.6 model ID uses dots, not dashes ([5677196](https://github.com/remoun/ahwa/commit/567719620e9c66917d289604531d68db4b65383d))
* orchestrator marks table failed on early load errors ([341a877](https://github.com/remoun/ahwa/commit/341a877c69c129b740266002f8d77b6698cf3b52))
* orchestrator marks table failed on early load errors ([d6bfe88](https://github.com/remoun/ahwa/commit/d6bfe882c6718ca2abdd126b8e8e9fa04be482dc))
* preserve whitespace in the displayed dilemma ([062feab](https://github.com/remoun/ahwa/commit/062feab0571f0df92721a98c5c1a77b3a67dc047))
* preserve whitespace in the displayed dilemma ([f8d1a23](https://github.com/remoun/ahwa/commit/f8d1a2392eae080cc701afc7ce2c2f85798b50f6))
* **release-assets:** checkout targetCommitish for draft releases ([fa36b66](https://github.com/remoun/ahwa/commit/fa36b66cf76731d98c781bdfa2c50a15067d3fe1))
* **release-assets:** checkout targetCommitish, not the not-yet-existing tag ([3d381fb](https://github.com/remoun/ahwa/commit/3d381fb8f33fd3897213a0ab18d9cc3f3d160a17))
* **release-assets:** leave release as draft for manual publish ([f2c1a5c](https://github.com/remoun/ahwa/commit/f2c1a5c92a285b0bfbc2ec4162bab2c3a83a6505))
* **release-assets:** restore auto-publish after asset upload ([9e8c06d](https://github.com/remoun/ahwa/commit/9e8c06d7ce6b7f3d74107cff0ce32876dd3ccd93))
* **release-assets:** restore auto-publish after asset upload ([dfdb978](https://github.com/remoun/ahwa/commit/dfdb978dfc4a97ab294cd3478118ee95ab786330))
* **release-assets:** set GH_REPO env so gh works before checkout ([ded8d47](https://github.com/remoun/ahwa/commit/ded8d4722f81779213c5fd635ba7aa1b4d508afd))
* **release-assets:** set GH_REPO so gh works before checkout ([b894687](https://github.com/remoun/ahwa/commit/b89468750e021dae16d2f4f260b9010b959cfcc0))
* **release-assets:** wrap tarball in ahwa-VERSION/ directory ([3235a1d](https://github.com/remoun/ahwa/commit/3235a1d275c0490c7916d897a75f7ea5063b83ec))
* **release:** drop inline release-type so release-please reads the config ([2637ef4](https://github.com/remoun/ahwa/commit/2637ef49eab35d228ce46347ac4617710246e277))
* **release:** read draft:true from config (was silently ignored) ([f29947f](https://github.com/remoun/ahwa/commit/f29947f7ec047acc293acd36d9fa66e3e24cb700))
* **smoke:** pin _smoke council to Haiku 4.5 for stability ([06d7db6](https://github.com/remoun/ahwa/commit/06d7db68106b88d061175555999d20168d59b771))
* yield to event loop between merged persona token events ([7e4007a](https://github.com/remoun/ahwa/commit/7e4007af80070ad2088bdfa1abbb579667883d4d))
* yield to event loop between merged persona token events ([789c464](https://github.com/remoun/ahwa/commit/789c464a51b1f8795cfe7682b42324661c2d2072))
* **yunohost:** make lint catalog-tolerant + add shellcheck ([3d2e47f](https://github.com/remoun/ahwa/commit/3d2e47fc7dd571de4bacd4c1cbe9d210b495bfff))
* **yunohost:** package_check args are env vars, not CLI flags ([ddbe2d2](https://github.com/remoun/ahwa/commit/ddbe2d2559f219722808905086cb14a156e3d7b0))


### Reverts

* drop Nemotron pin on _smoke council ([0f5cfe8](https://github.com/remoun/ahwa/commit/0f5cfe830d3f0006075c3abe16c463f5fc74da7c))

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

# First Cowork session prompt

Paste this into Cowork with all four project files attached (CLAUDE.md,
default.json, federation.json, historian.json).

---

I'm starting a new FOSS project called Ahwa — a privacy-first, multi-persona
AI deliberation tool. The four attached files are the complete project spec.
Read CLAUDE.md first; it contains the architectural invariants, milestone
plan, data model, and working-style guidance (including strict red-green
TDD, tests-as-executable-documentation, and minimal-screen-time reporting).
Read it carefully before doing anything else.

**Context you should know:**

- I'm recovering from eye surgery and driving this largely by voice. Follow
  the "Reporting back to the user" section of CLAUDE.md: one-sentence status
  leads, binary/multiple-choice questions, no long code reads unless I ask.
- The project stack is locked: Bun, SvelteKit, SQLite via bun:sqlite,
  Drizzle, Zod, Tailwind, Vercel AI SDK. Do not relitigate these.
- The twelve architectural invariants in CLAUDE.md are load-bearing. If
  anything you're about to do would break one of them, stop and ask.
- Tests are executable documentation, written red-green-refactor-commit.
  Every test name describes observable behavior.

**Scope for this session: M0 Foundation only.**

Per CLAUDE.md, M0 is a half-weekend checkpoint, not a shippable milestone.
Its purpose is to prove the architectural invariants hold in real code
before I invest in scaffolding around them.

The M0 definition of done:

1. Repo scaffolded: SvelteKit + Bun + Drizzle + SQLite + Zod + Tailwind
2. Data model from CLAUDE.md expressed as Drizzle schema — all seven tables,
   with `is_demo` on `tables`, `visible_to` on `turns`, and `requires` on
   `personas`
3. `councils/default.json` and `councils/federation.json` load successfully
   at startup and populate the councils and personas tables
4. One happy-path deliberation runs end-to-end:
   - User types a dilemma, clicks a button
   - A new row in `tables` is created, hardcoded to the default council
   - For each persona, a streaming LLM call is made (Anthropic provider
     only at this stage — hardcode `claude-sonnet-4-5`)
   - Each token becomes a typed SSE event (`token`, `persona_turn_started`,
     etc., per invariant #4)
   - The frontend renders turns as they stream in
   - After opening round + one cross-examination round, the synthesizer
     runs and produces the final recommendation
   - All turns and the synthesis are persisted
5. Vitest wired up with `bun test`. At least one red-then-green cycle
   completed — I want to see evidence the TDD loop works end-to-end before
   real work starts.

**Out of scope for M0** (do not build these now):

- Table list / history UI (M1)
- Persona or council editing UI (M1)
- Markdown export (M1)
- Multi-provider routing (M1)
- Any error handling beyond "it crashed, here's why"
- Any styling beyond Tailwind defaults — legibility only

**How I want you to work:**

1. Start by proposing a sequenced plan for M0 as a list of 6-10 discrete
   tasks, each with a testable behavior. Wait for my approval before
   starting.
2. For each task: write the test first, run it to confirm it fails for
   the right reason, implement, confirm green, commit. Describe each step
   in one or two sentences; don't read code aloud unless I ask.
3. Before any decision not explicitly covered by CLAUDE.md (which test
   runner plugin, which SSE library, which UUID generator), pause and
   ask me with binary or multiple-choice options.
4. Commit messages: conventional-commits style, lowercase imperative.
   E.g. `feat: scaffold drizzle schema for parties, tables, turns`.

Begin by reading the four files, then propose the M0 task sequence.

# CLAUDE.md

Behavioral and project rules for this repo. These rules intentionally bias toward caution, small diffs, and verifiable progress.

## 1. Think before coding

Before implementing:

- State assumptions explicitly.
- Surface tradeoffs instead of silently choosing.
- Push back when a simpler approach exists.
- Ask only when ambiguity blocks a safe implementation; otherwise make the smallest reasonable assumption and document it.

## 2. Simplicity first

Minimum code that solves the current problem.

- No features beyond what was asked.
- No abstractions for single-use code.
- No speculative configurability.
- No defensive error handling for impossible scenarios.
- If a change can be 50 lines instead of 200, rewrite it smaller.

## 3. Surgical changes

Touch only what the task requires.

- Do not refactor adjacent code unless required.
- Do not reformat unrelated files.
- Match existing style.
- Remove only imports/variables/functions made unused by your own change.
- Mention unrelated dead code; do not delete it unless asked.

## 4. Goal-driven execution

For implementation tasks, define verifiable goals before editing.

Example:

```text
1. Add source probe command -> verify: command writes metadata fixture.
2. Add unit test for invalid Socrata response -> verify: test fails before fix, passes after.
3. Wire command into package script -> verify: Bun command succeeds.
```

## Project-specific rules

- Keep the MVP TypeScript-only.
- Public serving runs through `apps/web` and `packages/db`.
- Heavy data work runs locally through `tools/pipeline` and writes artifacts; do not run heavy analytics inside a public request path.
- Do not add hosted Postgres, PostGIS, Python, or a VPS without a documented requirement in `knowledge/wiki/engineering/package_structure.md` or a new ADR under `docs/decisions/`.
- Treat `knowledge/` as the LLM-maintained wiki. Update `knowledge/index.md` and `knowledge/log.md` when durable project decisions change.
- Do not edit immutable source captures under `knowledge/raw/` except to add new captures or metadata.

## Verification defaults

Run the smallest relevant checks after a change:

- Type changes: `bun run check:types`
- Package changes: `bun --filter <package> test`
- Worker/app changes: `bun --filter @bp/web build`
- Pipeline changes: `bun --filter @bp/pipeline-v2 test` and one fixture-backed command

If a check cannot run, say exactly why.

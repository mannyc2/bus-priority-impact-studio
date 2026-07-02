# Plan 027: Effect the pipeline seams — retries, concurrency, ingest

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Read first**: `docs/decisions/0019-effect-runtime-for-pipeline.md`, the
> effect-ts skill at `/home/cjpher/.codex/skills/effect-ts/` (especially
> `guide-retries.md`, `guide-schedule.md`, `guide-layers.md`,
> `guide-testing.md`), and `tools/pipeline-v2/src/effect/runtime.ts`.

## Status

- **Priority**: P3
- **Effort**: M (repeatable slices; stop when the wins stop)
- **Risk**: LOW (local pipeline only; fixture-tested)
- **Depends on**: plan 019; plan 024 first (don't migrate commands slated
  for deletion — 024 removes ~126 of them)
- **Category**: migration
- **Planned at**: 2026-07-01

## Why this matters

Plan 015 built the foundation (runtime, `PipelineFileSystemService`, local-DB
services, schema-tagged errors) but adoption stopped at **13 of 185
commands (7%)**, and the concerns Effect is actually good at are still
hand-rolled at the seams:

- retry/backoff loops in `tools/pipeline-v2/src/lib/http-file-download.ts:167-194`,
  `lib/soda3.ts` (caller-owned retryCount/retryDelayMs), and `lib/llm.ts`
  (hand-rolled OpenRouter attempt loop);
- ~99 bare `Promise.all/allSettled/race` sites across ingest/map/studio/audit
  with no concurrency limits or structured interruption.

The goal (per the maintainer, 2026-06-30) is "Effect runtime, typed errors,
layers, and services throughout pipeline commands" — approached the way 015
established: behind seams, by slice, LOC-reducing. Not a big-bang rewrite,
and `@liche/core` stays (ADR-0019 rejected replacing the 38-LOC CLI shell).

## Current state

- Effect services live in `tools/pipeline-v2/src/effect/` (runtime, errors,
  file-system, d1-replay, local-db*, route-*). Post-024 command count will
  be ~60; the untouched majority are ingest/build/export/publish commands on
  plain Promises.
- Highest-traffic Promise seams (post-024): the `ingest/*` family (~6.8
  kLOC; paginated SODA3 fetches), `map/artifacts.ts` (1,281 LOC parallel
  tile/geometry work), `studio/release.ts` (756 LOC batch orchestration).
- Retry helpers above; concurrency is unbounded `Promise.all` — the
  practical symptom is Socrata rate-limit flakiness on big backfills and
  no cancellation story.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Pipeline typecheck | `bun --filter @bp/pipeline-v2 typecheck` | exit 0 |
| Pipeline tests | `bun --filter @bp/pipeline-v2 test --timeout 5000` | pass |
| One fixture command per slice | `bun --filter @bp/pipeline-v2 cli -- <cmd> --json` on fixtures | unchanged output |

## Scope

**In scope**:

- `tools/pipeline-v2/src/effect/http.ts` (new): one HTTP-with-retry service
  (Effect `Schedule`-based exponential backoff + jitter, typed
  `HttpRequestError`/`RateLimitError`), used by soda3, file downloads, and
  llm provider calls
- Converting the three retry sites to it; deleting their loops
- Bounded concurrency (`Effect.all` with `concurrency: n`) for the ingest
  family, `map/artifacts.ts`, and `studio/release.ts`
- Per-slice conversion of command workflows to `Effect.fn` following the
  existing service patterns

**Out of scope**:

- Browser/Worker Effect (plan 026), `@liche/core`, zod→Effect Schema in
  domain (both rejected in ADR-0019 and the 013-rejection notes)
- `@effect/sql` (rejected: Drizzle already covers it)
- Migrating commands 024 deletes

## Steps

### Step 1: The HTTP service

Build `effect/http.ts` per the retries/schedule guides; port
`http-file-download.ts` to it first (smallest consumer), fixture test proving
retry-on-failure then success, identical file output.

### Step 2: soda3 + llm on the service

Move retry ownership out of callers into the service; delete the hand-rolled
loops. The llm provider seam keeps its interface (callers see the same
Promise-shaped `lib/` API if that keeps the slice small — Effect behind the
seam is the 015 doctrine).

### Step 3: Bounded concurrency in the big three

ingest family, `map/artifacts.ts`, `studio/release.ts`: replace bare
`Promise.all` fan-outs with `Effect.all { concurrency }` inside the
workflow; pick limits from observed Socrata behavior (start: 4 for network,
CPU-count for local transforms). Each conversion is its own commit with a
fixture-backed before/after output check.

### Step 4: Stop on diminishing returns

After the big three, convert further command families only when a slice
deletes more code than it adds or fixes a real flakiness. Record the final
adoption ratio and what was deliberately left alone in `knowledge/log.md`.

**Verify (every step)**: pipeline typecheck + tests; one real fixture-backed
command run with byte-identical (or explained) output.

## Test plan

- New: http service retry/backoff tests (deterministic clock via Effect
  TestClock — see `guide-testing.md`).
- Existing pipeline tests stay green throughout; fixture-backed command runs
  per slice.

## Done criteria

- [ ] One HTTP retry service; zero hand-rolled retry loops in `lib/`.
- [ ] Ingest, map artifacts, and studio release run under bounded
      concurrency.
- [ ] Net LOC change ≤ 0 for the touched seams (Effect must pay for itself).
- [ ] Adoption ratio + leave-alone list recorded; `plans/README.md` updated.

## STOP conditions

- A slice grows LOC without deleting a loop/helper — wrong seam; back out.
- Output diffs on fixture commands you cannot explain byte-for-byte.
- The temptation to migrate `@liche/core` or domain schemas — re-read
  ADR-0019's rejections.

## Maintenance notes

- Plan 029 (nyc-transit-kit adoption) will delete some of the source-client
  code this plan touches; that is fine — the retry service is the seam the
  kit's clients will also be called through, per this repo's side.

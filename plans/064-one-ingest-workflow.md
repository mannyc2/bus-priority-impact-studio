# Plan 064: One ingest workflow — extend the existing factory, collapse the copy-pasted commands

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 4c1afe7..HEAD -- tools/pipeline-v2/src/commands/ingest tools/pipeline-v2/src/lib tools/pipeline-v2/src/effect tools/pipeline-v2/test`
> If plan 062 landed first (expected), `commands/pipeline/` is already
> gone — that is fine. Compare the "Current state" excerpts against the
> live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M-L
- **Risk**: MED
- **Depends on**: 062 recommended first (removes one consumer of ingest
  runners); MUST land before plan 066 (fewer descriptors to migrate)
- **Category**: tech-debt (duplicated workflows)
- **Planned at**: commit `4c1afe7`, 2026-07-06

## Why this matters

Twenty-two ingest commands each hand-assemble the same workflow — load
manifest → resolve source → fetch Socrata rows → normalize → write raw
snapshot → replace/upsert local tables → summarize counts — with ad-hoc
parameter DI (`inputs.fetcher ?? realFetch`) and copy-drifted error
handling. The repo already contains the correct abstraction:
`lib/socrata-monthly-ingest.ts` (116 LOC) is a config-driven factory that
exactly one command (`bus-wait-assessment`) adopted. This plan finishes
that adoption: a sibling factory for the non-monthly full-replace grain,
both wired into a command-definition helper so each ingest command
becomes a ~30-line config module. Expected net: −800 to −1,000 LOC, one
place to change snapshot/error/report behavior, and a much smaller
surface for plan 066's schema migration. Fixture tests keep passing
UNCHANGED — that is the parity proof.

## Current state

All excerpts verified 2026-07-06.

### The proven factory (pattern to extend, not redesign)

`tools/pipeline-v2/src/lib/socrata-monthly-ingest.ts:59-63`:

```ts
export function defineSocrataMonthlyIngest<Row, Extra extends Record<string, unknown>>(
  config: SocrataMonthlyIngestConfig<Row, Extra>,
): (inputs: SocrataMonthlyIngestInputs) => Promise<SocrataMonthlyIngestResult<Extra>> {
```

Config carries `sourceId`, `rawDir`/`rawFilePrefix`, `query()`,
`normalize()`, `replaceRows()`, `summarize()`; inputs carry the test
seams (`fetcher`, `manifestText`, `snapshotPath`, `fetchedAt`). Sole
adopter: `commands/ingest/bus-wait-assessment.ts`.

### A representative duplicate (the shape repeated ~20×)

`commands/ingest/ace-routes.ts` (86 LOC total): exports
`runAceRoutesIngest(inputs)` which inlines the identical
manifest→source→fetch→normalize→`replaceAceRoutes`→
`writeRawSourceSnapshot`→counts workflow, then:

```ts
export default defineCommand({
  path: ["ingest", "ace-routes"],
  summary: "Fetch ACE/ABLE route implementation rows and replace the local table.",
  input: { options: dbOptions },
  output: z.object({ rawPath: z.string(), routeCount: z.number(), aceCount: z.number(), ableCount: z.number() }),
  async run({ input }) {
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "ingest.ace-routes",
      operation: "runAceRoutesIngest",
      run: (local) => runAceRoutesIngest({ local }),
    });
  },
});
```

### The 22 runner exports (`rg 'export (async )?function run\w+Ingest'`)

runAceRoutesIngest, runAceViolationsIngest,
runBusCustomerJourneyMetricsIngest, runBusLanesIngest,
runBusWaitAssessmentIngest (already factory-built),
runDotStreetPermitsIngest, runDotTrafficSpeedsIngest,
runDotTrafficVolumesIngest, runEquityContextIngest, runGtfsStaticIngest,
runLionCenterlineIngest, runNoaaWeatherIngest, runNyc311Ingest,
runNypdCollisionsIngest, runParkingViolationsIngest,
runRouteCatalogIngest, runRouteCoverageIngest,
runRouteHourlyRidershipIngest, runRouteSchedulesBulkIngest,
runRouteSchedulesIngest, runRouteSegmentSpeedsIngest, runRouteTrendsIngest.

Fixture tests import these runners directly (e.g.
`test/commands/ingest/ace-routes.test.ts` imports `runAceRoutesIngest`) —
the exported NAME and SIGNATURE of every migrated runner must not change.

### Classification (executor re-verifies each in Step 1)

- **Batch A — full-replace Socrata JSON** (no year/month; workflow =
  fetch all → normalize → replace table → snapshot): ace-routes,
  ace-violations, bus-lanes, equity-context, route-catalog, and any other
  runner whose body matches the ace-routes shape.
- **Batch B — monthly Socrata** (year/month inputs; candidates:
  dot-traffic-speeds, dot-traffic-volumes, dot-street-permits,
  nypd-collisions, parking-violations, 311-service-requests,
  bus-customer-journey-metrics, express-bus-capacity, route-trends,
  route-hourly-ridership, route-segment-speeds, route-coverage,
  noaa-weather): migrate onto the EXISTING
  `defineSocrataMonthlyIngest` exactly as bus-wait-assessment did.
- **Bespoke — LEAVE AS-IS** (genuinely different I/O): gtfs-static
  (zip/CSV), route-schedules + route-schedules-bulk (CSV spool),
  gtfs-rt-snapshots (protobuf), lion-centerline (large file), the
  socrata-csv-snapshot pair, and anything whose body diverges beyond
  query/normalize/replace/summarize. Do NOT force these into the factory.

### Rider: unmanaged Effect.runPromise

`tools/pipeline-v2/src/effect/concurrency.ts:10-20`:

```ts
export function runBoundedPromises<T, U>(
  values: readonly T[], concurrency: number, run: (value: T) => Promise<U>,
): Promise<U[]> {
  return Effect.runPromise(
    Effect.forEach(values, (value) => Effect.tryPromise(() => run(value)), {
      concurrency: Math.max(1, concurrency),
    }),
  );
}
```

`Effect.runPromise` here bypasses the pipeline's managed-runtime
convention (ADR-0019). Route it through the same runtime entry the
services use (see `effect/runtime.ts`, 14 LOC — reuse its runtime rather
than creating another). Callers (`studio/release.ts`,
`ingest/route-schedules.ts`, `map/artifacts.ts`) must not need edits.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Pipeline typecheck | `bun --filter @bp/pipeline-v2 typecheck` | exit 0 |
| Pipeline tests | `bun --filter @bp/pipeline-v2 test` | all pass — ingest fixture tests UNCHANGED |
| Registry snapshot | (part of pipeline tests) | command paths unchanged by this plan |
| Repo unit tests | `bun run test:unit` | all pass |
| One real smoke (operator-run if keys needed) | `bun run pipeline -- ingest ace-routes --json` | exits 0, same JSON keys as before |
| Style | `bun run check:style` | exit 0 |

## Scope

**In scope**:
- CREATE `tools/pipeline-v2/src/lib/socrata-replace-ingest.ts` (the
  full-replace sibling of the monthly factory; same config/inputs idiom,
  same test seams)
- CREATE `tools/pipeline-v2/src/commands/ingest/_define-ingest-command.ts`
  (helper that takes {path, summary, extra options?, output schema,
  runner, resultToOutput?} and returns the `defineCommand` descriptor with
  the standard `runLocalDbCommandBoundary` wiring — the 15 lines every
  command repeats)
- EDIT the Batch A + Batch B command files (config-module rewrite; keep
  `run*Ingest` export names/signatures and snapshot paths byte-identical)
- EDIT `tools/pipeline-v2/src/effect/concurrency.ts` (rider)
- `tools/pipeline-v2/test/**` — only if a fixture test asserts on an
  internal detail the factoring legitimately moved (record each such edit
  in the PR description; the default is ZERO test edits)
- `knowledge/log.md`, `plans/README.md`

**Out of scope** (do NOT touch):
- The bespoke ingest commands listed above (beyond optionally adopting
  `_define-ingest-command.ts` for their descriptor block ONLY if zero-risk)
- `packages/sources/**` (normalizers stay where they are; plan 065 owns
  that package)
- Any schema-dialect migration (`z.*` stays for now — plan 066)
- `lib/soda3.ts`, `lib/source-snapshots.ts` internals (consumed as-is)

## Git workflow

- Branch: `codex/064-one-ingest-workflow`
- Commit per batch; short imperative subjects.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Classify by reading, not by list

For each of the 22 runners, read its body and bucket it A / B / bespoke.
Produce the table in your notes (runner, bucket, source of any deviation
from the ace-routes shape). My Batch A/B lists above are hypotheses from
sampling — YOUR reading decides; a runner with any extra I/O step beyond
query/normalize/replace/summarize goes to bespoke.

**Verify**: table complete; bespoke set includes at least gtfs-static,
route-schedules(-bulk), gtfs-rt-snapshots.

### Step 2: Build `socrata-replace-ingest.ts` + the command helper, prove on ace-routes

Model the new factory line-by-line on `socrata-monthly-ingest.ts` (same
inputs type minus year/month, same seams). Write
`_define-ingest-command.ts`. Rewrite `ace-routes.ts` as the first config
module: `runAceRoutesIngest` becomes
`export const runAceRoutesIngest = defineSocrataReplaceIngest({...})` —
same name, same input/result types.

**Verify**: `bun --filter @bp/pipeline-v2 test` — the EXISTING
`ace-routes.test.ts` passes without modification. Typecheck exit 0.

### Step 3: Migrate the rest of Batch A, then Batch B

One commit per 3-4 commands. Batch B uses the existing monthly factory —
`bus-wait-assessment.ts` is the exemplar to copy. After each commit run
the pipeline test suite.

**Verify**: after the final batch — all pipeline tests pass; every
migrated file is under ~60 LOC
(`wc -l` each; record the before/after totals);
`rg -c "writeRawSourceSnapshot" tools/pipeline-v2/src/commands/ingest`
only matches bespoke files + the factories.

### Step 4: Rider — managed runtime for bounded concurrency

Rewire `runBoundedPromises` through the shared pipeline runtime (reuse
`effect/runtime.ts`; no new runtime, no signature change).

**Verify**: pipeline tests + `bun run test:unit` all pass.

### Step 5: Record

`knowledge/log.md` entry with the LOC delta table; README row.

**Verify**: `bun run check:style` exit 0; `git status` clean outside
scope.

## Test plan

The design goal is ZERO fixture-test edits — existing
`test/commands/ingest/*.test.ts` files exercising the `run*Ingest` seams
are the parity proof. Add exactly two new tests:
`test/lib/socrata-replace-ingest.test.ts` (factory happy path + snapshot
write, modeled on the existing monthly factory's usage in
bus-wait-assessment's test) and one test asserting
`_define-ingest-command.ts` produces a descriptor whose `run` routes
through `runLocalDbCommandBoundary` (behavioral: invoke with a fixture DB
path, assert result shape).

## Done criteria

- [ ] Every Batch A/B command is a config module ≤ ~60 LOC; runner names
      and result shapes unchanged (`rg 'export const run\w+Ingest'` +
      existing tests green without edits)
- [ ] `socrata-replace-ingest.ts` + `_define-ingest-command.ts` exist with
      tests
- [ ] Bespoke commands untouched (git diff shows no edits there, except
      optional descriptor-helper adoption)
- [ ] `effect/concurrency.ts` no longer calls bare `Effect.runPromise`
- [ ] Pipeline typecheck/tests, `test:unit`, style all exit 0
- [ ] Net LOC reduction ≥ 600 across `commands/ingest/**` (report actual)
- [ ] Log entry + README row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Keeping a runner's exported signature identical proves impossible for
  some command without editing its fixture test — report which and why
  (one or two justified test edits are tolerable; systematic rewriting is
  not).
- A Batch B candidate's month semantics differ from the factory's
  (`sourceId(isoMonth)`/rawPath conventions) in a way that would change
  its SNAPSHOT PATH on disk — snapshot paths are operator data-layout
  contract (plans 038/039); never silently change one.
- The concurrency rider requires touching its three callers.
- Plan 066 landed first (descriptor dialect changed under you) — rebase
  is mechanical but confirm ordering with the operator.

## Maintenance notes

- New sources should be added as config modules; if you find yourself
  adding a parameter to BOTH factories, consider merging them then (not
  preemptively).
- Plan 066 migrates the factories' `z.*` output schemas + `dbOptions` to
  native Effect Schema — after THIS plan, that migration touches 2
  factories + ~5 bespoke files instead of 22 commands.
- The typed-error upgrade (fetch/decode failures as tagged errors through
  the boundary) was deliberately kept OUT of scope to keep parity
  provable; it composes naturally when the factories are the only
  workflow owners. Named follow-up, not planned.
- Reviewer should scrutinize: byte-identical snapshot paths (grep the
  diff for `data/raw/` strings) and the Step 1 classification table.

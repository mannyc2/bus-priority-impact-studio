---
title: Local Pipeline DB Cutover Plan
type: engineering
status: draft
last_updated: 2026-04-28
owner: codex
tags: [pipeline, sqlite, drizzle, json-cleanup, d1, architecture]
---

# Local Pipeline DB Cutover Plan

## Goal

Reduce code volume and complexity by replacing DB-shaped JSON handoff files with one canonical local pipeline database.

The target architecture is:

```text
source clients + analytics transforms
  -> @bp/db/local tables
  -> @bp/db/d1 projection export
  -> Worker reads @bp/db/d1 queries
```

D1 remains a compact public serving projection. The local pipeline DB becomes the canonical build state for local development, replay, export verification, and future Postgres migration planning.

## Why this should simplify the repo

Current pipeline code repeatedly does the same work:

- Builds paths for intermediate JSON.
- Reads JSON into memory.
- Parses with Zod.
- Rejoins arrays that are already relational.
- Writes new JSON for the next step.
- Repeats table mapping again inside `export-d1.ts`.

This creates many small contracts that are hard to review because the real dependency graph is hidden in file paths.

Current hotspots from the April 28 audit:

| Area | Current signal |
|---|---:|
| `tools/pipeline/src` + `packages/db/src` TypeScript | about 11,233 LOC |
| `tools/pipeline/src/jobs/export/export-d1.ts` | 918 LOC |
| `tools/pipeline/src/jobs/export/verify-d1-export.ts` | 447 LOC |
| DB-shaped JSON writers in pipeline jobs | 40+ write sites |
| D1 serving query modules | about 1,508 LOC after Drizzle cutover |

The local DB should delete code by moving common persistence, upsert, list, and projection logic into typed repositories.

## Non-goals

- Do not make D1 the canonical pipeline database.
- Do not add Postgres until hosted canonical history is actually needed.
- Do not add DuckDB until one concrete query or dataset proves SQLite is inadequate.
- Do not preserve JSON handoffs as permanent compatibility layers.
- Do not let `apps/web` import `@bp/db/local`.

## Package Shape

Keep database ownership in `packages/db`, with explicit subpath APIs:

```text
packages/db/
  drizzle.config.d1.ts
  drizzle.config.local.ts
  drizzle.config.pg.ts                  # future only
  migrations/
    d1/
    local/
    pg/                                 # future only
  src/
    d1/
      schema.ts
      client.ts
      queries/
      seed/                             # temporary while seed.sql exists
    local/
      schema.ts
      client.ts
      index.ts
      repositories/
        route-catalog.ts
        route-coverage.ts
        route-readiness.ts
        route-build-plan.ts
        route-batches.ts
        route-artifacts.ts
        route-trends.ts
        route-context.ts
        source-runs.ts
    pg/
      schema.ts                         # future canonical hosted DB
    shared/
      constants.ts
```

Exports:

```json
{
  "./local": "./src/local/index.ts",
  "./local/schema": "./src/local/schema.ts",
  "./d1": "./src/d1/index.ts",
  "./d1/schema": "./src/d1/schema.ts"
}
```

Boundary rules:

- `@bp/db/local` owns canonical local pipeline tables and repositories.
- `@bp/db/d1` owns public serving tables and Worker query helpers.
- `@bp/db/shared` owns constants only, not table schemas.
- `tools/pipeline` may import `@bp/db/local` and D1 export code may also import `@bp/db/d1`.
- `apps/web` may import `@bp/db/d1` only.
- `@bp/db/local` and `@bp/db/d1` should not share Drizzle table definitions.

## Local DB File

Default path:

```text
data/local/pipeline.sqlite
```

Required helpers:

```ts
createLocalPipelineDb(path?: string)
migrateLocalPipelineDb(path?: string)
resetLocalPipelineDb(path?: string) // test/dev only
```

Pipeline commands should accept:

```text
--db data/local/pipeline.sqlite
```

Default command behavior should create and migrate the DB automatically for local development.

## Data Ownership

### Store In Local DB

Use local DB tables for data that is relational, queryable, reused across jobs, or projected into D1:

- source run metadata
- source probe results
- source snapshot metadata
- route catalog
- route types
- route directions
- route stops metadata
- route shapes metadata and artifact keys
- route/month coverage
- route readiness
- route build plan
- route batch status/issues
- route artifact manifests
- route scorecards
- route brief summary rows
- route/month trends
- route reliability baselines
- route equity context
- intervention summaries

### Keep As Files

Keep JSON or GeoJSON only when file shape is the product or a useful debug/source artifact:

- raw source snapshots
- Socrata metadata sidecars
- GeoJSON route segment/map artifacts
- PMTiles or future tile artifacts
- route brief inputs and generated brief bodies intended for R2/static serving
- batch audit reports meant for humans
- small fixtures in tests

## Schema Strategy

Start with SQLite through Drizzle.

Use separate local schema tables instead of copying D1:

- Local DB can be wider and more normalized than D1.
- D1 should stay compact and public-read optimized.
- D1 export is a projection from local schema to serving schema.
- Future Postgres can follow local schema more closely than D1 if we need hosted canonical history.

Initial local schema groups:

```text
source_run
source_snapshot
source_probe_result

route_catalog
route_catalog_type
route_direction
route_month_coverage

route_readiness
route_readiness_missing_input
route_build_plan

route_batch
route_batch_route
route_batch_issue
route_artifact
```

Later groups:

```text
route_scorecard
route_scorecard_citation
route_brief_summary
route_brief_peak_window
route_brief_slowest_window
route_month_trend
route_reliability_baseline
route_reliability_gap_window
route_equity_context
route_intervention_month
```

## Repository Style

Local repositories should hide table details from pipeline jobs.

Preferred shape:

```ts
await upsertRouteCatalog(db, {
  routes,
  routeTypes,
  directions,
  sourceRunId,
});

const catalog = await listRouteCatalog(db);
```

Avoid:

- Exposing Drizzle table objects to `tools/pipeline`.
- One repository file per tiny child table.
- Generic "DB-like" interfaces.
- String-built SQL for normal pipeline writes.
- JSON parsing as a normal handoff mechanism.

## Cutover Slices

### Slice 1: Local DB Foundation

Add:

- `packages/db/drizzle.config.local.ts`
- `packages/db/src/local/schema.ts`
- `packages/db/src/local/client.ts`
- `packages/db/src/local/index.ts`
- `packages/db/migrations/local/`
- package exports and scripts

Scripts:

```json
{
  "db:generate:local": "drizzle-kit generate --config drizzle.config.local.ts",
  "db:migrate:local": "bun tools/pipeline/src/jobs/local-db/migrate-local-db.ts"
}
```

Acceptance:

- Empty local DB can be created and migrated.
- Package tests use an in-memory or temp-file SQLite DB.
- No pipeline jobs are cut over yet.

### Slice 2: Network Base Tables

Cut over:

- `ingest-route-catalog.ts`
- `ingest-route-month-coverage.ts`
- `route-readiness.ts`
- `route-build-plan.ts`

Delete or demote:

- `data/working/network/route-catalog.json` as a required handoff
- `route-month-coverage-*.json` as a required handoff
- batch `route-readiness.json` as required input
- batch `route-build-plan.json` as required input

Keep optional debug exports only behind an explicit flag:

```text
--debug-json
```

Expected simplification:

- Route readiness reads catalog and coverage from local DB.
- Build plan reads readiness from local DB.
- Export D1 reads these rows from local DB.
- Repeated `Bun.file(...).json()` and Zod file schemas disappear from these paths.

Acceptance:

- Existing route readiness/build-plan tests pass against local DB fixtures.
- `verify:d1` no longer reads network base JSON files.
- D1 export row counts match current output.

### Slice 3: Batch And Artifact Metadata

Cut over:

- `planned-route-batch.ts`
- `route-batch-audit.ts`
- `m1-artifact-manifest.ts`
- D1 export route artifact reads

Local tables:

- `route_batch`
- `route_batch_route`
- `route_batch_issue`
- `route_artifact`

Expected simplification:

- Batch membership and audit status stop being parsed from separate JSON files.
- D1 export reads route batches and artifacts through one repository.
- Route artifact manifest logic becomes an upsert instead of a file join.

Acceptance:

- D1 `route_batch_*` and `route_artifact` tables project from local DB.
- Human-readable audit JSON remains optional output, not job state.

### Slice 4: Route Brief And Scorecard State

Cut over:

- `m1-route-score.ts`
- `m1-route-brief-input.ts`
- `route-comparison.ts`
- D1 route scorecard/brief/comparison export

Local tables:

- `route_scorecard`
- `route_scorecard_citation`
- `route_brief_summary`
- `route_brief_peak_window`
- `route_brief_slowest_window`
- `route_comparison_rank`

Expected simplification:

- Route comparison reads score/brief rows from local DB.
- D1 export no longer opens every route slice directory for scorecard and brief rows.
- Route brief input JSON can remain as R2/static product artifact only.

Acceptance:

- Worker route scorecard test still passes.
- D1 route brief and comparison rows match current export.
- Required route brief JSON handoff is deleted.

### Slice 5: Trends, Reliability, Equity

Cut over:

- `ingest-route-trends.ts`
- `backfill-route-ridership-trends.ts`
- `route-reliability-baseline.ts`
- `route-equity-context.ts`
- D1 export for trend/reliability/equity tables

Local tables:

- `route_month_trend`
- `route_reliability_baseline`
- `route_reliability_gap_window`
- `route_month_source_status`
- `route_equity_context`

Expected simplification:

- Ridership backfill updates rows instead of rewriting a trend JSON artifact.
- Source status becomes one shared local table.
- D1 export stops reading trend and context JSON files.

Acceptance:

- Re-running trend backfill is idempotent.
- Route/month trend row count matches current export.
- Reliability and equity repository tests pass against local DB-seeded projections.

### Slice 6: Source Runs And Raw Snapshot Metadata

Cut over metadata only:

- source probe summaries
- Socrata row counts
- source snapshot metadata
- source freshness/status reports

Keep raw response bodies as files when needed.

Expected simplification:

- Source freshness and route source status can be queried from local DB.
- Metadata sidecars are no longer the only source of truth.

Acceptance:

- Source probe tests still write fixture-backed outputs where useful.
- Local DB can answer "what data was used for this month/export?"

### Slice 7: D1 Export Cleanup

After prior slices, rewrite `export-d1.ts`.

Target shape:

```text
load local DB
read projection inputs through @bp/db/local repositories
write D1 projection rows through one projection module
write seed.sql only if needed by deployment workflow
```

Split modules:

```text
tools/pipeline/src/jobs/export/
  export-d1.ts                 # orchestration only
  project-d1-serving.ts         # local rows -> D1 rows
  write-d1-seed-sql.ts          # temporary
```

Delete `@bp/db/d1/seed` once `seed.sql` is removed or isolated behind one writer.

Acceptance:

- `export-d1.ts` drops from about 918 LOC to a small orchestration file.
- `verify-d1-export.ts` verifies D1 projection from local DB, not JSON.
- No normal export path reads DB-shaped JSON.

## Deletion Targets

Delete these categories as each slice lands:

- File path helpers whose only job is locating intermediate JSON tables.
- Zod schemas that validate internal JSON handoff files only.
- JSON loaders in build jobs.
- JSON summary writers used only by another job.
- Duplicate D1 export mappers already represented in local repositories.
- Seed SQL string helpers once Drizzle or a single projection writer replaces hand-built DML.

Keep:

- Domain Zod schemas used at external boundaries.
- Source DTO validation.
- Worker response validation.
- Test fixtures.
- Human-readable debug/audit outputs when intentionally requested.

## Review Criteria

Every cutover PR should answer:

1. Which JSON handoff is no longer required?
2. Which code path now reads/writes local DB rows?
3. Which files or helpers were deleted?
4. Which D1 projection rows are unchanged?
5. Which tests prove idempotent reruns?

Prefer a smaller feature slice only if it deletes or isolates old code. Avoid adding local DB writes while keeping JSON as the primary state path.

## Success Metrics

Track these after each slice:

| Metric | Direction |
|---|---|
| `tools/pipeline/src` LOC | down |
| Required `writeJson` calls in jobs | down |
| Required `Bun.file(...).json()` handoff reads | down |
| `export-d1.ts` LOC | down sharply |
| Number of required generated JSON table artifacts | down |
| Number of command reruns that are idempotent | up |

Target end state:

- `tools/pipeline/src/jobs/export/export-d1.ts` is orchestration, not a 900+ LOC mapper.
- Pipeline jobs are mostly fetch/transform/upsert.
- D1 export is a projection from local DB tables.
- JSON artifacts are either product artifacts, raw snapshots, debug reports, or tests.

## First Concrete Implementation Step

Start with Slice 1 and Slice 2 together only far enough to prove the pattern:

1. Add `@bp/db/local` schema/client/repository for route catalog and month coverage.
2. Update `ingest-route-catalog` and `ingest-route-month-coverage` to upsert local DB rows.
3. Update `route-readiness` to read those local DB rows.
4. Keep existing JSON output under `--debug-json` or compatibility only for one slice.
5. Update `export-d1` to read catalog/coverage/readiness/build-plan from local DB once build plan is cut over.
6. Delete the compatibility JSON path immediately after parity tests pass.

This gives the fastest feedback because readiness/build-plan are upstream of route selection and D1 export, and their current file handoffs are DB-shaped rather than product artifacts.

---
title: ETL Plan
type: engineering
status: active
last_updated: 2026-04-28
owner: codex
source_count: 20
tags: [etl, ingestion, data-quality, typescript, bun, drizzle, d1, postgres, local-pipeline]
---

# ETL Plan

## Why this matters

The MVP should separate batch computation from public serving. Source probing, historical backfills, geospatial joins, hotspot scoring, and ACE analysis run locally through `tools/pipeline`. The public app reads compact D1 tables and generated artifacts.

See [[wiki/engineering/package_structure|Repo Package Structure]] and [[wiki/engineering/data_model|Data Model]].

## V1 scope update — 2026-05-16

The current v1 finish line is no longer only the original M1/local route MVP. See [[wiki/engineering/data_pipeline_v1_completion_plan|Data Pipeline v1 completion plan]].

Approved v1 scope:

1. GTFS-RT observed reliability and bunching are part of v1.
2. Before/after intervention evaluation is part of v1.
3. The deliverable is the full network pipeline plus a full set of route and corridor briefs.

Current baseline:

- `build:network` has produced a complete March 2026 full-network route build with 381 route slices and 0 failures.
- `@bp/db/local` is the canonical local pipeline DB for current route/catalog/artifact state.
- `export:d1` and `verify:d1` produce and validate the compact serving projection for current route-serving rows.

V1 additions still required:

- Production-length GTFS-RT collection and coverage QA.
- Detailed observed reliability windows beyond route/month summary metrics.
- Seasonality-aware, matched-comparison, and bus-lane intervention evaluation.
- Richer segment-based corridor membership and corridor intervention context.
- `check:pipeline-v1` or equivalent QA gate that verifies every v1 deliverable.

Implemented v1 additions include GTFS-RT collection/parsing, observed headway samples, route/month observed reliability and bunching summaries, descriptive ACE before/after comparisons, primary-street corridor entities/summaries, route/corridor brief body generation, D1 artifact metadata, and route-batch hash/byte verification for generated brief bodies.

## Phase 0: source metadata probes

Command target:

```bash
bun --filter @bp/pipeline sources:probe -- --all
```

Implementation responsibilities:

1. Read `knowledge/raw/source_manifest.yaml`.
2. Fetch Socrata metadata, columns, row counts, and sample rows for each source where possible.
3. Write outputs to `knowledge/raw/metadata/`.
4. Update relevant `knowledge/wiki/data/*.md` pages with exact field names, row counts, source last-updated dates, and caveats.
5. Update `knowledge/wiki/data/source_registry.md`.
6. Append `knowledge/log.md`.

Verification:

- Fixture-backed Socrata probe test passes.
- One live probe can write a metadata JSON file.
- No dataset page claims exact schema before probe results exist.

## Phase 1: local route pilot

Default scope: M1 route pilot, then Manhattan expansion.

Command targets:

```bash
bun run ingest:m1 -- --route M1 --year 2026 --month 3
bun --filter @bp/pipeline ingest:segment-speeds -- --route M1 --month 2026-01
bun --filter @bp/pipeline ingest:routes
bun --filter @bp/pipeline ingest:stops
```

Implementation responsibilities:

1. Fetch selected route/month segment-speed data.
2. Fetch current bus route/stop geometry.
3. Store raw downloads under gitignored `data/raw/`.
4. Store normalized intermediate files under gitignored `data/working/`.
5. Commit only tiny fixtures under `data/fixtures/`.

Verification:

- Row counts are nonzero.
- Expected route IDs exist.
- Required join keys are present and not mostly null.
- Fixture tests cover malformed/missing fields.

## Phase 2: local transforms

Command targets:

```bash
bun run hotspots:m1 -- --route M1 --year 2026 --month 3
bun --filter @bp/pipeline build:segments -- --route M1
bun --filter @bp/pipeline build:hotspots -- --route M1 --month 2026-01
bun --filter @bp/pipeline build:route-score -- --route M1 --month 2026-01
```

Implementation responsibilities:

1. Construct timepoint-to-timepoint route-segment artifacts.
2. Compute speed/travel-time aggregates.
3. Identify hotspot segments with deterministic scoring.
4. Compute route scorecard.
5. Write generated artifacts to `data/artifacts/`.

Verification:

- Segment lengths are positive.
- Speed/travel-time values are nonnegative.
- Hotspot ranking is deterministic.
- Route score is not produced when core source data is missing.

## Phase 3: D1/R2 serving export

Command targets:

```bash
bun --filter @bp/pipeline export:d1 -- --route M1 --month 2026-01
bun --filter @bp/pipeline export:artifacts -- --route M1 --month 2026-01
```

Implementation responsibilities:

1. Generate D1 seed SQL or import-ready rows for compact serving tables.
2. Generate route/corridor brief artifacts and route GeoJSON/map artifacts.
3. Store route artifact keys and hashes in `route_artifact`; store corridor brief artifact keys and hashes in `corridor_artifact`.
4. Upload artifacts to R2 only after local artifact contracts are stable.

Verification:

- D1 local migration applies.
- D1 local seed imports.
- `apps/web` can read scorecard data from local D1.
- Artifact hashes in D1/local metadata match generated files.

## Phase 4: public app

Implementation responsibilities:

1. Add route scorecard page.
2. Add hotspot map page or component.
3. Add source/caveat panel.
4. Add generated route brief view.
5. Keep request-time logic read-only and cheap.

Verification:

- `bun --filter @bp/web build`.
- Worker API returns fixture/local D1 scorecard.
- No public request handler imports `@bp/analytics` or `@bp/sources`.

## Phase 5: optional search/RAG

Do this after the route-score MVP works.

Implementation responsibilities:

1. Search the `knowledge/wiki` corpus and generated route briefs.
2. Provide citations to source pages/artifacts.
3. Never generate metrics with an LLM.

Default: local/static search first. Cloudflare Vectorize or another managed vector store is a later upgrade, not P0.

## Data-quality checks

For every ingested dataset, maintain:

- Source ID and URL.
- Last fetched timestamp.
- Source last-updated timestamp, if available.
- Row count.
- Schema hash or column list.
- Primary key candidate.
- Join-key null rates.
- Known caveats.

## What stays local

- Historical backfills.
- Geospatial route-segment construction.
- Hotspot scoring.
- ACE impact evaluation.
- Large source downloads.
- D1 seed generation.

## Caveats

- Generic command names are targets; `sources:list`, `sources:probe`, `ingest:m1`, and `hotspots:m1` are implemented.
- Exact Socrata field names are confirmed for active MVP sources through source probes, but downstream join contracts still need route-by-route QA.
- The command caveat above is historical and stale for the current branch: route/network commands such as `ingest:route-slice`, `build:routes`, `build:network`, `export:d1`, and `verify:d1` are now implemented. Update this page as v1 docs are fully reset.
- Realtime Bus Time collection is no longer optional for v1 after the 2026-05-16 scope decision.

## Sources

- Cloudflare D1 Worker Binding API — https://developers.cloudflare.com/d1/worker-api/ — verified_at: 2026-04-27
- Cloudflare R2 Workers API docs — https://developers.cloudflare.com/r2/api/workers/workers-api-usage/ — verified_at: 2026-04-26

## Drizzle-aware ETL update — 2026-04-27

### Current branch state

The branch already has a rich local Bun pipeline: source probes, route catalog/coverage ingestion, M1 route slices, hotspot scoring, ridership profiles, route scores, route briefs, route batch audits, and D1 export/verification commands. That is the right shape. Drizzle adoption should not move heavy work into Workers.

### Local historical setup and backfill

Keep these local through `tools/pipeline`:

- full Socrata/schema probes,
- MTA route/stop/schedule source fetches,
- historical segment-speed backfills,
- historical route/month ridership backfills,
- route-shape and timepoint segment construction,
- geospatial joins,
- hotspot scoring,
- ACE/bus-lane historical overlays,
- route-brief generation,
- D1 seed/export SQL generation,
- artifact hashing and R2 upload preparation,
- large QA reports and debug snapshots.

These jobs may read/write local `data/raw`, `data/working`, and `data/artifacts`. They should emit compact D1 rows and R2 artifacts. They should not require hosted D1 to be the warehouse.

### Bounded production/Worker incremental updates

Workers + D1 or Workers + Postgres can handle bounded incremental updates if the local pipeline performs heavy historical setup first.

Suitable Worker tasks:

- refresh one route/month summary from a small source slice,
- update `source_status` / freshness rows,
- write artifact manifest rows after an R2 upload,
- recalculate a small route/month score from already-normalized rows,
- process one bounded queue message per route/month/source,
- trigger a short scheduled source metadata check.

Not suitable Worker tasks:

- full-network historical backfills,
- multi-year source-history compaction,
- route-shape segment construction,
- expensive geospatial joins,
- multi-route ACE event studies,
- large D1 import files,
- large object generation such as PMTiles.

### Drizzle/D1 migration workflow

Use a two-track workflow:

1. **Drizzle schema generation** in `packages/db`.
   - `packages/db/drizzle.config.d1.ts`
   - schema path: `packages/db/src/d1/schema.ts`
   - migration output: `packages/db/migrations/d1`
   - dialect: `sqlite`
   - D1 HTTP driver only for remote Drizzle Kit operations.
2. **Cloudflare D1 application** through Wrangler migrations.
   - Use `bun run db:d1:migrate:local` for local verification.
   - Use `bun run db:d1:migrate:remote` only after local and Worker tests pass and `packages/db/wrangler.d1.jsonc` has the real Cloudflare database ID.
   - Prefer database name over binding name for migration commands to avoid accidental binding drift.

The D1 seed/export path writes DML only. It copies schema SQL from the Drizzle migration journal so generated migrations remain the DDL source of truth.

Do not run `drizzle-kit push` against shared/production D1 for this repo. Generate/review SQL migrations instead.

### Future Postgres migration workflow

Add Postgres only when a requirement forces it. When it appears:

1. Add `packages/db/drizzle.config.pg.ts`.
2. Add `packages/db/src/pg/schema.ts`.
3. Generate Postgres migrations into `packages/db/migrations/pg`.
4. Run Postgres migrations outside Cloudflare D1's migration system.
5. In Workers, access the Postgres database through Hyperdrive using `pg` and `drizzle-orm/node-postgres`.
6. Continue using local Bun pipeline jobs for historical backfills; Workers should perform only bounded incremental updates.

### D1 export verification after JSON cleanup

After product-queryable JSON columns become relational child tables, every D1 export should verify:

- parent rows exist before child rows,
- child-row counts match source artifact counts,
- critical child tables have indexes on `(route_id, month)` or equivalent,
- generated SQL stays below D1 statement and bound-parameter limits,
- each artifact row has a hash and byte length,
- no geometry or large route-brief body is inserted into D1.

### Phased implementation plan

1. **Planning complete:** this wiki/ADR update.
2. **Drizzle dependency PR:** complete. `@bp/db` owns `drizzle-orm`, `drizzle-kit`, and `drizzle-zod`.
3. **D1 schema mirror:** complete for the current serving schema. Generated SQL lives under `packages/db/migrations/d1`.
4. **Repository bridge:** keep repository APIs stable while switching query construction to Drizzle for one table family.
5. **Validation helpers:** add generated select/insert schemas for D1 rows and map to existing domain schemas.
6. **Relational cleanup:** initial pass complete for current product-queryable JSON columns in the D1 export.
7. **Migration verification:** apply D1 migrations locally; run existing D1 export/verify and Worker tests.
8. **Future PG track:** only after a documented product/storage/query requirement appears.

## Sources added in this update

- Zod package on npm — https://www.npmjs.com/package/zod — verified_at: 2026-04-27. npm search result reported latest version `4.3.6`; the checked-in `bun.lock` already resolves root `zod` to `zod@4.3.6`.
- Zod 4 release notes — https://zod.dev/v4 — verified_at: 2026-04-27. Documents Zod 4 as stable.
- Zod 4 JSON Schema docs — https://zod.dev/json-schema — verified_at: 2026-04-27. Documents native JSON Schema conversion.
- Drizzle Cloudflare D1 docs — https://orm.drizzle.team/docs/connect-cloudflare-d1 — verified_at: 2026-04-27. Documents `drizzle-orm/d1`, D1 Worker bindings, and Bun install commands.
- Drizzle zod docs — https://orm.drizzle.team/docs/zod — verified_at: 2026-04-27. Documents `createSelectSchema`, `createInsertSchema`, `createUpdateSchema`, `createSchemaFactory`, `zod/v4`, and the `drizzle-zod` deprecation note starting with `drizzle-orm@1.0.0-beta.15`.
- Drizzle config docs — https://orm.drizzle.team/docs/drizzle-config-file — verified_at: 2026-04-27. Documents dialect-specific config, schema glob support, `out`, and `d1-http` driver.
- Drizzle Kit overview — https://orm.drizzle.team/docs/kit-overview — verified_at: 2026-04-27. Documents generating/running SQL migrations and Bun command support.
- Drizzle D1 HTTP API guide — https://orm.drizzle.team/docs/guides/d1-http-with-drizzle-kit — verified_at: 2026-04-27. Documents Drizzle Kit `d1-http` migration/push/introspect/studio configuration.
- Cloudflare D1 overview — https://developers.cloudflare.com/d1/ — verified_at: 2026-04-27. Documents D1 as horizontally scaled across many smaller 10 GB databases.
- Cloudflare D1 limits — https://developers.cloudflare.com/d1/platform/limits/ — verified_at: 2026-04-27. Documents 500 MB Free / 10 GB Paid max database size, 100-column table limit, 2 MB max row/string/BLOB, 100 bound parameters, 100 KB max SQL statement, and 30-second max query duration.
- Cloudflare D1 pricing — https://developers.cloudflare.com/d1/platform/pricing/ — verified_at: 2026-04-27. Documents rows-read/rows-written pricing, free/paid included storage, and storage billing including tables and indexes.
- Cloudflare D1 Worker Binding API — https://developers.cloudflare.com/d1/worker-api/ — verified_at: 2026-04-27. Documents prepared statements and typed row results.
- Cloudflare D1 migrations — https://developers.cloudflare.com/d1/reference/migrations/ — verified_at: 2026-04-27. Documents SQL migration files, create/list/apply, and `d1_migrations`.
- Cloudflare D1 Wrangler commands — https://developers.cloudflare.com/d1/wrangler-commands/ — verified_at: 2026-04-27. Documents `wrangler d1 migrations create/list/apply`.
- Cloudflare D1 local development — https://developers.cloudflare.com/d1/best-practices/local-development/ — verified_at: 2026-04-27. Documents local D1 development, `preview_database_id`, and local migrations.
- Cloudflare Hyperdrive Drizzle example — https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/ — verified_at: 2026-04-27. Documents `pg`, `drizzle-orm/node-postgres`, `nodejs_compat`, Hyperdrive binding, and per-request client connection.
- Cloudflare Hyperdrive PostgreSQL docs — https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/ — verified_at: 2026-04-27. Documents PostgreSQL/PostgreSQL-compatible database support and ORM/driver support.
- Cloudflare Workers limits — https://developers.cloudflare.com/workers/platform/limits/ — verified_at: 2026-04-27. Documents default 30-second CPU limit on Paid Workers and optional increase to 5 minutes.
- Cloudflare Queues limits — https://developers.cloudflare.com/queues/platform/limits/ — verified_at: 2026-04-27. Documents 15-minute wall-time limit for Cron triggers and Queue consumers.

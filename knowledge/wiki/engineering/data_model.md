---
title: Data Model
type: engineering
status: active
last_updated: 2026-04-28
owner: codex
source_count: 19
tags: [data-model, d1, sqlite, drizzle, postgres, hyperdrive, serving-model, artifacts, json-cleanup]
---

# Data Model

## Why this matters

The MVP should not use the hosted application database as the main analytics warehouse. The model below separates:

1. **Local analytical working data** — large, temporary, and allowed to be slow.
2. **Serving tables** — compact D1/SQLite read models for the public app.
3. **Artifacts** — generated GeoJSON/JSON/markdown payloads stored locally during development and later in R2.

See [[wiki/engineering/package_structure|Repo Package Structure]] for the package boundaries.

## What we know

- Cloudflare D1 is the recommended MVP serving database from [[wiki/project/managed_services_options|Managed services options]].
- D1 should hold compact, precomputed read models.
- Large geometry and generated memo payloads should live in artifact storage, with D1 storing keys and metadata.
- Postgres/PostGIS remains a later escalation path, not a day-one dependency.

## Data layers

```text
Public sources -> local data/raw -> local data/working -> generated data/artifacts
                                              |
                                              v
                                      D1 seed / migrations
                                              |
                                              v
                                  Cloudflare D1 + R2 serving
```

## Local analytical layer

These are not serving tables and do not need to match D1 exactly.

| Local path/table | Purpose | Git status |
|---|---|---|
| `data/raw/source_id/...` | Downloaded public datasets and feeds | gitignored |
| `data/working/*.duckdb` | Local analytical joins and rollups | gitignored |
| `data/working/*.parquet` | Intermediate columnar outputs | gitignored |
| `data/artifacts/*.geojson` | Generated route/segment map artifacts | gitignored by default |
| `data/artifacts/*.json` | Generated scorecards/briefs/source snapshots | gitignored by default |
| `data/fixtures/*` | Small committed test fixtures | committed |

## D1 serving tables

D1 stores precomputed read models. Keep tables narrow and indexed for common public API reads.

### `source_snapshot`

Tracks where each published metric came from.

Expected fields:

- `source_snapshot_id TEXT PRIMARY KEY`
- `source_id TEXT NOT NULL`
- `source_url TEXT NOT NULL`
- `source_kind TEXT NOT NULL`
- `source_last_updated_at TEXT`
- `fetched_at TEXT NOT NULL`
- `schema_hash TEXT`
- `row_count INTEGER`
- `status TEXT NOT NULL`
- `notes TEXT`

### `route`

Route metadata for the public app.

Expected fields:

- `route_id TEXT PRIMARY KEY`
- `route_short_name TEXT`
- `route_long_name TEXT`
- `borough TEXT`
- `mode TEXT DEFAULT 'bus'`
- `status TEXT NOT NULL`
- `source_snapshot_id TEXT NOT NULL`

### `route_scorecard`

One row per route and analysis period.

Expected fields:

- `route_scorecard_id TEXT PRIMARY KEY`
- `route_id TEXT NOT NULL`
- `period_start TEXT NOT NULL`
- `period_end TEXT NOT NULL`
- `avg_speed_mph REAL`
- `p10_speed_mph REAL`
- `slow_segment_count INTEGER`
- `hotspot_count INTEGER`
- `bus_trips INTEGER`
- `ridership_weighted_severity REAL`
- `bus_priority_need_score REAL`
- `confidence TEXT NOT NULL`
- `artifact_key TEXT`
- `source_snapshot_id TEXT NOT NULL`

### `segment_hotspot`

Compact hotspot summaries for tables and map legends. Full geometry should live in artifacts.

Expected fields:

- `segment_hotspot_id TEXT PRIMARY KEY`
- `route_id TEXT NOT NULL`
- `direction_id TEXT`
- `period_start TEXT NOT NULL`
- `period_end TEXT NOT NULL`
- `start_stop_id TEXT`
- `start_stop_name TEXT`
- `end_stop_id TEXT`
- `end_stop_name TEXT`
- `hour_of_day INTEGER`
- `day_type TEXT`
- `avg_speed_mph REAL`
- `avg_travel_time_minutes REAL`
- `severity_score REAL`
- `rank_on_route INTEGER`
- `geometry_artifact_key TEXT`
- `source_snapshot_id TEXT NOT NULL`

### `intervention`

Known intervention overlays, such as ACE and bus lanes.

Expected fields:

- `intervention_id TEXT PRIMARY KEY`
- `intervention_type TEXT NOT NULL`
- `route_id TEXT`
- `start_date TEXT`
- `end_date TEXT`
- `description TEXT`
- `source_snapshot_id TEXT NOT NULL`

### `route_artifact` (removed)

> **Removed 2026-04-29.** JSON artifact files and the `route_artifact` table were eliminated. All route data is served from the local pipeline DB and D1 serving tables directly. The table below is historical.

Index of larger generated payloads stored in R2/static artifacts.

Expected fields:

- `artifact_key TEXT PRIMARY KEY`
- `artifact_kind TEXT NOT NULL`
- `route_id TEXT`
- `period_start TEXT`
- `period_end TEXT`
- `content_type TEXT NOT NULL`
- `byte_size INTEGER`
- `sha256 TEXT`
- `created_at TEXT NOT NULL`
- `source_snapshot_id TEXT`

Examples:

- `routes/M1/2026-01/segments.geojson`
- `routes/M1/2026-01/brief.md`
- `routes/M1/2026-01/scorecard.json`

### `route_readiness`

Route/month build-planning read model used to decide which all-route slices are safe to expand next.

Expected fields:

- `route_id TEXT NOT NULL`
- `month TEXT NOT NULL`
- `route_short_name TEXT NOT NULL`
- `route_long_name TEXT`
- `readiness_status TEXT NOT NULL`
- `build_eligible INTEGER NOT NULL`
- `readiness_score INTEGER NOT NULL`
- `missing_inputs_json TEXT NOT NULL`
- `speed_observation_count INTEGER NOT NULL`
- `speed_bus_trip_count INTEGER NOT NULL`
- `average_speed_mph REAL`
- `schedule_timepoint_count INTEGER NOT NULL`
- `shape_count INTEGER NOT NULL`
- `stop_count INTEGER NOT NULL`
- `timepoint_stop_count INTEGER NOT NULL`

The March 2026 live artifact has 381 rows and 350 build-eligible routes. This is not a public performance score; it is a data completeness gate for batch expansion.

### `route_build_plan`

Route/month offline batch planner derived from `route_readiness` and the existing batch summary.

Expected fields:

- `route_id TEXT NOT NULL`
- `month TEXT NOT NULL`
- `route_short_name TEXT NOT NULL`
- `route_long_name TEXT`
- `candidate_rank INTEGER`
- `plan_status TEXT NOT NULL`
- `selected_for_next_batch INTEGER NOT NULL`
- `already_built INTEGER NOT NULL`
- `build_eligible INTEGER NOT NULL`
- `priority_score REAL NOT NULL`
- `readiness_status TEXT NOT NULL`
- `readiness_score INTEGER NOT NULL`
- `missing_inputs_json TEXT NOT NULL`
- `speed_observation_count INTEGER NOT NULL`
- `speed_bus_trip_count INTEGER NOT NULL`
- `average_speed_mph REAL`
- `schedule_timepoint_count INTEGER NOT NULL`

The March 2026 live artifact has 381 rows after the first planned-batch expansion: 20 selected for the next batch at the default limit, 7 already built, 323 eligible backlog routes, and 31 blocked routes. The refreshed selected route list starts with `M125`, `BX35`, `M8`, `BX32`, and `M106`.

### Local finding detector tables

Post-v1 finding detection is local-pipeline state first. The public Worker should not run
detectors and D1 should not become the detector warehouse.

Current local tables:

- `local_context_event`
- `local_finding_candidate`
- `local_finding_evidence_link`
- `local_finding_coverage_audit`
- `local_route_lion_link`

`local_context_event` is populated by `build:context-events` from geocoded 311, collisions,
parking violations, DOT permits, traffic volumes, traffic speeds, and ACE violation aggregates.
`local_route_lion_link` is the flat route-to-LION lookup produced by local spatialite jobs so later
detectors can join street-level context without loading spatialite.

Current parking note, 2026-05-19: full `geocode:parking-violations` is still running as task
`bq0nmjpyi`. The latest status was 71,428 of 186,096 parking rows attempted and 13,963 rows with
`physical_id`. Rerun `build:context-events` after that task finishes before treating parking
context-event counts as final.

Detector rows are still schema scaffolding, not production findings. The first detector milestone
should add:

- strict domain contracts for candidates, evidence links, and coverage audits;
- idempotent replace-by-run writes in `@bp/db/local`;
- indexes for `local_context_event(physical_id, occurred_at)`,
  `local_route_lion_link(physical_id)`, and detector result lookup by month/detector/route;
- a source-gap detector that writes coverage rows even when no public finding is emitted.

Public serving direction:

- D1 serves compact promoted finding summaries, source-gap states, and stable evidence refs.
- R2 holds detailed evidence bundles, coverage audit artifacts, join samples, and document snippets.
- Studio projections are generated from reviewed or promoted detector candidates, not from ad hoc
  frontend finding copy.

### `route_reliability_baseline`

Scheduled reliability read model for batch routes. This is the first reliability layer beyond speed; it uses scheduled timepoint rows to establish headway-gap baselines before observed GTFS-RT history exists.

Expected fields:

- `route_id TEXT NOT NULL`
- `month TEXT NOT NULL`
- `reliability_status TEXT NOT NULL`
- `scheduled_timepoint_count INTEGER NOT NULL`
- `stop_headway_group_count INTEGER NOT NULL`
- `headway_sample_count INTEGER NOT NULL`
- `median_scheduled_headway_minutes REAL`
- `p90_scheduled_headway_minutes REAL`
- `max_scheduled_headway_minutes REAL`
- `scheduled_short_headway_share REAL`
- `scheduled_long_gap_share REAL`
- `top_long_gap_windows_json TEXT NOT NULL`
- `source_status_json TEXT NOT NULL`

The March 2026 live artifact has 7 route rows and 186,322 scheduled headway interval samples. It is explicitly marked `scheduled_baseline_only`; observed headways, bunching, wait-time reliability, and cancellation proxies still need GTFS-RT collection.

### `route_month_trend`

Multi-month route trend read model for panels and event-study inputs.

Expected fields:

- `route_id TEXT NOT NULL`
- `month TEXT NOT NULL`
- `speed_observation_count INTEGER NOT NULL`
- `speed_bus_trip_count INTEGER NOT NULL`
- `average_speed_mph REAL`
- `ridership REAL`
- `transfers REAL`
- `has_speed_trend INTEGER NOT NULL`
- `has_ridership_trend INTEGER NOT NULL`

The current live trend artifact covers 7 built routes from January 2025 through March 2026: 105 route-month rows, all with speed coverage and route-level ridership coverage. The first live run skipped broad ridership trend aggregation because the all-route/month Socrata group query was too slow; `bun run backfill:route-ridership-trends` now fills ridership in route/month chunks. Subsequent bounded live backfill chunks completed all 105 route-month rows for the current March 2026 trend window.

### `route_equity_context`

Route-level equity/context read model for comparing reliability and trend outcomes against ACS demographics and low-car household indicators.

Expected fields:

- `route_id TEXT NOT NULL`
- `month TEXT NOT NULL`
- `acs_year INTEGER NOT NULL`
- `assignment_geography TEXT NOT NULL`
- `assigned_county_fips TEXT`
- `assigned_county_name TEXT`
- `assignment_method TEXT NOT NULL`
- `tract_count INTEGER NOT NULL`
- `total_population INTEGER`
- `occupied_housing_units INTEGER`
- `no_vehicle_households INTEGER`
- `no_vehicle_household_share REAL`
- `median_household_income REAL`
- `poverty_rate REAL`
- `public_transit_commuter_share REAL`
- selected race/ethnicity share fields
- `source_status_json TEXT NOT NULL`

The March 2026 live artifact has 381 route rows. It assigns 358 routes to county-level ACS 2024 proxy context using route ID borough prefixes and leaves 23 route IDs unassigned. This is a serving-ready planning proxy for demographics, low-car households, and public-transit commute share; tract catchment joins and job access remain pending.

### `route_batch_status`

One row per analysis month summarizing generated batch health for serving and deployment checks.

Expected fields:

- `month TEXT PRIMARY KEY`
- `generated_at TEXT NOT NULL`
- `status TEXT NOT NULL`
- `route_count INTEGER NOT NULL`
- `artifact_count INTEGER NOT NULL`
- `missing_artifact_count INTEGER NOT NULL`
- `hash_mismatch_count INTEGER NOT NULL`
- `byte_length_mismatch_count INTEGER NOT NULL`
- `total_byte_length INTEGER NOT NULL`
- `issue_count INTEGER NOT NULL`
- `built_route_ids_json TEXT NOT NULL`
- `issues_json TEXT NOT NULL`

The March 2026 live audit currently passes with 7 built routes, 63 verified artifacts, 859,319 total artifact bytes, and 0 audit issues.

## Batch Data Artifacts

Batch-level JSON reports are no longer the handoff between local pipeline jobs and D1 export. The local SQLite pipeline database owns relational projections for comparison ranks, reliability baselines, equity context, artifacts, and batch audit status; D1 export reads those tables directly.

### ACS equity context

The local pipeline DB table `local_census_tract_equity_context` stores 2,327 NYC census-tract context rows from ACS 2024 5-year profile data. The raw Census API capture remains in `data/raw/equity/acs5-profile-nyc-tracts-2024.json`; the normalized tract rows are no longer handed between jobs as JSON.

The local and D1 `route_equity_context` tables store a county-level route proxy derived from this tract context so the serving layer can compare routes against demographics and low-car households now. It is not a tract catchment join yet, and job access is still not ingested.

## D1 Export Verification

`bun run verify:d1` regenerates the D1 seed, loads the seed SQL into an in-memory SQLite database, checks serving-table counts against the export result, and exercises typed `packages/db` repository reads.

The March 2026 verification currently passes with these loaded table counts:

- `route_catalog`: 381
- `route_month_coverage`: 375
- `route_readiness`: 381
- `route_build_plan`: 381
- `route_reliability_baseline`: 7
- `route_month_trend`: 105
- `route_equity_context`: 381
- `route_scorecard`: 7
- `route_artifact`: 63
- `route_brief_summary`: 7
- `route_comparison_rank`: 7
- `route_batch_status`: 1

Verification no longer writes a JSON report; the command returns status, table counts, and repository-check details.

## Suggested indexes

```sql
CREATE INDEX idx_route_scorecard_route_period
  ON route_scorecard (route_id, period_start, period_end);

CREATE INDEX idx_segment_hotspot_route_period_rank
  ON segment_hotspot (route_id, period_start, period_end, rank_on_route);

CREATE INDEX idx_intervention_type_route
  ON intervention (intervention_type, route_id);

CREATE INDEX idx_route_artifact_route_kind
  ON route_artifact (route_id, artifact_kind);
```

## Package ownership

| Data/model concern | Owner |
|---|---|
| Type definitions | `packages/domain` |
| Source DTOs | `packages/sources` |
| Analytics outputs | `packages/analytics` |
| D1 migrations and repositories | `packages/db` |
| Seed/artifact generation | `tools/pipeline` |
| Public reads | `apps/web` via `packages/db` |

## Migration path to PostGIS

Only migrate to Postgres/PostGIS when precomputed D1/R2 artifacts are insufficient.

If that happens:

- Keep D1 as public-serving cache if useful.
- Add Postgres/PostGIS as an analytics/shared-query database.
- Keep `packages/domain` unchanged.
- Add a new adapter package only if needed, for example `packages/postgis`.
- Record the decision in `docs/decisions/`.

## Caveats

- Exact columns must be revised after schema probes.
- D1 row limits/storage constraints should be checked before loading full-system scorecards.
- Geometry storage in D1 should be avoided unless the geometry is small and frequently queried.
- D1 is SQLite-based; do not assume PostGIS-style dynamic spatial queries.

## Open questions

- Whether to store generated route briefs as markdown, JSON, or both.
- Whether all route geometry artifacts should be versioned by source snapshot or by analysis period.
- Whether `route_scorecard` should be one row per route/month or route/month/day-type.

## Sources

- Cloudflare D1 Worker Binding API — https://developers.cloudflare.com/d1/worker-api/ — verified_at: 2026-04-26

## Drizzle and storage-model update — 2026-04-27

### Branch state reviewed

This branch already has the right high-level direction: `docs/decisions/0002-postgres-drizzle-and-d1-serving-projections.md` says D1 should be a compact serving projection and Postgres through Hyperdrive should become the canonical operational/analytics database when the project outgrows local artifacts. Implementation now has a D1 Drizzle schema mirror, generated D1 migration files, and Drizzle-Zod validation schemas in `packages/db`; public repositories still expose explicit read helpers over D1-like prepared statements.

The pre-cleanup D1 tables included several `*_json` text columns:

- `route_scorecard.citations_json`
- `route_brief_summary.peak_ridership_json`
- `route_brief_summary.slowest_window_json`
- `route_catalog.route_types_json`
- `route_catalog.directions_json`
- `route_readiness.missing_inputs_json`
- `route_build_plan.missing_inputs_json`
- `route_reliability_baseline.top_long_gap_windows_json`
- `route_reliability_baseline.source_status_json`
- `route_equity_context.source_status_json`
- `route_batch_status.built_route_ids_json`
- `route_batch_status.issues_json`

These JSON columns were fine as a first prototype, but several are now product-queryable: users will want to filter, sort, count, join, rank, or explain routes by these values. The D1 serving export now emits child tables for these product-queryable shapes instead of JSON text columns, while local artifacts can remain JSON.

### Recommendation

Adopt Drizzle in `packages/db`, but keep **separate Drizzle schema trees** for D1 and Postgres:

```text
packages/db/
  drizzle.config.d1.ts
  drizzle.config.pg.ts
  drizzle/
    d1/
    pg/
  migrations/
    d1/
    pg/
  src/
    d1/
      client.ts
      index.ts
      schema.ts
      validation.ts
    pg/
      index.ts
      schema.ts
    shared/
      constants.ts
      index.ts
```

Use D1 for the compact public serving projection. Use Postgres through Hyperdrive only after a concrete requirement appears for canonical normalized operational/analytics storage, dynamic querying, or source-history retention. R2/static assets remain the storage location for large artifacts: GeoJSON, PMTiles, route briefs, source snapshots, debug bundles, and generated exports.

### Why not one shared Drizzle schema?

Do **not** maintain one table schema across D1 and Postgres.

Facts:

- Drizzle schema/config is dialect-specific: D1 uses SQLite/D1 primitives and `drizzle-orm/d1`; Postgres uses `pg-core` tables and a Postgres driver.
- Drizzle Kit config takes a dialect and schema path/glob, and D1 HTTP configuration uses `dialect: "sqlite"` with `driver: "d1-http"`.
- Cloudflare D1 is explicitly designed around many smaller databases and has a hard 10 GB paid database limit that cannot be increased per database.
- Hyperdrive connects Workers to PostgreSQL/PostgreSQL-compatible databases using existing drivers/ORMs.

Inference:

- A single shared Drizzle table layer would either water down Postgres into SQLite-shaped tables or accidentally treat D1 as a warehouse. The shared layer should be **domain contracts and constants**, not database table objects.
- Use `packages/domain` for route IDs, month IDs, public API contracts, score semantics, and Zod schemas. Use `packages/db/src/shared/` only for enum/value constants that both dialect schemas reference.

### D1 10 GB concern

The concern is valid. D1 is not a toy, but it is the wrong place for this project's canonical dataset.

D1's 10 GB paid cap and 500 MB free cap are acceptable for:

- route/month summary rows,
- route catalog rows,
- source freshness rows,
- artifact manifests,
- route brief summaries,
- citation/caveat child rows,
- hotspot summary rows with no geometry payload,
- small public search indexes or lookup tables.

D1 is not acceptable for:

- raw source history,
- full segment-speed observations across many years,
- row-level ACE violations if retained in detail,
- geometry-heavy route/segment shapes,
- route-brief bodies,
- PMTiles/GeoJSON payloads,
- historical audit/debug snapshots,
- ad hoc analytical joins over large source tables.

Guardrail: the serving D1 export should be treated as replaceable cache-like data. For the portfolio MVP, target a tiny D1 footprint. If the projection approaches hundreds of MB, inspect table/index sizes and move data to R2 or Postgres before continuing. If product features require querying more than compact read models, promote Postgres/Hyperdrive; do not shard D1 unless the product naturally becomes per-route/per-tenant/per-entity.

### Relational cleanup plan for current JSON columns

| Current JSON column | Recommendation | Why |
|---|---|---|
| `route_scorecard.citations_json` | Convert to `route_scorecard_citation(route_id, month, citation_rank, source_id, title, url, retrieved_at, claim)` | Citations are displayed, counted, and reused by route briefs. |
| `route_brief_summary.peak_ridership_json` | Convert to `route_brief_peak_window(route_id, month, day_type, hour_of_day, ridership, transfers, rank)` | Peak rider windows are product-queryable and comparable. |
| `route_brief_summary.slowest_window_json` | Convert to `route_brief_slowest_window(route_id, month, segment_id, day_type, hour_of_day, avg_speed_mph, rank)` | Slowest windows should drive map/detail interactions. |
| `route_catalog.route_types_json` | Convert to `route_catalog_type(route_id, route_type)` | Enables Local/Limited/SBS/Express filtering. |
| `route_catalog.directions_json` | Convert to `route_direction(route_id, direction_id, direction_name)` | Enables direction-specific UI and metrics. |
| `route_readiness.missing_inputs_json` | Convert to `route_readiness_missing_input(route_id, month, input_name, severity, note)` | Missing inputs should be counted and shown in readiness views. |
| `route_build_plan.missing_inputs_json` | Prefer reusing `route_readiness_missing_input`; if plan-specific, use `route_build_plan_missing_input` | Avoid duplicate JSON blobs for the same reason data. |
| `route_reliability_baseline.top_long_gap_windows_json` | Convert to `route_reliability_gap_window(route_id, month, direction_id, stop_id, day_type, hour_of_day, gap_minutes, rank)` | Long gaps are core reliability facts. |
| `route_reliability_baseline.source_status_json` | Convert to `route_month_source_status(route_id, month, source_id, status, row_count, snapshot_id, note)` | Source status is used across pages and QA. |
| `route_equity_context.source_status_json` | Reuse `route_month_source_status` | Same reason as above. |
| `route_batch_status.built_route_ids_json` | Convert to `route_batch_built_route(month, route_id, artifact_count, status)` | Batch status should be inspectable without parsing JSON. |
| `route_batch_status.issues_json` | Convert to `route_batch_issue(month, issue_rank, route_id, severity, issue_code, message)` | Needed for CI/export QA and public readiness. |

### JSON/JSONB that should remain

JSON is still appropriate when it is not the primary query surface:

- raw Socrata/API response captures,
- schema probe payloads,
- source provenance/audit details,
- debug snapshots for pipeline runs,
- unstructured selected-row attachments used for explainability,
- R2 object metadata or source headers,
- opaque source payloads where the product-queryable keys are also extracted into columns,
- temporary local artifacts under `data/working` or `data/artifacts`.

For Postgres, JSONB can be used for raw/provenance fields, but product filters, joins, ranks, and sort keys should still be represented as relational columns or child tables.

### Canonical Postgres model when needed

When Postgres/Hyperdrive becomes necessary, create a normalized operational/analytics schema rather than copying the D1 projection:

- `source`
- `source_snapshot`
- `source_column`
- `pipeline_run`
- `route`
- `route_shape`
- `stop`
- `route_stop`
- `route_direction`
- `route_segment`
- `route_segment_metric`
- `route_month_metric`
- `ridership_hourly`
- `schedule_headway_window`
- `ace_route_period`
- `ace_violation_monthly`
- `bus_lane`
- `route_bus_lane_match`
- `route_intervention`
- `route_score`
- `route_brief`
- `route_brief_citation`
- `artifact`

D1 should then be generated from Postgres or local artifacts as a compact serving export. It should not receive every canonical row.

### Zod v4 / Drizzle-Zod pattern

Current branch state:

- Root `package.json` uses `zod: "^4.3.6"`.
- `bun.lock` resolves the root Zod dependency to `zod@4.3.6`.

Use these patterns:

1. Keep public/domain contracts in `packages/domain`, using Zod v4 schemas and `z.output`.
2. Keep table-generated row schemas in the relevant DB surface, such as `packages/db/src/d1/validation.ts`.
3. Use Drizzle-derived schemas only for database boundary validation: select rows, insert payloads, update payloads, seed rows.
4. Do not replace domain schemas with Drizzle schemas. Database row shape and public API/domain shape are different layers.
5. Use `createSelectSchema`, `createInsertSchema`, and `createUpdateSchema` with per-field refinements/overrides where row constraints differ from domain constraints.
6. Use `createSchemaFactory` only when the repo actually needs custom Zod behavior such as coercion or OpenAPI metadata. Do not add it prematurely.
7. Import from `zod/v4` inside new Drizzle validation helpers if following the current Drizzle docs.
8. Stable path: use stable `drizzle-orm` + `drizzle-zod` until the repo intentionally adopts Drizzle 1.x. Drizzle docs now note that starting with `drizzle-orm@1.0.0-beta.15`, `drizzle-zod` is deprecated in favor of first-class `drizzle-orm/zod`; do not opt into a beta solely for validation helpers.

### Phased data-model implementation

1. **Phase A — complete:** add Drizzle dependencies, represent the D1 serving tables as a D1 Drizzle schema, and generate/select schemas for current rows. Existing repositories continue to expose the same public functions.
2. **Phase B — complete locally:** generated D1 migration SQL exists under `packages/db/migrations/d1`, Wrangler migration scripts are wired through `@bp/db`, and the seed/export path reads the Drizzle migration journal instead of maintaining duplicate table SQL strings.
3. **Phase C — initial pass complete:** product-queryable JSON columns were replaced with child tables for route catalog directions/types, missing inputs, source status, route batch details, citations, and brief windows.
4. **Phase D — Postgres canonical schema:** only after the MVP needs dynamic analytics or larger retained history, add the Postgres schema/config and Hyperdrive client.
5. **Phase E — generated serving projection:** generate D1 rows from Postgres or local artifacts and keep D1 as a small public-serving database.

### Answers to current architecture questions

| Question | Answer |
|---|---|
| Latest stable Zod version? | npm search reported `4.3.6` as latest on 2026-04-27, and this branch's `bun.lock` already resolves root Zod to `zod@4.3.6`. |
| Zod v4 pattern? | Domain Zod in `packages/domain`; Drizzle-generated Zod in DB-specific validation modules such as `packages/db/src/d1/validation.ts`; JSON Schema export only for public API/docs/contracts. |
| Drizzle D1 setup? | `drizzle-orm/d1` with the Worker D1 binding for runtime; Drizzle Kit `dialect: "sqlite"`, `driver: "d1-http"` for remote D1 operations, with Wrangler D1 migrations for Cloudflare's migration lifecycle. |
| Drizzle Postgres/Hyperdrive setup? | In Worker runtime, use Hyperdrive binding `env.HYPERDRIVE.connectionString`, `pg` `Client`, `drizzle-orm/node-postgres`, `nodejs_compat`, and per-request connection lifecycle. |
| One schema or separate? | Separate D1 and Postgres schemas; share domain contracts and value constants only. |
| Reduce JSON? | Convert product-queryable JSON arrays/objects into child tables. Keep JSON only for raw/provenance/debug/opaque attachments. |
| What moves out of production? | Historical backfills, full source snapshots, geometry construction, route-slice artifacts, full speed observations, and debug snapshots remain local/R2 unless Postgres is added. |
| Can Workers handle incremental updates? | Yes for bounded route/month/source slices and indexed upserts; no for full historical recomputation or large geospatial joins. |
| D1 vs Postgres tradeoff? | D1 is cheap/simple/edge-native but capped and SQLite-shaped; Postgres is better for canonical analytics, retained history, dynamic queries, and larger single-database workloads. |
| Migration workflow? | Generate Drizzle SQL, review, apply locally first, then apply D1 migrations through Wrangler or Drizzle Kit D1 HTTP only after validation. Keep future PG migrations separate. |
| Package responsibilities? | `@bp/db` owns schemas/migrations/repositories/validation; `@bp/domain` owns business contracts; `@bp/sources` owns source clients; `@bp/analytics` owns pure transforms; `@bp/pipeline` orchestrates backfill/export. |

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

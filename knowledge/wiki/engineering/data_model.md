---
title: Data Model
type: engineering
status: active
last_updated: 2026-04-27
owner: codex
source_count: 1
tags: [data-model, d1, sqlite, serving-model, artifacts]
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

### `route_artifact`

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

### `route-intervention-history.json`

Batch-level intervention history built from route intervention overlays and bus-lane overlays.

Current March 2026 output:

- 7 routes
- 5 ACE-matched routes
- 4 active ACE routes during the analysis period
- 7 routes with matched bus-lane overlay rows
- 7 routes with at least one matched bus-lane open date

The artifact carries ACE implementation dates, monthly ACE violation counts, bus-lane open-date coverage, lane/facility summaries, and explicit source-readiness flags for missing signal-priority, lane-upgrade, and exact enforcement-activation history.

### ACS equity context

`data/working/equity/nyc-tract-equity-context-2024.json` stores 2,327 NYC census-tract context rows from ACS 2024 5-year profile data. The layer includes total population, occupied housing units, no-vehicle households, median household income, poverty rate, public-transit commute share, and selected race/ethnicity shares.

`route_equity_context.json` stores a county-level route proxy derived from this tract context so the serving layer can compare routes against demographics and low-car households now. It is not a tract catchment join yet, and job access is still not ingested.

## D1 Export Verification

`bun run verify:d1` regenerates the D1 seed, loads the seed SQL into an in-memory SQLite database, checks serving-table counts against the export summary, and exercises typed `packages/db` repository reads.

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

The verification artifact is written to `data/exports/d1/<month>/verify-summary.json`.

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

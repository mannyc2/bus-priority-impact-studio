---
title: Data Model
type: engineering
status: active
last_updated: 2026-04-26
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

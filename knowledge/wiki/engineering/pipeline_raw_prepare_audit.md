---
title: Pipeline Raw Prepare Audit
type: engineering
status: archived
last_updated: 2026-06-02
owner: codex
tags: [drizzle, sqlite, pipeline, raw-sql, spatial, bulk-ingest]
---

# Pipeline Raw Prepare Audit

This is the separate audit for raw `.prepare()` calls outside app-side D1. It covers local
`bun:sqlite` prepared statements in `tools/pipeline-v2/src`, where the pipeline writes and probes
local SQLite databases during ingest, geocoding, spatial indexing, and analytical corpus builds.

The app-side D1 modernization is covered in
[[wiki/engineering/raw_prepare_audit|Raw Prepare Audit]]. As of 2026-06-02, direct
`.prepare()` calls in `packages/db/src/d1/queries` are zero.

## Summary

- Direct app-side D1 `.prepare()` calls: 0.
- Direct local package repository `.prepare()` calls under `packages/db/src/local`: 0 in this audit.
- Direct pipeline-local `bun:sqlite` `.prepare()` calls under `tools/pipeline-v2/src`: 35.
- These 35 calls are not all equivalent to the prior D1 app-side raw SQL. Most are local-only
  pipeline hot paths, prepared once and executed many times inside local transactions.
- Drizzle is already used for the local DB client and repositories, but several pipeline commands
  still work directly against `local.sqlite`, `input.sqlite`, or ad hoc SQLite handles.
- Implementation update, 2026-06-02: the simple geocode update prepares in
  `geocode/traffic-speeds.ts`, `geocode/traffic-volumes.ts`, `geocode/nypd-collisions.ts`,
  `geocode/permits.ts`, and `geocode/311.ts` were moved to local Drizzle repository helpers.

## Inventory

| File | Count | Primary shape |
|---|---:|---|
| `tools/pipeline-v2/src/commands/build/context-event-route-touches.ts` | 3 | Event-to-route touch materialization |
| `tools/pipeline-v2/src/commands/build/lion-geometry-index.ts` | 2 | SpatiaLite geometry writes |
| `tools/pipeline-v2/src/commands/build/parking-violation-matches.ts` | 4 | Bulk matching updates and match inserts |
| `tools/pipeline-v2/src/commands/build/route-lion-link.ts` | 3 | Route-to-LION spatial linkage |
| `tools/pipeline-v2/src/commands/build/route-shape-geometry-index.ts` | 1 | SpatiaLite route geometry write |
| `tools/pipeline-v2/src/commands/geocode/parking-violations.ts` | 2 | Address lookup and null-safe grouped update |
| `tools/pipeline-v2/src/commands/import/bus-observatory-headway-samples.ts` | 6 | GTFS-RT/headway bulk import |
| `tools/pipeline-v2/src/commands/ingest/dot-traffic-speeds-history.ts` | 1 | Historical speed bulk insert |
| `tools/pipeline-v2/src/commands/ingest/gtfs-static.ts` | 8 | GTFS static bulk ingest |
| `tools/pipeline-v2/src/commands/ingest/route-schedules.ts` | 3 | Schedule status, delete, and stop insert |
| `tools/pipeline-v2/src/lib/geocoder.ts` | 2 | LION segment lookup and address geocoding |

Total: 35.

## Classification

### Keep Raw For Now

These have a clear local SQLite or SpatiaLite reason to remain raw until there is a measured
Drizzle replacement.

- Spatial and geometry paths: `route-lion-link.ts`, `lion-geometry-index.ts`,
  `route-shape-geometry-index.ts`, `context-event-route-touches.ts`, and `lib/geocoder.ts`.
  These use SpatiaLite functions, geometry blobs, spatial indexes, RTree probes, or route/LION
  matching SQL that Drizzle can only represent as raw fragments anyway.
- Bulk ingest paths: `gtfs-static.ts`, `dot-traffic-speeds-history.ts`,
  `route-schedules.ts`, and `bus-observatory-headway-samples.ts`. These prepare once and run many
  times in local transactions over large files or snapshots.
- Parking violation matching: `parking-violation-matches.ts` mixes bulk raw-field updates,
  nullable grouped updates, and high-volume match inserts. It should be refactored only with a
  fixture and timing comparison.

These are lower production-risk than D1 app queries because they are local pipeline commands, not
public Worker request handlers. The risk is schema drift and maintenance, not request-path SQL
exposure.

### Completed Drizzle Candidate

The simple geocode update loops in `geocode/traffic-speeds.ts`, `geocode/traffic-volumes.ts`,
`geocode/nypd-collisions.ts`, `geocode/permits.ts`, and `geocode/311.ts` now call local Drizzle
repository helpers. The commands still use raw reads where they need source-specific projections,
date-window filters, or geocoder input assembly, but no longer prepare their simple update
statements directly.

### Drizzle Candidates

These are realistic follow-up slices if we want to continue reducing raw SQL without compromising
pipeline throughput.

- Non-spatial portions of `route-lion-link.ts`: the route-link delete and upsert can move behind a
  repository while leaving the spatial candidate query raw.
- `parking-violation-matches.ts` match inserts can be considered for `batchInsert` if the command
  remains clean and timing is acceptable.
- `route-schedules.ts` status and stop writes can become local repository methods once the
  command's table bootstrap behavior is reconciled with the Drizzle local schema.

### Needs Schema Or Ownership Cleanup First

- `gtfs-static.ts` creates and owns `local_gtfs_static_*` tables directly in the command. Those
  tables are used elsewhere in analytics and audits, but they are not currently centralized as a
  normal Drizzle repository surface. Modernizing this path should first decide whether GTFS static
  tables belong in `packages/db/src/local/schema.ts` and migrations.
- `bus-observatory-headway-samples.ts` overlaps with existing GTFS-RT local schema and repository
  concepts. Before replacing its prepared statements, decide whether this import command should be
  consolidated with the newer Drizzle GTFS-RT repository path or kept as a deliberate bulk loader.

## Recommendation

Do not do a blanket replacement of all 35 pipeline prepares. The next safe modernization slices are:

1. Keep the SpatiaLite and geometry probes raw, but name them as intentional spatial SQL.
2. Benchmark one bulk-ingest command before replacing prepared insert loops with Drizzle batches.
3. For GTFS static, settle schema ownership before touching the ingest SQL.
4. Consider the parking geocode grouped update only after preserving its null-safe grouped
   predicates and timing behavior.

The guiding rule: app-side D1 should stay Drizzle-first with a zero direct-prepare allowlist;
pipeline-local SQLite may keep measured hot-path prepares where Drizzle would mostly wrap raw SQL
or where throughput matters.

## Verification

Commands used for this audit:

```sh
rg -n "\.prepare\(" tools/pipeline-v2/src | cut -d: -f1 | sort | uniq -c
rg -n "\.prepare\(" tools/pipeline-v2/src packages/db/src/local packages/db/src
```

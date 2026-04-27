---
title: ETL Plan
type: engineering
status: active
last_updated: 2026-04-27
owner: codex
source_count: 2
tags: [etl, ingestion, data-quality, typescript, bun, local-pipeline]
---

# ETL Plan

## Why this matters

The MVP should separate batch computation from public serving. Source probing, historical backfills, geospatial joins, hotspot scoring, and ACE analysis run locally through `tools/pipeline`. The public app reads compact D1 tables and generated artifacts.

See [[wiki/engineering/package_structure|Repo Package Structure]] and [[wiki/engineering/data_model|Data Model]].

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
bun --filter @bp/pipeline build:segments -- --route M1
bun --filter @bp/pipeline build:hotspots -- --route M1 --month 2026-01
bun --filter @bp/pipeline build:route-score -- --route M1 --month 2026-01
```

Implementation responsibilities:

1. Construct timepoint-to-timepoint route-segment artifacts.
2. Compute speed/travel-time aggregates.
3. Identify hotspot segments.
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
2. Generate route GeoJSON and route-brief artifacts.
3. Store artifact keys and hashes in `route_artifact`.
4. Upload artifacts to R2 only after local artifact contracts are stable.

Verification:

- D1 local migration applies.
- D1 local seed imports.
- `apps/web` can read scorecard data from local D1.
- Artifact hash in D1 matches generated file.

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

- Command names are targets, not implemented commands.
- Exact Socrata field names remain provisional until metadata probes run.
- Realtime Bus Time collection is optional and deferred.

## Sources

- Cloudflare D1 Worker Binding API — https://developers.cloudflare.com/d1/worker-api/ — verified_at: 2026-04-27
- Cloudflare R2 Workers API docs — https://developers.cloudflare.com/r2/api/workers/workers-api-usage/ — verified_at: 2026-04-26

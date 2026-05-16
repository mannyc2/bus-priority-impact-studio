---
title: Data Pipeline V1 Completion Plan
type: engineering
status: active
last_updated: 2026-05-16
owner: codex
source_count: 0
tags: [pipeline, roadmap, gtfs-rt, reliability, interventions, corridors, briefs]
---

# Data Pipeline V1 Completion Plan

## Objective

Finish Data Pipeline v1 as a reproducible full-network evidence pipeline:

```text
public sources + GTFS-RT collection
  -> local SQLite pipeline DB
  -> route and corridor metrics
  -> intervention evaluation
  -> route/corridor brief artifacts
  -> verified D1/static serving export
```

Approved v1 scope:

1. GTFS-RT observed reliability and bunching are part of v1.
2. Before/after intervention evaluation is part of v1.
3. The deliverable is the full network pipeline plus a full set of route and corridor briefs.

This replaces the older M1-demo interpretation of the roadmap. M1 remains a useful fixture/example, not the product boundary.

## Current State Audit

Audit date: 2026-05-16.

Repository state checked from `/mnt/models/dev/bus-reliability-tracker`:

- Branch: `architecture-cleanup-drizzle-plan`
- Synced with `origin/architecture-cleanup-drizzle-plan`
- Latest commit: `ab457a6 Generalize route pipeline build graph`
- Working tree: clean at audit time

Local generated state:

| Area | Evidence | Current value |
|---|---|---:|
| Route slices | `find data/artifacts/route-slices -mindepth 1 -maxdepth 1 -type d` | 381 |
| Network build report | `data/artifacts/network-builds/2026-03/summary.json` | 381 requested, 381 built, 0 failed |
| D1 export | `data/exports/d1/2026-03/seed.sql` | about 3.5 MB |
| Local DB | `data/local/pipeline.sqlite` | about 1.9 GB |
| Route catalog rows | `local_route_catalog` | 381 |
| Segment-speed rows | `local_route_segment_speed` | 470,274 |
| Hourly ridership rows | `local_route_hourly_ridership` | 60,984 |
| Schedule timepoint rows | `local_route_schedule_timepoint` | 9,179,542 |
| Route hotspot summaries | `local_route_hotspot_summary` | 381 |
| Route scorecards | `local_route_scorecard` | 381 |
| Route brief summaries | `local_route_brief_summary` | 381 |
| Route artifact rows | `local_route_artifact` | 3,429 |
| Scheduled reliability baselines | `local_route_reliability_baseline` | 381 |
| ACE routes | `local_ace_route` | 81 |
| ACE violation summaries | `local_ace_violation_summary` | 736 |
| Bus lane rows | `local_bus_lane` | 3,048 |

Current strengths:

- Full-network March 2026 route build exists.
- Local pipeline DB is already canonical for much of route/catalog/readiness/artifact state.
- D1 export and verification exist.
- Route-level deterministic brief inputs and serving summaries exist for all built routes.
- Scheduled reliability baseline exists.
- ACE and bus-lane overlays exist.

Current v1 gaps:

- No GTFS-RT collector or observed vehicle history tables.
- No observed headway, bunching, long-gap, or wait-time reliability metrics.
- No before/after or matched comparison intervention evaluation.
- No corridor entities, corridor membership, corridor metrics, or corridor briefs.
- Route brief artifacts are deterministic inputs/summaries, not final route/corridor brief bodies.
- Bus lane matching has a known Manhattan-only filter in `route-brief-metrics.ts`.
- Route score is still a simple speed/hotspot heuristic, not the planned multi-factor priority model.
- Older wiki pages still contain M1-era command names and optional-realtime language.

## Prompt-To-Artifact Checklist

| Requirement | Current evidence | Status | Required v1 artifact / gate |
|---|---|---|---|
| Reproducible full-network pipeline | `build:network` produced 381/381 March 2026 route slices | Partial | Clean rebuild script/runbook from empty local DB through `verify:d1` |
| GTFS-RT observed reliability | Source probes know Bus Time endpoints; scheduled reliability has `needs_gtfs_rt_collection` flags | Missing | GTFS-RT collector, local tables, observed headway samples, reliability artifacts |
| Bunching | No observed headway history | Missing | Bunching/long-gap/window metrics with sample coverage/confidence |
| Before/after intervention evaluation | ACE route dates and violation summaries exist; overlays exist | Missing | Intervention event/window metrics and pre/post comparison artifacts |
| Corridor grouping | Route/stop/bus-lane street data exists | Missing | Corridor tables, route/segment membership, corridor summaries |
| Full set of route briefs | 381 `route-brief-input.json` and DB brief summaries exist | Partial | Rendered JSON/Markdown/HTML route brief bodies for public-visible routes |
| Full set of corridor briefs | No corridor artifacts | Missing | Rendered JSON/Markdown/HTML corridor brief bodies |
| Verified D1 export contract | `export:d1` and `verify:d1` exist for route serving rows | Partial | D1 verification expanded to reliability, intervention evaluation, and corridor summary rows |
| Static artifact contract | Route artifact manifests exist | Partial | Stable artifact key scheme for route briefs, corridor briefs, map payloads, and evaluation details |
| QA gates | Tests and route-batch audit exist | Partial | V1 QA command covering source freshness, GTFS-RT sample coverage, intervention eligibility, corridor membership, brief completeness, and export readback |
| Updated roadmap/docs | Some docs are stale | In progress | This page plus updated index, roadmap, ETL, and data pages |

## Definition Of Done

Data Pipeline v1 is complete only when all of the following are true:

1. A clean local DB can rebuild the selected v1 analysis month from source ingestion through network build.
2. Every build-eligible route has route artifacts, route serving rows, and a route brief artifact.
3. Every eligible corridor has corridor metrics, serving rows, and a corridor brief artifact.
4. GTFS-RT collection has produced enough observed samples for at least the v1 reliability window, or routes with insufficient samples are explicitly marked as insufficient.
5. Observed headway, bunching, long-gap, and wait-time reliability metrics are computed from collected GTFS-RT data.
6. ACE and bus-lane intervention evaluation artifacts exist for eligible routes/corridors with adequate pre/post data.
7. All causal language is gated by methodology status; unsupported comparisons are labeled descriptive only.
8. D1 export and static artifact verification pass from generated data.
9. The route/corridor brief set has caveats, citations, artifact hashes, byte lengths, and source dates.
10. Documentation matches actual commands, schemas, and limitations.

## Phase 0: Documentation And Roadmap Reset

Purpose: make the approved v1 scope durable before more code lands.

Tasks:

1. Add this completion plan.
2. Update `knowledge/index.md` to link this plan.
3. Update `knowledge/wiki/project/codex_roadmap.md` so it no longer treats realtime collection as optional/out of scope.
4. Update `knowledge/wiki/engineering/etl_plan.md` to reflect the route/network pipeline and v1 GTFS-RT/intervention/corridor work.
5. Update data pages that still reference M1-only command names.

Acceptance:

- `bun run check:knowledge` passes.
- A future agent can identify v1 scope without reading chat history.

## Phase 1: Baseline Pipeline Hardening

Purpose: make the current full-network route build reproducible and methodologically safe.

Tasks:

1. Add a full-network rebuild runbook for a clean local DB.
2. Verify clean rebuild for the selected v1 month.
3. Fix the Manhattan-only bus-lane filter in `route-brief-metrics.ts`.
4. Add QA for bus-lane matching across boroughs.
5. Decide whether route score remains a simple heuristic or is replaced by a v1 priority score.
6. Add source freshness and artifact completeness gates to the network build.

Candidate command sequence:

```bash
bun run ingest:route-catalog
bun run ingest:route-coverage -- --year 2026 --month 3
bun run ingest:ace-routes
bun run ingest:ace-violations -- --year 2026 --month 3
bun run ingest:bus-lanes
bun run ingest:equity-context -- --year 2024
bun run ingest:route-trends -- --start-year 2025 --start-month 1 --end-year 2026 --end-month 3 --skip-ridership
bun run build:network -- --year 2026 --month 3
bun run verify:d1 -- --year 2026 --month 3
```

Acceptance:

- Clean rebuild completes without relying on preexisting generated state.
- `verify:d1` passes.
- Route-batch audit has 0 missing artifacts and 0 hash mismatches.
- Bus-lane overlay is no longer borough-hardcoded.

## Phase 2: GTFS-RT Collection

Purpose: collect the missing observed operations layer.

Status: started 2026-05-16.

Implemented so far:

- `collect:gtfs-rt` records bounded Bus Time GTFS-RT collection runs.
- Raw protobuf snapshots are written under `data/raw/gtfs-rt/<date>/<run_id>/`.
- Local SQLite tables `local_gtfs_rt_collection_run` and `local_gtfs_rt_feed_snapshot` store run metadata, snapshot status, byte length, SHA-256, redacted URLs, and raw file paths.
- Fixture-backed tests cover successful collection, API-key redaction, and HTTP failure recording.

Still missing:

- GTFS-RT protobuf parsing.
- Vehicle-position/trip-update normalized rows.
- Observed vehicle stop events.
- Observed headway samples.

Data contracts to add:

```text
gtfs_rt_feed_snapshot
gtfs_rt_vehicle_position
gtfs_rt_trip_update
gtfs_rt_alert
observed_vehicle_stop_event
observed_headway_sample
observed_collection_run
```

Commands to add:

```bash
bun run collect:gtfs-rt -- --duration-hours 24 --sample-seconds 30
bun run ingest:gtfs-rt-snapshots -- --date YYYY-MM-DD
bun run build:observed-headways -- --start-date YYYY-MM-DD --end-date YYYY-MM-DD
```

Implementation notes:

- Require `MTA_BUS_TIME_API_KEY`.
- Never persist the API key.
- Keep raw feed snapshots local and optional if storage grows too quickly.
- Store processed observations in the local pipeline DB.
- Record skipped intervals, HTTP failures, feed timestamps, and entity counts.

Acceptance:

- Collector can run for a bounded window and write a collection-run record.
- Processed observations join to route, direction, stop, timestamp, and vehicle/trip identifiers where available.
- Tests cover malformed GTFS-RT payloads, missing route IDs, duplicate vehicle observations, and feed gaps.

## Phase 3: Observed Reliability And Bunching

Purpose: turn GTFS-RT history into route/corridor evidence.

Metrics:

- median observed headway
- p90 observed headway
- maximum observed headway
- bunching share
- long-gap share
- scheduled-vs-observed headway delta
- wait-time reliability proxy
- sample coverage and confidence status

Definitions:

- Bunching should be thresholded relative to scheduled headway when schedule match exists, with a fixed fallback threshold only when necessary.
- Long gap should be thresholded relative to scheduled headway, with a fixed fallback threshold only when necessary.
- Every metric must carry sample count and collection window.

Acceptance:

- Route reliability tables include observed metrics, not only scheduled baselines.
- Briefs can say either "observed bunching detected" or "insufficient GTFS-RT coverage"; they cannot silently omit reliability status.
- D1 verification reads observed reliability summary rows.

## Phase 4: Intervention Evaluation

Purpose: move from overlays to evidence about what changed.

Levels:

1. Descriptive before/after for eligible intervention routes.
2. Seasonality-aware before/after using comparable months.
3. Matched comparison routes where enough data exists.
4. Event-study-ready monthly table for future modeling.

Initial scope:

- ACE implementation dates and violation summaries.
- Bus-lane open dates where NYC DOT source coverage is reliable.
- Signal priority, stop consolidation, all-door boarding, and dispatch interventions stay as source-gap placeholders unless reliable public sources are added.

Data contracts:

```text
intervention_event
route_intervention_window
route_intervention_metric
route_intervention_comparison
corridor_intervention_summary
```

Acceptance:

- Each intervention artifact declares its level: descriptive, seasonality-adjusted, matched comparison, or event-study-ready.
- No route/corridor brief makes a causal claim above its evaluation level.
- Before/after outputs include pre window, post window, excluded months, sample counts, and caveats.

## Phase 5: Corridor Model

Purpose: produce corridor-level evidence instead of only route-level evidence.

Initial corridor derivation:

- normalize route stop street/facility names,
- use route shape/stop geography when available,
- use bus-lane street/facility names,
- group overlapping route hotspot segments by street/corridor,
- mark ambiguous assignments.

Data contracts:

```text
corridor
corridor_route_member
corridor_segment_member
corridor_month_summary
corridor_hotspot
corridor_intervention_context
corridor_brief_summary
```

Acceptance:

- Every public-visible route has at least one candidate corridor or an explicit unassigned reason.
- Corridor membership is deterministic and auditable.
- Corridor summaries aggregate speed, rider exposure, reliability, and intervention context across member routes/segments.

## Phase 6: Brief Artifact Generation

Purpose: turn metrics into complete evidence artifacts.

Brief types:

- route brief
- corridor brief

Artifact formats:

- machine-readable JSON,
- Markdown for review/outreach,
- optional HTML/static rendering for the public app.

Each brief must include:

- headline finding,
- analysis period,
- route/corridor identity,
- top slow segments and time windows,
- rider exposure,
- observed reliability/bunching status,
- intervention status and evaluation level,
- sources and source dates,
- caveats,
- artifact hash and byte length in manifest.

Acceptance:

- `route-brief-input.json` is no longer the final brief product.
- Every public-visible route and eligible corridor has a final brief artifact.
- Missing-data sections are explicit.

## Phase 7: Export, Static Artifact Contract, And QA Gates

Purpose: make v1 publishable and reproducible.

D1 should contain compact rows:

- route summaries,
- corridor summaries,
- comparison ranks,
- reliability summaries,
- intervention evaluation summaries,
- source/caveat rows,
- artifact metadata.

Static/R2-ready artifacts should contain large payloads:

- route brief bodies,
- corridor brief bodies,
- GeoJSON/PMTiles,
- detailed reliability/evaluation payloads,
- debug/source snapshots safe to publish.

QA command target:

```bash
bun run check:pipeline-v1 -- --year 2026 --month 3
```

QA gates:

- source freshness,
- route/month coverage,
- GTFS-RT sample coverage,
- intervention eligibility,
- corridor assignment coverage,
- route brief completeness,
- corridor brief completeness,
- artifact manifest hash/byte verification,
- D1 export table counts,
- typed D1 readback.

Acceptance:

- `check:pipeline-v1` fails loudly on any missing v1 deliverable.
- `verify:d1` covers every public-serving table used by the app.
- Large artifacts are not inserted into D1.

## Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| GTFS-RT collection window is too short | Reliability claims are weak | Require sample coverage/confidence labels; allow insufficient-data status |
| GTFS-RT parsing complexity grows | Slows v1 | Start with vehicle positions/headways before richer trip-update semantics |
| Intervention dates are incomplete | Causal claims become unsafe | Gate evaluation level; use descriptive only when source quality is weak |
| Corridor assignment is noisy | Briefs look wrong | Mark ambiguity and keep route-level evidence attached |
| D1 grows too large | Serving cost/limits risk | Keep D1 compact; move bodies/details to static artifacts/R2 |
| Docs drift again | Future agents repeat old work | Keep this page as the v1 checklist and update log after each slice |

## Recommended Execution Order

1. Documentation and roadmap reset.
2. Baseline pipeline hardening and Manhattan bus-lane fix.
3. GTFS-RT collector and observed headway schema.
4. Observed reliability/bunching metrics.
5. Intervention evaluation.
6. Corridor model.
7. Route/corridor brief bodies.
8. Export and v1 QA command.
9. Product-facing proof finding and frontend/API alignment.

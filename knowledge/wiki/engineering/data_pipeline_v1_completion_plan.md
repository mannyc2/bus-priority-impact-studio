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
- Original reset baseline: `ab457a6 Generalize route pipeline build graph`
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
| Public route brief body artifacts | `local_route_artifact` | 1,050 |
| Corridor summaries | `local_corridor_month_summary` | 209 |
| Corridor brief body artifacts | `local_corridor_artifact` | 627 |
| Scheduled reliability baselines | `local_route_reliability_baseline` | 381 |
| ACE routes | `local_ace_route` | 81 |
| ACE violation summaries | `local_ace_violation_summary` | 736 |
| Bus lane rows | `local_bus_lane` | 3,048 |

Current strengths:

- Full-network March 2026 route build exists.
- Local pipeline DB is already canonical for much of route/catalog/readiness/artifact state.
- D1 export and verification exist.
- Route/corridor brief body artifacts have been generated for the current March 2026 local DB: 350 public route briefs and 209 corridor briefs, each with JSON, Markdown, and HTML bodies.
- Scheduled reliability baseline exists.
- GTFS-RT collection, parsing, observed headway samples, route/month observed reliability summaries, and D1 export/readback code paths exist.
- ACE and bus-lane overlays exist.

Latest local verification after the March 2026 v1 catch-up run:

- `bun run ingest:route-trends -- --start-year 2025 --start-month 1 --end-year 2026 --end-month 3 --skip-ridership` produced 5,171 full-network route/month speed trend rows.
- Chunked `bun run backfill:route-ridership-trends -- --start-year 2025 --start-month 1 --end-year 2026 --end-month 3 --limit ... --concurrency ...` runs filled ridership coverage for all 5,171 route/month trend rows.
- `bun run route-observed-reliability -- --year 2026 --month 3 --run-id no-gtfs-rt-samples-2026-03` produced 381 route/month reliability status rows. All 381 are `insufficient_gtfs_rt_samples` because this environment has no `MTA_BUS_TIME_API_KEY` and no collected GTFS-RT snapshots; total observed headway samples are 0.
- `bun run route-intervention-evaluation -- --year 2026 --month 3` produced 79 ACE/ABLE intervention events and 79 route intervention comparisons: 22 evaluated, 55 insufficient-data, and 2 future-intervention comparisons. Of the evaluated comparisons, 21 include ridership deltas.
- `bun run corridor-model -- --year 2026 --month 3` produced 350 public route assignments, 209 corridors, and 1,113 corridor hotspots.
- `bun run brief-artifacts -- --year 2026 --month 3` produced 1,050 route brief artifacts and 627 corridor brief artifacts.
- `bun run route-batch-audit -- --year 2026 --month 3` passed with 1,677 artifacts, 0 missing artifacts, 0 hash mismatches, and 0 byte-length mismatches.
- `bun run verify:d1 -- --year 2026 --month 3` passed with 381 observed reliability rows, 79 intervention comparison rows, 1,050 route artifact rows, and 627 corridor artifact rows.
- `bun run check:pipeline-v1 -- --year 2026 --month 3` passed with 0 issues for the current local DB/export/artifact state.

Current v1 gaps:

- GTFS-RT observed reliability has route/month status rows and D1 readback, but the current March 2026 run has 0 observed samples and 381 insufficient-sample rows because no Bus Time key/collection run is available in this environment.
- Observed reliability is route/month summary only; detailed observed reliability windows are not yet built.
- ACE descriptive before/after intervention evaluation exists for March 2026; 22 comparisons are evaluated from speed trend rows and 21 of those include ridership deltas. Seasonality-adjusted comparisons, matched-comparison analysis, and bus-lane intervention evaluation remain open.
- Deterministic primary-street corridor entities, route membership, summaries, hotspot rows, and generated brief bodies exist; richer segment membership remains open.
- `brief-artifacts` renders and verifies the current full set of route/corridor JSON, Markdown, and HTML bodies from local DB evidence; a clean rebuild from an empty local DB remains the stronger reproducibility proof.
- Bus lane matching is no longer borough-hardcoded, but still needs v1 QA coverage in the final pipeline gate.
- Route score is still a simple speed/hotspot heuristic, not the planned multi-factor priority model.
- Older wiki pages still contain M1-era command names and optional-realtime language.

## Prompt-To-Artifact Checklist

| Requirement | Current evidence | Status | Required v1 artifact / gate |
|---|---|---|---|
| Reproducible full-network pipeline | `build:network` produced 381/381 March 2026 route slices | Partial | Clean rebuild script/runbook from empty local DB through `verify:d1` |
| GTFS-RT observed reliability | 381 March 2026 status rows and D1 readback exist; all are `insufficient_gtfs_rt_samples` with 0 observed headway samples | Partial | Production-length collection and coverage QA with a real Bus Time run |
| Bunching | Bunching/long-gap fields exist in route/month observed reliability summaries, but the current run has no observed samples | Partial | Real GTFS-RT samples plus sample coverage/confidence |
| Before/after intervention evaluation | 79 ACE/ABLE event rows and 79 route comparisons exist with D1 readback; 22 are evaluated from speed trends and 21 include ridership deltas | Partial | Seasonality-aware, matched-comparison, bus-lane intervention, and corridor summaries |
| Corridor grouping | Primary-street corridor tables, route membership, summaries, hotspots, D1 readback, and generated corridor brief bodies exist | Partial | Richer segment membership, ambiguity QA, and corridor intervention context |
| Full set of route briefs | `brief-artifacts` writes and audits 1,050 JSON/Markdown/HTML route bodies for 350 public-visible routes | Pass for current March run | Clean rebuild from empty local DB proves reproducibility |
| Full set of corridor briefs | `brief-artifacts` writes and audits 627 JSON/Markdown/HTML corridor bodies for 209 corridors | Pass for current March run | Clean rebuild from empty local DB proves reproducibility |
| Verified D1 export contract | `verify:d1` passes with route serving rows, observed reliability, ACE intervention comparisons, corridor summaries, and route/corridor artifact metadata | Pass for current March run | D1 verification expanded to map payload and detailed evaluation manifests |
| Static artifact contract | Stable `briefs/routes/...` and `briefs/corridors/...` keys exist with byte-length/SHA-256 audit | Partial | Stable artifact key scheme for map payloads and detailed evaluation payloads |
| QA gates | `check:pipeline-v1` verifies route/corridor brief completeness, observed reliability coverage, intervention rows, route-batch audit output, and D1 readback | Partial | Expand with source freshness, GTFS-RT sample confidence, bus-lane intervention eligibility, and richer corridor ambiguity checks |
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
bun run route-intervention-evaluation -- --year 2026 --month 3
bun run corridor-model -- --year 2026 --month 3
bun run brief-artifacts -- --year 2026 --month 3
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
- `parseGtfsRtFeed` decodes GTFS-RT protobuf snapshots into normalized vehicle-position, trip-update, stop-time-update, and alert records.
- `ingest:gtfs-rt-snapshots -- --run-id <run_id>` parses collected raw snapshots into local SQLite tables.
- Parsed snapshot status and counts are stored in `local_gtfs_rt_parsed_snapshot`; malformed snapshots are recorded as `parse_error`.
- `build:observed-headways -- --run-id <run_id>` derives observed stop events and headway samples from parsed vehicle positions.
- Observed stop events are stored in `local_observed_vehicle_stop_event`; observed headway samples are stored in `local_observed_headway_sample`.
- `route-observed-reliability -- --run-id <run_id> --year YYYY --month M` aggregates route/month observed reliability summaries.
- Route/month observed summaries are stored in `local_route_observed_reliability_summary` with observed headway, bunching, long-gap, expected-wait, sample-count, and insufficient-sample status.
- D1 serving table `route_observed_reliability_summary` stores exported observed reliability summaries.
- `export:d1` and `verify:d1` include observed reliability row counts and typed repository readback.
- Fixture-backed tests cover successful collection, API-key redaction, and HTTP failure recording.
- Fixture-backed tests cover vehicle-position parsing, trip-update parsing, alert parsing, local DB ingestion, and malformed protobuf handling.
- Fixture-backed tests cover duplicate vehicle-observation collapse and headway calculation.
- Fixture-backed tests cover observed route summaries and explicit insufficient-sample statuses for routes without enough realtime evidence.

Still missing:

- Brief integration for observed reliability status and caveats.
- Production-length GTFS-RT collection and coverage QA for the v1 analysis window.

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

Status: started 2026-05-16.

Implemented so far:

- `route-intervention-evaluation -- --year YYYY --month M` builds route/month intervention event rows and descriptive before/after comparisons for ACE/ABLE routes.
- Local tables `local_intervention_event` and `local_route_intervention_comparison` store event metadata, pre/post windows, sample month counts, speed observations, average speed deltas, ridership deltas, evaluation level, comparison status, and caveats.
- D1 serving tables `intervention_event` and `route_intervention_comparison` store exported intervention summaries.
- `export:d1` and `verify:d1` include intervention event/comparison row counts and typed repository readback.
- Route post-build now runs intervention evaluation alongside comparison, scheduled reliability, and batch audit.
- Fixture-backed tests cover evaluated descriptive ACE comparisons and future-intervention no-evaluation status.

Still missing:

- Seasonality-aware before/after.
- Matched comparison routes.
- Bus-lane open-date evaluation where source coverage supports it.
- Corridor intervention summaries.

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

Status: started 2026-05-16.

Implemented so far:

- `corridor-model -- --year YYYY --month M` assigns every public-visible route to a deterministic primary-street corridor or an explicit unassigned placeholder.
- Local tables `local_corridor`, `local_corridor_route_member`, `local_corridor_month_summary`, and `local_corridor_hotspot` store corridor identity, route membership, summary metrics, and top corridor hotspots.
- D1 serving tables `corridor`, `corridor_route_member`, `corridor_month_summary`, and `corridor_hotspot` store exported corridor summaries.
- `export:d1` and `verify:d1` include corridor row counts and typed repository readback through `listCorridorSummaries`.
- Route post-build now runs the corridor model after intervention evaluation and before D1 export.
- Fixture-backed tests cover multi-route corridor aggregation, explicit unassigned route handling, reliability counts, intervention counts, and hotspot ranking.

Still missing:

- Richer route-shape/segment-based membership.
- Bus-lane facility-assisted grouping.
- Corridor intervention context beyond route-level comparison rollups.
- Corridor brief bodies.
- Assignment QA in the final v1 gate.

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

Status: started 2026-05-16.

Implemented so far:

- `brief-artifacts -- --year YYYY --month M` renders route and corridor brief bodies from local DB serving/evidence rows.
- Route brief bodies are written to `data/artifacts/briefs/routes/{route_id}/{month}/brief.json`, `brief.md`, and `brief.html`.
- Corridor brief bodies are written to `data/artifacts/briefs/corridors/{corridor_id_slug}/{month}/brief.json`, `brief.md`, and `brief.html`.
- Local `local_route_artifact` and `local_corridor_artifact` rows store artifact key, content type, byte length, and SHA-256.
- D1 `route_artifact` and `corridor_artifact` serving rows expose compact metadata while bodies remain static/R2-ready.
- Route post-build runs corridor modeling, brief artifact generation, route-batch audit, then D1 export.

Still missing:

- Final clean full-network run proving all current public-visible route and eligible corridor brief bodies exist.
- Richer narrative sections once segment-based corridor membership and stronger intervention methodology land.
- Map and detailed evaluation payload manifests.

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
- Every public-visible route and eligible corridor has final JSON, Markdown, and HTML brief bodies.
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

Implemented so far:

- `route-batch-audit` checks required route/corridor brief artifacts, file presence, byte length, and SHA-256 against local metadata rows.
- `verify:d1` loads generated schema/seed SQL and exercises typed readback for route/corridor artifact metadata.
- `check:pipeline-v1` runs the current v1 QA gate over local DB state, route/corridor brief artifacts, route-batch audit results, and D1 verification. Against the current March 2026 local DB it passes with 381 reliability status rows, 79 intervention comparison rows, 5,171 route/month trend rows, and 1,677 verified brief artifacts. The QA output now reports observed-vs-insufficient reliability row counts, total observed headway samples, and speed/ridership trend coverage so a green gate does not hide missing GTFS-RT sample coverage.

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

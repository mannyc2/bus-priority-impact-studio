---
title: Data Pipeline V1 Completion Plan
type: engineering
status: active
last_updated: 2026-05-17
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

Audit date: 2026-05-17.

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
| Corridor summaries | `local_corridor_month_summary` | 193 |
| Corridor brief body artifacts | `local_corridor_artifact` | 579 |
| Scheduled reliability baselines | `local_route_reliability_baseline` | 381 |
| ACE routes | `local_ace_route` | 81 |
| ACE violation summaries | `local_ace_violation_summary` | 736 |
| Bus lane rows | `local_bus_lane` | 3,048 |

Current strengths:

- Full-network March 2026 route build exists.
- Local pipeline DB is already canonical for much of route/catalog/readiness/artifact state.
- D1 export and verification exist.
- Route/corridor brief body artifacts have been generated for the current March 2026 local DB: 350 public route briefs and 193 corridor briefs, each with JSON, Markdown, and HTML bodies.
- Scheduled reliability baseline exists.
- GTFS-RT collection, parsing, observed headway samples, route/month observed reliability summaries, and D1 export/readback code paths exist.
- ACE and bus-lane overlays exist.

Latest local verification after the March 2026 v1 catch-up run:

- `bun run ingest:route-trends -- --start-year 2025 --start-month 1 --end-year 2026 --end-month 3 --skip-ridership` produced 5,171 full-network route/month speed trend rows.
- Chunked `bun run backfill:route-ridership-trends -- --start-year 2025 --start-month 1 --end-year 2026 --end-month 3 --limit ... --concurrency ...` runs filled ridership coverage for all 5,171 route/month trend rows.
- `bun run route-observed-reliability -- --year 2026 --month 3 --run-id no-gtfs-rt-samples-2026-03` produced 381 route/month reliability status rows. All 381 are `insufficient_gtfs_rt_samples` because the March 2026 pipeline state still has no production-length GTFS-RT collection run; total observed headway samples are 0.
- `bun run route-intervention-evaluation -- --year 2026 --month 3` produced 251 intervention events and 251 route intervention comparisons: 79 ACE/ABLE comparisons plus 172 `nyc_dot_bus_lanes` source-gap comparisons for public routes with matched bus-lane geometry. ACE/ABLE rows include 22 evaluated speed before/after comparisons, 55 insufficient-data rows, and 2 future-intervention rows; 21 evaluated rows include ridership deltas.
- `bun run corridor-model -- --year 2026 --month 3` produced 350 public route assignments, 193 corridors, 1,186 corridor hotspots, 350 segment-backed route memberships, and 251 corridor intervention context rows. The model now prefers hotspot-segment street evidence before falling back to stop-name majority and matches route-level intervention comparison rows back to corridor members.
- `bun run brief-artifacts -- --year 2026 --month 3` produced 1,050 route brief artifacts and 579 corridor brief artifacts.
- `bun run route-batch-audit -- --year 2026 --month 3` passed with 1,629 artifacts, 0 missing artifacts, 0 hash mismatches, and 0 byte-length mismatches. It now writes `data/artifacts/briefs/2026-03/manifest.json`, a static manifest of all route/corridor brief body artifact keys, content types, byte lengths, and SHA-256 hashes, and validates route/corridor `brief.json` contract fields so reliability payloads cannot be silently omitted.
- `bun run verify:d1 -- --year 2026 --month 3` passed with 381 observed reliability rows, 251 intervention comparison rows, 251 corridor intervention context rows, 1,050 route artifact rows, and 579 corridor artifact rows. It now writes `data/exports/d1/2026-03/export-summary.json` and `verify-summary.json` with schema/seed byte lengths, SHA-256 hashes, expected table counts, loaded table counts, and typed repository readback counts.
- `bun run check:pipeline-v1 -- --year 2026 --month 3` now fails strict v1 QA on `observed_reliability_no_observed_routes`, `observed_reliability_route_coverage_insufficient`, and `observed_reliability_sample_coverage_insufficient`, which is correct for the current local DB because there are 0 observed GTFS-RT headway samples. Strict QA also validates that observed summaries are backed by a completed GTFS-RT collection run for the analysis month, a minimum collection window, sample cadence, successful vehicle-position snapshot coverage, parsed vehicle-position snapshots, persisted observed headway rows, a configurable observed-route coverage threshold, per-route sample thresholds, and fresh required source probe captures.
- `bun run check:pipeline-v1 -- --year 2026 --month 3 --allow-insufficient-gtfs-rt` passes with 0 issues as a structural DB/export/artifact check only. This is not a v1 completion signal.
- `bun run gtfs-rt:preflight -- --year 2026 --month 5 --run-id gtfs-rt-smoke-2026-05-17` confirms the local API key is present without printing it and that collection/ingestion works; the one-snapshot smoke run parsed 1,290 vehicle positions. It still fails strict readiness because the run is only a one-minute smoke test with no observed headways or route reliability. For March 2026, strict `check:pipeline-v1` remains the v1 completion gate and still requires a production-length observed reliability run.
- April and May 2026 route coverage probes on 2026-05-17 returned 375 scheduled routes but 0 speed routes, so March 2026 remains the current complete public-source analysis month. A live May 2026 GTFS-RT collection can produce May observed reliability evidence, but strict QA now prevents using it to satisfy the March 2026 gate.
- `bun run collect:gtfs-rt -- --duration-hours 4 --sample-seconds 30 --feed-types vehicle_positions --run-id gtfs-rt-v1-20260517T022348Z` completed on 2026-05-17 with 480/480 successful vehicle-position snapshots and 0 failures. Ingest parsed 480 snapshots and 358,875 vehicle positions; observed-headway build produced 90,136 stop events and 73,702 headway samples; May 2026 route observed reliability produced 381 route rows, including 229 observed routes, 152 insufficient-sample routes, and 72,782 route-summary headway samples. `gtfs-rt:preflight -- --year 2026 --month 5 --run-id gtfs-rt-v1-20260517T022348Z` now passes strict observed-layer readiness.
- `bun --filter @bp/pipeline audit:pipeline-v1 -- --public-year 2026 --public-month 3 --realtime-year 2026 --realtime-month 5 --run-id gtfs-rt-v1-20260517T022348Z` writes `data/artifacts/pipeline-v1/audit-2026-03-2026-05.json`. The audit is blocked overall because strict single-month v1 remains unavailable, but it records March structural pass, May realtime preflight pass, D1/static export pass, and the exact missing items.
- A one-route clean-DB rebuild smoke now passes without touching canonical March artifacts: `ingest:route-catalog`, `ingest:route-coverage`, and `build:network -- --limit 1 --db data/local/pipeline-clean-smoke.sqlite --artifact-root data/artifacts/pipeline-clean-smoke --export-root data/exports/pipeline-clean-smoke` built M57 from an empty local DB. The isolated `route-batch-audit` passed with 6 brief artifacts, and isolated `verify:d1` passed with the seed and verification summaries under `data/exports/pipeline-clean-smoke/d1/2026-03/`.
- A full-network clean-DB rebuild now passes from an empty local DB using isolated outputs: catalog and March coverage were ingested into `data/local/pipeline-clean-full.sqlite`; `build:network -- --year 2026 --month 3 --no-resume --db data/local/pipeline-clean-full.sqlite --artifact-root data/artifacts/pipeline-clean-full --export-root data/exports/pipeline-clean-full` built 381/381 routes with 0 failures; `finalize:pipeline-v1 -- --allow-insufficient-gtfs-rt` produced 5,171 trend rows, 381 explicit insufficient GTFS-RT reliability rows, 413 intervention comparisons with 22 evaluated rows, 413 corridor intervention context rows, 193 segment-backed corridors, 1,629 audited route/corridor brief artifacts, and a verified D1 export. The audit command now accepts `--clean-db`, `--clean-artifact-root`, and `--clean-export-root`; with those proof paths, the reproducible full-network public-source pipeline checklist row is `pass`.
- Route brief artifacts now include detailed observed reliability windows when observed headway samples exist: top long-gap windows and top bunching windows by NYC local weekday/hour, direction, and stop, with sample counts, median/p90/max observed headways, bunching/long-gap shares, expected wait, and excess wait. `route-batch-audit` now fails if route brief JSON omits the observed reliability window contract. After regenerating canonical March and `pipeline-clean-full` March artifacts, both route-batch audits, both D1 verifications, both structural `check:pipeline-v1 -- --allow-insufficient-gtfs-rt` runs, and the March+May audit still pass/blocked exactly as expected.

Current v1 gaps:

- GTFS-RT observed reliability has route/month status rows and D1 readback, but the current March 2026 run has 0 observed samples and 381 insufficient-sample rows because no production-length Bus Time collection has been run for the v1 analysis window.
- The May 2026 observed layer now passes GTFS-RT preflight, but May cannot be the single full v1 month until public speed coverage exists for May or a later month.
- Observed reliability detailed windows now exist in static route brief artifacts when samples exist; a relational D1 window table can be added later if the frontend needs direct querying beyond the artifact bodies.
- ACE descriptive before/after intervention evaluation exists for March 2026; 22 comparisons are evaluated from speed trend rows and 21 of those include ridership deltas. Public routes with matched bus-lane geometry now receive explicit `nyc_dot_bus_lanes` source-gap comparison rows. Seasonality-adjusted comparisons, matched-comparison analysis, and true bus-lane before/after evaluation remain open until route-level implementation dates are available.
- Deterministic hotspot-segment corridor entities, route membership, summaries, hotspot rows, corridor intervention context rows, and generated brief bodies exist; shape-based corridor review remains open.
- `brief-artifacts` renders and verifies the current full set of route/corridor JSON, Markdown, and HTML bodies from local DB evidence. One-route and full-network isolated clean-DB rebuilds now pass with dedicated DB, artifact-root, and export-root paths.
- Bus lane matching is no longer borough-hardcoded, and v1 QA now checks bus-lane intervention comparison coverage for public routes with matched bus-lane geometry.
- Route score is still a simple speed/hotspot heuristic, not the planned multi-factor priority model.
- Older wiki pages still contain M1-era command names and optional-realtime language.

## Prompt-To-Artifact Checklist

| Requirement | Current evidence | Status | Required v1 artifact / gate |
|---|---|---|---|
| Reproducible full-network pipeline | Isolated full-network March 2026 proof paths contain 381/381 route slices, 1,629 audited brief artifacts, 5,171 trend rows, 413 intervention comparisons, 413 corridor intervention context rows, 193 segment-backed corridors, and a verified D1 export from `data/local/pipeline-clean-full.sqlite` plus isolated artifact/export roots | Pass | Keep the clean rebuild command sequence documented and rerun before release candidates |
| GTFS-RT observed reliability | 381 March 2026 status rows and D1 readback exist; route brief artifacts include detailed observed windows when samples exist; March rows are all `insufficient_gtfs_rt_samples` with 0 observed headway samples | Partial | Production-length collection and coverage QA with a real Bus Time run in the same month as public source coverage |
| Bunching | Bunching/long-gap fields exist in route/month observed reliability summaries, and route brief artifacts include top observed bunching/long-gap windows when samples exist; the current March run has no observed samples | Partial | Real same-month GTFS-RT samples plus sample coverage/confidence |
| Before/after intervention evaluation | Intervention event/comparison rows exist with D1 readback: ACE/ABLE evaluated rows carry raw and peer-adjusted speed/ridership deltas, and matched public routes with bus-lane geometry get explicit source-gap rows | Partial | Dated bus-lane before/after evaluation, external methodology review, and corridor summaries |
| Corridor grouping | Hotspot-segment corridor tables, route membership, summaries, hotspots, corridor intervention context rows, D1 readback, generated corridor brief bodies, and segment-evidence/intervention-context QA exist | Partial | Shape-based corridor review |
| Full set of route briefs | `brief-artifacts` writes and audits 1,050 JSON/Markdown/HTML route bodies for 350 public-visible routes; full clean rebuild reproduced the route brief set under isolated outputs | Pass | Keep route brief JSON/Markdown/HTML contract checks in `route-batch-audit` |
| Full set of corridor briefs | `brief-artifacts` writes and audits 579 JSON/Markdown/HTML corridor bodies for 193 corridors; isolated proof paths reproduced the corridor brief set | Pass | Keep corridor brief JSON/Markdown/HTML contract checks in `route-batch-audit` |
| Verified D1 export contract | `verify:d1` passes with route serving rows, observed reliability, intervention comparisons, corridor summaries, corridor intervention context, route/corridor artifact metadata, schema/seed hashes, expected-vs-loaded table counts, and typed repository readback | Pass for current March run | Map payload and detailed evaluation manifests remain separate future contracts |
| Static artifact contract | Stable `briefs/routes/...` and `briefs/corridors/...` keys exist with byte-length/SHA-256 audit, JSON contract checks for route/corridor brief bodies, observed reliability window contract checks, plus a generated `data/artifacts/briefs/{month}/manifest.json` inventory | Partial | Stable artifact key scheme for map payloads and detailed evaluation payloads |
| QA gates | Strict `check:pipeline-v1` fails the current March run on missing observed GTFS-RT samples and validates required source probe freshness, GTFS-RT analysis-month alignment, collection window/cadence/snapshot coverage, parse/headway provenance, observed-route coverage thresholds, per-route sample thresholds, route trend coverage, evaluated intervention comparisons, ridership deltas, peer-adjusted speed deltas, bus-lane comparison coverage for matched public routes, corridor segment-evidence coverage, corridor intervention context coverage, and corridor assignment ambiguity/unassigned thresholds; `gtfs-rt:preflight` diagnoses realtime readiness; `audit:pipeline-v1` records clean rebuild proof paths | Partial | Resolve strict single-month public/realtime source alignment and add remaining detailed payload contracts |
| Updated roadmap/docs | Some docs are stale | In progress | This page plus updated index, roadmap, ETL, and data pages |

## Definition Of Done

Data Pipeline v1 is complete only when all of the following are true:

1. A clean local DB can rebuild the selected v1 analysis month from source ingestion through network build.
2. Every build-eligible route has route artifacts, route serving rows, and a route brief artifact.
3. Every eligible corridor has corridor metrics, serving rows, and a corridor brief artifact.
4. Strict v1 has GTFS-RT collection samples in the same month as the public speed/schedule evidence, with insufficient routes explicitly marked; structural fallback rows alone are not a completion signal.
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

1. Verify the full-network rebuild runbook from a clean local DB. Completed for March 2026 with isolated DB/artifact/export roots.
2. Keep the clean rebuild proof command sequence current for the selected v1 month and rerun it before release candidates.
3. Bus-lane matching has been generalized beyond the original Manhattan-only M1 prototype path.
4. Keep QA coverage for bus-lane intervention comparison rows on public routes with matched lane geometry.
5. Decide whether route score remains a simple heuristic or is replaced by a v1 priority score.
6. Add source freshness and artifact completeness gates to the network build. `check:pipeline-v1` now enforces fresh required source probe captures; `audit:pipeline-v1` records clean-rebuild proof paths.

Candidate command sequence:

```bash
bun run ingest:route-catalog
bun run ingest:route-coverage -- --year 2026 --month 3
bun run ingest:ace-routes
bun run ingest:ace-violations -- --year 2026 --month 3
bun run ingest:bus-lanes
bun run ingest:equity-context -- --year 2024
bun run build:network -- --year 2026 --month 3
bun run gtfs-rt:preflight -- --year 2026 --month 3
bun run collect:gtfs-rt -- --duration-hours 4 --sample-seconds 30 --run-id <run_id>
bun run ingest:gtfs-rt-snapshots -- --run-id <run_id>
bun run gtfs-rt:preflight -- --year 2026 --month 3 --run-id <run_id>
bun run finalize:pipeline-v1 -- --year 2026 --month 3 --run-id <run_id> --min-gtfs-rt-collection-hours 4 --max-gtfs-rt-sample-seconds 60

# Structural-only fallback when no Bus Time collection run exists:
bun run finalize:pipeline-v1 -- --year 2026 --month 3 --allow-insufficient-gtfs-rt

# Full-network clean rebuild proof:
bun run ingest:route-catalog -- --db data/local/pipeline-clean-full.sqlite
bun run ingest:route-coverage -- --year 2026 --month 3 --db data/local/pipeline-clean-full.sqlite
bun run build:network -- --year 2026 --month 3 --db data/local/pipeline-clean-full.sqlite --no-resume --artifact-root data/artifacts/pipeline-clean-full --export-root data/exports/pipeline-clean-full
bun run finalize:pipeline-v1 -- --year 2026 --month 3 --db data/local/pipeline-clean-full.sqlite --allow-insufficient-gtfs-rt --artifact-root data/artifacts/pipeline-clean-full --export-root data/exports/pipeline-clean-full
bun run audit:pipeline-v1 -- --public-year 2026 --public-month 3 --realtime-year 2026 --realtime-month 5 --run-id <run_id> --clean-db data/local/pipeline-clean-full.sqlite --clean-artifact-root data/artifacts/pipeline-clean-full --clean-export-root data/exports/pipeline-clean-full
```

Use `--db`, `--artifact-root`, and `--export-root` together for clean rebuild proofs so temporary runs do not overwrite canonical `data/artifacts` or `data/exports` outputs.

Acceptance:

- Clean rebuild completes without relying on preexisting generated state. This has passed structurally for March 2026.
- Strict `finalize:pipeline-v1` and `check:pipeline-v1` pass with real observed GTFS-RT samples.
- Structural fallback may pass with `--allow-insufficient-gtfs-rt`, but it does not satisfy GTFS-RT observed reliability v1 completion.
- `verify:d1` passes.
- Route-batch audit has 0 missing artifacts and 0 hash mismatches.
- Bus-lane overlay is no longer borough-hardcoded.

## Phase 2: GTFS-RT Collection

Purpose: collect the missing observed operations layer.

Status: started 2026-05-16.

Implemented so far:

- `collect:gtfs-rt` records bounded Bus Time GTFS-RT collection runs and accepts stable CLI `--run-id` values for smoke and production runs.
- Raw protobuf snapshots are written under `data/raw/gtfs-rt/<date>/<run_id>/`.
- Local SQLite tables `local_gtfs_rt_collection_run` and `local_gtfs_rt_feed_snapshot` store run metadata, snapshot status, byte length, SHA-256, redacted URLs, and raw file paths.
- `parseGtfsRtFeed` decodes GTFS-RT protobuf snapshots into normalized vehicle-position, trip-update, stop-time-update, and alert records.
- `ingest:gtfs-rt-snapshots -- --run-id <run_id>` parses collected raw snapshots into local SQLite tables.
- Parsed snapshot status and counts are stored in `local_gtfs_rt_parsed_snapshot`; malformed snapshots are recorded as `parse_error`.
- `build:observed-headways -- --run-id <run_id>` derives observed stop events and headway samples from parsed vehicle positions.
- Observed stop events are stored in `local_observed_vehicle_stop_event`; observed headway samples are stored in `local_observed_headway_sample`.
- `route-observed-reliability -- --run-id <run_id> --year YYYY --month M` filters observed headway samples to the requested month and aggregates route/month observed reliability summaries. It uses route brief summaries when they exist and falls back to the route catalog when the observed layer is being built before monthly briefs.
- Route/month observed summaries are stored in `local_route_observed_reliability_summary` with observed headway, bunching, long-gap, expected-wait, sample-count, and insufficient-sample status.
- `gtfs-rt:preflight -- --year YYYY --month M --run-id <run_id>` diagnoses API-key presence, analysis-month alignment, collection-run status, collection window/cadence/snapshot quality, successful vehicle-position snapshots, parsed vehicle-position rows, observed headway samples, route/month observed reliability rows, source-status coverage, and route sample coverage before strict finalization.
- D1 serving table `route_observed_reliability_summary` stores exported observed reliability summaries.
- `export:d1` and `verify:d1` include observed reliability row counts and typed repository readback.
- Fixture-backed tests cover successful collection, CLI run-id parsing, API-key redaction, and HTTP failure recording.
- Fixture-backed tests cover vehicle-position parsing, trip-update parsing, alert parsing, local DB ingestion, and malformed protobuf handling.
- Fixture-backed tests cover duplicate vehicle-observation collapse and headway calculation.
- Fixture-backed tests cover observed route summaries and explicit insufficient-sample statuses for routes without enough realtime evidence.

Still missing:

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
- Route briefs include the observed GTFS-RT collection window when collection-run metadata is available.
- Route briefs include top observed long-gap and bunching windows when observed headway samples exist.
- D1 verification reads observed reliability summary rows.

## Phase 4: Intervention Evaluation

Purpose: move from overlays to evidence about what changed.

Status: started 2026-05-16.

Implemented so far:

- `route-intervention-evaluation -- --year YYYY --month M` builds route/month intervention event rows and peer-adjusted before/after comparisons for ACE/ABLE routes.
- Public routes with matched NYC DOT bus-lane geometry receive explicit `nyc_dot_bus_lanes` source-gap comparison rows when the current pipeline lacks a route-level implementation date for before/after evaluation.
- Local tables `local_intervention_event` and `local_route_intervention_comparison` store event metadata, pre/post windows, sample month counts, speed observations, raw and peer-adjusted speed/ridership deltas, evaluation level, comparison status, and caveats.
- D1 serving tables `intervention_event` and `route_intervention_comparison` store exported intervention summaries.
- `export:d1` and `verify:d1` include intervention event/comparison row counts and typed repository readback.
- Route post-build now runs intervention evaluation alongside comparison, scheduled reliability, and batch audit.
- Fixture-backed tests cover evaluated peer-adjusted ACE comparisons, future-intervention no-evaluation status, and bus-lane source-gap comparison rows.

Still missing:

- Dated bus-lane before/after evaluation where source coverage supports it.
- Corridor intervention summaries.

Levels:

1. Raw before/after for eligible intervention routes.
2. Peer-adjusted before/after using same-window comparison routes matched on pre-period speed and ridership.
3. Dated bus-lane comparisons where source coverage supports it.
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

- `corridor-model -- --year YYYY --month M` assigns every public-visible route to a deterministic hotspot-segment corridor, falling back to primary stop street or an explicit unassigned placeholder only when segment evidence is unavailable.
- Local tables `local_corridor`, `local_corridor_route_member`, `local_corridor_month_summary`, `local_corridor_intervention_context`, and `local_corridor_hotspot` store corridor identity, route membership, segment evidence counts/scores, summary metrics, corridor-matched intervention context, and top corridor hotspots.
- D1 serving tables `corridor`, `corridor_route_member`, `corridor_month_summary`, `corridor_intervention_context`, and `corridor_hotspot` store exported corridor summaries and context rows.
- `export:d1` and `verify:d1` include corridor row counts and typed repository readback through `listCorridorSummaries`.
- Route post-build now runs the corridor model after intervention evaluation and before D1 export.
- Fixture-backed tests cover multi-route corridor aggregation, explicit unassigned route handling, reliability counts, intervention counts, and hotspot ranking.

Still missing:

- Shape-based corridor review.
- Bus-lane facility-assisted grouping.
- Shape and bus-lane facility review in the final v1 gate.

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
- Route brief JSON/Markdown includes observed reliability status and the GTFS-RT collection window when collection-run metadata is available.
- Route brief JSON/Markdown includes top observed long-gap and bunching windows when observed headway samples exist.
- Route post-build runs corridor modeling, brief artifact generation, route-batch audit, then D1 export.

Still missing:

- Richer narrative sections once shape-based corridor review and stronger intervention methodology land.
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
bun run check:pipeline-v1 -- --year 2026 --month 3 --min-observed-route-share 0.9
bun run check:pipeline-v1 -- --year 2026 --month 3 --min-gtfs-rt-collection-hours 4 --max-gtfs-rt-sample-seconds 60
bun run check:pipeline-v1 -- --year 2026 --month 3 --max-corridor-ambiguous-route-share 0.15
bun run check:pipeline-v1 -- --year 2026 --month 3 --max-source-probe-age-days 45
bun run check:pipeline-v1 -- --year 2026 --month 3 --allow-insufficient-gtfs-rt
bun --filter @bp/pipeline audit:pipeline-v1 -- --public-year 2026 --public-month 3 --realtime-year 2026 --realtime-month 5 --run-id gtfs-rt-v1-20260517T022348Z
```

QA gates:

- source freshness,
- route/month coverage,
- GTFS-RT analysis-month alignment, collection window, sample cadence, successful vehicle-position snapshot coverage, observed-route coverage, and observed-sample coverage,
- intervention eligibility,
- corridor assignment coverage and ambiguity/unassigned thresholds,
- route brief completeness,
- corridor brief completeness,
- artifact manifest hash/byte verification,
- D1 export table counts,
- typed D1 readback.

Implemented so far:

- `route-batch-audit` checks required route/corridor brief artifacts, file presence, byte length, SHA-256, and core `brief.json` contract fields against local metadata/evidence rows, then writes `data/artifacts/briefs/{month}/manifest.json` with all static brief body keys, content types, byte lengths, hashes, totals, and audit issues.
- `export:d1` writes `export-summary.json` with schema/seed byte lengths and SHA-256 hashes plus exported row counts.
- `verify:d1` loads generated schema/seed SQL, writes `verify-summary.json` with expected-vs-loaded table counts, and exercises typed readback for route/corridor artifact metadata.
- `check:pipeline-v1` runs the current v1 QA gate over local DB state, required source probe freshness, route/corridor brief artifacts, route-batch audit file and JSON-contract results, static manifest output, D1 verification, GTFS-RT analysis-month alignment, GTFS-RT collection window/cadence/snapshot coverage, GTFS-RT parse/headway provenance, observed-route coverage thresholds, per-route observed sample thresholds, route trend coverage, evaluated intervention comparison coverage, peer-adjusted speed delta coverage, bus-lane comparison coverage for public routes with matched bus-lane geometry, corridor segment-evidence coverage, corridor intervention context coverage, and corridor assignment ambiguity/unassigned thresholds. Against the current March 2026 local DB, strict mode fails because observed reliability has 381 insufficient rows and 0 observed headway samples. Structural mode with `--allow-insufficient-gtfs-rt` passes with 10 fresh required source probe captures, 381 reliability status rows, 251 intervention comparison rows, 251 corridor intervention context rows, 5,171 route/month trend rows, 172 bus-lane source-gap comparison rows, 320 assigned corridor route members, 30 ambiguous corridor route members, 0 unassigned corridor route members, 350 segment-backed corridor route members, and 1,629 verified brief artifacts.
- `audit:pipeline-v1` writes a prompt-to-artifact completion audit that combines the public-source month, realtime month, structural/strict gates, GTFS-RT preflight, source coverage summaries, and a pass/partial/blocked checklist. The current March + May audit is intentionally blocked rather than green.

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
2. Baseline pipeline hardening and bus-lane comparison coverage.
3. GTFS-RT collector and observed headway schema.
4. Observed reliability/bunching metrics.
5. Intervention evaluation.
6. Corridor model.
7. Route/corridor brief bodies.
8. Export and v1 QA command.
9. Product-facing proof finding and frontend/API alignment.

---
title: Codex Roadmap
type: project
status: active
last_updated: 2026-05-17
owner: codex
source_count: 0
tags: [codex, roadmap, implementation, typescript]
---

# Codex Roadmap

## Current v1 direction — 2026-05-16

The current implementation has moved beyond the original M1 prototype. The v1 finish line is now defined in [[wiki/engineering/data_pipeline_v1_completion_plan|Data Pipeline v1 completion plan]].

Approved v1 scope:

1. GTFS-RT observed reliability and bunching are part of v1.
2. Before/after intervention evaluation is part of v1.
3. The deliverable is the full network pipeline plus a full set of route and corridor briefs.

Current implementation baseline:

- Full March 2026 network build exists with 381 route slices and 0 build failures.
- Local SQLite pipeline DB is canonical for route catalog, coverage, route artifacts, scorecards, brief summaries, reliability baselines, intervention overlays, and export inputs.
- D1 seed export and verification exist for route-serving rows, observed reliability, intervention comparisons, corridor summaries, corridor intervention context, and route/corridor brief artifact metadata.
- Route and corridor brief body generation exists through `brief-artifacts`, which writes JSON, Markdown, and HTML bodies plus byte-length/SHA-256 metadata.
- ACE/ABLE intervention evaluation now stores raw before/after deltas plus peer-route comparison baselines and adjusted speed/ridership deltas; strict v1 QA requires peer-adjusted speed deltas for evaluated rows.
- Bus-lane intervention evaluation now creates route-level dated comparisons from the latest parseable matched NYC DOT `open_dates`, while retaining source-gap rows for matched segments without usable dates.
- Corridor route membership now prefers hotspot-segment street evidence before falling back to stop-name majority; strict v1 QA requires at least one segment-backed corridor membership.
- Corridor intervention context now matches route-level intervention comparison rows back to corridor members and is exported through D1 plus corridor brief JSON/Markdown.
- `corridor-shape-review` now validates segment-backed corridor assignments against GTFS route-shape geometry. March 2026 canonical and clean-full artifacts both have 350/350 shape-reviewed route memberships passing with 0 warnings.
- `evaluation-artifacts` writes static observed reliability, route intervention, and corridor intervention payloads under `data/artifacts/evaluations/{month}/` plus a hash/row-count manifest. `check:pipeline-v1` verifies the manifest against local DB counts.
- `map-artifacts` writes R2/static-ready map payloads under `data/artifacts/map/`: source snapshot metadata, current Local/Limited/SBS route GeoJSON, current timepoint-stop GeoJSON, bus-lane GeoJSON, one all-day route-segment GeoJSON per public route/month, and `data/artifacts/map/{month}/manifest.json` with byte-length/SHA-256/feature counts. `check:pipeline-v1` verifies the manifest and route-segment payloads.
- Strict `check:pipeline-v1` now distinguishes structural completeness from true observed-reliability completion. March 2026 passes structural verification with `--allow-insufficient-gtfs-rt`, but strict mode still fails because there are no March 2026 observed GTFS-RT headway samples.
- April and May 2026 source coverage probes on 2026-05-17 returned scheduled routes but no speed-route coverage, so March remains the complete public-source analysis month. A May GTFS-RT run can advance the observed layer, but it cannot honestly complete the March gate.
- `check:route-speed-availability` now makes the route segment speed release check reproducible. On 2026-05-17, it reported latest complete speed month `2026-03`; April and May 2026 are `missing_speed`.
- The May GTFS-RT observed layer now passes preflight for run `gtfs-rt-v1-20260517T022348Z`: 480/480 snapshots, 358,875 parsed vehicle positions, 73,702 observed headway samples, and 229 observed route summaries.
- The active 24-hour GTFS-RT run is live forward collection, not backfill. Production scope must include a deployed collector for live Bus Time snapshots and a monthly public-source watcher for route segment speed releases.

Primary remaining roadmap:

1. Decide whether v1 is March structural + May observed appendix, or wait for public speed coverage so a later month can become the single strict v1 month.
2. Finish production data refresh operations: deploy/configure the scheduled GTFS-RT R2 capture hook and monthly public-source watcher, then add rebuild handoff, artifact verification, and monitoring for missed samples or source-publication lag.
3. Reduce remaining bus-lane source gaps where public dates can be recovered, and review the peer-adjusted ACE/ABLE/bus-lane method with domain experts.
4. Align the public frontend around proof-finding route/corridor briefs rather than a generic route analytics dashboard.

The older phase list below remains as historical context for how the repo reached the current baseline.

## Phase 0 — Repo and source validation

1. Read root `AGENTS.md`, root `CLAUDE.md`, `knowledge/index.md`, and `knowledge/raw/source_manifest.yaml`.
2. Read [[wiki/engineering/package_structure|Repo Package Structure]].
3. Confirm the TypeScript-only package layout exists.
4. Implement the first `tools/pipeline` source probe using fixtures.
5. Probe live source metadata only after the fixture test passes.
6. Write metadata outputs to `knowledge/raw/metadata/`.
7. Update every relevant `knowledge/wiki/data/*.md` page with exact field names, row counts, and last-updated values.
8. Update `knowledge/wiki/data/source_registry.md` statuses from `needs_schema_probe` to `active` or `blocked`.
9. Append a log entry.

## Phase 1 — Data ingestion prototype

1. Implement `packages/domain` types for routes, directions, periods, source snapshots, scorecards, and hotspots.
2. Implement `packages/sources` Socrata/MTA source adapters.
3. Implement `tools/pipeline` commands for segment speeds, routes, and stops.
4. Store raw downloads in gitignored `data/raw/`.
5. Store normalized working data in gitignored `data/working/`.
6. Load selected route/month data for M1.
7. Add data-quality tests using committed fixtures.

## Phase 2 — Analysis MVP

1. Implement `packages/analytics` transformations.
2. Compute weighted speed averages by route/segment/time period.
3. Identify hotspots.
4. Add ridership weights if the schema probe is complete. Historical M1 route/month hotspots did this first; the current network build stores route/month hourly ridership evidence in the local pipeline DB.
5. Add ACE and bus-lane overlays if schemas are confirmed. Historical M1 overlays are superseded by full-network `route-intervention-evaluation` rows for ACE/ABLE and matched NYC DOT bus-lane events/source gaps.
6. Add schedule comparison if the schema probe is complete. Historical M1 schedule comparison is superseded by full-network schedule baselines and reliability baseline rows.
7. Generate a route scorecard for M1. Historical M1 scorecards are superseded by the full-network route scorecard, route brief, and corridor brief build.
8. Generate deterministic route brief inputs with citations/caveats. Historical M1 brief inputs are superseded by `brief-artifacts` JSON/Markdown/HTML bodies for public routes and corridors.
9. Write artifacts to `data/artifacts/`. Historical M1 artifacts are superseded by route/corridor brief manifests, evaluation manifests, map manifests, and D1 export verification for the full network.

## Phase 3 — Serving MVP

1. Implement `packages/db` D1 migrations and repositories.
2. Generate local D1 seed/import data from `tools/pipeline`.
3. Build `apps/web` as React + Vite + Cloudflare Worker API.
4. Add route scorecard page.
5. Add segment hotspot map.
6. Add route brief page.
7. Add source citations/caveats panel.

## Phase 4 — Optional LLM wiki/search

1. Index `knowledge/wiki` pages and selected generated briefs.
2. Implement cited retrieval.
3. Add memo-generation workflow only after deterministic metrics exist.
4. Add evaluation questions to detect hallucinations.

## Phase 5 — Portfolio polish

1. Add README architecture diagram.
2. Add demo video script.
3. Add deployment notes.
4. Add resume bullets.
5. Add outreach email draft.

## Non-goals for early phases

- No Python package scaffold.
- No FastAPI.
- No hosted Postgres/PostGIS.
- No VPS.
- Realtime Bus Time collection was promoted into v1 scope on 2026-05-16; it is no longer a v1 non-goal.

---
title: Codex Roadmap
type: project
status: active
last_updated: 2026-04-26
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
- D1 seed export and verification exist for the current route-serving projection.
- Route brief summaries and deterministic brief input artifacts exist, but final route/corridor brief bodies do not.

Primary remaining roadmap:

1. Reset docs and command references around the generic route/network pipeline.
2. Harden the current full-network route build and remove known M1-era assumptions, especially Manhattan-only bus-lane matching.
3. Add GTFS-RT collection and observed headway sample storage.
4. Compute observed reliability, bunching, long-gap, and wait-time reliability metrics.
5. Add intervention evaluation artifacts for ACE and bus-lane changes where source coverage supports them.
6. Add deterministic corridor grouping and corridor metrics.
7. Generate final route and corridor brief artifacts.
8. Expand D1/static export contracts and QA gates to cover reliability, interventions, corridors, and brief bodies.

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
4. Add ridership weights if the schema probe is complete. Completed for M1 route/month hotspots using route-level hourly exposure.
5. Add ACE and bus-lane overlays if schemas are confirmed. ACE route-level overlay and bus-lane proximity overlay completed for the current M1 March 2026 artifact set.
6. Add schedule comparison if the schema probe is complete. Completed for the current M1 March 2026 hotspot artifact using 2026 schedule timepoint rows.
7. Generate a route scorecard for M1. Completed for the current M1 March 2026 hotspot summary.
8. Generate deterministic route brief inputs with citations/caveats. Completed for the current M1 March 2026 scorecard and hotspot summary.
9. Write artifacts to `data/artifacts/`. Completed for the current M1 March 2026 artifact set, including a manifest with keys and hashes.

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

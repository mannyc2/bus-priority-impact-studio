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
4. Add ridership weights if the schema probe is complete.
5. Add ACE and bus-lane overlays if schemas are confirmed.
6. Generate a route scorecard for M1.
7. Generate deterministic route brief inputs with citations/caveats.
8. Write artifacts to `data/artifacts/`.

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
- No realtime Bus Time collector unless explicitly promoted from optional to required.

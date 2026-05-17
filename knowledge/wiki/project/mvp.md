---
title: MVP
type: project
status: active
last_updated: 2026-05-17
owner: codex
source_count: 3
tags: [mvp, product, implementation]
---

# MVP

## Current MVP scope

The MVP has moved beyond the original single-route demo. The current v1 finish line is the full-network evidence pipeline described in [[wiki/engineering/data_pipeline_v1_completion_plan|Data Pipeline v1 completion plan]]:

1. Full-network route and corridor metrics for the selected analysis month.
2. Public-visible route and corridor brief artifacts.
3. GTFS-RT observed reliability, bunching, and long-gap evidence where collected samples support it.
4. ACE and bus-lane intervention evaluation artifacts with explicit methodology levels and caveats.
5. D1/static export verification so the public app reads compact serving tables and generated artifacts, not live analytics code.

M1 remains useful as a fixture and narrative example because MTA has used it in public bus-speed writing. It is no longer the product boundary.

## P0 features

- Source registry validation.
- Socrata metadata/schema ingestion.
- Segment-speed ingestion for the selected full-network analysis month.
- Current route/stop geometry ingestion.
- Segment geometry construction by projecting timepoint stops onto route shapes.
- Route scorecards with speed, travel time, trip counts, ridership exposure, hotspots, schedule baselines, and caveats.
- Corridor summaries and deterministic route-to-corridor membership.
- Full route and corridor brief generation from deterministic metrics and cited sources.
- D1 export and static artifact manifests with byte-length and SHA-256 verification.

## P1 features

- ACE route/implementation overlay.
- NYC DOT bus-lane overlay.
- Bus hourly ridership weighting.
- GTFS-RT collection, observed headway samples, bunching, long-gap, and wait-time reliability summaries.
- Before/after ACE analysis and source-gap bus-lane comparison rows where implementation dates are unavailable.
- Strict v1 QA gates for source freshness, GTFS-RT provenance, observed-route coverage, intervention coverage, corridor assignment quality, D1 readback, and artifact hashes.

## P2 features

- Seasonality-aware and matched-comparison intervention evaluation.
- Dated bus-lane before/after evaluation when route-level implementation dates are available.
- Richer segment-based corridor membership and corridor intervention context.
- Map payload manifests and detailed evaluation payload contracts.
- LLM wiki search over data dictionaries, MTA blog posts, source registry, and generated route briefs.
- Full event-study design with comparison routes.
- Public frontend deployment.
- Automated monthly data refresh.

## Demo narrative

1. Start from a ranked route/corridor finding, not a generic dashboard.
2. Show where the route or corridor loses speed and reliability.
3. Explain rider impact with ridership weighting and caveats.
4. Show whether public interventions are present, evaluated, or still a source gap.
5. Open the generated route/corridor brief with citations, method status, hashes, and data dates.
6. Use the frontend as proof of a specific defensible finding, not as the pitch by itself.

## Sources

- https://www.mta.info/article/mapping-movement-exploring-nyc-bus-route-shapes-through-segment-level-speed-data — verified_at: 2026-04-26
- https://www.mta.info/article/beyond-route-introducing-granular-mta-bus-speed-data — verified_at: 2026-04-26
- https://www.mta.info/agency/new-york-city-transit/automated-camera-enforcement — verified_at: 2026-04-26

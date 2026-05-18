---
title: Project Overview
type: project
status: active
last_updated: 2026-04-26
owner: codex
source_count: 5
tags: [mta, bus, product, portfolio]
---

# Project Overview

**Bus Priority Impact Studio** is a public-data decision-support product for MTA bus performance and intervention analysis.

It helps answer:

> Which bus routes and segments are slow or unreliable, what public data explains the issue, what intervention is most justified, and did past interventions such as ACE or bus lanes work?

## Why this matters

MTA bus operations are exposed to street conditions: traffic, blocked lanes/stops, double parking, road work, and signal/boarding friction. MTA has published granular route-segment speed data, route/stops geospatial data, ridership data, ACE data, and developer feeds. This creates an opportunity to build an analyst-grade tool from public data.

## Product shape

The app should include:

1. **Route scorecards** — speed, travel time, ridership-weighted severity, segment hotspots, bus-lane/ACE status, and caveats.
2. **Hotspot map** — slow timepoint-to-timepoint segments projected onto actual route shapes.
3. **Intervention tracker** — before/after and event-study style analysis for ACE and bus-lane-related interventions.
4. **Cited memo generator** — deterministic metrics plus source-backed narrative summary.
5. **LLM wiki / corpus search** — source-aware search over MTA documents, data dictionaries, blog posts, and project analyses.

## AI interaction stance

The Studio uses AI to prepare evidence for analyst judgment, not to create a generic chat surface.
AI output should become product artifacts such as findings, reasoning trails, segment notes, claim
seeds, caveats, reviewer notes, and brief drafts. Deterministic code remains the source of truth for
metrics, source freshness, joins, validation, and publication gates.

See [[wiki/project/ai_interaction_model|AI Interaction Model]] for the canonical product doctrine.

## Non-goals

- Do not build a full route planner as the primary product.
- Do not compete with official MTA apps for rider trip planning.
- Do not generate metric claims from LLM text alone.
- Do not imply MTA endorsement.

## MVP hypothesis

A strong MVP can be built around one route or borough, using public data only:

- Segment speeds.
- Current bus routes/stops.
- Hourly ridership.
- ACE routes/violations.
- NYC DOT bus lanes.
- Service alerts as disruption context.
- MTA docs/blog/press for narrative context.

## Sources

- https://www.mta.info/open-data — verified_at: 2026-04-26
- https://www.mta.info/developers — verified_at: 2026-04-26
- https://www.mta.info/article/mapping-movement-exploring-nyc-bus-route-shapes-through-segment-level-speed-data — verified_at: 2026-04-26
- https://www.mta.info/article/beyond-route-introducing-granular-mta-bus-speed-data — verified_at: 2026-04-26
- https://www.mta.info/agency/new-york-city-transit/automated-camera-enforcement — verified_at: 2026-04-26

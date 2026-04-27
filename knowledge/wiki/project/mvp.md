---
title: MVP
type: project
status: active
last_updated: 2026-04-26
owner: codex
source_count: 3
tags: [mvp, product, implementation]
---

# MVP

## Recommended MVP scope

Start with one of these scopes:

1. **M1 route demo** — best for a tight, polished proof because MTA used M1 in its segment-speed blog.
2. **Manhattan bus pilot** — strong for CBD/bus-lane/ACE context.
3. **20-route worst-route pilot** — strong for business impact, but requires external route ranking source or an internal ranking derived from data.

Default recommendation: begin with **M1**, then expand to **Manhattan routes**.

## P0 features

- Source registry validation.
- Socrata metadata/schema ingestion.
- Segment-speed ingestion for selected routes/months.
- Current route/stop geometry ingestion.
- Segment geometry construction by projecting timepoint stops onto route shapes.
- Route scorecard with speed, travel time, trip counts, and ridership-weighted severity.
- Map of slow timepoint-to-timepoint segments.
- One route brief generated from deterministic metrics and cited sources.

## P1 features

- ACE route/implementation overlay.
- NYC DOT bus-lane overlay.
- Bus hourly ridership weighting.
- Before/after ACE analysis for one or more routes.
- Service alerts filtering.
- LLM wiki search over data dictionaries, MTA blog posts, source registry, and generated route briefs.

## P2 features

- Realtime Bus Time collector for headways/bunching.
- Multi-route intervention recommendation ranking.
- Full event-study design with comparison routes.
- Public frontend deployment.
- Automated monthly data refresh.

## Demo narrative

1. Pick a route and month.
2. Show slow segments by time of day.
3. Explain rider impact with ridership weighting.
4. Overlay ACE/bus-lane status.
5. Generate a route brief with caveats.
6. Show how the system would prioritize next interventions.

## Sources

- https://www.mta.info/article/mapping-movement-exploring-nyc-bus-route-shapes-through-segment-level-speed-data — verified_at: 2026-04-26
- https://www.mta.info/article/beyond-route-introducing-granular-mta-bus-speed-data — verified_at: 2026-04-26
- https://www.mta.info/agency/new-york-city-transit/automated-camera-enforcement — verified_at: 2026-04-26

---
title: Hotspot Detection
type: analysis
status: draft
last_updated: 2026-04-26
owner: codex
source_count: 2
tags: [analysis, hotspots, speed]
---

# Hotspot Detection

## Goal

Identify route segments where observed bus speeds are persistently low and rider impact is high.

## Inputs

- `fact_segment_speed`
- `dim_route_segment`
- `fact_hourly_ridership`
- optional `dim_bus_lane_segment`
- optional `dim_ace_route`
- optional alerts/disruptions

## Method

1. Filter to selected route/month/time periods.
2. Compute trip-count-weighted average speed per segment/time window.
3. Normalize by route, borough, and time-of-day baselines.
4. Compute severity percentile.
5. Compute persistence across time windows.
6. Add ridership weight.
7. Flag intervention context: ACE, bus lanes, alerts.
8. Rank top segments.

## Candidate outputs

- `segment_hotspot_score`
- `speed_mph`
- `route_baseline_speed_mph`
- `severity_percentile`
- `persistence_score`
- `ridership_weight`
- `bus_lane_overlap_pct`
- `ace_status`
- `alert_flag`

## Caveats

- Use observed speeds carefully; they include dwell and traffic effects.
- Avoid citywide ranking before route/geometry QA.
- Avoid claiming causality from hotspots alone.

## Sources

- https://www.mta.info/article/beyond-route-introducing-granular-mta-bus-speed-data — verified_at: 2026-04-26
- https://www.mta.info/article/mapping-movement-exploring-nyc-bus-route-shapes-through-segment-level-speed-data — verified_at: 2026-04-26

---
title: Hotspot Detection
type: analysis
status: draft
last_updated: 2026-04-27
owner: codex
source_count: 2
tags: [analysis, hotspots, speed]
---

# Hotspot Detection

## Goal

Identify route segments where observed bus speeds are persistently low and rider impact is high.

## Inputs

- Normalized route/month segment-speed slice from `data/working/route-slices/<route>-<YYYY-MM>/segment-speeds.json`.
- Normalized route/month hourly ridership slice from `data/working/route-slices/<route>-<YYYY-MM>/ridership.json`.
- Current route and stop geometry from the same route slice.
- Later: bus-lane overlays, ACE route/intervention history, and alerts/disruptions.

## Method

MVP command:

```bash
bun run hotspots:m1 -- --route M1 --year 2026 --month 3
```

The implemented MVP groups by route, month, direction, stop order, and adjacent timepoint stop IDs.

For each segment:

1. Compute trip-count-weighted average speed.
2. Compute trip-count-weighted average travel time.
3. Compute slow-window share, where a window is slow when average road speed is under the target speed.
4. Compute speed severity as `(targetSpeedMph - weightedAverageSpeedMph) / targetSpeedMph`, clamped from 0 to 1.
5. Compute hotspot score as `round((0.65 * speedSeverity + 0.35 * slowWindowShare) * 100)`.
6. Join route-level ridership exposure by day-of-week and hour.
7. Compute `riderDelayIndex` as the sum of hourly ridership exposure multiplied by per-window speed severity.
8. Normalize to `riderImpactShare` by dividing each segment's `riderDelayIndex` by the route/month maximum.
9. Compute rider-impact score as `round((0.65 * hotspotScore/100 + 0.35 * riderImpactShare) * 100)`.
10. Sort by rider-impact score when ridership is present; otherwise sort by hotspot score.

Default target speed is 8 mph. The score is a deterministic prioritization heuristic, not a causal claim.

## Candidate outputs

- `segment_hotspot_score`
- `speed_mph`
- `weighted_average_travel_time_minutes`
- `route_weighted_average_speed_mph`
- `slow_window_share`
- `speed_severity`
- `ridership_exposure`
- `rider_delay_index`
- `rider_impact_share`
- `rider_impact_score`
- later: `bus_lane_overlap_pct`, `ace_status`, `alert_flag`

## M1 March 2026 pilot output

Live local run on 2026-04-27:

- observations: 2,003 segment-speed rows
- ridership windows: 168 route/day/hour rows
- route-month ridership: 207,870 riders
- route weighted average speed: 6.7409 mph
- segments: 13 timepoint-to-timepoint segments
- top rider-impact score: 63

Top rider-impact segments:

- northbound `MADISON AV/E 28 ST` to `MADISON AV/E 58 ST`, speed-only score 43, rider-impact score 63
- southbound `5 AV/E 72 ST` to `5 AV/W 41 ST`, speed-only score 47, rider-impact score 61
- northbound `4 AV/E 10 ST` to `MADISON AV/E 28 ST`, speed-only score 47, rider-impact score 56

## Caveats

- Use observed speeds carefully; they include dwell and traffic effects.
- Avoid citywide ranking before route/geometry QA.
- Avoid claiming causality from hotspots alone.
- Ridership is route-level hourly exposure, not segment-level passenger load.

## Sources

- https://www.mta.info/article/beyond-route-introducing-granular-mta-bus-speed-data — verified_at: 2026-04-26
- https://www.mta.info/article/mapping-movement-exploring-nyc-bus-route-shapes-through-segment-level-speed-data — verified_at: 2026-04-26

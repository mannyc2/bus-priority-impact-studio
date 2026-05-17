---
title: Hotspot Detection
type: analysis
status: implemented
last_updated: 2026-04-29
owner: codex
source_count: 2
tags: [analysis, hotspots, speed]
---

# Hotspot Detection

## Goal

Identify route segments where observed bus speeds are persistently low and rider impact is high.

## Inputs

- Segment-speed observations from `local_route_segment_speed` (source: MTA Bus Route Segment Speeds, Socrata `kufs-yh3x` for 2025+ and `58t6-89vi` for 2023-2024).
- Route-level hourly ridership from `local_route_hourly_ridership` (source: MTA Bus Hourly Ridership, Socrata `gxb3-akrn` for 2025+ and `kv7t-n8in` for 2020-2024).

## Implementation

Source: `packages/analytics/src/hotspots.ts` — `detectSegmentHotspots()`

```bash
bun run build:network -- --year 2026 --month 3
bun run build:hotspots -- --route M1 --year 2026 --month 3
```

### Grouping

Observations are grouped by `(routeId, isoMonth, direction, stopOrder, timepointStopId, nextTimepointStopId)`. Each group represents a directional segment between two consecutive timepoint stops.

### Per-segment metrics

1. **Weighted average speed**: `sum(speed * busTripCount) / sum(busTripCount)`. Weighting by trip count gives higher-traffic windows more influence on the average.
2. **Weighted average travel time**: same weighting approach applied to `averageTravelTimeMinutes`.
3. **Slow window share**: proportion of observation windows where `averageRoadSpeedMph < targetSpeedMph`. Measures how frequently the segment is slow, not just how slow on average.
4. **Speed severity**: `clamp((targetSpeed - weightedAverageSpeed) / targetSpeed, 0, 1)`. Normalized deficit from target — 0 means at or above target, 1 means zero speed.
5. **Hotspot score**: `round((0.65 * speedSeverity + 0.35 * slowWindowShare) * 100)`. Blends chronic slowness (65%) with frequency of slow windows (35%). Range 0–100.

### Rider-impact scoring

When ridership data is available, observations are joined to route-level hourly ridership by `(dayOfWeek, hourOfDay)`:

6. **Ridership exposure**: sum of hourly ridership across all matched observation windows for the segment.
7. **Rider delay index**: `sum(ridership * speedSeverity)` per window — captures how many riders experience each unit of slowness.
8. **Rider impact share**: segment's `riderDelayIndex / max(riderDelayIndex across all segments)`. Normalized to the worst segment on the route.
9. **Rider-impact score**: `round((0.65 * hotspotScore/100 + 0.35 * riderImpactShare) * 100)`. Blends the speed-only score with rider exposure. Range 0–100.

### Sorting

When ridership-weighted, segments are sorted by `riderImpactScore` descending; otherwise by `hotspotScore` descending. Ties broken by `weightedAverageSpeedMph` ascending (slower = higher priority).

### Parameters

| Parameter | Default | Notes |
|---|---|---|
| `targetSpeedMph` | 8 | MTA's approximate local-route target |
| `slowSpeedThresholdMph` | 8 | Same as target by default |
| `limit` | 10 | Max hotspots returned |

## Limitations

1. **Ridership is route-level, not segment-level.** The join uses route-wide hourly ridership as a proxy for segment load. A segment that is slow during peak hours gets high rider-impact weight even if few riders actually travel that segment. Proper segment-level weighting requires APC (automated passenger counter) data, which MTA does not publish at this granularity.

2. **Observed speeds include dwell time.** MTA segment speeds are timepoint-to-timepoint averages that include stop dwell, traffic signals, and congestion. The hotspot score reflects all of these, not just running speed.

3. **Single-month snapshot.** Scores reflect one month of data. A segment that is slow due to temporary construction will score the same as one with chronic congestion. Multi-month trend analysis is needed to distinguish persistent from transient hotspots.

4. **No causal claims.** A high hotspot score means the segment is slow and rider-exposed, not that a specific intervention would fix it. The score is a prioritization heuristic for directing deeper investigation.

## Test coverage

`packages/analytics/test/hotspots.test.ts` verifies:
- Trip-count-weighted averaging ranks persistent slow segments above faster ones
- Ridership exposure reranks segments when a less-slow segment serves far more riders
- Empty observation sets are rejected

## Sources

- https://www.mta.info/article/beyond-route-introducing-granular-mta-bus-speed-data — verified_at: 2026-04-26
- https://www.mta.info/article/mapping-movement-exploring-nyc-bus-route-shapes-through-segment-level-speed-data — verified_at: 2026-04-26

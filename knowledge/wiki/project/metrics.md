---
title: Metrics
type: project
status: active
last_updated: 2026-05-17
owner: codex
source_count: 2
tags: [metrics, speed, reliability, bus-priority]
---

# Metrics

## Core metrics

### Segment speed

Use MTA Bus Route Segment Speeds as the observed travel-speed source.

Confirmed working fields include:

- year
- month
- day_of_week
- hour_of_day
- route_id
- trip_type / route_type
- direction_id
- timepoint_stop_name
- next_timepoint_stop_name
- start/end coordinates
- road_distance_miles
- average_travel_time_minutes
- average_speed_mph
- bus_trips

Status: active in the March 2026 full-network build.

### Ridership-weighted severity

Goal: avoid ranking low-volume segments above busy corridors solely because they are slow.

Candidate formula:

```text
segment_severity = max(0, target_speed_mph - observed_speed_mph) / target_speed_mph
ridership_weighted_segment_severity = segment_severity * route_hour_ridership
```

Use route/hour ridership if route/segment-level ridership is unavailable.

### Persistence

A hotspot should be persistent across months/day-types/hours, not one anomalous hour.

Candidate formula:

```text
persistence = count(month-hour windows where speed < threshold) / total windows observed
```

### Intervention coverage

Flags:

- `has_bus_lane_overlap`
- `has_ace_route`
- `ace_start_date`
- `ace_violation_rate`
- `has_recent_alerts`
- `is_cbd`

### Bus priority need score

First transparent scoring model:

```text
score =
  0.30 * speed_severity_percentile +
  0.25 * ridership_weight_percentile +
  0.20 * persistence_percentile +
  0.15 * reliability_or_bunching_percentile +
  0.10 * intervention_gap_score
```

Where `intervention_gap_score` is high if a route/segment is slow, busy, persistent, and not already covered by ACE/bus lanes.

### Observed reliability and bunching

GTFS-RT vehicle-position collection supports:

- observed headway samples by route, direction, stop, and timestamp,
- median / p90 / max observed headway,
- bunching share,
- long-gap share,
- expected wait time,
- scheduled-vs-observed wait delta,
- sample count and coverage status.

These metrics are run-scoped and analysis-month aligned. A realtime run collected in May 2026 can support May observed reliability, but it cannot be used as March 2026 evidence.

## Caveats

- Segment-speed data includes dwell time, traffic, stops, reliefs, closures, and other real customer travel-time factors; this is good for rider experience but not pure vehicle free-flow speed.
- Hourly ridership may be route-level rather than segment-level.
- ACE impact needs comparison routes and careful event windows; naive before/after can be confounded by seasonal changes and service changes.
- Realtime Bus Time data is not historical unless collected; GTFS-RT observed reliability is now v1 scope and must carry collection-window/sample caveats.

## Sources

- https://www.mta.info/article/beyond-route-introducing-granular-mta-bus-speed-data — verified_at: 2026-04-26
- https://www.mta.info/article/mapping-movement-exploring-nyc-bus-route-shapes-through-segment-level-speed-data — verified_at: 2026-04-26

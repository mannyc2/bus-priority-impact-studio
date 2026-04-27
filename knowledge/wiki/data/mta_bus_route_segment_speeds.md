---
title: MTA Bus Route Segment Speeds
type: data
status: needs_schema_probe
last_updated: 2026-04-26
owner: codex
source_count: 4
tags: [mta, bus, speeds, performance, core]
---

# MTA Bus Route Segment Speeds

## Why this matters

This is the core performance dataset. It provides observed bus speed/travel-time data at the route/timepoint/time-window level, making it the main source for identifying slow segments.

## What we know

Datasets:

- Beginning 2025: `kufs-yh3x`
- 2023–2024 historical: `58t6-89vi`

MTA describes this dataset as measuring how fast buses travel between pairs of subsequent timepoints, the major stops on a route. It includes average speed, average travel time, road distance, number of bus trips, route/trip type, borough, timepoint names, coordinates, and stop-sequence order. It is aggregated by month, day of week, and hour of day.

MTA’s methodology note says speed calculations include real rider-experience factors such as dwell time, stoplights, reliefs, road closures, delivery vehicles, and traffic slowdowns.

MTA’s 2026 blog says the speed dataset is tabular and does not include true segment line geometry; the route geometry must be constructed by projecting stops onto route shapes and deriving the path between them.

## Grain

Expected grain, pending schema probe:

```text
route_id + direction_id + trip_type/route_type + year + month + day_of_week + hour_of_day + timepoint_stop_pair
```

## Required fields after schema probe

Codex must probe exact field names before coding. Expected conceptual fields:

- year
- month
- day_of_week
- hour_of_day
- route_id
- route_type / trip_type
- borough
- direction_id
- timepoint_stop_name
- next_timepoint_stop_name
- stop sequence fields
- start/end latitude/longitude
- road distance
- average travel time
- average speed
- bus trips

## Joins / dependencies

- Join to [[wiki/data/mta_bus_geospatial|MTA Bus Routes and Stops]] by route/direction/shape/timepoint stop identifiers or names/coordinates.
- Join to [[wiki/data/mta_bus_ridership|MTA Bus Hourly Ridership]] by route/month/day/hour where possible.
- Join to [[wiki/data/ace_enforcement|ACE routes and violations]] by route and date.
- Join to [[wiki/data/nyc_dot_bus_lanes|NYC DOT bus lanes]] by segment geometry overlap.
- Filter or annotate with [[wiki/data/service_alerts_and_planned_changes|Service alerts and planned changes]].

## Implementation notes

1. Probe columns with `bun --filter @bp/pipeline sources:probe -- --dataset kufs-yh3x` and the corresponding current dataset ID once the TypeScript pipeline command exists.
2. Start with a narrow query, for example route `M1` and one recent month.
3. Build a normalized table `fact_bus_segment_speed`.
4. Use trip-count-weighted averages when aggregating across hours or days.
5. Build segment geometry as a transformation, not as a source field.

## Caveats

- Speeds represent customer travel-time factors, not free-flow traffic speed.
- Timepoint-to-timepoint segments are coarser than stop-to-stop segments.
- Timepoint names may not be stable join keys across data releases; prefer IDs where available.
- Segment geometry construction must follow actual route shape, not straight lines.

## Sources

- https://data.ny.gov/Transportation/MTA-Bus-Route-Segment-Speeds-Beginning-2025/kufs-yh3x — verified_at: 2026-04-26
- https://data.ny.gov/Transportation/MTA-Bus-Route-Segment-Speeds-2023-2024/58t6-89vi — verified_at: 2026-04-26
- https://www.mta.info/article/beyond-route-introducing-granular-mta-bus-speed-data — verified_at: 2026-04-26
- https://www.mta.info/article/mapping-movement-exploring-nyc-bus-route-shapes-through-segment-level-speed-data — verified_at: 2026-04-26

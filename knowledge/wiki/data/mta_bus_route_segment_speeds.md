---
title: MTA Bus Route Segment Speeds
type: data
status: active
last_updated: 2026-04-27
owner: codex
source_count: 5
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

Observed grain:

```text
route_id + direction + route_type + year + month + day_of_week + hour_of_day + stop_order + timepoint_stop_id + next_timepoint_stop_id
```

## Schema probe

Probe completed 2026-04-27. Metadata files:

| Dataset | Rows | Rows updated | Fields |
|---|---:|---:|---|
| `kufs-yh3x` | 7,280,927 | 2026-04-25T00:57:20Z | `year`, `month`, `timestamp`, `day_of_week`, `hour_of_day`, `route_id`, `direction`, `borough`, `route_type`, `stop_order`, `timepoint_stop_id`, `timepoint_stop_name`, `timepoint_stop_latitude`, `timepoint_stop_longitude`, `next_timepoint_stop_id`, `next_timepoint_stop_name`, `next_timepoint_stop_latitude`, `next_timepoint_stop_longitude`, `road_distance`, `average_travel_time`, `average_road_speed`, `bus_trip_count`, `timepoint_stop_georeference`, `next_timepoint_stop_georeference` |
| `58t6-89vi` | 11,656,097 | 2025-01-24T17:56:02Z | Same fields as `kufs-yh3x` |
| `r6db-kkzj` | 595,263 | 2026-04-24T16:48:44Z | `month`, `day_type`, `hour_of_day`, `time_period`, `route_type`, `route_id`, `cbd_relation`, `sum_mileage`, `sum_time`, `average_road_speed` |

## Joins / dependencies

- Join to [[wiki/data/mta_bus_geospatial|MTA Bus Routes and Stops]] by route/direction/shape/timepoint stop identifiers or names/coordinates.
- Join to [[wiki/data/mta_bus_ridership|MTA Bus Hourly Ridership]] by route/month/day/hour where possible.
- Join to [[wiki/data/ace_enforcement|ACE routes and violations]] by route and date.
- Join to [[wiki/data/nyc_dot_bus_lanes|NYC DOT bus lanes]] by segment geometry overlap.
- Filter or annotate with [[wiki/data/service_alerts_and_planned_changes|Service alerts and planned changes]].

## Implementation notes

1. Use the generated schema metadata under `knowledge/raw/metadata/`.
2. Use `bun run ingest:route-coverage -- --year YYYY --month M` to verify whether a month has speed rows before treating it as a v1 candidate.
3. Use `bun run build:network -- --year YYYY --month M` for the full-network route/month build; route-specific commands remain useful for fixtures and debugging.
4. Build normalized rows in `local_route_segment_speed`.
5. Use trip-count-weighted averages when aggregating across hours or days.
6. Build segment geometry as a transformation, not as a source field.

## Caveats

- Speeds represent customer travel-time factors, not free-flow traffic speed.
- Timepoint-to-timepoint segments are coarser than stop-to-stop segments.
- Timepoint names may not be stable join keys across data releases; prefer IDs where available.
- Segment geometry construction must follow actual route shape, not straight lines.

## Sources

- https://data.ny.gov/Transportation/MTA-Bus-Route-Segment-Speeds-Beginning-2025/kufs-yh3x — verified_at: 2026-04-26
- https://data.ny.gov/Transportation/MTA-Bus-Route-Segment-Speeds-2023-2024/58t6-89vi — verified_at: 2026-04-26
- https://data.ny.gov/Transportation/MTA-Central-Business-District-Bus-Speeds-Beginning/r6db-kkzj — verified_at: 2026-04-27
- https://www.mta.info/article/beyond-route-introducing-granular-mta-bus-speed-data — verified_at: 2026-04-26
- https://www.mta.info/article/mapping-movement-exploring-nyc-bus-route-shapes-through-segment-level-speed-data — verified_at: 2026-04-26

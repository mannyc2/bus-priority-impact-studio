---
title: MTA Bus Route Segment Speeds
type: data
status: active
last_updated: 2026-06-05
owner: codex
source_count: 6
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

The official overview attachment says the source uses GPS pings from BusTime and MTA's Bus Matching
2.0 route-matching process to build stop-arrival records, remove impossible or duplicate pings,
filter non-revenue trips, and combine those arrivals with road distance to calculate travel speed
between timepoint stops. Treat this as an observed customer travel-time measure, not an in-motion
traffic-speed measure.

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
4. Build normalized rows in `local_route_segment_speed` (filtered: rows lacking usable
   timepoint metadata are dropped) and `local_route_segment_speed_cell` (unfiltered native
   grain, nullable timepoint metadata; written by the same `ingest route-segment-speeds`
   fetch). The natural cell key (route x direction x timepoint-pair x month x day-of-week x
   hour) is not unique in the source — duplicate rows with identical geometry but different
   trip counts exist — so both tables key on a per-route-month rank.
   `build route-month-speed-golden-diff` proves the route-month speed aggregates in
   `local_route_month_trend` are a byte-identical projection of the cell table.
5. Use trip-count-weighted averages when aggregating across hours or days.
6. Build segment geometry as a transformation, not as a source field.

## Source cadence

This dataset is monthly aggregate evidence, not a realtime feed. Recent route schedules may appear before segment-speed rows for the same month, so `ingest:route-coverage` can show scheduled routes with `0` speed routes until MTA publishes the processed speed data. Strict v1 should wait for the monthly speed rows that match the collected GTFS-RT month.

Do not treat "1-2 month lag" as an MTA-published SLA. The official overview attachment records
release notes, including the initial release and a documentation update, but does not promise a
fixed publication delay. In product copy and release gates, phrase this as observed source
availability from `check route-speed-availability`; for example, the 2026-06-05 live check found
March 2026 as the latest complete public speed month and May 2026 as `missing_speed`.

## Caveats

- Speeds represent customer travel-time factors, not free-flow traffic speed.
- Timepoint-to-timepoint segments are coarser than stop-to-stop segments.
- The timepoint set can change from schedule to schedule because timepoint selection is tied to bus
  scheduling, not only to public stop importance.
- Multiple travel paths can exist between the same pair of timepoints for a route/direction, so
  distance and speed rows are not always one physical street segment.
- Timepoint names may not be stable join keys across data releases; prefer IDs where available.
- The official overview warns that holidays and GPS/sensor issues can make speeds coarse estimates,
  and notes rare GTFS typo cases such as a mislabeled January 2025 M101 stop.
- Segment geometry construction must follow actual route shape, not straight lines.

## Sources

- https://data.ny.gov/Transportation/MTA-Bus-Route-Segment-Speeds-Beginning-2025/kufs-yh3x — verified_at: 2026-04-26
- https://data.ny.gov/api/views/kufs-yh3x/files/40a05f94-c74b-464c-a5f9-96205ac2c6f8?filename=MTA_BusRouteSegmentSpeeds_Overview.pdf — verified_at: 2026-06-05
- https://data.ny.gov/Transportation/MTA-Bus-Route-Segment-Speeds-2023-2024/58t6-89vi — verified_at: 2026-04-26
- https://data.ny.gov/Transportation/MTA-Central-Business-District-Bus-Speeds-Beginning/r6db-kkzj — verified_at: 2026-04-27
- https://www.mta.info/article/beyond-route-introducing-granular-mta-bus-speed-data — verified_at: 2026-04-26
- https://www.mta.info/article/mapping-movement-exploring-nyc-bus-route-shapes-through-segment-level-speed-data — verified_at: 2026-04-26

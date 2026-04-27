---
title: MTA Bus Routes and Stops
type: data
status: active
last_updated: 2026-04-27
owner: codex
source_count: 5
tags: [mta, bus, routes, stops, geospatial, postgis]
---

# MTA Bus Routes and Stops

## Why this matters

Segment-speed data is tabular. Route and stop geospatial datasets are needed to map slow segments along real street-level bus paths.

## Datasets

Core current datasets:

- MTA Current Bus Routes: `h2wf-afav`
- MTA Current Bus Stops: `ai5j-txmn`

Secondary historical/bundle datasets:

- MTA Bus Routes: `bzwk-3hb4`
- MTA Bus Stops: `2ucp-7wg5`

## What we know

MTA’s 2026 blog says newly released bus stop and route datasets provide consistent, structured spatial representations of every stop and route shape in the bus network. The Bus Stops dataset includes stop identifiers/names, route identifiers, direction of travel, cardinal directions, timepoint flags, `iscbd`, and an `in_effect` flag. The Bus Routes dataset includes route-shape polylines with key fields such as `shape_id`, `route_type`, `direction_id`, and WKT `geometry`.

## Schema probe

Probe completed 2026-04-27. Metadata files live under `knowledge/raw/metadata/`.

| Dataset | Rows | Rows updated | Fields |
|---|---:|---:|---|
| `h2wf-afav` current routes | 1,640 | 2026-04-22T19:52:40Z | `valid_from`, `valid_to`, `in_effect`, `route_id`, `route_short_name`, `route_long_name`, `route_description`, `trip_type`, `route_type`, `bundle`, `route_color`, `direction_id`, `direction`, `shape_id`, `vertices`, `shape_length`, `min_longitude`, `min_latitude`, `max_longitude`, `max_latitude`, `geometry` |
| `ai5j-txmn` current stops | 23,048 | 2026-04-22T19:29:58Z | `valid_from`, `valid_to`, `in_effect`, `route_id`, `route_short_name`, `route_long_name`, `route_description`, `route_color`, `stop_id`, `stop_name`, `direction_id`, `direction`, `revenue_stop`, `timepoint`, `boarding`, `alighting`, `is_cbd`, `latitude`, `longitude`, `bundle`, `georeference` |
| `bzwk-3hb4` all-bundle routes | 200,476 | 2026-04-22T19:52:40Z | Same fields as `h2wf-afav` |
| `2ucp-7wg5` all-bundle stops | 3,074,918 | 2026-04-22T19:29:58Z | Same fields as `ai5j-txmn`, plus Socrata computed-region fields |

## Implementation notes

- Load routes as PostGIS `LINESTRING` or `MULTILINESTRING` from WKT.
- Load stops as PostGIS `POINT`.
- Construct segment geometries by:
  1. matching speed rows to start/end timepoint stops,
  2. selecting route shape by route/direction/shape/trip_type/effective bundle,
  3. projecting stop points onto the route shape,
  4. slicing line geometry between projected points.
- Prefer geometry from current datasets for MVP; use all-bundle datasets for historical route changes.

## Join strategy

Preferred after schema probe:

```text
fact_bus_segment_speed.route_id
+ direction_id
+ timepoint stop IDs or stop sequence fields
+ bundle/effective schedule period if available
```

Fallback:

```text
route_id + direction_id + normalized stop_name + nearest coordinate match
```

Codex must not rely on stop names alone if IDs are available.

## Caveats

- Route shapes can differ by trip pattern, not just route/direction.
- Current route shapes may not match historical segment speeds if the route was redesigned.
- Timepoint stop geometry must use timepoint flags, not all stops.
- Shape slicing can fail when stops are off-shape or route shape contains loops.

## Sources

- https://data.ny.gov/Transportation/MTA-Current-Bus-Routes/h2wf-afav — verified_at: 2026-04-26
- https://data.ny.gov/Transportation/MTA-Current-Bus-Stops/ai5j-txmn — verified_at: 2026-04-26
- https://data.ny.gov/Transportation/MTA-Bus-Routes/bzwk-3hb4 — verified_at: 2026-04-27
- https://data.ny.gov/Transportation/MTA-Bus-Stops/2ucp-7wg5 — verified_at: 2026-04-27
- https://www.mta.info/article/mapping-movement-exploring-nyc-bus-route-shapes-through-segment-level-speed-data — verified_at: 2026-04-26

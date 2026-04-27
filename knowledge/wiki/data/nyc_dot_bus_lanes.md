---
title: NYC DOT Bus Lanes
type: data
status: active
last_updated: 2026-04-27
owner: codex
source_count: 2
tags: [nyc-dot, bus-lanes, geospatial]
---

# NYC DOT Bus Lanes

## Why this matters

Bus lanes are a key bus-priority intervention. Overlaying bus-lane locations with slow MTA segments lets the app distinguish:

- slow segments with existing bus-lane infrastructure,
- slow segments without bus lanes,
- routes where ACE is active but bus lanes are absent or partial,
- potential candidate corridors.

## Dataset

NYC Open Data: Bus Lanes - Local Streets — `ycrg-ses3`.

Known description: each record represents a segment of a bus lane based on NYC LION street segments. The `SegmentID` field can be used to join with LION data.

## Schema probe

Probe completed 2026-04-27: `ycrg-ses3` has 4,068 rows, rows updated 2026-04-06T15:44:03Z, and 29 fields:

```text
the_geom, street, bltrafdir, segmentid, rw_type, streetwidt, boro, facility, direction, hours, days, days_code, lane_width, lane_type1, lane_type, lane_type2, lane_color, sbs_route1, sbs_route2, sbs_route3, open_dates, year1, year2, year3, last_updat, chron_id_1, shape_leng, shape_le_1, mid_block
```

## Implementation notes

- Load as geospatial line/segment data if geometry is present.
- If the dataset contains LION segment IDs without geometry, join to NYC LION centerline geometry.
- `bun run ingest:bus-lanes` writes normalized bus-lane rows to `data/working/interventions/bus-lanes-local-streets.json`.
- `bun run bus-lanes:m1` writes the current route street/proximity overlay to `data/artifacts/route-slices/<route>-<month>/bus-lane-overlay.json`, including bus-lane open dates where the source publishes them.
- `bun run route-intervention-history -- --year 2026 --month 3` summarizes matched bus-lane open-date coverage across the current route batch.
- Compute overlap with MTA route segment geometries.
- Store overlap percent and bus-lane metadata.

## Caveats

- Bus lanes have specific active hours/signage; the dataset may not include all regulatory details.
- Bus-lane presence does not mean clear or effective bus-priority operation.
- NYC DOT data and MTA route-shape data may use different geometry/segment representations.
- The current M1 overlay uses street-name and stop-proximity matching, not exact line-over-line overlap.

## Sources

- https://data.cityofnewyork.us/Transportation/Bus-Lanes-Local-Streets/ycrg-ses3 — verified_at: 2026-04-26
- https://catalog.data.gov/dataset/bus-lanes-local-streets — verified_at: 2026-04-26

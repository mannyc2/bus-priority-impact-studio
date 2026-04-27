---
title: NYC DOT Bus Lanes
type: data
status: needs_schema_probe
last_updated: 2026-04-26
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

## Implementation notes

- Load as geospatial line/segment data if geometry is present.
- If the dataset contains LION segment IDs without geometry, join to NYC LION centerline geometry.
- Compute overlap with MTA route segment geometries.
- Store overlap percent and bus-lane metadata.

## Caveats

- Bus lanes have specific active hours/signage; the dataset may not include all regulatory details.
- Bus-lane presence does not mean clear or effective bus-priority operation.
- NYC DOT data and MTA route-shape data may use different geometry/segment representations.

## Sources

- https://data.cityofnewyork.us/Transportation/Bus-Lanes-Local-Streets/ycrg-ses3 — verified_at: 2026-04-26
- https://catalog.data.gov/dataset/bus-lanes-local-streets — verified_at: 2026-04-26

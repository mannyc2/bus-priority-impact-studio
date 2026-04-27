---
title: MTA Developer Resources
type: data
status: active
last_updated: 2026-04-27
owner: codex
source_count: 3
tags: [mta, gtfs, realtime, api]
---

# MTA Developer Resources

## Why this matters

The developer resources page is the official entry point for static GTFS, GTFS-RT, Bus Time APIs, and feed terms. It establishes which transit data can be pulled and which constraints apply.

## What we know

MTA publishes static GTFS data for subways, railroads, and buses. Bus GTFS is split into six files, generally by borough / bus company:

- Bronx: `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_bx.zip`
- Brooklyn: `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_b.zip`
- Manhattan: `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_m.zip`
- Queens: `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_q.zip`
- Staten Island: `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_si.zip`
- MTA Bus Company: `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_busco.zip`

MTA says bus GTFS is generally updated four times per year for quarterly bus schedule changes, and temporary service changes/detours generally are not included.

For realtime buses, MTA Bus Time provides GTFS-RT endpoints requiring an API key:

- `https://gtfsrt.prod.obanyc.com/tripUpdates?key=<YOUR_KEY>`
- `https://gtfsrt.prod.obanyc.com/vehiclePositions?key=<YOUR_KEY>`
- `https://gtfsrt.prod.obanyc.com/alerts?key=<YOUR_KEY>`

MTA also provides subway/rail/service alerts in GTFS-RT format and links to feed-specific protobuf extensions.

## Probe status

Probe completed 2026-04-27. The developer resources page, data-feed terms page, six static bus GTFS zip URLs, three Bus Time GTFS-RT endpoints, MTA GTFS alerts PDF, and GTFS Realtime reference page were all active. GTFS zip files were checked by HTTP metadata only and were not downloaded.

## Compliance notes

MTA data-feed terms say developers may download and host data on a non-MTA server, but must not build apps that make the data available to users directly from MTA servers. The terms also instruct developers not to imply MTA licensing/endorsement, not to state that data is accurate/complete/timely, and to consider accessibility.

## Implementation notes

- Static GTFS is useful for schedule/trip/shape baseline.
- Socrata current bus routes/stops may be more convenient for geospatial visualization.
- Realtime Bus Time is optional for MVP because historical headways require collection over time.
- If using realtime feeds in a deployed app, run an internal collector/cache and serve users from our own backend.

## Sources

- https://www.mta.info/developers — verified_at: 2026-04-26
- https://bustime.mta.info/wiki/Developers/GTFSRt — verified_at: 2026-04-26
- https://www.mta.info/developers/terms-and-conditions — verified_at: 2026-04-26

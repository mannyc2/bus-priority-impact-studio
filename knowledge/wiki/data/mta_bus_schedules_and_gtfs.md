---
title: MTA Bus Schedules and GTFS
type: data
status: active
last_updated: 2026-04-27
owner: codex
source_count: 8
tags: [mta, gtfs, schedules, bus]
---

# MTA Bus Schedules and GTFS

## Why this matters

Schedules provide planned service context. They help interpret observed speed/travel time against scheduled timepoints, planned headways, and route patterns.

## Sources

### MTA Bus Schedules: 2026

Socrata dataset: `4fnn-qsea`.

Rows for each scheduled timepoint stop on a trip.

Probe completed 2026-04-27: 8,937,275 rows, rows updated 2026-04-26T19:07:48Z, 25 fields:

```text
schedule_date, day_type, borough, operator, service_id, direction, shape_id, trip_type, route_id, stop_sequence, stop_id, stop_name, schedule_time, origin, destination, school, revenue_stop, timepoint, boarding, alighting, distance_from_start, trip_headsign, block_id, depot_code, bundle
```

### Static Bus GTFS feeds

MTA Developer Resources lists six bus GTFS zip files, generally split by borough / bus company:

- `gtfs_bx.zip`
- `gtfs_b.zip`
- `gtfs_m.zip`
- `gtfs_q.zip`
- `gtfs_si.zip`
- `gtfs_busco.zip`

MTA says bus GTFS is generally updated four times a year for quarterly bus schedule changes, and temporary service changes/detours generally are not included.

Probe completed 2026-04-27. The zip URLs were verified with HTTP metadata only; files were not downloaded into `data/raw/`.

| Feed | Size | Last modified |
|---|---:|---:|
| Bronx | 7,774,521 bytes | 2026-04-08T13:20:19Z |
| Brooklyn | 15,937,868 bytes | 2026-04-08T13:20:18Z |
| Manhattan | 7,762,091 bytes | 2026-04-08T13:20:20Z |
| Queens | 5,525,076 bytes | 2026-04-08T13:20:20Z |
| Staten Island | 6,122,389 bytes | 2026-04-08T13:20:20Z |
| MTA Bus Company | 8,090,707 bytes | 2026-04-17T13:54:34Z |

## Implementation notes

- Prefer the Socrata Bus Schedules dataset for timepoint schedule rows if it has simpler fields.
- `bun run ingest:m1-schedules` writes normalized M1 timepoint schedule rows to `data/working/route-slices/m1-2026-03/schedules.json`.
- `bun run schedules:m1` writes planned-vs-observed hotspot comparisons to `data/artifacts/route-slices/m1-2026-03/schedule-comparison.json`.
- Use static GTFS for standard `routes.txt`, `trips.txt`, `stop_times.txt`, `stops.txt`, `shapes.txt`, `calendar.txt`, and `calendar_dates.txt`.
- Use schedules to compute planned travel time between timepoints and compare with observed average travel time.
- Use schedules to identify branches/patterns and avoid mismatched shape selection.

## Caveats

- Static GTFS may not include temporary service changes or detours.
- Bus schedules change quarterly.
- Effective dates must be aligned with observed speed months.
- The current M1 schedule comparison uses exact stop-id/direction timepoint pairs and schedule rows with representative January 2026 schedule dates.

## Sources

- https://data.ny.gov/Transportation/MTA-Bus-Schedules-2026/4fnn-qsea — verified_at: 2026-04-26
- https://www.mta.info/developers — verified_at: 2026-04-26

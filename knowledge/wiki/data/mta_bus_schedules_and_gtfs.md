---
title: MTA Bus Schedules and GTFS
type: data
status: needs_schema_probe
last_updated: 2026-04-26
owner: codex
source_count: 2
tags: [mta, gtfs, schedules, bus]
---

# MTA Bus Schedules and GTFS

## Why this matters

Schedules provide planned service context. They help interpret observed speed/travel time against scheduled timepoints, planned headways, and route patterns.

## Sources

### MTA Bus Schedules: 2026

Socrata dataset: `4fnn-qsea`.

Known description: rows for each scheduled timepoint stop on a trip.

### Static Bus GTFS feeds

MTA Developer Resources lists six bus GTFS zip files, generally split by borough / bus company:

- `gtfs_bx.zip`
- `gtfs_b.zip`
- `gtfs_m.zip`
- `gtfs_q.zip`
- `gtfs_si.zip`
- `gtfs_busco.zip`

MTA says bus GTFS is generally updated four times a year for quarterly bus schedule changes, and temporary service changes/detours generally are not included.

## Implementation notes

- Prefer the Socrata Bus Schedules dataset for timepoint schedule rows if it has simpler fields.
- Use static GTFS for standard `routes.txt`, `trips.txt`, `stop_times.txt`, `stops.txt`, `shapes.txt`, `calendar.txt`, and `calendar_dates.txt`.
- Use schedules to compute planned travel time between timepoints and compare with observed average travel time.
- Use schedules to identify branches/patterns and avoid mismatched shape selection.

## Caveats

- Static GTFS may not include temporary service changes or detours.
- Bus schedules change quarterly.
- Effective dates must be aligned with observed speed months.

## Sources

- https://data.ny.gov/Transportation/MTA-Bus-Schedules-2026/4fnn-qsea — verified_at: 2026-04-26
- https://www.mta.info/developers — verified_at: 2026-04-26

---
title: MTA Bus Time Realtime
type: data
status: active
last_updated: 2026-05-17
owner: codex
source_count: 3
tags: [mta, bus-time, realtime, gtfs-rt]
---

# MTA Bus Time Realtime

## Why this matters

Realtime Bus Time data supports observed headway, bunching, delay, and live status analysis. It is now part of Data Pipeline v1 because the project needs observed reliability evidence, not only scheduled baselines and public monthly speed aggregates.

## What we know

MTA Bus Time supports GTFS-Realtime endpoints for:

- TripUpdates: `https://gtfsrt.prod.obanyc.com/tripUpdates?key=<YOUR_KEY>`
- VehiclePositions: `https://gtfsrt.prod.obanyc.com/vehiclePositions?key=<YOUR_KEY>`
- Alerts: `https://gtfsrt.prod.obanyc.com/alerts?key=<YOUR_KEY>`

An MTA Bus Time developer API key is required.

## Probe and collection status

The source manifest contains active GTFS-RT entries for TripUpdates, VehiclePositions, and Alerts. Source probes skip these feeds when `MTA_BUS_TIME_API_KEY` is not present and redact the key when it is present.

As of 2026-05-17, the pipeline has a bounded raw snapshot collector:

```bash
bun run collect:gtfs-rt -- --duration-hours 24 --sample-seconds 30
bun run ingest:gtfs-rt-snapshots -- --run-id <run_id>
bun run build:observed-headways -- --run-id <run_id>
bun run route-observed-reliability -- --run-id <run_id> --year YYYY --month M
bun run gtfs-rt:preflight -- --run-id <run_id> --year YYYY --month M
```

The collector writes raw protobuf snapshots under `data/raw/gtfs-rt/<date>/<run_id>/` and records collection metadata in local SQLite tables:

- `local_gtfs_rt_collection_run`
- `local_gtfs_rt_feed_snapshot`
- `local_gtfs_rt_parsed_snapshot`
- `local_gtfs_rt_vehicle_position`
- `local_gtfs_rt_trip_update`
- `local_gtfs_rt_stop_time_update`
- `local_gtfs_rt_alert`
- `local_observed_vehicle_stop_event`
- `local_observed_headway_sample`
- `local_route_observed_reliability_summary`

It records feed type, sample index, source id, fetch time, HTTP status, byte length, SHA-256, raw file path, redacted URL, and error text. It does not persist the API key.

Observed reliability is analysis-month aligned. A May 2026 Bus Time run can support May observed reliability summaries, but it cannot be used to satisfy a March 2026 strict v1 gate. March 2026 remains the current complete public-source month because April and May 2026 route coverage probes currently expose scheduled routes but no route-speed coverage.

## Source cadence

Bus Time GTFS-RT is a realtime feed, not a historical archive. The pipeline must collect vehicle-position snapshots while service is running; once a month has passed, missed GTFS-RT samples cannot be recreated from the public feed.

This differs from MTA Bus Route Segment Speeds, which is a public monthly aggregate table that appears after MTA processes and publishes a month. The expected v1 release pattern is therefore:

1. collect realtime GTFS-RT during the operating month,
2. wait for the matching public monthly segment-speed data to appear,
3. rerun strict v1 using the same month for public speed/schedule evidence and observed reliability.

## Latest local collection

Run `gtfs-rt-v1-20260517T022348Z` completed on 2026-05-17:

- 480/480 vehicle-position snapshots succeeded, with 0 failed fetches.
- 480 snapshots parsed, producing 358,875 vehicle-position rows.
- Observed-headway build produced 90,136 stop events and 73,702 headway samples.
- May 2026 route observed reliability produced 381 route rows: 229 observed and 152 insufficient-sample.
- `gtfs-rt:preflight -- --year 2026 --month 5 --run-id gtfs-rt-v1-20260517T022348Z` passes strict observed-layer readiness.

## Implementation notes

V1 collection rules:

- Pull feeds at a fixed cadence, e.g. every 30–60 seconds.
- Keep raw protobuf bodies in `data/raw/gtfs-rt/`, not D1.
- Store collection metadata in the local pipeline DB.
- Parse raw snapshots into route, trip, vehicle, position, stop sequence, and arrival/departure estimate rows.
- Derive observed stop events and headway samples from parsed vehicle-position history.
- Aggregate route/month observed reliability summaries with sample coverage, bunching, long-gap, and wait-time reliability metrics.
- Export observed reliability summaries to D1 and verify typed readback.
- Next, surface observed reliability status and caveats in route/corridor briefs.
- `gtfs-rt:preflight` diagnoses, and strict `check:pipeline-v1` requires, the observed run to satisfy configurable collection QA: minimum collection window, maximum sample cadence, requested `vehicle_positions`, and successful vehicle-position snapshot coverage.
- Generated route briefs include the observed run's collection-window metadata when the run exists in the local pipeline DB.
- Respect MTA terms: do not serve users directly from MTA endpoints; cache on our own server.

## Potential computed metrics

- Headway by route/direction/stop/time.
- Bunching rate: percentage of observed headways below threshold.
- Long-gap rate: percentage of headways above threshold.
- Vehicle travel time between timepoint stops if positions are map-matched.

## Caveats

- Requires API key.
- The API key must stay in local environment variables or deployment secrets; do not commit it to source files or metadata.
- No historical data unless we collect it.
- Current observed reliability summaries are run-scoped and sample-count gated; they still need production-length collection QA and route/corridor brief integration.
- Realtime data can be noisy and should not be treated as authoritative without QA.

## Sources

- https://bustime.mta.info/wiki/Developers/GTFSRt — verified_at: 2026-04-26
- https://www.mta.info/developers — verified_at: 2026-04-26
- https://gtfs.org/documentation/realtime/reference/ — verified_at: 2026-04-26

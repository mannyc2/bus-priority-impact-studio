---
title: MTA Bus Time Realtime
type: data
status: active
last_updated: 2026-05-16
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

As of 2026-05-16, the pipeline has a bounded raw snapshot collector:

```bash
bun run collect:gtfs-rt -- --duration-hours 24 --sample-seconds 30
bun run ingest:gtfs-rt-snapshots -- --run-id <run_id>
bun run build:observed-headways -- --run-id <run_id>
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

It records feed type, sample index, source id, fetch time, HTTP status, byte length, SHA-256, raw file path, redacted URL, and error text. It does not persist the API key.

## Implementation notes

V1 collection rules:

- Pull feeds at a fixed cadence, e.g. every 30–60 seconds.
- Keep raw protobuf bodies in `data/raw/gtfs-rt/`, not D1.
- Store collection metadata in the local pipeline DB.
- Parse raw snapshots into route, trip, vehicle, position, stop sequence, and arrival/departure estimate rows.
- Derive observed stop events and headway samples from parsed vehicle-position history.
- Next, aggregate route/month observed reliability summaries with sample coverage, bunching, long-gap, and wait-time reliability metrics.
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
- Current observed headway builder is run-scoped and based on parsed vehicle-position stop signals; route/month reliability summaries and confidence gates remain to be built.
- Realtime data can be noisy and should not be treated as authoritative without QA.

## Sources

- https://bustime.mta.info/wiki/Developers/GTFSRt — verified_at: 2026-04-26
- https://www.mta.info/developers — verified_at: 2026-04-26
- https://gtfs.org/documentation/realtime/reference/ — verified_at: 2026-04-26

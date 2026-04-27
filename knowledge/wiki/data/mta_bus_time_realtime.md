---
title: MTA Bus Time Realtime
type: data
status: active
last_updated: 2026-04-27
owner: codex
source_count: 3
tags: [mta, bus-time, realtime, gtfs-rt]
---

# MTA Bus Time Realtime

## Why this matters

Realtime Bus Time data can support headway, bunching, delay, and live status analysis. It is optional for MVP because historical realtime metrics require ongoing collection.

## What we know

MTA Bus Time supports GTFS-Realtime endpoints for:

- TripUpdates: `https://gtfsrt.prod.obanyc.com/tripUpdates?key=<YOUR_KEY>`
- VehiclePositions: `https://gtfsrt.prod.obanyc.com/vehiclePositions?key=<YOUR_KEY>`
- Alerts: `https://gtfsrt.prod.obanyc.com/alerts?key=<YOUR_KEY>`

An MTA Bus Time developer API key is required.

## Probe status

Probe completed 2026-04-27. TripUpdates, VehiclePositions, and Alerts all returned HTTP 200 with the local `MTA_BUS_TIME_API_KEY` environment variable. Probe metadata stores only redacted URLs and does not persist the API key.

## Implementation notes

MVP can skip realtime collection. For a P2 collector:

- Pull feeds at a fixed cadence, e.g. every 30–60 seconds.
- Store feed timestamp, entity IDs, trip IDs, route IDs, vehicle IDs, positions, stop sequence, arrival/departure estimates.
- Retain only processed tables if raw protobuf storage is too large.
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
- API/feed semantics require GTFS-RT parsing.
- Realtime data can be noisy and should not be treated as authoritative without QA.

## Sources

- https://bustime.mta.info/wiki/Developers/GTFSRt — verified_at: 2026-04-26
- https://www.mta.info/developers — verified_at: 2026-04-26
- https://gtfs.org/documentation/realtime/reference/ — verified_at: 2026-04-26

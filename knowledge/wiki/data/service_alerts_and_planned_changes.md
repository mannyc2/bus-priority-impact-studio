---
title: Service Alerts and Planned Changes
type: data
status: draft
last_updated: 2026-04-26
owner: codex
source_count: 3
tags: [mta, alerts, gtfs-rt, disruptions]
---

# Service Alerts and Planned Changes

## Why this matters

Service alerts and planned changes help distinguish routine performance problems from temporary disruptions. A route should not be permanently ranked as a hotspot based on periods dominated by construction, detours, extreme weather, or planned changes.

## Sources

- MTA Developer Resources: realtime subway/rail/service-alert GTFS-RT feeds.
- Bus Time GTFS-RT alerts endpoint for bus alerts.
- MTA GTFS Alerts Feed Documentation for MTA-specific alert fields/extensions.

## Implementation notes

MVP:

- Store current/future alerts only for selected routes.
- Annotate route briefs with known alerts during the analyzed period if available.

P1/P2:

- Store historical alert snapshots by route/stop/effect/cause/time range.
- Filter speed observations if an alert implies major detour/no-service/stop moved.
- Use alert text as source context in route briefs.

## GTFS-RT concepts to parse

- `Alert`
- `active_period`
- `informed_entity`
- `cause`
- `effect`
- `header_text`
- `description_text`
- `url`

## Caveats

- Alerts are not necessarily complete historical records unless snapshots are collected.
- Not every operational issue produces an alert.
- Alert text may require MTA-specific extensions for richer fields.

## Sources

- https://www.mta.info/developers — verified_at: 2026-04-26
- https://bustime.mta.info/wiki/Developers/GTFSRt — verified_at: 2026-04-26
- https://gtfs.org/documentation/realtime/reference/ — verified_at: 2026-04-26

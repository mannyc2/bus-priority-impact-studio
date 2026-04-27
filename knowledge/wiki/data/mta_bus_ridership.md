---
title: MTA Bus Hourly Ridership
type: data
status: active
last_updated: 2026-04-27
owner: codex
source_count: 2
tags: [mta, bus, ridership, weighting]
---

# MTA Bus Hourly Ridership

## Why this matters

Speed alone does not indicate rider impact. A slow segment with high rider volume should rank above a slow segment with low rider volume. Hourly ridership enables impact weighting.

## Datasets

- MTA Bus Hourly Ridership: Beginning 2025 — `gxb3-akrn`
- MTA Bus Hourly Ridership: 2020–2024 — `kv7t-n8in`

## What we know

The Beginning 2025 dataset provides bus ridership estimates on an hourly basis by bus route and class of fare payment.

## Schema probe

Probe completed 2026-04-27.

| Dataset | Rows | Rows updated | Fields |
|---|---:|---:|---|
| `gxb3-akrn` | 115,060,032 | 2026-04-20T16:52:50Z | `transit_timestamp`, `bus_route`, `payment_method`, `fare_class_category`, `ridership`, `transfers` |
| `kv7t-n8in` | 447,249,600 | 2025-10-15T03:50:58Z | `transit_timestamp`, `bus_route`, `payment_method`, `fare_class_category`, `ridership`, `transfers` |

## Implementation notes

- Use generated schema metadata under `knowledge/raw/metadata/`.
- `ingest:m1` aggregates the Beginning 2025 dataset to route/month/day-of-week/hour and writes normalized `ridership.json` in the route slice.
- Build table `fact_bus_hourly_ridership` before serving the metric from D1.
- Use route-level ridership as a proxy for segment rider impact if segment-level ridership is unavailable.
- Store caveat visibly: ridership weighting may overestimate impact on short segments or branches.

## Candidate joins

```text
route_id + year + month + day_of_week/day_type + hour_of_day
```

Potential mismatch to handle:

- Ridership may include date or timestamp while speeds use month/day/hour aggregation.
- Fare class may need aggregation before joining.
- Route IDs may contain SBS suffixes or branch labels; normalize carefully.

## Sources

- https://data.ny.gov/Transportation/MTA-Bus-Hourly-Ridership-Beginning-2025/gxb3-akrn — verified_at: 2026-04-26
- https://data.ny.gov/Transportation/MTA-Bus-Hourly-Ridership-2020-2024/kv7t-n8in — verified_at: 2026-04-26

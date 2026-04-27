---
title: MTA Bus Hourly Ridership
type: data
status: needs_schema_probe
last_updated: 2026-04-26
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

## Implementation notes

- Probe exact schema before implementation.
- Build table `fact_bus_hourly_ridership`.
- Aggregate to route/month/day/hour to join with segment speeds.
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

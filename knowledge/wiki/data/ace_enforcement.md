---
title: ACE Routes and Violations
type: data
status: active
last_updated: 2026-04-27
owner: codex
source_count: 4
tags: [mta, ace, automated-camera-enforcement, intervention]
---

# ACE Routes and Violations

## Why this matters

Automated Camera Enforcement (ACE) is the cleanest public intervention to evaluate: it has implementation dates, route coverage, official claims, and violation records.

## Datasets

- ACE routes / implementation dates: `ki2b-sg5y`
- ACE violations: `kh8p-hcbm`

## What we know

MTA describes ACE as a bus-mounted camera system that issues violations to vehicles occupying bus lanes, double parked vehicles along bus routes, and vehicles blocking bus stops. It is administered with NYC Department of Finance and NYC Department of Transportation.

As of MTA’s ACE page updated April 17, 2026, ACE is active on 54 bus routes carrying more than 980,000 average weekday riders. MTA says camera enforcement has sped up buses by an average of 5%, with some corridors seeing gains up to 30%. The page also says warning notices are issued for 60 days before fine-bearing violations begin.

## Schema probe

Probe completed 2026-04-27.

| Dataset | Rows | Rows updated | Fields |
|---|---:|---:|---|
| `ki2b-sg5y` ACE routes | 81 | 2026-04-24T16:37:02Z | `route`, `program`, `implementation_date` |
| `kh8p-hcbm` ACE violations | 5,248,178 | 2026-03-20T15:55:50Z | `violation_id`, `vehicle_id`, `first_occurrence`, `last_occurrence`, `violation_status`, `violation_type`, `bus_route_id`, `violation_latitude`, `violation_longitude`, `stop_id`, `stop_name`, `bus_stop_latitude`, `bus_stop_longitude`, `violation_georeference`, `bus_stop_georeference` |

## Implementation notes

- Build table `dim_ace_route` from `ki2b-sg5y`.
- Build table `fact_ace_violation` from `kh8p-hcbm`.
- `bun run ingest:ace-routes` writes normalized ACE/ABLE implementation rows to `data/working/interventions/ace-routes.json`.
- `bun run ingest:ace-violations -- --year 2026 --month 3` writes grouped route/type/status violation counts to `data/working/interventions/ace-violations-2026-03.json`.
- `bun run interventions:m1` writes the current route-level ACE overlay to `data/artifacts/route-slices/m1-2026-03/intervention-overlay.json`.
- Use ACE start dates as intervention dates.
- For impact evaluation, compare segment speeds before and after ACE start date.
- Prefer event study / difference-in-differences over naive before/after.

## Candidate analysis windows

- `pre`: 3–6 months before warning period begins.
- `warning`: first 60 days if source fields identify it, otherwise compute from implementation/start date if definition permits.
- `post`: 3–6 months after fine-bearing period begins.

## Caveats

- ACE route start dates may not imply every segment has comparable enforcement intensity.
- Violations reflect detected and processed violations, not all obstructions.
- The current violation ingest is grouped monthly data, not individual violation-level detail.
- Speed changes can be confounded by service changes, traffic, seasonality, bus lanes, signal changes, congestion pricing, and route redesigns.
- Some official claims are program-level and should not be attributed to individual routes without analysis.

## Sources

- https://data.ny.gov/Transportation/MTA-Bus-Automated-Camera-Enforced-Routes-Beginning/ki2b-sg5y — verified_at: 2026-04-26
- https://data.ny.gov/Transportation/MTA-Bus-Automated-Camera-Enforcement-Violations-Be/kh8p-hcbm — verified_at: 2026-04-26
- https://www.mta.info/agency/new-york-city-transit/automated-camera-enforcement — verified_at: 2026-04-26
- https://www.mta.info/press-release/mta-announces-automated-camera-enforcement-expanding-additional-brooklyn-and — verified_at: 2026-04-26

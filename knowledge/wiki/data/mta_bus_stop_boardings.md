---
title: MTA Bus Stop-Level Boardings
type: data
status: blocked
last_updated: 2026-05-25
owner: codex
source_count: 7
tags: [mta, bus, ridership, boardings, apc, foil]
---

# MTA Bus Stop-Level Boardings

## Why this matters

The Studio can show route/hour boardings from [[wiki/data/mta_bus_ridership|MTA Bus Hourly Ridership]], but the restored Riders-tab `Top stops by daily boardings` surface and any stop-to-stop passenger-load claims need true stop-level or segment-level boarding data.

Until a source exists, the correct product state is absence: `ridershipProfile.topStopBoardings.coverage = "not_available"`, segment `stopBoardings = null`, and segment `segmentBoardings = null`.

## What we know

- No public NYC MTA dataset currently exposes stop-level or segment-level bus boarding counts suitable for this product.
- The public MTA bus ridership datasets, `gxb3-akrn` and `kv7t-n8in`, are route/hour/fare-class datasets. Their fields are `transit_timestamp`, `bus_route`, `payment_method`, `fare_class_category`, `ridership`, and `transfers`.
- MTA Current Bus Stops and Bus Stops all bundles are stop geometry/route membership datasets. Their `boarding` field is a stop-use permission flag, not a boarding-count measure.
- The internal data asset appears to exist. Halvorsen et al. describe an MTA APC processing path that matches APC records to Bus Time, assigns records to stops and trips, and produces average-day boardings, alightings, and stop times by trip ID.
- The 2026 MTA Open Data Plan Update says MTA plans to release bus-related datasets including `Bus Origin-Destination Ridership Estimates`, but the published update does not specify grain, fields, or timing beyond the 2026 priority statement.
- MTA's public FOIL page is the current official request path for records not already published.

## Source candidates

| Source | Status | Grain | Product use | Decision |
|---|---|---|---|---|
| MTA Bus Hourly Ridership `gxb3-akrn` / `kv7t-n8in` | Public | route + hour + fare class | Route/hour denominator and `Boardings by hour` | Already implemented; not stop-level |
| MTA Current Bus Stops / Bus Stops all bundles | Public | route + direction + stop | Stop list and geometry | Reject for boardings; `boarding` is a permission flag |
| MTA Express Bus Capacity `4tpr-3bvc` | Public | express route + direction + hour + day type at maximum load point | Express-only load context | Candidate for express-route-only analysis; not useful for M15+ |
| MTA DRD APC average-day dataset | Internal / request-only | likely trip + stop + day/day-type, with boardings/alightings/load fields | Top stops, stop/hour boardings, segment loads, passenger-delay truth | FOIL is the primary path |
| Planned Bus Origin-Destination Ridership Estimates | Future public dataset | unknown | Potential stop/stop-pair boardings or OD | Monitor; implement only if grain supports stop or stop-pair analysis |
| SBS progress reports, busway evaluations, network redesign reports | Public documents | corridor totals, selected prose callouts, or small static samples | Context only | Reject as a programmatic feed |

## M15 SBS feasibility

For M15 SBS / `M15+` in March 2026, true stop-level average weekday boardings cannot be produced from the current public source set.

The route/hour MTA Bus Hourly Ridership rows can populate route-level hourly boardings. They cannot be disaggregated to stops without a model. The current MTA stop datasets can identify the M15 stop list, but do not provide counts. Public M15 SBS evaluation material contains corridor totals rather than a stop-id-keyed boarding table.

## FOIL request path

Submit through MTA's FOIL portal. If a request is filed, ask for machine-readable data and scope it tightly enough to be actionable before expanding citywide.

Suggested first request:

```text
All records, in machine-readable form (CSV, Parquet, or equivalent), of the NYCT Department of Buses / MTA Bus Company Automatic Passenger Counter (APC) "average day" dataset described in Halvorsen, Wood, Jefferson, Stasko, Hui, and Reddy, "Examination of New York City Transit's Bus and Subway Ridership Trends During the COVID-19 Pandemic," Transportation Research Record (2023), DOI 10.1177/03611981211028860, for the M15 and M15+ routes, for each calendar month from January 2024 to the most recent available month, including the following fields per record: trip_id, GTFS stop_id, direction_id, scheduled stop time, observed stop time, boardings, alightings, and load.

Fallback: Aggregated stop-level boardings and alightings for the M15 and M15+ Select Bus Service routes, by stop, direction, hour, and day type (weekday / Saturday / Sunday), for any available 30-day or longer window in 2024-2026, as produced by NYCT Data Research and Development (DRD) for internal planning use.
```

## Implementation notes

If FOIL or a future public Bus OD dataset returns usable stop-level data:

1. Add the source to `knowledge/raw/source_manifest.yaml` only after schema, access path, freshness, and redistribution terms are known.
2. Add a source adapter under `packages/sources/src/mta/`.
3. Add local pipeline tables such as `local_route_stop_boardings` and, if hour-level data exists, `local_route_stop_hourly_boardings`.
4. Populate `ridershipProfile.topStopBoardings` from observed stop rows, not route/hour ridership.
5. Only make segment `stopBoardings` or `segmentBoardings` non-null if the source supports stop-to-stop load or a defensible deterministic aggregation from boarding/alighting rows.
6. Keep audit guardrails that reject route/hour ridership masquerading as stop-level boardings.

## Caveats

- APC coverage has historically been partial. Any release should preserve MTA's source caveats and distinguish measured counts from smoothed or imputed average-day values.
- A future Bus Origin-Destination dataset may be zone-level rather than stop-level. Zone-level OD would not unlock `Top stops by daily boardings`.
- If a FOIL response includes sensitive raw fields or redistribution constraints, publish only derived aggregates that are allowed by the release terms.

## Open questions

- Will the planned Bus Origin-Destination Ridership Estimates dataset be stop-level, stop-pair-level, or coarser?
- Will MTA release APC average-day data through FOIL in a machine-readable form with stable stop IDs?
- Can express-bus maximum-load-point data support a separate express-only load indicator without confusing it with local/SBS stop boardings?

## Sources

- https://data.ny.gov/Transportation/MTA-Bus-Hourly-Ridership-Beginning-2025/gxb3-akrn — verified_at: 2026-05-25
- https://data.ny.gov/Transportation/MTA-Bus-Hourly-Ridership-2020-2024/kv7t-n8in — verified_at: 2026-05-25
- https://data.ny.gov/Transportation/MTA-Current-Bus-Stops/ai5j-txmn — verified_at: 2026-05-25
- https://dev.socrata.com/foundry/data.ny.gov/4tpr-3bvc — verified_at: 2026-05-25
- https://www.mta.info/document/197466 — verified_at: 2026-05-25
- https://www.mta.info/transparency/foil — verified_at: 2026-05-25
- https://pmc.ncbi.nlm.nih.gov/articles/PMC10149518/ — verified_at: 2026-05-25

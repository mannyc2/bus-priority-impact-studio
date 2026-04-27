---
title: Source Registry
type: data
status: active
last_updated: 2026-04-27
owner: codex
source_count: 32
tags: [sources, datasets, apis]
---

# Source Registry

This is the master source registry for Bus Priority Impact Studio. Raw machine-readable details live in `raw/source_manifest.yaml`.

## Latest probe

`bun run sources:probe` completed on 2026-04-27 with 30 active sources, 0 blocked sources, and 0 skipped sources. Probe outputs are generated locally under `knowledge/raw/metadata/`, which is gitignored except `.gitkeep`; durable facts are summarized in this wiki. Bus Time GTFS-RT probes require `MTA_BUS_TIME_API_KEY` in the local environment; the key is not written to metadata.

After that probe, `census_acs5_profile_tracts` was added and live-ingested for 2024 NYC tracts through `bun run ingest:equity-context -- --year 2024`. A follow-up source probe on 2026-04-27 checked 32 sources with 29 active, 0 blocked, and 3 Bus Time feeds skipped because no local API key was configured. That probe added `nyc_borough_boundaries` as the NYC clipping/scope source for map artifacts.

## Core sources

| Source | ID / endpoint | Priority | Role | Status |
|---|---:|---|---|---|
| MTA Open Data Program | `https://www.mta.info/open-data` | Core | Program context, Data & Analytics mission, contact, blog | Active |
| MTA Developer Resources | `https://www.mta.info/developers` | Core | Static GTFS, realtime feeds, Bus Time, docs | Active |
| MTA data-feed terms | `https://www.mta.info/developers/terms-and-conditions` | Core | Compliance rules | Active |
| MTA Bus Route Segment Speeds: Beginning 2025 | `kufs-yh3x` | Core | Main observed speed/travel-time table | Active; schema captured |
| MTA Bus Route Segment Speeds: 2023–2024 | `58t6-89vi` | Core | Historical baseline | Active; schema captured |
| MTA Current Bus Routes | `h2wf-afav` | Core | Current route shapes | Active; schema captured |
| MTA Current Bus Stops | `ai5j-txmn` | Core | Current stop points and timepoint flags | Active; schema captured |
| NYC Borough Boundaries | `gthc-hcne` | Core | NYC clipping, tagging, and viewport scope for map artifacts | Active; schema captured |
| MTA Bus Hourly Ridership: Beginning 2025 | `gxb3-akrn` | Core | Rider-impact weights | Active; schema captured |
| MTA Bus Schedules: 2026 | `4fnn-qsea` | Core | Scheduled timepoint/trip rows | Active; schema captured |
| ACE routes | `ki2b-sg5y` | Core | Intervention implementation dates | Active; schema captured |
| ACE violations | `kh8p-hcbm` | Core | Enforcement activity and blockage context | Active; schema captured |
| NYC DOT Bus Lanes - Local Streets | `ycrg-ses3` | Core | Bus lane geography | Active; schema captured |
| U.S. Census ACS 5-year profile tracts | Census API | Core | Demographics, poverty, transit commute, and low-car household context | Active; 2024 NYC tracts ingested |
| MTA segment speed blog, 2026 | MTA blog | Core | Worked example for route/stop/speed integration | Active |
| MTA segment speed blog, 2024 | MTA blog | Core | Methodology and motivation for speed dataset | Active |
| MTA ACE page | MTA page | Core | ACE program, rules, official impact claims | Active |

## Secondary / optional sources

| Source | ID / endpoint | Priority | Role | Status |
|---|---:|---|---|---|
| CBD Bus Speeds: Beginning 2023 | `r6db-kkzj` | Optional | CBD/congestion-zone speed analysis | Active; schema captured |
| Bus Routes all bundles | `bzwk-3hb4` | Secondary | Historical route shapes | Active; schema captured |
| Bus Stops all bundles | `2ucp-7wg5` | Secondary | Historical stop points | Active; schema captured |
| Bus Hourly Ridership: 2020–2024 | `kv7t-n8in` | Secondary | Historical ridership baseline | Active; schema captured |
| Static Bus GTFS feeds | six S3 zip URLs | Secondary | GTFS route/trip/shape/stop baseline | Active URLs; not ingested |
| Bus Time GTFS-RT TripUpdates | `gtfsrt.prod.obanyc.com/tripUpdates` | Optional | Realtime headways/delays if collected | Active with local API key |
| Bus Time GTFS-RT VehiclePositions | `gtfsrt.prod.obanyc.com/vehiclePositions` | Optional | Realtime vehicle locations if collected | Active with local API key |
| Bus Time GTFS-RT Alerts | `gtfsrt.prod.obanyc.com/alerts` | Optional | Bus disruption context | Active with local API key |
| MTA GTFS Alerts docs | `https://www.mta.info/document/90881` | Secondary | Alerts field interpretation | Active URL; not captured |
| GTFS Realtime reference | `https://gtfs.org/documentation/realtime/reference/` | Secondary | Standard reference | Active |

## Socrata probe summary

| Dataset | Rows | Rows updated | Columns |
|---|---:|---:|---:|
| `kufs-yh3x` | 7,280,927 | 2026-04-25T00:57:20Z | 24 |
| `58t6-89vi` | 11,656,097 | 2025-01-24T17:56:02Z | 24 |
| `r6db-kkzj` | 595,263 | 2026-04-24T16:48:44Z | 10 |
| `h2wf-afav` | 1,640 | 2026-04-22T19:52:40Z | 21 |
| `ai5j-txmn` | 23,048 | 2026-04-22T19:29:58Z | 21 |
| `gthc-hcne` | 5 | 2026-03-09T20:59:41Z | 5 |
| `bzwk-3hb4` | 200,476 | 2026-04-22T19:52:40Z | 21 |
| `2ucp-7wg5` | 3,074,918 | 2026-04-22T19:29:58Z | 24 |
| `gxb3-akrn` | 115,060,032 | 2026-04-20T16:52:50Z | 6 |
| `kv7t-n8in` | 447,249,600 | 2025-10-15T03:50:58Z | 6 |
| `4fnn-qsea` | 8,937,275 | 2026-04-26T19:07:48Z | 25 |
| `ki2b-sg5y` | 81 | 2026-04-24T16:37:02Z | 3 |
| `kh8p-hcbm` | 5,248,178 | 2026-03-20T15:55:50Z | 15 |
| `ycrg-ses3` | 4,068 | 2026-04-06T15:44:03Z | 29 |

## Required lint before implementation

- No source with `priority: core` may remain `needs_schema_probe` before production metric claims. This was satisfied by the 2026-04-27 probe.
- Every Socrata source must be reproducibly probeable with local generated metadata. This was satisfied by the 2026-04-27 probe.
- Every dataset page must include exact schema, primary-key candidate, join keys, and row-count/date metadata.
- Every app metric must cite a deterministic transformation and source table.

## Sources

- `raw/source_manifest.yaml` — verified_at: 2026-04-26
- https://www.mta.info/open-data — verified_at: 2026-04-26
- https://www.mta.info/developers — verified_at: 2026-04-26
- https://www.mta.info/developers/terms-and-conditions — verified_at: 2026-04-26

---
title: Source Registry
type: data
status: active
last_updated: 2026-04-26
owner: codex
source_count: 22
tags: [sources, datasets, apis]
---

# Source Registry

This is the master source registry for Bus Priority Impact Studio. Raw machine-readable details live in `raw/source_manifest.yaml`.

## Core sources

| Source | ID / endpoint | Priority | Role | Status |
|---|---:|---|---|---|
| MTA Open Data Program | `https://www.mta.info/open-data` | Core | Program context, Data & Analytics mission, contact, blog | Seed verified |
| MTA Developer Resources | `https://www.mta.info/developers` | Core | Static GTFS, realtime feeds, Bus Time, docs | Seed verified |
| MTA data-feed terms | `https://www.mta.info/developers/terms-and-conditions` | Core | Compliance rules | Seed verified |
| MTA Bus Route Segment Speeds: Beginning 2025 | `kufs-yh3x` | Core | Main observed speed/travel-time table | Needs schema probe |
| MTA Bus Route Segment Speeds: 2023–2024 | `58t6-89vi` | Core | Historical baseline | Needs schema probe |
| MTA Current Bus Routes | `h2wf-afav` | Core | Current route shapes | Needs schema probe |
| MTA Current Bus Stops | `ai5j-txmn` | Core | Current stop points and timepoint flags | Needs schema probe |
| MTA Bus Hourly Ridership: Beginning 2025 | `gxb3-akrn` | Core | Rider-impact weights | Needs schema probe |
| MTA Bus Schedules: 2026 | `4fnn-qsea` | Core | Scheduled timepoint/trip rows | Needs schema probe |
| ACE routes | `ki2b-sg5y` | Core | Intervention implementation dates | Needs schema probe |
| ACE violations | `kh8p-hcbm` | Core | Enforcement activity and blockage context | Needs schema probe |
| NYC DOT Bus Lanes - Local Streets | `ycrg-ses3` | Core | Bus lane geography | Needs schema probe |
| MTA segment speed blog, 2026 | MTA blog | Core | Worked example for route/stop/speed integration | Seed verified |
| MTA segment speed blog, 2024 | MTA blog | Core | Methodology and motivation for speed dataset | Seed verified |
| MTA ACE page | MTA page | Core | ACE program, rules, official impact claims | Seed verified |

## Secondary / optional sources

| Source | ID / endpoint | Priority | Role | Status |
|---|---:|---|---|---|
| CBD Bus Speeds: Beginning 2023 | `r6db-kkzj` | Optional | CBD/congestion-zone speed analysis | Needs schema probe |
| Bus Routes all bundles | `bzwk-3hb4` | Secondary | Historical route shapes | Needs schema probe |
| Bus Stops all bundles | `2ucp-7wg5` | Secondary | Historical stop points | Needs schema probe |
| Bus Hourly Ridership: 2020–2024 | `kv7t-n8in` | Secondary | Historical ridership baseline | Needs schema probe |
| Static Bus GTFS feeds | six S3 zip URLs | Secondary | GTFS route/trip/shape/stop baseline | Needs download |
| Bus Time GTFS-RT TripUpdates | `gtfsrt.prod.obanyc.com/tripUpdates` | Optional | Realtime headways/delays if collected | Needs API key |
| Bus Time GTFS-RT VehiclePositions | `gtfsrt.prod.obanyc.com/vehiclePositions` | Optional | Realtime vehicle locations if collected | Needs API key |
| Bus Time GTFS-RT Alerts | `gtfsrt.prod.obanyc.com/alerts` | Optional | Bus disruption context | Needs API key |
| MTA GTFS Alerts docs | `https://www.mta.info/document/90881` | Secondary | Alerts field interpretation | Needs capture |
| GTFS Realtime reference | `https://gtfs.org/documentation/realtime/reference/` | Secondary | Standard reference | Seed verified |

## Required lint before implementation

- No source with `priority: core` may remain `needs_schema_probe` before production metric claims.
- Every Socrata source must have `raw/metadata/{dataset_id}.json` and `raw/metadata/{dataset_id}_columns.json`.
- Every dataset page must include exact schema, primary-key candidate, join keys, and row-count/date metadata.
- Every app metric must cite a deterministic transformation and source table.

## Sources

- `raw/source_manifest.yaml` — verified_at: 2026-04-26
- https://www.mta.info/open-data — verified_at: 2026-04-26
- https://www.mta.info/developers — verified_at: 2026-04-26
- https://www.mta.info/developers/terms-and-conditions — verified_at: 2026-04-26

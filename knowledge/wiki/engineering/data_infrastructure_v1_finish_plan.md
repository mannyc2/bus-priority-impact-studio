---
title: Data Infrastructure V1 Finish Plan
type: engineering
status: active
last_updated: 2026-05-17
owner: codex
source_count: 0
tags: [data-infrastructure, gtfs-rt, cloudflare, d1, r2, scheduling]
---

# Data Infrastructure V1 Finish Plan

## Objective

Finish the data infrastructure layer that turns the existing pipeline into a repeatable serving system:

1. Integrate recovered March 2026 GTFS-RT with third-party provenance.
2. Keep live GTFS-RT collection running after Worker deployment.
3. Publish March 2026 serving data to D1/R2.
4. Decide which refresh work belongs on cron and which remains an explicit batch job.
5. Unfixture the website only after real serving endpoints have data behind them.

## Recovered March GTFS-RT

The project has verified Bus Observatory March 2026 archive availability:

- Provider: Bus Observatory / Jacobs Urban Tech Hub at Cornell Tech.
- Source: public `busobservatory-lake` S3 bucket.
- Format: compacted Parquet windows.
- Coverage: 31 March-labeled files plus the April 1 bridge file.
- Provenance: `third_party_recovered`.
- License: CC BY-NC 4.0; attribution required.

The strict recovered-data path is now implemented and loaded for March 2026. The raw Parquet
archive was converted outside the repo into ignored `data/working/` CSVs:

- `raw-provenance/snapshots-30s.csv`: 89,109 compact 30-second snapshot buckets.
- `raw-provenance/headway-samples.csv`: 2,612,086 recovered observed headway samples.

`import:bus-observatory-headway-samples` streams those samples into the local pipeline DB,
registers the recovered collection/feed/parsed snapshot metadata, and writes one compact
vehicle-position evidence row per 30-second bucket. This satisfies strict provenance gates without
loading all raw archive vehicle positions into SQLite.

The repeatable integration path is:

1. Run `check:bus-observatory-gtfs-rt` to write the availability artifact.
2. Export the Parquet archive into a canonical local CSV under ignored `data/working/`.
3. Prefer `import:bus-observatory-headway-samples` for March-sized raw-backed recovery.
4. Run `route-observed-reliability -- --year 2026 --month 3 --run-id bus-observatory-2026-03`.
5. Run `gtfs-rt:preflight -- --year 2026 --month 3 --run-id bus-observatory-2026-03`.
6. Rebuild briefs, batch audit, evaluation artifacts, map artifacts, D1 export, and D1 verification.
7. Run strict `check:pipeline-v1 -- --year 2026 --month 3`.

The older `import:bus-observatory-gtfs-rt` raw-row importer remains available when a smaller
canonical vehicle-position CSV is useful, but March v1 no longer depends on loading every raw
position row into SQLite. The request-time app never reads Parquet or CSV; all recovered evidence is
compiled into D1/R2 serving outputs.

Required canonical CSV columns:

```text
entity_id,timestamp,source_route_id,route_id_normalized,trip_id,start_date,start_time,direction_id,vehicle_id,vehicle_label,latitude,longitude,bearing,speed,current_stop_sequence,stop_id,current_status
```

`source_route_id` can be used without `route_id_normalized`; the importer normalizes MTA route IDs. Rows must be sorted by ascending `timestamp`.

## Serving Publish

Publishing serving data is a one-time script path for each release month, not a continuously running service.

For a month such as March 2026:

```bash
bun run export:d1 -- --year 2026 --month 3
bun run verify:d1 -- --year 2026 --month 3
bun run publish:serving-release -- --month 2026-03 --d1 bus-priority-serving --r2 bus-priority-artifacts
```

`publish:serving-release` is a dry-run by default. Add `--execute` only when the real Cloudflare D1 database and R2 bucket names are configured and the release artifact paths have been reviewed.

This work should not run every minute. It should run when a new complete baseline month is ready or when a deliberate recovered-data promotion changes a release.

As of 2026-05-17, local March 2026 serving outputs exist and verify:

- D1 export: `data/exports/d1/2026-03/schema.sql`, `seed.sql`, `export-summary.json`, `verify-summary.json`.
- Artifact release payloads: `briefs/2026-03`, `evaluations/2026-03`, `map/2026-03`, `pipeline-v1`, and source-availability artifacts.
- Dry-run publish command successfully enumerates the D1 execute commands and R2 object uploads.
- Strict `check:pipeline-v1 -- --year 2026 --month 3` passes with no issues.

What is not done locally is the irreversible remote promotion: creating/confirming the production
Cloudflare D1/R2 resource identifiers, setting Worker secrets, running
`publish:serving-release -- --execute`, and deploying the Worker against those bindings.

## Scheduling Decision

Cron should do only lightweight source freshness work:

| Job | Runtime | Cadence | Why |
|---|---|---:|---|
| GTFS-RT snapshot capture | Worker scheduled handler | every minute, 1-2 samples per invocation | Live feed is unrecoverable from official MTA endpoints if missed. |
| Route speed availability watcher | Worker scheduled handler or daily GitHub Action | daily/monthly is enough | Public speed data is monthly and source-lagged. |
| Heavy rebuild/finalize/export | explicit batch job or GitHub Action triggered by watcher | on demand | Too heavy for Worker request/cron paths. |
| D1/R2 publish | explicit script | on release | Serving data should be promoted deliberately. |
| Website fixture replacement | normal app deploy | after API endpoints serve real data | Not a data cron concern. |

Do not put source ingestion, Bus Observatory Parquet conversion, route builds, observed-headway construction, D1 export, or R2 bulk upload inside the public Worker cron.

## Website Unfixture Gate

The website should keep fixtures until these are true:

1. D1 contains the March 2026 serving seed.
2. R2 contains March 2026 map/brief/evaluation artifacts.
3. Worker API endpoints expose route cards, route profile, hotspots, compare, and map manifest payloads.
4. API responses carry completeness/provenance labels.
5. The frontend has a fixture fallback for tests/demo mode only.

Then replace frontend fixture imports one surface at a time.

## Current Remaining Work

1. Create or confirm real Cloudflare D1/R2 resources and write binding IDs into deployment config. Use [[cloudflare_operations_runbook|Cloudflare Operations Runbook]] as the deployment checklist.
2. Set production Worker secrets/vars: `MTA_BUS_TIME_API_KEY`, `BASELINE_MONTH=2026-03`, `LAST_BUILT_SPEED_MONTH=2026-03`, `GTFS_RT_SAMPLES_PER_CRON=2`, and `GTFS_RT_SAMPLE_SECONDS=30`.
3. Run `publish:serving-release -- --month 2026-03 --d1 <database> --r2 <bucket> --execute`.
4. Deploy the Worker and verify scheduled GTFS-RT capture writes R2 protobuf snapshots plus manifests.
5. Build or review a manifest object-key list for the deployed capture run.
6. Run `pull:gtfs-rt-r2-run -- --r2 <raw-bucket> --run-id <run-id> --manifest-list <file> --execute` to mirror Worker-written R2 GTFS-RT manifests and raw protobufs locally.
7. Run `import:gtfs-rt-r2-manifests`, then the normal protobuf ingest, observed-headway, observed-reliability, and QA commands for that run.
8. Verify the website against real D1/R2 payloads in production mode. The frontend now calls `/api/v1` first for route cards, route profiles, hotspots, compare data, and map manifests, with fixtures as a fallback for tests/demo mode.

## March 2026 Acceptance Evidence

The current March release is no longer just a public monthly baseline. It is a recovered observed
release candidate with explicit third-party provenance:

- Catalog routes: 381.
- Built routes: 381.
- Public route count: 350.
- Observed reliability rows: 381.
- Observed routes: 346.
- Insufficient recovered realtime rows: 35.
- Recovered catalog-route headway samples: 2,571,297.
- Recovered raw sample rows imported: 2,612,086.
- Compact recovered snapshot buckets: 89,109.
- D1 route/corridor artifact rows: 1,629.
- Route batch issues: 0.

The release should still label GTFS-RT as `third_party_recovered`, not official MTA historical
backfill or self-collected realtime.

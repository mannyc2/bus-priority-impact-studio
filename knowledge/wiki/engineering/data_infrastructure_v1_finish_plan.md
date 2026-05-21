---
title: Data Infrastructure V1 Finish Plan
type: engineering
status: active
last_updated: 2026-05-18
owner: codex
source_count: 0
tags: [data-infrastructure, gtfs-rt, cloudflare, d1, r2, scheduling]
---

# Data Infrastructure V1 Finish Plan

> Forward planning moved to
> [[wiki/engineering/data_pipeline_finish_plan_v2|Data Pipeline Finish Plan v2]] on 2026-05-21.
> This page remains the v1 infrastructure history and proof log.

## Objective

Finish the data infrastructure layer that turns the existing pipeline into a repeatable serving system:

1. Integrate recovered March 2026 GTFS-RT with third-party provenance.
2. Keep live GTFS-RT collection running after Worker deployment.
3. Publish March 2026 serving data to D1/R2.
4. Decide which refresh work belongs on cron and which remains an explicit batch job.
5. Unfixture the website only after real serving endpoints have data behind them.

## Current Status — 2026-05-18

Local Data Pipeline v1 now passes the strict March 2026 gate with recovered observed reliability:

- `bun run check:pipeline-v1 -- --year 2026 --month 3` passes with 0 issues.
- `gtfs-rt:preflight -- --year 2026 --month 3 --run-id bus-observatory-2026-03` passes.
- `audit:pipeline-v1 -- --public-year 2026 --public-month 3 --realtime-year 2026 --realtime-month 3 --run-id bus-observatory-2026-03 ...` passes with `Observed Release=complete` and `sameMonthPromotionReady=true`.
- March observed reliability is still third-party recovered evidence from Bus Observatory / Jacobs Urban Tech Hub at Cornell Tech under CC BY-NC 4.0. Do not label it as official MTA historical GTFS-RT backfill.
- The official self-collected 24-hour Bus Time run `gtfs-rt-v1-20260517T103607Z-24h` completed with 2,880/2,880 successful vehicle-position snapshots and 0 failures. It is the next official-current observed appendix input, but it still needs protobuf ingest, observed-headway build, May route reliability, and preflight.
- `check:route-speed-availability` still reports March 2026 as the latest complete public speed month; requested May 2026 has `missing_speed`, so no newer public monthly rebuild should run yet.
- Cloudflare production resources now exist for the serving path: D1 `bus-priority-serving`, R2 `bus-priority-artifacts`, and R2 `bus-priority-gtfs-rt-raw`. The operations log records a successful Worker deploy from `apps/web/wrangler.jsonc`, live API checks against D1/R2, and an initial scheduled-capture smoke proof.
- Production GTFS-RT capture is smoke-proven, not yet production-length proven: two Worker-written manifests and paired protobuf objects were mirrored from R2, imported with `import:gtfs-rt-r2-manifests`, and parsed by `ingest:gtfs-rt-snapshots` into 3,612 vehicle positions with 0 parse errors.

The next infrastructure work is not more local metric construction. It is release promotion,
production-length realtime processing, source watching, and website unfixture against real serving
payloads.

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

As of 2026-05-18, local March 2026 serving outputs exist and verify:

- D1 export: `data/exports/d1/2026-03/schema.sql`, `seed.sql`, `export-summary.json`, `verify-summary.json`.
- Artifact release payloads: `briefs/2026-03`, `evaluations/2026-03`, `map/2026-03`, `pipeline-v1`, and source-availability artifacts.
- Dry-run publish command successfully enumerates the D1 execute commands and R2 object uploads.
- Strict `check:pipeline-v1 -- --year 2026 --month 3` passes with no issues.
- D1 verification loads 381 route catalog rows, 381 observed reliability rows, 360 intervention comparisons, 1,050 route artifacts, 579 corridor artifacts, 193 corridor summaries, and 5,171 route/month trend rows.
- The D1 seed is about 6.3 MB and the schema SQL is about 14.8 KB.

Remote serving promotion has an initial production proof in the operations log: resources were
created, bindings configured, the Worker secret was set, D1/R2 were populated, and deployed API
checks passed. Keep future promotion work deliberate: generated D1/R2 releases are still one-shot
publish events, not a cron concern.

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

## Realtime Processing Plan

The realtime pipeline has two distinct modes:

1. **Smoke proof.** Mirror a small set of Worker-written R2 manifests and protobufs, import the
   manifests as a local run, parse the protobufs, and confirm nonzero vehicle-position rows with no
   parse errors. This proves bindings, secrets, R2 writes, object integrity, and the R2-to-pipeline
   handoff. The first production smoke proof already reached this state with 2 snapshots and 3,612
   parsed vehicle positions.
2. **Production-length observed appendix.** Mirror a reviewed continuous window, preferably 24 hours
   or longer, and process it through the normal observed-reliability chain:

```bash
bun run pull:gtfs-rt-r2-run -- --r2 bus-priority-gtfs-rt-raw --run-id <run_id> --manifest-list data/ops/gtfs-rt-manifests.txt --execute
bun run import:gtfs-rt-r2-manifests -- --run-id <run_id> --manifest-root data/raw/r2-mirror/<run_id>/gtfs-rt/vehicle_positions --raw-root data/raw/r2-mirror/<run_id>
bun run ingest:gtfs-rt-snapshots -- --run-id <run_id>
bun run build:observed-headways -- --run-id <run_id>
bun run route-observed-reliability -- --run-id <run_id> --year <YYYY> --month <M>
bun run gtfs-rt:preflight -- --run-id <run_id> --year <YYYY> --month <M>
```

The production-length run must use an analysis month that overlaps the captured timestamps. It can
be attached as `Current Signal` / realtime appendix evidence before the matching public monthly
speed rows are published. It can be promoted to an observed monthly release only when public speed,
schedule, and realtime evidence align to the same month and strict `check:pipeline-v1` plus
`audit:pipeline-v1` pass.

For each production-length run, preserve these artifacts:

- the manifest object-key list used for mirroring,
- the local R2 mirror root under `data/raw/r2-mirror/<run_id>/`,
- `gtfs-rt:run-status` output before and after ingest,
- `gtfs-rt:preflight` output,
- observed-headway and route-observed-reliability row counts,
- the public-month plus realtime-month audit artifact when the run is attached to a release.

## Production Capture Proof Plan

Use a staged proof ladder so we know exactly what has been validated:

| Stage | Goal | Acceptance |
|---|---|---|
| Config proof | Worker has the right runtime shape | Deployed config has `DB`, `ARTIFACTS`, `GTFS_RT_RAW`, cron `* * * * *`, `GTFS_RT_SAMPLES_PER_CRON=2`, `GTFS_RT_SAMPLE_SECONDS=30`, and `MTA_BUS_TIME_API_KEY` as a secret. |
| R2 write proof | Scheduled handler is firing | At least one cron interval writes paired `.json` and `.pb` objects under `gtfs-rt/vehicle_positions/YYYY-MM-DD/`; manifests contain redacted URLs, byte length, SHA-256, and object keys. |
| Cadence proof | 30-second sampling works from one-minute cron | A short contiguous sample shows two snapshots per minute with timestamps roughly 30 seconds apart. |
| Handoff proof | R2 objects can feed the local pipeline | `pull:gtfs-rt-r2-run --execute`, `import:gtfs-rt-r2-manifests`, and `ingest:gtfs-rt-snapshots` complete with nonzero parsed vehicle positions and 0 parse errors for the mirrored sample. |
| Continuity proof | The collector is useful for observed reliability | A 4-hour-or-longer run passes default `gtfs-rt:preflight` thresholds: at least 4 collection hours, max 60-second sample cadence, at least 80% successful vehicle-position snapshot coverage, and at least 30 observed headway samples. |
| Appendix proof | A production run can be attached without overclaiming | `build:observed-headways`, `route-observed-reliability`, and `audit:pipeline-v1 -- --public-year <public> --public-month <public> --realtime-year <rt> --realtime-month <rt>` produce a realtime appendix with explicit source-month and provenance labels. |
| Promotion proof | A month can become a full observed release | The same public month and realtime month pass strict preflight, strict `check:pipeline-v1`, D1/R2 publish dry-run review, and then deliberate `publish:serving-release --execute`. |

Operational monitoring should start simple:

- Review the latest `GTFS_RT_RAW` object keys at least daily while capture is active.
- Mirror and parse a small sample after any Worker deploy or var/secret change.
- Mirror/import production windows before the 21-day R2 lifecycle expires raw snapshots.
- Treat missing snapshots as a data-quality issue, not an app outage, unless the public API starts
  serving claims from an affected realtime appendix.

## Website Unfixture Gate

The website should keep fixtures until these are true:

1. D1 contains the March 2026 serving seed.
2. R2 contains March 2026 map/brief/evaluation artifacts.
3. Worker API endpoints expose route cards, route profile, hotspots, compare, and map manifest payloads.
4. API responses carry completeness/provenance labels.
5. The frontend has a fixture fallback for tests/demo mode only.

Then replace frontend fixture imports one surface at a time.

## Current Remaining Work

1. Process the completed local official run `gtfs-rt-v1-20260517T103607Z-24h`: `ingest:gtfs-rt-snapshots`, `build:observed-headways`, `route-observed-reliability -- --year 2026 --month 5`, and `gtfs-rt:preflight`.
2. Promote the production Worker capture proof from smoke to production-length: build or review a manifest object-key list for a contiguous 4-hour-or-longer deployed run, mirror it with `pull:gtfs-rt-r2-run --execute`, import manifests, parse snapshots, build observed headways, generate route reliability, and run preflight.
3. Decide the production capture run naming convention, e.g. `gtfs-rt-prod-YYYY-MM-DD-24h` for daily windows and `gtfs-rt-prod-YYYY-MM` for month-sized stitched evidence.
4. Add a lightweight object-listing or inventory step if dashboard/manual manifest-key extraction becomes the bottleneck.
5. Build and upload/seed the versioned `studio/v1/*` projection artifacts from the March D1/R2 release so `/api/v1/studio/*` has real data behind it.
6. Verify the website against real D1/R2 payloads in production mode. Production Studio pages should call `/api/v1/studio/*`; fixture/demo data should remain only for tests, examples, and local fallback modes.
7. Keep the monthly route-speed watcher artifact under review; when it reports a new complete public month, run the baseline promotion chain and attach same-month realtime only if a qualifying captured run exists.

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

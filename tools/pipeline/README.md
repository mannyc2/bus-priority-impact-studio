# tools/pipeline

Local batch pipeline CLI.

## Responsibilities

- Probe live source schemas and write metadata.
- Fetch full-network route/month public-source data.
- Collect and ingest bounded MTA Bus Time GTFS-RT snapshots for observed reliability.
- Build local SQLite evidence tables, route/corridor metrics, intervention comparisons, and map payloads.
- Generate route/corridor brief artifacts plus D1 seed SQL and verification summaries.
- Write generated artifacts to `data/artifacts/`, `data/exports/`, and ignored raw/working data paths.

## Rules

- This is allowed to be slower and heavier than the public app.
- Prefer fixture-backed tests and explicit commands.
- Do not add Python here unless the TypeScript/local-SQL path fails on a documented requirement.

## Commands

```bash
bun run sources:list
bun run sources:probe
bun run check:route-speed-availability -- --start-year 2026 --end-year 2026 --year 2026 --month 5 --last-built-year 2026 --last-built-month 3 --min-speed-routes 300
bun run plan:source-refresh -- --start-year 2026 --end-year 2026 --year 2026 --month 5 --last-built-year 2026 --last-built-month 3 --min-speed-routes 300
bun run ingest:route-catalog
bun run ingest:route-coverage -- --year 2026 --month 3
bun run build:network -- --year 2026 --month 3
bun run collect:gtfs-rt -- --duration-hours 24 --sample-seconds 30 --feed-types vehicle_positions --run-id <run_id>
bun run gtfs-rt:run-status -- --run-id <run_id>
bun run pull:gtfs-rt-r2-run -- --r2 bus-priority-gtfs-rt-raw --run-id <run_id> --manifest-list data/ops/gtfs-rt-manifests.txt
bun run import:gtfs-rt-r2-manifests -- --run-id <run_id> --manifest-root <local-r2-mirror>/gtfs-rt/vehicle_positions/YYYY-MM-DD --raw-root <local-r2-mirror>
bun run import:bus-observatory-gtfs-rt -- --run-id bus-observatory-2026-03 --year 2026 --month 3 --canonical-csv data/working/bus-observatory/2026-03/vehicle-positions.csv
bun run import:bus-observatory-headway-samples -- --run-id bus-observatory-2026-03 --year 2026 --month 3 --snapshots-csv data/working/bus-observatory/2026-03/raw-provenance/snapshots-30s.csv --headway-samples-csv data/working/bus-observatory/2026-03/raw-provenance/headway-samples.csv
bun run import:bus-observatory-reliability-summary -- --run-id bus-observatory-2026-03 --year 2026 --month 3 --summary-csv data/working/bus-observatory/2026-03/route-observed-reliability-summary.csv
bun run ingest:gtfs-rt-snapshots -- --run-id <run_id>
bun run build:observed-headways -- --run-id <run_id>
bun run route-observed-reliability -- --run-id <run_id> --year 2026 --month 3
bun run finalize:pipeline-v1 -- --year 2026 --month 3 --run-id <run_id>
bun run check:pipeline-v1 -- --year 2026 --month 3
bun --filter @bp/pipeline audit:pipeline-v1 -- --public-year 2026 --public-month 3 --realtime-year 2026 --realtime-month 5 --run-id <run_id>
bun run publish:serving-release -- --month 2026-03 --d1 bus-priority-serving --r2 bus-priority-artifacts
```

`check:route-speed-availability` checks grouped MTA Bus Route Segment Speeds coverage, reports the latest published speed month plus the requested month status, records whether a rebuild should run compared with `--last-built-year/--last-built-month`, and writes `data/artifacts/source-availability/route-speed-availability.json` by default. Use `--output <path>` or `--artifact-root <path>` to redirect the watcher artifact.
`plan:source-refresh` writes `data/artifacts/source-refresh/plan.json`, combining the route-speed rebuild decision with the required production GTFS-RT collector and monthly public-source watcher next actions.
`collect:gtfs-rt` requires `MTA_BUS_TIME_API_KEY`, writes raw protobuf snapshots to ignored `data/raw/gtfs-rt/`, and records run/snapshot metadata in the local pipeline DB with redacted URLs.
`gtfs-rt:run-status` reports long collection progress, prints the next handoff commands, and writes `data/artifacts/gtfs-rt/run-status/<run_id>.json` by default. Use `--output <path>` or `--artifact-root <path>` to redirect the handoff artifact.
`pull:gtfs-rt-r2-run` is the operational mirror helper for a deployed Worker capture run. It reads a reviewed list of manifest object keys, downloads each manifest and paired raw protobuf object from R2 when `--execute` is passed, and prints the matching `import:gtfs-rt-r2-manifests` command. By default, it mirrors into `data/raw/r2-mirror/<run-id>/` so imports are isolated by run.
`import:gtfs-rt-r2-manifests` registers Worker/R2 GTFS-RT capture manifests from a local R2 mirror as a completed local collection run, so `ingest:gtfs-rt-snapshots` can parse the mirrored protobuf object files through the existing pipeline path.
`import:bus-observatory-gtfs-rt` imports canonical CSV rows exported from the third-party Bus Observatory Parquet archive into the same local GTFS-RT vehicle-position tables used by `build:observed-headways`. It sets provenance through the run id/source id as `third_party_recovered`; it is not official MTA backfill. The canonical CSV must be sorted by ascending `timestamp` and include at least `entity_id`, `timestamp`, `source_route_id` or `route_id`, `vehicle_id`, `latitude`, `longitude`, `stop_id`, and `current_status` when available.
`import:bus-observatory-headway-samples` is the strict March recovery path. It streams DuckDB-derived headway samples into `local_observed_headway_sample`, registers compact recovered snapshot metadata in the GTFS-RT collection/feed/parsed tables, and inserts one vehicle-position evidence row per recovered 30-second bucket so `gtfs-rt:preflight` and strict `check:pipeline-v1` can verify run provenance without loading all raw archive positions into SQLite.
`import:bus-observatory-reliability-summary` imports a precomputed route-level recovered reliability summary CSV. This is the practical March 2026 recovery path when the raw Parquet archive is too large for SQLite row import; it fills every current catalog route, skips archive route IDs outside the catalog, and writes reliability source-status rows with `third_party_recovered` provenance in the run id/source note.
`ingest:gtfs-rt-snapshots` parses a collected run into normalized local vehicle-position, trip-update, stop-time-update, and alert rows.
`build:observed-headways` collapses parsed vehicle-position stop signals into observed stop events and headway samples.
`route-observed-reliability` aggregates observed headway samples into route/month reliability summaries with bunching, long-gap, expected-wait, and sample-confidence status.
M1 commands remain as compatibility/fixture helpers, but the v1 product boundary is the full-network pipeline and full route/corridor brief set.

`publish:serving-release` is a one-shot promotion script for generated D1/R2 serving outputs. It dry-runs by default and only publishes when `--execute` is passed. It is intentionally not part of cron.

The March 2026 dry-run currently enumerates the expected remote promotion commands:

```bash
bun run publish:serving-release -- --month 2026-03 --d1 bus-priority-serving --r2 bus-priority-artifacts
```

Do not add `--execute` until the production Cloudflare database, bucket, Worker bindings, and
secrets have been created or confirmed.

## Source cadence

GTFS-RT is live collection, not a historical backfill. A 24-hour run at a 30-second cadence grows from `0/2880` to `2880/2880` as snapshots are fetched, so a partial count such as `151/2880` means the run is still in progress. Missed realtime windows cannot be reconstructed from the public Bus Time feed.

Third-party recovery is separate provenance. `check:bus-observatory-gtfs-rt -- --year 2026 --month 3` inventories Cornell Tech / Jacobs Urban Tech Hub Bus Observatory Parquet files in the public `busobservatory-lake` bucket and writes `data/artifacts/source-availability/bus-observatory-gtfs-rt-YYYY-MM.json`. A `full_month_candidate` result means files exist for every labeled day plus the following-month bridge file; it still requires row-level Parquet QA before March can be promoted as a third-party recovered observed candidate. The source is not official MTA backfill and is licensed CC BY-NC 4.0 with attribution.

The raw-row importer consumes a canonical CSV rather than reading Parquet directly inside the repo. A one-time March recovery export can be produced with DuckDB or another local Parquet-capable tool, then imported. Keep the export local/generated under `data/working/` or `data/raw/`; do not commit the recovered rows. The raw importer writes local GTFS-RT rows, after which the normal chain is:

```bash
bun run build:observed-headways -- --run-id bus-observatory-2026-03
bun run route-observed-reliability -- --year 2026 --month 3 --run-id bus-observatory-2026-03
bun run gtfs-rt:preflight -- --year 2026 --month 3 --run-id bus-observatory-2026-03
```

If preflight and row-level QA pass, March can be considered for an `Observed Release` with `gtfsRtSource = third_party_recovered`, not as official/self-collected realtime.

For the current March 2026 v1 release, the loaded path is summary-level rather than raw-row level:

```bash
bun run import:bus-observatory-reliability-summary -- --run-id bus-observatory-2026-03 --year 2026 --month 3 --summary-csv data/working/bus-observatory/2026-03/route-observed-reliability-summary.csv
bun run brief-artifacts -- --year 2026 --month 3
bun run route-batch-audit -- --year 2026 --month 3
bun run export:d1 -- --year 2026 --month 3
bun run verify:d1 -- --year 2026 --month 3
```

As of 2026-05-17, that path loads 381 catalog route rows: 346 observed, 35 insufficient, 2,571,297 derived samples, and 7 non-catalog archive route IDs skipped. The generated D1 export verifies with `route_observed_reliability_summary = 381` and `route_batch_issue = 0`.

The strict raw-backed recovered path is now:

```bash
bun run import:bus-observatory-headway-samples -- --run-id bus-observatory-2026-03 --year 2026 --month 3 --snapshots-csv data/working/bus-observatory/2026-03/raw-provenance/snapshots-30s.csv --headway-samples-csv data/working/bus-observatory/2026-03/raw-provenance/headway-samples.csv --sample-seconds 30
bun run route-observed-reliability -- --year 2026 --month 3 --run-id bus-observatory-2026-03
bun run gtfs-rt:preflight -- --year 2026 --month 3 --run-id bus-observatory-2026-03
bun run brief-artifacts -- --year 2026 --month 3
bun run route-batch-audit -- --year 2026 --month 3
bun run evaluation-artifacts -- --year 2026 --month 3
bun run map-artifacts -- --year 2026 --month 3
bun run export:d1 -- --year 2026 --month 3
bun run verify:d1 -- --year 2026 --month 3
bun run check:pipeline-v1 -- --year 2026 --month 3
```

As of 2026-05-17, the raw-backed recovered path imports 89,109 compact snapshot buckets, 89,109 parsed vehicle-position evidence rows, and 2,612,086 observed headway samples. Rebuilt route reliability still yields 381 catalog routes, 346 observed routes, 35 insufficient routes, and 2,571,297 catalog-route samples. Strict `gtfs-rt:preflight` and strict `check:pipeline-v1` both pass for March 2026.

MTA Bus Route Segment Speeds are monthly public aggregates. The route-speed availability checker should be used as the rebuild trigger: poll the current and previous month, compare the latest complete speed month with the last built month, and rebuild only when `releaseDecision.shouldRebuild` is true. On 2026-05-17, January, February, and March 2026 were complete; April and May 2026 had no route-speed rows.

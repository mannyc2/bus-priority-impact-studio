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
bun run import:gtfs-rt-r2-manifests -- --run-id <run_id> --manifest-root <local-r2-mirror>/gtfs-rt/vehicle_positions/YYYY-MM-DD --raw-root <local-r2-mirror>
bun run ingest:gtfs-rt-snapshots -- --run-id <run_id>
bun run build:observed-headways -- --run-id <run_id>
bun run route-observed-reliability -- --run-id <run_id> --year 2026 --month 3
bun run finalize:pipeline-v1 -- --year 2026 --month 3 --run-id <run_id>
bun run check:pipeline-v1 -- --year 2026 --month 3
bun --filter @bp/pipeline audit:pipeline-v1 -- --public-year 2026 --public-month 3 --realtime-year 2026 --realtime-month 5 --run-id <run_id>
```

`check:route-speed-availability` checks grouped MTA Bus Route Segment Speeds coverage, reports the latest published speed month plus the requested month status, records whether a rebuild should run compared with `--last-built-year/--last-built-month`, and writes `data/artifacts/source-availability/route-speed-availability.json` by default. Use `--output <path>` or `--artifact-root <path>` to redirect the watcher artifact.
`plan:source-refresh` writes `data/artifacts/source-refresh/plan.json`, combining the route-speed rebuild decision with the required production GTFS-RT collector and monthly public-source watcher next actions.
`collect:gtfs-rt` requires `MTA_BUS_TIME_API_KEY`, writes raw protobuf snapshots to ignored `data/raw/gtfs-rt/`, and records run/snapshot metadata in the local pipeline DB with redacted URLs.
`gtfs-rt:run-status` reports long collection progress, prints the next handoff commands, and writes `data/artifacts/gtfs-rt/run-status/<run_id>.json` by default. Use `--output <path>` or `--artifact-root <path>` to redirect the handoff artifact.
`import:gtfs-rt-r2-manifests` registers Worker/R2 GTFS-RT capture manifests from a local R2 mirror as a completed local collection run, so `ingest:gtfs-rt-snapshots` can parse the mirrored protobuf object files through the existing pipeline path.
`ingest:gtfs-rt-snapshots` parses a collected run into normalized local vehicle-position, trip-update, stop-time-update, and alert rows.
`build:observed-headways` collapses parsed vehicle-position stop signals into observed stop events and headway samples.
`route-observed-reliability` aggregates observed headway samples into route/month reliability summaries with bunching, long-gap, expected-wait, and sample-confidence status.
M1 commands remain as compatibility/fixture helpers, but the v1 product boundary is the full-network pipeline and full route/corridor brief set.

## Source cadence

GTFS-RT is live collection, not a historical backfill. A 24-hour run at a 30-second cadence grows from `0/2880` to `2880/2880` as snapshots are fetched, so a partial count such as `151/2880` means the run is still in progress. Missed realtime windows cannot be reconstructed from the public Bus Time feed.

Third-party recovery is separate provenance. `check:bus-observatory-gtfs-rt -- --year 2026 --month 3` inventories Cornell Tech / Jacobs Urban Tech Hub Bus Observatory Parquet files in the public `busobservatory-lake` bucket and writes `data/artifacts/source-availability/bus-observatory-gtfs-rt-YYYY-MM.json`. A `full_month_candidate` result means files exist for every labeled day plus the following-month bridge file; it still requires row-level Parquet QA and an importer before March can be promoted as a third-party recovered observed candidate. The source is not official MTA backfill and is licensed CC BY-NC 4.0 with attribution.

MTA Bus Route Segment Speeds are monthly public aggregates. The route-speed availability checker should be used as the rebuild trigger: poll the current and previous month, compare the latest complete speed month with the last built month, and rebuild only when `releaseDecision.shouldRebuild` is true. On 2026-05-17, January, February, and March 2026 were complete; April and May 2026 had no route-speed rows.

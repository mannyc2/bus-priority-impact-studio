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
bun run check:route-speed-availability -- --start-year 2026 --end-year 2026 --year 2026 --month 5 --min-speed-routes 300
bun run ingest:route-catalog
bun run ingest:route-coverage -- --year 2026 --month 3
bun run build:network -- --year 2026 --month 3
bun run collect:gtfs-rt -- --duration-hours 24 --sample-seconds 30 --feed-types vehicle_positions --run-id <run_id>
bun run gtfs-rt:run-status -- --run-id <run_id>
bun run ingest:gtfs-rt-snapshots -- --run-id <run_id>
bun run build:observed-headways -- --run-id <run_id>
bun run route-observed-reliability -- --run-id <run_id> --year 2026 --month 3
bun run finalize:pipeline-v1 -- --year 2026 --month 3 --run-id <run_id>
bun run check:pipeline-v1 -- --year 2026 --month 3
bun --filter @bp/pipeline audit:pipeline-v1 -- --public-year 2026 --public-month 3 --realtime-year 2026 --realtime-month 5 --run-id <run_id>
```

`check:route-speed-availability` checks grouped MTA Bus Route Segment Speeds coverage, reports the latest published speed month plus the requested month status, and writes `data/artifacts/source-availability/route-speed-availability.json` by default. Use `--output <path>` or `--artifact-root <path>` to redirect the watcher artifact.
`collect:gtfs-rt` requires `MTA_BUS_TIME_API_KEY`, writes raw protobuf snapshots to ignored `data/raw/gtfs-rt/`, and records run/snapshot metadata in the local pipeline DB with redacted URLs.
`gtfs-rt:run-status` reports long collection progress and prints the next handoff commands.
`ingest:gtfs-rt-snapshots` parses a collected run into normalized local vehicle-position, trip-update, stop-time-update, and alert rows.
`build:observed-headways` collapses parsed vehicle-position stop signals into observed stop events and headway samples.
`route-observed-reliability` aggregates observed headway samples into route/month reliability summaries with bunching, long-gap, expected-wait, and sample-confidence status.
M1 commands remain as compatibility/fixture helpers, but the v1 product boundary is the full-network pipeline and full route/corridor brief set.

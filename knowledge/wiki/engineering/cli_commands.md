---
title: CLI Commands
type: engineering
status: active
last_updated: 2026-05-17
owner: codex
source_count: 2
tags: [cli, tools, codex, typescript, bun]
---

# CLI Commands

## Why this matters

The CLI is the boundary between local heavy compute and the managed public app. Commands live in `tools/pipeline` as a TypeScript package named `@bp/pipeline`.

The public app should not run these commands at request time.

## Package command shape

Run commands through Bun:

```bash
bun --filter @bp/pipeline <script> -- <args>
```

The package may expose a `bp` binary later, but do not add a global CLI abstraction until the first commands work.

## Source commands

```bash
bun --filter @bp/pipeline sources:list
bun --filter @bp/pipeline sources:probe -- --all
bun --filter @bp/pipeline sources:probe -- --dataset kufs-yh3x
bun --filter @bp/pipeline sources:lint
```

Expected outputs:

- `knowledge/raw/metadata/*.json`
- updates to `knowledge/wiki/data/*.md`
- updates to `knowledge/wiki/data/source_registry.md`
- append-only entry in `knowledge/log.md`

## Collection commands

```bash
bun run gtfs-rt:preflight -- --year 2026 --month 3
bun run gtfs-rt:preflight -- --year 2026 --month 3 --run-id <run_id>
bun run collect:gtfs-rt -- --duration-hours 24 --sample-seconds 30
bun run collect:gtfs-rt -- --sample-count 1 --feed-types vehicle_positions
bun run ingest:gtfs-rt-snapshots -- --run-id <run_id>
bun run build:observed-headways -- --run-id <run_id>
bun run route-observed-reliability -- --run-id <run_id> --year 2026 --month 3
```

Expected outputs:

- raw GTFS-RT protobuf snapshots under `data/raw/gtfs-rt/<date>/<run_id>/`
- local collection run rows in `local_gtfs_rt_collection_run`
- local snapshot metadata rows in `local_gtfs_rt_feed_snapshot`
- parsed snapshot status rows in `local_gtfs_rt_parsed_snapshot`
- parsed vehicle, trip-update, stop-time-update, and alert rows in local GTFS-RT tables
- observed vehicle stop events and headway samples in local observed reliability tables
- route/month observed reliability summaries with bunching, long-gap, expected-wait, and insufficient-sample status
- JSON preflight readiness covering `MTA_BUS_TIME_API_KEY`, collection runs, successful vehicle-position snapshots, parsed vehicle-position rows, observed headway samples, and route/month observed reliability rows

Collection requires `MTA_BUS_TIME_API_KEY`; `gtfs-rt:preflight` reports whether it is set without printing the key. Persisted rows use redacted feed URLs and must not store the API key.

## Ingest commands

```bash
bun run ingest:ace-routes
bun run ingest:ace-violations -- --year 2026 --month 3
bun run ingest:bus-lanes
bun run ingest:equity-context -- --year 2024
bun run ingest:route-catalog
bun run ingest:route-coverage -- --year 2026 --month 3
bun run ingest:route-trends -- --start-year 2025 --start-month 1 --end-year 2026 --end-month 3 --skip-ridership
bun run backfill:route-ridership-trends -- --start-year 2025 --start-month 1 --end-year 2026 --end-month 3 --limit 1000 --concurrency 8
bun run ingest:m1 -- --route M1 --year 2026 --month 3
bun run ingest:m1-schedules -- --route M1 --year 2026 --month 3
bun --filter @bp/pipeline ingest:segment-speeds -- --route M1 --month 2026-01
bun --filter @bp/pipeline ingest:routes
bun --filter @bp/pipeline ingest:stops
bun --filter @bp/pipeline ingest:ridership -- --month 2026-01
bun --filter @bp/pipeline ingest:ace
bun --filter @bp/pipeline ingest:bus-lanes
```

Expected outputs:

- raw downloads under `data/raw/`
- normalized working data under `data/working/`
- small fixtures under `data/fixtures/` only when needed for tests
- tract-level ACS equity context under `data/working/equity/`
- multi-month route trend inputs under `data/working/trends/`
- chunked route/month ridership trend backfill summaries under `data/working/trends/`

## Build commands

```bash
bun run build:hotspots -- --route M1 --year 2026 --month 3
bun run build:ridership-profile -- --route M1 --year 2026 --month 3
bun run build:speed-profile -- --route M1 --year 2026 --month 3
bun run build:interventions -- --route M1 --year 2026 --month 3
bun run build:bus-lanes -- --route M1 --year 2026 --month 3
bun run build:schedules -- --route M1 --year 2026 --month 3
bun run build:route-brief -- --route M1 --year 2026 --month 3 --top-segments 5
bun run build:artifacts -- --route M1 --year 2026 --month 3
bun run build:routes -- --routes M1,M2 --year 2026 --month 3
bun run build:routes -- --planned --year 2026 --month 3 --limit 5
bun run build:network -- --year 2026 --month 3
bun run compare:routes -- --year 2026 --month 3
bun run route-readiness -- --year 2026 --month 3
bun run route-build-plan -- --year 2026 --month 3 --limit 20
bun run route-reliability-baseline -- --year 2026 --month 3
bun run route-intervention-evaluation -- --year 2026 --month 3
bun run corridor-model -- --year 2026 --month 3
bun run brief-artifacts -- --year 2026 --month 3
bun run route-equity-context -- --year 2026 --month 3 --acs-year 2024
bun run route-batch-audit -- --year 2026 --month 3
bun run finalize:pipeline-v1 -- --year 2026 --month 3 --run-id <run_id>
bun run finalize:pipeline-v1 -- --year 2026 --month 3 --allow-insufficient-gtfs-rt
bun --filter @bp/pipeline build:segments -- --route M1
bun --filter @bp/pipeline build:hotspots -- --route M1 --month 2026-01
bun --filter @bp/pipeline build:ace-impact -- --route M1
```

Expected outputs:

- generated route/segment GeoJSON
- route scorecard JSON
- route brief draft inputs
- route batch summaries for multi-route comparison
- all-routes graph execution from either explicit route ids or selected build-plan candidates
- route comparison ranking artifacts
- route readiness artifacts for deciding which all-route/months are safe to build next
- route build-plan artifacts ranking eligible routes for the next offline batch
- monthly network build reports covering every build-eligible route, per-route failures, and post-build export status
- scheduled reliability baselines for headway gaps, short headways, and long-gap windows
- route/month observed-intervention comparison summaries with explicit evaluation levels and caveats, including bus-lane source-gap rows when matched lane geometry lacks a route-level implementation date
- corridor assignments, route membership, corridor summaries, and corridor hotspots
- route/corridor brief bodies as JSON, Markdown, and HTML under `data/artifacts/briefs/`
- route intervention-history artifacts for ACE dates, bus-lane open-date coverage, and still-missing signal/lane-upgrade sources
- route equity-context artifacts joining route rows to county-level ACS proxy context
- route batch audit rows validating required route/corridor brief artifacts, file existence, byte lengths, and hashes
- pipeline v1 finalization output chaining trend refresh, observed reliability, intervention evaluation, corridor modeling, brief artifacts, D1 verification, and the v1 QA gate
- source/caveat metadata

Primary batch entrypoint:

- `build:routes` is the preferred graph command for both explicit route lists and planned-route selection.
- `build:network` is the preferred monthly “try every build-eligible route” command; it recomputes readiness and the build plan, skips already-built routes by default, writes incremental progress to `data/artifacts/network-builds/<month>/summary.json` after each route attempt, and supports `--no-resume` when a full rebuild is desired.
- `build:planned-routes` remains available as a compatibility alias for `build:routes -- --planned`.

## Export commands

```bash
bun run export:d1 -- --year 2026 --month 3
bun run export:d1 -- --year 2026 --month 3 --network-dir data/working/network
bun run verify:d1 -- --year 2026 --month 3
bun run check:pipeline-v1 -- --year 2026 --month 3
bun run check:pipeline-v1 -- --year 2026 --month 3 --allow-insufficient-gtfs-rt
bun --filter @bp/pipeline export:artifacts -- --route M1 --month 2026-01
bun --filter @bp/pipeline export:r2 -- --route M1 --month 2026-01
```

Expected outputs:

- D1 seed SQL or import-ready rows
- D1 verification summaries that load generated seed SQL and validate serving row counts
- strict v1 QA result covering local route/corridor evidence, GTFS-RT collection/parse/headway provenance, observed sample coverage, route-batch audit output, and D1 readback
- structural DB/export/artifact QA result when `--allow-insufficient-gtfs-rt` is used without a Bus Time collection run
- artifact keys and hashes
- optional R2 upload after local artifact contracts are stable

## Wiki/search commands

```bash
bun --filter @bp/pipeline wiki:search -- "ACE bus speed impacts"
bun --filter @bp/pipeline wiki:lint
```

These are optional P1/P2 commands. They should operate on `knowledge/` and should not be required for the public app MVP.

## Developer commands

```bash
bun run check:types
bun run test
bun --filter @bp/web build
bun --filter @bp/pipeline test
```

Do not use `pytest`, `ruff`, or Python scripts in the MVP.

## Caveats

- `sources:list`, `sources:probe`, `collect:gtfs-rt`, `ingest:gtfs-rt-snapshots`, `gtfs-rt:preflight`, `build:observed-headways`, `route-observed-reliability`, `ingest:ace-routes`, `ingest:ace-violations`, `ingest:bus-lanes`, `ingest:equity-context`, `ingest:route-catalog`, `ingest:route-coverage`, `ingest:route-trends`, `backfill:route-ridership-trends`, `ingest:route-slice`, `ingest:route-schedules`, `build:hotspots`, `build:ridership-profile`, `build:speed-profile`, `build:interventions`, `build:bus-lanes`, `build:schedules`, `build:route-brief`, `build:artifacts`, `build:routes`, `build:network`, `compare:routes`, `route-readiness`, `route-build-plan`, `route-reliability-baseline`, `route-intervention-evaluation`, `corridor-model`, `brief-artifacts`, `route-equity-context`, `route-batch-audit`, `export:d1`, `verify:d1`, `check:pipeline-v1`, and `finalize:pipeline-v1` are implemented. `build:planned-routes` remains as a compatibility alias; R2 upload remains planned.
- Keep command implementations thin; put reusable logic in `packages/*`.

## Sources

- Bun workspace docs — https://bun.sh/docs/pm/workspaces — verified_at: 2026-04-27

---
title: Data Pipeline Finish Plan v2 Completion Audit
type: engineering
status: active
last_updated: 2026-05-21
owner: codex
source_count: 0
tags: [pipeline, audit, historical-backfill, gtfs-rt, operations]
---

# Data Pipeline Finish Plan v2 Completion Audit

This page maps the active finish-plan goal to concrete evidence. It should be updated before
claiming the goal is complete.

## Objective Checklist

| Requirement | Evidence | Status |
|---|---|---|
| Stabilize March local baseline drift | `map-artifacts` regenerated March artifacts; `check:pipeline-v1 -- --year 2026 --month 3` passes with 0 issues. Latest checked counts include 39,807 map artifact rows and 350 route-segment map artifacts. | Done |
| Stabilize May official current signal | `route-observed-reliability -- --year 2026 --month 5 --run-id gtfs-rt-v1-20260517T103607Z-24h` wrote 381 route rows; `gtfs-rt:preflight` passes with 0 issues. | Done |
| Add source coverage ledger | `bun run audit:source-coverage -- --year 2026 --month 3` writes `data/artifacts/source-coverage/2026-03/ledger.json`; current ledger classifies 12 sources. | Done |
| Complete required historical backfills | Route monthly trends cover 12,075 rows from `2023-04` through `2026-03` with speed and ridership coverage; Bus Wait Assessment covers 46,167 rows across the same 36-month window. | Done |
| Classify equity/source scope | 311, parking, traffic-volume, and traffic-speed samples are `release_context_only` unless promoted by a future detector; equity is `excluded_until_fixed` because Census ACS profile access requires `CENSUS_API_KEY` in this environment. | Done for current release scope |
| Rebuild context features/findings | March context events rebuilt to 2,644,997 rows; route touches rebuilt to 5,835,695 rows with a route-touch audit; `findings:detect` generated source coverage, signal features, detector coverage, and review queue artifacts. | Done |
| Improve lightweight Worker refresh operations | Worker cron split is implemented: every-minute cron captures GTFS-RT only, daily `17 10 * * *` runs route-speed watcher, and `source-refresh/latest.json` is written when ARTIFACTS is bound. Worker source-refresh tests pass. | Done in code; deploy/prod observation still separate |
| Document manual PC rebuild path | `data_pipeline_finish_plan_v2.md` documents `shouldRebuild=true` semantics and the local PC runbook: plan source refresh, finalize, check, export, verify, and dry-run publish. | Done |
| Verify manual PC rebuild/export path | March export and verify pass after the historical/context refresh. Dry-run `publish:serving-release -- --month 2026-03 --d1 bus-priority-serving --r2 bus-priority-artifacts` passes publish completeness and R2 dry-run audit. | Done locally |
| Verify production-length deployed R2 GTFS-RT handoff | Deployed R2 keys were listed through the R2 S3 API, a reviewed 480-manifest list was generated for `2026-05-17T17:13:54Z` through `2026-05-17T21:14:26Z`, and the window was mirrored into `data/raw/r2-mirror/gtfs-rt-r2-prod-20260517T171354Z-4h`. Import registered 480 snapshots over 14,462 seconds; parse produced 894,254 vehicle positions with 0 parse errors; observed-headway build produced 151,356 samples; route reliability produced 381 rows with 261 observed routes; `gtfs-rt:preflight -- --year 2026 --month 5 --run-id gtfs-rt-r2-prod-20260517T171354Z-4h` passed with 0 issues. | Done |

## Latest Verification Commands

```bash
bun run check:knowledge
git diff --check
bun run check:types
bun --filter @bp/web test:worker -- source-refresh
bun run audit:source-coverage -- --year 2026 --month 3
bun run check:pipeline-v1 -- --year 2026 --month 3
bun run export:d1 -- --year 2026 --month 3
bun run verify:d1 -- --year 2026 --month 3
bun run publish:serving-release -- --month 2026-03 --d1 bus-priority-serving --r2 bus-priority-artifacts
bun run gtfs-rt:preflight -- --year 2026 --month 5 --run-id gtfs-rt-v1-20260517T103607Z-24h
bun run gtfs-rt:preflight -- --year 2026 --month 5 --run-id gtfs-rt-r2-prod-20260517T171354Z-4h
```

## Deployed R2 Handoff Proof

The production-length deployed R2 handoff has been verified with this run:

```text
gtfs-rt-r2-prod-20260517T171354Z-4h
```

The proof used a contiguous 4-hour-or-longer Worker-written R2 window and ran:

```bash
bun run import:gtfs-rt-r2-manifests -- --run-id gtfs-rt-r2-prod-20260517T171354Z-4h --manifest-root data/raw/r2-mirror/gtfs-rt-r2-prod-20260517T171354Z-4h/gtfs-rt/vehicle_positions --raw-root data/raw/r2-mirror/gtfs-rt-r2-prod-20260517T171354Z-4h
bun run ingest:gtfs-rt-snapshots -- --run-id gtfs-rt-r2-prod-20260517T171354Z-4h
bun run build:observed-headways -- --run-id gtfs-rt-r2-prod-20260517T171354Z-4h
bun run route-observed-reliability -- --year 2026 --month 5 --run-id gtfs-rt-r2-prod-20260517T171354Z-4h
bun run gtfs-rt:run-status -- --run-id gtfs-rt-r2-prod-20260517T171354Z-4h
bun run gtfs-rt:preflight -- --year 2026 --month 5 --run-id gtfs-rt-r2-prod-20260517T171354Z-4h
```

The original sequential Wrangler mirror helper was too slow for 960 object downloads, so the proof
used the same R2 credentials through Bun's S3 client to mirror the reviewed manifest list
concurrently. Future work can turn that into a first-class helper; the pipeline proof itself is
complete.

# Data Pipeline Operationalization Status

Updated: 2026-05-21

This status turns the completed 2023-present checkpoint into the next operational steps.

## Release decision

The refreshed March 2026 serving release is **published**.

Evidence already available:

- `check:pipeline-v1 -- --year 2026 --month 3` passed.
- `export:d1 -- --year 2026 --month 3` and `verify:d1 -- --year 2026 --month 3` passed.
- Dry-run `publish:serving-release -- --month 2026-03 --d1 bus-priority-serving --r2 bus-priority-artifacts` passed.

Publish evidence:

- `publish:serving-release -- --month 2026-03 --d1 bus-priority-serving --r2 bus-priority-artifacts --skip-schema --execute` completed successfully.
- R2 publish report: 2,034 candidate keys, 46 uploaded, 1,988 skipped, 0 failed.
- Production `/api/v1/status` reports `baselineMonth=2026-03`, canonical monthly release `status=pass`, 381 routes, 1,629 artifacts, and 0 issues.
- Production `/api/v1/status` also reports May 2026 current observed signal from run `gtfs-rt-v1-20260517T103607Z-24h`.
- Remote D1 smoke: `route_brief_summary` has 381 rows.

## PR state

PR #2 was merged to `main` as squash commit `26a50d7`.

## R2 mirror validation

The faster Bun S3 helper is validated on the production-length Worker capture.

Run:

- `gtfs-rt-r2-prod-20260517T171354Z-4h`
- Manifest list: `data/ops/gtfs-rt-r2-production-length-manifests-2026-05-17.txt`
- Mirror command: `bun run pull:gtfs-rt-r2-run -- --r2 bus-priority-gtfs-rt-raw --run-id gtfs-rt-r2-prod-20260517T171354Z-4h --manifest-list data/ops/gtfs-rt-r2-production-length-manifests-2026-05-17.txt --concurrency 24 --execute`

Result:

- 480 manifests
- 960 manifest/protobuf files skipped because they were already mirrored locally
- 0 failures

Post-mirror chain:

- `import:gtfs-rt-r2-manifests`: 480 manifests, 480 snapshots, `2026-05-17T17:13:54.046Z` through `2026-05-17T21:14:26.006Z`
- `ingest:gtfs-rt-snapshots`: 480 parsed snapshots, 894,254 vehicle positions, 0 parse errors
- `build:observed-headways`: 151,356 headway samples
- `route-observed-reliability -- --year 2026 --month 5`: 381 routes, 261 observed routes, 149,376 route-summary headway samples
- `gtfs-rt:preflight -- --year 2026 --month 5 --run-id gtfs-rt-r2-prod-20260517T171354Z-4h --min-gtfs-rt-collection-hours 4 --max-gtfs-rt-sample-seconds 40 --min-gtfs-rt-vehicle-position-snapshot-share 0.9`: pass, 0 issues

## 311 coverage start

311 raw history is loaded for the 2023-present window, but current-table geocode coverage remains the quality gap.

Current slice started:

- Added `--since` and `--until` to `geocode:311` so operational slices can target a month window.
- Ran `geocode:311 -- --since 2026-02-01 --until 2026-03-01 --max-rows 1000 --batch-size 250`.
- Result: 1,000 scanned, 999 hits, 1 miss, 588 cache hits.
- Rebuilt context events and route touches afterward.

Larger follow-up slice:

- Ran `geocode:311 -- --since 2026-02-01 --until 2026-03-01 --max-rows 10000 --batch-size 500`.
- Result: 10,000 scanned, 9,874 hits, 126 misses, 5,896 cache hits.
- Rebuilt context events and route touches afterward.

Production-publish follow-up slice:

- Ran `geocode:311 -- --since 2026-02-01 --until 2026-03-01 --max-rows 20000 --batch-size 500`.
- Result: 20,000 scanned, 19,654 hits, 346 misses, 12,358 cache hits.
- Rebuilt context events and route touches afterward.

Current 311 evidence after rebuild:

- February 2026: 85,768 filtered rows, 30,527 geocoded, 54,768 unattempted.
- Current 311 context: 136,231 joinable rows.
- Current 311 route touches: 90,658 touched events, 320,492 touches, 378 routes.

Next 311 step:

- Continue monthly slices newest-first, measuring hit rate and route-touch lift after each batch.
- Prefer rows with coordinates and route-relevant complaint types already in the filtered corpus.
- Rebuild context events/touches after meaningful batches, not after every tiny batch.

## Parking scope

Parking remains out of this operational cycle.

The next parking project is a separate bulk fiscal-year loader plus geocode strategy for FY2024/FY2025-scale data, followed by context rebuild and detector-readiness review.

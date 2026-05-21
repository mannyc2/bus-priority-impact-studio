# Data Pipeline Operationalization Status

Updated: 2026-05-21

This status turns the completed 2023-present checkpoint into the next operational steps.

## Release decision

The refreshed March 2026 serving release is **deferred**, not executed in this pass.

Evidence already available:

- `check:pipeline-v1 -- --year 2026 --month 3` passed.
- `export:d1 -- --year 2026 --month 3` and `verify:d1 -- --year 2026 --month 3` passed.
- Dry-run `publish:serving-release -- --month 2026-03 --d1 bus-priority-serving --r2 bus-priority-artifacts` passed.

Reason for deferral:

- `publish:serving-release --execute` mutates production D1/R2 and should be run only after an explicit release review of the refreshed seed, artifact diffs, and production timing.

## PR state

PR #2 is open as a draft, mergeable, and has a green `verify` CI check. It is not merged in this pass
because the production publish decision remains deferred to an explicit release review.

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

Current 311 evidence after rebuild:

- February 2026: 85,768 filtered rows, 10,873 geocoded, 74,768 unattempted.
- Current 311 context: 116,577 joinable rows.
- Current 311 route touches: 77,443 touched events, 274,003 touches, 378 routes.

Next 311 step:

- Continue monthly slices newest-first, measuring hit rate and route-touch lift after each batch.
- Prefer rows with coordinates and route-relevant complaint types already in the filtered corpus.
- Rebuild context events/touches after meaningful batches, not after every tiny batch.

## Parking scope

Parking remains out of this operational cycle.

The next parking project is a separate bulk fiscal-year loader plus geocode strategy for FY2024/FY2025-scale data, followed by context rebuild and detector-readiness review.

# Data Pipeline Operationalization Status

Updated: 2026-07-19

This status turns the completed 2023-present checkpoint into the next operational steps.

## 2026-07-19 serving-contract addendum

Plan 085 removes month-as-release identity from public serving responses. The Worker now resolves
the latest published, passing route batch from D1 and reports its canonical `releaseId`, stored
`publishedAt`, and `coverage: { start, end }`. There is no public `?month=` release selector and no
`BASELINE_MONTH` or `LAST_BUILT_SPEED_MONTH` environment pin. The historical route-scorecard query
uses `?asOfMonth=` because that value is evidence grain, not release identity.

D1 tables keyed by month and fields such as `dataAsOf` remain unchanged where they describe source
or time-series grain. Plan 086 follows by migrating and republishing the static pipeline release
artifacts; do not deploy the Plan 085 reader contract alone against older capability or dossier
objects that still carry the previous schema.

## Release decision

The release evidence below records the production state observed in May 2026. Its historical field
names are retained as evidence of that deployment, not as the current serving-contract doctrine.

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

## 311 coverage

311 raw history is loaded and geocoding has been fully attempted for the loaded current and historical tables.

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

February completion slice:

- Ran `geocode:311 -- --since 2026-02-01 --until 2026-03-01 --max-rows 60000 --batch-size 1000`.
- Result: 54,768 scanned, 54,292 hits, 476 misses, 33,457 cache hits.
- Rebuilt context events and route touches afterward.

Current 311 evidence after rebuild:

- Current 311 table: 2,521,134 filtered rows, 2,504,843 geocoded, 16,291 misses, 0 unattempted.
- Historical 311 table: 39,304 filtered rows, 37,707 geocoded, 1,597 misses, 0 unattempted.
- Current 311 route touches: 1,601,395 touched events, 5,418,460 touches, 378 routes.
- Historical 311 route touches: 23,798 touched events, 79,442 touches, 378 routes.

Next 311 step:

- Treat 311 geocoding as complete for the loaded corpus.
- Remaining misses are explicit geocode misses, not unattempted rows.

## Parking scope

Parking is raw-complete and now has a parking-specific candidate matching layer for the
`2023-04` through `2026-03` target window.

- Remote Socrata `ORDER BY summons_number` was removed from the parking month ingest; local sorting still keeps deterministic upserts, and the missing FY2024/FY2025/FY2026 months backfilled successfully.
- Parking now has 5,753,409 filtered rows, 157,304 geocoded rows, 5,596,105 explicit misses, and 0 unattempted rows.
- New raw fields preserved locally: parking `street_code1/2/3`, `intersecting_street`, and `match_location_key`; LION `b5sc`, `boroughcode`, and house-number ranges.
- New command: `build:parking-violation-matches`.
- Full match pass: 229 camera groups, 174,174 street-code/house groups, 596,527 candidate route rows, 96,760 matched grouped locations, 3,085,310 represented events, 367 routes.
- Rebuilt route touches: 30,150,878 `parking_location_match` touches plus the prior 29,234 physical-id route-LION touches.
- Corrected parking verification query: 3,128,264 joinable events, 3,086,633 touched events, 30,180,112 total touches, 378 routes, 98.67% touched among joinable events, 53.65% touched among all parking events.
- New command: `audit:parking-candidate-quality`.
- Candidate quality audit output: `data/artifacts/context-events/parking-candidate-quality-audit.json`.
- Audit decision: `keep_release_context_only`, `automaticPromotionAllowed=false`.
- Strict manual-review subset: 54,920 grouped locations and 1,096,073 represented events meet the high-confidence, candidate-count <= 3, location-weight >= 0.8 threshold.
- Broad fanout caveat: max candidate count is 76, P90 candidate count is 14, and event-weighted P90 candidate count is 24, so weighted route context is useful but detector-grade promotion remains blocked.

Parking remains `release_context_only`: the join-rate problem is largely solved for route context,
but many matches are candidate/fanout matches rather than single physical-id geocodes. Keep
match kind, confidence, candidate count, and match weight visible before using parking as
detector-grade historical evidence.

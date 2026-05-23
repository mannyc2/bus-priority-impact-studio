---
title: Data Pipeline Finish Plan v2
type: engineering
status: active
last_updated: 2026-05-21
owner: codex
source_count: 0
tags: [pipeline, historical-backfill, source-coverage, cloudflare, gtfs-rt, operations]
---

# Data Pipeline Finish Plan v2

## Purpose

This is the current plan of record for finishing the data pipeline after the May 2026 production
cutover and follow-up source audit.

It supersedes the older forward-planning parts of
[[wiki/engineering/data_pipeline_v1_completion_plan|Data Pipeline v1 completion plan]] and
[[wiki/engineering/data_infrastructure_v1_finish_plan|Data Infrastructure v1 finish plan]]. Those
pages remain useful as implementation history and proof logs.

The goal is no longer "make the March 2026 MVP work." The goal is:

```text
explicit source coverage
  -> complete chosen historical corpus
  -> monthly route-level features and findings
  -> manual PC rebuild and publish
  -> lightweight Cloudflare refresh status
```

## Decisions Since v1

1. **Heavy pipeline work stays on this PC for now.** Local Bun jobs remain the rebuild runner for
   historical ingest, SQLite/Spatialite joins, route builds, feature generation, checks, D1 export,
   and R2 publish.
2. **No Cloudflare Queue yet.** The Worker should not fan out rebuild jobs. A Queue can be added
   later if there is a real async workload, but today it would mostly move manual decisions into a
   more fragile place.
3. **Fold the source coverage ledger into historical completion.** The ledger is the first artifact
   of the historical-corpus track, not a separate project. It answers "are we done fetching history?"
4. **`shouldRebuild` is a signal, not a job.** It means a newer complete public route-speed month
   exists than `LAST_BUILT_SPEED_MONTH`. When it flips true, run the manual release pipeline on this
   PC.
5. **Worker cron is for lightweight operations.** It captures live GTFS-RT, checks public speed
   availability, and writes health/status. It does not run geospatial joins, route builds, D1
   exports, or artifact publication.

## Current Picture

Audit date: 2026-05-21.

Local artifacts are coherent again for the March 2026 baseline and May 2026 official current
signal. The historical blocker is no longer route trends or Bus Wait Assessment; the remaining
planning gap is equity context plus production proof/promotion.

| Area | Current state | Planning meaning |
|---|---|---|
| Canonical baseline | March 2026 | Still latest complete public route-speed month. |
| Route-speed watcher | May 2026 checked on 2026-05-21, 0 speed routes | `shouldRebuild=false`; no baseline rebuild is due. |
| DOT permits | 2,028,951 rows, 2023-04 through 2026-04, about 96% geocoded | Not the blocker anymore. |
| NYPD collisions | 277,606 rows, 2023-04 through 2026-04 | Historical context source is mostly present. |
| ACE summaries | 18,683 rows, 2023-04 through 2026-04 | Historical intervention/enforcement source is present. |
| Bus Observatory reliability | 2023-04 through 2026-05, about 102.9M observed headway samples | Historical observed reliability substrate is present, with provenance caveats. |
| Route monthly trends | 12,075 rows, 2023-04 through 2026-03, speed and ridership complete | Historical blocker cleared locally. |
| Detailed route slice data | March 2026 only | Fine for release builds; not a full historical corpus. |
| Bus Wait Assessment | 46,167 rows, 2023-04 through 2026-03 | Historical corroboration backfill is complete locally. |
| 311 | 2019-01 and 2026-03 only | Decide whether this is full historical evidence or release-context evidence. |
| Parking violations | 5,753,409 rows, 2023-04 through 2026-03; 157,304 physical-id geocodes plus parking-specific candidate matches | Route-context yield is much better, but still `release_context_only` until fanout/confidence is reviewed. |
| Traffic volume/speed | January 2024 sample and one live speed day | Current sample/context only unless promoted. |
| Equity context | Empty locally; Census ACS profile request needs an API key in this environment | `excluded_until_fixed`; no equity claims until repaired. |

## Track A: Stabilize Current Release State

Purpose: start the next work from a locally coherent March baseline plus May current signal.

Status as of 2026-05-21: complete locally.

Do first:

1. Regenerate March map artifacts so strict local `check:pipeline-v1 -- --year 2026 --month 3`
   no longer fails on the missing map manifest. Done: `map-artifacts` wrote 354 artifacts for 350
   public routes.
2. Rerun May official `route-observed-reliability` for
   `gtfs-rt-v1-20260517T103607Z-24h` so source-status rows are written for the official run. Done:
   381 route rows, 300 observed routes, 81 insufficient routes, and 360,914 headway samples.
3. Rerun May `gtfs-rt:preflight`. Done: status `pass`, 0 issues, 1,143 observed reliability
   source-status rows.
4. Compare regenerated local counts with production before republishing anything.

Acceptance:

- March strict pipeline check passes locally. Done: `check:pipeline-v1 -- --year 2026 --month 3`
  passed with 0 issues.
- May official GTFS-RT preflight passes locally. Done.
- Any D1/R2 republish is deliberate and only happens if regenerated rows differ from production.

## Track B: Historical Corpus Completion

The source coverage ledger is the first deliverable in this track. It exists locally and currently
classifies 12 active sources; only `equity_context` still needs action.

### Coverage Ledger

Generated audit artifact:

```text
data/artifacts/source-coverage/<YYYY-MM>/ledger.json
```

Current command:

```bash
bun run audit:source-coverage -- --year 2026 --month 3
```

For each source, it records:

- date range and latest loaded month,
- raw rows and canonical rows,
- geocode rate where relevant,
- route-join or feature-join rate where relevant,
- freshness status,
- detector/readiness status,
- intended role: `baseline`, `historical`, `release_context`, `current_signal`, or `deferred`.

The ledger also makes one explicit decision per source:

| Decision | Meaning |
|---|---|
| `complete_for_history` | Historical rows are sufficient for the claims this source supports. |
| `backfill_required` | More historical rows are required before the source can support planned claims. |
| `release_context_only` | Use this source only around the release month or current appendix; do not block historical completion. |
| `current_signal_only` | Use this source as live/current context, not historical evidence. |
| `excluded_until_fixed` | Do not use in published claims until the data issue is repaired. |

### Historical Backfill Priorities

1. Teach `ingest:route-trends` to use the older route-speed and ridership datasets:
   `bus_segment_speeds_2023_2024` and `bus_hourly_ridership_2020_2024`. Done.
2. Backfill route monthly speed/ridership trends from `2023-04` through the latest complete public
   speed month. Done locally for `2023-04` through `2026-03`: 12,075 route-month rows have speed
   and ridership trend coverage, and strict March QA passes with the expanded trend table.
3. Backfill Bus Wait Assessment across the same route-speed history window if it remains a
   corroboration input for observed reliability findings. Done locally for `2023-04` through
   `2026-03`: 46,167 rows across 36 months and 354 distinct routes.
4. Fix or refetch equity context. If it cannot be repaired, mark it `excluded_until_fixed` and keep
   equity claims out of release briefs/findings. Current status: excluded until fixed. The Census
   ACS profile API request now requires a Census API key in this environment; no `CENSUS_API_KEY`
   is configured.
5. Decide 311, parking, traffic volume, and DOT traffic speeds from the ledger. Default posture:
   keep them `release_context_only` unless a detector or finding claim needs true historical trend
   behavior.

This keeps "all historical data we will ever need" scoped to sources that support longitudinal
claims. Not every raw context source has to be full-history to finish the historical corpus.

## Track C: Context Features And Findings

Purpose: stop relying on memory or giant event-touch tables to explain route context.

Keep raw context tables available, but publish monthly route-level features with join audits:

```text
source rows
  -> geocoded/linked rows
  -> route-month feature rows
  -> finding detector inputs
  -> promoted findings/review queue
```

Near-term work:

1. Rebuild context events/touches for the selected release month after source tables are coherent.
   Done locally for March 2026: 2,644,997 context events and 5,835,695 route touches.
2. Add or regenerate route-month context feature rows instead of treating every historical
   event-route touch as a permanent serving surface. Done through the normal `findings:detect`
   signal-feature artifact for March 2026.
3. Preserve join rates, row counts, and low-confidence warnings, especially for parking. Done in
   the source coverage ledger, route-touch audit, detector coverage audit, and review queue.
4. Rerun findings after route trends and context features are refreshed. Done locally for March
   2026: six detectors produced 600 candidates, including one `intervention_underperformance`
   candidate after the route-trend backfill.
5. Rerun intervention evaluation after 2023-2024 route trends exist. Done locally for March 2026:
   360 comparisons, 162 evaluated, 81 insufficient, 115 source gaps, and 2 future comparisons.

Acceptance:

- Findings can explain which sources were considered, joined, skipped, and promoted.
- Context-heavy findings use monthly features with explicit source coverage, not ad hoc row pulls.
- Parking and other low-confidence sources cannot silently create high-confidence claims.

## Track D: Production Refresh Operations

Purpose: keep data fresh without pretending Cloudflare Workers are the analytics runner.

Worker responsibilities:

1. Capture GTFS-RT vehicle-position snapshots to R2 every minute.
2. Write compact GTFS-RT manifests and a source-refresh status record.
3. Run route-speed availability daily, not every minute. Done in code: the every-minute cron skips
   the watcher, and `17 10 * * *` runs it.
4. Write refresh health: latest snapshot time, latest GTFS-RT status/object keys, latest complete
   speed month, `shouldRebuild`, and reason. Done in code via `source-refresh/latest.json` when the
   Worker has an ARTIFACTS binding.

Manual PC responsibilities:

1. Mirror production GTFS-RT windows before the 21-day raw R2 lifecycle expires them.
2. Import manifests, parse protobufs, build observed headways, generate route reliability, and run
   preflight.
3. Run historical ingest/backfill/build/finalize/check/export.
4. Publish D1/R2 release artifacts only after checks pass.
5. Update Worker vars such as `BASELINE_MONTH` and `LAST_BUILT_SPEED_MONTH` after promotion.

Do not add a Queue until at least one of these becomes true:

- manual release handoff becomes error-prone enough that automatic dispatch is worth the extra
  resource,
- multiple independent small Worker-side tasks need retry/batching semantics,
- GitHub Actions is promoted to the heavy runner and needs a reliable trigger path.

Even then, the Queue should carry small events such as `source_availability_checked` or
`baseline_rebuild_requested`; it should not carry the rebuild itself.

## Manual Rebuild Trigger

When the Worker or local route-speed watcher writes:

```json
{
  "releaseDecision": {
    "shouldRebuild": true
  }
}
```

run the baseline release path on this PC for the new complete speed month:

```bash
bun run plan:source-refresh -- --start-year 2026 --end-year 2026 --year <YYYY> --month <M> --last-built-year 2026 --last-built-month 3 --min-speed-routes 300
bun run finalize:pipeline-v1 -- --year <YYYY> --month <M> --run-id <matching-gtfs-rt-run-id>
bun run check:pipeline-v1 -- --year <YYYY> --month <M>
bun run export:d1 -- --year <YYYY> --month <M>
bun run verify:d1 -- --year <YYYY> --month <M>
bun run publish:serving-release -- --month <YYYY-MM> --d1 bus-priority-serving --r2 bus-priority-artifacts
```

Add `--execute` to `publish:serving-release` only after reviewing counts, provenance labels, and
artifact diffs.

## Next Implementation Sequence

1. Rebuild briefs, map/evaluation artifacts, D1 export, and checks from the refreshed route trends,
   context features, and findings. Done locally for March 2026.
2. Compare the regenerated local serving/export rows with production before any publish. Local
   `export:d1`, `verify:d1`, and dry-run `publish:serving-release` now pass for March 2026; executed
   publish remains a deliberate promotion step.
3. Run a production-length GTFS-RT R2 capture proof before raw snapshots expire: mirror a contiguous
   4h+ deployed window, import it, build observed headways/reliability, and preflight it. Done with
   `gtfs-rt-r2-prod-20260517T171354Z-4h`: 480 R2 manifests/protobufs, 14,462 collection seconds,
   894,254 parsed vehicle positions, 151,356 observed headway samples, and May preflight `pass`
   with 0 issues.
4. Decide whether to configure `CENSUS_API_KEY` and repair equity context or leave equity excluded
   for the next release. Done locally: ACS 2024 tract context is loaded and March 2026 route equity
   context has 381 rows, with 358 county-proxy assignments.

## 2023-Present Reframe

Updated decision on 2026-05-21: "full history" means `2023-04` through the latest complete public
speed month, currently `2026-03`, not all available public archive history.

Current status under that framing:

- Route trends, Bus Wait Assessment, permits, collisions, ACE, observed reliability, weather, and
  equity context now meet the target corpus scope.
- 311 raw history is loaded for the target window, but route-join coverage is still low because the
  historical rows have not been geocoded/snap-joined at full scale. The ledger marks this as
  `needs_decision` rather than silently treating it as detector-ready.
- DOT traffic-volume rows were fetched across the target window where the source has data, but the
  source remains `release_context_only` because it is structurally sparse and has low geocode/join
  coverage.
- Parking violations now use fiscal-year source tables for FY2023 through FY2026. The remaining
  target months were loaded after removing the remote Socrata `ORDER BY`; geocoding is fully
  attempted with 0 unattempted rows. A dedicated parking candidate matcher now preserves raw street
  codes/intersections, matches camera/intersection and street-code/house groups, and recovers route
  context for 3,086,633 touched events. Candidate fanout and confidence are now audited by
  `audit:parking-candidate-quality`; the audit keeps parking `release_context_only` and blocks
  automatic detector promotion while exposing a strict manual-review subset.

## Definition Of Done

The pipeline finish work is done when:

1. A generated source coverage ledger exists and classifies every active source.
2. All `backfill_required` sources for longitudinal claims have been backfilled or removed from
   claim scope.
3. Route monthly speed/ridership trends cover `2023-04` through the latest complete public speed
   month.
4. Equity context is either nonempty and joined or explicitly excluded from published claims.
5. Context features and findings carry source coverage, join-rate, and confidence caveats.
6. March local release drift is resolved and May official current-signal preflight passes locally.
7. Worker operations publish capture health and route-speed availability health without running
   heavy analytics.
8. `shouldRebuild=true` has a documented manual PC runbook and no unimplemented Queue dependency.
9. A production-length R2 GTFS-RT window can be mirrored, imported, processed, and attached as a
   current appendix before raw retention expires.

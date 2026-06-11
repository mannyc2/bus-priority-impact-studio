---
title: Analytics Backfill Runbook
type: engineering
status: active
last_updated: 2026-06-11
owner: tools/pipeline-v2
source_count: 0
tags: [analytics, backfill, runbook, corpus, operations]
---

# Analytics Backfill Runbook

## Scope

This runbook covers the local 2023-04 through 2026-03 analytics corpus backfill for:

- route segment speeds;
- route hourly ridership;
- intervention comparisons.

The job is local batch work. It should not run inside the public Worker or public serving path.
Outputs land in the local SQLite pipeline database and are verified by read-only audit artifacts.

Production route-trends runs are still full-table rebuilds; the next run must include ridership for
the full trend window, not only the newly refreshed speed months.

## Active run

Current tmux session:

```sh
analytics-corpus-backfill-20260530
```

Current run directory:

```text
data/ops/backfills/analytics-corpus-20260530T223147Z-tmux
```

Current script:

```text
data/ops/backfills/analytics-corpus-20260530T223147Z-tmux/run.sh
```

Current log:

```text
data/ops/backfills/analytics-corpus-20260530T223147Z-tmux/backfill.log
```

The script is intentionally resumable by environment variables:

| Variable | Default | Purpose |
|---|---:|---|
| `START_YEAR` / `START_MONTH` | `2023` / `4` | First month to run. |
| `END_YEAR` / `END_MONTH` | `2026` / `3` | Last month to run. |
| `RUN_SEGMENT_SPEEDS` | `1` | Set to `0` to skip segment-speed ingest. |
| `RUN_HOURLY_RIDERSHIP` | `1` | Set to `0` to skip hourly-ridership ingest. |
| `RUN_INTERVENTION_EVALUATION` | `1` | Set to `0` to skip intervention comparison materialization. |
| `SEGMENT_ROUTE_CONCURRENCY` | `6` | Number of route-level segment-speed Socrata queries to run concurrently before serialized writes. |
| `ROUTE_HOURLY_CHUNK_SIZE` | `5` | Number of route IDs per Socrata hourly-ridership aggregate query. |
| `HOURLY_QUERY_CONCURRENCY` | `4` | Number of hourly-ridership aggregate queries to run concurrently before serialized writes. |
| `ROUTE_SOURCE_YEAR` / `ROUTE_SOURCE_MONTH` | `2026` / `3` | Route/stop universe month for historical intervention comparisons. |

Concurrency is intentionally inside the ingest commands, not whole-month process fanout. This keeps
the slow Socrata fetches parallel while preserving ordered SQLite writes. If Socrata starts timing
out or rate-limiting, lower `SEGMENT_ROUTE_CONCURRENCY`, `HOURLY_QUERY_CONCURRENCY`, or
`ROUTE_HOURLY_CHUNK_SIZE` first.

## Start or restart

Start the full backfill:

```sh
cd <repo-root>
tmux new-session -d -s analytics-corpus-backfill-20260530 \
  "data/ops/backfills/analytics-corpus-20260530T223147Z-tmux/run.sh"
```

If restarting, preserve the old log first:

```sh
cd <repo-root>
tmux kill-session -t analytics-corpus-backfill-20260530 2>/dev/null || true
stamp=$(date -u +%Y%m%dT%H%M%SZ)
mv data/ops/backfills/analytics-corpus-20260530T223147Z-tmux/backfill.log \
  "data/ops/backfills/analytics-corpus-20260530T223147Z-tmux/backfill-before-restart-${stamp}.log"
tmux new-session -d -s analytics-corpus-backfill-20260530 \
  "data/ops/backfills/analytics-corpus-20260530T223147Z-tmux/run.sh"
```

Resume from a specific month:

```sh
cd <repo-root>
tmux new-session -d -s analytics-corpus-backfill-20260530 \
  "START_YEAR=2024 START_MONTH=7 data/ops/backfills/analytics-corpus-20260530T223147Z-tmux/run.sh"
```

Resume only a failed surface:

```sh
cd <repo-root>
tmux new-session -d -s analytics-corpus-backfill-20260530-hourly-202304 \
  "START_YEAR=2023 START_MONTH=4 END_YEAR=2023 END_MONTH=4 RUN_SEGMENT_SPEEDS=0 RUN_INTERVENTION_EVALUATION=0 RUN_HOURLY_RIDERSHIP=1 ROUTE_HOURLY_CHUNK_SIZE=3 HOURLY_QUERY_CONCURRENCY=2 data/ops/backfills/analytics-corpus-20260530T223147Z-tmux/run.sh"
```

Use a smaller `ROUTE_HOURLY_CHUNK_SIZE` when Socrata aggregate queries time out. One-route probes
have succeeded; failures so far are batch-query timeouts, not normalization failures.

## Monitor

Check whether tmux is alive:

```sh
tmux list-sessions | rg analytics-corpus-backfill-20260530
```

See the current child command:

```sh
PANE_PID=$(tmux list-panes -t analytics-corpus-backfill-20260530 -F '#{pane_pid}')
ps -o pid,ppid,stat,etime,cmd --ppid "$PANE_PID"
```

Tail progress:

```sh
tail -n 120 data/ops/backfills/analytics-corpus-20260530T223147Z-tmux/backfill.log
```

List failures:

```sh
rg "FAIL\\(" data/ops/backfills/analytics-corpus-20260530T223147Z-tmux/*.log
```

List completed month/surface pairs:

```sh
rg "DONE (route-segment-speeds|route-hourly-ridership|intervention-evaluation)" \
  data/ops/backfills/analytics-corpus-20260530T223147Z-tmux/*.log
```

## Failure interpretation

A `FAIL(...)` line is not fatal to the whole run. The script increments `failures`, records the
surface/month, and proceeds to the next step. This lets the backfill make progress while preserving
an explicit resume list.

Do not treat a missing or failed month as "no issue." The failed surface must be rerun or documented
as a source-quality caveat, and the post-backfill audit must reflect it.

Known 2026-05-30 wrinkle:

- `route-hourly-ridership 2023-04` timed out with the larger route-chunk query.
- The command now defaults to `--route-chunk-size 5`.
- If it still times out, resume the failed month with `ROUTE_HOURLY_CHUNK_SIZE=3` or a single
  `--route M1` style probe before rerunning the whole surface.

## Schedule-source bulk CSV path

The schedule-source backfill now has two raw CSV snapshot paths:

1. **Preferred:** authenticated SODA3 `export.csv` partitioned by `schedule_date`, one monthly chunk
   per file, with a `partition-manifest.json`.
2. **Fallback only:** whole-dataset `rows.csv?accessType=DOWNLOAD`, which has repeatedly reset
   multi-GB connections and cannot be assumed byte-range resumable.

Use the partitioned path first:

```sh
MAX_PARALLEL=4 data/ops/backfills/soda3-route-schedules-partitioned-20260531T2115Z/run.sh \
  | tee data/ops/backfills/soda3-route-schedules-partitioned-20260531T2115Z/run.log
```

Then import a completed year directly from its partition manifest:

```sh
bun --filter @bp/pipeline-v2 cli -- ingest route-schedules-bulk \
  --source-year 2025 \
  --partition-manifest-path data/raw/socrata-partitioned/bus_schedules_2025/schedule-2025/partition-manifest.json \
  --skip-existing true \
  --only-missing-current-routes true
```

The importer resolves the current-catalog routes still missing from the local DB before scanning
CSV chunks, then streams only matching rows into per-route scratch files, deterministic sort, and
`local_route_schedule_stop` writes. Completed chunk files are reused on resume; an interrupted
active chunk may need to restart, but already completed months do not. The queued
`import-after-download.sh` runner imports each source year as soon as its partition manifest exists.

The fallback whole-file path remains:

```sh
bun --filter @bp/pipeline-v2 cli -- ingest route-schedules-bulk \
  --source-year 2025 \
  --csv-path data/raw/socrata-bulk/bus_schedules_2025/rows.csv \
  --spool-dir data/working/route-schedules-bulk/bus_schedules_2025 \
  --skip-existing true
```

If `--csv-path` does not exist, the command downloads the manifest `rows_csv` URL first. The
import then streams the CSV into per-route scratch files, reads one route at a time, sorts by the
same deterministic key as `ingest route-schedules`, and writes `local_route_schedule_stop` plus
`local_route_schedule_ingest_status`. Keep `--skip-existing true` when running against the main
local database so completed route/year pairs are not rewritten.

To cache the source snapshot without writing SQLite rows, add `--download-only`. This is the safe
mode to run while another schedule ingest is actively writing to the main local database.

Large Socrata `rows.csv` exports can reset the socket before completion. The command retries failed
download attempts with `--download-retry-count` and `--download-retry-delay-ms`; use lower
parallelism for multi-GB exports. The Socrata bulk export endpoint observed on 2026-05-31 did not
honor HTTP byte-range requests, so these retries restart the export attempt rather than resuming a
partial temp file. Preserve any large interrupted temp files under
`data/raw/socrata-bulk/_partials-preserved/` before rerunning a whole-file retry; do not treat those
partials as complete raw coverage.

Use this path first on a scratch database or a route filter:

```sh
bun --filter @bp/pipeline-v2 cli -- ingest route-schedules-bulk \
  --db data/working/route-schedules-bulk-smoke.sqlite \
  --source-year 2025 \
  --route SIM35 \
  --csv-path data/working/route-schedules-bulk-benchmark/sim35.csv \
  --skip-download true \
  --skip-existing false
```

The initial SIM35 scratch benchmark on 2025 rows wrote 66,150 rows. The existing JSON route/page
path took 23.85s. The CSV route download took 3.94s and the bulk importer took 2.14s. A SQLite
`EXCEPT` comparison between both scratch outputs found equal row counts and zero row differences.
This is promising, but it is still a validation path until a full-year `rows.csv` snapshot is
downloaded and one large missing-year import completes cleanly.

## Completion verification

The backfill is not complete merely because tmux exits. Completion requires:

1. no unexplained `FAIL(...)` lines across the latest run logs;
2. read-only coverage audit over the intended month range;
3. data-product completeness audit showing which derived tables, artifacts, score vectors, serving
   projections, and release manifests are complete, partial, missing, stale, waived, blocked, or
   fetching;
4. corpus profile refresh showing the backfilled surfaces are no longer release-only;
5. detector readiness audit showing which detector policies are ready, partial, or blocked;
6. documented source-quality caveats for any intentionally accepted gaps.

Run the coverage audit:

```sh
bun --filter @bp/pipeline-v2 cli -- audit analytics-backfill-coverage \
  --start-year 2023 --start-month 4 \
  --end-year 2026 --end-month 3
```

Expected artifact:

```text
data/artifacts/analytics-backfill-coverage/2023-04_to_2026-03/coverage.json
```

Then run the derived data-product completeness audit:

```sh
bun --filter @bp/pipeline-v2 cli -- audit data-product-completeness \
  --year 2026 --month 3 \
  --history-start-month 2023-04 \
  --run-id bus-observatory-2026-03
```

Expected artifact:

```text
data/artifacts/data-product-completeness/2023-04_to_2026-03/bus-observatory-2026-03/completeness.json
```

The registry for this audit is `tools/pipeline-v2/src/registry/data-products.ts`. Register expected
derived products there before starting a new backfill so missing downstream products are visible
instead of inferred from source availability.

Then rerun the corpus profile:

```sh
bun --filter @bp/pipeline-v2 cli -- audit analytics-corpus-profile \
  --year 2026 --month 3
```

Expected artifact:

```text
data/artifacts/analytics-corpus-profile/2026-03/profile.json
```

Then join surface coverage to detector policy:

```sh
bun --filter @bp/pipeline-v2 cli -- audit analytics-detector-readiness \
  --start-year 2023 --start-month 4 \
  --end-year 2026 --end-month 3
```

Expected artifact:

```text
data/artifacts/analytics-detector-readiness/2023-04_to_2026-03/readiness.json
```

The verification pass should explain each missing or thin surface-month before detector calibration
uses that surface for thresholds, trend baselines, or intervention panels.

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RUN_STAMP="${RUN_STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
RUN_DIR="${RUN_DIR:-$ROOT/data/ops/backfills/available-not-fetched-$RUN_STAMP}"
DB_PATH="${DB_PATH:-$ROOT/data/local/pipeline.sqlite}"
HISTORY_START_MONTH="${HISTORY_START_MONTH:-2023-04}"

mkdir -p "$RUN_DIR/logs"

exec > >(tee -a "$RUN_DIR/run.log") 2>&1

echo "available-not-fetched backfill started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "run_dir=$RUN_DIR"
echo "db_path=$DB_PATH"
echo "history_start_month=$HISTORY_START_MONTH"

cli() {
  "$ROOT/scripts/with-repo-env.sh" -- bun --filter @bp/pipeline-v2 cli -- "$@"
}

run_step() {
  local name="$1"
  shift
  local safe_name
  safe_name="$(printf '%s' "$name" | tr -cs 'A-Za-z0-9._-' '-')"
  local log_path="$RUN_DIR/logs/$safe_name.log"

  echo
  echo "==> $name"
  echo "log_path=$log_path"
  echo "started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  local status=0
  if "$@" 2>&1 | tee -a "$log_path"; then
    status=0
  else
    status="${PIPESTATUS[0]}"
  fi

  echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ) status=$status"
  if [ "$status" -ne 0 ]; then
    echo "failed_step=$name"
    return "$status"
  fi
}

run_optional_step() {
  local name="$1"
  shift

  if run_step "$name" "$@"; then
    return 0
  else
    local status="$?"
    echo "optional_step_failed=$name status=$status"
    echo "continuing so coverage audits still refresh"
    return 0
  fi
}

for month in 4 5; do
  run_step "ingest bus wait assessment 2026-$month" \
    cli ingest bus-wait-assessment \
      --db "$DB_PATH" \
      --year 2026 \
      --month "$month" \
      --json
done

run_step "ingest bus customer journey metrics 2026-04_to_2026-05" \
  cli ingest bus-customer-journey-metrics \
    --db "$DB_PATH" \
    --start-year 2026 \
    --start-month 4 \
    --end-year 2026 \
    --end-month 5 \
    --json

for month in 4 5; do
  run_optional_step "route brief model 2026-$month" \
    cli route brief-model \
      --db "$DB_PATH" \
      --year 2026 \
      --month "$month" \
      --json

  run_optional_step "route intervention evaluation 2026-$month" \
    cli route intervention-evaluation \
      --db "$DB_PATH" \
      --year 2026 \
      --month "$month" \
      --route-universe-year 2026 \
      --route-universe-month 3 \
      --json

  run_step "route source reconciliation 2026-$month" \
    cli audit route-source-reconciliation \
      --db "$DB_PATH" \
      --year 2026 \
      --month "$month" \
      --history-start-month "$HISTORY_START_MONTH" \
      --json

  run_step "data product completeness 2026-$month" \
    cli audit data-product-completeness \
      --db "$DB_PATH" \
      --year 2026 \
      --month "$month" \
      --history-start-month "$HISTORY_START_MONTH" \
      --json
done

run_step "final available_not_fetched summary" \
  bash -lc '
    set -euo pipefail
    for month in 04 05; do
      path="data/artifacts/data-product-completeness/2023-04_to_2026-${month}/bus-observatory-2026-${month}/completeness.json"
      echo "month=2026-${month}"
      jq ".summary.gapClassCounts // null" "$path"
      jq -r ".products[]
        | select((.gapClasses // [])[]? == \"available_not_fetched\")
        | [.productId, .status, (.gapClasses // [] | join(\",\")), (.reasons | join(\";\"))]
        | @tsv" "$path"
    done
  '

echo
echo "available-not-fetched backfill finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "run_dir=$RUN_DIR"

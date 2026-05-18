#!/usr/bin/env sh
set -eu

usage() {
  cat <<'USAGE'
Usage:
  scripts/publish-serving-release.sh --month YYYY-MM --d1 DATABASE_NAME --r2 BUCKET_NAME [--account-id ACCOUNT_ID] [--appendix-month YYYY-MM] [--skip-schema] [--execute]

Default mode is dry-run: commands are printed but not executed.

Publishes one generated serving release:
  1. applies data/exports/d1/YYYY-MM/schema.sql to Cloudflare D1
  2. applies data/exports/d1/YYYY-MM/seed.sql to Cloudflare D1
  3. uploads selected data/artifacts release files to Cloudflare R2

When --appendix-month is provided, additionally:
  4. applies data/exports/d1/APPENDIX-MONTH/seed.appendix.sql to Cloudflare D1
     (observed-reliability rows only; no schema; no extra R2 uploads beyond what
     the canonical artifact globs already cover).

This is intentionally a one-shot promotion script, not a cron job.
USAGE
}

month=""
appendix_month=""
d1_database=""
r2_bucket=""
account_id=""
execute=0
skip_schema=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --month)
      month="${2:-}"
      shift 2
      ;;
    --appendix-month)
      appendix_month="${2:-}"
      shift 2
      ;;
    --d1)
      d1_database="${2:-}"
      shift 2
      ;;
    --r2)
      r2_bucket="${2:-}"
      shift 2
      ;;
    --account-id)
      account_id="${2:-}"
      shift 2
      ;;
    --execute)
      execute=1
      shift
      ;;
    --skip-schema)
      skip_schema=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

case "$month" in
  ????-??) ;;
  *)
    printf 'Missing or invalid --month YYYY-MM\n' >&2
    exit 1
    ;;
esac

if [ -n "$appendix_month" ]; then
  case "$appendix_month" in
    ????-??) ;;
    *)
      printf 'Invalid --appendix-month YYYY-MM: %s\n' "$appendix_month" >&2
      exit 1
      ;;
  esac
fi

if [ -z "$d1_database" ]; then
  printf 'Missing --d1 DATABASE_NAME\n' >&2
  exit 1
fi

if [ -z "$r2_bucket" ]; then
  printf 'Missing --r2 BUCKET_NAME\n' >&2
  exit 1
fi

year="${month%-*}"
mon="${month#*-}"
export_dir="data/exports/d1/$month"
schema_sql="$export_dir/schema.sql"
seed_sql="$export_dir/seed.sql"

if [ ! -f "$schema_sql" ]; then
  printf 'Missing D1 schema export: %s\n' "$schema_sql" >&2
  exit 1
fi

if [ ! -f "$seed_sql" ]; then
  printf 'Missing D1 seed export: %s\n' "$seed_sql" >&2
  exit 1
fi

if [ -n "$appendix_month" ]; then
  appendix_seed_sql="data/exports/d1/$appendix_month/seed.appendix.sql"
  if [ ! -f "$appendix_seed_sql" ]; then
    printf 'Missing D1 appendix seed export: %s\n' "$appendix_seed_sql" >&2
    exit 1
  fi
fi

run() {
  printf '+'
  for part in "$@"; do
    printf ' %s' "$part"
  done
  printf '\n'

  if [ "$execute" -eq 1 ]; then
    if [ -n "$account_id" ]; then
      CLOUDFLARE_ACCOUNT_ID="$account_id" "$@"
    else
      "$@"
    fi
  fi
}

if [ "$skip_schema" -eq 0 ]; then
  run bunx --bun wrangler d1 execute "$d1_database" --remote --file "$schema_sql"
fi
run bunx --bun wrangler d1 execute "$d1_database" --remote --file "$seed_sql"

if [ -n "$appendix_month" ]; then
  run bunx --bun wrangler d1 execute "$d1_database" --remote --file "$appendix_seed_sql"
fi

find data/artifacts \
  \( -path "data/artifacts/briefs/$month/*" \
  -o -path "data/artifacts/evaluations/$month/*" \
  -o -path "data/artifacts/map/*" \
  -o -path "data/artifacts/studio/*" \
  -o -path "data/artifacts/source-availability/*" \
  -o -path "data/artifacts/pipeline-v1/*" \) \
  -type f | sort | while IFS= read -r file; do
    key="${file#data/artifacts/}"
    run bunx wrangler r2 object put --remote --file "$file" "$r2_bucket/$key"
  done

if [ "$execute" -eq 0 ]; then
  if [ -n "$appendix_month" ]; then
    printf '\nDry run only. Re-run with --execute to publish %s (%s-%s) with appendix %s.\n' "$month" "$year" "$mon" "$appendix_month"
  else
    printf '\nDry run only. Re-run with --execute to publish %s (%s-%s).\n' "$month" "$year" "$mon"
  fi
fi

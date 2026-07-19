#!/usr/bin/env sh
set -eu

usage() {
  cat <<'USAGE'
Usage:
  scripts/publish-serving-release.sh --month YYYY-MM --d1 DATABASE_NAME --r2 BUCKET_NAME [--account-id ACCOUNT_ID] [--appendix-month YYYY-MM] [--skip-schema] [--execute]

Default mode is dry-run: commands are printed but not executed.

Publishes one generated serving release:
  1. validates the complete local release before any remote mutation
  2. applies data/exports/d1/YYYY-MM/schema.sql to Cloudflare D1 (via wrangler)
  3. applies data/exports/d1/YYYY-MM/seed.sql to Cloudflare D1 (via wrangler)
  4. uploads release artifacts to R2 via the S3-compatible API
     (idempotent, resumable, parallel — see tools/pipeline publish:r2-artifacts)
  5. registers the verified v2 map release in D1, making it discoverable

When --appendix-month is provided, additionally:
  4. applies data/exports/d1/APPENDIX-MONTH/seed.appendix.sql to Cloudflare D1
     (observed-reliability rows only; no schema; no extra R2 uploads beyond what
     the canonical artifact globs already cover).

Required environment (for the R2 step):
  R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT

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
map_release_registration_sql="$export_dir/map-release-registration.sql"

if [ ! -f "$schema_sql" ]; then
  printf 'Missing D1 schema export: %s\n' "$schema_sql" >&2
  exit 1
fi

if [ ! -f "$seed_sql" ]; then
  printf 'Missing D1 seed export: %s\n' "$seed_sql" >&2
  exit 1
fi

if [ ! -f "$map_release_registration_sql" ]; then
  printf 'Missing D1 map-release registration: %s\n' "$map_release_registration_sql" >&2
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

  if [ "$execute" -eq 0 ]; then
    return 0
  fi

  # Retry transient failures (R2 502s, network blips) with exponential backoff.
  # Each individual wrangler call retries up to 3 times before giving up.
  attempt=1
  max_attempts=3
  while : ; do
    if [ -n "$account_id" ]; then
      CLOUDFLARE_ACCOUNT_ID="$account_id" "$@" && return 0
    else
      "$@" && return 0
    fi
    rc=$?
    if [ "$attempt" -ge "$max_attempts" ]; then
      printf 'run: failed after %s attempts (exit %s)\n' "$attempt" "$rc" >&2
      return "$rc"
    fi
    backoff=$((attempt * 5))
    printf 'run: retrying in %ss (attempt %s/%s, last exit %s)\n' \
      "$backoff" "$attempt" "$max_attempts" "$rc" >&2
    sleep "$backoff"
    attempt=$((attempt + 1))
  done
}

# Fail closed before the first remote D1, R2, or Worker mutation. The gate
# verifies the full map profile, same-month serving inputs, and every declared
# local artifact body.
if ! bun run tools/pipeline-v2/src/checks/check-publish-completeness.ts --month "$month" >/dev/null; then
  printf 'Publish completeness check failed for %s; aborting before remote mutation.\n' "$month" >&2
  exit 1
fi

if [ "$skip_schema" -eq 0 ]; then
  run bunx --bun wrangler d1 execute "$d1_database" --remote --file "$schema_sql"
fi
run bunx --bun wrangler d1 execute "$d1_database" --remote --file "$seed_sql"

if [ -n "$appendix_month" ]; then
  run bunx --bun wrangler d1 execute "$d1_database" --remote --file "$appendix_seed_sql"
fi

# R2 uploads via the S3-compatible API: idempotent (HEAD-then-PUT, skips when
# remote size+etag match), resumable (re-running picks up where it left off),
# and parallel (default concurrency=16). Requires R2_ACCESS_KEY_ID,
# R2_SECRET_ACCESS_KEY, and R2_ENDPOINT in the environment. In shell dry-run
# mode we pass --dry-run through so the idempotency check is still exercised
# against the live bucket (HEADs are Class B operations, effectively free).
# Invoke from the repo root so Bun auto-loads the repo-root .env (which holds
# R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT). `bun run --cwd …`
# changes the cwd before env loading and would miss it.
if [ "$execute" -eq 0 ]; then
  bun --filter @bp/pipeline-v2 cli -- publish r2-artifacts \
    --month "$month" \
    --bucket "$r2_bucket" \
    --dry-run
else
  bun --filter @bp/pipeline-v2 cli -- publish r2-artifacts \
    --month "$month" \
    --bucket "$r2_bucket"
fi

# The catalog row is deliberately last. A failed upload cannot make a release
# discoverable; a failed registration leaves safe, undiscoverable R2 objects
# and can be retried without deleting or overwriting them.
run bunx --bun wrangler d1 execute "$d1_database" --remote --file "$map_release_registration_sql"

if [ "$execute" -eq 0 ]; then
  if [ -n "$appendix_month" ]; then
    printf '\nDry run only. Re-run with --execute to publish %s (%s-%s) with appendix %s.\n' "$month" "$year" "$mon" "$appendix_month"
  else
    printf '\nDry run only. Re-run with --execute to publish %s (%s-%s).\n' "$month" "$year" "$mon"
  fi
fi

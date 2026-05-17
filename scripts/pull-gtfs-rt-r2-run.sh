#!/usr/bin/env sh
set -eu

usage() {
  cat <<'USAGE'
Usage:
  scripts/pull-gtfs-rt-r2-run.sh --r2 BUCKET_NAME --run-id RUN_ID --manifest-list FILE [--output DIR] [--account-id ACCOUNT_ID] [--execute]

Default mode is dry-run: commands are printed but not executed.

Mirrors Worker-written GTFS-RT R2 objects for one collection run:
  1. reads manifest object keys from FILE, one R2 key per line
  2. downloads each manifest JSON to DIR
  3. reads objectKey from each manifest
  4. downloads the paired raw protobuf object to DIR
  5. prints the pipeline import command for the mirrored run

The manifest list is required because Wrangler's r2 object command fetches exact keys; listing or
inventory is an ops concern outside this script.
USAGE
}

r2_bucket=""
run_id=""
manifest_list=""
output_dir=""
account_id=""
execute=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --r2)
      r2_bucket="${2:-}"
      shift 2
      ;;
    --run-id)
      run_id="${2:-}"
      shift 2
      ;;
    --manifest-list)
      manifest_list="${2:-}"
      shift 2
      ;;
    --output)
      output_dir="${2:-}"
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

if [ -z "$r2_bucket" ]; then
  printf 'Missing --r2 BUCKET_NAME\n' >&2
  exit 1
fi

if [ -z "$run_id" ]; then
  printf 'Missing --run-id RUN_ID\n' >&2
  exit 1
fi

if [ -z "$manifest_list" ] || [ ! -f "$manifest_list" ]; then
  printf 'Missing --manifest-list FILE\n' >&2
  exit 1
fi

if [ -z "$output_dir" ]; then
  output_dir="data/raw/r2-mirror/$run_id"
fi

manifest_root="$output_dir/gtfs-rt/vehicle_positions"

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

mkdir -p "$manifest_root"

while IFS= read -r manifest_key || [ -n "$manifest_key" ]; do
  case "$manifest_key" in
    ""|\#*) continue ;;
  esac

  manifest_file="$output_dir/$manifest_key"
  mkdir -p "$(dirname "$manifest_file")"
  run bunx wrangler r2 object get --remote --file "$manifest_file" "$r2_bucket/$manifest_key"

  if [ "$execute" -eq 1 ]; then
    raw_key="$(bun -e 'const path = process.argv[1]; const json = await Bun.file(path).json(); if (!json.objectKey) process.exit(2); console.log(json.objectKey);' "$manifest_file")"
    raw_file="$output_dir/$raw_key"
    mkdir -p "$(dirname "$raw_file")"
    run bunx wrangler r2 object get --remote --file "$raw_file" "$r2_bucket/$raw_key"
  fi
done < "$manifest_list"

printf '\nNext pipeline handoff command:\n'
printf 'bun run import:gtfs-rt-r2-manifests -- --run-id %s --manifest-root %s --raw-root %s\n' \
  "$run_id" "$manifest_root" "$output_dir"

if [ "$execute" -eq 0 ]; then
  printf '\nDry run only. Re-run with --execute after reviewing the manifest key list.\n'
fi

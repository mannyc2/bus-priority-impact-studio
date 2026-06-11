#!/usr/bin/env sh
set -eu

bucket="${1:-bus-priority-artifacts}"
config="${2:-apps/web/wrangler.jsonc}"
root="${3:-data/artifacts/studio}"

if [ ! -d "$root" ]; then
  if [ ! -f "$root" ]; then
    printf 'Missing Studio artifact path at %s. Run the Studio release/export pipeline first.\n' "$root" >&2
    exit 1
  fi
fi

seed_file() {
  file="$1"
  key="${file#data/artifacts/}"
  bunx wrangler r2 object put --local --config "$config" --file "$file" "$bucket/$key" >/dev/null
}

count=0
if [ -f "$root" ]; then
  seed_file "$root"
  count=1
else
  find "$root" -type f | sort | while IFS= read -r file; do
    seed_file "$file"
    count=$((count + 1))
    printf '%s\n' "$count" > /tmp/bp-local-studio-r2-count
  done

  count="$(cat /tmp/bp-local-studio-r2-count 2>/dev/null || printf '0')"
  rm -f /tmp/bp-local-studio-r2-count
fi

printf 'Seeded %s Studio artifact object(s) from %s into local R2 bucket %s using %s\n' "$count" "$root" "$bucket" "$config"

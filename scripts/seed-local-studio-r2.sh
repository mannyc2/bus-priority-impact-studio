#!/usr/bin/env sh
set -eu

bucket="${1:-bus-priority-artifacts}"
config="${2:-apps/web/wrangler.jsonc}"
root="data/artifacts/studio/v1"

if [ ! -d "$root" ]; then
  printf 'Missing Studio projections at %s. Run: bun run pipeline studio release\n' "$root" >&2
  exit 1
fi

count=0
find "$root" -type f | sort | while IFS= read -r file; do
  key="${file#data/artifacts/}"
  bunx wrangler r2 object put --local --config "$config" --file "$file" "$bucket/$key" >/dev/null
  count=$((count + 1))
  printf '%s\n' "$count" > /tmp/bp-local-studio-r2-count
done

count="$(cat /tmp/bp-local-studio-r2-count 2>/dev/null || printf '0')"
rm -f /tmp/bp-local-studio-r2-count
printf 'Seeded %s Studio projection objects into local R2 bucket %s using %s\n' "$count" "$bucket" "$config"

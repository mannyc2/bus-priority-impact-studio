#!/usr/bin/env sh
set -eu

bucket="${1:-bus-priority-artifacts}"
config="${2:-apps/web/wrangler.jsonc}"
candidate_id="${3:-}"
if [ -z "$candidate_id" ]; then
  printf 'Usage: %s [bucket] [wrangler-config] <candidate-id>\n' "$0" >&2
  exit 1
fi
candidate_root="data/artifacts/studio/v2/candidates/$candidate_id"
public_artifact="$candidate_root/public-episodes.json"
route_root="$candidate_root/routes"
vite_plugin_dir="$(readlink -f apps/web/node_modules/@cloudflare/vite-plugin)"
wrangler_cli="$(
  bun -e 'console.log(Bun.resolveSync("wrangler/bin/wrangler.js", process.argv[1]))' \
    "$vite_plugin_dir"
)"

seed_file() {
  file="$1"
  key="$2"
  # Use the Wrangler/Miniflare version bundled with the Vite plugin. A newer
  # workspace Wrangler can migrate local R2 metadata beyond Vite's reader.
  bun "$wrangler_cli" r2 object put \
    --local \
    --config "$config" \
    --file "$file" \
    "$bucket/$key" >/dev/null
}

if [ ! -f "$public_artifact" ]; then
  printf 'Missing %s. Build the pinned Plan 106 candidate first.\n' "$public_artifact" >&2
  exit 1
fi

seed_file "$public_artifact" "studio/v2/interventions/public-episodes-v2.json"

find "$route_root" -type f -name intervention-history.json | sort | while IFS= read -r file; do
  route_key="$(basename "$(dirname "$file")")"
  seed_file "$file" "studio/v2/routes/$route_key/intervention-history-v2.json"
done

route_count="$(find "$route_root" -type f -name intervention-history.json | wc -l | tr -d ' ')"
count=$((route_count + 1))
printf 'Seeded %s public intervention artifact object(s) into local R2 bucket %s.\n' "$count" "$bucket"

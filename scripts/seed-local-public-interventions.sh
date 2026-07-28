#!/usr/bin/env sh
set -eu

bucket="${1:-bus-priority-artifacts}"
config="${2:-apps/web/wrangler.jsonc}"
public_artifact="data/artifacts/studio/v2/interventions/public-episodes.json"
route_root="data/artifacts/studio/v2/routes"
vite_plugin_dir="$(readlink -f apps/web/node_modules/@cloudflare/vite-plugin)"
wrangler_cli="$(
  bun -e 'console.log(Bun.resolveSync("wrangler/bin/wrangler.js", process.argv[1]))' \
    "$vite_plugin_dir"
)"

seed_file() {
  file="$1"
  key="${file#data/artifacts/}"
  # Use the Wrangler/Miniflare version bundled with the Vite plugin. A newer
  # workspace Wrangler can migrate local R2 metadata beyond Vite's reader.
  bun "$wrangler_cli" r2 object put \
    --local \
    --config "$config" \
    --file "$file" \
    "$bucket/$key" >/dev/null
}

if [ ! -f "$public_artifact" ]; then
  printf 'Missing %s. Run `bun tools/pipeline-v2/src/cli.ts studio public-intervention-episodes` first.\n' "$public_artifact" >&2
  exit 1
fi

seed_file "$public_artifact"

find "$route_root" -type f -name intervention-history.json | sort | while IFS= read -r file; do
  seed_file "$file"
done

route_count="$(find "$route_root" -type f -name intervention-history.json | wc -l | tr -d ' ')"
count=$((route_count + 1))
printf 'Seeded %s public intervention artifact object(s) into local R2 bucket %s.\n' "$count" "$bucket"

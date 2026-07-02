# @bp/web

React + Vite frontend with a Cloudflare Worker API.

## Folder structure

```text
src/
  components/   # reusable UI components (flat, no barrel files)
  fixtures/     # typed fixture data for demo/dev
  lib/          # small utilities (cn, etc.)
  pages/        # page-level components
  worker/       # Cloudflare Worker runtime; keep separate from UI
  App.tsx       # root component
  main.tsx      # entry point
  global.css    # CSS custom properties and component styles
```

Frontend tests live under `apps/web/test/`, not production `src/`; see
`apps/web/test/README.md` for the current test layout standard.

## Rules

- Components import directly from sibling files, not barrel/index files.
- `components/` is generic UI only. It must not import Worker code, D1 repositories, or analytics.
- `worker/` handles public API requests and must not import UI components, source fetchers, analytics jobs, pipeline code, or wiki files.

## Allowed imports

- `@bp/domain`
- `@bp/db`

Do not import `@bp/analytics` or `@bp/sources` here; those belong in the local pipeline.

## Commands

```bash
bun --filter @bp/web dev
bun --filter @bp/web build
bun --filter @bp/web test:worker
bun --filter @bp/web deploy
```

Worker tests use Cloudflare's Vitest pool so request behavior is exercised in the Workers-compatible runtime harness, not only in Bun's runtime.

## Scheduled source refresh

The Worker has a scheduled source-refresh entrypoint for lightweight GTFS-RT capture and monthly route-speed publication checks. GTFS-RT capture is inert unless both `GTFS_RT_RAW` and `MTA_BUS_TIME_API_KEY` are configured in the deployed environment. The monthly watcher is inert unless `ARTIFACTS` is configured, and it compares the latest complete speed month against optional `LAST_BUILT_SPEED_MONTH`. When configured, the Worker writes Bus Time vehicle-position protobuf snapshots, redacted JSON manifests, and a compact route-speed availability artifact to R2; heavy parsing, metrics, and D1/static export work remains in `tools/pipeline`. The configured cron is once per minute; set `GTFS_RT_SAMPLES_PER_CRON=2` and `GTFS_RT_SAMPLE_SECONDS=30` to take two spaced captures per invocation for strict 30-second sampling.

The production raw GTFS-RT bucket should keep a lifecycle rule expiring `gtfs-rt/` objects after 21
days. That retention window keeps strict 30-second raw capture under the expected R2 free storage
allowance while leaving enough time to mirror/import a run before promotion.

## API v1 surfaces

The first v1 website endpoint is `GET /api/v1/status`. It requires the `DB` D1 binding and either a `month=YYYY-MM` query parameter or `BASELINE_MONTH` Worker var. The response reports the active release month, D1 route-batch status, observed realtime evidence counts, inferred realtime provenance, and completeness/confidence caveats. March 2026 recovered GTFS-RT appears as `third_party_recovered` because the run id is `bus-observatory-2026-03`; it must not be described as official MTA historical GTFS-RT.

`GET /api/v1/routes` serves compact route cards from D1 route brief summaries plus observed reliability summaries. It uses the same month selection rule as status, accepts `limit`, and labels each route with completeness/confidence so the frontend can replace list fixtures without overclaiming recovered realtime evidence.

`GET /api/v1/routes/:routeId/profile` serves one route profile payload from D1 route brief summaries, observed reliability summaries, and route artifact metadata. It includes R2 artifact references rather than inlining large route briefs or map payloads.

`GET /api/v1/map/manifest` reads the generated R2 map manifest for the selected month and adds API artifact paths for each generated map layer. `GET /api/v1/artifacts/*` streams those R2 objects with immutable cache headers.

`GET /api/v1/hotspots` serves ranked hotspot cards from D1 corridor hotspot summaries.

Related schema endpoint:

```bash
GET /api/schema/release-status
GET /api/schema/route-list
GET /api/schema/route-profile
GET /api/schema/map-manifest
GET /api/schema/hotspots
```

The main panel loaders are API-first now: hotspots and route profiles call `/api/v1` endpoints.
The map starts with fixture geometry for nonblank first paint, then replaces the route line source
with generated route-shape GeoJSON discovered through `/api/v1/map/manifest` when the artifact API
is available.

## Production operations

See `knowledge/wiki/engineering/cloudflare_operations_runbook.md` for the real Cloudflare deployment
sequence: D1/R2 resources, Worker vars/secrets, one-shot serving publish, scheduled GTFS-RT capture
verification, and the R2-to-pipeline handoff command.

`wrangler.production.example.jsonc` shows the exact production binding shape. Copy those real values
into the deployed Wrangler config only after the Cloudflare D1 database and R2 buckets exist.

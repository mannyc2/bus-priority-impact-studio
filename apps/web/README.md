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

Frontend tests live under `apps/web/test/`, not production `src/`.

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

The Worker has a scheduled source-refresh entrypoint for lightweight GTFS-RT capture and monthly route-speed publication checks. GTFS-RT capture is inert unless both `GTFS_RT_RAW` and `MTA_BUS_TIME_API_KEY` are configured in the deployed environment. The monthly watcher is inert unless `ARTIFACTS` is configured, and it compares the latest complete speed month against optional `LAST_BUILT_SPEED_MONTH`. When configured, the Worker writes Bus Time vehicle-position protobuf snapshots, redacted JSON manifests, and a compact route-speed availability artifact to R2; heavy parsing, metrics, and D1/static export work remains in `tools/pipeline`. The configured cron is once per minute, so strict 30-second production sampling still needs a follow-up scheduler/queue design before it can replace the local v1 collection command.

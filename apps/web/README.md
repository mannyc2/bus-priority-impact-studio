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

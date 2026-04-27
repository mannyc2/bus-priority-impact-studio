# apps/web

Public-facing web app and Cloudflare Worker API.

## Responsibilities

- Render route scorecards, hotspot maps, source/caveat panels, and generated briefs.
- Serve API endpoints backed by D1 and R2 bindings.
- Keep request-time work cheap and read-heavy.
- Never run source ingestion, geospatial joins, or scoring in a public request handler.

## Suggested implementation

Use React + Vite with the Cloudflare Vite plugin. Keep Worker handlers under `src/worker/` and UI under `src/components/` / `src/pages/`.

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

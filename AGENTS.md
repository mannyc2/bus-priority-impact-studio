# AGENTS.md

Codex/agent instructions for Bus Priority Impact Studio.

## Read order

1. `CLAUDE.md`
2. `knowledge/index.md`
3. `knowledge/wiki/project/overview.md`
4. `knowledge/wiki/project/managed_services_options.md`
5. `knowledge/wiki/engineering/package_structure.md`
6. `knowledge/wiki/engineering/testing_standards.md`

## Architecture decision

The MVP is TypeScript-only and Bun-first for local install, scripts, and package tests.

Use:

- Cloudflare Workers Static Assets + Worker API for the public app.
- Cloudflare D1 for small, precomputed serving tables.
- Cloudflare R2 for static/generated artifacts such as GeoJSON, route briefs, and source snapshots.
- Bun-run local TypeScript pipeline jobs for heavy source probing, geospatial construction, hotspot scoring, and D1 seed/artifact generation.

Do not add pnpm, Python, FastAPI, hosted Postgres/PostGIS, or a VPS unless a concrete requirement forces it and the decision is recorded in `docs/decisions/` plus `knowledge/log.md`.

## Package dependency rules

Allowed import direction:

```text
apps/web              -> packages/domain, packages/db
packages/db           -> packages/domain
packages/analytics    -> packages/domain, packages/sources
packages/sources      -> packages/domain
tools/pipeline        -> packages/domain, packages/sources, packages/analytics, packages/db
```

Forbidden:

- `packages/*` importing from `apps/*`.
- Public request handlers importing pipeline-only code.
- `packages/domain` importing from any other local package.
- Application code depending on files inside `knowledge/` for runtime behavior.

## Barrel export rules

- Package root barrels such as `packages/*/src/index.ts` are allowed only as small public API surfaces.
- Do not use `export * from ...` or namespace re-exports from package barrels.
- Re-export explicit named values and keep type exports separate with `export type`.
- Do not re-export modules with top-level side effects, live network/filesystem work, or heavyweight optional dependencies. Add a focused subpath export instead when a feature grows large enough to be imported directly.
- In app and Worker code, import only the named symbols needed; do not namespace-import whole packages.

## Test placement rules

- Do not put `*.test.ts`, `*.spec.ts`, or Worker harness files under production `src/` trees.
- Package and pipeline tests live in sibling `test/` directories, such as `packages/domain/test/` or `tools/pipeline/test/`.
- Worker runtime tests live under `apps/web/test/` and run through the Cloudflare Vitest pool.
- Cross-cutting architecture and repo-boundary tests live under root `tests/harness/`.

## Where things go

- UI components and route pages: `apps/web/src/`
- Worker request handlers: `apps/web/src/worker/`
- Shared pure types and scoring rules: `packages/domain/src/`
- Source adapters for MTA/Socrata/NYC DOT APIs: `packages/sources/src/`
- Deterministic transforms and metrics: `packages/analytics/src/`
- D1 schema, migrations, and repositories: `packages/db/`
- Local data jobs and CLI commands: `tools/pipeline/src/`
- LLM wiki pages: `knowledge/wiki/`
- Source registry and source captures: `knowledge/raw/`
- Generated datasets/artifacts: `data/` with large files gitignored

## Verification

Before declaring implementation done, run the smallest relevant verification with Bun and the Cloudflare Worker harness where applicable. Prefer fixture-backed tests over live network tests. Do not fabricate test results.

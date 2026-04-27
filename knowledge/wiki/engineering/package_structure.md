---
title: Repo Package Structure
type: engineering
status: active
last_updated: 2026-04-27
owner: codex
source_count: 16
tags: [repo-structure, typescript, bun, zod, cloudflare, clean-architecture, d1, r2]
---

# Repo Package Structure

## Why this matters

The project needs to look like a credible software/data product, not a pile of scripts. The structure should let Codex build incrementally while preserving three boundaries:

1. **Public serving** should be cheap, simple, and read-heavy.
2. **Heavy analytics** should run outside public request paths.
3. **The LLM wiki** should support development without becoming application runtime state.

This page is the package-structure decision that follows [[wiki/project/managed_services_options|Managed services options]].

## What we know

### Facts from sources

- Cloudflare Workers supports TypeScript as a first-class language and can generate Worker/env types through Wrangler.
- Cloudflare Workers Static Assets can serve built HTML/CSS/JS/image assets, and Cloudflare documents a React + Vite setup that combines a React SPA with a Worker API.
- Cloudflare's Vite plugin runs Worker code inside `workerd` during development, which keeps local behavior close to production.
- D1 is Cloudflare's serverless SQL database and is accessed from Workers through D1 bindings and prepared statements.
- R2 can be bound to Workers so Worker code can read/write objects directly.
- Cron Triggers run a Worker `scheduled()` handler on a cron expression, which is suitable for small periodic jobs but not for heavy analytics backfills.
- Bun workspaces are defined in the root `package.json`, support `workspace:*` dependencies, support `--filter` for workspace-scoped scripts, and support dependency catalogs for shared versions.
- DuckDB has a Node client path, including a newer Node "Neo" client described as Promise-native and TypeScript-oriented; the older Node client is documented as deprecated.
- DuckDB's spatial extension provides geospatial processing functions after `INSTALL spatial; LOAD spatial;`, and Turf is a JavaScript spatial-analysis library that runs in browser or Node and works with GeoJSON.

### Inferences for this project

- The MVP does **not** require Python. Source probing, Socrata fetches, static GTFS/GeoJSON handling, route score computation, artifact generation, D1 seed generation, and the public app can all be written in TypeScript.
- D1 should be treated as the **serving database**, not the analytics warehouse. Its job is to serve compact read models and artifact metadata.
- Heavy geospatial work should run locally through `tools/pipeline`, using TypeScript plus SQL/DuckDB/Turf as needed. The public Worker should only read precomputed outputs.
- Hosted Postgres/PostGIS and Python are later escalation tools, not day-one dependencies.

## Evaluation criteria

The package layout should:

- Keep `apps/web` small and deployable.
- Keep domain logic independent of Cloudflare, D1, R2, React, and Node-specific APIs.
- Keep source fetching and analytics out of public request handlers.
- Make it obvious where Codex should put new code.
- Avoid abstractions that are not yet needed.
- Keep the LLM wiki accessible but outside the runtime app tree.
- Support a clean migration from local-only analytics to managed Postgres/PostGIS later.

## Decision

Use a **TypeScript-only Bun workspace monorepo** for the MVP.

Bun is the local developer toolchain for install, scripts, workspace filtering, and fast fixture tests. It is **not** the deployed Worker runtime: Cloudflare Workers still run in `workerd`, and Wrangler remains the Cloudflare CLI.

```text
bus-priority-impact-studio/
  CLAUDE.md
  AGENTS.md
  README.md
  package.json
  bunfig.toml
  tsconfig.typecheck.json
  biome.jsonc
  tsconfig.base.json

  apps/
    web/

  packages/
    domain/
    sources/
    analytics/
    db/

  tools/
    pipeline/

  data/
    raw/
    working/
    artifacts/
    fixtures/

  knowledge/
    AGENTS.md
    index.md
    log.md
    raw/
    wiki/

  docs/
    architecture/
    decisions/
```

## Package responsibilities

| Path | Package | Responsibility | Should import | Should not import |
|---|---|---|---|---|
| `apps/web` | `@bp/web` | React/Vite UI and Cloudflare Worker API | `@bp/domain`, `@bp/db` | `@bp/analytics`, `@bp/sources`, `tools/*`, `knowledge/*` |
| `packages/domain` | `@bp/domain` | Pure domain types, metric names, score input/output shapes, small pure functions | nothing local | Cloudflare, React, D1, R2, filesystem, network |
| `packages/sources` | `@bp/sources` | Socrata/MTA/NYC DOT adapters, source metadata probes, raw DTO parsing | `@bp/domain` | UI, D1 repositories, route scoring |
| `packages/analytics` | `@bp/analytics` | Deterministic transforms, hotspot scoring, route score computation, ACE impact calculations | `@bp/domain`, `@bp/sources` | React, Worker handlers |
| `packages/db` | `@bp/db` | D1/SQLite schema, migrations, repository functions, serving read models | `@bp/domain` | source fetchers, heavy analytics |
| `tools/pipeline` | `@bp/pipeline` | Local CLI for probes, fetches, transforms, artifact builds, D1 seed generation | all packages | public request handlers |
| `knowledge` | none | LLM-maintained wiki and raw source notes | none at runtime | app runtime imports |
| `data` | none | Local generated data and test fixtures | none | committed large datasets |

## Dependency rule

Allowed import direction:

```text
apps/web              -> packages/domain, packages/db
packages/db           -> packages/domain
packages/analytics    -> packages/domain, packages/sources
packages/sources      -> packages/domain
tools/pipeline        -> packages/domain, packages/sources, packages/analytics, packages/db
```

Forbidden:

```text
packages/*            -> apps/*
apps/web              -> tools/pipeline
apps/web              -> packages/analytics
apps/web              -> packages/sources
packages/domain       -> any local package
runtime app code      -> knowledge/*
```

## Barrel export rule

Package root `src/index.ts` files may exist as small public API barrels, but they should stay explicit and side-effect free so bundlers can shake unused code.

Rules:

- Use explicit named re-exports only.
- Use `export type` for type-only exports.
- Do not use `export * from ...` or namespace re-exports from package barrels.
- Do not re-export modules with top-level side effects, live network/filesystem work, or heavyweight optional dependencies.
- If a package grows a large or optional feature area, expose a focused package subpath instead of routing every consumer through the root barrel.
- Application and Worker code should import only the named symbols it needs, not namespace-import whole local packages.

## Why not Python for the MVP

Python is useful for data work, but it is not required here yet.

The MVP can be built with:

- TypeScript `fetch` for source probes and public-data downloads.
- DuckDB SQL or DuckDB's Node client for local analytical joins and rollups.
- DuckDB spatial extension and/or Turf for local geospatial transforms.
- D1/SQLite for compact serving tables.
- R2/static artifacts for larger GeoJSON and route-brief payloads.
- React + Vite + Worker API for the web app.

The simplest MVP is therefore one language, one package manager, one test toolchain, and one deployable app boundary.

## When Python becomes justified

Add Python only if a concrete task fails or becomes materially more complex in TypeScript. Document the decision in `docs/decisions/` first.

Concrete triggers:

- Route-shape/timepoint line-slicing proves significantly simpler or more reliable with GeoPandas/Shapely than with DuckDB spatial/Turf.
- ACE impact evaluation needs established statistical tooling such as notebook-based model diagnostics.
- A data source requires mature Python-only tooling.
- A collaborator explicitly needs notebook workflows.

If Python is added, isolate it under:

```text
tools/research-python/
```

Do not make Python required for `apps/web`, `packages/*`, or the core MVP demo.

## Where the LLM wiki goes

The wiki should live under `knowledge/`, not repo root.

```text
knowledge/
  AGENTS.md
  README.md
  index.md
  log.md
  raw/
    source_manifest.yaml
    metadata/
    notes/
    assets/
  wiki/
    project/
    data/
    engineering/
    analysis/
    templates/
```

Root should contain only project operational entrypoints and agent instructions. The old wiki root files move as follows:

| Old path | New path | Reason |
|---|---|---|
| `index.md` | `knowledge/index.md` | Wiki navigation, not repo navigation |
| `log.md` | `knowledge/log.md` | Wiki/project activity log |
| `raw/` | `knowledge/raw/` | Source registry and source captures |
| `wiki/` | `knowledge/wiki/` | LLM-maintained synthesis pages |
| `docs/codex_start_prompt.md` | `knowledge/docs/codex_start_prompt.md` | Wiki-specific agent prompt |
| `scripts/*.py` | removed from MVP blueprint | Replaced by TypeScript pipeline commands |
| `requirements-suggested.txt` | removed from MVP blueprint | No Python dependency for MVP |

Actual downloaded datasets should not live in `knowledge/raw/`. They should live in gitignored `data/raw/`, with small committed fixtures under `data/fixtures/`.

## Recommended serving data split

| Data kind | Store | Reason |
|---|---|---|
| Route list, route metadata, source snapshots | D1 | Small, queryable read models |
| Route scorecards and top hotspot summaries | D1 | Fast public API reads |
| Large GeoJSON route/segment geometry | R2 or static artifact | Avoid bloating D1 and Worker responses |
| Generated route briefs | R2, with metadata in D1 | Larger payloads, easy versioning |
| Full source downloads | local `data/raw/` | Not needed by public app |
| Intermediate joins/rollups | local `data/working/` | Heavy compute should stay local |
| Wiki/search corpus | `knowledge/` and optional local index | Not runtime-critical for MVP |

## Minimal initial package implementation

Start with this order:

1. `packages/domain`: define route IDs, direction IDs, month type, metric names, and scorecard types.
2. `packages/sources`: implement source manifest loader and one Socrata metadata probe.
3. `tools/pipeline`: add `sources probe` command that writes `knowledge/raw/metadata/*.json`.
4. `packages/db`: add D1 migrations for compact route scorecard tables.
5. `packages/analytics`: add one deterministic hotspot builder using fixture data.
6. `apps/web`: add route scorecard page reading from D1 and route geometry artifact from R2/static path.

## What should stay local even if hosting is managed

- Schema probing.
- Historical backfills.
- Geospatial route-segment construction.
- Hotspot scoring.
- ACE before/after analysis.
- D1 seed generation.
- Large source downloads.
- Experiment notebooks or one-off diagnostics, if added later.

## What actually forces hosted Postgres/PostGIS

Postgres/PostGIS is not needed for the first public demo. It becomes useful when:

- The public app needs dynamic geospatial queries rather than precomputed maps.
- Multiple analysts need shared query access to intermediate datasets.
- D1 table size or SQLite limitations become painful.
- We need pgvector/PostGIS in the same managed database for search + spatial workflows.
- Local-only data processing blocks regular automated refreshes.

Preferred escalation: Neon Postgres/PostGIS before VPS, based on the managed-services memo.

## What actually forces a VPS

A VPS is still not required for the MVP. Concrete triggers:

- Always-on Bus Time collection with persistent scheduling beyond simple cron.
- Long-running production jobs that exceed Workers/Cron/D1 practical limits.
- Need for custom OS-level daemons, GDAL/system binaries, or stateful services.
- Predictable flat-cost compute becomes materially cheaper than managed services.
- Managed-service limits block a required workflow and Postgres/PostGIS alone is insufficient.

## Caveats

- TypeScript-only is a product-engineering simplification, not a claim that TypeScript is best for every data-analysis task.
- DuckDB Node "Neo" is newer than the older deprecated Node client; Codex should verify current installation details before implementation.
- D1 should not be used as the main analytics warehouse.
- R2 artifacts need a stable naming/versioning scheme before public links are relied on.
- Keep network-dependent tests separate from fixture-backed unit tests.

## Open questions

- Should the public MVP use plain React SPA routing or React Router? Default: plain React until routing becomes painful.
- Should maps use MapLibre, Leaflet, or deck.gl? Default: choose the smallest library that can render the first route hotspot map.
- Should D1 seed generation use SQL files, Wrangler import, or API-based writes? Default: SQL files until limits force a change.
- Should document/wiki search be static local search first or Cloudflare Vectorize? Default: local/static first.

## Sources

- Cloudflare Workers TypeScript docs — https://developers.cloudflare.com/workers/languages/typescript/ — verified_at: 2026-04-26
- Cloudflare Workers Static Assets docs — https://developers.cloudflare.com/workers/static-assets/ — verified_at: 2026-04-26
- Cloudflare React + Vite guide — https://developers.cloudflare.com/workers/framework-guides/web-apps/react/ — verified_at: 2026-04-26
- Cloudflare Vite plugin docs — https://developers.cloudflare.com/workers/vite-plugin/ — verified_at: 2026-04-26
- Cloudflare D1 Worker Binding API — https://developers.cloudflare.com/d1/worker-api/ — verified_at: 2026-04-26
- Cloudflare R2 Workers API docs — https://developers.cloudflare.com/r2/api/workers/workers-api-usage/ — verified_at: 2026-04-26
- Cloudflare Workers Cron Triggers docs — https://developers.cloudflare.com/workers/configuration/cron-triggers/ — verified_at: 2026-04-26
- Bun workspaces docs — https://bun.sh/docs/pm/workspaces — verified_at: 2026-04-27
- Bun test runner docs — https://bun.sh/docs/test — verified_at: 2026-04-27
- Bun bunfig docs — https://bun.sh/docs/runtime/bunfig — verified_at: 2026-04-27
- Zod 4 metadata and registries docs — https://zod.dev/metadata — verified_at: 2026-04-27
- Zod 4 JSON Schema docs — https://zod.dev/json-schema — verified_at: 2026-04-27
- Cloudflare Workers Vitest integration docs — https://developers.cloudflare.com/workers/testing/vitest-integration/ — verified_at: 2026-04-27
- DuckDB Node Neo Client blog/docs — https://duckdb.org/2024/12/18/duckdb-node-neo-client — verified_at: 2026-04-26
- DuckDB Spatial Extension docs — https://duckdb.org/docs/current/core_extensions/spatial/overview — verified_at: 2026-04-26
- Turf.js introduction — https://turfjs.org/docs/intro — verified_at: 2026-04-26

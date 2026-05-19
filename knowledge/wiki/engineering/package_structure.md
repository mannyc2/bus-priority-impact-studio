---
title: Repo Package Structure
type: engineering
status: active
last_updated: 2026-04-28
owner: codex
source_count: 28
tags: [repo-structure, typescript, bun, zod, drizzle, cloudflare, clean-architecture, d1, postgres, hyperdrive, r2]
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
| `packages/sources` | `@bp/sources` | Socrata/MTA/NYC DOT/Census adapters, source metadata probe adapters, raw DTO parsing | `@bp/domain` | UI, D1 repositories, route scoring, local artifact writes |
| `packages/analytics` | `@bp/analytics` | Deterministic transforms, hotspot scoring, route score computation, ACE impact calculations | `@bp/domain`, `@bp/sources` | React, Worker handlers |
| `packages/db` | `@bp/db` | D1 serving schema/queries plus local SQLite pipeline schema, migrations, and repositories | `@bp/domain` | source fetchers, heavy analytics |
| `tools/pipeline` | `@bp/pipeline` | Local CLI for probes, fetches, transforms, artifact builds, D1 seed generation | all packages | public request handlers |
| `knowledge` | none | LLM-maintained wiki and raw source notes | none at runtime | app runtime imports |
| `data` | none | Local generated data and test fixtures | none | committed large datasets |

## Pipeline internal layout

`tools/pipeline` is an orchestration package, not the place where all data logic should accumulate.

Use this internal structure:

```text
tools/pipeline/src/
  cli.ts
  checks/
  jobs/
    build/
    export/
    ingest/
    sources/
  lib/
  source-manifest.ts
```

Rules:

- `src/cli.ts` owns command dispatch for package scripts.
- `src/jobs/ingest/` owns source-backed local ingest jobs and raw/working artifact writes.
- `src/jobs/build/` owns offline artifact builders over local working data.
- `src/jobs/export/` owns D1 seed/export/verification jobs.
- `src/jobs/sources/` owns source manifest listing/probing job orchestration and writes to `knowledge/raw/metadata`; probe adapters live in `@bp/sources/probes`.
- `src/checks/` owns repo/project guard checks used by root scripts.
- `src/lib/` owns small shared pipeline helpers for paths, dates, route artifact keys, and JSON writes.
- Pure scoring/transformation logic should continue moving into `packages/analytics`, source transport/parsing into `packages/sources`, and D1 serialization/repository behavior into `packages/db` when a job module starts carrying package-level responsibility.

## Sources package layout

`@bp/sources` owns external-source access and raw DTO normalization. It exposes focused subpaths so pipeline jobs can import a specific adapter without pulling a broad root API:

```text
packages/sources/src/
  census/
  mta/
  nyc-dot/
  probes/
  registry/
  socrata/
```

Rules:

- `socrata/` owns URL construction, paging/retry behavior, and `SocrataClient`.
- `registry/` owns manifest parsing and typed source lookup helpers such as `getSocrataSource`.
- `mta/`, `nyc-dot/`, and `census/` own raw row schemas and normalized source DTOs.
- `probes/` owns reusable source probe adapters. Pipeline code decides where probe outputs are written.

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

## Type discipline

Type locations follow package boundaries:

| Type kind | Location | Rule |
|---|---|---|
| Domain types and Zod schemas | `packages/domain` | Route IDs, months, scorecards, citations, metric names, and public contracts should be Zod schemas with exported `z.output` types. |
| DB row types | `packages/db` | Serialize/deserialize through domain schemas. |
| Source DTO schemas | `packages/sources` | Raw external data parsed before reaching analytics or UI. |
| Component props | component file | Unexported local `Props` type only. If reused across components, move to `@bp/domain`. |
| Fixtures | `apps/web/src/fixtures/` | Import domain schemas and parse through them. Do not duplicate domain shapes. |

Rules:

- Prefer `type` over `interface` unless declaration merging is intentionally needed.
- No `any`. Use `unknown` at boundaries, then parse with Zod.
- Use `.strict()` for Zod object contracts crossing boundaries.
- Use `.readonly()` for immutable public read models.
- Use branded schemas for stable identifiers and codecs for boundary normalization (e.g. route ID casing/spacing).

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
| Route brief summaries, artifact metadata, comparison ranks | D1 | Compact precomputed serving rows with explicit repository helpers |
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

## Local spatialite (allowed; not hosted PostGIS)

`tools/pipeline` loads `mod_spatialite` into the local SQLite database for the
route ⇄ LION corridor join and for nearest-segment snapping during address
geocoding. Spatialite is offline, local-only, and never reaches D1 or the
Worker — the output is a flat `local_route_lion_link` lookup table. See
ADR `docs/decisions/0007-spatialite-for-local-geo-joins.md`. Local dev
requires `libsqlite3-mod-spatialite` (apt/brew/nix).

This does **not** count as hosted PostGIS — it is a SQLite extension and
stays inside the pipeline package.

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

## Drizzle adoption package update — 2026-04-27

### Current branch state

`packages/db` already owns the right conceptual responsibilities. It now has Drizzle infrastructure plus explicit repository helpers:

- `src/d1/schema.ts` declares the D1 Drizzle table mirror.
- `migrations/d1/` contains generated Drizzle SQL for the current D1 serving schema.
- `src/d1/validation.ts` exposes Drizzle-Zod row schemas for DB boundary validation.
- `wrangler.d1.jsonc` points Wrangler D1 migrations at `migrations/d1`.
- the local D1 export path reads the Drizzle migration journal instead of duplicating table SQL strings.
- `@bp/db/d1`, `@bp/db/pg`, and `@bp/db/shared` are explicit subpath surfaces.
- D1 serving query modules live under `src/d1/queries/` and read through Drizzle query builders.
- D1 seed SQL literal helpers live under `src/d1/seed/`.
- the legacy `D1DatabaseLike` prepared-statement compatibility layer has been removed.
- Drizzle dependencies are scoped to `packages/db`.

This should change in a small, staged way rather than rewriting the whole data layer at once.

### Recommended `packages/db` structure after adopting Drizzle

```text
packages/db/
  drizzle.config.d1.ts
  drizzle.config.pg.ts                 # add only when Postgres is introduced
  migrations/
    d1/
    pg/                                # add only when Postgres is introduced
  src/
    d1/
      client.ts
      schema.ts
      validation.ts
      queries/
        route-scorecard.ts
        route-brief-summaries.ts
        route-artifacts.ts
        route-batch-status.ts
        route-build-plan.ts
        route-readiness.ts
        source-statuses.ts
      seed/
        sql-literals.ts
    pg/
      schema.ts                        # future canonical DB grows here
    shared/
      constants.ts                     # enum/value constants only
    index.ts
```

### Responsibility split

| Package | After Drizzle adoption |
|---|---|
| `packages/domain` | Business/domain Zod schemas, branded IDs, metric semantics, public API contracts. No Drizzle imports. |
| `packages/db` | Drizzle schemas, migrations, row validation helpers, repository SQL construction, local/D1/PG clients, D1 seed/import helpers. |
| `packages/sources` | Public source clients and source DTO validation. No Drizzle imports. |
| `packages/analytics` | Pure deterministic transforms over source/domain inputs. No Drizzle table imports. |
| `tools/pipeline` | Orchestrates source fetches, analytics, artifact builds, D1 exports, and future Postgres backfills through `@bp/db` repository/export APIs. |
| `apps/web` | Calls Worker handlers and `@bp/db` public repository functions only. It must not import Drizzle tables directly. |

### Dependency boundary rules

- `@bp/db` may import `@bp/domain`, `drizzle-orm`, Drizzle drivers, Drizzle validation helpers, and `zod`.
- `@bp/domain` must not import `@bp/db`, Drizzle, Cloudflare types, or source clients.
- `@bp/analytics` should not import Drizzle tables; it produces typed domain/read-model outputs.
- `tools/pipeline` may call `@bp/db/d1/seed` helpers while seed generation still writes SQL files; it should not own schema DDL or Worker read queries.
- `tools/pipeline` may call `@bp/db/local` repositories for canonical local build state.
- `apps/web/src/worker` may create a D1 Drizzle client and call repository functions; it must not run source ingestion or analytics.
- `apps/web` must not import `@bp/db/local`.

### Stable migration path for package code

1. Keep Drizzle dependencies only in `packages/db`, not every package.
2. Keep D1 seed/export DML separate from DDL; DDL comes from generated Drizzle migrations.
3. Keep Drizzle-generated select/insert schemas beside DB schema code.
4. Keep the existing repository function names and external types to avoid app churn.
5. Keep serving query implementation under `src/d1/queries`; add `src/pg/queries` only when Postgres is actually introduced.
6. Keep product-queryable arrays/objects in child tables, not JSON text columns.
7. Add `src/client/pg-hyperdrive.ts` only when the project actually adds Postgres/Hyperdrive.

### Proposed scripts

Do not add these until dependencies are added, but use these names to keep the repo predictable:

```json
{
  "db:d1:generate": "bun --filter @bp/db db:generate:d1",
  "db:d1:migrate:local": "bun --filter @bp/db db:migrate:d1:local",
  "db:d1:migrate:remote": "bun --filter @bp/db db:migrate:d1:remote",
  "db:pg:generate": "drizzle-kit generate --config packages/db/drizzle.config.pg.ts"
}
```

### Type discipline

- Export table-derived row types from `packages/db`, not from arbitrary repository/component files.
- Keep component-local `Props` types unexported.
- Export domain/public contracts from `packages/domain`.
- Use Drizzle-generated row schemas for database boundary validation, then convert to domain/public shapes through mappers.

## Sources added in this update

- Zod package on npm — https://www.npmjs.com/package/zod — verified_at: 2026-04-27. npm search result reported latest version `4.3.6`; the checked-in `bun.lock` already resolves root `zod` to `zod@4.3.6`.
- Zod 4 release notes — https://zod.dev/v4 — verified_at: 2026-04-27. Documents Zod 4 as stable.
- Zod 4 JSON Schema docs — https://zod.dev/json-schema — verified_at: 2026-04-27. Documents native JSON Schema conversion.
- Drizzle Cloudflare D1 docs — https://orm.drizzle.team/docs/connect-cloudflare-d1 — verified_at: 2026-04-27. Documents `drizzle-orm/d1`, D1 Worker bindings, and Bun install commands.
- Drizzle zod docs — https://orm.drizzle.team/docs/zod — verified_at: 2026-04-27. Documents `createSelectSchema`, `createInsertSchema`, `createUpdateSchema`, `createSchemaFactory`, `zod/v4`, and the `drizzle-zod` deprecation note starting with `drizzle-orm@1.0.0-beta.15`.
- Drizzle config docs — https://orm.drizzle.team/docs/drizzle-config-file — verified_at: 2026-04-27. Documents dialect-specific config, schema glob support, `out`, and `d1-http` driver.
- Drizzle Kit overview — https://orm.drizzle.team/docs/kit-overview — verified_at: 2026-04-27. Documents generating/running SQL migrations and Bun command support.
- Drizzle D1 HTTP API guide — https://orm.drizzle.team/docs/guides/d1-http-with-drizzle-kit — verified_at: 2026-04-27. Documents Drizzle Kit `d1-http` migration/push/introspect/studio configuration.
- Cloudflare D1 overview — https://developers.cloudflare.com/d1/ — verified_at: 2026-04-27. Documents D1 as horizontally scaled across many smaller 10 GB databases.
- Cloudflare D1 limits — https://developers.cloudflare.com/d1/platform/limits/ — verified_at: 2026-04-27. Documents 500 MB Free / 10 GB Paid max database size, 100-column table limit, 2 MB max row/string/BLOB, 100 bound parameters, 100 KB max SQL statement, and 30-second max query duration.
- Cloudflare D1 pricing — https://developers.cloudflare.com/d1/platform/pricing/ — verified_at: 2026-04-27. Documents rows-read/rows-written pricing, free/paid included storage, and storage billing including tables and indexes.
- Cloudflare D1 Worker Binding API — https://developers.cloudflare.com/d1/worker-api/ — verified_at: 2026-04-27. Documents prepared statements and typed row results.
- Cloudflare D1 migrations — https://developers.cloudflare.com/d1/reference/migrations/ — verified_at: 2026-04-27. Documents SQL migration files, create/list/apply, and `d1_migrations`.
- Cloudflare D1 Wrangler commands — https://developers.cloudflare.com/d1/wrangler-commands/ — verified_at: 2026-04-27. Documents `wrangler d1 migrations create/list/apply`.
- Cloudflare D1 local development — https://developers.cloudflare.com/d1/best-practices/local-development/ — verified_at: 2026-04-27. Documents local D1 development, `preview_database_id`, and local migrations.
- Cloudflare Hyperdrive Drizzle example — https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/ — verified_at: 2026-04-27. Documents `pg`, `drizzle-orm/node-postgres`, `nodejs_compat`, Hyperdrive binding, and per-request client connection.
- Cloudflare Hyperdrive PostgreSQL docs — https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/ — verified_at: 2026-04-27. Documents PostgreSQL/PostgreSQL-compatible database support and ORM/driver support.
- Cloudflare Workers limits — https://developers.cloudflare.com/workers/platform/limits/ — verified_at: 2026-04-27. Documents default 30-second CPU limit on Paid Workers and optional increase to 5 minutes.
- Cloudflare Queues limits — https://developers.cloudflare.com/queues/platform/limits/ — verified_at: 2026-04-27. Documents 15-minute wall-time limit for Cron triggers and Queue consumers.

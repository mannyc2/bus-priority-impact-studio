---
title: Sources Adapter Cutover Plan
type: engineering
status: active
last_updated: 2026-06-05
owner: codex
source_count: 3
tags: [sources, socrata, soda3, ingestion, package-boundaries, pipeline-v2]
---

# Sources Adapter Cutover Plan

## Decision

`@bp/sources` will become an internal source adapter SDK and anti-corruption layer for ingestion.
It should expose focused source clients, adapters, registry contracts, GTFS Realtime parsing, and
probe contracts. It should not expose a root barrel, compatibility aliases, pipeline orchestration,
DB writes, artifact writes, env/secrets loading, app runtime helpers, or analytics/scoring logic.

The cutover is intentionally hard: remove the root `@bp/sources` export and broad family exports,
then update all consumers in the same branch.

## SODA3 decision

SODA3 is the only first-class Socrata path for the cutover.

Use:

```text
POST https://<domain>/api/v3/views/<dataset_id>/query.json
POST https://<domain>/api/v3/views/<dataset_id>/export.<format>
```

Do not keep public SODA2 compatibility APIs such as:

```text
GET https://<domain>/resource/<dataset_id>.json
GET https://<domain>/resource/<dataset_id>.csv
```

The official Socrata endpoint documentation says every SODA API dataset is addressed by a common
`/api/v3/views/IDENTIFIER/query.json` endpoint, with version 3.0 changing the old
`/resource/IDENTIFIER.json` form to the v3 query endpoint. It also separates `/query` from
`/export` and prefers POST for query requests. The SODA3 query documentation lists `query`, `page`,
`parameters`, `timeout`, and `orderingSpecifier` support, and documents `/export` for export
formats such as CSV. Socrata's SODA3 support article says SODA3 is now the default API in the
platform UI while SODA 2.1 remains supported.

No current project source requires a SODA2-only endpoint as a policy exception. The source manifest
currently has 31 `socrata_dataset` records, all identified by normal four-by-four Socrata dataset
IDs on `data.ny.gov` or `data.cityofnewyork.us`. Treat any future SODA3 failure as a source-specific
probe/integration defect to fix or document, not as permission to preserve a general SODA2 client.

### SODA3 authentication and app tokens

SODA3 requests must identify the caller through user authentication or an app token. Public-dataset
pipeline requests should pass the Socrata app token through the `X-App-Token` header. Secret lookup
stays in `tools/pipeline-v2` or repo env wrappers; `@bp/sources` only accepts explicit tokens or
headers via client options.

Do not print app tokens. Do not use `printenv` as the readiness check.

### Backfill and byte ranges

The project already has a SODA3 export path in
`tools/pipeline-v2/src/commands/ingest/socrata-partitioned-csv-snapshot.ts`, which posts SoQL
queries to `/api/v3/views/<dataset_id>/export.csv`.

Byte-range/resumable export support is a project requirement, but current official docs reviewed
for this decision do not clearly document byte-range semantics. Therefore the hard cutover must
prove byte-range behavior with fixture-backed tests and an opt-in integration probe before any
large archival backfill depends on resume behavior. The SODA3 client should still expose raw
`Response` objects for exports so pipeline code can inspect headers, stream bytes, and resume when
the provider supports it.

## Source manifest target

The `socrata_dataset` manifest schema should stop carrying SODA2-derived `api_json` as the primary
row endpoint. Target shape:

```ts
export const SocrataManifestSourceSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("socrata_dataset"),
    domain: z.string().min(1),
    datasetId: SocrataDatasetIdSchema,
    title: z.string().min(1).optional(),
    priority: SourcePrioritySchema,
    status: ManifestStatusSchema,
    api: z.literal("soda3"),
    defaultAccess: z
      .object({
        kind: z.enum(["query", "export"]),
        format: z.enum(["json", "csv", "geojson"]).optional(),
      })
      .strict(),
    backfill: z
      .object({
        kind: z.literal("soda3_export"),
        format: z.enum(["csv", "json", "geojson"]),
        supportsByteRange: z.boolean(),
        recommendedChunkBytes: z.number().int().positive().optional(),
        defaultQuery: z.string().min(1).optional(),
        orderingSpecifier: z.enum(["total", "discard"]).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
```

The current YAML field name `dataset_id` may be normalized to `datasetId` during this cutover, but
the important decision is that source records declare `api: "soda3"` and default/query/export
behavior instead of embedding old row URLs.

## Package target

Target public identity:

```text
@bp/sources/core
@bp/sources/registry
@bp/sources/registry/loaders/bun-yaml
@bp/sources/clients/socrata
@bp/sources/clients/socrata/catalog
@bp/sources/clients/socrata/soql
@bp/sources/clients/geoclient
@bp/sources/clients/census
@bp/sources/gtfs-realtime
@bp/sources/adapters/mta/*
@bp/sources/adapters/nyc-dot/*
@bp/sources/adapters/nyc-open-data/*
@bp/sources/adapters/census/acs-equity
@bp/sources/adapters/noaa/ghcn-daily
@bp/sources/probes
@bp/sources/probes/transports/bun-curl
```

Forbidden public imports after the cutover:

```text
@bp/sources
@bp/sources/mta
@bp/sources/socrata
@bp/sources/nyc-public-data
@bp/sources/nyc-geoclient
```

## Current blockers found on 2026-06-05

- `packages/sources/src/socrata/client.ts` still builds `/resource/<dataset_id>.json` URLs and
  exposes `fetchSocrataRowsPage`, `fetchAllSocrataRows`, `SocrataRowsQuery`, and
  `SocrataClient.fromSource()`.
- `packages/sources/src/registry/manifest.ts` requires `api_json`, `columns_json`, and `rows_csv`
  fields, with `api_json` pointing at old `/resource/...json` endpoints in
  `knowledge/raw/source_manifest.yaml`.
- `knowledge/raw/source_manifest.yaml` has 31 `socrata_dataset` records with old `api_json` values.
- `packages/studio-api/src/source-refresh.ts` directly reads
  `https://data.ny.gov/resource/kufs-yh3x.json`. This must move to a D1/local source-refresh
  projection or a SODA3 client path without importing `@bp/sources` into Studio runtime.
- `tools/pipeline-v2` has many broad `@bp/sources` imports that must be replaced with focused
  subpaths.
- Source and pipeline tests still assert old `/resource/...` URLs.

## Non-goals

- Do not add a compatibility layer for SODA2.
- Do not move normalized source DTOs into `@bp/domain`.
- Do not introduce Python, pnpm, hosted Postgres/PostGIS, FastAPI, or a VPS for this cutover.
- Do not move app token lookup into `@bp/sources`.
- Do not add live network tests to default pre-push checks.

## Implementation gates

Before the hard cutover can be declared done:

1. `@bp/sources` has no root export and no broad family exports.
2. SODA3 query/export helpers cover JSON, CSV, and GeoJSON needs for current Socrata sources.
3. SODA2 public helpers are deleted, not deprecated.
4. Manifest records declare SODA3 access behavior instead of old row URLs.
5. `packages/studio-api` and `apps/web` have zero `@bp/sources` imports and zero direct
   `/resource/...` Socrata row reads.
6. All `tools/pipeline-v2` imports use focused subpaths.
7. Architecture tests fail on root imports, forbidden exports, env reads, Bun leakage, and forbidden
   package imports.
8. Fixture-backed tests prove SODA3 query/export construction, app-token headers, paging, retry,
   timeout behavior, and export response handling.
9. Byte-range export behavior has a recorded fixture/integration proof before resumable backfills
   rely on it.

Verification:

```bash
bun --filter @bp/sources typecheck
bun --filter @bp/sources test
bun run check:web-architecture
bun run check:types
```

## Sources

- https://dev.socrata.com/docs/endpoints — verified_at: 2026-06-05
- https://dev.socrata.com/docs/queries/ — verified_at: 2026-06-05
- https://dev.socrata.com/docs/app-tokens — verified_at: 2026-06-05
- https://support.socrata.com/hc/en-us/articles/34730618169623-SODA3-API — verified_at: 2026-06-05

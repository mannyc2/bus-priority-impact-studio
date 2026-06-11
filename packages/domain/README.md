# packages/domain

Pure domain layer. The canonical home for schemas, branded types, and data
contracts shared across the pipeline, serving API, and web app.

## Responsibilities

- Branded primitives and shared types such as `RouteId`, `DirectionId`,
  `IsoMonth`, `MetricName`, `NycBorough`, and `SourceCitation`.
- Public serving contracts: route cards/profiles, hotspot lists, compare,
  release status, and map GeoJSON artifacts.
- Internal pipeline contracts: detector findings, review/promotion artifacts,
  document research/extraction surfaces, and intervention records.
- Studio analyst contracts: brief drafts, read models, findings, identity,
  snapshots, and the projection helpers that build them.
- A Zod schema registry plus a `toProjectJsonSchema` helper that emits
  draft-2020-12 JSON Schema for the worker and tooling.
- Pure helpers (projections, intervention assembly, operational-date parsing)
  that derive read models without touching the network, filesystem, D1, R2, or
  Worker bindings.

## Module map

The package has no root entrypoint. Import the explicit subpath you need:

| Subpath | Contents |
| --- | --- |
| `@bp/domain/primitives` | Branded IDs, metric/borough enums, coordinate + citation schemas. |
| `@bp/domain/routes` | Public route/hotspot/compare API responses and the data-quality envelope. |
| `@bp/domain/maps` | GeoJSON segment features and map-manifest contracts. |
| `@bp/domain/findings` | Detector candidate, evidence, coverage, review-packet, promotion, and agent-proposal contracts. |
| `@bp/domain/documents/*` | Document discovery, structured extraction, research surfaces, candidates, intervention records, and operational-date helpers. |
| `@bp/domain/studio` | Studio analyst contracts and the `buildStudio*` projection helpers (also re-split into `studio/briefs`, `studio/routes`, `studio/findings`, `studio/identity`, `studio/snapshots`, `studio/release`, …). |
| `@bp/domain/schema-registry` | `registerProjectSchema` and the shared `projectSchemaRegistry`. |
| `@bp/domain/json-schema` | Precomputed JSON Schemas and `toProjectJsonSchema`. |

## Schema registry

Every schema is registered with `registerProjectSchema`, which attaches
metadata (`id`, `title`, `description`, `stability: "draft" | "stable"`) and
adds it to a shared registry. `toProjectJsonSchema` serializes any registered
schema to draft-2020-12 JSON Schema for runtime validation and codegen.

## Rules

- No runtime dependency on other local packages; `zod` is the only dependency.
- No Cloudflare types, source-fetching code, or database queries (those belong
  in `packages/sources`, `packages/db`, and `tools/pipeline-v2`).
- No root entrypoint: consumers import explicit `@bp/domain/*` subpaths.
- Barrels list exports explicitly; no wildcard re-exports.

These invariants are enforced by `test/package-shape.test.ts`.

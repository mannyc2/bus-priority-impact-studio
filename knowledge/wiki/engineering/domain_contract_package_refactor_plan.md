---
title: Domain Contract Package Refactor Plan
type: engineering
status: implemented
last_updated: 2026-07-05
owner: codex
source_count: 0
tags: [domain, contracts, package-boundaries, effect-schema, schema-registry, subpath-exports]
---

# Domain Contract Package Refactor Plan

This is the repo-native plan for refactoring `@bp/domain` into a contract package with explicit
consumer-oriented subpaths.

It is based on an uploaded static review of the current `packages/domain` shape, then audited
against this repo's package-structure, barrel-export, TypeScript-only, Bun-first, and test-placement
rules.

## Implementation Status

Implemented on 2026-06-06.

- Removed the root `@bp/domain` export and root TypeScript path alias.
- Deleted the old domain root barrel and monolith compatibility files:
  `src/index.ts`, `src/schemas.ts`, top-level `document-*.ts`, and top-level `studio-*.ts`.
- Moved primitives, routes, maps, findings, document contracts, Studio contracts, schema-registry
  helpers, and JSON Schema generation into explicit source modules/subpaths.
- Added nested document exports such as `@bp/domain/documents/discovery` and nested Studio exports
  such as `@bp/domain/studio/routes`, `@bp/domain/studio/briefs`, and
  `@bp/domain/studio/identity`.
- Moved Studio OpenAPI document assembly to `@bp/studio-api/contracts/openapi`.
- Migrated repo consumers away from `@bp/domain`, `@bp/domain/documents`, and `@bp/domain/studio`
  aggregate imports.
- Added package-shape tests for no root export, explicit subpath resolution, explicit barrels, and
  removed-root import enforcement.

## Verdict

Adopt the plan's main direction, but change the migration shape.

`@bp/domain` is currently carrying too much through one source-root entrypoint. The package should
become a focused set of domain contract subpaths: primitives, route contracts, map contracts,
finding contracts, document contracts, Studio contracts, schema registry helpers, and generated
JSON Schema helpers.

The uploaded plan is strongest where it identifies broad root exports, large historical files,
duplicated document concepts, and import-time JSON Schema generation as the main fault lines.

The plan needs repo-specific corrections:

- Do not use `export *` in `src/index.ts` or other package barrels. Barrels must use explicit named
  re-exports and `export type` for type-only surfaces.
- Treat `dist`, `publint`, `attw`, and npm-style package validation as a later optional packaging
  lane. This repo is a private Bun workspace, and sibling packages currently expose source subpaths
  through `types`/`bun` conditions.
- Do not mark `"sideEffects": false` until schema registration no longer depends on module
  evaluation order.
- Do not keep broad compatibility barrels indefinitely. A short migration overlap is acceptable,
  but completion requires old monolith files and broad root imports to be gone or deliberately
  reduced to a tiny explicit root surface.
- Move generated JSON Schema and OpenAPI ownership deliberately. Domain should own Effect Schema contracts and
  generic JSON Schema conversion; Studio route/path/OpenAPI ownership belongs with the Studio API
  contract layer.

## Current Evidence

The uploaded review's measurements match the live repo closely:

| Surface | Current state |
|---|---|
| `packages/domain/src/index.ts` | 914 lines of explicit re-exports across documents, Studio, findings, maps, health, registry helpers, projections, OpenAPI, and JSON Schema constants. |
| `packages/domain/src/schemas.ts` | 2,407 lines mixing primitives, route read models, maps, detector/finding contracts, signal features, and agent proposal artifacts. |
| `packages/domain/src/studio-schemas.ts` | 1,551 lines mixing Studio data models, response contracts, compatibility parsing, public read projections, and JSON Schema constants. |
| `packages/domain/src/document-research-surfaces.ts` | 1,220 lines mixing schemas with validation/submission functions. |
| `packages/domain/src/studio-brief-draft-schemas.ts` | 909 lines mixing draft/authoring request and response contracts with JSON Schema constants. |
| `packages/domain/package.json` | Exposes only `"." : "./src/index.ts"`. |
| `packages/domain/tsconfig.json` | Includes only `src/**/*.ts`; package tests are not typechecked by this package's `tsc` invocation. |
| Consumer imports | Many packages import dozens of unrelated symbols from `@bp/domain`, which makes root shrinkage a cross-repo migration. |

The package already satisfies the most important architecture boundary: it does not import other
local packages or infrastructure. The refactor should preserve that.

## Goals

- Make `@bp/domain` a pure contract package with small, explicit source subpaths.
- Reduce root import cost and accidental public API exposure.
- Make consumer intent visible in import paths.
- Separate runtime Effect Schema contracts from generated JSON Schema/OpenAPI artifacts.
- Split large historical files into owned contract areas without changing behavior.
- Add package-shape tests before high-blast-radius moves.
- Preserve the TypeScript-only, Bun-first architecture.

## Non-goals

- Do not add Python, Postgres/PostGIS, a VPS, or hosted runtime dependencies.
- Do not move source DTOs from `@bp/sources` into `@bp/domain`.
- Do not move DB row schemas or Drizzle validation into `@bp/domain`.
- Do not move analytics kernels, detector scoring implementation, source fetching, filesystem work,
  D1/R2 access, Worker handlers, or React code into `@bp/domain`.
- Do not publish `@bp/domain` to npm as part of the first refactor.
- Do not make a package-root barrel that re-exports documents, Studio authoring, generated JSON
  Schema, OpenAPI, and projection helpers.

## Target Public Shape

Prefer explicit subpaths:

```ts
import { RouteIdCodec, RouteIdSchema } from "@bp/domain/primitives";
import { RouteScorecardSchema } from "@bp/domain/routes";
import { MapManifestResponseSchema } from "@bp/domain/maps";
import { FindingCandidateSchema } from "@bp/domain/findings";
import { DocumentDiscoveryExtractionSchema } from "@bp/domain/documents/discovery";
import { StructuredDocumentExtractionSchema } from "@bp/domain/documents/structured-extraction";
import { StudioRouteSchema } from "@bp/domain/studio/routes";
import { StudioBriefDraftSchema } from "@bp/domain/studio/briefs";
import { toProjectJsonSchema } from "@bp/domain/json-schema";
```

The root `@bp/domain` import is a migration question, not a default right. The final state should be
one of:

1. No root export, matching the hard-cutover style now used by `@bp/sources` and `@bp/studio-api`.
2. A tiny explicit root surface for the most stable primitives only, such as `RouteIdCodec`,
   `RouteIdSchema`, `DirectionIdSchema`, and `IsoMonthSchema`.

The decision should be made after consumer imports have moved to subpaths. Until then, keep the root
only as a temporary compatibility surface and track its shrinkage as a completion gate.

## Target Source Layout

```text
packages/domain/src/
  index.ts

  primitives/
    ids.ts
    dates.ts
    geography.ts
    metrics.ts
    citations.ts
    index.ts

  routes/
    health.ts
    scorecard.ts
    cards.ts
    profile.ts
    compare.ts
    quality.ts
    status.ts
    index.ts

  maps/
    geometry.ts
    route-segments.ts
    manifest.ts
    index.ts

  findings/
    detectors.ts
    evidence.ts
    candidates.ts
    review-packets.ts
    promotion.ts
    reviewer-decisions.ts
    promoted-findings.ts
    audit.ts
    signal-features.ts
    agent-finding-proposals.ts
    agent-brief-proposals.ts
    index.ts

  documents/
    shared/
      lifecycle.ts
      evidence.ts
      dates.ts
      entities.ts
      metrics.ts
      routes.ts
      treatments.ts
      index.ts
    candidates/
      draft.ts
      persisted.ts
      tool-schema.ts
      index.ts
    discovery/
      candidates.ts
      extraction.ts
      index.ts
    structured-extraction/
      source.ts
      pages.ts
      evidence-spans.ts
      entities.ts
      claims.ts
      tables.ts
      interventions.ts
      service-changes.ts
      output.ts
      index.ts
    research-surfaces/
      schema.ts
      validation.ts
      submission.ts
      index.ts
    derived-surfaces/
      surfaces.ts
      manifest.ts
      index.ts
    intervention-records/
      draft.ts
      persisted.ts
      tool-response.ts
      index.ts
    operational-date/
      normalize.ts
      parse.ts
      classify.ts
      schema.ts
      index.ts
    index.ts

  studio/
    shared/
      quality.ts
      provenance.ts
      index.ts
    routes/
      route.ts
      segment.ts
      history.ts
      snapshot.ts
      responses.ts
      index.ts
    findings/
      finding.ts
      cards.ts
      responses.ts
      index.ts
    briefs/
      model.ts
      blocks.ts
      refs.ts
      draft-api.ts
      comments-api.ts
      review-api.ts
      agent-runs.ts
      agent-proposals.ts
      versions-api.ts
      publishing-api.ts
      responses.ts
      index.ts
    identity/
      auth.ts
      users.ts
      alerts.ts
      public-comments.ts
      index.ts
    rum.ts
    index.ts

  schema-registry/
    define-schema.ts
    manifest.ts
    index.ts

  json-schema/
    core.ts
    routes.ts
    maps.ts
    findings.ts
    documents.ts
    studio.ts
    index.ts
```

This structure is a target map, not a command to create every file before there is content. Split
large files by active behavior and consumer boundaries.

## Export Map Direction

Use source subpath exports first, matching current private workspace packages:

```json
{
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "bun": "./src/index.ts"
    },
    "./primitives": {
      "types": "./src/primitives/index.ts",
      "bun": "./src/primitives/index.ts"
    },
    "./routes": {
      "types": "./src/routes/index.ts",
      "bun": "./src/routes/index.ts"
    },
    "./maps": {
      "types": "./src/maps/index.ts",
      "bun": "./src/maps/index.ts"
    },
    "./findings": {
      "types": "./src/findings/index.ts",
      "bun": "./src/findings/index.ts"
    },
    "./documents/discovery": {
      "types": "./src/documents/discovery/index.ts",
      "bun": "./src/documents/discovery/index.ts"
    },
    "./documents/structured-extraction": {
      "types": "./src/documents/structured-extraction/index.ts",
      "bun": "./src/documents/structured-extraction/index.ts"
    },
    "./studio/routes": {
      "types": "./src/studio/routes/index.ts",
      "bun": "./src/studio/routes/index.ts"
    },
    "./studio/briefs": {
      "types": "./src/studio/briefs/index.ts",
      "bun": "./src/studio/briefs/index.ts"
    },
    "./schema-registry": {
      "types": "./src/schema-registry/index.ts",
      "bun": "./src/schema-registry/index.ts"
    },
    "./json-schema": {
      "types": "./src/json-schema/index.ts",
      "bun": "./src/json-schema/index.ts"
    }
  }
}
```

The `"."` export above is temporary unless the final decision is to keep a tiny primitives-only
root. Do not add wildcard subpath exports until there is a concrete need; explicit exports make the
public API reviewable.

Add `dist`, declaration output, `publint`, `attw`, or API Extractor only after source-subpath
imports are stable or if this private package becomes a distributed package.

## Schema Registry Direction

Keep Effect Schema contracts as production contracts. Improve the registry in place:

- Rename `registerProjectSchema` to `defineProjectSchema` only if the migration is worth the churn.
- Add explicit metadata fields such as `audience`, `owner`, and `version` when they are consumed by
  JSON Schema/OpenAPI generation or docs.
- Keep schema metadata on the schema, but avoid relying on "import root, then registry contains
  every schema" behavior.
- Build explicit schema manifests by domain area, such as route schemas, Studio schemas, and Tier 2
  document schemas.

Do not mark the package side-effect-free until registry population is explicit and tests prove
generated schema manifests do not depend on module import order.

## JSON Schema And OpenAPI Direction

Core schema modules should export Effect Schema contracts and decoded/encoded types. They should
not also compute many JSON Schema constants at import time.

Move JSON Schema generation to `src/json-schema/*`:

```ts
export function toProjectJsonSchema(schema: z.ZodType): unknown;
export const routeJsonSchemas: Record<string, unknown>;
export const studioJsonSchemas: Record<string, unknown>;
export const documentJsonSchemas: Record<string, unknown>;
```

OpenAPI route/path ownership should move out of `@bp/domain` as part of the Studio API contract
work. `@bp/domain` can provide the schemas; `@bp/studio-api/contracts` should own route registry,
path metadata, and final OpenAPI assembly.

## Migration Sequence

### Phase 0 - Inventory and Freeze

Create a current public surface report before moving files.

- Inventory every root `@bp/domain` import and classify it by target subpath.
- Inventory every exported symbol from `packages/domain/src/index.ts`.
- Inventory JSON Schema constants and current consumers.
- Decide whether root will be deleted or shrunk after migration.

Verification:

```bash
rg -n 'from "@bp/domain"' packages apps tools tests
rg -n 'JsonSchema|toProjectJsonSchema' packages/domain/src packages/studio-api apps/web tools/pipeline-v2
bun --filter @bp/domain test
bun run check:types
```

### Phase 1 - Safety Rails

Add tests and scans before changing the module shape.

- Add `packages/domain/tsconfig.test.json` so package tests are typechecked.
- Add a package export smoke test for allowed subpaths and forbidden legacy paths.
- Add or extend a boundary harness check that package barrels do not use `export *` or namespace
  re-exports.
- Add a root surface snapshot or allowlist test so the root can only shrink intentionally.
- Add a scan that fails if core schema files compute new `...JsonSchema` constants outside
  `src/json-schema`.

Verification:

```bash
bun --filter @bp/domain typecheck
bun --filter @bp/domain test
bun run check:web-architecture
```

### Phase 2 - Primitives, Routes, Maps, And Findings

Split `src/schemas.ts` into the first source subpaths.

- Move branded IDs, month/date primitives, geography primitives, citations, and metric enums into
  `src/primitives`.
- Move health/status/route-card/profile/compare/scorecard contracts into `src/routes`.
- Move route-segment geometry and map manifest contracts into `src/maps`.
- Move detector/finding/review/promotion/signal/agent proposal contracts into `src/findings`.
- Update `@bp/sources`, `@bp/analytics`, `@bp/db`, `@bp/applied-research`, and pipeline imports to
  focused subpaths.
- Keep any temporary `src/schemas.ts` compatibility file private to the branch and remove it before
  completion.

Verification:

```bash
bun --filter @bp/domain test
bun --filter @bp/sources test
bun --filter @bp/analytics test
bun --filter @bp/db test
bun run check:types
```

### Phase 3 - Studio Contracts

Split `src/studio-schemas.ts`, `src/studio-brief-draft-schemas.ts`,
`src/studio-identity-schemas.ts`, `src/studio-rum-schemas.ts`, and related Studio contract files
into `src/studio/*`.

- Keep public read contracts separate from authoring/draft contracts.
- Keep compatibility preprocessors as named parser helpers rather than mixing legacy wire input with
  clean output contracts.
- Move Studio JSON Schema constants to `src/json-schema/studio.ts`.
- Move Studio OpenAPI document assembly to `@bp/studio-api/contracts` when the route registry is
  ready.

Verification:

```bash
bun --filter @bp/domain test
bun --filter @bp/studio-api test
bun --filter @bp/web test:worker
bun run check:types
```

### Phase 4 - Document Contracts

Split Tier 2 document modules into `src/documents/*`.

- Extract shared lifecycle/date/status/authority/evidence concepts into `documents/shared`.
- Keep document discovery, structured extraction, candidates, research surfaces, derived surfaces,
  intervention records, and operational-date assertions as separate subpaths.
- Split validation and submission functions from schema-only modules.
- Update pipeline-v2 Tier 2 commands to import only the document subpath they need.

Verification:

```bash
bun --filter @bp/domain test
bun --filter @bp/pipeline-v2 test
bun run check:types
```

### Phase 5 - Root Cutover

Remove broad root imports after subpaths are stable.

- Update all consumers to subpaths.
- Delete `src/schemas.ts`, `src/studio-schemas.ts`, and other monolith compatibility files after
  all imports have moved.
- Shrink `src/index.ts` to the final root decision: no root export or tiny primitives-only root.
- Remove `@bp/domain` root from `tsconfig.base.json` if the final state has no root export.

Verification:

```bash
rg -n 'from "@bp/domain"' packages apps tools tests
bun run check:types
bun run test:unit
bun run test:worker
```

### Phase 6 - Optional Package Distribution Lane

Only if `@bp/domain` needs build artifacts or package-manager validation beyond the private Bun
workspace:

- Add `tsconfig.build.json` with declaration output.
- Export `dist` under `import`/`types` conditions.
- Add `publint`, `attw --pack`, and optionally API Extractor.
- Consider `"sideEffects": false` only after schema registry/import-order behavior is explicit.

## Completion Gates

The refactor is complete when all of these are true:

- `packages/domain/package.json` exposes explicit subpaths for each contract area.
- `@bp/domain` root is absent or explicitly limited to a tiny primitives-only surface.
- `packages/domain/src/index.ts` no longer re-exports Studio, document, OpenAPI, projection, JSON
  Schema, or validation/submission internals.
- Package public barrels use only explicit named re-exports and `export type`.
- Core schema modules do not compute JSON Schema constants at import time.
- Studio OpenAPI assembly is owned by `@bp/studio-api/contracts`, not by `@bp/domain`.
- Package tests are typechecked.
- Consumer imports show intent through subpaths.
- `packages/domain` still imports no local packages, infrastructure, Worker types, React,
  filesystem, or network code.
- The smallest relevant verification commands pass, and any broader check failures are documented
  as unrelated pre-existing failures.

## Risks

| Risk | Mitigation |
|---|---|
| Root import fanout makes a hard cutover noisy. | Move by domain area, keep a temporary root allowlist, and delete compatibility only after consumers move. |
| Symbol name collisions become hidden by broad barrels. | Prefer subpath imports and package export smoke tests. |
| Import-time registry population breaks JSON Schema generation. | Replace implicit registry dependence with explicit schema manifests. |
| JSON Schema generation stays mixed into runtime schema files. | Add a scan and move generated artifacts under `src/json-schema`. |
| Studio OpenAPI ownership remains split. | Coordinate with the `@bp/studio-api` contract registry and move route/path assembly there. |
| Document shared enum extraction changes behavior. | Use fixture-backed Tier 2 tests and keep output schemas stable during extraction. |
| Optional npm packaging work distracts from the real repo problem. | Keep source-subpath exports as the first implementation target. |

## Immediate Work Package

The first implementation slice should be small and mechanical:

1. Add `packages/domain/tsconfig.test.json`.
2. Add a domain package-shape test that checks the current root allowlist and future subpath import
   behavior.
3. Add explicit `@bp/domain/primitives`, `@bp/domain/routes`, and `@bp/domain/maps` source subpaths.
4. Move only the low-risk primitives, route response contracts, and map contracts.
5. Update the narrow set of consumers that only need those symbols.
6. Run `bun --filter @bp/domain test`, `bun --filter @bp/domain typecheck`, and `bun run check:types`.

This gives the refactor a safe first proof without touching Studio authoring or Tier 2 document
contracts in the first branch.

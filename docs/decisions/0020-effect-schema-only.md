# 0020 - Effect Schema-only runtime schema layer

Date: 2026-07-05

## Status

Accepted. Supersedes the Zod runtime-contract clause of ADR 0001 and extends the Effect direction in ADR 0019.

## Context

Plans 040 through 044 removed the last first-party Zod users while moving the pipeline CLI/runtime and remaining source/pipeline contracts onto the installed Effect v4 line. The migration changed the facts behind the earlier "keep Zod" decision:

- `@liche/core` was removed, so the old CLI parser no longer re-exported Zod-backed argument helpers.
- The schema audit found no hard-to-port Zod APIs in first-party code: the usage was mostly strict objects, enums, coercions, passthrough objects, brands, one codec, and one registry.
- Plan 042 made the browser client schema-free at runtime, so a replacement schema library does not belong in the initial browser bundle.
- Plan 041 removed `@bp/db`'s Zod dependency; D1/local row types now come from Drizzle projections plus focused writer/source boundary checks.
- Plan 043 moved `@bp/domain` to an Effect Schema-backed compatibility surface, so public/domain contracts no longer require Zod.

Keeping both schema libraries would recreate a permanent conversion layer without adding product behavior.

## Decision

Effect Schema, from the installed Effect v4 package line, is the only first-party runtime schema layer for the repo.

Use Effect Schema for:

- domain/public contracts in `packages/domain`;
- source DTO and manifest decoding in `packages/sources`;
- pipeline artifact, command-output, and boundary JSON decoding in `tools/pipeline-v2`;
- schema-tagged expected errors where an Effect boundary needs structured failure data;
- generated JSON Schema/OpenAPI inputs that come from the domain schema registry.

Do not import `zod` or `zod/*` from first-party app, package, tool, script, or test code. The architecture harness enforces this with a module-specifier guard.

The browser app remains runtime-schema-free by design. It consumes typed API clients and server-validated responses instead of parsing large payloads on the main thread.

`@bp/db` remains schema-library-free. It owns Drizzle schemas, migrations, repositories, and seed/export helpers; row types come from Drizzle table/projection types, then mappers convert them to domain/public shapes.

## Consequences

- Schema questions should start from ADR 0020, `knowledge/wiki/engineering/package_structure.md`, and the package-local contract modules.
- New boundary contracts should use Effect Schema idioms: strict/closed object contracts, branded identifiers, tagged variants for real unions, transformations/codecs for representation changes, and metadata where contracts feed documentation.
- Existing Zod-shaped compatibility helpers are migration scaffolding over Effect Schema, not permission to reintroduce Zod.
- Third-party packages that ship unused Zod metadata or optional subpaths should not be imported through those Zod surfaces. Temporary metadata-clean package pins may exist only to keep the lockfile free of unused Zod installs until upstream packages drop those edges.
- Historical ADRs and wiki pages can mention Zod as history, but current doctrine should not tell new code to use it.

## Alternatives considered

- Keep Zod for source and domain contracts while using Effect for command runtime. Rejected because it preserves a two-schema-library seam after the browser and DB had already moved away from runtime Zod.
- Use Effect Schema in the browser as a direct Zod replacement. Rejected by Plan 042: the browser client should avoid runtime response parsing for large serving payloads.
- Move DB validation to an Effect/Drizzle bridge. Rejected for the current Effect v4 line because no maintained Drizzle bridge exists; Drizzle-derived types plus focused boundary checks are simpler and already implemented.

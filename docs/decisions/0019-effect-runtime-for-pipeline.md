# 0019 - Effect runtime for pipeline commands

Date: 2026-06-30

## Status

Accepted.

## Context

The pipeline command tree has grown around Bun scripts, Liche command parsing, and ad hoc runtime
boundaries. That kept the MVP TypeScript-only and easy to run locally, but the command layer now
mixes several concerns:

- local SQLite resource ownership through middleware/context variables;
- Promise-returning command handlers with untyped thrown errors;
- implicit service dependencies that are hard to test without command source assertions;
- old applied-research vocabulary in places where the product direction is now simpler aggregation,
  timelines, route evidence, and serving artifacts.

The product direction is a hard cutover: keep the TypeScript/Bun pipeline, delete research-only
surfaces, and use Effect to simplify service boundaries, typed errors, and runtime ownership across
pipeline commands.

## Decision

Adopt Effect as the runtime and service boundary for pipeline commands.

Use:

- `effect@4.0.0-beta.*` and aligned `@effect/*` packages through the workspace catalog;
- `Context.Service` for command-facing services;
- `Layer` for runtime construction and resource ownership;
- `ManagedRuntime` at command/framework boundaries;
- `Schema.TaggedErrorClass` for expected command and infrastructure failures;
- named `Effect.fn` workflows for operations that should be observable and testable.

The first slices move `route build-plan`, `route reliability-baseline`,
`route observed-reliability`, `route readiness`, and `route equity-context` onto:

```text
Liche command parser
  -> Effect runtime boundary
  -> route command service
  -> scoped LocalDbConnection layer
  -> existing deterministic local-db implementation
```

`route build-plan` keeps a dedicated service because it ranks the next build batch. The compact
baseline/observed/readiness/equity commands share `RouteLocalDbService`, which keeps command
handlers thin without creating one service file per small local-DB operation. Route intervention
evaluation now uses that same route service because it is still a route-local DB product with a
document-assertion input boundary. `route brief-model` owns enough route-slice artifact I/O and
local DB projection work to justify a focused `RouteBriefModelService`.

The same grouping rule applies to `BuildLocalDbService` for compact build commands such as context
events, observed headways, route/LION linking, and LION geometry indexing. Spatial setup is now an
explicit local DB layer option rather than a hidden command middleware side effect.

The Studio route-data and compact utility commands use a shared `LocalDbCommandService` rather than
one method per artifact command. This keeps the hard-cutover product slice small while still routing
`studio route-speed-spine`, `studio route-speed-history`, `studio route-speed-spines`,
`studio route-speed-histories`, `studio route-treatment-summary`, `export
route-speed-history-coverage-index`, `verify d1`, `check spatialite`, `build
route-shape-geometry-index`, `build context-event-route-touches`, and `build
parking-violation-matches`, plus the spatial `geocode *` command family through the scoped DB layer
and schema-tagged `PipelineLocalDbCommandError`. Read-only and spatialite setup are explicit layer
options for commands that need them.

The same generic boundary now covers the local-DB-backed `ingest *` command slice: route catalog,
route coverage, route trends, route segment speeds, route hourly ridership, customer journey
metrics, GTFS-RT snapshot parsing, weather, equity context, bus lanes, ACE sources, DOT traffic and
permit sources, LION, NYPD collisions, parking violations, and 311 service requests. Their exported
`run*Ingest` functions remain Promise-based adapters for existing fixture tests and source-specific
transforms, while command entrypoints own DB resources through Effect layers.

The follow-up cutover removed the same middleware/context dependency from the remaining command
families: recovered Bus Observatory imports, GTFS-RT collection/status/preflight, route ridership
backfill, map artifacts, corridor modeling, D1 export, pipeline v1 check/audit/finalize, and Studio
or source coverage audits. Read-only audit commands preserve their old behavior with
`localDbOptions: { readonly: true }`. As of this pass, command source files no longer import
`withLocalDb` or `localDbFromCtx`.

The cleanup pass also removed the old Liche local-DB middleware helpers from `lib/local-db.ts` and
moved the remaining command-owned direct SQLite opens (clean DB checks, Studio release coverage and
geometry helpers, and the docs Tier 2 local DB wrapper) through `runLocalDbCommandBoundary`. Command
source files now avoid direct `openLocalPipelineDb` calls; only the Effect local DB layer owns that
resource boundary.

Older generic local-DB task migrations were then collapsed from explicit
`runPipelineEffect(runLocalDbCommand(...), makeLocalDbCommandLayer(...))` wiring to
`runLocalDbCommandBoundary`. Dedicated route/build services still use `runPipelineEffect` because
they provide service-specific layers; generic one-off DB tasks use the compact helper.

As of this slice, every `tools/pipeline-v2/src/commands/route/*` command runs through an Effect
runtime boundary instead of `withLocalDb` / `localDbFromCtx`.

File I/O is moving behind the same service boundary. `PipelineFileSystemService` wraps the Bun
FileSystem and Path layers and reports `PipelineFileSystemError` for expected text/JSON read and
write failures. It now covers publish artifact-key manifest reads, D1 replay SQL reads, Studio SEO
artifact writes, D1 verification summary writes, the shared JSON helper, raw source snapshot writes,
route-list JSON reads, and MTA-wiki canonical JSONL reads. The public helper APIs can stay
Promise-shaped while their filesystem work is owned by an Effect runtime boundary.

The file service treats decoded JSON as `unknown` at the Effect boundary. Legacy Promise helpers
can keep typed overloads for compatibility, but service-facing code must narrow or decode raw JSON
before reading fields. Route intervention document-anchor reads and route brief slice writes now use
that filesystem boundary instead of direct `Bun.file` / `Bun.write` calls from Effect service
modules.

Command parsing does not need to move to `effect/unstable/cli` in the same change. The CLI framework
can migrate after the runtime/service pattern has replaced enough context-variable middleware to make
the parser migration smaller and mechanical.

## Consequences

- Pipeline business logic should return `Effect` where it needs services, typed failures, retries,
  spans, or resource ownership.
- Promise-returning command handlers should become thin runtime boundaries, not the place where
  SQLite clients, file IO, provider clients, or retry policies are constructed directly.
- Local DB access should move behind a scoped service layer as commands are touched.
- Tests should prefer service-layer injection over source-string assertions when behavior is involved.
- Existing pure package helpers do not need to import Effect just because a command boundary uses it.
- Liche can remain during the migration; replacing it with Effect CLI is a later simplification step,
  not a prerequisite for adopting Effect runtime semantics.

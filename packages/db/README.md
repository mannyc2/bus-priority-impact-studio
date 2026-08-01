# packages/db

Serving database layer.

## Responsibilities

- D1/SQLite schema and migrations.
- Local SQLite pipeline schema, migrations, and repositories.
- Drizzle query modules used by the Worker API and local export verification.
- Seed/import helpers that load precomputed outputs into D1.
- Table contracts for R2 artifact keys.
- Route catalog and route/month coverage serving rows for network-level inventory.

## Storage Ownership

`@bp/db` owns storage truth, not analytical interpretation.

Use this package when the job is to define, migrate, read, or write a table safely:

- Drizzle table definitions for local SQLite and D1.
- Runtime local migrations from `migrations-drizzle/local`.
- Local repository helpers for canonical source, derived, projection, review, and coverage tables.
- D1 query helpers, seed SQL generation, and small writer-boundary seed-row validators.
- Atomic `replace*` writes, chunk-safe inserts, and small table-level invariants.

Do not put panel eligibility policy, detector judgment, causal/statistical modeling, source fetches,
or "is this data product complete enough?" decisions here. Pure policy belongs in
`@bp/analytics`; source fetching and stateful joins belong in `tools/pipeline-v2`.

## Rules

- D1 is a serving database, not the analytics warehouse.
- `@bp/db/local` is canonical local pipeline/build state, not a public app dependency.
- Store compact, precomputed read models.
- Large GeoJSON/JSON artifacts should live in R2 or `data/artifacts`, with D1 storing keys and metadata.
- Keep Drizzle schemas and migrations in this package; expose explicit repository helpers to callers.
- D1 read queries trust rows produced by our own migrations/pipeline and derive row types from
  Drizzle projections; do not add per-read zod/drizzle-zod validation back to `packages/db`.
- Keep D1 query modules under `src/d1/queries`; do not add root-level repository files.
- `migrations/d1` and `wrangler.d1.jsonc` are the frozen clean-bootstrap
  history. Production's legacy ledger diverged after the reviewed Plan 095/097
  recovery, so it must never be replayed against the populated database.
- Forward production D1 SQL lives in `migrations/d1-v2/active`, is checksummed
  by `migrations/d1-v2/active/checksums.json`, and is applied only through
  `wrangler.d1-v2.jsonc` into `bp_d1_migrations_v2`. Local live-schema tests
  apply legacy and then v2; production applies only v2. An applied v2 file is
  immutable and every correction is a new migration.
- `migrations/d1-v2/0000_atomic_serving_release.sql` and its sibling checksum
  manifest retain the exact oversized first attempt. Cloudflare rolled that
  failed migration back; Wrangler discovers only the mechanically equivalent
  bounded files under `active/` through `migrations_pattern`.
- `migrations-drizzle/d1` remains the full-schema Drizzle snapshot cache, not
  an application ledger. Snapshot-only catch-up entries may have no-op
  `migration.sql` files when live Wrangler SQL already applied the change.
- After changing D1 schema SQL, run `bun --filter @bp/db db:generate:d1` to
  prove Drizzle's snapshot cache is current. If it proposes SQL for already-live
  D1 objects, add a reviewed snapshot-only catch-up and rerun until generation
  reports no schema changes. Remote D1 apply remains operator-run.
- Local `replace*` helpers (`@bp/db/local`) must wrap their delete+insert sequence in a single
  synchronous `db.transaction((tx) => …)` and push multi-row inserts through `insertAll(tx, …)`
  so writes stay atomic and never exceed SQLite's bind-parameter limit. They are sync (return
  `void`); bun-sqlite is synchronous, so an `await` at the call site is a harmless no-op.
- Some local tables are intentionally repo-less/raw-only:
  `local_parking_violation_match` is a pipeline matching read model with custom
  fanout/evidence aggregation, while `local_lion_segment_geom` and `local_route_shape_geom` are
  SpatiaLite-backed companion tables whose geometry columns are added at runtime and stay opaque to
  Drizzle. Do not add generic CRUD helpers for these unless a concrete caller needs a typed read
  boundary; keep spatial SQL in the build/audit layer.

---
title: Drizzle Query Modernization Plan
type: engineering
status: archived
last_updated: 2026-06-02
owner: codex
source_count: 5
tags: [drizzle, d1, sqlite, zod, validation, query-style, migrations]
---

# Drizzle Query Modernization Plan

## Goal

Upgrade the repo to Drizzle 1.0 RC deliberately, then make Drizzle the default database layer for
D1 and local SQLite.

This plan covers four related decisions:

1. How to upgrade `drizzle-orm` and `drizzle-kit`.
2. How to use `drizzle-orm/zod` after the upgrade.
3. How tables, query builders, relational queries, and repositories should fit together.
4. Which raw SQL stays allowed.

## Current State

Facts from the 2026-05-31 repo inventory:

- The root catalog currently pins `drizzle-orm` to `0.45.2` and `drizzle-kit` to `0.31.10`.
- `drizzle-zod@0.8.3` is still installed only because `drizzle-orm@0.45.2` does not expose
  `drizzle-orm/zod`.
- `npm view` on 2026-05-31 reports:
  - `drizzle-orm` `latest = 0.45.2`, `beta = 1.0.0-beta.22`, `rc = 1.0.0-rc.3`;
  - `drizzle-kit` `latest = 0.31.10`, `beta = 1.0.0-beta.22`, `rc = 1.0.0-rc.3`.
- `packages/db/src/d1/schema.ts` has 31 Drizzle table definitions, but newer D1 migrations add
  write-side tables that are not mirrored yet: Studio drafts/history/idempotency, identity,
  sessions, roles, alerts, saved searches, and public comments.
- `packages/db/src/local/schema.ts` has 73 Drizzle table definitions and is the strongest existing
  model for the local pipeline DB.
- There are no current `db.query` or Drizzle relation-definition call sites, so Relational Queries
  v1-to-v2 is not an immediate code migration. RQB v2 is a future adoption decision.
- Existing D1 read modules mostly use Drizzle query builders. Raw D1 clusters are concentrated in
  `packages/db/src/d1/queries/identity.ts`,
  `packages/db/src/d1/queries/identity-surfaces.ts`, and
  `packages/db/src/d1/queries/studio-brief-drafts.ts`.
- `tools/pipeline-v2` still has direct `bun:sqlite` prepared statements for GTFS static ingest,
  route schedules, Bus Observatory imports, geocoding, route/LION linking, SpatiaLite joins,
  source/audit reports, and large aggregate builders.

## Upgrade Decision

Upgrade to Drizzle 1.0 RC, not just to the beta tag.

Implementation update, 2026-06-02: the official `rc` dist-tag still resolved to `1.0.0-rc.3` for
both `drizzle-orm` and `drizzle-kit`, so the repo now pins those exact versions in the Bun catalog.
`drizzle-zod` has been removed in favor of `drizzle-orm/zod`.

Before migration work, local SQLite and Miniflare D1/R2/cache state was backed up to:

```text
/home/cjpher/backups/bus-reliability-tracker/drizzle-modernization-20260602T185845Z
```

The archive contains 81 SQLite/sidecar files and is 164 GB.

At implementation time, verify the registry tags again with:

```bash
npm view drizzle-orm dist-tags --json
npm view drizzle-kit dist-tags --json
```

Then pin exact RC versions in the Bun catalog, rather than leaving moving npm tags in
`package.json`. If `rc` still points to `1.0.0-rc.3`, use that exact version for both packages. If
a newer official RC or stable `1.0.x` exists, record the exact versions in this page and
`knowledge/log.md` before editing the lockfile.

Do not use branch-style tags such as `rc4`, `sqlite-update`, or `ai` unless they become the
official `rc` or `latest` tag and their release notes are reviewed.

## Upgrade Slices

### Slice 0: Preflight

Read the Drizzle 1.0 RC upgrade page, beta release notes, RQB v2 migration page, and the GitHub
release notes for the exact version being installed.

Inventory local usage before editing:

```bash
rg -n "drizzle-zod|drizzle-orm/zod|db\\.query|db\\._query|relations\\(|defineRelations" packages apps tools tests
rg -n "D1Database|\\.prepare\\(|\\.query\\(|sql`" packages/db/src tools/pipeline-v2/src
```

Expected current result: no RQB usage, `drizzle-zod` only in `packages/db/src/d1/validation.ts`,
and raw D1 queries concentrated in identity/user-surface/Studio draft repositories.

Verification:

- no code edits yet;
- note any new findings in this page if the inventory changes.

### Slice 1: Dependency and Import Upgrade

Change the root Bun catalog:

- `drizzle-orm`: exact chosen `1.0.0-rc.x` or stable `1.0.x`;
- `drizzle-kit`: exact matching `1.0.0-rc.x` or stable `1.0.x`;
- remove `drizzle-zod` from the catalog and from `@bp/db` dependencies.

Change imports:

```ts
// before
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// after
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
```

Keep `zod` as the validation runtime dependency. Only use `createSchemaFactory` when we need a
specific project-wide option such as date coercion or an extended Zod instance.

Verification:

- `bun install`
- `bun --filter @bp/db test`
- `bun run check:types`

### Slice 2: Migration Format Upgrade

Run Drizzle Kit's migration-folder upgrade in a branch and inspect the diff before committing.

This repo has multiple migration roots:

- `packages/db/migrations/d1`
- `packages/db/migrations/local`
- future `packages/db/migrations/pg`

The Drizzle 1.0 RC docs say `drizzle-kit up` removes the old journal file and groups SQL files and
snapshots into separate migration folders. Because this repo also applies D1 migrations through
Wrangler, this is a hard gate: Cloudflare's `wrangler d1 migrations apply` must still discover and
apply the D1 SQL migrations, or the repo needs a clear split between Drizzle's migration metadata
and the flat Wrangler SQL migration directory.

Preferred sequence:

1. Run `bunx drizzle-kit up` for `packages/db` in a clean branch.
2. Inspect `migrations/d1` and `migrations/local`.
3. Run local migration smoke tests against disposable databases.
4. If Wrangler can no longer consume the upgraded `migrations/d1` layout, keep a flat
   Wrangler-compatible D1 SQL output path and record that as a deliberate Drizzle/D1 compromise.

Verification:

- `bun run db:local:migrate` against a disposable local SQLite DB;
- `bun run db:d1:migrate:local` against a disposable local D1 database;
- `bun --filter @bp/db db:generate:d1` produces no unexpected schema drift;
- `bun --filter @bp/db db:generate:local` produces no unexpected schema drift.

Do not run remote D1 migrations during this slice.

Implementation update, 2026-06-02: Drizzle 1.0 RC requires the new folder-per-migration format for
Drizzle generation and the Bun SQLite migrator, but Wrangler D1 migrations still need the flat SQL
folder. The repo therefore uses a deliberate split:

- `packages/db/migrations/d1` stays flat and Wrangler-compatible.
- `packages/db/migrations/local` stays as the historical flat local migration record.
- `packages/db/migrations-drizzle/d1` is the Drizzle-owned D1 generation folder.
- `packages/db/migrations-drizzle/local` is the Drizzle-owned local SQLite generation/migrator
  folder.

`packages/db/drizzle.config.d1.ts`, `packages/db/drizzle.config.local.ts`, and
`packages/db/src/local/migrate.ts` now point at `migrations-drizzle/**`. The D1 Wrangler config
continues to point at `./migrations/d1`. A local-only `wrangler d1 migrations apply` smoke passed;
remote D1 migrations were not run.

### Slice 3: Type and Driver Fixes

Update driver/client types only where TypeScript forces it.

Current clients:

- `packages/db/src/d1/client.ts` creates a `drizzle-orm/d1` client with `{ schema }`.
- `packages/db/src/local/client.ts` creates a `drizzle-orm/bun-sqlite` client with `{ schema }`.

Keep those simple until RQB v2 relations are actually introduced. If the RC's generic signatures
require relation generic arguments, update the exported `D1ServingDb` and `LocalPipelineDb` types in
one slice and avoid pushing those internals into app or pipeline code.

Verification:

- `bun --filter @bp/db typecheck`
- `bun run check:types`

## Table Policy

Every D1 table that exists in `packages/db/migrations/d1` should have a matching table definition
in `packages/db/src/d1/schema.ts`.

Every canonical local SQLite table that exists in `packages/db/migrations/local` should have a
matching table definition in `packages/db/src/local/schema.ts`.

Rules:

- Do not share table objects between D1 and local schemas.
- Share enum/value constants through `packages/db/src/shared/constants.ts` only when it reduces
  drift.
- Use camelCase TypeScript field names mapped to snake_case SQL column names.
- Export `$inferSelect` and `$inferInsert`-derived row types from `packages/db`, not from app code.
- Do not import table objects into `apps/web` components or route files.
- Do not put source-ingest or analytics-only tables in the public D1 schema.

Immediate D1 schema mirror backlog:

- `studio_brief_draft`
- `studio_brief_draft_claim`
- `studio_brief_review_comment`
- `studio_brief_write_idempotency`
- `studio_brief_history_event`
- `identity`
- `identity_session`
- `studio_actor_role`
- `alert`
- `saved_search`
- `public_comment`

Implementation update, 2026-06-02: the backlog tables above, plus the adjacent Studio block/ref,
agent proposal, version, and legacy actor/token tables from the D1 migration history, are now
mirrored in `packages/db/src/d1/schema.ts`. `db:generate:d1` reports no remaining schema drift
against the Drizzle-owned D1 snapshot folder.

Verification:

- generated D1 migration has no unexpected drops/recreates;
- `bun --filter @bp/db test`;
- D1 Worker tests for auth, drafts, and comments after those tables are queried through Drizzle.

## Zod Policy

After the upgrade, use `drizzle-orm/zod` for DB row schemas.

Where generated schemas belong:

- `packages/db/src/d1/validation.ts` for D1 serving/write-side tables;
- add `packages/db/src/local/validation.ts` only for local DB boundaries that ingest untrusted
  source/pipeline rows or read raw SQL projection rows;
- keep public API/domain schemas in `packages/domain`;
- keep source response schemas in `packages/sources`.

Use:

- `createSelectSchema(table)` for full table rows returned from DB boundaries;
- `createInsertSchema(table)` for values inserted after crossing a package/request/source boundary;
- `createUpdateSchema(table)` for user/API-driven patch payloads before building `db.update().set`;
- explicit Zod object schemas for partial selects, aggregate rows, joins with aliased columns, and
  raw SQL results.

JSON text columns should not each grow hand-rolled parsing. Add focused helpers for:

- `scopes_json`
- `payload_json`
- `query_json`
- `evidence_ids_json`
- `caveat_ids_json`
- Studio draft validation arrays

Generated DB schemas are not public API contracts. Parse DB rows, map to domain/public shapes, then
validate public responses with domain schemas where the response crosses the Worker boundary.

## Query Policy

Use Drizzle core query builders for ordinary database work:

- `db.select().from(...).where(...)`
- `db.insert(...).values(...)`
- `db.update(...).set(...).where(...)`
- `db.delete(...).where(...)`
- joins, filters, limits, ordering, and upserts

Repository boundaries:

- D1 Worker code should call `@bp/db/d1` repository functions.
- Pipeline commands should call `@bp/db/local` repositories for normal local SQLite persistence.
- `tools/pipeline-v2` may keep `OpenLocalPipelineDb.sqlite` access for SpatiaLite and measured bulk
  hot paths only.

Convert in this order:

1. D1 identity/session/role queries.
2. D1 alert/saved-search/public-comment queries.
3. D1 Studio draft/history/idempotency queries.
4. Pipeline GTFS static and route schedule DML.
5. Pipeline Bus Observatory import DML.
6. Pipeline geocode update/list helpers.
7. Pipeline source/audit count helpers where the query is not an aggregate-heavy report.

Keep exported repository function names stable unless a name is actively misleading.

## Relational Queries v2 Policy

Do not block the Drizzle 1.0 upgrade on RQB v2 adoption. The repo currently has no RQB v1 usage.

Use RQB v2 later where it makes nested read models clearer:

- route scorecard with citations and artifacts;
- Studio draft with claims, review comments, and history;
- identity with active operator role;
- route catalog with types and directions;
- local route/month read bundles used by repeated pipeline jobs.

When adopting RQB v2:

- define relations in `packages/db/src/d1/relations.ts` and/or
  `packages/db/src/local/relations.ts` with `defineRelations`;
- pass relations into the Drizzle client only after the table schemas compile cleanly on the RC;
- prefer `db.query` only for nested object assembly;
- keep explicit select builders for aggregate/reporting queries and public projections;
- do not use old RQB v1 imports from `drizzle-orm/_relations` unless a temporary compatibility
  slice explicitly requires it.

## Raw SQL Policy

Raw SQL is allowed for:

- migrations generated by Drizzle Kit or deliberate custom migrations;
- Wrangler-compatible D1 migration output if Drizzle's new migration structure cannot be consumed
  by Wrangler directly;
- SpatiaLite functions and spatial index joins;
- SQLite introspection such as `sqlite_master`;
- large aggregate queries, CTEs, window functions, recursive queries, or `EXPLAIN` work where
  Drizzle is less readable;
- measured bulk import hot paths;
- seed SQL literal generation while the D1 seed export path still emits SQL files.

When raw SQL remains:

- hide it behind a named repository/helper function;
- validate returned rows with explicit Zod schemas;
- add a short comment only when the raw SQL reason is not obvious.

## Guardrails

After the D1 conversion slices land, add an architecture test that blocks new
`D1Database.prepare()` calls under `packages/db/src/d1/queries/` unless the file is allowlisted.

Implementation update, 2026-06-02: the production-boundary harness now blocks all raw
`.prepare()` calls under `packages/db/src/d1/queries/`; the allowlist has been removed.
`identity.ts`, `identity-surfaces.ts`, and `studio-brief-agents.ts` now use Drizzle builders.
`studio-brief-drafts.ts` now accepts `D1ServingDb` and routes its legacy helper SQL through Drizzle
`sql` execution instead of direct `D1Database.prepare()`.

Implementation update, 2026-06-02: after reviewing the Drizzle docs for `db.batch()`,
transactions, dynamic query building, and the `sql` template, the draft repository was tightened
again. Simple draft CRUD and conditional updates now use Drizzle builders, grouped draft-record
reads and replacement writes use D1 `db.batch()`, and the remaining bridge is named
`legacySqlStatement` to distinguish Drizzle-parameterized SQL fragments from raw D1 prepare calls.
The remaining bridge uses are limited to expression-heavy cases where `sql` is the documented
Drizzle escape hatch.

Implementation update, 2026-06-02: the non-blocking audit for `tools/pipeline-v2` direct
`.prepare()` calls is complete in [[wiki/engineering/pipeline_raw_prepare_audit|Pipeline Raw
Prepare Audit]]. It records 40 remaining pipeline-local prepared statements, all outside app-side
D1, and classifies them as spatial/SpatiaLite paths, bulk-ingest hot loops, parking/geocode
matching loops, and realistic Drizzle follow-up candidates.

## Verification Matrix

Minimum upgrade proof:

```bash
bun --filter @bp/db test
bun run check:types
bun run test:worker
```

Migration proof:

```bash
bun --filter @bp/db db:generate:d1
bun --filter @bp/db db:generate:local
bun run db:local:migrate
bun run db:d1:migrate:local
```

Broaden only after the package upgrade compiles:

```bash
bun run test:unit
bun --filter @bp/web build
```

Do not claim the upgrade is done until:

- `drizzle-zod` is removed;
- `drizzle-orm/zod` validation tests pass;
- D1 and local migration generation/migration smokes pass;
- Worker auth/draft/comment tests pass or any missing harness is explicitly called out;
- remaining raw SQL sites are either converted or listed as allowed exceptions.

## Sources

- Drizzle Upgrade to v1.0 RC — https://orm.drizzle.team/docs/upgrade-v1 — verified_at: 2026-05-31
- Drizzle Zod validation docs — https://orm.drizzle.team/docs/zod — verified_at: 2026-05-31
- Drizzle Relational Queries v1 to v2 docs — https://orm.drizzle.team/docs/rqb-v1-to-v2 — verified_at: 2026-05-31
- Drizzle ORM GitHub releases — https://github.com/drizzle-team/drizzle-orm/releases — verified_at: 2026-05-31
- Cloudflare D1 migrations docs — https://developers.cloudflare.com/d1/reference/migrations/ — verified_at: 2026-05-31

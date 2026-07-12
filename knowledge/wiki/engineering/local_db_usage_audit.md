---
title: Local Database Usage Audit
type: engineering
status: current
last_updated: 2026-07-05
owner: claude
source_count: 0
tags: [drizzle, drizzle-zod, sqlite, local-db, pipeline, usage-audit, validation]
---

# Local Database Usage Audit

A current-state audit of how the local pipeline SQLite database is actually used, and what roles
Drizzle and drizzle-zod play. Goal: surface concrete opportunities to improve how we use it.
Complements the forward-looking [[wiki/engineering/drizzle_query_modernization_plan|Drizzle Query
Modernization Plan]] (status: complete) and the [[wiki/engineering/pipeline_raw_prepare_audit|Pipeline
Raw Prepare Audit]]. Numbers below are from a 2026-06-07 grep inventory and are approximate.

## TL;DR

- **2026-06-07 implementation update:** local repo tests now use the live
  `migrations-drizzle/local` journal through a shared in-memory test helper, with a guardrail test
  preventing fallback to the stale flat `migrations/local` root. D1 seed generation now validates
  key public-serving insert rows before rendering SQL, including route scorecards, route coverage,
  readiness, route timelines, speed-history/source coverage, brief summaries, and observed
  reliability appendix rows. A local/D1 drift test now checks mirrored serving tables for shared
  column type, nullability, default, and enum parity, with intentional local-only/D1-only columns
  called out explicitly in the test.
- The local DB is **read-dominated** and accessed through **two deliberate, parallel styles**:
  typed Drizzle repository helpers (`@bp/db/local`) for projection/serving rows, and raw
  `bun:sqlite` prepared statements for SpatiaLite + bulk-ingest hot loops.
- **Drizzle's biggest value here is the schema as a single source of truth** (73 tables →
  generated migrations + inferred row types), not the query builder per se.
- **drizzle-zod is effectively unused.** 21 generated D1 schemas exist in `d1/validation.ts`; the
  only consumer is one smoke test. The local DB has **no** generated row validation at all.
- The highest-leverage improvements (full action table below, ordered by risk then effort):
  (1) **point repo tests at the live migration journal** instead of the frozen one — proven to work,
  removes false-green test risk; (2) **decide drizzle-zod** — wire it at the D1 **seed gate** (the one
  real boundary) or delete the unused schemas; (3) two small **helpers** for the only genuine
  duplication. Validating raw-SQL reads is explicitly **low priority** — those paths are
  diagnostic/upstream, not public.

## How the local DB is commonly used

### Acquisition & lifecycle (one dominant pattern)

Most pipeline command access now goes through thin command descriptors running under the
`effect/unstable/cli` adapter. The old `@liche` middleware was removed in Plan 040; commands either
open the local database through explicit Effect command layers (`make*CommandLayer` +
`runPipelineEffect`) or call `openLocalPipelineDb()` directly for non-shared command paths.

- Shared local-DB command layers cover the high-traffic route/build/read-only paths.
- Direct `openLocalPipelineDb()` calls remain in tests, non-command flows, and command bodies that
  have not yet been rewritten to native Effect handlers.

`openLocalPipelineDb` (`tools/pipeline-v2/src/lib/local-db.ts`) is the funnel: it **migrates on every
open** (`migrations-drizzle/local`), applies pragmas via `applyLocalPragmas` (WAL,
`busy_timeout`, `foreign_keys=ON`, `synchronous=NORMAL`), optionally loads SpatiaLite, hands back
`{ db, sqlite, path, spatialite }`, and command layers/direct callers close `sqlite` in finalizers or
`finally` blocks. So commands get **both** a typed Drizzle handle (`db`) and the raw handle
(`sqlite`) from the same connection.

### Read-dominated workload

Write call sites are small and bursty: ~42 `replace*` calls plus a handful of `upsert*`/`insert*`
loops across all of `tools/pipeline-v2` + `@bp/applied-research`. Reads (`list*`/`get*`/`count*`)
dominate the call surface by roughly an order of magnitude. The write model is **delete-by-scope +
batch-insert** ("replace a month/run"), not row-at-a-time mutation — which is why transactional,
chunked `replace*` helpers matter (see [[wiki/engineering/package_structure]] and the 2026-06-07 log
entry).

### Two parallel access styles (by design)

| Style | Where | Used for |
| --- | --- | --- |
| **Drizzle repo helpers** (`@bp/db/local`) | `src/local/repositories/*.ts` | Canonical projection/serving reads + month/run replace writes. **0** direct `db.select/insert/...` calls exist outside the repo layer — clean discipline. 70 of 73 tables are referenced by a repo (the 3 without are named in action #5). |
| **Raw `bun:sqlite`** | ~69 raw `sqlite.query/.prepare/.exec` sites; ~40 long-lived prepared statements (per the raw-prepare audit) | SpatiaLite spatial joins/RTree probes, bulk-ingest hot loops (GTFS static, route schedules, Bus Observatory), geocode/parking matching, large aggregate audit queries. |

The raw path is **documented and classified** in
[[wiki/engineering/pipeline_raw_prepare_audit|Pipeline Raw Prepare Audit]] — most are justified
(spatial / measured hot loops); a few non-spatial cases (e.g. `route-lion-link` delete+upsert) are
listed as Drizzle-migration candidates.

### Two adjacent uses worth knowing

- **Seed/export to D1**: `src/d1/seed/build-seed-sql.ts` spins up an **in-memory** Drizzle client and
  uses it purely to *render* parameterized SQL strings for the D1 seed — Drizzle as a SQL generator,
  not an executor.
- **Source-ingest validation happens upstream of the DB**: ingest commands validate raw source rows
  with `@bp/domain` / `@bp/sources` Zod schemas (~25 ingest files, ~9 `.parse` sites) *before*
  mapping to table rows. There is **no** validation at the DB-row boundary itself.

## What role Drizzle plays

Drizzle is the **schema + types + migration backbone**, and the query engine for the typed path:

- **Single source of truth**: `src/local/schema.ts` (73 `sqliteTable` defs) → `drizzle-kit generate`
  → `migrations-drizzle/local` → applied by the `drizzle-orm/bun-sqlite` migrator. Column names map
  camelCase ↔ snake_case in one place.
- **Inferred row types everywhere**: `$inferSelect` / `$inferInsert` (~83 sites) are the row types
  used across repos and callers — no hand-written DB row interfaces.
- **Core query builder only**: `select/insert/delete/update` behind repo helpers. **No Relational
  Queries (RQB v2) and no `relations()` are defined** — nested parent/child reads (brief summary →
  windows, catalog → types/directions, batch → built routes/issues) are assembled with multiple
  queries + `Promise.all`.
- **Transactions**: the typed `replace*` helpers now use Drizzle's synchronous `db.transaction`;
  raw ingest loops use `sqlite.transaction(...)` directly.
- **Driver**: `drizzle-orm/bun-sqlite`, which is **synchronous** — repo writes are now sync (`void`),
  and an `await` at the call site is a harmless no-op.

### Migration roots (a known split)

Two deliberate roots exist (see the modernization plan):

- `migrations-drizzle/local` — **live**, Drizzle-owned, applied at runtime by `migrate.ts`.
- `migrations/local` — frozen **"historical flat record"**, read only by the local repo tests'
  `createTestLocalDb` helper.

These have drifted (≈37 vs ≈39 files), so **tests build their schema from a stale snapshot** (it
lacks the latest tables/columns and the new month indexes). **Why is the frozen root still used?** The
test helper predates the migration-root split (the modernization plan froze `migrations/local` as a
"historical record" and pointed runtime at `migrations-drizzle/local`, but never updated
`createTestLocalDb`). There is **no remaining reason** to keep tests on it. **What would break if it
switched today?** Nothing functional — verified by probe: `migrate(createLocalPipelineDb(sqlite), {
migrationsFolder: migrations-drizzle/local })` against an in-memory DB builds all 73 tables, includes
the new index, and round-trips a repo write/read. The *only* blocker is mechanical: the helper's flat
`readdir(*.sql)` can't read the live journal's subdir-per-migration layout, so the fix is to call the
drizzle `migrate()` (exactly what runtime does) instead of hand-applying SQL. Note: local migrations
contain **no** SpatiaLite DDL (the `*_geom` tables are plain `PK + builtAt`; geometry is added at
runtime by `spatialite.ts`), so the test path is unaffected by spatial setup.

## What role drizzle-zod plays

Short answer: **almost none, today.**

- It is imported in exactly one file — `packages/db/src/d1/validation.ts` — via `drizzle-orm/zod`
  (the standalone `drizzle-zod` package was removed when the repo moved to Drizzle 1.0 RC; the
  generator now ships inside `drizzle-orm`).
- That file generates **21** `createSelectSchema` / `createInsertSchema` objects for **D1 serving**
  tables.
- **The only consumer is `test/drizzle-validation.test.ts`**, a smoke test that confirms the schemas
  `.parse()` well-formed rows. No serving, seed, export-verify, or Worker boundary actually validates
  rows with them. The `@bp/db/d1/validation` subpath isn't imported by any production module.
- **The local pipeline DB has no drizzle-zod layer at all** — there is no `src/local/validation.ts`.

So drizzle-zod is currently **latent/aspirational**: it proves row shapes are derivable from the
schema, but provides no runtime safety in any real data path.

### What drizzle-zod actually does

It turns a Drizzle table into **runtime** Zod schemas that stay in lockstep with the table
definition:

- `createSelectSchema(table)` — validates the shape of a row **read** from the DB, matching the
  full table/view/enum it was generated from. Per the docs, a query that omits required fields
  (e.g. `select({ id, name })` when the table also has a non-null `age`) **fails to parse**; a
  full-row `select().from(table)` parses. The docs are silent on partial/aggregate/raw-SQL result
  shapes — they neither provide a generated schema for them nor prescribe a remedy.
- `createInsertSchema(table)` — validates a payload **before insert** (notNull required, defaults
  optional).
- `createUpdateSchema(table)` — validates a **partial patch** before `db.update().set(...)`.
- Refinements / `createSchemaFactory` — override a field (e.g. parse a JSON column into a typed
  object), coerce types (e.g. date strings), or use an extended Zod instance.

The thing it buys you over Drizzle's plain types is **runtime** enforcement that is **derived from
the schema** (so it can't silently drift), which matters most for data whose shape TypeScript can't
see (rows from `JSON.parse`, `any`, source APIs, or raw SQL).

### How that job is done in the repo today (without it)

| drizzle-zod feature | Current repo mechanism | Residual gap |
| --- | --- | --- |
| `createInsertSchema` (insert payload is well-formed) | `$inferInsert` types the `rows` param of every repo helper → **compile-time** rejection of wrong shapes; untrusted **source** rows are validated by hand-written `@bp/domain` / `@bp/sources` Zod *before* mapping to table rows (~25 ingest files, ~9 `.parse`). | No **runtime** check on the mapped row. SQLite's loose type affinity won't reject a string in a `real`/`integer` column, and TS can't see a mapping bug that produces the wrong runtime type from validated source data. |
| `createSelectSchema` (read row matches the table) | Drizzle's `$inferSelect` **guarantees** the shape of query-builder reads (the driver maps columns). | **Raw-SQL reads are cast (`as`), not validated** — a column rename or SpatiaLite shape change is silently mis-cast. `createSelectSchema(table)` only covers raw reads that return the *full* table row; how many repo raw reads do that is not established here (see note below). |
| `createUpdateSchema` (patch payload) | The local write model is delete-by-scope + batch-insert ("replace"), so there are almost no patches. The 6 `.update()` calls (gtfs-run finish + 5 geocode backfills) build their `.set({...})` payload from **typed internal code**, not untrusted input. | None meaningful for the local DB. |
| Refinements for JSON columns | 10 `*_json` text columns are typed as `string` and hand-parsed with `JSON.parse` at each use site (e.g. ~5 in `findings/`). | No schema for the JSON shape; each call site re-implements parsing and can drift. (A plain Zod schema would do — this doesn't strictly need drizzle-zod.) |

Net: the **compile-time** half of drizzle-zod's job is already covered by `$inferSelect`/`$inferInsert`,
and the **runtime ingest** half is covered upstream by domain/sources Zod. The genuinely uncovered
spots are raw-SQL read casts and SQLite's loose runtime typing.

### Would it add value here? (honest take)

Mostly modest, with **one clear win** and several weak ones:

- **Clear win — the local → D1 export/seed boundary.** This is a real trust boundary: precomputed
  local analytics rows get loaded into the **public** serving DB. The 21 D1 schemas already exist;
  wiring `createInsertSchema`/`createSelectSchema(table).parse()` into `build-seed-sql` or the
  `verify/d1-loaded` check would catch a bad precomputed value (or schema drift between local
  projection and D1 mirror) *before* it reaches users — something nothing validates today.
- **Low priority — raw-SQL reads.** Two reasons it drops down the list. (1) **They barely touch
  public surfaces.** Raw SQL is concentrated in `audit/` (7 files), `build/` (6), and `ingest/` (5) —
  local-only diagnostics or upstream analytics — while the public export path (`studio/release.ts`,
  `export/d1.ts`) reads through **typed repo helpers with zero raw SQL**. A mis-cast in a raw audit
  read corrupts a diagnostic, not a public row. The one indirect public path is the `build/*`
  **score-vector** builders that feed detectors → findings → briefs. (2) **`createSelectSchema`
  fits poorly anyway:** it validates full table rows and (per the docs) fails to parse a read that
  drops required fields; the docs don't generate schemas for partial/aggregate/raw shapes. The
  full-row-vs-partial split of the raw reads is **not measured here** (the SQL is in multi-line
  template literals that grep can't cleanly classify). If any score-vector read is worth guarding,
  a **small focused hand-written Zod parser** for that specific result shape is the proportionate
  tool — not a table-wide schema, and not a Drizzle requirement.
- **Weak — ingest inserts.** `createInsertSchema` would catch mapping/`type-affinity` errors that TS
  and SQLite both miss, but the source rows are already domain-validated one step upstream, so the
  marginal catch is small (mapping bugs only).
- **Negligible — updates and the Worker read boundary.** No untrusted local patches; and public
  responses are already guarded by hand-written **domain** schemas (the actual API contract), which
  the modernization plan deliberately keeps separate from generated DB schemas.

**Recommendation:** treat it as a boundary tool, not a blanket layer. Either (a) wire the existing 21
schemas into the **local → D1 export/seed verify** step (the one place the value is real), or (b)
delete `d1/validation.ts` + its test + the `./d1/validation` export to remove the false-confidence
surface. Do **not** expand drizzle-zod across raw reads or ingest — those are either ill-matched to
`createSelectSchema` or already covered upstream.

### Concretely: what would wiring it catch, where, and at what cost?

- **What it catches that domain schemas don't.** Domain schemas validate the **public API response**
  shape (the contract); they never see the **D1 row** during seeding. A `createInsertSchema(routeScorecard)`
  at the seed boundary would reject a malformed *precomputed* row — an out-of-enum `coverage_status`,
  a `NaN`/null in a non-null numeric, or a column that drifted between the local projection and the D1
  mirror (the two are **separate** table definitions, so they *can* diverge) — **before** it's written
  to the public DB. SQLite would silently store all of those; the domain response schema might accept
  or coerce them later. That gap is the concrete value.
- **Which rows cross into public.** Effectively **all** seeded rows — the D1 serving tables
  (scorecard, brief summary, comparison ranks, corridor summaries, intervention comparisons, equity,
  readiness, …) *are* the public surfaces the web app reads. So the entire seed is a public-crossing
  boundary; that's why it's the right (and only) place to spend validation.
- **Where to wire it.** Primary gate in **`build-seed-sql`** (validate each row as it's serialized →
  fail fast, before anything is written). An optional lighter check in `verify/d1-loaded` catches
  load/serialization corruption after the fact. A separate "export contract layer" is over-engineering
  for now.
- **Runtime cost / gating.** The seed is a **local build step**, not a request path, run occasionally;
  parsing route×month projections is O(rows) and trivial next to the analytics that produced them.
  Keep it **always-on** at `build-seed-sql` (a build gate) — no flag needed unless the row count ever
  grows large enough to measure.
- **If deleted instead.** Nothing real is lost today — only the smoke test depends on the schemas, and
  the "confidence" they imply isn't actually delivered (they're unwired). Deleting just removes the
  latent surface; it does **not** create a new gap, because no path validates with them now.

## Opportunities to improve (action table)

Ordered by **risk reduction first, implementation effort as tiebreaker**. *Class* separates
**product-risk** (something can reach users wrong, or tests give false confidence) from **cleanup**
(maintainability/consistency, safe to defer). The deferred-cleanup items are explicitly marked.

| # | Action | Class | Owner | Verify | Done when |
| --- | --- | --- | --- | --- | --- |
| 1 | **Point repo tests at the live journal** — make `createTestLocalDb` call `migrate(db, { migrationsFolder: migrations-drizzle/local })` instead of the flat `readdir(migrations/local)`. | product-risk (false-green tests) | `@bp/db` | `bun --filter @bp/db test` | **Done 2026-06-07:** shared in-memory helper uses the live journal |
| 2 | **Guardrail: assert test root == runtime root** — small arch test so the two can't silently re-drift. | cleanup (guardrail) | `@bp/db` | `bun --filter @bp/db test` | **Done 2026-06-07:** `local-migration-root.test.ts` fails on stale local migration root |
| 3 | **Decide drizzle-zod: wire at the seed gate, or delete** — either add `createInsertSchema(table).parse(row)` in `build-seed-sql` (always-on), or remove `d1/validation.ts` + its test + the `./d1/validation` export. | product-risk *(if wire)* / cleanup *(if delete)* | `@bp/db` + `tools/pipeline-v2` (seed) | seed unit test rejects a malformed scorecard row, **or** `grep -r "@bp/db/d1/validation"` is empty | **Done 2026-06-07:** seed preflight validates rendered D1 seed rows across route catalog, route inventory/readiness, reliability, interventions, corridors, timelines, speed/source coverage, equity, scorecards, briefs, rankings, batch rows, and appendix reliability rows |
| 4 | **Two helpers for the only real duplication** — `listRouteCatalogIds()` and a shared LION-fanout helper (see views section). | cleanup | catalog ids → `@bp/db/local`; fanout → `@bp/applied-research/local-db` | `bun --filter @bp/db typecheck` + grep | **Partial done 2026-06-07:** `listRouteCatalogIds()` exists in `@bp/db/local` with a live-migration-backed test, shared LION fanout SQL exists in `@bp/applied-research/local-db`, and `route-schedules-bulk --only-missing-current-routes` now uses the package-owned route catalog helper. Remaining route-catalog raw reads are mostly applied-research corpus adapters where raw SQL is expected. |
| 5 | **Document the 3 repo-less tables as intentionally raw/spatial** — `localParkingViolationMatch`, `localLionSegmentGeom`, `localRouteShapeGeom` (the two `*_geom` are spatialite-runtime; the match table is read raw by applied-research). | cleanup | `@bp/db` | n/a (doc) | **Done 2026-06-07:** schema comments and `packages/db/README.md` mark these as deliberate raw-only tables |
| 6 | **Schema for `payload_json`** — the one `*_json` column whose contents reach public findings/briefs (`localContextEvent`). Parse it with an explicit Zod schema at the findings read boundary. (The other 9 JSON columns are GTFS-RT/geocode/diagnostic — leave.) | product-risk (low) | `@bp/applied-research` / `@bp/domain` | findings unit test | **Done 2026-06-07:** context-event payload construction now validates every supported event kind before upsert, and the parser rejects malformed evidence payloads |
| 7 | **Skip migrate-on-every-open for read-only commands** — read-only audits/exports already have a `readonly` open mode that skips the migrator; route them through it. | cleanup (perf) — *deferred* | `tools/pipeline-v2` | spot-run a read-only audit | **Partial done 2026-06-07:** Studio release/geometry read helpers and treatment-review artifact generation now use `readonly: true`; remaining command-by-command audit can continue incrementally |
| 8 | **Migrate the few non-spatial raw hot paths** (e.g. `route-lion-link` delete+upsert) behind repo helpers; leave genuinely spatial SQL raw. | cleanup — *deferred* | `tools/pipeline-v2` + `@bp/db/local` | raw-prepare audit re-run | those sites call repo helpers; spatial SQL untouched |
| 9 | **Adopt `relations()` for nested reads** (brief summary → windows, catalog → types/dirs, batch → built/issues) — replaces multi-query + `Promise.all` assembly. | cleanup (readability) — *deferred* | `@bp/db/local` | `bun --filter @bp/db test` | the nested reads use `db.query.x.findMany({ with })` |
| — | **Do not add a SQL view layer** — *measured, recorded decision*, not an action (see the duplication check below). | n/a | — | — | — |

**Deferred-cleanup (not product risk):** #7 (read-only open perf), #8 (raw hot-path migration —
already tracked by the raw-prepare audit), #9 (relations). These improve maintainability but nothing
reaches users wrong if they wait.

## Should the local DB use SQL views?

Mostly **no**, with a narrow exception. The reframe: the local DB **already has its "view layer"** —
the ~12 **materialized projection tables** (`scorecard`, `brief summary`, `reliability baseline`,
`build plan`, …) recomputed by `replace*` helpers. SQLite has no native materialized views, so
"recompute a derived read model into a table" is the idiomatic answer, and it is the right one here:
precompute once, read many, and the same tables feed the public D1 path. SQLite/Drizzle views would
**not** improve those — a view is an inlined `SELECT` re-run on every read (no caching), so for
hot/expensive derived reads a view is strictly worse than the table already being materialized.

Views only help for **cheap, recurring, *non-materialized* derived reads currently re-implemented as
raw SQL across commands.** There is a small real surface: the LION-link **spatial join** is read in
~4 commands and ~11 commands load SpatiaLite. A Drizzle view over one of those would give a single
**typed** read model (`$inferSelect`) — and this is exactly where it reconnects to drizzle-zod: a
view (Table/View/Enum object) is the only way `createSelectSchema` can reach a complex/joined read.

Caveats that keep this narrow, not a blanket layer:

- **No performance benefit** (non-materialized) — anything hot/expensive should stay a
  `replace*`-materialized table.
- **Spatial views couple to the extension** — a view referencing `ST_*`/SpatiaLite functions fails
  to open in the many command runs that do not load spatialite; scope carefully or it becomes a
  footgun.
- **Raw-backed views add a new drift seam** — you hand-declare the view's columns over a raw `sql`
  string, which can drift from the `SELECT`. Builder-defined views avoid this (Drizzle infers the
  columns) but cannot express spatial/window/recursive SQL — i.e. most of the raw path.

**Recommendation:** introduce a view only where a non-materialized derived read (realistically a
spatial join or cross-table analytic) is duplicated across ≥2–3 commands *and* a typed/validatable
handle is wanted; prefer **builder-defined** views over raw-backed ones. Keep recompute-into-a-table
for everything hot, expensive, or public-served.

### Empirical duplication check (2026-06-07)

Measured whether enough of the same reads recur to earn views. Method: counted raw `FROM`/`JOIN`
table references and `GROUP BY` shapes across `tools/pipeline-v2/src`, counted joins in the repo
layer, and had an agent read the raw SQL across `commands/**` + `applied-research/**` for duplicated
query shapes. Result — **not enough recurring non-materialized derived reads to justify a view
layer**:

- **0** joins in the entire Drizzle repo layer; raw reads are essentially **single-table** (no
  recurring multi-table raw joins). `GROUP BY` shapes barely repeat (one appears twice; rest are
  one-offs).
- Every **expensive** derived read is **already materialized into a table** and read from there:
  `local_route_lion_link` (route↔LION spatial join), `local_parking_violation_match`,
  `local_context_event_route_touch`, plus the `replace*` projection tables. No ad-hoc spatial
  recomputation exists downstream.
- Only two duplicated reads turned up, and **neither wants a view**:
  1. `SELECT DISTINCT route_id FROM local_route_catalog` in ~5 files — but `route_id` is the PK, so
     this is a trivial "all ids" read; fix is a `listRouteCatalogIds()` **repo helper**.
  2. LION fanout `SELECT physical_id, COUNT(*) FROM local_route_lion_link GROUP BY physical_id` in 3
     build steps (`parking-violation-matches.ts` ×2, `context-event-route-touches.ts`) — a
     once-per-build aggregate; a plain view would **not** speed it up (it re-runs the `GROUP BY`).
     Fix is a shared helper, or fold fanout into the materialized output if it ever becomes hot.

Bottom line: the duplication that exists is **code-level** (solve with shared typed helpers), not
query-materialization-level (solve with views/tables). Revisit views only if a future feature adds a
non-materialized derived read that several commands recompute.

### Helpers and the view-revisit threshold

- **`listRouteCatalogIds()` belongs in `@bp/db/local`** (alongside `listRouteCatalog` in
  `repositories/route-network.ts`) — it's a base-table read with no analytics logic, and the 5 call
  sites span both `tools/pipeline-v2` and `@bp/applied-research`, so it has to live in the shared DB
  package, not in a consumer. It also subsumes the duplicated "route universe" id-list logic those
  consumers re-derive, so it removes duplication beyond the raw-SQL grep surface.
- **The LION-fanout helper belongs in `@bp/applied-research/local-db`**, not `@bp/db/local`. It's
  build-time analytics over `local_route_lion_link` (a fanout weighting used by parking/context
  matching), and its only callers are applied-research build steps — keeping it next to them avoids
  pushing analytic logic into the serving DB package. (`@bp/db/local` should stay
  persistence/read-model, not analytics.)
- **Threshold to revisit views = all three, not any one.** A view earns its keep only when a read is
  (a) **recomputed** in ≥2–3 places (not already a materialized table), **and** (b) **not hot/expensive**
  (else materialize it instead — a view gives no caching), **and** (c) wants a **typed/validatable
  handle** (the `$inferSelect` + `createSelectSchema` payoff). Public-serving relevance alone is *not*
  a trigger, because public reads already go through typed repo helpers, not raw SQL. Today nothing
  clears all three.

## Data quality & cross-layer consistency

Answers to the row-integrity questions, with the gaps called out honestly:

- **Branded domain types stop at the DB boundary.** `@bp/domain` brands `RouteId` / `IsoMonth`
  (`.brand<…>()` + codecs in `primitives/`), but the DB layer stores plain `text("route_id")`, so
  `$inferSelect` types them as `string`. Branding is **not** carried through local rows or D1 rows —
  it must be **re-applied at the Worker/public boundary** via the domain codecs. Architecturally fine
  (the modernization plan says "parse DB rows → map to domain shapes"), but it means a Worker path
  that passes a D1 `routeId` straight to a public payload **bypasses the brand** — worth a spot-check
  on the serving read code.
- **Local↔D1 nullable/default drift is possible and *not yet diffed*.** Local and D1 use **separate**
  table definitions (the modernization plan forbids sharing table objects), so a `notNull`/default
  can diverge between the local projection and the D1 mirror. This audit did **not** diff them; a
  focused check (compare `notNull`/`default` on the mirrored projection tables) is worth doing, and is
  exactly the drift the seed-gate validation in action #3 would catch at runtime.
  **2026-06-07 update:** this focused check now exists in `packages/db/test/local-d1-schema-drift.test.ts`.
  It compares shared mirrored columns across the local and D1 serving schemas and requires any
  compact-serving exclusions or D1-derived columns to be explicitly acknowledged.
- **JSON columns:** of the 10 `*_json` text columns, only **`payload_json`** (`localContextEvent`)
  clearly reaches public output (context events → findings → briefs); `inputs_seen/expected_json`
  (coverage audit) feeds the "we looked" UX. The GTFS-RT alert JSON (×5) and geocode `input_json` are
  raw/diagnostic. So a real JSON schema is worth it for `payload_json` first (action #6), not all ten.
  **2026-06-07 update:** supported `local_context_event.event_kind` payloads are now explicit Zod
  contracts in `@bp/applied-research/local-db`; event builders serialize through that contract before
  DB upsert, and malformed payloads fail a focused unit test.
- **Type-affinity risk on mapped rows:** the corpus-context ingests (311, collisions, permits,
  weather, traffic) validate the *source* shape upstream, then map to table rows and upsert — SQLite
  won't reject a wrong runtime type from a mapping bug. This is the only place a `createInsertSchema`
  runtime check would catch something new on the local side, and it's upstream of public, so it's
  moderate priority (folded into the "wire or delete" decision, not a separate push).

## Scope & not-yet-measured

- **Scope:** `tools/pipeline-v2` is the *whole* pipeline — the legacy `tools/pipeline` (v1) directory
  no longer exists, so there is no v1 blind spot. The audit covers pipeline-v2 commands,
  `@bp/applied-research`, and the `@bp/db` repo/tests; `apps/web` and `@bp/studio-api` read **D1**, not
  the local DB, so they're out of scope here.
- **Repo coverage:** 70/73 local tables have repo helpers; the 3 without are named in action #5.
- **Not measured (stated so the audit doesn't over-claim):** (1) the full-row-vs-partial/aggregate
  split of the raw `SELECT`s — the SQL is in multi-line template literals grep can't classify, and it
  only matters if drizzle-zod is pushed onto raw reads (which this audit recommends against); (2) the
  local↔D1 `notNull`/default diff (above). Both are follow-up checks, not blockers.

## Pointers

- `tools/pipeline-v2/src/lib/local-db.ts` — opener, middleware, pragmas, readonly mode.
- `packages/db/src/local/repositories/*.ts` — the typed access layer.
- `packages/db/src/local/schema.ts` — 73-table source of truth.
- `packages/db/src/d1/validation.ts` — the (unused) drizzle-zod schemas.
- [[wiki/engineering/drizzle_query_modernization_plan]] — the forward plan this audit complements.
- [[wiki/engineering/pipeline_raw_prepare_audit]] — the raw prepared-statement classification.

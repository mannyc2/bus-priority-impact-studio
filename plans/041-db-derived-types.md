# Plan 041: De-zod packages/db — drizzle-inferred types, boundary-only guards, schema reconciliation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat ce3baca..HEAD -- packages/db`
> On drift, compare "Current state" excerpts against live code; mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED (touches the worker's serving queries; mitigated by keeping
  every query function's name and return type, and by the existing
  api-facade tests)
- **Depends on**: none structurally; run AFTER gen-4 plans 030-032 are DONE
  (they stabilize the serving contract and their tests are the regression
  net for this plan)
- **Category**: tech-debt / migration
- **Planned at**: commit `ce3baca`, 2026-07-04

## Execution note — 2026-07-05

Core de-zod work is complete: `packages/db/src` has no zod or `drizzle-orm/zod`
imports, `src/d1/validation.ts` and `queries/studio-brief-agents.ts` were
deleted, and `zod` was removed from `packages/db/package.json`. D1 trusted-read
query row types now derive from Drizzle projections; JSON-text readers use small
hand-written narrowers; D1 seed generation keeps writer-boundary validation with
local table validators.

Schema cleanup added live D1 migration
`packages/db/migrations/d1/0030_drop_studio_brief_remnants.sql`, which drops the
eight dead `studio_brief_*` remnants removed from `src/d1/schema.ts`.

Step 6 initially hit a STOP condition. `bun run db:d1:generate` via the current
`migrations-drizzle/d1` config entered Drizzle Kit's interactive stale-lineage
flow and generated a trial migration that tried to create already-live
`route_speed_history_coverage`, `route_timeline_index`, and
`source_month_coverage` tables in addition to dropping studio brief tables. That
trial migration was removed.

Plan 046 resolved the blocker by keeping the existing two-role migration setup:
`migrations/d1` is the live Wrangler-applied D1 SQL tree, while
`migrations-drizzle/d1` is Drizzle's snapshot cache. The added
`20260705171735_plan046_d1_snapshot` snapshot-only catch-up records the current
schema state with no-op SQL because the matching live D1 changes already exist
as `0027`, `0028`, `0029`, and `0030`. A rerun of
`bun --filter @bp/db db:generate:d1` now reports no schema changes.

Verification passed:

- `bun --filter @bp/db typecheck`
- `bun --filter @bp/db test` (50 pass)
- `bun --filter @bp/studio-api typecheck`
- `bun --filter @bp/studio-api test` (52 pass)
- `bun --filter @bp/pipeline-v2 typecheck`
- `bun --filter @bp/web typecheck`
- `bun run check:web-architecture` (19 pass)
- `bun run test:worker` (19 pass; duration 5.18s)
- `bun run test:unit` (672 pass)
- `bun run db:local:generate` (no changes)
- `bun run db:local:migrate`
- `bun run db:d1:migrate:local`
- `git diff --check -- packages/db bun.lock`

## Why this matters

`packages/db` (15,432 LOC) maintains three parallel descriptions of every
table: the drizzle table definition (`d1/schema.ts`, 918 LOC / 50 tables;
`local/schema.ts`, 1,639 LOC / 59 tables), a generated drizzle-zod pair
(`d1/validation.ts`, 53 schemas — mostly consumed by nobody), and
hand-written zod row schemas inside the query files (48 schemas across 17
files, ~510 LOC that restate table columns field-for-field). The zod layers
re-validate rows drizzle already types, and their 65 unguarded `.parse()`
calls are the same crash class (Worker 1101) that plan 031 firewalls at the
API layer. Drizzle's `$inferSelect`/`$inferInsert` give the same types for
free, from one source of truth.

There is deliberately no move to `@effect/sql` here: the v4 Effect line has
NO drizzle bridge (`@effect/sql-drizzle` is v3-only; verified against the
vendored effect-smol source and the installed `drizzle-orm@1.0.0-rc.3`,
whose built-in validator modules are zod/valibot/typebox/arktype — no
effect). Drizzle keeps schema DDL, migrations codegen, and typed queries;
Effect Schema enters only where data crosses a real trust boundary. This is
recorded as a rejected alternative in `plans/README.md` (gen-5).

The plan also fixes two verified schema-truth bugs: `wrangler.d1.jsonc`
applies migrations from `./migrations/d1` while drizzle-kit generates into
`./migrations-drizzle/d1` (drift by construction), and eight `studioBrief*`
tables remain in `d1/schema.ts:627-907` with a dead query module while the
live migrations dir already contains
`0029_drop_studio_brief_draft_tables.sql`.

## Current state

Verified 2026-07-04 at commit `ce3baca`.

**Hand-written row schema exemplar** —
`packages/db/src/d1/queries/route-month-trends.ts:7-47` (17 files follow
this pattern):

```ts
const RouteMonthTrendRowSchema = z.object({
    route_id: z.string().min(1),
    month: IsoMonthSchema,
    speed_observation_count: z.number().int().nonnegative(),
    ...
    has_speed_trend: z.union([z.literal(0), z.literal(1), z.boolean()]),
  }).strict();
export type RouteMonthTrendRow = z.output<typeof RouteMonthTrendRowSchema>;
function toRouteMonthTrend(row: RouteMonthTrendRow): RouteMonthTrend { ... }
export async function listRouteMonthTrends(db: D1ServingDb, routeId: string): Promise<RouteMonthTrend[]> {
  const rows = await db.select({ route_id: routeMonthTrend.routeId, ... })
```

The drizzle `.select({...})` projection already returns fully typed columns;
the zod parse re-validates them at runtime and throws `ZodError` on
surprise (the 1101 class). The `z.union([0,1,boolean])` encodes SQLite's
integer-boolean mapping.

**Generated pairs** — `packages/db/src/d1/validation.ts` (105 LOC):
`import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";`
then 53 `XSelectSchema`/`XInsertSchema` exports, re-exported through
`d1/index.ts`. External consumers are near zero (spot-checked
`RouteScorecardCitationInsertSchema`, `RouteBriefPeakWindowSelectSchema`:
0 importers) — step 2 verifies exhaustively.

**Dead brief machinery** — `d1/schema.ts` defines
`studioBriefReviewComment` (:627), `studioBriefWriteIdempotency` (:655),
`studioBriefHistoryEvent` (:668), `studioBriefDraftRef` (:804),
`studioBriefAgentRun` (:820), `studioBriefAgentProposal` (:853),
`studioBriefDraftVersion` (:884), `studioBriefDraftVersionSnapshot` (:907).
`d1/queries/studio-brief-agents.ts` queries them; its ONLY importer is the
`d1/index.ts` barrel (verified repo-wide). The brief/composer product was
hard-deleted in gen-3 (plan 017), and
`packages/db/migrations/d1/0029_drop_studio_brief_draft_tables.sql` exists.

**Migrations split-brain** — `packages/db/wrangler.d1.jsonc:11` →
`"migrations_dir": "./migrations/d1"` (this is what `db:d1:migrate:*`
applies), while `drizzle.config.d1.ts:5` → `out: "./migrations-drizzle/d1"`
and `drizzle.config.local.ts:5` → `out: "./migrations-drizzle/local"`. Both
directory trees exist and have diverged file sets.

**Consumers that must not notice this plan**: `packages/studio-api`
(read-handlers/public-api call ~15 query functions and use exported Row
types), `apps/web` worker, `tools/pipeline-v2` (local repositories through
`@bp/db/local`). 76 files import `@bp/db*`.

**Boundary tests that constrain the work**:
`tests/harness/production-boundaries.test.ts:491-500` — D1 query modules
must not contain `.prepare(` (keep using drizzle builders);
`packages/db` tests: `bun --filter @bp/db test`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck db | `bun --filter @bp/db typecheck` | exit 0 |
| db tests | `bun --filter @bp/db test` | all pass |
| studio-api typecheck+tests | `bun --filter @bp/studio-api typecheck && bun --filter @bp/studio-api test` | exit 0 / all pass |
| Worker tests | `bun run test:worker` | all pass |
| Pipeline typecheck | `bun --filter @bp/pipeline-v2 typecheck` | exit 0 |
| Local migration | `bun run db:local:generate && bun run db:local:migrate` | exit 0 |
| D1 local migration | `bun run db:d1:migrate:local` | exit 0 |
| Unit tests | `bun run test:unit` | all pass |

## Scope

**In scope**:
- `packages/db/src/**` (queries, validation.ts, schema files, local
  repositories, index barrels)
- `packages/db/migrations/d1/` (ADD one drop migration if needed),
  `packages/db/drizzle.config.d1.ts`, `drizzle.config.local.ts`,
  `packages/db/migrations-drizzle/` (dispose per step 6 findings)
- `packages/db/package.json` (remove zod when import count hits zero)
- Type-import fixes in direct consumers IF an exported type alias must move
  (goal: zero consumer edits; report any that were unavoidable)

**Out of scope**:
- `packages/studio-api/src/studio/read-handlers.ts` and everything gen-4
  plans 030-032 own.
- `packages/domain` (plan 043 replaces its db-mirroring types using the
  `$infer` exports this plan creates).
- Query behavior/SQL shape changes; adding indexes; new features.
- Remote D1 migration apply (`db:d1:migrate:remote`) — operator-run only.

## Git workflow

- Branch: `plan/041-db-derived-types`; commit per step; no push unless asked.

## Steps

### Step 1: Inventory every zod usage in the package

```bash
rg -n "from \"zod\"|from 'zod'|drizzle-orm/zod" packages/db/src --glob '!node_modules' -l
```

Classify each file (expect ~22): (a) hand-written row schema mirroring a
drizzle projection, (b) generated validation.ts, (c) JSON-text-column parse
(external-ish data embedded in a column), (d) shared utility
(`queries/shared.ts` IsoMonthSchema). Write the classification into the PR
notes — it drives steps 2-4.

**Verify**: every file classified; count matches the `rg` list.

### Step 2: Delete `validation.ts` (after proving its consumers)

For each of the 53 exports: `rg -n "<ExportName>" apps packages tools tests --glob '!node_modules' | grep -v "packages/db/src/d1"`.
- Zero external hits (expected for nearly all): delete.
- External hits: replace the consumer's use with either the `$infer` type
  (type-only uses) or a small local guard (runtime uses), then delete.
Remove the file and its `d1/index.ts` re-exports when empty.

**Verify**: `bun --filter @bp/db typecheck` and all consumer package
typechecks (`@bp/studio-api`, `@bp/web`, `@bp/pipeline-v2`) exit 0.

### Step 3: Replace hand-written row schemas with drizzle-projected types

Per query file (17 files, pattern identical to the
`route-month-trends.ts` exemplar):
1. Delete the `*RowSchema` zod object and the `.parse(...)` call on query
   results — the drizzle `.select({...})` projection type IS the row type.
   Keep the exported row TYPE name alive as
   `export type RouteMonthTrendRow = Awaited<ReturnType<...>>[number]` or,
   cleaner, from the table:
   `export type RouteMonthTrendRow = typeof routeMonthTrend.$inferSelect`
   when the projection selects whole rows; for partial projections, derive
   from the query builder. Choose per file; do NOT widen a partial
   projection to full `$inferSelect`.
2. Keep the `toX(row)` mapping functions; where the zod union
   `[0,1,boolean]` normalized SQLite booleans, keep that normalization as a
   tiny shared helper `sqliteBool(v: number | boolean): boolean` in
   `queries/shared.ts` (which also loses its zod import — IsoMonth stays as
   a plain `type IsoMonth = string` alias here; branded validation lives in
   domain, not on the trusted DB read path).
3. `queries/route-batch-status.ts:96,113` — the two `.parse` sites plan 031
   flagged: same treatment; the crash class disappears structurally.

For file class (c) — JSON-text columns (e.g.
`route-intervention-comparisons.ts` parses embedded JSON blobs): replace
zod with a small hand-written narrowing function that returns
`ParsedShape | null` and logs-and-skips on mismatch (match how plan-030-era
code handles poisoned rows: parse-or-skip, never throw). Do not import
Effect into `packages/db` — the package ends this plan with ZERO schema-lib
dependencies.

Apply the same treatment to `src/local/repositories/*` zod usage (class (a)
mirrors of `local/schema.ts` tables).

**Verify after each ~5 files**: `bun --filter @bp/db test` green. After all:
`rg -c "\.parse\(" packages/db/src` → only sites you deliberately kept
(target 0; JSON-column narrows are hand-rolled, not `.parse`).

### Step 4: Export the derived types consumers will need

In `d1/index.ts` (and `local/index.ts`): for every table with an external
Row-type consumer, export
`export type XSelect = typeof x.$inferSelect; export type XInsert = typeof x.$inferInsert;`
keeping existing exported alias names pointing at the new derivations so
studio-api/pipeline compile untouched. This is the seam plan 043 uses to
replace domain's hand-copied row types.

**Verify**: `bun --filter @bp/studio-api typecheck`,
`bun --filter @bp/pipeline-v2 typecheck` → exit 0 with zero consumer edits
(or list the unavoidable ones in the report).

### Step 5: Drop the dead brief machinery

1. Read `migrations/d1/0029_drop_studio_brief_draft_tables.sql`; list which
   tables it drops.
2. Delete `d1/queries/studio-brief-agents.ts` + its `d1/index.ts` exports
   (sole importer is the barrel — re-verify:
   `rg -l "studio-brief-agents" apps packages tools --glob '!node_modules'`).
3. Remove the eight `studioBrief*` table definitions from `d1/schema.ts`
   THAT 0029 (or a new migration) drops: for any of the eight not covered
   by 0029, author `migrations/d1/00XX_drop_studio_brief_remnants.sql`
   (next number in the LIVE dir) with `DROP TABLE IF EXISTS ...;` for each.
4. Apply locally: `bun run db:d1:migrate:local` → exit 0. Remote apply is
   operator-run; put the command in the PR notes.

**Verify**: `bun --filter @bp/db typecheck`; `bun --filter @bp/db test`;
`rg -n "studioBrief" packages/db/src` → empty.

### Step 6: Reconcile the migrations split-brain

Investigate, then align — smallest safe fix:
1. Diff the two trees: `diff <(ls packages/db/migrations/d1) <(ls packages/db/migrations-drizzle/d1)`.
2. Determine which journal matches the applied state:
   `bun run db:d1:migrate:local` uses `./migrations/d1` (wrangler config) —
   the LIVE lineage. Check whether `migrations-drizzle/d1` is a strict
   regeneration nobody applies.
3. If `migrations-drizzle/` was never applied anywhere (expected): point
   `drizzle.config.d1.ts` / `drizzle.config.local.ts` `out:` at the live
   dirs (`./migrations/d1`, `./migrations/local` — confirm the local
   migrate entry `src/local/migrate.ts` reads the same dir it applies), run
   `bun run db:d1:generate` and `db:local:generate`, confirm they generate
   NO new migration (schema.ts ≡ applied SQL after step 5's drop), and
   delete `migrations-drizzle/`.
4. If generation DOES produce a diff beyond step-5's intentional drops —
   STOP; the schema and the applied lineage disagree in ways this plan must
   not paper over. Report the generated SQL.

**Verify**: `bun run db:local:generate` and `bun run db:d1:generate` are
no-ops (or contain only the step-5 drop); `bun run db:local:migrate` and
`bun run db:d1:migrate:local` exit 0; only one migrations tree remains.

### Step 7: Evict zod from the package and gate

Remove `"zod": "catalog:"` from `packages/db/package.json`; `bun install`.

**Verify**:
- `rg -l "zod" packages/db/src` → empty
- `bun --filter @bp/db test`, `bun --filter @bp/studio-api test`,
  `bun run test:worker`, `bun run test:unit` → all pass
- `bun run check:web-architecture` → all pass (no `.prepare(` crept in)
- Worker timing sanity: `bun run test:worker` wall time within noise of the
  pre-plan run (record both in the PR notes; plan-026 history makes worker
  perf a watched number)

## Test plan

- The load-bearing regression net already exists: `packages/db/test/*`
  (7 query test files), `packages/studio-api/test/api-facade.test.ts`
  (serving behavior incl. the plan-030-era degrade tests), worker tests.
- Add ONE new test: `packages/db/test/sqlite-bool.test.ts` for the shared
  `sqliteBool` helper (0, 1, true, false).
- Add ONE new test per JSON-column narrowing function: malformed blob →
  null (skip), wellformed → typed value. Model on the existing db test
  style in `packages/db/test/`.

## Done criteria

- [x] `rg -l "from \"zod\"|from 'zod'|drizzle-orm/zod" packages/db/src` → empty; zod absent from `packages/db/package.json`
- [x] zod schema `.parse` / `.safeParse` sites removed from `packages/db/src`
- [x] `validation.ts` deleted; `studio-brief-agents.ts` deleted; `rg "studioBrief" packages/db/src` → empty
- [x] D1 Drizzle snapshot cache reconciled; `db:d1:generate`/`db:local:generate` are no-ops
- [x] All existing exported query-function signatures and Row type names still compile for consumers (studio-api, web worker, pipeline typechecks green with no edits, or edits listed)
- [x] `test:unit` + `test:worker` + db/studio-api tests green; worker test wall-time recorded
- [x] `plans/README.md` status row updated

## STOP conditions

- Step 6.4: drizzle generation produces schema diffs beyond the intentional
  studioBrief drops.
- A validation.ts or Row-schema export turns out to have a RUNTIME external
  consumer that actually depends on throwing-parse behavior (not just
  types) — report it; do not silently change its error contract.
- `studio-brief-agents.ts` has gained a real importer since 2026-07-04.
- Worker tests regress in wall time by >2x (plan-026 precedent) — this plan
  should REDUCE worker work; a slowdown means something else is wrong.
- You need to edit `read-handlers.ts` or any gen-4-owned file for more than
  a type-import line.

## Maintenance notes

- New tables now need exactly ONE declaration (schema.ts); types derive.
  Adding a re-validation layer back needs an ADR-level reason.
- Plan 043 consumes the `$infer` exports to delete domain's hand-copied row
  mirrors; keep the export names stable until 043 lands.
- The trusted-read posture (no runtime row validation inside the worker) is
  deliberate: D1 rows are produced by our own pipeline/migrations, and the
  API layer's envelope (plan 031) catches compose-time surprises. If a
  genuinely untrusted source ever writes these tables, add an Effect Schema
  boundary in the WRITER, not on every read.
- Reviewer: check a sample of partial-projection queries to confirm the
  derived types weren't widened to full `$inferSelect` (silently claiming
  columns the query doesn't select).

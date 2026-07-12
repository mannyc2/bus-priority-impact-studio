# Plan 046: Reconcile D1 Drizzle migration lineage after Plan 041

> **Executor instructions**: Follow this plan step by step. This is a
> migration-lineage repair plan, so prefer proving tool behavior before
> moving files. Run every verification command and confirm the expected
> result before moving on. If any STOP condition occurs, stop and report the
> exact generated SQL or tool output; do not hand-edit applied migration
> history into looking clean.
>
> **Drift check (run first)**:
> `git diff --stat HEAD -- packages/db/migrations packages/db/migrations-drizzle packages/db/drizzle.config.d1.ts packages/db/drizzle.config.local.ts packages/db/src/local/migrate.ts packages/db/wrangler.d1.jsonc`.
> Plan 041 legitimately changes `packages/db/migrations/d1/0030_*`; unrelated
> migration edits mean re-read live files before acting.

## Status

- **Priority**: P1
- **Effort**: M-L
- **Risk**: HIGH (migration tooling; mitigated by disposable databases and
  no remote D1 apply)
- **Depends on**: Plan 041 core de-zod complete, with Step 6 stopped
- **Category**: migration / tooling / repo hygiene
- **Planned at**: 2026-07-05, after Plan 041 hit the D1 generation STOP

## Why this matters

Plan 041 removed `zod` from `@bp/db`, deleted dead studio brief D1 schema
surface, and added live D1 migration
`packages/db/migrations/d1/0030_drop_studio_brief_remnants.sql`. All code
verification passed, but the plan could not close because D1 migration
generation proved stale.

The repo has two D1 migration histories:

- `packages/db/wrangler.d1.jsonc` applies `./migrations/d1` to local/remote
  D1. This is the live lineage.
- `packages/db/drizzle.config.d1.ts` generates into
  `./migrations-drizzle/d1`. This snapshot lineage stops before live D1
  migrations `0026` through `0030`.

When Plan 041 ran `db:d1:generate`, Drizzle Kit compared the current schema
against the stale snapshot and produced a trial migration that tried to
create already-live `route_speed_history_coverage`, `route_timeline_index`,
and `source_month_coverage` tables while also dropping studio brief tables.
That trial migration was removed. Future D1 DDL is unsafe until generation
is pointed at, or rebuilt from, the actual applied D1 lineage.

## Current state

Verified 2026-07-05 during Plan 041:

- Live D1 migration files: `packages/db/migrations/d1/0000_*.sql` through
  `0030_drop_studio_brief_remnants.sql`.
- Drizzle D1 snapshots: `packages/db/migrations-drizzle/d1/...0025...`
  plus `20260602191203_perpetual_banshee`, with no snapshots for the later
  live D1 migrations.
- Local SQLite generation still points at
  `packages/db/migrations-drizzle/local` and `src/local/migrate.ts` applies
  that same tree; Plan 041 saw `bun run db:local:generate` produce no
  changes.
- `bun run db:d1:migrate:local` applied live D1 migrations `0029` and
  `0030` locally and exited 0.

## Execution note — 2026-07-05

Resolved with a snapshot-cache catch-up rather than a folder move. Drizzle Kit's
D1 generator requires its own folder/snapshot format, while Wrangler applies the
flat SQL files in `migrations/d1`; this repo now documents that split as
intentional.

Added
`packages/db/migrations-drizzle/d1/20260705171735_plan046_d1_snapshot/` with the
current Drizzle snapshot and no-op SQL. The snapshot includes
`route_speed_history_coverage`, `route_timeline_index`, and
`source_month_coverage`, and no longer contains the retired `studio_brief_*`
tables. The live SQL for those changes remains in
`packages/db/migrations/d1/0027_snapshot_coverage.sql`,
`0028_route_timeline_index.sql`, `0029_drop_studio_brief_draft_tables.sql`, and
`0030_drop_studio_brief_remnants.sql`.

Verification:

- `bun --filter @bp/db db:generate:d1` reports no schema changes.
- `bun --filter @bp/db db:migrate:d1:local` reports no migrations to apply.
- `bun --filter @bp/db db:generate:local` reports no schema changes.
- `bun --filter @bp/db db:migrate:local` exits 0.
- `bun --filter @bp/db test` passes (50 tests).
- `bun run test:worker` passes (19 tests, 5.10s).
- `bun run check:web-architecture` passes (19 tests).
- `bun run check:knowledge` passes.
- `git diff --check` passes.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Inspect D1 generation | `bun --filter @bp/db db:generate:d1` | no migration, or a reviewed snapshot-only/sync strategy |
| Inspect local generation | `bun --filter @bp/db db:generate:local` | exit 0; no unrelated migration |
| Apply live D1 locally | `bun --filter @bp/db db:migrate:d1:local` | exit 0 |
| Apply local SQLite migrations | `bun --filter @bp/db db:migrate:local` | exit 0 |
| DB package tests | `bun --filter @bp/db test` | all pass |
| Worker regression | `bun run test:worker` | all pass |
| Architecture harness | `bun run check:web-architecture` | all pass |

## Scope

**In scope**:

- `packages/db/drizzle.config.d1.ts`
- `packages/db/drizzle.config.local.ts` only if local generation/apply is
  part of the same proven pattern
- `packages/db/src/local/migrate.ts` only if local migration folders move
- `packages/db/migrations/d1/`
- `packages/db/migrations-drizzle/d1/`
- Documentation updates in this plan, `plans/README.md`, and
  `knowledge/log.md`

**Out of scope**:

- Remote D1 apply (`db:migrate:d1:remote`) unless the operator explicitly
  requests it.
- Rewriting old applied SQL files.
- Changing table definitions or serving query behavior.
- Plan 042 browser zod removal; it can run independently, but D1 schema
  work should wait for this repair.

## STOP conditions

- Drizzle generation wants to create a table that already exists in
  `packages/db/migrations/d1`.
- Drizzle generation wants to drop or alter a live table not already
  covered by a reviewed live migration.
- The only available fix requires editing previously applied remote D1 SQL
  in place.
- Wrangler cannot apply the candidate live migration tree to a disposable
  local D1 database.
- Local SQLite generation stops being a no-op without an intentional local
  schema change.

## Steps

### Step 1: Prove the exact divergence

List both histories and map the missing D1 live migrations to the schema
objects they introduced:

```bash
find packages/db/migrations/d1 -maxdepth 1 -type f | sort
find packages/db/migrations-drizzle/d1 -maxdepth 2 -type f | sort
for file in packages/db/migrations/d1/0026_*.sql packages/db/migrations/d1/0027_*.sql packages/db/migrations/d1/0028_*.sql packages/db/migrations/d1/0029_*.sql packages/db/migrations/d1/0030_*.sql; do
  printf '\n== %s ==\n' "$file"
  sed -n '1,220p' "$file"
done
```

Record which tables/indexes/views from `0026`-`0030` are absent from the
latest Drizzle D1 snapshot.

### Step 2: Decide the supported lineage strategy

Inspect installed Drizzle Kit behavior before moving folders:

```bash
bun --filter @bp/db db:generate:d1
```

If Drizzle Kit can be made to produce a snapshot-sync migration without
SQL that Wrangler would apply, prefer that. If Drizzle Kit requires its
own folder format, keep the Drizzle snapshot tree but make the ownership
explicit: live SQL remains in `migrations/d1`; `migrations-drizzle/d1` is a
generation snapshot cache only and must be synced after every live D1 SQL
change. If a true one-tree layout is supported by the installed toolchain,
prefer one tree.

Do not guess: the selected strategy needs one disposable local proof in
Step 4.

### Step 3: Rebuild or supersede the stale D1 snapshot

Use the smallest tool-compatible repair:

- If Drizzle supports a snapshot-only sync, add that sync artifact and
  ensure it does not create already-live objects when generated again.
- If the snapshot cache must stay separate, add a current D1 snapshot
  artifact whose SQL is empty or explicitly not applied by Wrangler, then
  document the rule in `packages/db/README.md`.
- If one-tree is viable, move generation/apply configuration together and
  delete the abandoned tree only after both Drizzle generation and Wrangler
  local apply are proven.

After the repair:

```bash
bun --filter @bp/db db:generate:d1
```

Expected: no migration, or exactly the reviewed snapshot-sync artifact.
Any create-table SQL for the already-live coverage/timeline/source tables
is a STOP.

### Step 4: Verify with disposable local state

Apply migrations to local targets and run the DB/Worker regression net:

```bash
bun --filter @bp/db db:migrate:d1:local
bun --filter @bp/db db:generate:local
bun --filter @bp/db db:migrate:local
bun --filter @bp/db test
bun run test:worker
bun run check:web-architecture
```

If local migration folders moved, run the migration command against a
fresh disposable DB path as well:

```bash
BP_LOCAL_DB_PATH="$(mktemp -u /tmp/bp-local-XXXXXX.sqlite)" bun --filter @bp/db db:migrate:local
```

### Step 5: Document the invariant

Update `packages/db/README.md` and `knowledge/log.md` with the final
ownership rule:

- which directory humans review for live D1 SQL,
- which directory Drizzle reads for D1 snapshots,
- which command proves generation is clean,
- why remote D1 apply remains operator-run.

Update this plan row in `plans/README.md`.

## Done criteria

- [x] `bun --filter @bp/db db:generate:d1` no longer proposes create-table SQL
  for already-live D1 tables.
- [x] D1 local migration apply succeeds from the live migration tree.
- [x] Local SQLite generation/apply remains clean.
- [x] DB tests, Worker tests, and architecture harness pass.
- [x] Migration ownership is documented clearly enough that the next D1 schema
  change has one obvious workflow.

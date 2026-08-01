---
title: Drizzle Modernization Completion Audit
type: engineering
status: archived
last_updated: 2026-06-02
owner: codex
tags: [drizzle, d1, sqlite, migrations, verification]
---

# Drizzle Modernization Completion Audit

This audit maps the end-to-end Drizzle modernization goal to concrete evidence.

## Success Criteria

1. Upgrade the repo to the selected Drizzle 1.0 RC versions.
2. Preserve database safety with a pre-migration backup and avoid remote D1 migrations.
3. Move D1 app query modules off direct `D1Database.prepare()`.
4. Keep a guardrail that blocks new direct raw D1 prepares.
5. Audit remaining pipeline-local raw prepares separately.
6. Document the remaining modernization slices and allowed raw SQL boundaries.
7. Pass the relevant package, Worker, migration-generation, local-migration, type, and build gates.

## Prompt-To-Artifact Checklist

| Requirement | Evidence |
|---|---|
| Drizzle 1.0 RC selected and pinned | Root Bun catalog and lockfile pin `drizzle-orm` and `drizzle-kit` to `1.0.0-rc.3`. |
| `drizzle-zod` removed | `packages/db` now depends on `drizzle-orm` and `zod`; grep for `drizzle-zod` only finds historical documentation. |
| Backup created before migration work | `/home/cjpher/backups/bus-reliability-tracker/drizzle-modernization-20260602T185845Z` exists with `manifest.txt` and a 164 GB `sqlite-and-miniflare-dbs.tar`. |
| Remote D1 migrations avoided | The modernization plan and log record that remote D1 migrations were not run. Verification used local-only commands. |
| D1 app-side direct prepares eliminated | `rg -n "\.prepare\(" packages/db/src/d1/queries packages/db/src/local` returns no matches. |
| Remaining D1 SQL is Drizzle-routed | `studio-brief-drafts.ts` has an intentionally named `legacySqlStatement` helper that returns Drizzle `SQL` and is executed through `db.get`/`db.run`. |
| Guardrail added | `tests/harness/production-boundaries.test.ts` includes `new D1 query modules use Drizzle repositories instead of raw D1 prepare calls`. |
| Pipeline prepares audited separately | [[wiki/engineering/pipeline_raw_prepare_audit|Pipeline Raw Prepare Audit]] records 35 remaining `tools/pipeline-v2` local SQLite prepares and classifies them by reason. |
| Remaining raw SQL boundaries documented | [[wiki/engineering/raw_prepare_audit|Raw Prepare Audit]], [[wiki/engineering/pipeline_raw_prepare_audit|Pipeline Raw Prepare Audit]], and [[wiki/engineering/drizzle_query_modernization_plan|Drizzle Query Modernization Plan]] document allowed exceptions. |
| Drizzle generation clean | `bun --filter @bp/db db:generate:d1` and `bun --filter @bp/db db:generate:local` both report no schema changes. |
| Local migration smokes pass | Disposable `BP_LOCAL_DB_PATH=... bun --filter @bp/db db:migrate:local` exits 0; `bun --filter @bp/db db:migrate:d1:local` exits 0 with no local migrations to apply. |
| Package and Worker tests pass | `bun --filter @bp/db test` passes 36 tests; `bun run test:worker` passes 68 tests. |
| Type and build gates pass | `bun run check:types` exits 0; `bun --filter @bp/web build` exits 0. |

## Verification Commands

```sh
rg -n "\.prepare\(" packages/db/src/d1/queries packages/db/src/local
rg -n "\.prepare\(" tools/pipeline-v2/src | wc -l
bun --filter @bp/db test
bun test tests/harness/production-boundaries.test.ts --timeout 5000
bun run check:types
bun run test:worker
bun --filter @bp/web build
bun --filter @bp/db db:generate:d1
bun --filter @bp/db db:generate:local
BP_LOCAL_DB_PATH=/tmp/.../local.sqlite bun --filter @bp/db db:migrate:local
bun --filter @bp/db db:migrate:d1:local
```

## Result

The Drizzle modernization goal is complete for the app-side D1 and documented pipeline-audit scope.
The simple geocode update prepares were converted after the initial audit, reducing the pipeline
prepare count from 40 to 35. The remaining `tools/pipeline-v2` prepares are intentionally not
blanket-converted; they are tracked as local SQLite follow-up candidates requiring fixture-backed
performance checks or schema ownership decisions.

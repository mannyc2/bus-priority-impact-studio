# Plan 062: Delete the retired pipeline-v1 QA-gate commands and dead residue

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 4c1afe7..HEAD -- tools/pipeline-v2/src/commands tools/pipeline-v2/test knowledge/wiki/engineering/cli_commands.md`
> Compare the "Current state" excerpts against the live code before
> proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: none (run before plan 064 so the ingest consolidation
  does not have to account for finalize's imports)
- **Category**: tech-debt (dead code)
- **Planned at**: commit `4c1afe7`, 2026-07-06
- **Operator decision**: deletion authorized 2026-07-06 ("Delete them").
  The operator authorized the audit/check pair; `pipeline finalize` is
  included because it exists only to chain the deleted QA gate (evidence
  below) — if that inclusion looks wrong during execution, it is a STOP.

## Why this matters

`audit pipeline-v1` (886 LOC), `check pipeline-v1` (1,351 LOC), and
`pipeline finalize` (311 LOC) implement the monthly-release QA-gate
doctrine that ADR-0017 retired on 2026-06-10. No package.json script, shell
script, CI job, or publish flow invokes any of them (the live publish path
is `scripts/publish-serving-release.sh` + the `studio release` command
family). The wiki still documents `bun run` entry points for them that no
longer exist in package.json. This is ~2,550 LOC of command surface whose
only remaining effect is to make the CLI registry, the command census, and
the upcoming schema migration (plan 066) bigger.

## Current state

- `tools/pipeline-v2/src/commands/audit/pipeline-v1.ts` — 886 LOC.
- `tools/pipeline-v2/src/commands/check/pipeline-v1.ts` — 1,351 LOC.
- `tools/pipeline-v2/src/commands/pipeline/finalize.ts` — 311 LOC; the
  ONLY file in `commands/pipeline/`. Its imports prove it is the v1
  orchestrator (`finalize.ts:11`):

```ts
import { type PipelineV1CheckResult, runCheckPipelineV1 } from "../check/pipeline-v1.ts";
```

  The functions it chains (`runBackfillRouteRidershipTrends`,
  `runBuildObservedHeadways`, `runCorridorModel`, `runRouteTrendsIngest`,
  `runMapArtifacts`, `runRouteBriefModel`,
  `runRouteInterventionEvaluation`, `runRouteObservedReliability`,
  `runVerifyD1Export`) all live in their own still-live command modules —
  deleting finalize deletes only the orchestration, not those commands.
- Importer trace (verified 2026-07-06):
  `rg -ln 'audit/pipeline-v1|check/pipeline-v1' tools/pipeline-v2/src tools/pipeline-v2/test`
  returns exactly two files: `commands/pipeline/finalize.ts` and
  `commands/audit/pipeline-v1.ts` (self). Nothing imports finalize:
  `rg -ln "pipeline/finalize" tools/pipeline-v2/src tools/pipeline-v2/test`
  (excluding the file itself) returns nothing.
- No dedicated test files exist: `tools/pipeline-v2/test/commands/audit/`
  contains no `pipeline-v1.test.ts`; `test/commands/check/` contains only
  `route-speed-availability.test.ts` and `spatialite.test.ts`; there is no
  `test/commands/pipeline/` directory.
- The CLI registry is glob-discovered
  (`tools/pipeline-v2/src/cli/registry.ts` — `discoverCommandDescriptors`
  scans `commands/**/*.ts` for default exports), and
  `tools/pipeline-v2/test/cli/registry.test.ts` pins the registry
  snapshot. Deleting three command files changes that snapshot; the test
  must be updated to the new expected command list (99 → 96 descriptors).
- Wiki references (stale): `knowledge/wiki/engineering/cli_commands.md`
  documents `bun run finalize:pipeline-v1 …` / `bun run check:pipeline-v1
  …` invocations (~lines 134-181) and lists `check:pipeline-v1`,
  `audit:pipeline-v1`, `npipeline-v1` in its implemented-commands
  paragraph. None of those package.json scripts exist (verified:
  `rg "pipeline-v1" package.json scripts/` → no matches).
  `knowledge/wiki/engineering/local_db_usage_audit.md:255` mentions
  "`check pipeline-v1`" in a status cell.
- Residue rider: `packages/studio-api/src/effect-api/` is an EMPTY
  directory on disk (untracked residue of the blocked plan 026; git does
  not track empty dirs). Remove it with `rmdir`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Pipeline typecheck | `bun --filter @bp/pipeline-v2 typecheck` | exit 0 |
| Pipeline tests | `bun --filter @bp/pipeline-v2 test` | all pass (incl. updated registry test) |
| Repo unit tests | `bun run test:unit` | all pass |
| Knowledge check | `bun run check:knowledge` | exit 0 |
| Style | `bun run check:style` | exit 0 |
| Reachability gate | `rg -l "pipeline-v1" tools/pipeline-v2/src` | no matches |
| CLI smoke | `bun run pipeline -- --help` | exits 0; no `pipeline` group listed |

## Scope

**In scope**:
- DELETE `tools/pipeline-v2/src/commands/audit/pipeline-v1.ts`
- DELETE `tools/pipeline-v2/src/commands/check/pipeline-v1.ts`
- DELETE `tools/pipeline-v2/src/commands/pipeline/finalize.ts` (and the
  then-empty `commands/pipeline/` directory)
- EDIT `tools/pipeline-v2/test/cli/registry.test.ts` (registry snapshot)
- EDIT `knowledge/wiki/engineering/cli_commands.md` (remove the
  finalize/check/audit pipeline-v1 sections and list entries; do not
  rewrite unrelated sections)
- EDIT `knowledge/wiki/engineering/local_db_usage_audit.md` (drop the
  "`check pipeline-v1`" phrase from the row-7 status cell)
- `rmdir packages/studio-api/src/effect-api`
- `knowledge/log.md` — one dated entry
- `plans/README.md` — status row

**Out of scope** (do NOT touch, even though finalize imports them):
- Every command finalize chains (`backfill/route-ridership-trends.ts`,
  `build/observed-headways.ts`, `corridor/model.ts`,
  `ingest/route-trends.ts`, `map/artifacts.ts`, `route/brief-model.ts`,
  `route/intervention-evaluation.ts`, `route/observed-reliability.ts`,
  `verify/d1.ts`) — all live standalone commands.
- `scripts/publish-serving-release.sh` and the `studio release` family —
  the live publish path.
- Any other wiki page mentioning v1 history in prose.

## Git workflow

- Branch: `codex/062-delete-pipeline-v1-doctrine`
- Commit style: short imperative subject (e.g. "Delete retired
  pipeline-v1 QA-gate commands").
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Re-verify isolation (no edits)

Run the importer traces from Current state verbatim. Expected: the only
importer of check/audit pipeline-v1 is `finalize.ts`; nothing imports
finalize. Also `rg -n "finalize" package.json scripts/*.sh` → no
pipeline-finalize invocation.

**Verify**: outputs exactly as stated; otherwise STOP.

### Step 2: Delete the three command files

`git rm` the three files; remove the empty `commands/pipeline/` dir.

**Verify**: `bun --filter @bp/pipeline-v2 typecheck` → exit 0.

### Step 3: Update the registry snapshot test

Run `bun --filter @bp/pipeline-v2 test` — expect exactly the registry
test to fail, showing the removed entries (`audit: pipeline-v1`,
`check: pipeline-v1`, `pipeline: finalize`). Update the expected snapshot
in `test/cli/registry.test.ts` to remove exactly those three (and the
whole `pipeline` group if it becomes empty). Re-run.

**Verify**: `bun --filter @bp/pipeline-v2 test` → all pass.
`bun run pipeline -- --help` → exit 0.

### Step 4: Wiki + residue + record

Edit the two wiki pages as scoped (delete the pipeline-v1 usage blocks and
list mentions; leave surrounding content intact). Run
`rmdir packages/studio-api/src/effect-api`. Add the `knowledge/log.md`
entry (dated `## [2026-MM-DD] engineering | …` format, noting the ~2,550
LOC deletion, that ADR-0017 retired the doctrine, and that
`publish-serving-release.sh` + `studio release` remain the publish path).
Update the plans/README.md row.

**Verify**: `bun run check:knowledge` → exit 0. `bun run test:unit` → all
pass. `rg -l "pipeline-v1" tools/pipeline-v2/src` → no matches.
`bun run check:style` → exit 0.

## Test plan

Deletion-only. The registry snapshot test update in Step 3 IS the test
work: it must enumerate exactly the three removed descriptors, nothing
else. No new tests are needed; `test:unit` green proves no live command
lost an import.

## Done criteria

- [ ] The three files and `commands/pipeline/` are gone
- [ ] `rg -l "pipeline-v1" tools/pipeline-v2/src` → no matches
- [ ] `bun --filter @bp/pipeline-v2 typecheck` and `test` exit 0
- [ ] `bun run test:unit`, `check:knowledge`, `check:style` exit 0
- [ ] `bun run pipeline -- --help` exits 0 with no `pipeline` group
- [ ] `packages/studio-api/src/effect-api/` no longer exists
- [ ] Wiki pages edited; `knowledge/log.md` entry added; README row updated
- [ ] No files outside the in-scope list modified (`git status`)

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 finds ANY invocation surface for finalize/check/audit pipeline-v1
  (a package.json script, shell script, CI file, or a src import other
  than finalize→check) — the operator authorized deletion on the premise
  none exists.
- Deleting the files breaks a typecheck in a file OUTSIDE the in-scope
  list (means a hidden consumer).
- The registry test failure in Step 3 shows MORE than the three expected
  removals.

## Maintenance notes

- `cli_commands.md` has other stale `bun run <script>` references beyond
  pipeline-v1 (pre-existing; acknowledged by caveat banners in
  `knowledge/index.md`). Deliberately not fixed here — wiki maintenance,
  not this plan.
- If a monthly QA gate is ever wanted again, it should be rebuilt against
  the current release flow (`studio release` + coverage gates from plan
  038), not restored from the v1 code.
- Reviewer should scrutinize: the registry snapshot diff (exactly three
  descriptor removals) and that no chained command module was touched.

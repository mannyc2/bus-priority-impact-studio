# Plan 018: Collapse applied research into the aggregation pipeline

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
>
> ```sh
> git diff --stat 58dfaeb..HEAD -- \
>   package.json \
>   bun.lock \
>   packages/applied-research \
>   packages/analytics \
>   packages/db \
>   packages/domain \
>   tools/pipeline-v2/package.json \
>   tools/pipeline-v2/src \
>   tools/pipeline-v2/test \
>   tests/harness \
>   knowledge/index.md \
>   knowledge/wiki/engineering
> ```
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch that changes the architecture, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/016-mta-wiki-route-evidence-contract.md`, `plans/017-hard-cutover-route-evidence-app.md`
- **Category**: migration
- **Planned at**: commit `58dfaeb`, 2026-06-30

### Progress note - 2026-07-01

This plan has reached the hard-cutover milestone. The public app hard cutover
removed the old brief/finding/composer route surfaces, pure survivor builders
now live under `@bp/analytics` subpaths, and local SQLite aggregation that still
belongs near command orchestration now lives under
`tools/pipeline-v2/src/lib/local-db-aggregates`. `packages/applied-research`
has been deleted, `@bp/applied-research` TS aliases and workspace lock entries
are gone, and the production-boundary harness now asserts that the package
stays removed.

## Why this matters

The maintainer wants an aggressive simplification: no separate
`packages/applied-research`, no route-special findings feed, no brief/composer
research loop, and no research-specific pipeline identity. The pipeline still
matters, but its job is aggregation: source ingestion, geospatial construction,
route/month/year metrics, timelines, interventions, before/after summaries,
D1 seed data, and R2 artifacts. Deleting the research package prevents the
next round of Effect/runtime work from wrapping code that should no longer
exist.

## Current state

- `packages/applied-research` has been deleted.
- `tools/pipeline-v2/package.json` no longer depends on `@bp/applied-research`.
- `tools/pipeline-v2/src` no longer imports `@bp/applied-research`.
- `tests/harness/production-boundaries.test.ts` enforces the new architecture:
  - public app code forbids `@bp/applied-research`
  - analytics forbids `@bp/applied-research`
  - Studio API forbids `@bp/applied-research`
  - a test says the applied research package stays removed
  - pipeline-v2 may import analytics only through package subpaths
- After plan 017, the public product should need only these pipeline products:
  - route index/cards
  - route detail projections with map/segments/KPIs
  - all available speed/ridership/reliability history
  - network map artifacts
  - route evidence imported from MTA-wiki
  - intervention timeline and descriptive before/after summaries
  - D1 seed data and R2 artifacts
  - methods/source/caveat metadata

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Count stale imports | `rg -n '@bp/applied-research|packages/applied-research' .` | no matches when done |
| Pipeline typecheck | `bun --filter @bp/pipeline-v2 typecheck` | exit 0, no errors |
| Analytics typecheck | `bun --filter @bp/analytics typecheck` | exit 0, no errors |
| Domain typecheck | `bun --filter @bp/domain typecheck` | exit 0, no errors |
| DB typecheck | `bun --filter @bp/db typecheck` | exit 0, no errors |
| Unit tests | `bun run test:unit` | pass |
| Architecture | `bun run check:web-architecture` | exit 0 |
| Publish completeness | `bun run check:publish-completeness` | exit 0 |

## Scope

**In scope**:

- `packages/applied-research/**` (delete)
- `tools/pipeline-v2/package.json`
- `tools/pipeline-v2/src/**`
- `tools/pipeline-v2/test/**`
- `packages/analytics/**` for pure survivor transforms only
- `packages/domain/**` for public aggregation contracts only
- `packages/db/**` for local/D1 tables and repositories needed by survivor products
- `tests/harness/production-boundaries.test.ts`
- `package.json`, `bun.lock`
- `knowledge/index.md` and relevant engineering wiki pages only to remove or
  mark obsolete applied-research doctrine

**Out of scope**:

- Reintroducing findings, briefs, review packets, detector promotion, causal
  claims, forecasts, or score-vector products under new names.
- Moving browser or Worker code into the pipeline.
- Adding Python, Postgres/PostGIS, FastAPI, pnpm, or a VPS.
- Migrating the simplified pipeline to Effect. Plan 015 runs after this plan.

## Survivor architecture

After this plan:

- `packages/analytics` owns pure deterministic transforms and metrics. It may
  expose small focused subpaths for route history, map summaries, descriptive
  before/after windows, and intervention aggregation. It must not import DB,
  filesystem, Bun SQLite, R2/D1, apps, tools, or MTA-wiki files.
- `packages/db` owns local SQLite/D1 schemas, migrations, repositories, and
  seed helpers.
- `tools/pipeline-v2` owns orchestration, file IO, local DB reads/writes,
  source adapters, artifact generation, MTA-wiki import, and publishing.
  Pipeline commands may import `@bp/analytics` directly.
- `packages/domain` owns public schemas and typed contracts only.

## Steps

### Step 1: Inventory imports and classify survivors

Run:

```sh
rg -n '@bp/applied-research' tools packages tests
find packages/applied-research/src -maxdepth 2 -type d | sort
find tools/pipeline-v2/src/commands -maxdepth 2 -type d | sort
```

Create a local scratch note outside git or in the PR description classifying
each applied-research export into one of:

- delete outright
- move pure transform to `packages/analytics`
- move DB adapter to `packages/db`
- inline orchestration into `tools/pipeline-v2`
- already replaced by plan 016 route evidence

Default to delete. Preserve only code required by the survivor architecture.

**Verify**:

```sh
rg -n '@bp/applied-research' tools/pipeline-v2/src packages tests
```

Expected at this step: matches still exist, but each has a classification.

### Step 2: Delete obsolete command families

Delete pipeline command families that only exist for the old product model:

- `tools/pipeline-v2/src/commands/brief`
- `tools/pipeline-v2/src/commands/findings`
- detector promotion/evaluation/review commands that produce public findings,
  route briefs, review packets, score vectors, forecast validations, causal
  panels, or research audit artifacts
- Tier 2 commands whose only purpose is source review/authoring handoffs
  rather than deterministic route evidence import

Keep or rewrite command families for:

- source collection/import
- GTFS/static/realtime ingestion
- route and segment aggregation
- map artifact generation
- route history and reliability aggregation
- route evidence import from plan 016
- intervention timeline and descriptive before/after aggregation
- D1 seed/R2 publish/smoke checks
- methods/source coverage

When deleting command files, update any command registry/index files so Liche
discovery no longer sees dead command paths.

**Verify**:

```sh
rg -n 'brief|finding|review-packet|score-vector|forecast|causal|detector.*promotion|public_finding_candidate' tools/pipeline-v2/src
```

Expected: no matches for deleted product concepts in live command code. Terms
may remain only in source-document vocabulary parsers if they are not product
surfaces; prefer removing those too when not needed.

### Step 3: Move survivor pure code out of applied-research

For each survivor transform:

- If it is pure and deterministic, move it to a focused `packages/analytics`
  subpath.
- If it is a schema/contract for the public artifact, move it to
  `packages/domain`.
- If it opens local SQLite, writes D1 seed rows, or owns repository code, move
  it to `packages/db` or keep it in `tools/pipeline-v2` orchestration.

Likely survivor examples:

- intervention records -> route evidence/intervention timeline contracts
- simple descriptive before/after windows -> analytics pure transform
- route treatment summaries -> pipeline aggregation plus domain schema
- local DB helpers -> db local repositories or pipeline lib

Do not move detector evaluation, forecasting, causal, review-packet, model
artifact, route-brief, or score-vector code unless a route page still needs it
after plan 017.

**Verify**:

```sh
bun --filter @bp/analytics typecheck
bun --filter @bp/domain typecheck
bun --filter @bp/db typecheck
```

Expected: all exit 0.

### Step 4: Remove `@bp/applied-research`

Delete `packages/applied-research/`.
Remove `@bp/applied-research` from `tools/pipeline-v2/package.json`.
Run `bun install` to update `bun.lock`.

Update imports in pipeline tests and source files to use the new survivor
locations or delete tests for deleted behavior.

**Verify**:

```sh
test ! -e packages/applied-research
rg -n '@bp/applied-research|packages/applied-research' . --glob '!plans/**'
bun --filter @bp/pipeline-v2 typecheck
```

Expected: directory is gone, grep has no matches outside plans/history if you
choose to leave historical plan text, and pipeline-v2 typecheck exits 0.

### Step 5: Rewrite architecture tests for the simpler boundary

Update `tests/harness/production-boundaries.test.ts`:

- Keep forbidding public app and Studio API runtime imports from analytics,
  sources, pipeline, local DB, tools, and knowledge.
- Keep `packages/analytics` pure: no DB, filesystem, Bun SQLite, dataframe
  runtime, apps, tools, or sources.
- Delete the "applied research package stays headless" test.
- Replace the old "pipeline-v2 commands reach detectors through
  applied-research" test with a new rule:
  - pipeline-v2 may import `@bp/analytics` directly
  - pipeline-v2 must not import from apps or knowledge
  - pipeline-v2 must not import deleted `@bp/applied-research`
  - route evidence import must remain in pipeline, not app/Worker

**Verify**:

```sh
bun run check:web-architecture
```

Expected: exit 0.

### Step 6: Update publish/smoke checks and docs

Update checks that still expect old artifacts:

- `tools/pipeline-v2/src/checks/check-publish-completeness.ts`
- `tools/pipeline-v2/src/checks/serve-web-smoke.ts`
- any release manifest checks that require `briefs`, `findings`, detector
  promotions, or research artifacts

Expected public completeness should now cover:

- routes
- route detail artifacts
- map artifacts
- route history/speed history
- route evidence
- interventions
- methods/source coverage

Update `knowledge/index.md` and relevant engineering pages to mark
applied-research architecture as obsolete. Do not rewrite the whole wiki; add a
short note that the 2026-06-30 hard cutover collapses applied research into
deterministic aggregation.

**Verify**:

```sh
bun run check:publish-completeness
bun run check:knowledge
```

Expected: both exit 0. If `check:knowledge` fails only because historical wiki
links mention applied research, add targeted obsolete notes rather than editing
large unrelated sections.

### Step 7: Final verification

Run:

```sh
bun run test:unit
bun run check:web-architecture
bun --filter @bp/pipeline-v2 typecheck
rg -n '@bp/applied-research|packages/applied-research' . --glob '!plans/**'
```

Expected:

- tests/typechecks pass
- no stale applied-research imports outside historical plan text
- no live command path produces briefs, findings, research review packets,
  detector public promotions, causal claims, forecasts, or score vectors

## Test plan

- Delete tests for deleted products.
- Move or rewrite tests for survivor transforms at their new home:
  - pure aggregation tests in `packages/analytics/test/`
  - DB/repository tests in `packages/db/test/`
  - pipeline orchestration tests in `tools/pipeline-v2/test/`
- Required verification:
  - `bun --filter @bp/analytics typecheck`
  - `bun --filter @bp/domain typecheck`
  - `bun --filter @bp/db typecheck`
  - `bun --filter @bp/pipeline-v2 typecheck`
  - `bun run test:unit`
  - `bun run check:web-architecture`
  - `bun run check:publish-completeness`

## Done criteria

- [ ] `packages/applied-research/` is deleted.
- [ ] No `@bp/applied-research` imports remain outside historical plan text.
- [ ] Pipeline command set is aggregation-oriented and no longer exposes
      briefs/findings/research review/evaluation/forecast/causal products.
- [ ] Survivor pure transforms live in `packages/analytics`; DB adapters live
      in `packages/db` or pipeline orchestration.
- [ ] Architecture tests reflect the new boundaries.
- [ ] Publish/smoke checks expect route evidence, interventions, map, methods,
      and route history, not briefs/findings.
- [ ] Required verification commands pass.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- A route evidence page from plan 017 still depends on a large
  applied-research subsystem that cannot be reduced to a small pure transform
  or pipeline aggregation step.
- Deleting `packages/applied-research` would require changing public metric
  definitions without product approval.
- More than one new package seems necessary. Prefer moving survivors into
  analytics/db/domain/pipeline; do not create a replacement research package.
- You find live browser or Worker imports of pipeline/research code. That is a
  boundary bug; fix it before continuing deletion.
- Verification failure points to unrelated dirty work in files outside this
  plan's scope. Preserve user changes and report the conflict.

## Maintenance notes

- Plan 015, the Effect platform runtime, should run after this plan. Its
  service/layer boundaries should wrap the simplified pipeline, not the deleted
  research workbench.
- Reviewers should scrutinize whether any deleted research concept returned
  under neutral names such as "insight candidate", "promotion", "review
  packet", or "brief seed".

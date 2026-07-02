# Plan 024: Delete the Tier 2 document pipeline and the stale doctrine (~70 kLOC)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Gate check (run first)**: plan 020 must be DONE — the route timeline
> endpoint must no longer read Tier 2 bundles, and its parity diff must be
> recorded. If not, stop; deleting the producer of live serving data is the
> one way this plan goes badly.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED (large deletion; the danger is a hidden live consumer)
- **Depends on**: plan 019, plan 020
- **Category**: simplification
- **Planned at**: 2026-07-01

## Why this matters

Post-cutover LOC census (2026-07-01): the repo is ~248 kLOC; **68 kLOC of it
is `tools/pipeline-v2/src/commands/docs/`** — 126 Tier 2 document-processing
subcommands (OCR, extraction, vocab synthesis, curation queues, dedupe,
agentic audits) with a 10 kLOC `_shared.ts` hub, 91 of the 126 untested.
That system was superseded when Tier 2 was rebuilt as the standalone
`/mnt/models/dev/mta-wiki` repo; the bus repo's remaining Tier 2 consumer is
timeline/evidence serving, which plan 020 moves to the wiki importer. After
that, this tree is a maintenance liability wearing a pipeline costume.

Deleting it (plus stale wiki doctrine and dead D1 brief tables) takes the
repo from ~248 kLOC toward ~175 kLOC and makes every future audit, typecheck,
and agent session cheaper. This is the LOC-reduction plan; it deletes, it
does not refactor.

## Current state

- `tools/pipeline-v2/src/commands/docs/` — 67,949 LOC, 126 commands, incl.
  `tier2/_shared.ts` (10,037 LOC), `_vocab-synthesis.ts` (3,424 LOC),
  `_route-timeline-bundle*.ts` (the timeline producers plan 020 retires),
  `mta-wiki-bridge.ts` (the old review-queue bridge plan 016 replaced).
- Known non-Tier-2 consumers to check before deleting: `verify/d1.ts` and
  `verify/d1-loaded.ts` reference `route_timeline_index`; the D1 schema
  carries `route_timeline_index`, `studio_brief_draft`,
  `studio_brief_draft_claim`, `studio_brief_draft_block`
  (`packages/db/src/d1/schema.ts:627+`).
- Keep (NOT Tier 2): `tools/pipeline-v2/src/commands/studio/
  import-mta-wiki-route-evidence.ts` and `tools/pipeline-v2/src/lib/
  mta-wiki-canonical.ts` — the generation-3 wiki seam.
- Stale doctrine:
  - `knowledge/wiki/analysis/` (15 files, ~276 KB) — detector/findings
    analysis for systems that no longer exist here.
  - `knowledge/index.md` preamble still narrates briefs/findings/detector
    authoring as live product (lines ~28-60 describe ADR-0014/0015/0016
    surfaces deleted by plan 017).
  - ADRs 0011 (deep-novel-findings), 0012 (agent-authored detectors), 0014
    (brief-draft live-write), 0015 (brief markdown), 0016 (brief author
    agent runtime) — decisions about deleted systems.
- `packages/domain` still carries `src/findings/` detector contracts —
  these are LIVE: route insights are built from detector readiness
  (`read-handlers.ts:1007`, `buildRouteInsightsFromDetectorReadiness`).
  `packages/analytics` (36.9 kLOC) is likewise live serving infrastructure.
  **Do not delete detector/analytics code in this plan.**

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Consumer sweep | `rg -ln 'commands/docs|docs/tier2' tools packages apps scripts .github` | only files being deleted |
| Pipeline typecheck | `bun --filter @bp/pipeline-v2 typecheck` | exit 0 |
| Pipeline tests | `bun --filter @bp/pipeline-v2 test --timeout 5000` | pass |
| Unit tests | `bun run test:unit` | pass |
| Architecture | `bun run check:web-architecture` | exit 0 |
| D1 verify | `bun --filter @bp/pipeline-v2 cli -- verify d1 ... --json` | pass post-migration |

## Scope

**In scope**:

- `tools/pipeline-v2/src/commands/docs/**` (delete) + its tests/fixtures
- CLI registration, root scripts, and docs that reference deleted commands
- D1 migration dropping `studio_brief_draft*`; `route_timeline_index` drop
  only if plan 020 left it unreferenced
- `knowledge/wiki/analysis/` deletion; `knowledge/index.md` rewrite of the
  stale preamble; superseded-banners on ADRs 0011/0012/0014/0015/0016
- `data/fixtures/brief-artifacts/`, `check-pipeline-v1` fixtures if orphaned

**Out of scope**:

- `packages/analytics`, `packages/domain/src/findings/` (live insights path)
- `knowledge/raw/**` (immutable captures — never delete)
- `knowledge/log.md` (append-only; add entries, never rewrite)
- The wiki importer and `mta-wiki-canonical.ts`
- Anything in `/mnt/models/dev/mta-wiki`

## Steps

### Step 1: Prove the blast radius

Sweep for every import/registration/script/CI reference into
`commands/docs`. Classify each hit: (a) deleted with the tree, (b) a live
consumer that must be repointed first — if any (b) exists besides the
timeline path plan 020 already moved, STOP and report it.

**Verify**: written classification in the commit message; zero unexplained
hits.

### Step 2: Delete the tree

Delete `commands/docs/**`, its test files and fixtures, its CLI wiring, and
any root `package.json` scripts that only called it. Keep
`import-mta-wiki-route-evidence` (it lives under `commands/studio/`).

**Verify**: pipeline typecheck + tests pass;
`bun --filter @bp/pipeline-v2 cli -- --help` (or the discovery equivalent)
shows no docs/tier2 commands; `rg -n 'tier2' tools/pipeline-v2/src` → no
runtime hits.

### Step 3: Drop the dead D1 tables

Write a Drizzle migration dropping `studio_brief_draft`,
`studio_brief_draft_claim`, `studio_brief_draft_block`; drop
`route_timeline_index` only if step 1 proved it unreferenced after plan 020.
Follow the migration-safety rules in
`knowledge/wiki/engineering/drizzle_query_modernization_plan.md`. Apply to
local and staging first; production apply is an operator step — prepare it,
do not run it unprompted.

**Verify**: `bun --filter @bp/db typecheck` + db tests; `verify d1` against
a locally-migrated database passes.

### Step 4: Retire the stale doctrine

- Delete `knowledge/wiki/analysis/` after confirming its content exists in
  or was superseded by mta-wiki (spot-check 3 files; if something is unique
  and still true, move it to `knowledge/wiki/engineering/` instead).
- Rewrite `knowledge/index.md`'s preamble and ADR summary to describe the
  generation-3 product (five public pages, wiki evidence backend, Effect
  pipeline runtime); delete narrative about briefs/findings/composers.
- Add a superseded banner to ADRs 0011/0012/0014/0015/0016 pointing at plan
  017's cutover (do not delete ADRs — they are decision history).
- Append a `knowledge/log.md` entry recording the deletion and the LOC
  before/after.

**Verify**: `rg -in 'brief|finding|composer' knowledge/index.md` → only
historical-context mentions with superseded framing.

### Step 5: Measure and record

Re-run the LOC census (same exclusions: node_modules, dist, *.gen.ts,
data/). Record before/after per top-level dir in `knowledge/log.md`.

**Verify**: total repo LOC reduced by ≥ 60 kLOC.

## Test plan

- Steps 1-3 each carry their own gates above; then the full pre-merge gate
  (all typechecks, test:unit, worker tests, web build, architecture, style).

## Done criteria

- [ ] `tools/pipeline-v2/src/commands/docs/` no longer exists; CLI and
      scripts clean.
- [ ] Dead D1 brief tables dropped (production migration prepared for
      operator).
- [ ] `knowledge/index.md` describes the current product; analysis/ deleted;
      stale ADRs bannered.
- [ ] LOC census recorded; ≥ 60 kLOC removed.
- [ ] All gates pass; `plans/README.md` updated.

## STOP conditions

- Step 1 finds a live consumer of Tier 2 outputs other than the migrated
  timeline path.
- `verify d1` or worker tests fail after the table drops — the serving path
  still reads something; do not "fix" by re-adding tables without
  understanding the reader.
- A knowledge/analysis file turns out to be the only record of a decision
  still in force — relocate, don't delete, and note it.

## Maintenance notes

- After this plan, remaining LOC concentrations are `packages/analytics`
  (36.9k) and `packages/db` (16.9k) — both live. Any further shrink there
  needs its own audit (detector registry consolidation was explicitly
  deferred as HIGH risk).
- The `.design-handoff` chats and `knowledge/raw/` stay: raw is immutable,
  and the handoff is the design spec of record.

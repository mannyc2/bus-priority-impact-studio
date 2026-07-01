# Plan 019: Land the hard cutover and clear the residue

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
>
> ```sh
> git status --short | wc -l
> git log --oneline -3
> ```
>
> This plan was written on 2026-07-01 against branch
> `frontend-regression-fixes` at commit `58dfaeb` with ~824 files of
> uncommitted changes. If the working tree is already clean or the branch has
> moved, most of this plan is done — verify against the Done criteria and
> report instead of redoing work.

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: MED (the risk is losing work, not breaking it)
- **Depends on**: none
- **Category**: operations / cutover completion
- **Planned at**: commit `58dfaeb` (dirty tree), 2026-07-01

## Why this matters

The entire hard cutover — plans 015, 016, 017, 018, plus the completions of
001/005/011/012 — exists only as **uncommitted working-tree changes** (824
files, +5.5k/−142.8k lines vs `main`). One bad `git checkout`/`git clean`
loses a month of direction. Nothing downstream (design convergence, evidence
serving, tier2 deletion) can be planned against a moving target. Landing this
is the precondition for every other plan in generation 3.

The working tree is verified green as of 2026-07-01: `@bp/web`,
`@bp/studio-api`, `@bp/domain`, `@bp/pipeline-v2` typechecks pass;
`bun --filter @bp/web build` passes the bundle budget (entry 118.5 KB gz /
145 KB budget — note the budget was re-based; the old "168 KB with 59 bytes
headroom" constraint in this README is obsolete); `check:web-architecture`
passes (16/16). Only `bun run check:style` fails, with 447 errors.

## Current state

- Branch `frontend-regression-fixes` (pushed to origin at the dossier-followup
  commits; the cutover work is local-only on top).
- `bun run check:style` → 447 errors, 9 warnings (Biome). Plan 015's
  completion note attributes these to "unrelated hard-cutover diagnostics".
- Cutover residue that plan 017 step 4 specified but that still exists:
  - `packages/domain/src/studio/briefs/` (draft-api.ts, read-model.ts) and
    `packages/domain/src/studio/findings/` still exist and are re-exported
    from `packages/domain/src/studio/index.ts:63-216`.
  - D1 schema still defines `studio_brief_draft`, `studio_brief_draft_claim`,
    `studio_brief_draft_block` (`packages/db/src/d1/schema.ts:627+`).
  - Empty leftover directories: `apps/web/src/routes/{docs,findings}`,
    `apps/web/src/routes/briefs/$briefId`, `apps/web/src/routes/routes/$routeId`
    (the last one may be a router-plugin artifact — verify before deleting).
- `apps/web/src/components/StudioBar.tsx` has a hardcoded
  `updated = "2026-05-12"` default and renders nav items as non-interactive
  `<span>`s — check whether it is still imported anywhere real or is a
  fixture leftover.
- `apps/web/public/llms.txt` and `sitemap.xml` reference
  `https://buspriorityimpact.studio/` while README says the live app is
  `bus-priority-impact-studio.c20carroll.workers.dev` — confirm which domain
  is real before "fixing" either.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Style | `bun run check:style` | exit 0 after this plan |
| Style, autofix | `bunx biome check --write <paths>` | applies safe fixes |
| All typechecks | `bun --filter <pkg> typecheck` per package | exit 0 |
| Web build | `bun --filter @bp/web build` | exit 0, budget passes |
| Worker tests | `bun --filter @bp/web test:worker` | pass |
| Architecture | `bun run check:web-architecture` | exit 0 |
| Unit tests | `bun run test:unit` | pass |

## Scope

**In scope**:

- Committing the working tree in reviewable logical commits
- `bun run check:style` fixes (or targeted, documented Biome suppressions)
- Deleting `packages/domain/src/studio/{briefs,findings}` and their exports
  (finishing plan 017 step 4)
- Deleting empty leftover route directories
- `StudioBar.tsx` disposition (delete or fix hardcoded date)
- `llms.txt` / `sitemap.xml` domain consistency
- Merging to `main` and deploying, per the operator's normal flow

**Out of scope**:

- Dropping the `studio_brief_draft*` D1 tables — schema-code deletion
  cascades into live-database migrations; that is plan 024's cleanup with a
  proper migration. Leave the tables in place here.
- Any new features, design changes, or data changes.
- Rewriting history or force-pushing the shared branch.

## Steps

### Step 1: Snapshot before touching anything

```sh
git stash push --include-untracked --message "pre-plan-019 safety snapshot" && git stash apply
```

This leaves the working tree unchanged but puts a recoverable copy in the
stash. Do not skip this.

### Step 2: Commit the cutover in logical commits

Suggested grouping (adjust to what `git status` actually shows; do not
agonize — reviewability, not perfection):

1. Product cutover deletions: `apps/web` brief/finding/compare/search
   surfaces, `packages/domain` studio contract removals, `packages/studio-api`
   resource removals, worker binding removals, deleted tests.
2. `packages/applied-research` deletion + analytics/pipeline survivor moves
   (plan 018).
3. Effect pipeline runtime (plan 015): `tools/pipeline-v2/src/effect/**`,
   service adoption, `package.json`/`bun.lock`.
4. MTA-wiki route evidence importer (plan 016).
5. UI completions (plans 001/002/003/004/005/012 fallout), `plans/` docs,
   `knowledge/` updates, README.

Each commit must leave the tree buildable is the ideal; if untangling 824
files makes that impractical, prefer fewer, larger commits over broken
intermediate states. Sentence-case imperative messages.

**Verify**: `git status --short` → empty (no unstaged/untracked source files;
`data/` artifacts stay gitignored).

### Step 3: Fix check:style

Run `bunx biome check --write .` for safe fixes first, then fix the remainder
by hand. If a rule fires on intentionally-shaped code, prefer a scoped
`// biome-ignore <rule>: <reason>` over config changes. Commit as its own
commit.

**Verify**: `bun run check:style` → exit 0.

### Step 4: Delete the brief/finding domain residue

> **STOP resolution (operator ruling, 2026-07-01)**: the executor correctly
> stopped on live importers at `read-handlers.ts:30,36,2474`. Investigation:
> the sole consumer is `buildStudioSnapshotResponse` →
> `GET /api/v1/studio/snapshot`, which loads the `findings.json`/`briefs.json`
> R2 projections only to report counts and projection paths; the browser
> client never reads those fields, and the products they describe were
> deleted by plan 017. Ruling: this is dead narration, not a live dependency.
> Before deleting the domain dirs, remove the findings/briefs loads from
> `buildStudioSnapshotResponse` — drop the two `loadStudioProjection` calls,
> the `counts.findings`/`counts.briefs` fields, the findings/briefs entries
> in the `projections` array, and the corresponding fields in the
> `@bp/domain/studio/snapshots` schema — and update the snapshot tests to the
> slimmer shape. The snapshot endpoint itself stays (it is a useful coverage
> manifest). Note for later: the same function also loads `docs.json`
> (`StudioDocsResponseSchema`) — that is the same class of residue but is NOT
> part of this ruling; leave it and record it as a plan 024 candidate.

- Delete `packages/domain/src/studio/briefs/` and
  `packages/domain/src/studio/findings/`.
- Remove their re-exports from `packages/domain/src/studio/index.ts`, any
  entries in `packages/domain/src/json-schema/index.ts`, and any
  `./studio/briefs` / `./studio/findings` subpaths in
  `packages/domain/package.json`.
- `rg -n 'studio/briefs|studio/findings|StudioBrief|StudioFinding' packages apps tools`
  and fix any importer (expected: none in runtime code; delete stale tests).

**Verify**: `bun --filter @bp/domain typecheck`, `bun --filter @bp/studio-api
typecheck`, `bun --filter @bp/web typecheck`, `bun run test:unit` all pass.

### Step 5: Sweep the small leftovers

- Delete empty dirs under `apps/web/src/routes/` (keep
  `routes/routes/$routeId` if the TanStack plugin recreates it — check by
  running the web build after deletion) and the empty
  `apps/web/src/components/brief/{composer,prose,review}` directories.
- `apps/web/src/studio/pages/home.tsx` hardcodes "Last refresh May 12,
  2026" — a fabricated freshness claim. Replace with the real served value
  (the status/methods response carries `generatedAt`) or remove the line.
  The *static citywide numbers* on home are intentional per the recorded
  design decision — leave those alone; only the fake date goes.
- Disposition `StudioBar.tsx`: `rg -n 'StudioBar' apps/web/src` — if only
  fixtures/dev examples import it, move/delete accordingly; if a real page
  imports it, remove the hardcoded `updated` default (no fake dates on public
  surfaces).
- Make `llms.txt`/`sitemap.xml` agree with the real deploy domain. If
  `buspriorityimpact.studio` is a configured custom domain, keep it and update
  README instead; if not, use the workers.dev URL. Verify with
  `curl -sI <url>` before choosing.

**Verify**: `bun --filter @bp/web build` passes; `git status` clean.

### Step 6: Merge and deploy

Open a PR from `frontend-regression-fixes` to `main` (or merge per the
operator's normal flow — this branch is already the integration branch for
the cutover). After merge, deploy via the documented Cloudflare flow
(`knowledge/wiki/engineering/cloudflare_operations_runbook.md`) and smoke the
live app: `/`, one route page, `/map`, `/interventions`, `/methods`, and one
deleted surface (`/briefs` should 404).

**Verify**: live URLs behave as above; `bun --filter @bp/web test:worker`
passed pre-deploy.

## Test plan

- Full gate before merge: per-package typechecks, `bun run test:unit`,
  `bun test apps/web/test/shared --timeout 5000`, `bun --filter @bp/web
  test:worker`, `bun run check:web-architecture`, `bun --filter @bp/web
  build`, `bun run check:style`.
- Post-deploy live smoke as in Step 6.

## Done criteria

- [ ] Working tree committed; branch merged to `main`; nothing valuable left
      in stashes.
- [ ] `bun run check:style` exits 0.
- [ ] `packages/domain` has no studio briefs/findings contracts or exports.
- [ ] Live deploy serves the five public pages and 404s deleted surfaces.
- [ ] `plans/README.md` rows updated (this plan, and mark 017's residue note).

## STOP conditions

- Any verification that was green on 2026-07-01 turns red during commit
  grouping — you split a dependency across commits; fix the grouping, do not
  start "fixing" product code.
- Deleting domain briefs/findings turns up a live importer in serving code —
  report it; that is a product decision, not a mechanical fix.
- The custom domain question (llms.txt) cannot be resolved by inspection —
  leave the files unchanged and note it; do not guess a public URL.

## Maintenance notes

- Plan 024 owns the D1 `studio_brief_draft*` table drops and the deeper
  knowledge/ADR cleanup.
- After this lands, every other generation-3 plan rebases on `main`.

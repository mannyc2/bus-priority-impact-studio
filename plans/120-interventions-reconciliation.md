# Plan 120: Reconcile the /interventions record — adopt the episodes page, retire the orphan, restore URL state

> **Executor instructions**: This plan starts with an OPERATOR GATE. Do not
> execute past Step 0 without the recorded token. Then follow steps in order,
> verifying each. On any STOP condition, stop and report. When done, update
> this plan's status row in `plans/README.md` (Generation 21 section).
>
> **Branch base**: audited against `origin/main@e0c00aaf`; Plans 117-119
> should be merged first (this plan deletes tests and code around the same
> surfaces). Branch off current `origin/main`.
>
> **Drift check (run first)**:
> `git fetch origin && git diff --stat e0c00aaf..origin/main -- apps/web/src/routes/interventions.tsx apps/web/src/studio/pages/interventions.tsx apps/web/src/studio/network-change-record.ts apps/web/src/components/interventions apps/web/src/studio/api-client.ts`
> 117-119 drift is expected. If `studio/pages/interventions.tsx` gained a NEW
> production reference (`rg -n "InterventionsPage" apps/web/src` beyond the
> re-export), STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (deletions + router contract change), gated
- **Depends on**: operator token (Step 0); plans/117, 118, 119 recommended first
- **Category**: tech-debt
- **Planned at**: commit `e0c00aaf` (origin/main), 2026-08-02

## Why this matters

On 2026-07-28, commit `49368520` ("Ship public intervention episodes")
swapped `/interventions` to the new public-episodes page — three days before
its plan (106) existed in-repo — replacing the comp-approved Plan 104 layout
and tripping 104's own STOP condition ("Any ledger behaviour changes").
The consequences on main today:

1. The Plan-104 page (`apps/web/src/studio/pages/interventions.tsx`, 1,234
   lines) is dead — only its line-6 re-export is reachable — yet the router's
   lazy import goes THROUGH that module, dragging the dead page's whole
   import graph (Select, ToggleGroup, RouteChangeIndex, ProposedPlans,
   study-display, the 870-line network-change-record derivations) into the
   /interventions chunk.
2. Seven of eight validated URL search params are inert: the route passes
   only `initialRouteQuery` into a `useState`, so deep links, back/forward,
   and shared URLs no longer restore filter state — Plan 104 required the
   URL contract "preserved exactly".
3. Three api-client fetchers for retired endpoints have zero callers, one of
   which (`fetchStudioInterventionsEvidence`) throws where all its siblings
   return null — a loaded gun for the next caller.
4. Tests keep the dead page green (`interventions-page.test.ts`), so the
   suite vouches for a surface no user can reach.

The audit recommends ADOPTING the shipped episodes page as canonical (the
operator's current feedback is about improving it, and plans 117-119 invest
in it) while formally retiring the 104 layout contract — but that adjudication
is the operator's, hence the gate.

## Step 0 — OPERATOR GATE (no code until resolved)

Operator answers one question, recorded verbatim in this plan file under
"Adjudication record" and in `knowledge/log.md`:

> The gen-19 public-episodes page is canonical for `/interventions`, Plan
> 104's page-composition contract is retired (its build-out chart and its
> approved copy grammar already carry forward), and the orphaned Plan-104
> page code may be deleted. — APPROVE / REJECT

- **APPROVE** → execute Steps 1-5.
- **REJECT** (operator wants the 104 comp layout restored) → do NOT execute;
  this plan is void and a new plan must specify rebuilding the 104 four-section
  layout on the v2 episode contract. Report back.

Recommendation to the operator: APPROVE. The episodes page is what plans
117-119 polish; the 104 comp's surviving elements (NetworkBuildout chart,
sentence grammar) are preserved; restoring the old ledger would resurrect
the corpus/facet endpoints that no longer exist in production (probed 404,
2026-08-02).

## Adjudication record

- 2026-08-04, operator (mannyc2), in session: **APPROVE** — "The gen-19
  public-episodes page is canonical for `/interventions`, Plan 104's
  page-composition contract is retired (its build-out chart and its approved
  copy grammar already carry forward), and the orphaned Plan-104 page code may
  be deleted." Selected against the alternatives of rebuilding the 104 layout
  on the v2 contract (rejected) and deferring (rejected). Executed the same
  day.

## Current state

- `apps/web/src/routes/interventions.tsx:9-13`:
  ```ts
  const PublicInterventions = lazy(() =>
    import("../studio/pages/interventions.js").then((module) => ({
      default: module.PublicInterventionsPage,
    })),
  );
  ```
  and `apps/web/src/studio/pages/interventions.tsx:6`:
  `export { PublicInterventions as PublicInterventionsPage } from "@/components/interventions/PublicInterventions";`
  The route file also validates 8 search params but passes only
  `initialRouteQuery={search.route ?? ""}` (component call around :145-151).
- `apps/web/src/components/interventions/PublicInterventions.tsx:46-48`:
  `useState(initialRouteQuery)` — no URL sync; also `kindKey` and `showAll`
  are local state.
- Dead-only modules (verify each before deleting — reference lists as of
  `e0c00aaf`):
  - `apps/web/src/studio/pages/interventions.tsx` — only the re-export is
    referenced by production code; every other export referenced solely by
    `apps/web/test/shared/interventions-page.test.ts`.
  - `apps/web/src/components/interventions/RouteChangeIndex.tsx` — imported
    only by the dead page.
  - `apps/web/src/components/interventions/ProposedPlans.tsx` — imported only
    by the dead page (PublicInterventions renders its own PlanRow).
  - `apps/web/src/studio/network-change-record.ts` — SPLIT FILE: the buildout
    half is LIVE (`BUILDOUT_FAMILIES`, `buildoutReadings`, `NetworkBuildout`
    types — imported by `public-episode-view.ts:10-15` and the
    `NetworkBuildout` components); the route-index/proposed-plans/headline
    half (`routeChangeIndex`, `proposedPlanGroups`, `changeHeadline`,
    `RouteChangeGroup` type consumed as type-only import by the route file)
    is dead after the page deletion. Plan 118 already copied the
    `changeHeadline` grammar it needed into `episode-copy.ts`.
  - `apps/web/src/studio/api-client.ts`: `fetchStudioInterventionsEvidence`
    (:162-167, throws via `loadStudioJson`), `fetchStudioInterventionCorpus`,
    `fetchStudioInterventionFacetIndex` — zero callers
    (`rg -n "fetchStudioInterventions|fetchStudioInterventionCorpus|fetchStudioInterventionFacetIndex" apps/web/src`
    returns only the definitions). Their retired endpoints return 404 in
    production. Delete the fetchers and any key-builder exports orphaned with
    them.
- Tests to retire with the page: `apps/web/test/shared/interventions-page.test.ts`;
  the dead half of `apps/web/test/shared/network-change-record.test.ts`
  (keep buildout coverage).
- Gen-20 note (plan 110 maintenance) already flagged these as
  "deliberately left to the branch owner" — this plan IS that owner acting.
- Repo convention for route-owned URL state: TanStack `validateSearch` +
  `navigate({ search })`; exemplar: the route-detail tab param handling in
  `apps/web/src/routes/routes/$routeId.tsx` and the network-map search in
  `apps/web/src/components/route/network-map-search.ts` (canonical,
  defaults-omitted search state).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Full web tests | `bun test apps/web/test --timeout 15000` | exit 0 |
| Typecheck | `bun run check:types` | exit 0 |
| Build + budget | `bun --filter @bp/web build` | exit 0 (expect chunk shrink) |
| Architecture/doctrine | `bun run check:architecture` | exit 0 |
| Web release checks | `bun run check:web-release` | exit 0 |

## Scope

**In scope**:

- `apps/web/src/routes/interventions.tsx`
- `apps/web/src/studio/pages/interventions.tsx` (delete)
- `apps/web/src/components/interventions/RouteChangeIndex.tsx`,
  `ProposedPlans.tsx` (delete)
- `apps/web/src/studio/network-change-record.ts` (prune dead half)
- `apps/web/src/studio/api-client.ts` (delete 3 dead fetchers + orphaned key
  builders)
- `apps/web/src/components/interventions/PublicInterventions.tsx` (URL state)
- `apps/web/test/shared/interventions-page.test.ts` (delete),
  `network-change-record.test.ts` (prune), new/updated URL-state tests
- `plans/README.md` (status + the 104-retirement note)

**Out of scope**:

- `TreatmentsHistorySection` and the legacy route-history stack — it is the
  LIVE fallback for missing artifacts and `?study=`/`?record=` deep links;
  its retirement needs the public path to grow deep-link parity first
  (defer; record in maintenance notes).
- `NetworkBuildout` components and the buildout half of
  `network-change-record.ts` — live.
- `packages/**`, `tools/**`.

## Git workflow

- Branch off `origin/main`: `codex/120-interventions-reconciliation`
- Separate commits: (1) re-point import, (2) URL state, (3) deletions,
  (4) test prune. Short imperative subjects.
- No push/PR unless the operator instructed it.

## Steps

### Step 1: Re-point the route import

`routes/interventions.tsx`: lazy-import
`@/components/interventions/PublicInterventions` directly (module's
`PublicInterventions` as default). Delete nothing else yet.

**Verify**: `bun --filter @bp/web build` → exit 0. Record the /interventions
chunk size before/after from the build output in the commit message.

### Step 2: Restore URL-owned filter state

Wire the page's three states to search params (route file `validateSearch`
already has `route`; keep param names it validates where they map):

- `routeQuery` ↔ `route`
- `kindKey` ↔ `family` (validated values already exist in the route file;
  map kindKey strings through them; unknown → omit)
- `showAll` ↔ a boolean param (reuse an existing validated one if apt,
  else add `all`)

Pattern: props `search` + `onSearchChange` from the route (mirror how
network-map receives `effectiveSearch`/`onSearchChange` — see
`studio/pages/network-map.tsx` usage), replace `useState` initializers,
`navigate({ search, replace: true })` on change. Delete the now-dead
validated params that map to nothing (`status`, `view`, `group`, `studied`,
`borough`, `q`) — or wire `q` to routeQuery if that's the older name; decide
by what Plan 104's URL contract used (`route` and `q` both exist; keep
`route`, drop `q`).

**Verify**: new tests (see test plan) pass; manual: load
`/interventions?family=<a-real-kind>&route=bx`, both filters applied;
back/forward restores state.

### Step 3: Delete the orphan page and components

Delete `studio/pages/interventions.tsx`, `RouteChangeIndex.tsx`,
`ProposedPlans.tsx`. Prune `network-change-record.ts` to the buildout half
(delete `routeChangeIndex`, `proposedPlanGroups`, `changeHeadline`,
`RouteChangeGroup` and friends; then fix the route file's type-only import).
Before each deletion run the reference check:
`rg -n "<symbol>" apps/web/src` → only the file being deleted.

**Verify**: `bun run check:types` → exit 0; `bun test apps/web/test
--timeout 15000` → failures ONLY in the test files being pruned next step.

### Step 4: Prune tests + dead fetchers

Delete `interventions-page.test.ts`; prune `network-change-record.test.ts`
to buildout coverage; delete the three dead fetchers + orphaned key builders
from `api-client.ts` (reference-check each).

**Verify**: `bun test apps/web/test --timeout 15000` → exit 0.

### Step 5: Full gates + record

All commands exit 0. In `plans/README.md`: mark this plan DONE, and add one
line to the gen-18 section's Plan 104 row: "layout contract retired by
operator adjudication (Plan 120, <date>); build-out chart and approved copy
grammar carried forward."

## Test plan

- New: route-level test that search params drive the rendered filters
  (model after existing route tests — `rg -n "createFileRoute|validateSearch" apps/web/test`
  for the pattern in use; if no route-test harness exists, test the
  component's controlled props contract instead and note it).
- Updated: `network-change-record.test.ts` retains buildout cases only.
- Deleted: `interventions-page.test.ts`.

## Done criteria

- [ ] Step 0 token recorded above and in `knowledge/log.md`
- [ ] `rg -n "InterventionsPage|RouteChangeIndex|ProposedPlans" apps/web/src` → no matches (NetworkBuildout still present)
- [ ] `rg -n "fetchStudioInterventionsEvidence|fetchStudioInterventionCorpus|fetchStudioInterventionFacetIndex" apps/web/src` → no matches
- [ ] `/interventions` chunk size delta recorded; build + budget green
- [ ] URL state restored: the params tested drive the UI; back/forward works
- [ ] All commands exit 0; no out-of-scope files modified
- [ ] `plans/README.md` updated (status + 104 note)

## STOP conditions

- Step 0 REJECT or no token.
- Any deletion target gains a live reference (drift).
- The type-only `RouteChangeGroup` import removal breaks search validation
  in a way that changes public URLs beyond the params this plan owns.
- Chunk size INCREASES after step 1 (would mean the import graph analysis
  was wrong — report).

## Maintenance notes

- Deferred, deliberately: retiring `TreatmentsHistorySection` + the legacy
  route-history stack. Blocker: `?study=`/`?record=` deep-link parity and
  artifact-missing fallback on the public path. Candidate for a later plan
  once Plan 116 publishes the inventory artifacts and the public path can
  address records.
- The dead-page deletion removes the last consumers of several
  `api-contract.ts` types; a follow-up sweep may prune those types (low
  value; only if touching the file anyway).

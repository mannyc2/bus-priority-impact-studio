# Plan 117: One real change renders once — merge identical cross-route episodes in the view model

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (Generation 21 section).
>
> **Branch base**: audited against `origin/main@e0c00aaf`. Do NOT branch from
> the stale local `ops/gen18-artifact-publication` tree. Branch off current
> `origin/main`.
>
> **Drift check (run first)**:
> `git fetch origin && git diff --stat e0c00aaf..origin/main -- apps/web/src/studio/public-episode-view.ts apps/web/src/components/interventions/PublicInterventions.tsx apps/web/src/components/route/PublicRouteHistory.tsx apps/web/test/shared/public-episode-projection.test.ts`
> On any change, compare the excerpts below to live code; mismatch = STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (run BEFORE Plan 118, which edits the same components)
- **Category**: bug (display grain)
- **Planned at**: commit `e0c00aaf` (origin/main), 2026-08-02

## Why this matters

`/interventions` renders lines like "Added: Automated bus lane enforcement …
Exact BX20 route incidence" repeated for BX3, BX7, BX20 — the same real-world
program event, once per route. The producer pack models rollouts as
single-route episodes: the pinned composition is 222 episodes over 268
route-memberships (mean 1.21 routes/episode;
`tools/pipeline-v2/src/lib/resolved-transit-release-pin.ts:136-138`). Both
component headers promise the opposite ("it never shows one real change as
several rows because several routes were affected" —
`PublicInterventions.tsx:7-8`; "One change is rendered once." —
`PublicChangeEntry.tsx:9`). An operator decision already exists: merge
identical events across routes at display time. This plan implements that
merge in the one place it can live — the web view model — because the
artifact composition is conformance-pinned and cannot change.

## Current state

- `apps/web/src/studio/public-episode-view.ts` — the ONLY grouping logic,
  display-only bucketing at `networkChangeGroups` (lines 354-400):
  bucket key `` `${episodeStartKey(episode)}|${episode.citations[0]?.label ?? ""}` ``
  (line 359), `GROUP_THRESHOLD = 3` (line 352). Below the threshold, sibling
  episodes render as separate top-level rows (lines 371-381). The key is
  fragile: `citations[0]` is alphabetically-first by source key, so one extra
  citation on one sibling breaks its grouping.
- `apps/web/src/components/interventions/PublicInterventions.tsx:55` — groups
  are computed from filtered episodes: `networkChangeGroups(filtered)`.
  Lines 254-265: the group summary's badge strip iterates
  `group.episodes.slice(0, 10).flatMap(e => e.routes…)` (cap applied to
  EPISODES, not routes) while the "+N more" line at 266-270 gates on unique
  `routeCount` — counts disagree and duplicate badges render.
- `apps/web/src/components/route/PublicRouteHistory.tsx` — `ChangeList` maps
  episodes 1:1 (no merge; usually fine per-route, since per-route filtering
  sees one episode per event).
- Tracker episode titles embed the route phrase:
  `tools/pipeline-v2/src/lib/public-intervention-episodes.ts` builds
  `title: 'Automated camera enforcement on ${routePhrase}'` and
  `summary: "Tracker-owned MTA camera-enforcement registry event."` — a
  merged entry must synthesize its title, not concatenate members'.
- The conformance gate that forbids artifact-side merging:
  `tools/pipeline-v2/src/lib/public-intervention-episodes.ts:352-358` throws
  when episode/routeArtifact/membership counts differ from
  `conformance.targetComposition`.
- The live citywide artifact (for measurement):
  `https://bus-priority-impact-studio.c20carroll.workers.dev/api/v1/artifacts/studio/v2/interventions/public-episodes-v2.json`
  (HTTP 200, ~631 KB, keys `episodes/candidate/networkBuildout/proposedPlans`).
- Repo conventions: pure view-model functions in
  `public-episode-view.ts` with unit tests in
  `apps/web/test/shared/public-episode-projection.test.ts`; follow the
  existing function style there (exported pure functions, `readonly` inputs,
  `toSorted`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Scoped tests | `bun test apps/web/test/shared/public-episode-projection.test.ts --timeout 10000` | exit 0 |
| Full web tests | `bun test apps/web/test --timeout 15000` | exit 0 |
| Typecheck | `bun run check:types` | exit 0 |
| Build + budget | `bun --filter @bp/web build` | exit 0 |

## Scope

**In scope**:

- `apps/web/src/studio/public-episode-view.ts`
- `apps/web/src/components/interventions/PublicInterventions.tsx`
- `apps/web/src/components/route/PublicRouteHistory.tsx` (only if step 5
  shows per-route duplicates exist; otherwise untouched)
- `apps/web/test/shared/public-episode-projection.test.ts`
- A scratch measurement script (write under the session scratchpad or
  `/tmp`, never committed)

**Out of scope**:

- `tools/pipeline-v2/**` and `packages/domain/**` — the artifact contract and
  builder are conformance-pinned; no changes.
- `PublicChangeEntry.tsx` copy/wording — Plan 118 owns it (sequencing:
  117 lands first).
- The `<details>`/collapsible mechanics — Plan 119.

## Git workflow

- Branch off `origin/main`: `codex/117-merge-crossroute-episodes`
- Commit per step, short imperative subjects.
- Do NOT push or open a PR unless the dispatching operator instructed it.

## Steps

### Step 1: Measure the duplication on the live artifact

Download the citywide artifact (URL above) to the scratchpad. With a small
bun script, compute and print:

1. Episode count by `authority`.
2. Candidate merge-key groups: key =
   `authority | date.value | sorted(treatmentFamilies[].treatmentFamilyKey) | normalizedTitle`
   where `normalizedTitle` strips the route phrase from tracker titles
   (everything after `" on "`) and lowercases. Print the size histogram and
   the 10 largest groups (title + routes).
3. How many groups of size ≥2 exist, and what share of episodes they cover.

Record the numbers in the PR/commit message. They decide step 2's constants.

**Verify**: script runs, prints a histogram; ≥1 group of size ≥2 exists (the
BX3/BX7/BX20 class). If ZERO groups of size ≥2 exist, STOP — the duplication
the operator saw must come from somewhere else; report the histogram.

### Step 2: Implement `mergeIdenticalEpisodes` in the view model

In `apps/web/src/studio/public-episode-view.ts` add:

```ts
export type MergedEpisode = PublicInterventionEpisode & {
  /** Episode ids folded into this entry (length 1 when nothing merged). */
  mergedEpisodeIds: readonly string[];
};

export function mergeIdenticalEpisodes(
  episodes: readonly PublicInterventionEpisode[],
): MergedEpisode[]
```

Rules (from step 1's evidence):

- Merge key: `authority | date.value | sorted family keys | normalizedTitle`
  (the step-1 key). Never merge across `authority`.
- Merged entry: first episode's fields; `routes` = union by `routeKey`
  (stable order: first appearance); `components` = union by `componentId`;
  `placements` = union by `placementKey`; `citations` = union by label;
  `mergedEpisodeIds` = all folded ids, sorted.
- Title synthesis for tracker merges: `Automated camera enforcement on
  ${n} routes` when >2 routes; two routes keep "X and Y" (reuse the existing
  routePhrase style). Producer merges keep the first title UNLESS titles
  differ beyond the route phrase — then do not merge that pair (guard).
- Deterministic: same input → same output (no Date.now, no randomness).

Wire it: `PublicInterventions.tsx:51-56` — apply after `filterEpisodes`,
before `networkChangeGroups` (filtering first keeps route-query semantics:
a route query narrows to episodes naming that route; the merged entry then
still lists all its routes). Type the downstream `NetworkChangeGroup.episodes`
as the merged type.

**Verify**: `bun test apps/web/test/shared/public-episode-projection.test.ts --timeout 10000`
→ existing tests still pass (they may need the new call added — see test plan).

### Step 3: Fix the group badge strip (cap and count from one list)

In `PublicInterventions.tsx:253-271`, build the unique route list once —
`const uniqueRoutes = [...new Map(group.episodes.flatMap(e => e.routes.map(r => [r.routeKey, r]))).values()]`
— render `uniqueRoutes.slice(0, 10)` badges, overflow line
`uniqueRoutes.length > 10 ? \`and ${uniqueRoutes.length - 10} more\` : null`.

**Verify**: a new unit test on the group model (or a component test if the
suite has one for this file) asserting badge-list length ≤ 10 and overflow
count = uniqueRoutes − 10.

### Step 4: Harden the display-grouping key

In `networkChangeGroups` (line 359), replace `citations[0]?.label` in the
bucket key with the step-2 merge key's family segment (date + sorted family
keys). After merging, remaining buckets are genuinely distinct changes that
share a day; the heading form "N changes on M routes" stays. Keep
`GROUP_THRESHOLD = 3`.

**Verify**: scoped tests pass; run the step-1 script's grouping simulation
against the live artifact through the NEW pipeline (import the functions in
the scratch script) and eyeball the 10 largest rendered groups — no
same-event siblings remain as separate top-level rows.

### Step 5: Route page check (conditional)

Run the step-1 script per-route (`episodesForRoute` then merge): if any route
has ≥2 episodes folding into one merge key, wire `mergeIdenticalEpisodes`
into `PublicRouteHistory`'s episode list the same way. If zero, leave
`PublicRouteHistory.tsx` untouched and note it.

**Verify**: `bun test apps/web/test --timeout 15000` → exit 0.

### Step 6: Full gates

`bun run check:types` → 0; `bun --filter @bp/web build` → 0;
`git status --porcelain` → only in-scope files.

## Test plan

New cases in `apps/web/test/shared/public-episode-projection.test.ts`
(model after its existing fixture-building style):

- Three tracker episodes, same date + family, titles "… on BX3/BX7/BX20" →
  ONE merged entry, 3 routes, synthesized title "Automated camera enforcement
  on 3 routes", `mergedEpisodeIds.length === 3`.
- Two producer episodes, same date + family, DIFFERENT titles → NOT merged.
- Producer vs tracker, same date/family → NOT merged (authority boundary).
- Merge preserves union semantics: components by `componentId`, placements by
  `placementKey`, no duplicates.
- Determinism: shuffled input order → identical output.
- Group badge strip: unique-route cap/count agreement (step 3).

## Done criteria

- [ ] All commands in the table exit 0
- [ ] The six new tests exist and pass
- [ ] Step-1 measurement numbers recorded in the commit/PR body
- [ ] Live-artifact simulation shows no same-key siblings as separate rows
- [ ] No files outside scope modified
- [ ] `plans/README.md` gen-21 row updated

## STOP conditions

- Step 1 finds zero mergeable groups (premise fails — report).
- ~~The merge would fold >40% of all episodes into multi-episode entries —
  that suggests the key is too coarse and is erasing real distinctions;
  report the histogram instead of shipping.~~ **CORRECTED 2026-08-04 (post-
  execution).** This threshold fired at 64.9% and the operator authorized
  shipping anyway, because the evidence refuted the premise it encoded. The
  40% number was written against an assumption that producer episodes are
  roughly one-per-real-change, so a large fold could only mean an over-coarse
  key. The live artifact is the opposite: the producer emits ONE episode PER
  ROUTE, so a single citywide change (Queens Bus Network Redesign, 36 routes)
  legitimately folds 36 episodes, and the fold rate mostly measures how many
  routes the biggest programs touch — not key coarseness. The real guard is
  the one the operator actually applied: inside every merged group the title,
  summary, citations and date must be identical, and every route-scoped
  component must survive the union. A future re-measure should assert THAT,
  and drop the percentage entirely.
- `NetworkChangeGroup`'s type change ripples into files outside scope.
- Excerpt drift (see drift check).

## Maintenance notes

- Plan 118 rewrites `ComponentText`/copy on the SAME components — land 117
  first; 118's drift check expects it.
- If the producer ever ships true multi-route episodes (memberships/episode
  → 1 route), `mergeIdenticalEpisodes` degrades to identity — safe to keep.
- The upstream fix (one record per real change in mta-wiki) remains owed in
  that repo (recorded in gen-18 notes); when it lands, re-measure step 1 and
  consider deleting the merge.

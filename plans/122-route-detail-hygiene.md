# Plan 122: Route-detail hygiene — one speed scalar, honest history states, clean map hover

> **Executor instructions**: Follow this plan step by step; run every
> verification and confirm the expected result. On any STOP condition, stop
> and report. When done, update this plan's status row in `plans/README.md`
> (Generation 21 section).
>
> **Branch base**: audited against `origin/main@e0c00aaf`. Branch off current
> `origin/main` — NOT the stale local tree.
>
> **Drift check (run first)**:
> `git fetch origin && git diff --stat e0c00aaf..origin/main -- apps/web/src/components/route/OverviewSection.tsx apps/web/src/components/route/SegmentExplorer.tsx apps/web/src/components/route/route-detail-data.ts apps/web/src/components/route/segment-history-data.ts apps/web/src/components/route/RouteMapLibre.map.tsx apps/web/src/components/route/section-registry.ts apps/web/src/components/route/route-derived.ts apps/web/src/components/route/RouteInsightList.tsx apps/web/src/components/route/route-intervention-model.ts apps/web/src/components/TreatmentBadge.tsx packages/analytics/src/interventions/route-treatment-crosswalk.ts`
> On drift, compare excerpts; unexplained mismatch = STOP.
> (Steps 7-9 were verified against `origin/main@881d5611`, which is already
> ahead of `e0c00aaf` — their line refs cite that commit.)

## Status

- **Priority**: P1
- **Effort**: M-L (grew by three steps in the 2026-08-02 bug sweep)
- **Risk**: LOW-MED
- **Depends on**: none hard. Plan 115 recommended first (route facts resolve
  again, so the exposure readout has real data to show). Plan 116 owns the
  DATA-side fix for speed history (republish with `spineReadiness`); this
  plan's client half is correct with or without it.
- **Category**: bug
- **Planned at**: commit `e0c00aaf` (origin/main), 2026-08-02

## Why this matters

Four small route-detail defects compound into "this page feels broken":

1. **The same speed renders three times, and two of the numbers differ.**
   The persistent header shows `dossier.speed.current ?? route.weightedAvgSpeed`
   as "Avg speed" (`RouteDetailHeader.tsx:66-68`, rendered above the tabs —
   `RouteDetailShell.tsx:36-42`). Overview restates the SAME number in prose
   ("runs 6.8 mph against a 7.2 mph schedule", `OverviewSection.tsx:175-181`
   via `routePerformanceSummary`, `route-derived.ts:57-72`). The
   Slow-segments readout's no-selection default shows
   `route.weightedAvgSpeed` (`SegmentExplorer.tsx:900-905`) — a DIFFERENT
   field, so switching tabs can change the route's speed with no explanation.
   The no-duplicate-surfaces doctrine bans exactly this. Operator direction:
   the scalar lives in Slow segments (and the header); Overview's slot gets
   real content instead (Plan 123).
2. **"No month history for this segment." is silently wrong two ways.** The
   served speed-history artifacts predate the producer's `spineReadiness`
   field, and the client blanks ALL series when it is null
   (`segment-history-data.ts:176-178`) while 36 months of cells sit in the
   fetched payload; `HistoricalStatus` explains only the
   `needs_pattern_review`/`failed` cases (`SegmentExplorer.tsx:783-789`), so
   the null case renders greyed-out controls with no reason. AND a fetch
   error is indistinguishable from genuinely-missing history: the hooks have
   no error variant and swallow failures
   (`route-detail-data.ts:19-22, 62-65`), so a 500 renders as a factual
   claim about the data.
3. **The route-detail map's hover is wasteful and can go stale.** Every
   hover transition rewrites feature-state for EVERY segment
   (`RouteMapLibre.map.tsx:483-497`), every mousemove sets React state with
   no same-id guard (`:266-276`), and a feature rejected by the direction
   filter never clears the previous hover (`:272` — `if (map !== null &&
   segmentId !== null)` has no else-clear), leaving the readout showing a
   segment the pointer left.
4. **Two config/fixture lies.** `section-registry.ts:56` gates the map
   section on surface keys (`map`, `geometry`, `routeGeometry`) the manifest
   builder never emits (it emits exactly eight:
   `build-route-capability-manifest.ts:378-387`), so the gate is inert and
   the map-only fallback branch in `route-detail.tsx:148-160` is unreachable
   via the capability path. And the committed
   `data/artifacts/studio/v2/routes/route-capability-manifest.json` is
   schemaVersion 1 while both read schemas require 2
   (`route-capability.ts:117, :140`) — a stale fixture that fails decode for
   anyone who seeds from it.

Operator bug sweep additions (2026-08-02; line refs `origin/main@881d5611`):

5. **An unplanned "No flags raised" filler card.** When a route has no
   insights but any capability surface is `checked_clean`, Overview renders
   a green card: "No flags raised — No detector flags raised for this route
   across 6 checked surfaces." (`RouteInsightList.tsx:141-159`, sole caller
   `:35`). No plan or comp ever specified it; it leaks detector/surface
   vocabulary onto a public face (banned by the study-card rules) and, with
   detector findings empty citywide, it renders on essentially every route.
   Operator verdict: delete, render nothing.
6. **Raw crosswalk slugs render as treatment names.** For `other_documented`
   treatments the display label is `rawLabel ?? humanize(rawKind)`
   (`route-intervention-model.ts:171`) — but the crosswalk passes the kind
   slug AS the label for **137** reviewed rows
   (`route-treatment-crosswalk.ts` — `reviewedOther("<slug>", "<same
   slug>")`), so the public UI prints `limited_to_local_conversion`,
   `priority_corridor_designation`, `overnight_service_discontinuation`, …
7. **The "+N more" treatment popover blows out.** In the overflow popover
   (`TreatmentBadge.tsx:186-204`), a code-less treatment renders
   `RouteInventoryBadge`'s fallback — a `Badge` whose CONTENT is the full
   label (`:290-297`), a nowrap chip; with slug labels that is one unbroken
   30-char token that overflows the 320px panel and visually collides into
   the adjacent text — the operator's screenshot reads
   "priority_corridor_designation, Proposedpriority_corridor_designation…".
   The label also renders twice per row (badge fallback + the labeled span).

## Current state (key excerpts, origin/main)

`SegmentExplorer.tsx:900-905` (readout default source):

```ts
  const mph =
    active === null
      ? historicalActive
        ? routeDisplaySpeed
        : route.weightedAvgSpeed
      : (displaySpeeds.get(active.id) ?? null);
```

`segment-history-data.ts:176-178`:

```ts
  if (history === null || history.spineReadiness === null) {
    return { readiness: "unavailable", series, unmatchedDetailSegmentIds };
  }
```

`route-detail-data.ts:19-22` and `:62-65`:

```ts
export type RouteSpeedHistoryState =
  | { status: "loading"; data: null }
  | { status: "ready"; data: StudioRouteSpeedHistoryResponse }
  | { status: "unavailable"; data: null };
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({ status: "unavailable", data: null });
      });
```

`RouteMapLibre.map.tsx:266-276` (unguarded hover setter; no else-clear) and
`:483-497` (full-loop feature-state writes). Hover paint for reference: width
`7→9` hovered, `10` pinned (`:372-378`); `dimmed` opacity 0.25 set ONLY by
the direction filter (`:493`) — this map does not dim on hover.

Production facts (probed 2026-08-02): `/api/v1/studio/routes/bx20/speed-history`
returns 200 with `spineReadiness: null`, `dimensions.months` length 36,
`summary.availableCellCount` 738 — the data is served and discarded.

Conventions: abort-aware loaders re-throw `AbortError`
(`routes/routes/$routeId.tsx:55-60`); match that in the hooks' catch.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Scoped tests | `bun test apps/web/test/shared --timeout 15000` | exit 0 |
| Analytics tests (step 8) | `bun --filter @bp/analytics test` | exit 0 |
| Typecheck | `bun run check:types` | exit 0 |
| Build + budget | `bun --filter @bp/web build` | exit 0 |
| Architecture | `bun run check:architecture` | exit 0 |

## Scope

**In scope**:

- `apps/web/src/components/route/OverviewSection.tsx` (+ its derivation in
  `route-derived.ts` if the sentence builds there) — remove the speed
  sentence only
- `apps/web/src/components/route/SegmentExplorer.tsx`
- `apps/web/src/components/route/route-detail-data.ts`
- `apps/web/src/components/route/segment-history-data.ts`
- `apps/web/src/components/route/RouteMapLibre.map.tsx`
- `apps/web/src/components/route/section-registry.ts`
- `data/artifacts/studio/v2/routes/route-capability-manifest.json` (delete or
  regenerate — see Step 6)
- `apps/web/src/components/route/RouteInsightList.tsx` (step 7)
- `apps/web/src/components/route/route-intervention-model.ts` (step 8)
- `packages/analytics/src/interventions/route-treatment-crosswalk.ts` + its
  test (step 8, source half)
- `apps/web/src/components/TreatmentBadge.tsx` (step 9)
- Matching test files under `apps/web/test/shared/`

**Out of scope**:

- `RouteDetailHeader.tsx` — the header "Avg speed" stat SURVIVES (it passed
  the gen-6 design review; the operator's "show speed in slow segments"
  keeps the header stat and the segments readout, and drops the Overview
  prose duplicate).
- The Overview replacement content — Plan 123 (comp-gated).
- Moving any chart between tabs (recorded decision: the monthly speed trend
  stays on Overview — route-grain; the hourly profile stays in Slow
  segments; moving them would put route-level charts under a segment-grain
  tab, against display-grain doctrine).
- `packages/analytics/**` (manifest builder) — only if Step 6 chooses
  regeneration AND the builder runs from a documented command; otherwise
  delete the fixture.

## Git workflow

- Branch off `origin/main`: `codex/122-route-detail-hygiene`
- Commit per numbered step. No push/PR unless the operator instructed it.

## Steps

### Step 1: One speed source, one speed scalar

- `OverviewSection.tsx:175-181`: delete the speed sentence from the summary
  prose (keep movement/percentile/worst-stretch sentences). Update
  `overview-section` tests that pin the prose.
- `SegmentExplorer.tsx:900-905`: change the no-selection default source from
  `route.weightedAvgSpeed` to the header's source
  (`dossier.speed.current ?? route.weightedAvgSpeed` — thread the dossier
  value in via existing props if already available in the component tree;
  if the dossier is not reachable inside `SegmentReadout`, pass the resolved
  number down from the page as one prop). Label the sub-line "route average,
  ${periodLabel}" so the fallback is explicit.

**Verify**: `bun test apps/web/test/shared --timeout 15000` → updated tests
pass; `rg -n "runs.*mph against" apps/web/src` → no matches.

### Step 2: Error state in the per-route artifact hooks

`route-detail-data.ts`: add `{ status: "error"; data: null }` to BOTH
`RouteSpeedHistoryState` and `RouteHourlyProfileState`; set it in the catch
(after re-throwing/ignoring abort per the loader convention) with one
`console.warn`; `unavailable` remains reserved for a clean 404/null.

**Verify**: typecheck exits 0; every switch/conditional over these states
compiles (the compiler finds the render sites for you — handle each).

### Step 3: Honest empty states in the segment readout

`SegmentExplorer.tsx`:

- `SegmentSparkline` (`:1069-1084`): distinct branches — `error` → "Speed
  history could not be loaded."; `spineReadiness === null` (thread a flag
  from `segment-history-data`) → "Speed history for this route predates the
  current segment matching and needs a rebuild."; genuinely absent series →
  keep "No month history for this segment."
- `HistoricalStatus` (`:783-789`): add the `null`-readiness explanation so
  the disabled month/daypart controls always say why.
- `segment-history-data.ts`: return a `reason` discriminant
  (`"missing" | "spine_unclassified" | "needs_pattern_review" | "failed"`)
  instead of collapsing everything to `"unavailable"` — additive union, no
  behavior change for the ready path.

**Verify**: new unit tests (see test plan) pass.

### Step 4: Route-map hover hygiene

`RouteMapLibre.map.tsx`:

- `:266-276`: guard the setter (skip when `segmentId` equals the last sent
  value, tracked in a ref) and ADD the else-branch — a hover over a
  filtered-out/unresolvable feature clears (`setHoverRef.current(null)`).
- `:483-497`: track previous hovered/pinned ids in refs; write feature-state
  only for ids whose state changed (max 4 writes per transition instead of
  N).

**Verify**: `bun test apps/web/test/shared/maplibre-runtime.test.ts --timeout 10000`
(or wherever RouteMapLibre's runtime tests live — locate with
`rg -ln "RouteMapLibre" apps/web/test`) → updated/new cases pass.

### Step 5: De-lie the section registry

`section-registry.ts:56`: replace `{ surfaces: ["map", "geometry",
"routeGeometry"] }` with the unconditional form used by overview/evidence
(the manifest never emits those keys). Add one comment naming the eight real
surface keys. Do NOT delete the `route-detail.tsx:148-160` map-only fallback
in this plan — record in the PR that it is unreachable via the capability
path (candidate for a later sweep).

**Verify**: `bun test apps/web/test/shared --timeout 15000` → section
registry tests pass.

### Step 6: Fix or drop the stale committed manifest fixture

`git log --oneline -3 -- data/artifacts/studio/v2/routes/route-capability-manifest.json`
then `rg -rn "route-capability-manifest" tools packages apps --include="*.ts"`
to find consumers. If a test/seed path reads the FILE by path, regenerate it
with the documented pipeline command for the capability manifest (find it:
`rg -n "route-capability-manifest" tools/pipeline-v2/src -l`); if nothing
reads it by path (audit finding: only the key constant is referenced),
DELETE the file and note it in the commit message. Do not hand-edit JSON.

**Verify**: `bun test apps/web/test --timeout 15000` AND
`bun --filter @bp/pipeline-v2 test` → exit 0.

### Step 7: Delete the "No flags raised" filler card

`RouteInsightList.tsx`: remove `cleanInsightState` (`:141-159`) and its call
(`:35`); when there are no renderable insights the component returns `null`
— no substitute card, no copy. Drop the `capability` prop if this was its
last use (check the call site in `OverviewSection.tsx:152-156`).

**Verify**: `rg -n "No flags raised|checked surface" apps/web/src` → no
matches; insight-list tests updated (empty insights → renders nothing).

### Step 8: Treatment display names stop leaking slugs

Client (operative fix — published artifacts already embed the slug labels):

- `route-intervention-model.ts:165-179`: for `other_documented`, resolve the
  label as (1) a small curated map for the operator-named kinds —
  `limited_to_local_conversion` → "Limited-to-local conversion",
  `priority_corridor_designation` → "Priority corridor designation",
  `overnight_service_discontinuation` → "Overnight service discontinued" —
  then (2) `rawLabel` ONLY when it differs from `rawKind` (the crosswalk
  self-label pattern means label===kind carries no information), else
  (3) `humanize(rawKind)`. Confirm `humanize` (`:331`) yields sentence case
  ("Priority corridor designation"), not raw de-underscoring.

Source (so future artifacts are born clean):

- `route-treatment-crosswalk.ts`: change the `reviewedOther` helper so a
  label equal to its kind is emitted as the humanized sentence-case form
  instead — ONE helper change covering all 137 self-labeled rows; do NOT
  hand-edit 137 call sites. Keep any row whose label already differs.
  Note in the commit: takes effect on the next inventory publication; the
  client mapping above is what fixes production today.

**Verify**: model unit test — self-labeled slug renders the curated/
humanized form; a genuinely distinct `rawLabel` still wins.
`bun --filter @bp/analytics test` → crosswalk tests updated and green.

### Step 9: "+N more" popover overflow hygiene

`TreatmentBadge.tsx`:

- Popover rows (`:193-204`): render `RouteInventoryBadge` only when
  `compactCode !== null` — the code-less fallback badge duplicates the
  adjacent label as a nowrap chip and is the overflow vector. The text span
  keeps the label + lifecycle lines.
- Add `break-words` to the row label span so no future long token can
  escape the 320px panel.
- The sr-only summary (`:183-185`) stays; end each joined entry with a
  period so copied/announced text has real seams.

**Verify**: render test — 8 `other_documented` treatments → popover shows
one label per row (no duplicate), no unbroken `[a-z_]{20,}` token in the
rendered text, container never wider than its `w-80` cap.

### Step 10: Full gates

All commands exit 0; `git status --porcelain` → in-scope only.

## Test plan

- Overview prose test updated (no speed sentence; other sentences intact).
- Readout default-source test: no selection → header-equal value; label
  contains "route average".
- Hook error test: rejected fetch → `status: "error"` (model on existing
  hook tests; if none exist, a pure reducer-style test of the state mapping
  is acceptable).
- Sparkline branch tests: error / spine-unclassified / missing → three
  distinct strings.
- Route-map: hover over filtered-out feature clears hover; repeat-id
  mousemove does not re-set state; feature-state written only for changed
  ids (assert via the mocked map's call log, matching existing runtime-test
  patterns).
- Insight list: empty insights render nothing (no clean-state card).
- Treatment labels: self-labeled slug → humanized/curated; distinct
  rawLabel preserved; crosswalk helper emits humanized labels for
  label===kind rows.
- Popover: no duplicate label per row; long tokens wrap; sr-only entries
  end with periods.

## Done criteria

- [ ] `rg -n "runs.*mph against" apps/web/src` → no matches
- [ ] `rg -n '"error"; data: null' apps/web/src/components/route/route-detail-data.ts` → 2 matches
- [ ] Three distinct history empty-state strings exist and are tested
- [ ] `rg -n "No flags raised" apps/web/src` → no matches
- [ ] `rg -n "rawLabel \?\? humanize" apps/web/src` → no matches (the
      unguarded fallback is gone)
- [ ] No public surface renders a `[a-z]+(_[a-z]+){2,}` treatment slug
      (spot-check bx41 or another route with `other_documented` rows)
- [ ] All commands exit 0; no out-of-scope files modified
- [ ] `plans/README.md` gen-21 row updated

## STOP conditions

- The dossier speed value is not reachable where Step 1 needs it without
  adding a new fetch — report the prop path you'd need instead of adding one.
- Step 6 finds a live consumer of the stale fixture that CANNOT be
  regenerated by a documented command.
- Excerpt drift beyond the drift check's expectations.

## Maintenance notes

- Plan 116's republish makes `spineReadiness` non-null in production; the
  "spine_unclassified" branch then becomes rare — keep it (it is the honest
  state for any future producer/artifact skew).
- Plan 126 later retires the SegmentExplorer map + readout rail and moves
  the interactive map to Overview. Step 3's readout strings die with that
  rail (expected; they are cheap and fix a live lie until then); the
  data-layer discriminants and Step 4's hover fixes carry forward into the
  surviving map.
- The crosswalk label fix reaches production only with the next inventory
  publication; until then the client mapping is load-bearing. If mta-wiki
  later ships reviewed display names upstream, the curated map here can
  shrink — never the label===kind guard.
- Plan 123 fills the Overview slot this plan empties; if 123 is rejected,
  Overview keeps the shorter prose — acceptable, not ideal.
- Reliability section + insight list are empty citywide per the STALE v1
  fixture's detectorFindings (`insufficient_data` 389/389) — treated as
  investigate-only here; Plan 123's spike verifies against live data before
  any design leans on it.

# Plan 105: Give the metric tabs a thin annotation layer that points at history, and remove the duplicated treatment content

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report — do not
> improvise. When done, update this plan's row in `plans/README.md`.
>
> **Dependency check (run first)**: `plans/103-route-change-chronology.md` must
> say `DONE`, and `apps/web/src/components/route/route-change-chronology.ts`
> must export `routeChangeChronology` and the `RouteChange.anchorId` field. This
> plan produces links **into** that surface; without it there is nothing to link
> to.
>
> **Drift check**:
> `git diff --stat b25542b0..HEAD -- apps/web/src/components/route/SegmentExplorer.tsx apps/web/src/components/route/OverviewSection.tsx apps/web/src/components/route/intervention-trend-model.ts apps/web/src/components/route/RouteMapLibre.tsx`

## Status

- **State**: TODO
- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (adds links and one tag; deletes nothing a reader depends on)
- **Depends on**: `plans/103-route-change-chronology.md` (HARD)
- **Category**: direction
- **Planned at**: commit `b25542b0`, 2026-07-24

## Why this matters

The operator-approved rule from the 2026-07-24 concept is:

> If it has a date, it is history. If it is a condition, it belongs to the
> metric that measures it.

Plan 103 gave history the dated changes. This plan completes the other half:
the metric tabs keep their current-condition content and receive **pointers
only** — no treatment cards, no second inventory, no before-and-after figures.
Without it, a reader looking at a slow segment has no way to learn that a bus
lane runs through it, and a reader in history has no way to see where a change
landed on the street.

The review test that decides every placement in this plan: if a block could be
copied into history and still make sense there, it does not belong in a metric
tab, and vice versa. Every addition below is a link or a four-word tag.

## Current state

### The map is in the Slow segments tab, not Overview

This is the fact most likely to be got wrong. `apps/web/src/studio/pages/route-detail.tsx`
composes four tabs (`:100-179`); the `segments` tab renders
`SegmentExplorerSection`, which owns the ranked segment list **and** the map
together (Plan 081's linked explorer). Overview has no map.

`apps/web/src/components/route/SegmentExplorer.tsx` (43 KB at `b25542b0`)
already carries a painted-lane layer:

- `useBusLanes(...)` loads published NYC DOT bus-lane centreline geometry
  behind the `lanes` search key (`:80-146`), with an explicit unavailable
  reason when the published layer is not ready;
- `RouteMapLibre` receives `showLanes` and `busLanes` (`:429-444`);
- a checkbox labelled `Painted bus lanes (DOT)` toggles it (`:479-488`);
- `SegmentSpeedLegend` (`:577-600`) already legends the speed bands and the
  lane line.

So the map layer and its legend exist. What is missing is the connection to the
change that created the lane.

The route detail payload's `segments[]` carries a per-segment
`lane: "yes" | "partial" | "minimal" | "none"` field, and `laneReadoutLine` is
already used for the selected-segment readout (`SegmentExplorer.tsx:816`). Lane
coverage genuinely varies within a route (309 of 350 segments in the reviewed
sample), which is why segment-grain lane display is legitimate where route-level
camera enforcement and signal priority are not — those have zero within-route
variance and Plan 081 deliberately removed them from segment rows. **Do not
reintroduce them.**

### Overview's trend markers exist but do not render today

`apps/web/src/components/route/OverviewSection.tsx:48` calls
`routeSpeedInterventionTrend(...)` from
`apps/web/src/components/route/intervention-trend-model.ts`, which returns
markers only when **both** the Plan 090 observation bundle and the Plan 091
inventory bundle decode and agree on release identity (`:76-94`). Both artifacts
return HTTP 404 in production as of 2026-07-24 — they are built but have never
been exported — so `dossierFallback` runs and `markers` is always empty.

That is the correct fail-closed behaviour and this plan does not change it.
This plan makes the markers *link* when they do render. Until the artifacts are
published there will be nothing to see on Overview, and the plan's Overview work
is verified by unit test rather than by eye.

Overview also renders `TreatmentBadgeRow` (`:77`) with the current treatment
summary. Under the tense rule that is a **condition** and it stays.

### Conventions and constraints

- Deep links into history use the Plan 092 URL contract:
  `/routes/<exact-slug>?tab=history&record=<stable-id>`. `study` and `record`
  are mutually exclusive and `study` wins when both are supplied. Do not add a
  new search key.
- `tests/harness/design-doctrine.test.ts` bans the interpunct `·` and
  `&middot;` on any line under `apps/web/src`. `components/route/RouteGeoMap.tsx`
  is on the shrink-only allowlist; **if you touch that file you must remove its
  allowlist entry in the same commit**, and the stale-entry guard will fail the
  build if you remove the entry without cleaning the file.
- Audience is a non-technical MTA governance reader. The segment tag is four
  words of plain English.
- Exact route identity: links carry the exact slug; never strip or manufacture
  a suffix.

## Target contract

Three additions and two deletions. Nothing else.

### Addition 1 — Segment rows say when a change covers them

A segment whose `lane` is `yes` or `partial` gains a quiet tag reading
`In the bus lane`. It is text, not a badge, in the muted ink token, and it
links to the bus-lane change in history when the chronology has one:
`/routes/<slug>?tab=history&record=<anchorId>`. When no bus-lane change exists
in the chronology, the tag renders as plain text with no link.

The tag carries **no date**. The date is a route-level fact and the segment row
is segment grain; the year lives on the change entry the link opens.

`minimal` and `none` get no tag. No other treatment gets a segment tag.

### Addition 2 — The map legend points at history

The existing `Painted bus lanes (DOT)` legend entry gains a trailing link
reading `What changed` targeting the same history anchor as Addition 1. The
legend keeps its current wording for what the line is; nothing about the layer's
geometry, readiness or unavailable reason changes.

### Addition 3 — Trend markers open the change they mark

`TrendMarker` in `intervention-trend-model.ts` already carries
`occurrenceIds` and `treatmentIds`. Add a derived `recordAnchorId: string | null`
to the type, resolved through `treatmentRecordAnchorId(...)` from the first
occurrence id, and render the marker label in `OverviewSection` as a link to
`?tab=history&record=<recordAnchorId>` when it is non-null. A marker with no
resolvable anchor stays plain text.

Marker eligibility, gating, release checks and the `dossierFallback` path are
**unchanged**. This plan adds a field and a link; it does not widen what
qualifies as a marker, and it does not introduce a second marker source from
the route projection.

### Deletion 1 — no treatment inventory outside Overview

Grep the four tab surfaces and remove any treatment list, badge strip or
inventory that is not Overview's single `TreatmentBadgeRow`. At `b25542b0`
there should be none left after Plan 103 removes History's; verify rather than
assume.

### Deletion 2 — no before-and-after figure outside history

No metric tab may render a delta, an estimate, a confidence interval or a study
tier. Overview shows a trend and a marker; the number lives in history.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `bun test apps/web/test/shared/route-segment-explorer.test.ts apps/web/test/shared/overview-section.test.ts apps/web/test/shared/intervention-trend-model.test.ts --timeout 5000` | all pass |
| Web suite | `bun run test:web` | exit 0 |
| Typecheck | `bun run check:types` | exit 0 |
| Doctrine | `bun run check:design-doctrine` | exit 0 |
| Architecture | `bun run check:architecture` | exit 0 |
| Style | `bun run check:style` | exit 0 |
| Build and budgets | `bun run check:web-release` | exit 0 |
| Full gate | `bun run check` | exit 0 |

## Scope

**In scope** (the only files you may create or modify):

- `apps/web/src/components/route/SegmentExplorer.tsx` (the segment tag and the
  legend link)
- `apps/web/src/components/route/intervention-trend-model.ts` (add
  `recordAnchorId` to `TrendMarker`)
- `apps/web/src/components/route/OverviewSection.tsx` (link the marker label)
- `apps/web/test/shared/route-segment-explorer.test.ts`
- `apps/web/test/shared/overview-section.test.ts`
- `apps/web/test/shared/intervention-trend-model.test.ts`
- `knowledge/log.md` (append only)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/components/route/RouteMapLibre.tsx`,
  `RouteMapLibre.map.tsx`, `maplibre-style.ts` — the lane layer's geometry,
  styling and readiness handling are Plan 081's and stay as they are. This plan
  touches the legend text in `SegmentExplorer.tsx` only.
- `apps/web/src/components/route/RouteGeoMap.tsx` — it is on the doctrine
  allowlist and touching it obliges a ratchet cleanup that is not this plan's
  job.
- `apps/web/src/components/route/TreatmentsHistorySection.tsx` and
  `route-change-chronology.ts` — Plan 103 owns them. This plan consumes
  `anchorId`; it does not change how anchors are minted.
- Marker eligibility, the observation gate, release-identity checks, or the
  `dossierFallback` path in `intervention-trend-model.ts`.
- Any attempt to render markers from `route.interventions[]` when the
  observation bundle is absent. That would bypass the Plan 090/093 relevance
  gate and is explicitly forbidden.
- Reintroducing route-level camera enforcement or signal priority to segment
  rows. Plan 081 removed them for lack of within-route variance.
- `packages/**` and `tools/**`.

## Git workflow

- Branch: `codex/105-metric-tab-annotation-layer`, cut after Plan 103 lands.
- Commits by logical unit: segment tag and legend link; trend marker anchor;
  the duplication sweep and docs.
- Do not push, open a PR, publish artifacts, or deploy unless separately asked.

## Steps

### Step 1: Resolve the bus-lane change anchor once

Add a small pure helper — in `SegmentExplorer.tsx` if it is used only there, or
alongside it if Overview needs it too — that takes the route's chronology and
returns the anchor id of the most recent bus-lane change, or `null`:

```ts
function busLaneChangeAnchor(chronology: RouteChangeChronology | null): string | null
```

It selects the newest change whose `treatmentLabels` includes the bus-lane
label. It never parses a title.

**Verify**: `bun test apps/web/test/shared/route-segment-explorer.test.ts --timeout 5000`
→ passes, including a fixture with no bus-lane change returning `null`.

### Step 2: Tag lane-covered segment rows

1. Render `In the bus lane` on rows whose `lane` is `yes` or `partial`, in the
   muted ink token, wrapped in a `Link` when the anchor is non-null.
2. Do not add a badge, an icon, a colour swatch or a count.
3. Confirm no nested interactive control: the segment row is already clickable,
   so the tag must sit outside the row's own click target or the row must not
   be a button. Check the existing markup before adding the link and, if it
   would nest, render the tag as plain text and put the link in the
   selected-segment readout instead. Report which you chose.

**Verify**:

```sh
bun test apps/web/test/shared/route-segment-explorer.test.ts --timeout 5000
rg -n "In the bus lane" apps/web/src/components/route/SegmentExplorer.tsx
```

Expected: tests pass; exactly one match.

### Step 3: Link the map legend

Append a `What changed` link to the existing lane legend entry, targeting the
same anchor. When the anchor is `null` the legend renders exactly as it does
today.

**Verify**: `bun run check:design-doctrine` → exit 0 (no interpunct introduced).

### Step 4: Give trend markers an anchor

1. Add `recordAnchorId: string | null` to `TrendMarker` in
   `intervention-trend-model.ts`, resolved from the first entry of
   `occurrenceIds` through `treatmentRecordAnchorId`.
2. In `OverviewSection.tsx`, render the marker label as a `Link` to
   `?tab=history&record=<recordAnchorId>` when non-null.
3. Change nothing else in the model. The existing eligibility, grouping,
   ordering, cap and fallback tests must pass unmodified.

**Verify**:

```sh
bun test apps/web/test/shared/intervention-trend-model.test.ts apps/web/test/shared/overview-section.test.ts --timeout 5000
git diff b25542b0..HEAD -- apps/web/src/components/route/intervention-trend-model.ts | rg -n "^-" | rg -v "^--- "
```

Expected: tests pass; the second command shows only the lines your additions
replaced, and no removed line touches `routeSpeedInterventionTrend`'s gating
logic.

### Step 5: Sweep the duplication and run the gate

```sh
rg -n "TreatmentBadgeRow|TreatmentBadgeStrip|TreatmentInventory" apps/web/src
rg -n "effectMph|confidenceInterval|claimTier" apps/web/src/components/route/SegmentExplorer.tsx apps/web/src/components/route/OverviewSection.tsx apps/web/src/components/route/RidersSection.tsx apps/web/src/components/route/ReliabilitySection.tsx
bun run check:types
bun run check:style
bun run check:architecture
bun run test:web
bun run check:web-release
bun run check
```

Expected: the first `rg` shows `TreatmentBadgeRow` only in
`OverviewSection.tsx` and its own component file; the second returns no
matches; all commands exit 0.

Append a receipt to `knowledge/log.md` and update Plan 105's row in
`plans/README.md`.

## Test plan

- `route-segment-explorer.test.ts`: a `yes` segment renders the tag; a `partial`
  segment renders the tag; `minimal` and `none` do not; the tag links to the
  anchor when one exists and is plain text when it does not; the rendered
  markup contains no nested interactive element inside the row's click target.
- `overview-section.test.ts`: a marker with an anchor renders a link carrying
  `tab=history` and the exact record id; a marker without one renders plain
  text; the treatment badge row is still present (it is a condition and must
  not be removed).
- `intervention-trend-model.test.ts`: `recordAnchorId` is derived from the
  first occurrence id and is `null` when `occurrenceIds` is empty; **every
  existing assertion in this file passes unmodified** — if one needs changing,
  that is a STOP condition, because it means the gate moved.
- Exact identity: a B44 fixture and a B44+ fixture produce links to `b44` and
  `b44-sbs` respectively and never cross-link.

## Done criteria

ALL must hold:

- [ ] `rg -n "In the bus lane" apps/web/src/components/route/SegmentExplorer.tsx`
      returns exactly one match.
- [ ] `rg -n "TreatmentBadgeRow" apps/web/src/components/route/` returns a match
      only in `OverviewSection.tsx`.
- [ ] `rg -n "effectMph|confidenceInterval|claimTier" apps/web/src/components/route/SegmentExplorer.tsx apps/web/src/components/route/OverviewSection.tsx apps/web/src/components/route/RidersSection.tsx apps/web/src/components/route/ReliabilitySection.tsx`
      returns no matches.
- [ ] `rg -n "·|&middot;" apps/web/src/components/route/SegmentExplorer.tsx apps/web/src/components/route/OverviewSection.tsx`
      returns no matches.
- [ ] Every pre-existing assertion in
      `apps/web/test/shared/intervention-trend-model.test.ts` passes unmodified.
- [ ] `bun run test:web` exits 0.
- [ ] `bun run check` exits 0.
- [ ] `bun run check:web-release` exits 0 with both bundle budgets passing.
- [ ] `git status` shows no modified file outside the In-scope list.
- [ ] Plan 105's row in `plans/README.md` is updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 103 is not DONE or the chronology does not expose `anchorId`.
- The segment tag would have to nest an interactive element inside an existing
  clickable row and moving it to the readout is not acceptable in the current
  markup. Report the markup rather than shipping nested controls.
- Adding `recordAnchorId` requires changing which events qualify as markers, or
  any existing `intervention-trend-model.test.ts` assertion fails.
- You are tempted to derive markers from `route.interventions[]` because the
  observation bundle is missing. That bypasses the relevance gate. Report the
  temptation instead.
- Touching the lane legend would require editing `RouteMapLibre.tsx` or
  `RouteGeoMap.tsx`.
- Any work would reintroduce route-level camera enforcement or signal priority
  to a segment row.

## Maintenance notes

- Overview's markers will show nothing until the Plan 091 route-intervention
  inventory and the Plan 090 observation bundles are exported and published;
  both return HTTP 404 today. That is a data-publication task, not a UI bug,
  and it is recorded as a prerequisite in `plans/README.md`. This plan's
  Overview work is deliberately verified by unit test.
- The segment tag is the only treatment fact allowed at segment grain, because
  lane coverage is the only one with real within-route variance. A reviewer
  should reject any proposal to add camera or signal-priority tags there.
- When mta-wiki plans 041–043 land, the map can draw a change's exact extent
  rather than the whole DOT lane layer. That is a new plan; it will replace
  Addition 2's link with a real extent highlight, and the tag in Addition 1
  should then carry the extent, not the route-level lane flag.

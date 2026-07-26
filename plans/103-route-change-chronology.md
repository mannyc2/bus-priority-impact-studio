# Plan 103: Rebuild route Treatments & history as a change chronology that shows order, duration and overlap

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report — do not
> improvise. When done, update this plan's row in `plans/README.md`.
>
> **Dependency check (run first)**: `plans/102-typed-change-dates.md` must say
> `DONE` and `apps/web/src/studio/change-date.ts` must exist and export
> `parseChangeDate`, `compareChangeDatesNewestFirst`, `changeDatesOverlap` and
> `changeDateGroupLabel`. If it does not, STOP — this plan's core claim is an
> interval intersection and cannot be built on raw strings.
>
> **Comp gate (run next)**: `plans/mockups/103-route-change-chronology/route-history-comp.html`
> must exist. It is the approved visual and copy authority for this plan. Open
> it before writing any markup, and treat any conflict between this prose and
> the comp as a STOP condition rather than choosing one.
>
> **Drift check**:
> `git diff --stat b25542b0..HEAD -- apps/web/src/components/route/TreatmentsHistorySection.tsx apps/web/src/components/route/route-history-ledger.ts apps/web/src/components/route/RouteHistoryOutcomes.tsx apps/web/src/components/route/route-intervention-model.ts apps/web/test/shared/treatments-history.test.ts`

## Status

- **State**: TODO
- **Priority**: P1
- **Effort**: L
- **Risk**: MED (replaces the whole public History surface; bounded by pure
  view models, an approved comp, no schema change, and honest empty states for
  every artifact this plan cannot yet consume)
- **Depends on**: `plans/102-typed-change-dates.md` (HARD)
- **Category**: direction
- **Planned at**: commit `b25542b0`, 2026-07-24

## Why this matters

The operator's product question is "what did NYC change for buses, where and
when did it happen, and what happened next". The route History tab currently
answers the first half as four stacked inventories — current state, a flat
ledger, documented treatments, before-and-after cards — that share a route and
nothing else, and answers the second half with a single route-average line.

The tab only earns its existence if it does the one thing no metric tab can do:
show that changes have **order, duration and overlap**. On the Bx41, a bus lane,
off-board fares, wider stop spacing, banned left turns and signal priority all
landed on Webster Avenue inside nine months of 2013, and our segment speed
record begins a decade later. No before-and-after on that route can be credited
to any one of them. Overview cannot say that. Slow segments cannot say that.
A chronology that draws intervals and marks where they intersect can, and that
is the product.

This plan also removes the duplication the operator flagged: History stops
carrying a current-state inventory (a condition, which belongs to the metric
tabs), stops carrying a separate sources index, and stops explaining the data
model to the reader.

## Current state

### Four sections that do not compose

`apps/web/src/components/route/TreatmentsHistorySection.tsx` (412 lines at
`b25542b0`) renders, in order:

- a sticky `CurrentStateSummary` sidebar card driven by
  `inventory?.currentState`, with `currentStateStatus` producing one of four
  titles (`TreatmentsHistorySection.tsx:150-179`);
- a `HistoryLedger` card grouping `HistoryLedgerRow`s by year with a search box
  and a record-type `<select>` above 12 rows (`:196-335`);
- `RouteHistoryOutcomes`, a separate card of comparison and study cards
  (`apps/web/src/components/route/RouteHistoryOutcomes.tsx`);
- and inside the ledger rows, a kind eyebrow that prints the raw record kind
  (`:369` renders `row.kind === "source_gap" ? "Source gap" : row.kind`).

The ledger is built by `buildRouteHistoryLedger` in
`apps/web/src/components/route/route-history-ledger.ts`, which merges typed
occurrences, typed treatments, route projection interventions, wiki timeline
events, wiki treatments, projects and source gaps into one flat
`HistoryLedgerRow[]` keyed `${kind}:${recordId}` and sorted newest first.

### The data this plan can actually consume today

Measured on 2026-07-24 against the live deployment:

| Input | Where from | Reality today |
|---|---|---|
| Route projection interventions | `GET /api/v1/studio/routes` → `route.interventions[]` | 569 records over 389 routes; all strict ISO `year`; 66 routes have none |
| Wiki route evidence | `GET /api/v1/artifacts/studio/v2/wiki/routes/<slug>.json` | **12 routes only**. Bx41: 114 timeline (109 dated), 106 treatments, 5 projects, 183 metricClaims, 422 citations across 52 documents |
| Published studies | `GET /api/v1/artifacts/studio/v2/routes/<slug>/studies.json` | 7 routes only: `b67 b82-sbs bx28 bx38 bx9 m79-sbs m96` |
| Plan 091 inventory | `studio/v2/routes/<slug>/intervention-inventory.json` | **HTTP 404 — built but never exported.** `routeInterventionViewModel(null)` already returns the `unavailable` coverage state |
| Plan 090 observations | route observation bundle | 404 for the same reason |

The study routes and the evidence-bundle routes are **disjoint sets**: no route
currently has both a documentary history and a published study. The design must
read correctly in both halves of that split, and on the 370 routes that have
neither.

`RouteHistoryOutcomes.tsx` reads `route.interventions[].comparisonCohort` and
the per-route studies artifact and is the only place a numeric result is shown.
236 of the 569 route annotations carry a `comparisonCohort`; those are
peer-adjusted, explicitly `comparison_adjusted_not_causal_proof`, and must stay
muted and unlinked (Plan 089 decision D26, still binding).

### Copy rules that this surface currently violates

From `knowledge/wiki/engineering/studio_design_pass_status.md`, "Study-card /
chart-card rules — 2026-07-10 (approved comp)", quoted because the executor has
not read that page:

> - Method/gate internals (pre-trend, placebo, sample checks, control pools)
>   never render on a card face; they live in the "Method & provenance"
>   SourceNote popover. A single plain-language caveat sentence may stay
>   visible when it qualifies a public claim.
> - Terse copy: minimal stat labels ("vs controls"); null display copy is
>   "No clear change" … no date/window lines where the chart itself carries the
>   dates.

`tests/harness/design-doctrine.test.ts` additionally bans, in
`apps/web/src/**`: the interpunct character `·` and the HTML entity
`&middot;` on any line (allowlist holds only `components/CorridorMap.tsx` and
`components/route/RouteGeoMap.tsx`, and is shrink-only); kicker eyebrows
matched by `/uppercase[^"'`]*tracking-\[0\.1[246]em\]/`; and the phrases
`data as of`, `how we know this`, `no detectable change`, among others.

The audience for every visible string is a non-technical MTA governance reader.
`source_gap`, `occurrence`, `registry`, `join`, `bundle`, `artifact`,
`coverage state` and `record kind` must not appear in rendered text.

### Conventions to match

- Pure view models live in `apps/web/src/components/route/*.ts` and export
  named functions; components live in `*.tsx`. `route-history-ledger.ts` is the
  exemplar for the model and `TreatmentsHistorySection.tsx` for the component.
- Cards use `SectionCard` from `@/components/SectionCard`; citations use
  `citationEntries` and `SourceNote` from `@/components/SourceNote`; route
  identity uses `RouteBadge` from `@/components/RouteBadge`.
- Charts: `knowledge/wiki/engineering/studio_design_pass_status.md` fixes the
  stack — native shadcn chart components over Recharts v3 only. No visx, no
  Plot, no D3, no new chart dependency. Heavy chart modules stay behind a lazy
  `X.chart.tsx` split, as `MapHourStrip.tsx` / `MapHourStrip.chart.tsx` do.
- URL contract from Plan 092 stays binding: `?tab=history&study=<eventKey>` and
  `?tab=history&record=<id>` are mutually exclusive, `study` wins when both are
  supplied, targets are focused through one reduced-motion-aware helper
  (`useHistoryTarget` in `TreatmentsHistorySection.tsx:395-412`), and unknown
  anchors degrade to the top of History without an error.

## Target contract

Three parts, in this order, replacing everything currently in the tab.

### Part 1 — Standing

One card. A written sentence naming what the route has and when it arrived,
followed by a row of chips, one per current treatment, each linking to its
entry in the chronology, plus one link out to the map.

The sentence is **composed from typed fields, never authored prose**. Build it
from the treatments present, their earliest effective dates, and whether any
proposed change exists. Emit exactly one of four shapes:

| Condition | Sentence |
|---|---|
| No treatment known and no inventory | `We have no documented change on this route.` |
| Inventory says checked, nothing found | `We checked the sources we hold and found no documented change on this route.` |
| One or more treatments, none proposed | `` `The {routeLabel} has {list}. The most recent arrived in {year}.` `` |
| One or more treatments, some proposed | the above, plus `` ` {n} further {change/changes} {is/are} proposed.` `` |

`{list}` is the treatment labels from
`interventionPresentationForTreatment(...).label`, lowercased except acronyms,
joined with commas and a final "and". Do not exceed four labels; beyond four,
render the first three and `and {n} more`.

The chips carry the treatment label and its first year, nothing else. No
interpunct. No count line.

### Part 2 — The chronology

One card containing a shared horizontal time axis with two layers.

**Layer A, context**: the route's monthly speed series drawn as a faint area,
using the existing `SpeedTrend` primitive's data source
(`data.dossier` trend points, the same input `OverviewSection` already passes
to `routeSpeedInterventionTrend`). If no trend points exist, the layer is
omitted and the axis stands alone. It carries no y-axis labels and no numbers;
it is context for reading the bands, not a measurement.

**Layer B, the changes**: one horizontal band per change, positioned by its
`ChangeDate` interval. A `day` or `month` precision renders as a point marker;
`quarter`, `year` and `range` render as a bar spanning the interval. Bands pack
into as few rows as fit without touching. `unknown` dates get no band and are
listed under the chronology as an undated group.

**Overlap** is the payload. Compute it with `changeDatesOverlap` from Plan 102
over every pair of bands, and render a hatched vertical region across every
span where two or more bands intersect. Each overlapping change's entry (Part 3)
gains one plain sentence naming the others it cannot be separated from.

Below the chronology, one line collapsing everything that is not a change:

> `{n} further records: community board meetings, contract awards and
> construction phases across {m} projects.`

with a disclosure that expands them into the existing ledger rows. This is
where the 408-of-787 process events go. **Milestones never appear as bands.**

### Part 3 — The changes

One entry per change, newest first, each with:

- the date, rendered from `ChangeDate.display`;
- a title in transit language;
- one or two sentences saying what changed, composed from typed fields;
- an **evidence slot** (below);
- a source line: a sentence citing the documents, with any agency-stated figure
  folded into the sentence and attributed. Citations use the existing
  `SourceNote` entries so PDF page anchors keep working.

The evidence slot is a discriminated union with exactly five states. This is the
central contract of the plan; every state must be reachable and tested:

```ts
export type ChangeEvidence =
  | { kind: "study"; tier: "matched" | "descriptive"; study: StudyArtifact }
  | { kind: "peer_adjusted"; cohort: NonNullable<StudioIntervention["comparisonCohort"]> }
  | { kind: "confounded"; overlappingTitles: readonly string[] }
  | { kind: "no_product"; reason: NoProductReason }
  | { kind: "too_early"; monthsSince: number };
```

Display copy per state, verbatim (the reason lives in the provenance popover,
per the study-card rules):

| State | Headline | Body sentence |
|---|---|---|
| `study`, matched | the signed estimate, e.g. `+0.14 mph` | `Compared with matched control segments.` |
| `study`, descriptive | the signed estimate | `Before and after this change, without a control comparison.` |
| `peer_adjusted` | the signed delta, muted, unlinked | `Compared with similar routes. Not a controlled result.` |
| `confounded` | `Cannot be separated` | `` `{n} other changes landed on this route at the same time: {titles}.` `` |
| `no_product` | `Nothing to measure it with` | one sentence per reason, from the table below |
| `too_early` | `Too early to say` | `` `{n} months of data since this change.` `` |

`NoProductReason` and its sentence, all in transit language:

| Reason | Sentence |
|---|---|
| `intersection_grain` | `We hold speeds by road segment and by route, not by intersection.` |
| `stop_grain` | `We hold speeds by road segment and by route, not by individual stop.` |
| `no_speed_record` | `` `Our speed record starts in {year}, after this change.` `` |
| `route_scope_mismatch` | `This change covers part of the route, so a route-wide average would not show it.` |
| `not_yet_specified` | `We have not yet defined how to measure this kind of change.` |

Selection is **value-blind and ordered**: `study` beats `peer_adjusted` beats
`confounded` beats `too_early` beats `no_product`. Never inspect an estimate's
magnitude, sign or significance to choose a state.

`study` is admitted only from the published per-route studies artifact, matched
on `eventKey`. Candidate, `awaiting_approval` and unpublished rows are never
inputs. Plans 074 and 075 gate files stay byte-unchanged.

### What is deleted

- The `CurrentStateSummary` sidebar card and `currentStateStatus`. Current
  state is a condition; it stays on Overview's `TreatmentBadgeRow` and on the
  map. History gets the Standing sentence instead.
- The separate `RouteHistoryOutcomes` card. Outcomes move into the entry they
  belong to. `interventionComparisonCards` survives as a pure helper feeding
  the `peer_adjusted` state.
- The record-type `<select>` filter. With milestones collapsed, the ledger is
  changes plus a disclosure, and a "Type: Events / Treatments / Projects /
  Source gaps" control is the data model leaking.
- Any rendered string containing `source_gap`, `occurrence`, `record`,
  `bundle`, `coverage`, `inventory` or `registry`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `bun test apps/web/test/shared/treatments-history.test.ts apps/web/test/shared/route-change-chronology.test.ts --timeout 5000` | all pass |
| Web suite | `bun run test:web` | exit 0 |
| Typecheck | `bun run check:types` | exit 0 |
| Doctrine | `bun run check:design-doctrine` | exit 0 |
| Architecture | `bun run check:architecture` | exit 0 |
| Style | `bun run check:style` | exit 0 |
| Build and budgets | `bun run check:web-release` | exit 0 |
| Full gate | `bun run check` | exit 0 |

## Suggested executor toolkit

- Use the `shadcn` skill if available when composing the chronology from
  existing chart primitives. Do not add a chart library.
- Read `plans/mockups/075-history-tab/study-cards-comp.html` before writing the
  `study` evidence state — it is the approved anatomy for that card and this
  plan reuses it rather than inventing a second one.
- Read `apps/web/src/components/route/MapHourStrip.tsx` and
  `MapHourStrip.chart.tsx` for the lazy chart-split idiom before adding the
  chronology chart.

## Scope

**In scope** (the only files you may create or modify):

- `apps/web/src/components/route/route-change-chronology.ts` (new — the pure
  model: change assembly, band packing, overlap, evidence selection)
- `apps/web/src/components/route/RouteChangeChronology.tsx` (new — the
  chronology card)
- `apps/web/src/components/route/RouteChangeChronology.chart.tsx` (new — the
  lazy chart layer, if the axis needs Recharts)
- `apps/web/src/components/route/TreatmentsHistorySection.tsx` (rewrite)
- `apps/web/src/components/route/route-history-ledger.ts` (keep as the source
  of the collapsed milestone rows; remove nothing else)
- `apps/web/src/components/route/RouteHistoryOutcomes.tsx` (reduce to the pure
  `interventionComparisonCards` helper plus the study-card renderers the
  evidence slot calls)
- `apps/web/test/shared/route-change-chronology.test.ts` (new)
- `apps/web/test/shared/treatments-history.test.ts`
- `knowledge/wiki/engineering/studio_design_pass_status.md` (record the
  approved comp and the tense rule)
- `knowledge/log.md` (append only)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/components/route/OverviewSection.tsx`,
  `SegmentExplorer.tsx`, `RidersSection.tsx`, `RouteGeoMap.tsx`,
  `RouteMapLibre.tsx` — the metric tabs and the map are Plan 105. Do not add or
  remove treatment content there in this plan.
- `apps/web/src/components/route/intervention-trend-model.ts` — Plan 082's
  marker model. Overview keeps it.
- `packages/**` and `tools/**` — no schema, estimator or artifact change.
- `tools/pipeline-v2/src/lib/study-engine/**` and
  `packages/domain/src/studio/study.ts` — Plans 074/075 gates stay
  byte-unchanged.
- `apps/web/src/routes/routes/$routeId.tsx` — the loader and
  `validateRouteDetailPageSearch` already supply everything this plan needs.
- The `?study=` / `?record=` URL contract. Preserve it exactly; do not add a
  new search key.

## Git workflow

- Branch: `codex/103-route-change-chronology`, cut after Plan 102 lands.
- Commits by logical unit: the pure model plus its tests; the chronology
  component; the section rewrite plus test updates; docs.
- Do not push, open a PR, publish artifacts, or deploy unless separately asked.

## Steps

### Step 1: Build the pure chronology model

Create `apps/web/src/components/route/route-change-chronology.ts` exporting:

```ts
export type RouteChange = {
  key: string;
  anchorId: string;          // reuse treatmentRecordAnchorId from route-intervention-model
  date: ChangeDate;
  title: string;
  summary: string;
  treatmentLabels: readonly string[];
  citationKeys: readonly string[];
  sourceLabels: readonly string[];
  agencyClaims: readonly AgencyClaim[];
  evidence: ChangeEvidence;
};

export type RouteChangeChronology = {
  standing: { sentence: string; chips: readonly { label: string; year: string; anchorId: string }[] };
  changes: readonly RouteChange[];
  undatedChanges: readonly RouteChange[];
  bands: readonly ChronologyBand[];
  overlaps: readonly { start: string; end: string; changeKeys: readonly string[] }[];
  collapsed: { recordCount: number; projectCount: number; rows: readonly HistoryLedgerRow[] };
};

export function routeChangeChronology(input: {
  route: StudioRouteDetailResponse["route"];
  evidence: StudioRouteEvidenceBundle | null;
  inventory: StudioRouteInterventionInventoryBundle | null;
  studies: RouteStudiesArtifact | null;
  trendMonths: readonly string[];
}): RouteChangeChronology;
```

Rules:

1. **A record is a change when it has a treatment identity**: a typed inventory
   occurrence or treatment, a route projection intervention, or a wiki record
   whose `recordKind` is `treatment_component` or whose `eventFamily` marks an
   implementation or launch. Everything else is a milestone and goes to
   `collapsed`. Reuse `buildRouteHistoryLedger` to assemble the merged row set
   and partition it; do not write a second merger.
2. Deduplicate exactly as `buildRouteHistoryLedger` already does — by stable
   record relationships, never by title text or by year plus family.
3. Parse every date with `parseChangeDate`. Sort with
   `compareChangeDatesNewestFirst`.
4. Compute overlaps by pairwise `changeDatesOverlap` over dated changes only.
   Group intersecting changes into maximal clusters; a cluster of size 1 is not
   an overlap. Every change in a cluster of size ≥ 2 gets
   `evidence: { kind: "confounded", overlappingTitles }` **unless** a published
   study exists for it — a study has already passed its own gates and outranks
   the heuristic.
5. Select evidence in the fixed order given in the target contract. The
   `no_speed_record` reason fires when the change's interval ends before the
   first month in `trendMonths`.
6. Extract `agencyClaims` from `evidence.metricClaims` where the claim's
   `citationKeys` intersect the change's. Shape:
   `{ metricName: string; rawValue: string; period: string | null; citationKeys: readonly string[] }`.
   Never convert, average or compare them.

**Verify**: `bun test apps/web/test/shared/route-change-chronology.test.ts --timeout 5000`
→ all pass, including the fixture cases in the Test plan.

### Step 2: Render the chronology card

Create `RouteChangeChronology.tsx` (plus `.chart.tsx` if Recharts is needed for
the axis), matching
`plans/mockups/103-route-change-chronology/route-history-comp.html` exactly for
layout, copy and colour.

1. Bands are absolutely positioned within a relative track, left and width
   derived from the interval against the axis domain. Point-precision changes
   render as a fixed-width marker, not a 1-day-wide bar.
2. Overlap regions render behind the bands as a hatched fill with a dashed
   edge, `aria-hidden`, and are described in text by the affected entries'
   `confounded` sentence. Colour must not be the only carrier.
3. The chart gets a `role="img"` and an `aria-label` naming the route, the year
   span and the number of changes.
4. Respect `prefers-reduced-motion`: no transitions on the bands.
5. No interpunct anywhere. No uppercase kicker over a heading.

**Verify**:

```sh
bun test apps/web/test/shared/treatments-history.test.ts --timeout 5000
bun run check:design-doctrine
```

Expected: both pass.

### Step 3: Rewrite the section and delete the duplicated surfaces

In `TreatmentsHistorySection.tsx`:

1. Replace the body with Standing, `RouteChangeChronology`, and the change
   entries. Keep the outer `sectionRef` and `useHistoryTarget` wiring exactly —
   the `?study=` / `?record=` deep links must keep working, including the
   study-over-record precedence.
2. Delete `CurrentStateSummary`, `currentStateStatus` and `CurrentStateRow`.
   Remove `currentStateStatus` from the test file's imports in Step 4.
3. Delete `HistoryControls` and the `historyKind` state. Keep the local search
   box only when `collapsed.rows.length > HISTORY_CONTROL_THRESHOLD`, and have
   it filter the collapsed disclosure, not the changes.
4. Keep the `Browse this exact route in all interventions` link, retargeted to
   `/interventions` with the route slug as it is today.
5. Grep the rewritten file for leaked vocabulary and fix every hit.

**Verify**:

```sh
rg -n "source_gap|occurrence|coverage state|record kind|inventory unavailable" apps/web/src/components/route/TreatmentsHistorySection.tsx apps/web/src/components/route/RouteChangeChronology.tsx
rg -n "·|&middot;" apps/web/src/components/route/RouteChangeChronology.tsx apps/web/src/components/route/TreatmentsHistorySection.tsx
```

Expected: both return no matches.

### Step 4: Tests

Rewrite `apps/web/test/shared/treatments-history.test.ts` to cover the new
surface and add `route-change-chronology.test.ts` for the model. Keep every
existing assertion that still applies (deep-link precedence, anchor structure,
citation entries, PDF page links).

**Verify**: `bun run test:web` → exit 0.

### Step 5: Docs and the full gate

1. Add a section to
   `knowledge/wiki/engineering/studio_design_pass_status.md` recording the
   2026-07-24 approved concept: the tense rule ("if it has a date it is
   history; if it is a condition it belongs to the metric that measures it"),
   the approved comp path, and the five evidence states with their display
   copy. This is the durable decision future plans must not re-litigate.
2. Append a receipt to `knowledge/log.md`.
3. Run the full gate.

```sh
bun run check:knowledge
bun run check:types
bun run check:style
bun run check:architecture
bun run test:web
bun run check:web-release
bun run check
```

Expected: all exit 0.

## Test plan

New `apps/web/test/shared/route-change-chronology.test.ts`, modelled on
`apps/web/test/shared/route-intervention-model.test.ts`:

- **Standing sentence**: each of the four shapes; the four-label cap; a route
  with no treatments; a route with proposed changes only.
- **Change versus milestone**: a fixture with an implementation event, a
  community-board meeting and a contract award produces one change and two
  collapsed rows.
- **Overlap**: three changes in 2013 whose intervals intersect produce one
  cluster of three, and each carries `confounded` naming the other two; a
  fourth change in 2024 is not in the cluster. A change with a published study
  inside an overlapping cluster keeps `kind: "study"`, not `confounded`.
- **Evidence selection order**: a change with both a study and a
  `comparisonCohort` selects `study`; one with only a cohort selects
  `peer_adjusted`; one with neither and a date after the first trend month
  within 6 months selects `too_early`; one before the first trend month selects
  `no_product` with `no_speed_record`.
- **Value blindness**: the same fixture with the estimate replaced by a large
  positive, a large negative, zero and null selects the identical state and
  ordering every time.
- **Agency claims**: a `metricClaim` sharing a citation key with a change
  attaches to it; one that does not, does not; no claim is ever converted or
  compared.
- **Exact identity**: a fixture containing B44 and B44+ never cross-attaches.
- **Honest absence**: `inventory: null`, `evidence: null` and `studies: null`
  together produce a chronology built from route projection interventions
  alone, with no thrown error and no invented state.

Extended in `treatments-history.test.ts` (SSR structure, `renderToStaticMarkup`
with the existing router harness):

- `?study=` and `?record=` targets still resolve, precedence preserved;
- the deleted sections are gone: assert the markup contains no
  `Current state`, no `Documented treatments`, no `Before & after`;
- no interpunct in the rendered markup;
- the collapsed disclosure reports the right counts.

## Done criteria

ALL must hold:

- [ ] `plans/mockups/103-route-change-chronology/route-history-comp.html`
      exists and the implementation matches it.
- [ ] `rg -n "CurrentStateSummary|currentStateStatus|HistoryControls" apps/web/src`
      returns no matches.
- [ ] `rg -n "·|&middot;" apps/web/src/components/route/` returns no matches
      outside the two allowlisted files.
- [ ] `rg -n "source_gap|record kind|coverage state" apps/web/src/components/route/TreatmentsHistorySection.tsx apps/web/src/components/route/RouteChangeChronology.tsx`
      returns no matches.
- [ ] `git diff --stat b25542b0..HEAD -- tools/pipeline-v2/src/lib/study-engine packages/domain/src/studio/study.ts`
      is empty.
- [ ] All five `ChangeEvidence` states are reachable and each has at least one
      test.
- [ ] `bun run test:web` exits 0.
- [ ] `bun run check` exits 0.
- [ ] `bun run check:web-release` exits 0 with both bundle budgets passing.
- [ ] `git status` shows no modified file outside the In-scope list.
- [ ] Plan 103's row in `plans/README.md` is updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 102 is not DONE or `change-date.ts` does not export
  `changeDatesOverlap`.
- The comp and this prose disagree on layout, copy or colour.
- Composing the Standing sentence would require parsing a title or description
  for meaning. Every clause must come from a typed field; if one cannot, report
  which.
- Overlap detection produces a cluster containing every change on a dense route
  such as Bx41 (114 timeline records), making the `confounded` state
  meaningless. Report the cluster sizes before shipping; the likely cause is
  treating year-precision dates as year-long intervals that swallow everything,
  and the fix is a decision for the operator, not the executor.
- A change would need a study, observation or extent artifact that returns 404
  in order to render at all. Every state must degrade to an honest empty.
- Any work would require touching Overview, the segment explorer, the map, or a
  file under `packages/` or `tools/`.
- `bun run check:web-release` fails a bundle budget: the chronology chart is the
  likely cause and must move behind the lazy `.chart.tsx` split.

## Maintenance notes

- The `ChangeEvidence` union is the extension point. When mta-wiki plans
  041–043 land and per-change extents and grain verdicts become available,
  `no_product` gains reasons and `route_scope_mismatch` becomes provable rather
  than assumed. Adding a state must fail an exhaustiveness test until it has
  display copy.
- Overlap is a public claim. Anything that changes date parsing changes which
  changes are reported as inseparable; a reviewer should treat a parser change
  and an overlap change as the same review.
- The collapsed milestone disclosure is where 408 of 787 wiki timeline records
  live. If a future release makes them a majority of a route's chronology, the
  disclosure is the pressure valve, not the band layer.
- Reviewers should check that no evidence state was selected by looking at a
  number, and that the study tier language still matches Plans 074/075.

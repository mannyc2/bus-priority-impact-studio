# Plan 104: Lead `/interventions` with how bus priority spread across the network, and demote the ledger to depth

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report — do not
> improvise. When done, update this plan's row in `plans/README.md`.
>
> **Dependency check (run first)**: `plans/102-typed-change-dates.md` must say
> `DONE` and `apps/web/src/studio/change-date.ts` must exist. Without it the
> ledger's order is still wrong and the new sections would sit above a broken
> list.
>
> **Comp gate (run next)**:
> `plans/mockups/104-network-change-record/interventions-comp.html` must exist.
> It is the approved visual and copy authority. Open it before writing any
> markup; a conflict between it and this prose is a STOP condition.
>
> **Drift check**:
> `git diff --stat b25542b0..HEAD -- apps/web/src/studio/pages/interventions.tsx apps/web/src/routes/interventions.tsx apps/web/test/shared/interventions-page.test.ts`

## Status

- **State**: TODO
- **Priority**: P1
- **Effort**: M
- **Risk**: MED (rebuilds the public network page above the existing ledger;
  bounded by an approved comp, a pure derivation from data the page already
  loads, and no new endpoint or artifact)
- **Depends on**: `plans/102-typed-change-dates.md` (HARD)
- **Category**: direction
- **Planned at**: commit `b25542b0`, 2026-07-24

## Why this matters

`/interventions` is the only page that can answer the network-scale half of
the product question. Today it answers it with a list: 2,253 rows over 67 pages
of 30, of which 61% come from 12 of 389 routes and 366 are exact duplicates. A
reader cannot learn from it what the city has been doing.

The data can answer it directly. The route projection the page already loads
carries 569 dated intervention records across 389 routes, and reducing them to
"routes first reached by each kind of treatment, by year" produces the strongest
object in the dataset. Measured on 2026-07-24: routes running on a street with a
bus lane went from 11 in 2007 to 323 today, 95 of them added in 2025 alone;
camera enforcement did not exist before 2019 and now reaches 58 routes; and two
programmes have stopped — Select Bus Service has not reached a new route since
2017 and signal priority has stood at 4 routes since 2013.

The flat lines are the reason a governance reader forwards the page. Nothing
about that finding is authored: it falls out of the data, and it puts an
unflattering fact where the reader sees it first.

## Current state

### What the page is now

`apps/web/src/studio/pages/interventions.tsx` (1,236 lines at `b25542b0`)
renders a text hero, a `Documented` / `Planned` stat-tab pair, a toolbar, a
year histogram, a column header, grouped ledger rows and an undated rollup —
the Plan 089 typed ledger, approved 2026-07-22 for decisions D22 to D27. Its
header copy is operator-approved and this plan **keeps it**:

```
What the city built for buses — and what it changed.
Every documented bus lane, busway, camera corridor, and service change on the
tracked network — with matched-control studies where the data can support them.
```

The loader `apps/web/src/routes/interventions.tsx` already fetches everything
this plan needs and nothing more: `fetchStudioRoutes` (the 389-route
projection with `interventions[]`), the reviewed corpus, the citywide evidence
bundles, the study index, and the nullable facet index.

### The exact data this plan derives from

All measured on 2026-07-24 against the live deployment.

`route.interventions[]`, 569 records over 323 of 389 routes (66 have none),
each with a strict ISO `year` (`YYYY` or `YYYY-MM`, earliest `1963`) and an
`interventionType`:

| `interventionType` | Records |
|---|---:|
| `bus_lane_infrastructure` | 375 |
| `select_bus_service` | 92 |
| `automated_bus_lane_enforcement` | 79 |
| `documented_bus_priority_intervention` | 13 |
| `transit_signal_priority` | 4 |
| `busway` | 3 |
| `stop_consolidation` | 2 |
| `queue_jump` | 1 |

Reducing to the **first year each route was reached by each type** gives the
cumulative series this plan charts. The expected values, 2007 through 2026, are:

| Series | 07 | 08 | 09 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| Bus lane | 11 | 12 | 12 | 15 | 17 | 33 | 41 | 45 | 50 | 54 | 59 | 74 | 86 | 102 | 147 | 153 | 204 | 228 | 323 | 323 |
| Camera enforcement | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 6 | 6 | 15 | 20 | 33 | 52 | 58 |
| Select Bus Service | 0 | 2 | 2 | 4 | 6 | 9 | 14 | 16 | 18 | 25 | 32 | 34 | 36 | 36 | 36 | 36 | 36 | 36 | 36 | 36 |
| Signal priority | 0 | 0 | 0 | 0 | 2 | 2 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| Busway | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 2 | 3 | 3 | 3 | 3 | 3 | 3 |
| Any treatment | 11 | 12 | 12 | 15 | 19 | 35 | 41 | 47 | 54 | 61 | 71 | 86 | 100 | 116 | 162 | 173 | 219 | 244 | 323 | 323 |

Nine bus-lane records predate 2007 (all `1963`); they are inside the 2007
starting value. **2026 is a partial year** — the served release is frozen at a
June 2026 publication — and the chart must say so.

Reviewed corpus, `studio/v2/interventions/corpus.json`: 310 records, 248
`proposed` across 22 distinct source plans. The four largest are Brooklyn Bus
Network Redesign Draft Plan (86 changes, 97 routes), Bronx Bus Network Redesign
Final Plan (53, 60), Queens Bus Network Redesign Service Change Board Item
(46, 61) and NYC DOT Better Buses Action Plan (16, 74); the remaining 18 plans
hold 47 changes.

Published study index, `studio/v2/studies/index.json`: 7 studies, 2
`segment_matched_did` and 5 `descriptive_before_after`; directions are 2
`improved`, 1 `worsened`, 4 `no_detectable_change`.

### The word that matters

`bus_lane_infrastructure` records come from `NYC DOT Bus Lanes` and are route
shape against the city's published bus-lane centreline geometry. The
serving-surface manifest is explicit that this is not audited regulatory
mileage. Every visible string must therefore say **"runs on a street with a bus
lane"**, never "has a bus lane" and never a mileage figure.

### Conventions and constraints

- Charts use the native shadcn chart component over Recharts v3, per
  `knowledge/wiki/engineering/studio_design_pass_status.md`. No visx, no Plot,
  no D3, no new dependency. Heavy chart modules go behind a lazy `X.chart.tsx`
  split; `apps/web/src/components/route/MapHourStrip.tsx` plus
  `MapHourStrip.chart.tsx` is the exemplar. The page module is already lazily
  imported by its route file, so the chart must not leak into the entry bundle.
- `tests/harness/design-doctrine.test.ts` bans the interpunct `·` and
  `&middot;` on any line under `apps/web/src`, bans kicker eyebrows matched by
  `/uppercase[^"'`]*tracking-\[0\.1[246]em\]/`, and bans the phrases
  `data as of` and `no detectable change` among others. The artifact enum stays
  `no_detectable_change`; the display form is `No clear change`.
- Plan 092's URL contract is binding and unchanged: `validateInterventionsSearch`
  in `apps/web/src/routes/interventions.tsx` keeps its bounds (`q` ≤ 120,
  `route` ≤ 96), defaults stay omitted from the URL, invalid values normalise,
  and any filter change resets pagination.
- Exact route identity: B44 and B44+ are different services. Join on the exact
  case-sensitive `routeId` and slug; never strip or manufacture a suffix.
- Audience is a non-technical MTA governance reader. No `interventionType`,
  `facet`, `corpus`, `registry`, `artifact` or `record kind` in rendered text.

## Target contract

The page becomes four things in this order. The header and its approved copy
stay exactly as they are.

### 1. How far bus priority has spread

One card. A multi-series line chart of the cumulative series above, 2007 to the
latest year present in the data, with:

- one line per treatment family, labelled at its right end with the current
  value and a plain name;
- the partial final year marked with a dashed rule and the axis label
  `2026 so far` (derive the year; do not hard-code it);
- `role="img"` and an `aria-label` naming the span, each series and its end
  value;
- no y-axis gridlines beyond a single mid rule, no legend block — the end
  labels are the legend.

Beneath it, exactly three readings, **derived, not authored**. Each is a short
heading and one sentence, computed from the same series:

- the family with the largest absolute growth over the window, its start and
  end values, and the year that added the most routes;
- the family with the largest growth in the most recent three complete years;
- the families whose value has not changed for five or more complete years,
  named with the year they last moved.

If a computed reading has no qualifying family, omit that reading rather than
weakening the rule. Never hard-code a number, a family or a year in the copy.

### 2. Which routes are changing

One card, a route index grouped by a small set of named views selected by a
new bounded URL key `group`:

| `group` value | Contents | Order |
|---|---|---|
| `recent` (default, omitted from URL) | routes whose most recent change is dated | most recent change first |
| `most` | routes by number of distinct documented changes | count descending |
| `measured` | the routes with a published study | most recent implementation first |
| `proposed` | routes named in a proposed change | number of proposed changes descending |
| `never` | routes with no documented change | route label ascending |

Each row: the route badge and label, the most recent change in a sentence with
its date, a small bar sparkline of changes per year, and a result cell. The
result cell shows the published study outcome when one exists (`Speeds rose`,
`Speeds fell`, `No clear change`, with the signed value), and otherwise a short
plain state. The row links to `/routes/<slug>?tab=history`.

The card footer carries the two honest network facts, derived:
`{n} routes have changed since {firstYear}. {m} have no documented change at
all.`

### 3. What is proposed

The 248 proposed corpus records, grouped by the plan that proposed them, not
listed. One row per source plan: plan name, number of changes, number of
distinct routes, and the treatment mix as a proportional bar with a small
legend. Top four plans expanded, the rest collapsed behind a count.

### 4. The full ledger

Everything Plan 089 built, unchanged in behaviour, moved below the three new
sections and introduced by a single link. Filters, tabs, the studied checkbox,
grouping, undated rollups, pagination and the URL contract are preserved
exactly. The year histogram is **deleted** — the build-out chart supersedes it
and two charts of the same shape on one page is the duplication this concept
exists to remove.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `bun test apps/web/test/shared/interventions-page.test.ts apps/web/test/shared/network-change-record.test.ts --timeout 5000` | all pass |
| Web suite | `bun run test:web` | exit 0 |
| Typecheck | `bun run check:types` | exit 0 |
| Doctrine | `bun run check:design-doctrine` | exit 0 |
| Architecture | `bun run check:architecture` | exit 0 |
| Style | `bun run check:style` | exit 0 |
| Build and budgets | `bun run check:web-release` | exit 0 |
| Full gate | `bun run check` | exit 0 |

## Suggested executor toolkit

- Use the `shadcn` skill if available for the multi-series chart; compose it
  from the existing chart primitives rather than adding a library.
- Use the `dataviz` skill if available before choosing series colours. The route
  roundel palette in `apps/web/src/global.css` (`--bp-route-*`) already supplies
  five distinguishable hues that belong to this product; prefer them over a
  generic categorical ramp.

## Scope

**In scope** (the only files you may create or modify):

- `apps/web/src/studio/network-change-record.ts` (new — the pure derivation:
  cumulative series, readings, route index groups, plan groups)
- `apps/web/src/components/interventions/NetworkBuildout.tsx` (new)
- `apps/web/src/components/interventions/NetworkBuildout.chart.tsx` (new, lazy)
- `apps/web/src/components/interventions/RouteChangeIndex.tsx` (new)
- `apps/web/src/components/interventions/ProposedPlans.tsx` (new)
- `apps/web/src/studio/pages/interventions.tsx` (compose the new sections above
  the existing ledger; delete `YearDistribution` and `yearDistribution`)
- `apps/web/src/routes/interventions.tsx` (add the bounded `group` key to
  `InterventionsSearch` and `validateInterventionsSearch`)
- `apps/web/test/shared/network-change-record.test.ts` (new)
- `apps/web/test/shared/interventions-page.test.ts`
- `knowledge/wiki/engineering/website_surface_data_plan.md` (record the new
  page composition)
- `knowledge/log.md` (append only)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- The ledger's filter model, `filterInterventionRows`, `interventionRows`,
  `planGroups`, `yearGroups`, `recordTargetForRoute`, the `Documented` /
  `Planned` tabs, the studied checkbox, pagination or the undated rollups. This
  plan **moves** the ledger; it does not change it. The only ledger deletion
  authorised is the year histogram.
- `apps/web/src/components/route/**` — route detail is Plans 103 and 105.
- Any new Worker endpoint, D1 table, R2 artifact or pipeline command. Every
  number on this page is derived in the browser from payloads the loader
  already fetches.
- `packages/**` and `tools/**`.
- The approved header headline and standfirst.

## Git workflow

- Branch: `codex/104-network-change-record`, cut after Plan 102 lands.
- Commits by logical unit: the pure derivation plus tests; the build-out chart;
  the route index and proposed plans; page composition plus test updates; docs.
- Do not push, open a PR, publish artifacts, or deploy unless separately asked.

## Steps

### Step 1: Derive the series and the readings, purely

Create `apps/web/src/studio/network-change-record.ts` exporting:

```ts
export type BuildoutSeries = {
  familyKey: string;
  label: string;          // "Bus lane", "Camera enforcement", …
  values: readonly { year: number; routes: number }[];
  endValue: number;
};

export type BuildoutReading = { heading: string; sentence: string };

export function networkBuildout(routes: readonly StudioRoute[]): {
  series: readonly BuildoutSeries[];
  firstYear: number;
  lastYear: number;
  partialFinalYear: boolean;
  readings: readonly BuildoutReading[];
  routesWithAnyChange: number;
  routesWithNoChange: number;
};
```

Rules:

1. Map `interventionType` to a display family:
   `bus_lane_infrastructure` → `Bus lane`,
   `automated_bus_lane_enforcement` → `Camera enforcement`,
   `select_bus_service` → `Select Bus Service`,
   `transit_signal_priority` → `Signal priority`,
   `busway` → `Busway`,
   `stop_consolidation` and `queue_jump` and
   `documented_bus_priority_intervention` → `Other documented`.
   Make the map exhaustive over the union so a new type fails to compile.
2. For each `(family, routeId)` take the **earliest** year seen. Accumulate
   forward: a route counts in every year from its first appearance onward.
3. The window starts at 2007. Records earlier than that (the nine `1963`
   bus-lane rows) fold into the 2007 value rather than stretching the axis.
4. `partialFinalYear` is true when the final year in the window is the current
   year of the served release. Derive it from the data — the largest year
   present — and never hard-code `2026`.
5. Readings are computed by the three rules in the target contract, in that
   fixed order, and every number in a reading's sentence comes from `series`.

Add `routeChangeIndex(...)` and `proposedPlanGroups(...)` in the same module for
sections 2 and 3, both pure and both taking exactly the loader's payloads.

**Verify**: `bun test apps/web/test/shared/network-change-record.test.ts --timeout 5000`
→ all pass, including the fixture asserting the full cumulative table above.

### Step 2: Build the chart behind a lazy split

1. `NetworkBuildout.tsx` owns layout, end labels, readings and the accessible
   description; `NetworkBuildout.chart.tsx` owns the Recharts composition and is
   imported with `lazy()`.
2. Colours come from `--bp-route-*` plus `--bp-color-accent`; do not introduce
   a new palette variable.
3. The partial final year renders a dashed vertical rule and the last axis tick
   reads `{year} so far`.

**Verify**:

```sh
bun --filter @bp/web build
bun run check:web-performance
```

Expected: exit 0, entry ≤ 145 KiB gzip and aggregate ≤ 390 KiB gzip. If the
entry grows, the chart is not behind the lazy split.

### Step 3: Route index and proposed plans

1. Add `group` to `InterventionsSearch` and `validateInterventionsSearch` as a
   closed union `"recent" | "most" | "measured" | "proposed" | "never"`,
   defaulting to `recent` and omitted from the URL at the default, exactly as
   the existing `view` key does.
2. `RouteChangeIndex.tsx` renders the selected group. Rows link to
   `/routes/$routeId` with `search: { tab: "history" }`.
3. Result cells use the published study index only. `improved` →
   `Speeds rose`, `worsened` → `Speeds fell`, `no_detectable_change` →
   `No clear change`. Never render the enum.
4. `ProposedPlans.tsx` renders the source-plan groups.

**Verify**:

```sh
bun test apps/web/test/shared/interventions-page.test.ts --timeout 5000
rg -n "no detectable change" apps/web/src/components/interventions/
```

Expected: tests pass; `rg` returns no matches.

### Step 4: Compose the page and delete the histogram

1. Insert the three new cards between the header and the ledger.
2. Introduce the ledger with a single link and heading; keep everything inside
   it untouched.
3. Delete `YearDistribution` and the exported `yearDistribution` helper, and
   remove its assertions from `interventions-page.test.ts`.
4. Grep the new components for leaked vocabulary and interpunct.

**Verify**:

```sh
rg -n "yearDistribution|YearDistribution" apps/web/src apps/web/test
rg -n "·|&middot;" apps/web/src/components/interventions apps/web/src/studio/pages/interventions.tsx
rg -n "has a bus lane" apps/web/src
```

Expected: all three return no matches.

### Step 5: Docs and the full gate

Record the new page composition in
`knowledge/wiki/engineering/website_surface_data_plan.md`, append a receipt to
`knowledge/log.md`, then:

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

New `apps/web/test/shared/network-change-record.test.ts`, modelled on
`apps/web/test/shared/home-route-index.test.ts`:

- **The cumulative table**: a fixture reproducing the real type and year
  distribution asserts every value in the table in "Current state". This is the
  test that proves the derivation, so build the fixture from the real
  distribution rather than a toy.
- **First-appearance semantics**: a route with three bus-lane records in 2012,
  2015 and 2020 contributes 1 to the bus-lane series from 2012 onward, not 3.
- **Pre-window folding**: a `1963` record appears in the 2007 value and does not
  extend the axis.
- **Exhaustive family mapping**: every `interventionType` in the union maps;
  adding an unmapped one fails to compile (assert with a `satisfies` type test).
- **Readings**: the three rules produce the expected headings on the real
  distribution, and a fixture with no five-year-flat family omits the third
  reading rather than emitting an empty one.
- **Partial year**: derived from the data; a fixture whose last year is 2029
  labels 2029, not 2026.
- **Exact identity**: B44 and B44+ count as two routes in every series.
- **Route index groups**: each of the five groups orders correctly; `never`
  contains exactly the routes with an empty `interventions` array.
- **Result cells**: each study direction maps to its display string, and the
  banned enum string never appears.

Extended in `interventions-page.test.ts`:

- `group` round-trips through `validateInterventionsSearch`, normalises invalid
  input to the default, and is omitted from the URL at the default;
- changing `group` resets pagination;
- the ledger's existing assertions still pass unchanged;
- rendered markup contains no interpunct.

## Done criteria

ALL must hold:

- [ ] `plans/mockups/104-network-change-record/interventions-comp.html` exists
      and the implementation matches it.
- [ ] `bun test apps/web/test/shared/network-change-record.test.ts --timeout 5000`
      passes and asserts the full cumulative table.
- [ ] `rg -n "yearDistribution" apps/web/src apps/web/test` returns no matches.
- [ ] `rg -n "·|&middot;" apps/web/src/components/interventions apps/web/src/studio/pages/interventions.tsx`
      returns no matches.
- [ ] No hard-coded `2026`, `323`, `58`, `36` or `4` appears in any rendered
      string: `rg -n "\"(2026|323|58|36)\"" apps/web/src/components/interventions`
      returns no matches.
- [ ] The approved header headline and standfirst are unchanged:
      `rg -n "What the city built for buses" apps/web/src/studio/pages/interventions.tsx`
      returns one match.
- [ ] `bun run test:web` exits 0.
- [ ] `bun run check` exits 0.
- [ ] `bun run check:web-release` exits 0 with both bundle budgets passing.
- [ ] `git status` shows no modified file outside the In-scope list.
- [ ] Plan 104's row in `plans/README.md` is updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 102 is not DONE.
- The comp and this prose disagree.
- The live route projection produces a cumulative table that differs from the
  one in "Current state" by more than the final partial year. Report the actual
  table; do not adjust the fixture to match a changed release without saying so.
- A reading's rule produces a sentence you would have to hand-write to make
  read well. Report the rule and the output; authored copy with a computed
  number in it is exactly what this plan forbids.
- The build-out chart cannot be composed from the existing shadcn and Recharts
  primitives without a new dependency.
- Any ledger behaviour changes: different rows, different filters, a different
  URL shape, or a changed page size.
- `bun run check:web-release` fails a bundle budget.

## Maintenance notes

- Every number on this page is derived at render time from the route
  projection. When the served release advances, the chart moves on its own and
  the readings re-compute. Nothing needs editing; that is the point, and a
  reviewer should reject any hard-coded count that creeps in.
- `partialFinalYear` exists because the served release is frozen mid-year. If
  publication ever becomes continuous, the rule still holds and the label still
  reads correctly.
- The "runs on a street with a bus lane" wording is load-bearing. It reflects
  that the underlying records are route shape against DOT centreline geometry
  and not audited lane mileage. Changing it is an evidence claim, not copy
  editing.
- If mta-wiki plan 041 ever supplies audited extents, the bus-lane series can
  become a mileage series — that is a new plan with a new wording decision, not
  an edit here.
- The ledger below is Plan 089's approved surface. Future work should change it
  in its own plan rather than as a side effect of a section above it.

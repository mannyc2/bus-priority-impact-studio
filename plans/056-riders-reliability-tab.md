# Plan 056: Riders & reliability tab — rider-meaningful numbers only; kill the meta-metrics

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (Generation 6 table).
>
> **Drift check (run first)**: Written against a DIRTY working tree at
> commit `ce3baca`, 2026-07-06. Compare the "Current state" excerpts against
> the live files; on mismatch, STOP. HARD dependency: 053 (tab shell).

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW-MED (two section rewrites; pure-frontend)
- **Depends on**: 053 (hard), 049
- **Category**: direction (product/UX)
- **Planned at**: commit `ce3baca` (dirty tree), 2026-07-06

## Why this matters

Operator, 2026-07-06: "Riders section is just a bunch of metric slop.
Random metrics thrown together. Why? … Why are we displaying 'Ridership
evidence' as a metric? 'Top segment context route-leading segment ALLEN
ST/E HOUSTON ST to SOUTH FERRY/TERMINAL' what does this even mean?"

Verified: `RidersSection` renders TWO 3-tile grids — real rider numbers
(Daily riders / Rider-hour burden / Highest-impact segment) and then a
"evidence" grid whose tiles are metrics ABOUT THE DATA, not about riders
("Ridership evidence", "Route trend", "Top segment context",
`RidersSection.tsx:60-72`). `ReliabilitySection` has the same disease:
its first two KPIs are "Evidence state" and "Sample coverage"
(`ReliabilitySection.tsx:31-41`). Meta-information belongs in the hidden
`SourceNote` disclosure (plan 049), not in KPI tiles. There is also a
latent fabrication hazard: `RouteBoardingsTrend`'s dead `mode="proxy"`
branch synthesizes rider counts from a scaled series
(`RidersSection.tsx:349-352`) — never called, but one refactor away from
fabricated numbers on a page whose doctrine is "honesty is the product".

The merged tab (plan 053 renders Riders then Reliability under one
"Riders & reliability" tab) keeps: rider KPIs, the ridership chart, top
burden segments, the hour-exposure chart, headway stats, the headway
sparkline, equity context (when served), and one unified signals list.

## Current state

- `apps/web/src/components/route/RidersSection.tsx` (363 LOC):
  - Line 37 `SectionHeader` (outside-card, count-slop sub from
    `riderImpactSummary().sectionSubtitle`).
  - Lines 38-58 rider KPI grid (KEEP content; note the conditional middle
    tile — when `riderHoursLost` is null the grid renders 2 tiles in a
    3-col grid, the operator's uneven-whitespace complaint).
  - Lines 60-72 `RiderEvidence` grid — DELETE (tiles: "Ridership
    evidence", "Route trend", "Top segment context").
  - Lines 74-76 + 211-248 equity context ("Who rides here", ACS
    county-proxy footnote) — KEEP, restyle footnote into SourceNote.
  - Lines 78-142 ridership ChartFrame (history-only in practice) + "Top
    burden segments" list (KEEP both; the burden list is good).
  - Lines 144-153 `HourExposure` ChartFrame + `RiderInsightPanel`
    (panel empty-state says "no customer-journey card has cleared the
    public gate" — pipeline jargon, banned).
  - Lines 155-164 rider-hours definition Alert (KEEP the definition, move
    it into SourceNote entries).
  - Lines 337-363 `RouteBoardingsTrend` with the dead `proxy` branch —
    DELETE the branch, keep history mode.
- `apps/web/src/components/route/ReliabilitySection.tsx` (215 LOC):
  - Lines 16-25 null-observed fallback Alert: "Headway evidence has not
    cleared gate." — jargon; replace text.
  - Lines 30-53 4-KPI grid: "Evidence state" + "Sample coverage" (DELETE →
    SourceNote), "Bunching share" + "Long-gap share" (KEEP).
  - Lines 54-71 Headways card (Median/P90/Excess wait — KEEP) + hourly
    headway sparkline (lines 80-119, KEEP) + Signals card.
  - Lines 72-75 Provenance Alert (`summary.caveat`) — move into SourceNote.
- `apps/web/src/components/route/rider-impact-summary.ts` and
  `reliability-summary.ts` — label builders; both have shared tests
  (`apps/web/test/shared/rider-impact-summary.test.ts` exists). Trim the
  builders the deleted tiles used; keep the ones surviving tiles use.
- Plan 049: `SectionCard`, `SourceNote`. Plan 053: this tab renders
  `<RidersSection/>` then `<ReliabilitySection/>` with per-section
  capability gating (riders ← `ridership` surface; reliability ←
  `reliability` surface with hiddenStates) — DO NOT merge the components;
  the gating differs.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun --filter @bp/web typecheck` | exit 0 |
| Web tests | `bun run test:web` | all pass |
| Doctrine | `bun run check:design-doctrine` | exit 0 |
| Build + budget | `bun --filter @bp/web build` | "Bundle within budget." |
| Style | `bun run check:style` | exit 0 |

## Scope

**In scope**:
- REWRITE `apps/web/src/components/route/RidersSection.tsx`
- REWRITE `apps/web/src/components/route/ReliabilitySection.tsx`
- EDIT `apps/web/src/components/route/rider-impact-summary.ts`,
  `reliability-summary.ts` (trim unused builders; keep signatures of
  survivors)
- EDIT `apps/web/test/shared/rider-impact-summary.test.ts` (+ any
  reliability-summary test found by grep); CREATE
  `apps/web/test/shared/riders-section.test.ts`
- EDIT `tests/harness/design-doctrine.test.ts` (remove
  `RidersSection.tsx`/`ReliabilitySection.tsx` from allowlists)
- `plans/README.md` (status row)

**Out of scope**:
- `HourExposure`, `SpeedTrend`, `Alert` internals.
- Tab shell/registry (053); other tabs (054/055/057).
- `equityContext` serving (typed but unpopulated today — the UI path stays
  null-safe; do NOT stub data).

## Git workflow

- Branch: `codex/056-riders-reliability-tab`
- One or two commits. Do NOT push or open a PR unless the operator
  instructed it.

## Steps

### Step 1: Rewrite `RidersSection`

New structure (all cards `SectionCard`):

1. `SectionCard title="Riders" sub="Who this route carries and where they
   lose time." right={<SourceNote label="About this data" entries={…}/>}`
   — SourceNote entries: the former "Ridership evidence" facts
   (`summary.historyLabel`/`historyDetail`, e.g. "14 months of monthly
   ridership"), the ACS proxy note when equity renders, and the
   rider-hours definition ("A 1-minute delay for 1,000 riders is 16.7
   rider-hours."). Body: the 3-KPI row with the whitespace fix — build the
   tile array first (`[dailyRiders, riderHoursLost?, topSegment]`,
   filtering nulls) and set `grid-cols-${tiles.length}` via a class map
   (`{2: "grid-cols-2", 3: "grid-cols-3"}`), so no empty column ever
   renders. Tile subs in plain language: Daily riders sub = the trend when
   known ("up 4% year over year" from `summary.trendLabel/Detail`) else
   "average weekday boardings"; Highest-impact segment value stays the
   segment name but the sub explains it: "riders here lose the most time
   per weekday".
2. Two-column row: ridership ChartFrame (unchanged content; delete the
   `mode`/`proxy` machinery from `RouteBoardingsTrend` — history only) |
   "Top burden segments" (existing list, wrapped in
   `SectionCard title="Top burden segments" sub="Where riders lose the
   most time."` — title INSIDE the card now).
3. `HourExposure` ChartFrame (unchanged) full-width.
4. Equity block when served (existing gate `items.length >= 2`):
   `SectionCard title="Who rides here" sub="Census context for the
   neighborhoods this route serves."`; the ACS footnote line moves into
   the tab-level SourceNote (step 1 entries) — no visible mono footnote.
5. DELETE: the `RiderEvidence` grid + component, the standalone rider-hours
   `Alert`, `RiderInsightPanel` (its insight rows move to step 2's unified
   signals — see below), the `SectionHeader` import.

Signals: export `riderImpactInsightRows` usage moves — see step 2.4.

**Verify**: `bun --filter @bp/web typecheck` → exit 0.

### Step 2: Rewrite `ReliabilitySection`

1. Null-observed fallback: keep the Alert shape but the copy becomes
   plain: title "Reliability not yet measured", body `capability?.reason ??
   "Observed headway data is not yet available for this route."`.
2. `SectionCard title="Waiting for the bus" sub="Observed headways and
   gaps." right={<SourceNote label="About this data" entries={…}/>}` —
   SourceNote entries: former "Evidence state" (`statusLabel/Detail`),
   "Sample coverage" (`sampleLabel/Detail`), and `summary.caveat` (the
   provenance Alert's text). Body: KPI row of the FOUR rider-real stats —
   Median wait, P90 wait, Excess wait, Long gaps (labels: "Median wait",
   "P90 wait", "Excess wait", "Long gaps"; keep `bunchingLabel` as a fifth
   only if it fits — prefer 4) — using the same conditional-column pattern
   as step 1; then the hourly headway sparkline (existing
   `ReliabilitySampleSparkline`, unchanged).
3. DELETE: "Evidence state"/"Sample coverage" tiles, the Provenance Alert,
   the `SectionHeader` import.
4. Unified signals: ONE `SectionCard title="Signals" sub="Detector context
   for riders and reliability."` at the END of this component, rendering
   `[...riderImpactInsightRows(data.insights), ...reliabilityInsightRows(data.insights)]`
   with the existing row styling (severity badge + title + shortText +
   first caveat). Empty state: "No public rider or reliability insight for
   this route yet." (plain language — the current pipeline-jargon strings
   are banned). NOTE: this component only renders when the reliability
   surface allows; rider insights also surfacing here is acceptable
   because the riders card above has no signals block — if the operator
   objects in review, the fallback is one signals card per section.

**Verify**: `bun --filter @bp/web typecheck` → exit 0;
`rg -n "cleared gate|cleared the public gate|Evidence state|Sample coverage|Ridership evidence|Top segment context" apps/web/src/components/route`
→ 0 matches.

### Step 3: Trim the summary modules

In `rider-impact-summary.ts` / `reliability-summary.ts`: delete builders
with no remaining consumer (e.g. `topSegmentShareLabel`,
`sectionSubtitle`s) — follow the compiler. Keep every survivor's signature
stable (`KPI strip` consumers died in 053; the remaining consumers are
these two sections).

**Verify**: `bun --filter @bp/web typecheck` → exit 0; update
`rider-impact-summary.test.ts` to cover the surviving builders only.

### Step 4: Doctrine ratchet + full gate

Remove `RidersSection.tsx` and `ReliabilitySection.tsx` from the plan-050
allowlists.

**Verify**:
`bun run check:design-doctrine && bun run test:web && bun --filter @bp/web build && bun run check:style`
→ all pass, in budget.

## Test plan

CREATE `apps/web/test/shared/riders-section.test.ts` (renderToStaticMarkup
+ toContain; fixtures: full route incl. `riderHoursLost`, and a variant
with `riderHoursLost: null`):

- Full route: renders "Daily riders", "Rider-hour burden",
  "Highest-impact segment" tiles; does NOT contain "Ridership evidence" /
  "Top segment context" / "Route trend" as tile labels.
- `riderHoursLost: null` variant: the grid renders `grid-cols-2` (assert
  the class string) — no empty third column.
- Equity: with a populated `equityContext` fixture renders "Who rides
  here" + item labels; with null renders nothing of it.
- Reliability: full `observedReliability` fixture renders "Median wait",
  "Excess wait", "Long gaps"; null renders "Reliability not yet measured";
  no "cleared gate" anywhere.
- No `·` and no banned phrases in either rendered output.

Update `rider-impact-summary.test.ts` per step 3.

**Verification**: `bun run test:web` → all pass.

## Done criteria

- [ ] `rg -n "Ridership evidence|Top segment context|Evidence state|Sample coverage|cleared gate|cleared the public gate|proxy" apps/web/src/components/route/RidersSection.tsx apps/web/src/components/route/ReliabilitySection.tsx` → 0 matches
- [ ] Meta-facts render inside SourceNote popovers (dev-server check)
- [ ] Conditional KPI grids never render an empty column (test-asserted)
- [ ] Doctrine check passes with both files out of the allowlists
- [ ] Typecheck, `test:web`, build (in budget), style all exit 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Either section file diverges from the cited line map — re-baseline.
- A summary-module builder you want to delete has a consumer OUTSIDE these
  two sections (grep first: `rg -n "<builderName>" apps/web/src`) — report
  instead of deleting.
- `equityContext` fixtures don't exist and the type has drifted from the
  fields used in `routeEquityContextItems` (lines 174-204) — report; do
  not invent fields.
- You are tempted to compute a ridership trend client-side from the speed
  series (the old proxy) — that is fabrication; STOP.

## Maintenance notes

- The Riders tab now owns: rider KPIs, monthly ridership chart, burden
  list, hour-exposure chart, equity context, wait/gap stats, headway
  sparkline, unified signals. The rider-hours DEFINITION lives in
  SourceNote — keep it in sync if the pipeline's rider-hours formula
  changes.
- When `equityContext` starts being served (plan-001 infrastructure
  exists), the "Who rides here" card lights up automatically — review its
  real values before announcing.
- Reviewer: check a sparse route — the riders tab should render honest
  fallbacks, never zero-filled tiles.

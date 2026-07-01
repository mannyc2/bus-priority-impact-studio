# Plan 022: Converge the route page on the canonical editorial design

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Read first, in order** (this plan is a design convergence — the design
> files are the spec, this plan is the map):
>
> 1. `knowledge/raw/downloads/design-handoffs/03-canonical/bus-priority-impact-studio/project/system.jsx`
> 2. `.../project/route-public.jsx` (the target page)
> 3. `.../project/geo-data.jsx` (speed ramp + hour synthesis)
> 4. `apps/web/src/components/route/section-registry.ts` (what exists)

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED (taste risk, not technical risk)
- **Depends on**: plan 019; plan 020 (evidence data on the page); plan 023
  step 1 (hourly profile serving) for the hour strips — build the cards
  hour-strip-ready and land strips when 023 serves the data
- **Category**: design
- **Planned at**: 2026-07-01

## Why this matters

The route page is the product. Today it is a 7-tab analyst dossier
(`overview / map / where-when / reliability / riders / treatments /
evidence`, question-shaped per the retired frontend-goal §4.3). The canonical
design (`route-public.jsx`) is a **single scrolling editorial page** —
narrative journalism over the same data: lede, big real numbers, charts,
slow-segment story cards, intervention timeline, trust strip. The 2026-06-12
user verdict killed the judged-word layer; the tab shell it decorated is the
last structural piece of that direction still standing.

What is already fixed (do NOT re-litigate): KPI labels are real metrics
(`Speed/Trend/Excess wait/Riders/Bus lane`,
`RouteJudgedKpiStrip.tsx:123-170`); `/map` is a real MapLibre map; global.css
tokens match the canonical system (oklch surfaces, status colors, borough
colors, Helvetica Neue + SF Mono).

## Current state

- `apps/web/src/studio/pages/route-detail.tsx` (200 LOC) renders
  `TabsContent` per section via
  `apps/web/src/components/route/section-registry.ts` — the registry also
  carries the honest-empty machinery (capability manifest → render / empty /
  hide), which must survive the re-layout.
- Section components exist and are mostly reusable as scroll sections:
  `OverviewSection`, `RouteMapSection`, `SegmentCarpet`, `ReliabilitySection`,
  `RidersSection`, `TreatmentsHistorySection`, `DataNotesSection`,
  `SlowSegments`, `TimelineSection`.
- Canonical atoms to implement (names from `route-public.jsx`): `RPubHeader`
  (editorial lede), `RPubBigStat` (large real-number stats), `RPubSlowCard`
  (slow-segment story card: prose + stats + hour-of-day severity strip),
  `RPubInterventionCard` (tone-colored, dated intervention cards).
- Copy residue to sweep (found 2026-07-01): `coverage-matrix.ts:26` labels a
  surface "Condition"; `reliability-summary.ts:76,82` uses "Observed" as a
  KPI *value*; `section-registry.ts` tab questions ("What's the story?") are
  §4.3 language.
- Bundle budget: entry 118.5 KB gz / 145 KB, total 343.4 / 390 KB — there is
  headroom, but heavy additions still go behind `React.lazy` per the
  established `X.tsx` + `X.chart.tsx` pattern.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Web typecheck | `bun --filter @bp/web typecheck` | exit 0 |
| Shared tests | `bun test apps/web/test/shared --timeout 5000` | pass |
| Web build | `bun --filter @bp/web build` | exit 0, budget passes |
| Architecture | `bun run check:web-architecture` | exit 0 |
| Dev server | `bun --filter @bp/web dev` | manual review |

## Scope

**In scope**:

- `apps/web/src/studio/pages/route-detail.tsx` and
  `apps/web/src/components/route/**`
- The four canonical atoms; deleting the tab chrome
- Copy sweep of judged/question-shaped residue
- Screenshot-based before/after evidence for operator review

**Out of scope**:

- API/data changes (plans 020/023 own those).
- Homepage, /map, /interventions, /methods (plan 023... see plan 025 — the
  page-polish plan).
- Resurrecting anything from `verdict-*.jsx` (banned).

## Steps

### Step 1: Re-layout — tabs become a scrolling page

Replace the `Tabs` shell with a single scroll flow in the canonical order:
header/lede → big stats → map → slow segments → where & when → reliability →
riders → treatments & history → evidence/citations → data notes/trust strip.
Keep `section-registry.ts` as the per-section render/empty/hide decider —
change its output from tabs to sections with anchor ids, and keep the
in-page navigation as a slim sticky section index (anchor links, not tabs).
Delete the question-copy or rewrite as plain section titles.

**Verify**: typecheck + shared tests; every capability state (rich route,
sparse route) still renders correctly — update the fixtures-based tests that
asserted tab behavior.

### Step 2: Editorial header and big stats

Implement `RPubHeader` (route badge, name, borough tone, one-sentence lede
from real data — e.g. current speed vs borough peers, trend direction) and
`RPubBigStat` for the KPI strip's numbers. The lede must be assembled from
served fields only; if the inputs are absent, render the header without a
lede — never a filler sentence.

**Verify**: shared test: lede renders from fixture data; absent inputs →
no lede, no placeholder text.

### Step 3: Slow-segment story cards

Replace the dense `SlowSegments` rows with `RPubSlowCard`s per
`route-public.jsx`: segment name/cross-streets, plain-language sentence
(slowest hour, speed, vs route median — all real numbers), compact stat
block, and an hour-of-day severity strip. Build the strip component now
against the hourly-profile shape plan 023 serves; if 023 has not landed,
render the card without the strip (a absent-data state, already the house
pattern), not a fake strip.

**Verify**: card renders with and without hourly data in fixtures.

### Step 4: Intervention timeline cards

Re-skin `TreatmentsHistorySection`/`TimelineSection` items as
`RPubInterventionCard`: tone-colored year badge and rule (good/warn/accent by
lifecycle), date, title, one-line detail, citations (from plan 020). Dated
events sort newest-first; date-text-only events group below with their
verbatim date text.

**Verify**: shared tests including citation rendering.

### Step 5: Copy sweep

- `coverage-matrix.ts` "Condition" → the concrete surface name.
- `reliability-summary.ts` KPI value "Observed" → the actual number it
  summarizes (or the section shows its metrics directly).
- Grep sweep: `rg -in 'condition|observed|treated|verdict|dossier|story' apps/web/src/components/route apps/web/src/studio/pages` —
  every hit is either a legitimate data field or gets rewritten to concrete
  language. List survivors and why in the commit message.

**Verify**: grep output in commit message; no user-visible judged words.

### Step 6: Screenshot review gate

Produce before/after screenshots of a rich route (M15+) and a sparse route
at desktop and mobile widths (dev server + headless browser). Post them for
operator review before merging. This plan's risk is taste; the operator has
rejected a shipped redesign once already — do not merge unreviewed.

**Verify**: screenshots exist and are attached to the PR; operator approved.

## Test plan

- Update/replace tab-behavior tests with section/anchor tests.
- Fixture coverage: rich route, sparse route, no-evidence route.
- Full pre-merge gate (typecheck, shared tests, worker tests, build+budget,
  architecture, style).

## Done criteria

- [ ] Route page is a single scrolling editorial page with sticky anchor nav.
- [ ] Canonical atoms implemented; slow segments and interventions are story
      cards with real numbers and citations.
- [ ] Honest-empty machinery intact for sparse routes.
- [ ] Judged/question-shaped copy gone.
- [ ] Bundle budget passes; screenshots reviewed and approved by operator.
- [ ] `plans/README.md` updated.

## STOP conditions

- A section needs data the API does not serve — coordinate with plans
  020/023; do not fabricate or hardcode.
- The scroll page's initial payload/render regresses noticeably (budget
  failure or obvious jank on the dev server) — restructure lazy boundaries;
  do not raise the budget.
- You find yourself designing a new abstraction layer over sections — the
  registry exists; extend it minimally.

## Maintenance notes

- Plan 023 lands the hour-strip data; the strip component from step 3 turns
  on then.
- The page-polish plan (025 in the README ordering) applies the same tone
  system to /interventions and the trust strip to home — keep atom styles
  shared, not copied.

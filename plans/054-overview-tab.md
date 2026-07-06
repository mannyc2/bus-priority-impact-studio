# Plan 054: Build the Overview tab — one summary, one trend chart, one mini map, ranked insights

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (Generation 6 table).
>
> **Drift check (run first)**: Written against a DIRTY working tree at
> commit `ce3baca`, 2026-07-06. Compare the "Current state" excerpts against
> the live files; on mismatch, STOP. HARD dependency: plan 053 (tab shell)
> — this plan fills the Overview tab it created.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW-MED (one tab's content; heavy reuse of existing, tested
  components)
- **Depends on**: 053 (hard), 049
- **Category**: direction (product/UX)
- **Planned at**: commit `ce3baca` (dirty tree), 2026-07-06

## Why this matters

Operator, 2026-07-06: "What should the 'overview' page have? Well obviously
it should be an overview of the route. What does that entail? Well
currently there doesn't seem to be any overview?" — and he's right,
literally: `OverviewSection.tsx` (266 LOC, containing a summary card, the
route's ONLY plain speed-trend chart, a mini map, and insight cards) has
ZERO importers. The page shipped with "The route right now" (deleted in
plan 053) instead.

He also flagged duplication ("displaying the same exact data over and over
throughout different sections") — the cure is assignment of one canonical
home per data family. This plan makes Overview the home of: the
plain-language route summary (ONE instance — `routePublicLede` and the dead
`SummaryCard` built near-identical prose from the same fields), the monthly
speed-trend chart (ONE instance), a small geographic locator map, and the
ranked insight list. The route map's analytical duties live in the Slow
segments tab (plan 055); History keeps the event timeline but loses its
duplicate trend chart (plan 057).

## Current state

- `apps/web/src/components/route/OverviewSection.tsx` (266 LOC, DEAD —
  zero importers; verified 2026-07-06). Salvageable interior:
  - `SummaryCard` (lines 153-207): builds sentences from
    `performanceSpeed`, `scheduledMph`, `movement6mPct`, `peerPercentile`,
    `worstLabel`, then `TreatmentBadgeRow treatments max=6` + riders badge.
  - Speed-history block (lines 68-96): `ChartFrame title="Speed history"`
    + `Badge {months} months` + `SpeedTrend data={historySpeeds}
    scheduled={route.scheduledMph}` with an honest empty fallback.
  - Mini-map card (lines 98-131): `useRouteSegmentsGeo(route.routeId)`
    (exported by `RouteMapSection.tsx`) → `RouteGeoMap variant="mini"`,
    loading pulse, `CorridorMap mode="mini"` fallback; "Full map →" button.
  - Two-column grid: `grid-cols-[minmax(0,1.25fr)_minmax(320px,0.8fr)]
    gap-5 max-xl:grid-cols-1` (line 67).
  - A local `InsightCard` grid ("What stands out" h2, lines 134-148 +
    209-266) — REDUNDANT with `RouteInsightList`; do not salvage.
- `apps/web/src/components/route/RouteInsightList.tsx` (162 LOC) — the
  ranked findings list; currently the interim Overview content (plan 053).
  Its header is a kicker eyebrow ("What stands out",
  `font-mono text-[10px] … uppercase tracking-[0.12em]`) + "N ranked
  findings" heading — restyle to the SectionCard standard.
- `apps/web/src/components/route/RoutePublicAtoms.tsx` —
  `routePublicLede` (lines 24-62) builds the SAME sentence family as
  `SummaryCard` (speed vs schedule; ±% in six months; peer percentile;
  worst stretch). After this plan exactly ONE builder survives.
- `apps/web/src/components/route/route-derived.ts` — helpers used by the
  dead section: `dossierSpeedSeries`, `dossierMetricWindow`,
  `dossierMetricMonthCount`, `formatCompact`, `routePerformanceSummary`.
- `apps/web/src/studio/treatment-model.ts` — `routeTreatments(route,
  segments)` feeding `TreatmentBadgeRow` (`components/TreatmentBadge.tsx`).
- Plan 049 primitives: `SectionCard` (title INSIDE card), `SourceNote`.
- Plan 053 contract: `route-detail.tsx` renders the overview tab as
  `RouteInsightList` (interim); `routeTabForSection`-based `onNavigate`.

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
- REWRITE `apps/web/src/components/route/OverviewSection.tsx` (as the live
  Overview tab content)
- EDIT `apps/web/src/components/route/RouteInsightList.tsx` (de-kicker its
  header; SectionCard-compatible)
- EDIT `apps/web/src/studio/pages/route-detail.tsx` (overview tab renders
  the new `OverviewSection`)
- EDIT `apps/web/src/components/route/RoutePublicAtoms.tsx` (delete
  `routePublicLede` — the summary builder moves into OverviewSection)
- CREATE `apps/web/test/shared/overview-section.test.ts`; EDIT
  `apps/web/test/shared/route-insight-list.test.ts`
- EDIT `tests/harness/design-doctrine.test.ts` (remove
  `RouteInsightList.tsx` from the kicker allowlist)
- `plans/README.md` (status row)

**Out of scope**:
- `RouteMapSection`/`SlowSegments` interiors (plan 055); `RidersSection`/
  `ReliabilitySection` (056); `TreatmentsHistorySection`/`TimelineSection`
  (057 — including removing ITS duplicate trend chart).
- `SpeedTrend`/`ChartFrame`/`RouteGeoMap`/`CorridorMap` internals.
- The tab shell, header, registry (053 owns; do not modify).

## Git workflow

- Branch: `codex/054-overview-tab`
- One or two commits. Do NOT push or open a PR unless the operator
  instructed it.

## Steps

### Step 1: Rewrite `OverviewSection.tsx`

New layout (top to bottom), all data from the props it already declared
(`data: StudioRouteDetailResponse` + add `evidence` only if SourceNote
needs it — it does not; treatment provenance belongs to History):

1. **Summary** — `SectionCard title={route.label + " at a glance"}` (e.g.
   "M15-SBS at a glance"… use `route.label` verbatim; no "verdict" voice):
   the `SummaryCard` sentence builder salvaged as a pure helper
   `overviewSummary(route, dossier, worstLabel): string` in this file —
   sentences: speed vs schedule; movement over six months; peer percentile;
   worst stretch. Fallback `route.diagnosis` only when every part is
   missing (as the dead code did at line 197). Below the prose:
   `TreatmentBadgeRow treatments={routeTreatments(route, segments)} max={6}`
   + the riders badge when `dailyRiders > 0`.
2. **Trend + map row** — the salvaged two-column grid:
   - Left: the speed-history block EXACTLY as the dead code had it
     (`ChartFrame title="Speed history"`, months badge, `SpeedTrend` with
     `scheduled` overlay, honest empty fallback). ChartFrame post-plan-049
     already renders the SectionCard header style.
   - Right: the mini-map card, converted to
     `SectionCard title="Route map" sub="Observed speed by segment."` with
     the same `RouteGeoMap variant="mini"` / loading / `CorridorMap`
     fallback body; the "Full map →" button now calls
     `onNavigate("map")` (which plan 053 routes to the Slow segments tab).
3. **Insights** — `<RouteInsightList insights={data.insights}
   capability={data.capability} onNavigate={onNavigate} />` (all
   placements, capped at its internal MAX of 5).

Preserve the equal-height behavior: both cells of the grid row get
`h-full` SectionCards with `minHeight: 172` bodies (the operator's
"smaller card having tons of white space" complaint — matching min-heights
on this row is the fix here; the systemic rule is per-tab).

Props: `{ data, onNavigate }` where
`onNavigate: (section: RouteDetailSectionValue) => void` (plan 053's
adapter). Delete everything not salvaged (the local `InsightCard`,
`sectionRegistry`-based map targeting — `onNavigate("map")` handles it).

**Verify**: `bun --filter @bp/web typecheck` → exit 0.

### Step 2: De-kicker `RouteInsightList`

Replace its header block (kicker + "N ranked findings") with the standard
in-card header: wrap the list in `SectionCard title="What stands out"
sub={rows.length === insights.length ? "Detector findings, ranked by severity."
: \`Top \${rows.length} of \${insights.length} detector findings.\`}`.
Keep row rendering, severity dots, caveat tooltips, `onNavigate` behavior,
and the `cleanInsightState` empty rendering unchanged.

**Verify**: `bun run test:web` — update
`route-insight-list.test.ts` expectations (header strings) only.

### Step 3: Wire the tab + delete the duplicate prose builder

1. `route-detail.tsx`: overview tab renders
   `<OverviewSection data={data} onNavigate={navigateToSection} />`
   (replacing the interim bare `RouteInsightList`).
2. `RoutePublicAtoms.tsx`: delete `routePublicLede` (verify importerless
   first: `rg -n "routePublicLede" apps/web/src` → only its definition).

**Verify**: `rg -n "routePublicLede" apps/web/src` → 0 matches;
`bun --filter @bp/web typecheck` → exit 0.

### Step 4: Doctrine ratchet + full gate

Remove `components/route/RouteInsightList.tsx` from the plan-050 kicker
allowlist (and `OverviewSection.tsx` if it was frozen there).

**Verify**:
`bun run check:design-doctrine && bun run test:web && bun --filter @bp/web build && bun run check:style`
→ all pass, in budget (SpeedTrend/RouteGeoMap/CorridorMap are already
lazy-loaded chart/map modules — importing them here adds no eager bytes;
if entry grows, check import paths point at the lazy wrappers
`SpeedTrend.tsx`/`RouteGeoMap.tsx`, not `*.chart.tsx`/`*.map.tsx`).

## Test plan

New `apps/web/test/shared/overview-section.test.ts`
(renderToStaticMarkup + toContain; fixture route/dossier shaped like the
`route-public-kpi-strip.test.ts` fixtures used before deletion — copy its
route/dossier factories):

- Full-data route: summary contains "runs X.X mph", "against a X.X mph
  schedule", the movement sentence, percentile sentence; treatment badges
  render; "Speed history" title renders; months badge renders; "Route
  map" card title renders.
- Sparse route (no dossier, `weightedAvgSpeed: 0`, no insights): summary
  falls back to `route.diagnosis`; chart shows the honest-empty message
  ("No route speed history is attached yet."); insight list renders its
  clean/empty state, not a crash.
- The rendered HTML contains NO `·`, NO "The route right now", NO
  uppercase-kicker class (`tracking-[0.12em]`).
- `route-insight-list.test.ts`: header now "What stands out" via
  SectionCard (assert title + sub strings; drop the "ranked findings"
  heading assertions).

**Verification**: `bun run test:web` → all pass including the new file.

## Done criteria

- [ ] Overview tab renders summary + trend + mini map + insights on a
      flagship route in the dev server; sparse route renders honest
      fallbacks
- [ ] `rg -n "routePublicLede" apps/web/src` → 0 matches (one prose builder
      remains, inside OverviewSection)
- [ ] `rg -c "SpeedTrend" apps/web/src/components/route/OverviewSection.tsx` ≥ 1
      and Overview is SpeedTrend's only route-page consumer OUTSIDE
      TimelineSection (TimelineSection's copy is removed by plan 057 — do
      not remove it here)
- [ ] `bun run check:design-doctrine` exit 0 with `RouteInsightList.tsx`
      out of the kicker allowlist
- [ ] Typecheck, `test:web`, build (in budget), style all exit 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Plan 053 is not DONE (no tab shell to fill) — wrong order.
- `OverviewSection.tsx` has gained importers since planning (someone
  revived it differently) — reconcile before rewriting.
- `useRouteSegmentsGeo` no longer exported from `RouteMapSection.tsx`
  (plan 055 may have moved it if executed out of order) — coordinate: use
  its new home, or STOP if it's gone.
- The summary sentences would require a field that is null for EVERY
  fixture route (schedule, percentile) — do NOT fabricate; render the
  sentence subset that exists.

## Maintenance notes

- Overview now owns: route summary prose, the plain monthly trend chart,
  the mini locator map, the ranked insight list. Plans 055/057 must NOT
  reintroduce any of these in their tabs (055's map is the analytical
  segment map; 057's chart is the event-overlay timeline).
- If `StudioRouteEquityContext` ever gets populated (it is typed but
  unserved today), it belongs on the Riders tab (056), not here.
- Reviewer: check the sparse-route path in the dev server — honesty is the
  product; no invented numbers.

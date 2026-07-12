# Plan 055: Slow segments tab — ranked segment table, one hour chart, a calm map; delete the carpet and the Profile bars

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (Generation 6 table).
>
> **Drift check (run first)**: Written against a DIRTY working tree at
> commit `ce3baca`, 2026-07-06. Compare the "Current state" excerpts against
> the live files; on mismatch, STOP. HARD dependency: 053 (tab shell);
> recommended after 054.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED (rewrites the densest tab; deletes two chart modules)
- **Depends on**: 053 (hard), 049; 054 recommended first
- **Category**: direction (product/UX)
- **Planned at**: commit `ce3baca` (dirty tree), 2026-07-06

## Why this matters

Operator, 2026-07-06, on this content: "Slow segments data visualization is
very ugly; the hour profile is very ugly. The three slow segment cards are
not even consistent either. The entire slow segments section is very ugly
and unreadable." Plus: "'Profile' completely breaks the standard sizing and
format"; "long names are overflowing and get truncated in a ugly way on the
vertical axis labels"; "the route map displays this same thing [as the
Profile], right? … we may as well delete the profile OR the route map";
"why does the subheading talk about '36 months / 24 segments' instead of
describing the data. Why do we visualize the data like its a github commit
graph?"

Verified against code, the tab today stacks SEVEN blocks that re-show the
same segment data four ways: 3 featured cards (`RPubSlowCard`, inconsistent
heights because the hour strip is conditional), a 4-stat summary grid that
duplicates the header stats, peak/slowest chips, "Profile" (a horizontal
bar chart of segment speeds — same data as the map, with truncating y-axis
labels at a fixed 132px), "By hour" bars, and a 36×24 month-heatmap
("Segment history" carpet). The redesign gives the tab ONE hierarchy:
a ranked segment table (the strongest existing component, `SegmentRow`, is
fully built and currently unused outside skeletons) with expandable
per-segment detail, one hour chart, and one simplified map — and deletes
the Profile bars, the carpet, and the featured cards.

## Current state

- `apps/web/src/components/route/SlowSegments.tsx` (440 LOC) — renders, in
  order (lines 113-213): `SectionHeader` (OUTSIDE card; sub =
  `whereWhenSummary().sectionSubtitle` = "24 segments with 36 months
  history (…)"; right = direction `FilterChips` All/NB/SB) → 3×
  `RPubSlowCard` featured grid → `WhereWhenSummaryCards` (4-stat grid:
  Speed/Trend/Window/Worst — duplicates the plan-053 header stats) →
  `WhereWhenWindowChips` (peak/slowest) → grid: "Profile" card with
  `SectionHeader` NESTED INSIDE a card (lines 162-165, the anomaly) +
  `ChartFrame "By hour"` (`HourBars`, lines 166-186) → `ChartFrame
  "Segment history"` with `SegmentCarpet` (lines 188-208; source label
  `"${monthCount} months / ${segmentCount} segments"`, lines 274-282) →
  "N of M segments highlighted" footer. Data hooks `useRouteHourlyProfile`
  and `useRouteSpeedHistory` (lines 216-258) fetch per-route grains
  in-tab — KEEP both.
- `apps/web/src/components/SegmentRow.tsx` (157 LOC) — a COMPLETE ranked
  table row: `DirIndicator` + "from → to" + mph vs sched + rider-hrs +
  `HourStrip hours` severity strip + `TreatmentRow`; `flag="top"` accent
  row; `hasNote`/`noteOpen`/`onClick` affordances; plus `SegmentRowHeader`
  and `SegmentRowSkeleton`. Currently rendered ONLY in loading skeletons.
- `apps/web/src/components/CorridorProfile.tsx` (92 LOC) +
  `CorridorProfile.chart.tsx` (196 LOC) — the "Profile" horizontal bars;
  y-axis labels truncate via `shortStop()` + fixed `Y_AXIS_WIDTH = 132`.
  Importers: `SlowSegments.tsx` only (plus a mention in `ui/chart.tsx` —
  verify it is a comment, not code). DELETE both files.
- `apps/web/src/components/route/SegmentCarpet.tsx` (31) +
  `SegmentCarpet.chart.tsx` (242) + `segment-carpet-data.ts` (161) — the
  month×segment heatmap; importers: `SlowSegments.tsx` only. DELETE the
  two components; REPLACE the data module (step 3).
- `apps/web/src/components/route/RoutePublicAtoms.tsx` — `RPubSlowCard`
  (lines 158-255: "Slow segment {rank}" kicker, `&middot;` in the
  direction line at 194, conditional 24-cell hour strip) + `SlowCardStat`
  (329-340). After this plan both are importerless → DELETE.
  `RPubInterventionCard` stays (plan 057).
- `apps/web/src/components/route/RouteMapSection.tsx` (468 LOC) — the
  analytical map: `useRouteSegmentsGeo` (exported; ALSO used by plan 054's
  Overview mini map — keep export), `RouteMapSection({data})` with local
  state `hour` (default 17), `playing`, `hoveredSegmentId`, `layers`;
  imports `TimeScrubber` (line 20, rendered ~line 210); focus panel keyed
  to `segmentSpeedAtHour(segment, hour)`; section chrome is its own
  header. The hour scrubber + autoplay GO AWAY here (the operator rejected
  time-autoplay on the network map, and the route map's job is "showcase
  the geography"); segment coloring falls back to all-day
  `segment.speedMph`.
- `apps/web/src/components/route/where-when-summary.ts` (109 LOC) —
  `whereWhenSummary` (feeds the deleted stat grid + count-slop subtitle),
  `whereWhenSegmentBadge` (worst-segment "N mo worst" badge — KEEP for
  table rows).
- Plan 049/050 context: `SectionCard`, `SourceNote` available; the
  doctrine allowlist contains `SlowSegments.tsx` (kicker),
  `RoutePublicAtoms.tsx` (interpunct via `&middot;`),
  `CorridorProfile.chart.tsx` (interpunct in tooltip) — all must come OFF
  the lists in this plan.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun --filter @bp/web typecheck` | exit 0 |
| Web tests | `bun run test:web` | all pass |
| Doctrine | `bun run check:design-doctrine` | exit 0 |
| Build + budget | `bun --filter @bp/web build` | "Bundle within budget." |
| Style | `bun run check:style` | exit 0 |
| Dev server | `bun --filter @bp/web dev` | tab renders on `/routes/m15-sbs?tab=segments` |

## Scope

**In scope**:
- REWRITE `apps/web/src/components/route/SlowSegments.tsx`
- EDIT `apps/web/src/components/route/RouteMapSection.tsx` (+ its map
  child `RouteMapLibre.tsx`/`RouteMapLibre.map.tsx` ONLY where the `hour`
  prop threading requires)
- EDIT `apps/web/src/components/route/RoutePublicAtoms.tsx` (delete
  `RPubSlowCard`, `SlowCardStat`)
- EDIT `apps/web/src/components/route/where-when-summary.ts` (trim to the
  survivors)
- DELETE `apps/web/src/components/CorridorProfile.tsx`,
  `apps/web/src/components/CorridorProfile.chart.tsx`,
  `apps/web/src/components/route/SegmentCarpet.tsx`,
  `apps/web/src/components/route/SegmentCarpet.chart.tsx`
- REPLACE `apps/web/src/components/route/segment-carpet-data.ts` with
  `apps/web/src/components/route/segment-history-data.ts` (per-segment
  month series helper)
- EDIT tests: `route-public-atoms.test.ts`, any carpet/profile tests found
  by grep; CREATE `apps/web/test/shared/slow-segments.test.ts`
- EDIT `tests/harness/design-doctrine.test.ts` (allowlist shrink)
- `plans/README.md` (status row)

**Out of scope**:
- `TimeScrubber.tsx` deletion — the network map still uses it until plan
  059 (which deletes it).
- `maplibre-style.ts` functions (`segmentSpeedAtHour` etc.) — unused
  exports are fine; 059 may still use them.
- `HourBars`, `HourStrip`, `Spark`, `FilterChips`, `TreatmentRow`,
  `DirIndicator` internals — consume as-is.
- Overview tab (054), Riders (056), History (057).

## Git workflow

- Branch: `codex/055-slow-segments-tab`
- Commits: (1) segment-history data helper + table rewrite, (2) map
  simplification, (3) deletions + allowlist. Do NOT push or open a PR
  unless the operator instructed it.

## Steps

### Step 1: `segment-history-data.ts`

Create it by extracting from `segment-carpet-data.ts` the cell-parsing
logic that groups `StudioRouteSpeedHistoryResponse` cells per segment into
month-ordered series. Export:

```ts
export type SegmentHistorySeries = {
  segmentId: string;
  months: string[];          // ascending "YYYY-MM"
  speeds: (number | null)[]; // aligned with months
  latestMonth: string | null;
};
export function segmentHistorySeries(
  history: StudioRouteSpeedHistoryResponse | null,
  segments: readonly StudioSegment[],
): Map<string, SegmentHistorySeries>;
```

Reuse `buildSegmentCarpetModel`'s row/month assembly (open
`segment-carpet-data.ts` first; it already dedupes months and maps cells
by segment) — you are re-shaping its output, not re-deriving the parsing.
Then delete `segment-carpet-data.ts`.

**Verify**: `bun --filter @bp/web typecheck` (after step 2 wires the
consumer; typecheck at end of step 2 is fine).

### Step 2: Rewrite `SlowSegmentsSection`

Keep the props contract from plan 053 unchanged (`route, segments,
insights, flaggedId, dossier, peakWindows, slowestWindows`) and both fetch
hooks. New layout:

1. **`SectionCard title="Where the route loses time"`** —
   `sub="Timepoint segments ranked by rider-hours lost per weekday."`;
   `right={<div className="flex items-center gap-3"><FilterChips …direction… /><SourceNote label="About this data" entries={aboutEntries} /></div>}`
   where `aboutEntries` carries the former count-slop as hidden
   disclosure: `{ label: "${segments.length} timepoint segments" }`,
   `{ label: "${monthCount} months of segment speed history (${window})" }`
   when available, `{ label: "${latestMonth} hourly profile" }` when the
   hourly fetch is ready. Body:
   - `SegmentRowHeader` + ranked rows: order = `riderHours` desc within
     the direction filter; `flag="top"` on the highest; badge the
     `whereWhenSegmentBadge` worst-segment via the row's note affordance.
   - Render the top 8; below, a quiet full-width button
     `Show all ${n} segments` toggling the rest (state local; default
     collapsed).
   - Row `onClick` toggles an expanded detail block under the row
     (`noteOpen`): inside it render (a) the segment's insight note
     (`SegmentInsightNote`, salvage from current lines 96-110 +
     component) or `segment.aiNote` if present — EXACTLY the current
     note-priority logic; (b) a monthly `Spark` from
     `segmentHistorySeries(...)` for that segment
     (`width={220} height={36}`) labeled with first/last month in plain
     text ("Jun 2023 – May 2026"), or "No month history for this segment."
     when absent. This REPLACES the carpet: same data, per-segment,
     on demand.
2. **`SectionCard title="Speed by hour" sub={hourProfileSource(...)}`** —
   the `HourBars` block exactly as today (lines 166-186), plus the
   peak/slowest chips (`WhereWhenWindowChips`, salvaged unchanged) rendered
   compactly ABOVE the chart inside the card.
3. **The map** — render `<RouteMapSection data={data}/>` last in the tab
   (plan 053 already places it; if 053 renders RouteMapSection as a
   separate `section()`, keep that and just ensure order = table → hours →
   map).

DELETE from this file: the featured `RPubSlowCard` grid,
`WhereWhenSummaryCards` + `WhereWhenStat`, the "Profile" card +
`CorridorProfile` import, the `SegmentCarpet`/`buildSegmentCarpetModel`/
`carpetSourceLabel` usage, the `SectionHeader` import, the trailing
"N of M segments highlighted" line. Trim `where-when-summary.ts` to
`whereWhenSegmentBadge` + whatever `whereWhenSummary` fields remain
consumed (if none besides the badge, delete the rest and its type).

**Verify**: `bun --filter @bp/web typecheck` → exit 0; dev server
`?tab=segments`: table ranks by rider-hours, direction filter works,
expand shows note+sparkline, show-all reveals the rest.

### Step 3: Simplify `RouteMapSection`

1. Remove the `TimeScrubber` import, the `hour`/`playing` state, and the
   scrubber UI block; delete the hour readout chrome ("5pm"-style tags).
2. Color/focus by ALL-DAY observed speed: replace `segmentSpeedAtHour(
   segment, hour)` call sites with `segment.speedMph` (and route-average
   with `route.weightedAvgSpeed`); thread `hour` OUT of
   `RouteMapLibre.tsx`/`.map.tsx` props IF the prop becomes unused —
   follow the compiler: remove the prop end-to-end rather than passing a
   dummy.
3. Re-frame the section chrome as `SectionCard title="On the map"
   sub="Observed all-day speed by segment."` and keep: the layer toggles,
   hover/click focus panel (now showing all-day mph, rider-hours,
   treatments), and the `useRouteSegmentsGeo` export.

**Verify**: `bun --filter @bp/web typecheck` → exit 0;
`rg -n "TimeScrubber|playing" apps/web/src/components/route/RouteMapSection.tsx`
→ 0 matches; dev server: map renders, hover focuses segments,
`bun run test:web` → maplibre-style tests still pass (module untouched).

### Step 4: Delete the superseded components

Delete `CorridorProfile.tsx`, `CorridorProfile.chart.tsx`,
`SegmentCarpet.tsx`, `SegmentCarpet.chart.tsx`. Remove `RPubSlowCard` +
`SlowCardStat` from `RoutePublicAtoms.tsx`. First verify importers:
`rg -ln "CorridorProfile|SegmentCarpet|RPubSlowCard" apps/web/src --glob '!**/dev/**'`
→ only the files being deleted/edited (a comment mention in
`components/ui/chart.tsx` is fine — comments don't import). Fix any dev
demo (`src/dev/examples/corridor-demo.tsx`) by removing the demo usage.

**Verify**: `bun --filter @bp/web typecheck` → exit 0.

### Step 5: Doctrine ratchet + full gate

Remove from the plan-050 allowlists: `SlowSegments.tsx` (kicker),
`RoutePublicAtoms.tsx` (interpunct — `&middot;` died with RPubSlowCard),
`CorridorProfile.chart.tsx` (deleted).

**Verify**:
`bun run check:design-doctrine && bun run test:web && bun --filter @bp/web build && bun run check:style`
→ all pass; budget UNCHANGED or better (two lazy Recharts consumers
deleted; `HourBars`/`Spark` remain the lazy chart imports).

## Test plan

- CREATE `apps/web/test/shared/slow-segments.test.ts`
  (renderToStaticMarkup + toContain; fixture: 10 segments with distinct
  `riderHours`, one flagged, one with `aiNote`, direction mix; a
  `StudioRouteSpeedHistoryResponse` fixture with 3 months × 2 segments):
  - Renders exactly 8 `SegmentRow`s initially (assert the 8th segment's
    `from` string present, the 9th absent) + "Show all 10 segments".
  - Top rider-hours row carries the top flag ("Top rider-impact segment").
  - `segmentHistorySeries` pure-fn cases: months ascend; missing months →
    null-aligned; unknown segment → absent from the map.
  - The rendered HTML contains NO "Slow segment 1" kicker, NO `&middot;`,
    NO "months / " count-subtitle, NO "Profile" heading.
  - (State-dependent expansion can't render statically — cover expansion
    logic by exporting the row-ordering/expansion helpers as pure
    functions and unit-testing those; do not add a DOM emulator.)
- EDIT `route-public-atoms.test.ts`: drop RPubSlowCard cases; keep
  RPubInterventionCard.
- `rg -l "SegmentCarpet|CorridorProfile" apps/web/test` → update/delete
  any test files found.

**Verification**: `bun run test:web` → all pass.

## Done criteria

- [ ] `rg -ln "CorridorProfile|SegmentCarpet" apps/web/src --glob '!**/dev/**'` → 0 files (comment mentions in `ui/chart.tsx` excepted)
- [ ] `rg -n "RPubSlowCard|SlowCardStat|WhereWhenSummaryCards" apps/web/src` → 0 matches
- [ ] `rg -n "TimeScrubber" apps/web/src/components/route/` → 0 matches
- [ ] `rg -n "months / " apps/web/src/components/route/SlowSegments.tsx` → 0 matches
- [ ] Doctrine check passes with the three allowlist entries removed
- [ ] Typecheck, `test:web`, build (in budget), style all exit 0
- [ ] Dev server: `?tab=segments` shows table → hour chart → map, in that
      order, all inside SectionCards
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `SlowSegments.tsx` render body doesn't match the line map (113-213) —
  parallel edit; re-baseline.
- `ui/chart.tsx` turns out to IMPORT CorridorProfile (not just mention it
  in a comment) — report; do not delete blind.
- Removing the `hour` prop from `RouteMapLibre.map.tsx` cascades into
  `maplibre-style.ts` signature changes — STOP; those functions are shared
  with the network map until 059. Pass all-day values at the call site
  instead of changing shared signatures.
- The per-segment history data turns out not to align with `segments` ids
  (carpet used a different key) — report the key shapes; do not fuzzy-match.

## Maintenance notes

- The segments tab now owns: ranked segment table (with per-segment month
  sparklines + notes), the hour profile chart, the analytical map.
  Nothing else on the page may render per-segment speed visualizations.
- `SegmentRow` is live again — future segment columns go there, and the
  loading skeleton (`route-detail.tsx`) already matches it.
- Peak/slowest window chips live inside the "Speed by hour" card; if the
  DOW grain ever ships a UI, it extends that card, not a new section.
- Deferred: map hour-of-day exploration belongs to the network map's
  period toggle (plan 059), not the route page.

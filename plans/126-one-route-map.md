# Plan 126: One route map — the Overview map becomes the interactive map; the Slow-segments map and readout rail retire

> **Executor instructions**: Follow this plan step by step; run every
> verification and confirm the expected result. On any STOP condition, stop
> and report. When done, update this plan's status row in `plans/README.md`
> (Generation 21 section).
>
> **Branch base**: audited against `origin/main@881d5611` (line refs below are
> from that commit). Plan 122 must be merged first — it edits the same files
> (`OverviewSection.tsx`, `SegmentExplorer.tsx`, `RouteMapLibre.map.tsx`) and
> its map-hover hygiene carries directly into the surviving map. Branch off
> current `origin/main` AFTER 122 lands.
>
> **Drift check (run first)**:
> `git fetch origin && git diff --stat 881d5611..origin/main -- apps/web/src/components/route/OverviewSection.tsx apps/web/src/components/route/SegmentExplorer.tsx apps/web/src/components/route/RouteMapLibre.tsx apps/web/src/components/route/RouteMapLibre.map.tsx apps/web/src/components/route/RouteGeoMap.tsx apps/web/src/components/CorridorMap.tsx apps/web/src/components/ChartFrame.tsx apps/web/src/components/route/RidersSection.tsx`
> Plan 122's edits are EXPECTED drift; re-anchor by content. Unexplained
> mismatch = STOP.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED (URL deep-link contract and the gen-18 D2 lane-extent link
  must survive the move)
- **Depends on**: plans/122-route-detail-hygiene.md (same files; hover fixes
  reused). Independent of 121/125 (different map component) but READ Plan 125
  first — its anchored-popup ruling is the interaction pattern this plan
  ports. Plan 123's comp is re-gated on this plan (it must show the
  post-consolidation Overview).
- **Category**: bug (duplicate surface) + direction
- **Planned at**: 2026-08-02, operator bug sweep

## Why this matters

Operator direction (2026-08-02, binding): **the route page shows one map.**

Today it shows two renderings of the same segments: Overview's "Route map"
card draws a static SVG mini map (`OverviewSection.tsx:129-149` —
`RouteGeoMap variant="mini"`, `CorridorMap mode="mini"` fallback), and the
Slow-segments tab draws the real interactive `RouteMapLibre` beside a
`SegmentReadout` rail (`SegmentExplorer.tsx:536-560`). That is the same
data family as two styled modules — the exact pattern the
no-duplicate-surfaces doctrine bans — and the static one is the FIRST map a
visitor meets. The operator's calls:

1. The Overview card survives and becomes the real map: interactive, with
   the same single anchored click-popup ruling the network map adopted in
   Plan 125 — click a segment, get one popup, native to the map surface.
2. Segment direction (NB/SB) gets a native, map-grade treatment — not a
   sidebar legend.
3. The Slow-segments map AND the entire right-hand readout rail retire
   ("I'm okay with losing the whole right side thing"). The ranked segment
   list — the tab's actual job — goes full width.
4. "When riders ride" (`RidersSection.tsx:189-249`) stops being a
   hand-rolled `div` bar chart with browser-`title` tooltips and becomes a
   real chart on the sanctioned Recharts/shadcn chart kit, with the app's
   styled tooltip.
5. The Overview speed-history chart stops floating in whitespace: the chart
   fills its card. (Operator weighed shrinking the card instead; grow-the-
   chart wins because the two-column grid row stays aligned and the card
   scale stays consistent with its map neighbor.)

Display-grain note: this moves no data across grains. The Overview card
already renders segment-grain speeds (the mini map colors segments); the
upgrade changes interactivity, not grain. It also RESOLVES a standing
duplicate-surface violation rather than creating one.

## Current state (origin/main@881d5611 excerpts)

- `OverviewSection.tsx:89-150` — the two-column grid:
  `ChartFrame title="Speed history" height={172}` (fixed-height chart inside
  a stretch-aligned card → the whitespace bug) beside the "Route map"
  SectionCard mounting `RouteGeoMap variant="mini"` when
  `useRouteSegmentsGeo` is ready, `CorridorMap mode="mini"` otherwise, and an
  "Explore route segments" button.
- `ChartFrame.tsx:20-31` — body is `<div style={{ minHeight: height }}>`;
  no fill mode, so a stretched card leaves dead space under the chart.
- `SegmentExplorer.tsx:455-483` — `mapBlock` mounts `RouteMapLibre` with
  hover/pin/direction/lanes wiring; `:536-560` — the
  `[minmax(0,1.55fr)_minmax(300px,0.8fr)]` grid of map column (map + caption
  + `SegmentSpeedLegend` + lanes notice) and `SegmentReadout`;
  `:811-1019` — the readout `<aside>` (3-stat grid, segment sparkline,
  history controls). Card-header controls at `:494-526`: Direction
  `FilterChips`, `PeriodControls`, the "Painted bus lanes (DOT)" checkbox,
  `SourceNote`.
- `RouteMapLibre` props today (`RouteMapLibre.tsx:27-44`): hover/pin
  callbacks, `activeDirection`, `displaySpeeds`, `showLanes`/`busLanes`. No
  popup.
- The network-map popup pattern to port: `NetworkMapLibre.tsx:66`
  (`NetworkMapPopupState`), mounted from `network-map.tsx:740-756` — an
  anchored popup rendered by the map component from a `popup` prop; close =
  ✕ / Esc / background click, focus restored via the existing
  `clearPin(restoreFocus)` convention (Plan 125 records the ruling: the
  anchored popup is THE click surface; no parallel panel).
- `RidersSection.tsx:200-248` — `WhenRidersRideCard`: 24 flex `div` bars,
  `title` attribute tooltips (`:221`), absolutely-positioned peak flag chip
  (`:223-227`), hand-drawn hour axis. Every other chart in the app flows
  through the lazy two-file Recharts pair (e.g. `SpeedTrend.tsx` →
  `SpeedTrend.chart.tsx`).
- Deep links that must survive: `?tab=segments&segment=<id>` (list/readout
  pinning, used by Riders' "open segment" and `?segment=` shares), and the
  gen-18 D2 lane-extent link from History changes (`laneChangeAnchor`,
  lanes overlay `?lanes=`). `route-detail.tsx:148-160` map-only fallback
  branch renders the explorer `mapOnly` — dies with the explorer map.

## Target behavior

1. **Overview "Route map" card = the interactive route map.**
   `RouteMapLibre` mounts there (lazy boundary unchanged — maplibre stays a
   split chunk; only WHEN it loads changes). Segments colored by observed
   all-day speed exactly as the explorer map colors them today
   (`displaySpeeds` current-period path); DOT-lanes overlay + its legend
   move here with the map. Card grows to earn the interaction
   (`min-h-[380px]` desktop, `320px` mobile — match the explorer's current
   map heights). The "Explore route segments" button survives (the ranked
   list still lives on the Slow-segments tab).
2. **One click surface: the anchored popup** (Plan 125's ruling, ported).
   Click a segment → popup with: segment label (from → to), direction line
   ("Northbound"), observed speed for all day, rank when available
   ("#3 slowest of 24"), and one terse link "See in segment list" →
   `?tab=segments&segment=<id>`. ✕ / Esc / background click closes and
   clears the pin; focus restore mirrors the network map. No hover popup —
   hover keeps the Plan-122-fixed feature-state emphasis only.
3. **Native direction treatment**: the popup names the direction; the
   existing Direction `FilterChips` relocate onto the map card header
   (compact, unchanged component); and IF the map style already has glyphs
   loaded, add a `symbol-placement: line` arrow layer (`text-field` "›",
   auto-rotating with line bearing) so direction is visible before any
   click. The arrow layer must not add sprite/glyph assets — if it would,
   skip it and note that in the PR (the popup + chips already satisfy the
   direction requirement).
4. **Slow segments tab**: the map column and `SegmentReadout` are deleted;
   the ranked list goes full width. Direction chips move to the map card
   (step 3); `PeriodControls`, the lanes checkbox (now controlling the
   OVERVIEW map via shared search state — or deleted here if the overlay
   control also relocates; executor picks the smaller diff and records it),
   `SourceNote`, and `HistoricalStatus` stay with the list.
   `?tab=segments&segment=<id>` now selects + scrolls the list row (keep
   the param contract; the readout-only affordances die per operator
   direction). The `route-detail.tsx:148-160` `mapOnly` fallback branch and
   the `map` section-registry entry retire (Plan 122 already de-lied the
   gate; now the branch itself goes).
5. **Lane-extent deep links (gen-18 D2) survive**: History-change links land
   on the Overview map with `?lanes=` on and, when a segment is named, the
   popup open. Verify one link end-to-end in tests.
6. **"When riders ride" on the chart kit**: new lazy pair
   `WhenRidersRide.tsx` + `WhenRidersRide.chart.tsx` (Recharts `BarChart`,
   24 hourly bars, app `ChartContainer`/`ChartTooltip` styled tooltip —
   "8 AM — 1,240 boardings"), peak bar emphasized (full-opacity fill + its
   existing label), hour ticks 12A/6A/12P/6P/11P. ChartFrame wrapper and
   both empty states keep their exact copy. The hand-rolled block is
   deleted.
7. **Chart fills card**: `ChartFrame` gains `fill` (body
   `flex min-h-0 flex-1 flex-col`); `SpeedTrend` accepts a responsive
   height (ResponsiveContainer 100% inside the fill body). Overview's Speed
   history uses it, so the chart matches the map card's height in the
   two-column row. No fixed-172px whitespace remains.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Scoped tests | `bun test apps/web/test/shared --timeout 15000` | exit 0 |
| Map runtime tests | `bun test apps/web/test/shared/maplibre-runtime.test.ts --timeout 10000` | exit 0 |
| Typecheck | `bun run check:types` | exit 0 |
| Build + budget | `bun --filter @bp/web build` | exit 0 (entry budget unchanged — maplibre stays a lazy chunk) |
| Doctrine | `bun run check:architecture` | exit 0 |

## Scope

**In scope**:

- `apps/web/src/components/route/OverviewSection.tsx`
- `apps/web/src/components/route/RouteMapLibre.tsx` / `RouteMapLibre.map.tsx`
  (popup prop + optional arrow layer)
- `apps/web/src/components/route/SegmentExplorer.tsx` (delete map column +
  readout; full-width list)
- `apps/web/src/components/route/RouteGeoMap.tsx`, `route-geo-map.ts`,
  `apps/web/src/components/CorridorMap.tsx` — delete IF orphaned after the
  swap (`rg` for remaining consumers first; CorridorMap may survive as the
  no-geo fallback — see Step 2)
- `apps/web/src/components/route/RidersSection.tsx` +
  new `WhenRidersRide.tsx`/`WhenRidersRide.chart.tsx`
- `apps/web/src/components/ChartFrame.tsx`, `SpeedTrend.tsx`/`.chart.tsx`
  (fill mode)
- `apps/web/src/components/route/section-registry.ts`,
  `apps/web/src/studio/pages/route-detail.tsx` (retire the `map`
  section/fallback)
- Matching tests under `apps/web/test/shared/`

**Out of scope**:

- `NetworkMapLibre`/network-map page (Plans 121/125 own it).
- Segment-history data layer (`segment-history-data.ts`,
  `route-detail-data.ts`) — Plan 122's discriminants stay; the readout
  strings it added die with the readout, expected drift, do not port them
  into the popup.
- Any new fetch, endpoint, or artifact. The Overview geo fetch
  (`useRouteSegmentsGeo`) already exists there.
- Popup redesign beyond the ported anatomy — the popup chrome mirrors the
  comp-approved network-map popup.

## Git workflow

- Branch off `origin/main` (after 122): `codex/126-one-route-map`
- Commits: (1) popup prop in RouteMapLibre, (2) Overview swap + lanes/legend
  relocation, (3) explorer map+readout retirement + deep-link rewiring,
  (4) When-riders-ride chart pair, (5) ChartFrame/SpeedTrend fill,
  (6) dead SVG-map deletion + tests.
- No push/PR unless the operator instructed it.

## Steps

### Step 1: Anchored popup in RouteMapLibre

Port the `popup` prop pattern from `NetworkMapLibre` (state type + anchored
render + close/focus semantics). Content per target behavior 2. Popup state
lives with the page/section owner (mirror how `network-map.tsx:740-756`
builds `NetworkMapPopupState`); extract shared popup chrome only if it
falls out as a ≤50-line shell — do NOT redesign either popup to force the
extraction.

**Verify**: new runtime tests — click segment → popup anchored with label +
direction + mph; Esc closes and clears pin; background click closes.

### Step 2: Overview card swap

Mount the interactive map in the "Route map" card (target behavior 1):
ready → `RouteMapLibre` with popup + direction chips + lanes overlay;
loading → existing pulse block; geo unavailable → keep `CorridorMap
mode="mini"` as the honest fallback (it makes no geographic claim beyond
schematic order) with a one-line note. Move `SegmentSpeedLegend` under this
map. Card sub copy: keep "Observed speed by segment."

**Verify**: OverviewSection render test — ready path mounts the interactive
map + legend; fallback path unchanged; "Explore route segments" button
present.

### Step 3: Retire the explorer map + readout

Per target behavior 4. Delete `mapBlock`, the grid, `SegmentReadout`
(`:811-1019`) and its imports; the ranked list takes the full card width.
Rewire `?tab=segments&segment=` to select + scroll the row. Retire the
`mapOnly` prop, the `route-detail.tsx:148-160` fallback branch, and the
`map` entry in `section-registry.ts` (tab registry: Slow segments now gates
only on the list surface). Update Riders' `onOpenSegment` target if its
shape changes (it should not — same params).

**Verify**: `bun test apps/web/test/shared --timeout 15000` — explorer tests
updated (no readout assertions; deep-link test asserts row selection +
scroll intent); `rg -n "SegmentReadout|mapOnly" apps/web/src` → no matches.

### Step 4: Lane-extent deep-link parity (gen-18 D2)

History lane-change links (`laneChangeAnchor` path) now target the Overview
map: `?lanes=true` (+ `segment` when named) opens Overview with the overlay
on and the popup open. Add/adjust the search-param plumbing in
`route-segment-explorer.ts`/route search schema only as far as the params
already exist — no new param names.

**Verify**: one end-to-end test: a history change link renders → navigate →
Overview map receives `showLanes` true and popup state for the named
segment.

### Step 5: When-riders-ride chart pair

Target behavior 6. Model the file pair on `SpeedTrend.tsx`/`.chart.tsx`
(lazy boundary, `ChartFallback`). Bars from the same
`hourlyProfile.data.hours` input; peak from `latestPeakWindow` unchanged.

**Verify**: chart render test (peak bar flagged, tooltip formatter output
pinned for one hour); `rg -n "title=\{\`\$\{formatHourShort" apps/web/src`
→ no matches (the browser-tooltip block is gone).

### Step 6: ChartFrame/SpeedTrend fill + Overview grid

Target behavior 7. `fill` is additive — untitled/fixed-height callers
unchanged. Apply on Overview's Speed history ChartFrame.

**Verify**: existing chart tests green; Overview snapshot shows no fixed
172px body (assert the fill class/prop, not pixels).

### Step 7: Dead-code sweep + full gates

`rg -n "RouteGeoMap|routeGeoMapModel|geoSpeedColor" apps/web/src` — delete
the SVG map stack if the Overview swap orphaned it (CorridorMap survives
only if Step 2 kept it as fallback). All commands exit 0;
`git status --porcelain` → in-scope only.

## Test plan

- Popup: open/close/focus + content lines (label, direction, mph, rank,
  list link).
- Overview: interactive-map ready path, fallback path, legend placement.
- Explorer: full-width list, `?segment=` row selection, no readout.
- D2 deep link end-to-end (step 4).
- Riders chart: bars + peak + tooltip formatter.
- Fill: ChartFrame fill prop behavior; non-fill callers untouched.

## Done criteria

- [ ] Exactly ONE map mounts across the route page
      (`rg -n "RouteMapLibre" apps/web/src/components/route` → the
      component pair + one mount in OverviewSection)
- [ ] `rg -n "SegmentReadout|mapOnly" apps/web/src` → no matches
- [ ] `?tab=segments&segment=` and the D2 lane link both covered by tests
- [ ] When-riders-ride renders through a lazy Recharts pair; no
      hand-rolled bar divs remain
- [ ] Speed-history card shows no dead vertical space (fill mode applied)
- [ ] All commands exit 0; `plans/README.md` gen-21 row updated

## STOP conditions

- The popup cannot port without duplicating >~100 lines of NetworkMapLibre
  internals — report the extraction seam instead of copying.
- The arrow layer would require adding glyph/sprite assets — skip arrows
  (allowed), but report if even the skip path is unclear.
- Any `?study=`/`?record=`/`?segment=`/`?lanes=` consumer breaks in a way
  that needs a NEW param or a redirect — report; the URL contract may not
  grow here.
- Bundle budget fails after the swap (would mean maplibre leaked into the
  eager entry — check the lazy boundary and the value-import gotcha before
  reporting).
- Plan 122 has not merged (drift check shows its edits missing).

## Maintenance notes

- Segment-grain month history (the readout's sparkline) loses its only
  surface here BY OPERATOR DIRECTION; the data path
  (`segment-history-data.ts` + artifact) stays intact for a future surface.
  If Plan 116's republish makes `spineReadiness` real and demand returns,
  design that surface fresh — do not resurrect the rail.
- Plan 123's comp must show THIS Overview (interactive map card, filled
  chart). Its glance card takes the slot Plan 122 emptied, unchanged.
- The popup is the recorded single click surface for the route map — same
  ruling as Plan 125 for the network map. Future richer content goes into
  the popup or behind its list link, never a parallel panel.

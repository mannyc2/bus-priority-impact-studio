# Plan 081: Unify the route Segments tab into an interactive evidence explorer

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` (Generation 9 table).
>
> **Drift check (run first)**:
> `git diff --stat cd878f7..HEAD -- 'apps/web/src/routes/routes/$routeId.tsx' apps/web/src/studio/pages/route-detail.tsx apps/web/src/studio/pages/network-map.tsx apps/web/src/components/CorridorMap.tsx apps/web/src/components/route/SlowSegments.tsx apps/web/src/components/route/RouteMapSection.tsx apps/web/src/components/route/RouteMapLibre.tsx apps/web/src/components/route/RouteMapLibre.map.tsx apps/web/src/components/route/RouteGeoMap.tsx apps/web/src/components/route/route-geo-map.ts apps/web/src/components/route/OverviewSection.tsx apps/web/src/components/route/segment-history-data.ts apps/web/src/components/route/NetworkMapInspector.tsx apps/web/src/studio/api-client.ts apps/web/test/shared/network-map.test.ts apps/web/test/shared/route-map-highlight.test.ts apps/web/test/shared/route-geo-map.test.ts apps/web/test/shared/maplibre-runtime.test.ts tests/harness/design-doctrine.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. Plans 077-080 intentionally touch
> several of these files, so their completed behavior supersedes the excerpts
> below and must be preserved.

> **Amendment (2026-07-12 — de-month direction, binding; see plan 079's
> amendment for the full mapping).** Month-keyed release identity is retired
> (ADR-0022). For this plan: (1) captions phrased "<release month>" become
> "coverage through <Month YYYY>" sourced from the serving response's
> latest-covered month; (2) where this plan validates that map, table, and
> history rows come from the same serving export, route the comparison
> through ONE shared helper (single call site per surface) — at execution
> time the studio detail response still carries `baselineMonth`, so compare
> that field, but the helper isolation lets plan 085 rename it to
> `coverage.end` in one place; (3) name any new props/fields/state
> `coverage`/`window`, never `baseline*`. Substance (same-export joins, exact
> overlays, pinning) is unchanged.

> **Amendment (2026-07-18 — operator critique, binding; comp round 1 in
> `plans/mockups/081-route-segment-explorer/`).** Measured basis, current
> release (350 routes / 4,123 served segments): ACE varies within a route on
> 0 routes, TSP on 0 (both are route-level values fanned out per segment —
> confirmed by `field-provenance.ts`); lane proximity varies within 309.
> Riders' "Top burden segments" is rows 1–6 of "Where the route loses time"
> (same `riderHours` sort). Changes to this plan:
>
> 1. **One segment surface.** Delete the "Top burden segments" card and the
>    `topSegments` duplication from the Riders tab; the Segments-tab table is
>    the only segment ranking on the route page. The "Highest-impact segment"
>    KPI tile stays and deep-links into the explorer, pinning that segment.
>    Scope adds: `apps/web/src/components/route/RidersSection.tsx`,
>    `apps/web/src/components/route/rider-impact-summary.ts`,
>    `apps/web/src/components/SegmentRow.tsx`,
>    `apps/web/src/components/route/route-derived.ts` (only to retire
>    now-unused helpers), and `apps/web/test/shared/riders-section.test.ts`.
> 2. **Riders gets rider-grain data.** Replace the deleted card with a
>    boardings-by-hour card built from the served hourly profile (per-hour
>    `ridership` + latest peak window). It supersedes the derived "Rider
>    exposure by hour" strip (`HourExposure` usage) so the tab keeps one hour
>    chart; monthly trend, KPIs, and equity context are unchanged.
> 3. **No segment-grain treatment display anywhere.** Step 5's deletions now
>    explicitly include the map section's 3-stat footer ("Bus lanes N%",
>    "ACE/TSP N segments", "Focus segment") and the per-row ACE/TSP chips in
>    `SegmentRow`/`TreatmentRow` usage. Lane proximity is the only treatment
>    that may render per segment, always proxy-labeled. Route-level ACE/TSP
>    render as caveated text facts in the readout (and Treatments tab), with
>    the 080-approved phrasing pattern ("Bus lanes along N% of this route's
>    shape").
> 4. **Speed-by-hour redesign.** Step 2's "the existing Speed by hour card
>    remains" now means: card stays, `WhereWhenWindowChips` is deleted, the
>    slowest window becomes an on-chart annotation, and the peak-ridership
>    windows move to the Riders card from item 2. Per-row hour strips leave
>    the table; segment-hour severity renders in the pinned readout instead.
> 5. **Comp gate.** The approved round of
>    `plans/mockups/081-route-segment-explorer/` is the acceptance target for
>    steps 2, 3, and 5 visuals (map interaction model, table anatomy, readout,
>    Riders swap, Speed-by-hour). If the operator rejects an exhibit, treat it
>    as a STOP for that surface and re-comp; do not improvise an alternative.
>
> **Round 2 (same day, binding — operator review of comp round 1):**
>
> 6. **Fixed-slot readout, no treatment prose.** The selected-segment readout
>    uses identical slots for overview/preview/pin (label, segment line, lane
>    line, three-stat row, severity strip, history slot, actions) — the layout
>    never shifts with the selection. No route-level treatment facts render in
>    the explorer at all (supersedes step 5's "badges in the readout/data
>    note" for this surface — the Treatments & history tab and data notes own
>    ACE/TSP). Lane renders as one plain readout line ("Along a DOT bus-lane
>    street — most / part / a little of this stretch (proximity)") plus the
>    opt-in DOT geometry layer.
> 7. **Table defaults collapsed.** Eight rows + "Show all N segments"
>    (supersedes step 2's "full table, not only the first eight rows" — the
>    full table remains one expander away, which satisfies the accessible
>    text-equivalent requirement). Pinning a segment outside the visible
>    slice auto-expands. The lane column is deleted from the table.
> 8. **Share is a button, never text.** Pinning writes the durable spine-ID
>    URL (step 1 unchanged), but the UI must never render raw URL/query
>    text — a "Copy link" action in the readout does it; segments without a
>    spine ID get a disabled control, not a fabricated link.
> 9. **Terse CTAs and legends.** The Riders "Highest-impact segment" KPI is
>    the fact plus a two-word "Map ›" deep link; hour-chart legends carry no
>    sentences (on-chart flags + card subtitles do the explaining).
>
> **Rounds 3–4 (same day, binding — lanes layer; r3's blurred-band treatment
> was rejected by the operator, r4 replaces it):**
>
> 10. **Painted-lane solid underlay — no dashes, no glow.** Step 5's exact
>     lane layer renders as ONE solid line layer ordered between the casing
>     and the route/network lines: `line-color` from the shared lane green,
>     full opacity, round caps/joins, `line-width` zoom-interpolated to sit
>     ≈3px wider than the route line at every zoom (route line ≈3.5px → lane
>     ≈6.5px; scale both together). Coincident stretches read as a crisp
>     green rim around the speed-colored line; divergent lane streets read as
>     their own thin solid line. No `line-dasharray` (the MapLibre v5 spec
>     gives it neither smooth zoom scaling nor data-driven styling) and no
>     `line-blur`. The toggle renders only when DOT lane geometry exists near
>     the route (34/350 routes have none) and is labeled "Painted bus lanes
>     (DOT)". Applying the same treatment to the network map's `LANES_LAYER`
>     (today `line-dasharray [3,4]` at fixed 1.5px in
>     `NetworkMapLibre.map.tsx`) is an 080 amendment candidate — adopt it
>     there in the same commit only if 080's owner signs off; otherwise keep
>     the two layers visually consistent at the token level and file the
>     follow-up.
> 11. **Readout header uses card grammar.** The selected-segment readout's
>     header is a standard title + one-line description (the same anatomy as
>     SectionCard titles), and the description line carries interaction
>     state: "Pin a segment for its 36-month speed history." (overview) →
>     "Previewing — click to pin." → "Pinned — Esc or Clear selection to
>     release." No mono eyebrow labels in the readout header; the fixed-slot
>     layout from item 6 is unchanged.

## Status

- **Plan status**: DONE (completed 2026-07-19; implementation through
  `aee2b3df`, with the browser and verification receipt recorded in
  `knowledge/log.md`)

- **Priority**: P1
- **Effort**: L
- **Risk**: MED-HIGH
- **Depends on**: `plans/077-restore-maplibre-rendering.md`,
  `plans/078-canonical-map-segment-identity.md`, and
  `plans/079-truthful-map-contracts.md`, and
  `plans/080-network-decision-map.md`; plan 080's pinned-route drill and
  explicit `Open route` CTA are required inputs, not optional merge order
- **Category**: direction
- **Planned at**: commit `cd878f7`, 2026-07-09 (working tree already dirty in
  `plans/` only)

## Why this matters

The route page is where riders, advocates, planners, and reporters move from
"this route is slow" to the useful questions: which stretch, in which
direction, during what period, what route-slice passenger-delay exposure is
observed, whether the problem persists, and whether an intervention actually
overlaps it. Today the
ranked segment list, hour chart, historical sparklines, and route map are
separate surfaces with separate state. The map is hover-only, chooses a focus
without user action, and draws route-level ACE/TSP proxies as if they were
exact points. On a phone, the 560px map is more scroll obstacle than decision
tool.

This plan keeps the existing Segments tab and turns those pieces into one
linked, shareable segment explorer. It gives the map a useful job—locating and
comparing observed evidence—while retaining an equivalent structured table
for people who cannot or do not want to operate a map. It does not add a tab,
claim causal effects, invent treatment geography, or restore the rejected
autoplay/hour scrubber.

## Current state

- `apps/web/src/studio/pages/route-detail.tsx:93-111` renders
  `SlowSegmentsSection` and `RouteMapSection` one after the other. Selection,
  direction, history, and loading state do not cross that component boundary.
- `SlowSegments.tsx:68-91` privately fetches the hourly profile and speed
  history, derives segment history, and owns direction/open-row state. The map
  cannot reuse the result, so adding time controls there would either duplicate
  a fetch or create a second source of truth.
- Its direction type allows NB/SB/EB/WB, but the rendered controls are hardcoded
  to All/NB/SB. East-west routes therefore cannot use the intended filter.
- `segment-history-data.ts:44-54` calls its monthly all-day result
  “rider-weighted” but chooses observation count before traversal count. The
  producer uses traversal count first and falls back to observation count only
  when traversals are zero
  (`packages/analytics/src/feature-history/route-speed-history.ts:638-645`).
  Historical map aggregation needs one explicit formula and missing-daypart
  gate.
- The list initially shows eight segments and an expandable detail row. It is
  already the closest thing to an accessible text alternative, but its open
  row is not linked to the map and its `openId` is not shareable.
- `RouteMapSection.tsx:100-135` owns only transient `hoveredSegmentId` and
  treatment layer booleans. When nothing is hovered it falls back to a
  detector/flagged segment selected by `routeMapHighlight`; this looks like a
  user selection even though it is not one.
- `RouteMapLibre.map.tsx:86-119` associates map features to Studio segments by
  direct ID and then positional direction/index fallbacks. Plan 078 removes
  those fallbacks and provides the canonical exact/stable identities required
  by this plan.
- `RouteMapLibre.map.tsx:177-215` constructs ACE/TSP markers at each matched
  segment line's midpoint. Those records are route-level or legacy proxy
  evidence, not audited point geography. `RouteMapSection.tsx:225-246` labels
  the checkboxes simply “ACE” and “TSP”, which overstates precision.
- The bus-lane display at `RouteMapLibre.map.tsx:335-359` offsets the route
  line where the Studio segment has a categorical lane flag. It is not the
  published NYC DOT lane geometry already present in the release artifacts.
- The no-geometry `CorridorMap.tsx:42-76,225-271` draws lane, ACE, and TSP as
  exact-looking segment rails from the same categorical/proxy fields and calls
  them “segment-varying treatments.” It must not preserve a stronger claim
  than the interactive map when it becomes the fallback.
- The runtime subscribes only to `mousemove`/`mouseleave` on the hit layer
  (`RouteMapLibre.map.tsx:293-307,397-398`). There is no click/tap pin, focus
  model, keyboard selection, or selected-segment URL state.
- The same source is replaced with a newly derived GeoJSON collection when
  hover changes (`RouteMapLibre.map.tsx:427-435`). Plan 080 establishes the
  feature-state pattern for the network map; use the same runtime convention
  here rather than rebuilding geometry for presentation state.
- `RouteMapSection.tsx:155-181` fixes the geographic panel at 560px, while the
  map is created with `cooperativeGestures: false` by omission. Plan 077 owns
  the bounded/cooperative/reduced-motion baseline; this plan adapts the layout
  for phones and tablets.
- `RouteGeoMap.tsx` labels a non-interactive SVG as a map image and colors
  current segments by speed. It remains a useful no-WebGL fallback and
  overview locator, but it cannot be the only equivalent for interactive
  controls.
- `OverviewSection.tsx:51,113` separately fetches route geometry and renders a
  mini `RouteGeoMap`. It should remain a restrained locator and deep-link to
  the Segments explorer rather than grow its own controls.
- The route search contract currently accepts only `?tab=`
  (`apps/web/src/routes/routes/$routeId.tsx:16-42`). Plan 078 makes a stable
  geographic spine ID available; that is the only segment identifier suitable
  for durable deep links and historical joins.
- Segment history readiness is not uniform. The audited spine output includes
  `series_ready`, `series_ready_with_gaps`, and `needs_pattern_review` cases.
  Historical coloring must be gated, and the map must say that historical values are
  joined to the current route shape by geographic spine rather than implying
  historical geometry.
- Domain provenance already says ACE is applied at route level, TSP may use a
  2017 status snapshot, and lane proximity is not exact corridor coverage
  (`packages/domain/src/studio/field-provenance.ts:95-110,218-228`).
- Binding operator direction in `plans/README.md`: no new top-level page, tab,
  or nav item; deep links use search params; evidence must look good and belong
  in the existing tab; do not fabricate metrics or exact geography.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web typecheck | `bun --filter @bp/web typecheck` | exit 0 |
| Focused model/runtime tests | `bun test apps/web/test/shared/route-map-highlight.test.ts apps/web/test/shared/route-geo-map.test.ts apps/web/test/shared/route-segment-explorer.test.ts apps/web/test/shared/maplibre-runtime.test.ts --timeout 5000` | all pass |
| Web tests | `bun run test:web` | all pass |
| Worker tests | `bun run test:worker` | all pass |
| Design doctrine | `bun run check:design-doctrine` | exit 0 |
| Architecture/style | `bun run check:web-architecture && bun run check:style` | exit 0 |
| Web build/vendor budget | `bun --filter @bp/web build && bun run check:web-performance` | exit 0; entry, lazy map chunk, and MapLibre vendor budgets pass; plan 079's artifact audit—not this command—owns generated network/lane budgets |
| Dev server | `bun --filter @bp/web dev` | route pages load for manual viewport/input checks |

## Suggested executor toolkit

- Use `shadcn` and compose the installed `ToggleGroup`, `Select`, `Sheet`,
  `ScrollArea`, `Button`, `Badge`, and `Tooltip` primitives. Every
  `SheetContent` must include an accessible title and description. Do not add
  a competing drawer/overlay implementation.
- Use `vercel-react-best-practices` for single-owner async state, derived
  segment models, lazy layer loading, stable callbacks, and feature-state
  updates. Avoid storing data that can be derived from the response + URL.
- Preserve Effect conventions in any domain/schema work delivered by plans
  078/079; this plan should usually need only the already-published contracts.
- Follow the feature-state convention established by plan 080 and MapLibre's
  official hover pattern:
  https://maplibre.org/maplibre-gl-js/docs/examples/create-a-hover-effect/
- Treat the table/readout as the equivalent structured description required
  for a complex map, not as secondary content:
  https://www.w3.org/WAI/tutorials/images/complex/
- Meet keyboard equivalence and minimum target guidance:
  https://www.w3.org/WAI/WCAG22/Understanding/keyboard and
  https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum

## Scope

**In scope**:

- `apps/web/src/routes/routes/$routeId.tsx`
- `apps/web/src/studio/pages/route-detail.tsx`
- `apps/web/src/studio/pages/network-map.tsx` only to upgrade plan 080's
  `Open route` CTA after the route search contract can accept `segment`
- `apps/web/src/components/route/NetworkMapInspector.tsx` only if plan 080
  extracted that CTA there; update whichever single owner exists, never both
- `apps/web/src/components/CorridorMap.tsx`
- `apps/web/src/components/route/SlowSegments.tsx`
- `apps/web/src/components/route/RouteMapSection.tsx`
- `apps/web/src/components/route/RouteMapLibre.tsx`
- `apps/web/src/components/route/RouteMapLibre.map.tsx`
- `apps/web/src/components/route/RouteGeoMap.tsx`
- `apps/web/src/components/route/route-geo-map.ts`
- `apps/web/src/components/route/OverviewSection.tsx`
- `apps/web/src/components/route/segment-history-data.ts`
- one focused `route-segment-explorer.ts` model/hook module beside the route
  components if that keeps URL, eligibility, and display derivation pure
- `apps/web/src/studio/api-client.ts` only for consuming plan 079's manifest
  and exact bus-lane layer; do not create a second artifact contract
- existing installed shadcn primitives under `apps/web/src/components/ui/`
  only if a missing variant/prop is required
- `apps/web/test/shared/route-map-highlight.test.ts`
- `apps/web/test/shared/network-map.test.ts` only for the selected-segment
  network-to-route deep-link regression
- `apps/web/test/shared/route-geo-map.test.ts`
- new `apps/web/test/shared/route-segment-explorer.test.ts`
- `apps/web/test/shared/maplibre-runtime.test.ts`
- `tests/harness/design-doctrine.test.ts` only to ratchet temporary map
  exceptions after the redesign
- `plans/README.md` (status row only)

**Out of scope**:

- A new route, top-level page, route-detail tab, or nav item.
- A trip planner, realtime vehicle animation, drawing tools, autoplay, or an
  hour-by-hour movie/carpet UI.
- A renderer swap, hosted basemap, third-party tile source, PMTiles migration,
  or CSP expansion.
- Browser- or Worker-time spatial joins. Every public join remains an offline,
  verified pipeline output from plans 078/079.
- Treating a route-level ACE flag, legacy TSP snapshot, or categorical lane
  proximity as point/line geography.
- A causal “before/after” treatment claim. Plan 075 owns reviewed study
  presentation; only its audited exact event geography may later be added.
- The opportunity/composite score proposed in plan 076.
- Replacing all segment prose or the hourly chart. The explorer coordinates
  those evidence surfaces; it does not erase useful non-map context.
- Adding a browser automation dependency. Real browser/device checks remain a
  manual acceptance gate because none is installed in the audited workspace.

## Git workflow

- Branch: `codex/081-route-segment-explorer`
- Commit logical units: (1) route URL + explorer model/async ownership,
  (2) linked table/readout + responsive composition, (3) MapLibre selection,
  history, and exact layers, (4) overview/fallback polish + tests/ratchets.
- Example message: `Route maps: add linked segment evidence explorer`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Define one shareable explorer state and one owner for evidence

Extend the existing route search validator without creating a new route:

```ts
type RouteDetailSearch = {
  tab?: "segments" | "riders" | "history";
  segment?: string; // stable geographic spine ID; valid only on Segments
  direction?: "NB" | "SB" | "EB" | "WB"; // All is omitted
  month?: string;   // explicit YYYY-MM activates historical mode
  daypart?: "am_peak" | "midday" | "pm_peak" | "off_peak"; // requires month
  lanes?: true;
};
```

Normalize impossible combinations out of the returned search object. Omit
defaults (all directions, no historical month/daypart, and no layer) so URLs
stay short. Derive the available direction controls from the route's segments;
never hardcode NB/SB. An
explicit `month` is required to distinguish historical all-day from the
current all-day default; omitting `daypart` with a month means aggregate that
month's supported dayparts. A segment pin may push one history entry;
direction/month/daypart/layer control changes should use `replace: true`.
Hover/focus never enters the URL. When a linked stable spine ID is absent from
the route, drop it and show the overview state—never select by array position
or silently choose the flagged segment.
Pass the whole normalized search model from the route module to the route page,
not only `tab`. `validateSearch` handles structural checks (enum values and the
`YYYY-MM` shape); an evidence-aware helper runs after loader data is available
and replaces unsupported route-specific values. Changing away from Segments
clears `segment`, `month`, `daypart`, and `lanes`; entering Segments may
preserve only values that validate against the loaded route evidence.
Clear `direction` when leaving Segments too. If an incoming pinned segment is
outside the requested direction, canonicalize the direction to that segment's
actual direction so a shareable pin is never hidden.

History-dependent normalization is tri-state because supported months,
dayparts, and readiness arrive from the lazy speed-history request, not the
route loader:

- `pending`: preserve structurally valid `month`/`daypart` parameters and show
  current coloring plus a “loading saved historical view” state;
- `ready`: validate them against the response/readiness, then remove only
  unsupported values with `replace: true`; `needs_pattern_review` cannot enable
  historical coloring;
- `unavailable`/request error: preserve the structurally valid URL so a
  transient outage does not destroy a shared link, keep current coloring, and
  state that the historical selection cannot be validated.

Test direct reload and Back/Forward across pending, ready-valid,
ready-invalid, and error states. Never treat pending/error as evidence that a
saved period is invalid.

Resolve direction/pin conflicts by event origin. For an incoming shared URL,
the validated pinned segment wins and direction canonicalizes to its actual
direction. When the user explicitly chooses a different direction, clear both
the stable URL pin and any current-only local selection before applying the
new filter; do not snap the direction control back. Provide a visible “Clear
selection” action and test both flows.

Hoist `useRouteSpeedHistory` and the history-derived model out of
`SlowSegmentsSection` into the Segments-tab composition (or a single focused
hook). Keep the hourly-profile request with the hour chart unless another
consumer actually needs it. There must be one speed-history request, one
abort lifecycle, and one normalized `Map<stableSpineId, series>` shared by the
table, readout, and map.

In parallel, load only plan 079's manifest plus
`fetchMapRouteFacts(manifest, signal)` and select the current route's fact; do
not fetch the citywide network geometry on route detail. Cache/share this one
route-fact result across the segment table, readout, and treatment badges. It
is `available` only when its baseline matches plan 079's typed
`StudioRouteDetailResponse.baselineMonth`, every compact summary field matches
the corresponding `data.route` field, an available delay value equals
`data.route.riderHoursLost`, an available lane `valuePct` equals
`data.route.laneCoverage`, and an available ACE status equals
`data.route.aceStatus`. Unavailable lane/ACE provenance remains unavailable or
unknown; never substitute the route object's fallback zero/none as evidence.
This rejects the lossy D1 fallback even when route ID/month happen to match.
Pending/error/absent/mismatch states leave delay-exposure values and exact
provenance unavailable without blocking speed or geometry. Add abort and
mismatch tests for summary, lane, ACE, and delay parity.

Define pure helpers for:

- search validation/canonicalization;
- selected, hovered/focused, and display segment precedence;
- direction and sort filtering without hiding a URL-pinned segment;
- supported months/dayparts and readiness gates;
- current/all-day vs historical display values;
- concise source/caveat text.

The table has one deterministic ranking contract and no independent sort URL:
rank by the active displayed speed ascending (slowest first)—current all-day in
current mode, selected month/daypart or selected-month all-day aggregate in
historical mode. Null/unavailable values sort last, followed by direction,
display order, then stable ID. Route-slice delay exposure remains secondary
context and never controls rank while the map is colored by speed. Label the
table “Slowest first — <active period>”; if every active value is null, label
it “Route order — no ranked speed evidence” and use direction/display order.
Test current/historical rank changes, ties, and null-last behavior.

Do not put the whole GeoJSON response or duplicated selected-segment objects in
React state. Store durable URL IDs and transient interaction IDs; derive the
rest from the normalized maps.

**Verify**:

```sh
bun test apps/web/test/shared/route-segment-explorer.test.ts --timeout 5000
bun --filter @bp/web typecheck
```

Expected: invalid combinations collapse to canonical search state; an unknown
ID or `needs_pattern_review` route cannot activate historical coloring; there
is one speed-history request owner.

### Step 2: Compose one linked map, readout, and complete segment table

Replace the disconnected “Where the route loses time” + “On the map” stack in
the existing Segments tab with one `Segment Explorer` composition. Preserve
the route-page section capability gates and existing MTA visual language.

Desktop/tablet layout:

- compact controls and evidence caption above the explorer;
- map as the primary locator, with a persistent selected-segment readout beside
  it where width permits;
- the full filterable/ranked segment table directly below, not only the first
  eight rows; use a constrained `ScrollArea` only if the page remains usable at
  1024px;
- the existing “Speed by hour” card remains below the explorer, sharing the
  same visual period vocabulary but not pretending route-hour data is
  segment-hour data.

Mobile layout:

- a 280-360px bounded map, not a fixed 560px panel;
- a clear “Select a segment” action/readout that opens a shadcn `Sheet` or
  stacks the selected evidence beneath the map;
- a complete tap-friendly segment list remains in normal document flow;
- no control or result may exist only on hover.

Use the same segment button semantics in the table and fallback. Each row must
communicate direction, from/to, current value (or no data), route-slice delay
exposure only when the selected `MapRouteFact.delayExposure.status` is
`available`, and treatment/source state. Use the fact's exact denominator/
coverage note for every segment value; if the fact is pending, missing,
mismatched, or unavailable, render delay exposure unavailable rather than
showing an unqualified `segment.riderHours`. Selected, focused, and flagged are
visually distinct concepts. Do not mark a route's worst/flagged segment as
“selected” on initial render.

The map is not the accessible name/description for the whole experience. Give
the canvas a concise instruction (“Interactive route segment map; use the
segment list for the same data”), add a nearby visible caption, and ensure the
table/readout contains equivalent values and source caveats. Do not wrap an
interactive MapLibre canvas in `role="img"`.

**Verify**:

```sh
bun test apps/web/test/shared/route-segment-explorer.test.ts apps/web/test/shared/route-map-highlight.test.ts --timeout 5000
bun run check:style
```

Expected: every mapped segment has one list control and one exact current
`studioSegmentId`; matched controls pin the corresponding stable URL ID,
unmatched controls enter an explicitly current-only local selection, and no
initial selection is fabricated.

### Step 3: Add pointer, touch, and keyboard selection without rebuilding geometry

Migrate `fetchRouteSegmentsGeo` to plan 079's shared
`fetchVerifiedMapArtifact` boundary using the route-segment manifest entry.
These month keys are mutable aliases too. On hash mismatch, mark geographic
geometry integrity unavailable, keep the current structured table/readout
usable, and do not accept a map-derived selection. Add a fixture that mutates
the body without changing the manifest hash.

On the MapLibre hit layer, add a click/tap handler that reads the exact current
`studioSegmentId` and resolves its segment record. If `spineSegmentId` is
non-null, pin that durable ID through route search state. If it is null, keep a
`currentOnlyPinnedStudioSegmentId` in local component state, label the readout
“Current segment; stable history/share link unavailable,” and leave `segment`
out of the URL. It remains fully inspectable but does not pretend to be durable.
Keep mouse hover transient.

Keyboard row focus only previews feature state; it must never pan or zoom the
map while a user tabs through rows. Only explicit pin/search actions may call
`fitBounds`/`easeTo`, and then only when reduced motion is not requested.
Pinning must not move keyboard focus into the canvas or steal focus from the
activating row.

Make the map source geometry stable. Promote unique non-null
`studioSegmentId` as the MapLibre feature ID; keep nullable `spineSegmentId` as
a property for URL/history resolution. Use `setFeatureState` for `hovered` and
`selected`, always addressed by the current Studio ID. Express opacity, width,
and outline from feature-state expressions. A hover or selection change must
not deep-copy the collection or call `GeoJSONSource.setData`; reserve `setData`
for actual evidence/period data changes. Preserve the initialization, error,
bounds, cooperative-gesture, and cleanup behavior delivered by plan 077.

On keyboard focus/blur of a segment row, preview the same feature without
changing the URL. Enter/Space pins it through the native button action. Escape
closes the mobile sheet and returns focus. Ensure all interactive targets are
at least 24px in both axes, with the product's preferred 36-44px row/toolbar
targets where space allows.

Update the static SVG/corridor fallback to accept the same selected current
Studio ID (derived from a stable URL pin when matched) and expose selection only
through real `<button>` rows/readout—not clickable SVG `<g>` elements. The
fallback remains fully useful with WebGL disabled.

**Verify**:

```sh
bun test apps/web/test/shared/maplibre-runtime.test.ts apps/web/test/shared/route-geo-map.test.ts apps/web/test/shared/route-segment-explorer.test.ts --timeout 5000
```

Expected mocked-runtime assertions: matched click pins the queried stable ID;
unmatched click makes a current-only selection with no URL segment; hover and
focus update Studio-ID feature state; focus never moves the viewport;
hover/pin never call `setData`; listeners and feature state are cleared on
teardown; keyboard list actions work without the canvas.

### Step 4: Add honest month and daypart comparison on the current route shape

Offer a compact value control with `Current all-day` as the default. Only show
month/daypart options supported by the published response and plan 078's
coverage/readiness metadata. Historical mode colors segments by the selected
month/daypart value joined through plan 078's stable spine. Nulls remain null
and render with a neutral patterned/dashed “no observation” treatment; do not
substitute current/all-day speed.

Define historical values once in `segment-history-data.ts`:

- An explicit daypart uses that cell only when `status === "available"` and
  speed is non-null.
- Historical all-day (month present, daypart omitted) excludes only
  `not_expected` cells. Every expected cell must be available with a non-null
  speed; any `missing`/`source_missing` expected daypart makes the segment-month
  unavailable rather than a biased partial-day average.
- Weight available dayparts by `traversalCount`; use `observationCount` only
  when that cell has zero traversals. If both are zero, treat it as invalid/no
  value. Rename the existing misleading “rider-weighted” comment.

Unit-test unequal traversal/observation counts, `not_expected`, one missing
expected daypart, all missing, and a selected daypart. The table, map, readout,
and sparkline must call this same helper.

Historical mode must display this exact semantic distinction in visible copy:

> Current route shape; historical speed is joined by geographic segment spine.

For `series_ready_with_gaps`, disclose the gap count/range and show missing
segments neutrally. For `needs_pattern_review`, disable historical map coloring
for that route and explain why; the current all-day map remains available. The
legend derives from the active metric and includes a no-data key. Retain exact
numeric values in the readout/table so color is never the only carrier.

Use the same fixed mph domain/anchors for current, every month, and every
daypart. Do not rescale by selected period or visible direction; the same speed
must always have the same color. In historical mode, separate grains in the
readout: `Speed — <month/daypart>` and, only as secondary context, `Current
route-slice delay exposure — <release month>, all-day`. Never place that
current delay-exposure value beside historical speed without the explicit
label and the selected `MapRouteFact.delayExposure` denominator/coverage note;
if that fact is unavailable, omit the number and say why. Never rank it as
though it belongs to the historical period.

Do not add playback, animated interpolation, a 24-position scrubber, or a new
“change/opportunity” score. If a genuine comparison mode is desired later, it
must use two named supported periods and transparent arithmetic in a separate
approved plan.

**Verify**:

```sh
bun test apps/web/test/shared/route-segment-explorer.test.ts apps/web/test/shared/maplibre-runtime.test.ts --timeout 5000
```

Expected: selected month/daypart values join by stable spine only; gaps are
neutral; current values never backfill historical nulls; traversal-first
aggregation and missing-daypart gates hold; speed color is period-invariant;
readiness controls which modes render.

### Step 5: Replace proxy treatment marks with exact published geometry and truthful badges

Delete the route-midpoint ACE/TSP marker construction and layers. Delete the
offset route-line bus-lane proxy. Consume plan 079's verified manifest and
lazy-load the published NYC DOT bus-lane feature collection only when the
`lanes` toggle is on. Render that source geometry with a restrained casing and
distinct legend label such as “NYC DOT published bus-lane geometry”; do not
infer that every overlapping route segment is treated.

Clip by precomputed artifact partition/bounds if plan 079 provides it. Do not
perform a browser spatial join. If the manifest marks the lane layer missing,
stale, partial, or failed, disable the toggle and state the exact reason. The
route and segment metrics continue working independently.

Represent ACE and TSP as non-spatial evidence badges in the readout/data note:

- ACE: route-level status and route-month scope from plan 079's selected
  `MapRouteFact.provenance.ace`; show its nullable source as-of value or the
  literal “source date unavailable”—never manufacture a day from the release
  timestamp.
- TSP: route-level/corridor status from
  `MapRouteFact.provenance.tsp`, including the exact source date when present
  and the 2017 snapshot caveat where applicable.
- lane proximity/coverage: preserve its proxy label anywhere the categorical
  Studio metric remains visible; do not call it exact mapped coverage.

Resolve that fact by route ID from the same manifest-declared map-facts
projection already consumed by plan 080. If the route is outside that
projection or the fact is unavailable, render a generic unavailable badge and
the package-level provenance caveat; do not widen shared `StudioRouteSchema`
or read pipeline-only extended fields that its public parser strips.

Apply the same rule to `CorridorMap`: remove the lane/ACE/TSP coverage rails
from its spatial profile. Put route-level/proxy badges and caveats in the
shared external readout instead, so the no-geometry fallback never claims a
treatment is located on a particular segment.

Plan 075 may later add a reviewed intervention event to the map only when the
served event explicitly declares audited line/point geography, grain,
precision, and source. Absence of exact geometry remains textual; it is not a
reason to synthesize a midpoint.

**Verify**:

```sh
bun test apps/web/test/shared/route-segment-explorer.test.ts apps/web/test/shared/maplibre-runtime.test.ts --timeout 5000
bun run test:worker
```

Expected: tests assert that no ACE/TSP midpoint marker or route-offset lane
proxy exists; the exact lane layer is requested only after opt-in and only
when the manifest says it is ready.

### Step 6: Make the overview map a restrained locator into the explorer

Keep the overview mini map non-interactive and lightweight. Apply plan 077's
valid shared palette, plan 079's named borough context where it fits without
clutter, and the same no-data treatment as the explorer. Remove any automatic
“slowest” glow that reads as a selection; a small label or adjacent sentence
may identify the evidence-backed worst segment without implying user focus.

Add one normal text/button link beside the mini map: “Explore route segments”.
It always navigates to the unpinned `?tab=segments` overview. The current
Overview insight callback exposes only a destination section, not an exact
segment identity; do not broaden that contract or infer a target in this plan.
Do not make the SVG paths keyboard-interactive or duplicate the full explorer
controls on Overview.

Now that `$routeId` accepts `segment`, upgrade plan 080's network-map `Open
route` CTA: pass `?tab=segments&segment=<stableSpineId>` for a matched selected
segment, and only `?tab=segments` for a current-only/unmatched selection. Use
plan 080's tested source-ID↔slug mapping; add a network test covering an SBS
route and a stable segment. This small integration is why `network-map.tsx`
(or plan 080's extracted `NetworkMapInspector.tsx`) and
`network-map.test.ts` are in scope here rather than plan 080.

Confirm that the corridor fallback, overview locator, network selected-route
drill from plan 080, and route explorer use the same color meanings, no-data
treatment, selected outline, and terminology. Centralize only small pure style
tokens/helpers; do not merge unrelated component state.

**Verify**:

```sh
bun test apps/web/test/shared/route-geo-map.test.ts apps/web/test/shared/route-segment-explorer.test.ts --timeout 5000
bun run check:design-doctrine
```

Expected: the overview has a normal navigable call to action, no fake selected
segment, and the fallback tells the same evidence story without WebGL.

### Step 7: Run real viewport, input, fallback, and evidence QA

Start the production-like dev server and inspect at 1440px, 1024px, and 390px.
Use at least:

- **B41**: the audited identity canary; verify both directions, including the
  previously reversed final southbound segments, select the correct table row
  and history series.
- **M15 SBS**: a high-ridership treatment corridor; distinguish exact published
  lane geometry from route-level ACE/TSP evidence.
- **One route with gaps or `needs_pattern_review` history**: verify neutral
  no-data and disabled historical mode.
- **One route without geographic geometry**: verify the corridor/table
  fallback is complete and shareable.

For each viewport, test mouse, keyboard-only, and touch/emulated touch:

1. Open the Segments tab with no params: no segment is selected.
2. Focus and pin a table row; map/readout/URL agree and focus stays usable.
3. Tap a map segment; the mobile readout appears before any navigation.
4. Reload and use Back/Forward; durable state reproduces correctly.
5. Change month/daypart; values, legend, source caption, and no-data states
   agree.
6. Toggle exact lanes; network request is lazy and its source/caveat is visible.
7. Enable reduced motion and confirm no animated fit/line transition/pulse.
8. Disable WebGL or force runtime failure; the equivalent list/readout and
   fallback remain operable.
9. Pan/zoom on a phone; cooperative gestures prevent the map from trapping
   page scroll.
10. Zoom text to 200%; controls, selected evidence, and source notes remain
    readable without horizontal page scrolling.

Record screenshots and a short checklist in the PR description; do not commit
generated screenshots unless repository policy changes.

**Final verification**:

```sh
bun test apps/web/test/shared/route-map-highlight.test.ts apps/web/test/shared/route-geo-map.test.ts apps/web/test/shared/route-segment-explorer.test.ts apps/web/test/shared/maplibre-runtime.test.ts --timeout 5000
bun --filter @bp/web typecheck
bun run test:web
bun run test:worker
bun run check:web-architecture
bun run check:design-doctrine
bun run check:style
bun --filter @bp/web build
bun run check:web-performance
```

Expected: every command exits 0; manual evidence covers all four route cases,
three widths, keyboard/touch, reduced motion, and WebGL fallback.

## Test plan

- **Pure state**: route search normalization; default/no implicit selection;
  hover/focus/pin precedence; Back/Forward; incoming-pin versus explicit
  direction-change behavior; active-speed ascending ranking, tie-breaks, and
  null-last behavior; derived NB/SB/EB/WB options; stable-spine lookup; current-only
  unmatched selection; invalid route/segment rejection.
- **History**: `series_ready`, gaps, and `needs_pattern_review`; month/daypart
  eligibility; exact stable-spine joins; traversal-first all-day aggregation;
  missing/not-expected dayparts; historical nulls remain null; fixed speed
  domain; period/grain caption and legend text.
- **Runtime**: click/tap selection, pointer hover, table focus preview,
  Studio-ID feature-state updates, no focus pan, no hover-time `setData`,
  listener teardown, reduced motion, fatal fallback, exact lane-source
  lifecycle.
- **Accessibility**: native buttons/list semantics, visible focus, Escape focus
  return, minimum target size, non-color numeric state, complete table
  alternative, no interactive-canvas `role="img"` wrapper.
- **Truthfulness**: no ACE/TSP midpoint markers, no offset proxy lane line, no
  current-value historical fill, exact layer manifest gate, source date/scope,
  current-shape/historical-spine disclosure.
- **Responsive**: 1440/1024/390px layouts, 200% text zoom, touch sheet/stack,
  cooperative page scroll, fallback without WebGL.
- **Regression**: route detail capability gates, lazy heavy artifact behavior,
  overview navigation, route hour chart, network-to-route deep links, Worker
  artifact serving, bundle and map budgets.

## Done criteria

- [ ] The existing Segments tab contains one coordinated map, readout, and
      complete structured segment list; no new page/tab/nav exists.
- [ ] The initial state does not present any segment as user-selected.
- [ ] Pinning a matched segment from map, touch, or table updates one stable-
      spine URL and the same readout; an unmatched segment is explicitly
      current-only with no fabricated durable URL; hover/focus remains
      transient.
- [ ] B41's previously mismatched southbound tail selects the exact correct
      Studio/history segment with no positional fallback.
- [ ] One speed-history request/model feeds list, readout, and map.
- [ ] Historical month/daypart coloring is readiness-gated, uses the stable
      spine, uses traversal-first/all-expected-daypart aggregation, preserves
      nulls, keeps a fixed speed domain, and discloses current geometry vs
      historical join and current route-slice delay-exposure grain.
- [ ] ACE/TSP proxy points, route-offset lane proxies, and fallback categorical
      treatment rails are gone.
- [ ] The only spatial priority overlay is verified, published source geometry;
      route-level/proxy facts are explicitly textual.
- [ ] Every map value and state has an equivalent keyboard-operable structured
      view and exact numeric/source description.
- [ ] Route hover/focus/pin uses feature state and never replaces GeoJSON for a
      presentation-only change.
- [ ] Map feature state is keyed by unique current `studioSegmentId`; nullable
      spine IDs are never promoted, and row focus never pans the viewport.
- [ ] Mobile does not hide the readout/list, trap page scroll, or require hover;
      reduced motion and WebGL fallback are useful.
- [ ] The overview mini map is a locator with a normal link into the explorer,
      not a second competing interaction surface.
- [ ] Network `Open route` preserves a matched stable segment only after this
      route search contract exists and omits it for current-only selections.
- [ ] Focused/full tests, architecture/style/design checks, Worker tests,
      production build, and expanded performance budgets pass.
- [ ] Manual QA evidence covers B41, M15 SBS, a gap/review route, a no-geometry
      route, 1440/1024/390px, keyboard/touch, and fallback.

## STOP conditions

- Plan 077's MapLibre runtime/style validation, plan 078's exact/stable identity
  propagation, or plan 079's manifest/evidence contract is incomplete.
- Map geometry and Studio detail cannot join by exact `studioSegmentId`, or a
  matched history selection cannot resolve one unique stable spine ID. An
  explicitly unmatched current segment may remain current-only; do not restore
  positional/fuzzy matching or fabricate its spine.
- B41 still selects or colors the wrong final southbound segment after plan
  078. Return to the identity producer; do not patch the UI order.
- Historical readiness is absent or cannot distinguish `series_ready`,
  `series_ready_with_gaps`, and `needs_pattern_review`. Ship only the current
  mode rather than inferring support.
- A proposed treatment layer lacks source-backed point/line geometry plus
  explicit grain/precision. Keep it textual.
- The published bus-lane layer would require a browser-time spatial join,
  unbounded whole-city fetch beyond plan 079's measured budget, a new external
  origin, or unreviewed licensing/attribution behavior.
- Plan 075 changes the reviewed-intervention contract or plan 080 changes
  shared map state/style while this plan is in flight. Reconcile interfaces
  first; do not duplicate them.
- The requested UX requires a new route/tab/nav, autoplay, trip planning,
  realtime animation, or an opportunity score. That is a product-scope change.
- Real-browser QA reveals keyboard/touch, scroll trapping, focus loss, serious
  contrast, or fallback regressions that cannot be fixed within the scoped
  components.
- Any application source outside the declared scope must change. Stop, explain
  the dependency, and amend the plan before broadening scope.

## Maintenance notes

- Stable spine IDs are public deep-link identifiers after this ships. Version
  aliases/migrations; never recycle an ID for different geography.
- Keep source geometry, observed metrics, route-level evidence, and reviewed
  intervention studies as separate layers/contracts even when they appear in
  one readout.
- Historical values are observations joined to today's published route shape,
  not proof that the route geometry was identical in the selected month.
- Any future lens must declare unit, grain, period, missingness, eligibility,
  source, and legend before it receives a map layer.
- Prefer a useful table/readout fallback over defensive canvas behavior. A map
  is progressive enhancement for this evidence product.
- Re-run B41 identity and the four-route manual matrix whenever segment order,
  route patterns, history spine logic, MapLibre, or treatment artifacts change.
- Re-measure exact lane payload and MapLibre vendor budgets after any new
  source/layer; migrate to tiled delivery only after measured need and a new
  decision record.

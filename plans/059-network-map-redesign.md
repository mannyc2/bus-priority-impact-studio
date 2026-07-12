# Plan 059: Network map — full-bleed map with in-map overlays; kill the time-autoplay

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (Generation 6 table).
>
> **Drift check (run first)**: Written against a DIRTY working tree at
> commit `ce3baca`, 2026-07-06. Compare the "Current state" excerpts against
> the live files; on mismatch, STOP. Depends on 048 (tokens); 055 must be
> DONE before the `TimeScrubber` deletion step (055 removes the route-map
> usage).

## Status

- **Priority**: P2
- **Effort**: M-L
- **Risk**: MED (MapLibre interaction changes; the map is a flagship
  portfolio surface)
- **Depends on**: 048; 055 (for the TimeScrubber deletion); 050 (ratchet)
- **Category**: direction (product/UX)
- **Planned at**: commit `ce3baca` (dirty tree), 2026-07-06

## Why this matters

Operator, 2026-07-06: "Map page: Needs a entire redesign. Not a fan of the
whole right gimmick of letting time play at all. Lean in on interactivity
and visualizations inside the map instead. Maybe some overlay with some
different functionality."

Verified current state: the page is a boxed map beside a tall sidebar
(hour display + lens buttons + `TimeScrubber` with an 850ms autoplay loop
through 5am-11pm + focus readout + top-18 list). There is NO legend (users
must infer what colors mean), NO click-through from map features to route
pages (navigation only via the list), and NO way to isolate a borough.
The redesign: the map fills the viewport; controls become floating
overlays ON the map (lens + a 3-way period toggle replacing the 19-step
autoplay slider, a color legend, a compact ranked panel); map features
become hoverable AND clickable through to route pages.

## Current state

- `apps/web/src/studio/pages/network-map.tsx` (330 LOC, read in full
  2026-07-06):
  - State: `hour` (default 17), `playing`, `lens`
    (speed|riders|lanes), `hoveredRouteId` (lines 33-36).
  - Layout: `SectionHeader "Citywide Network Map"` + hour badge → grid
    `[minmax(0,1.55fr)_minmax(320px,0.8fr)]`: boxed `NetworkMapLibre`
    (lines 72-82, props: collection, context, hour, lens, hoveredRouteId,
    setHoveredRouteId, selectedRouteId) | sidebar (lines 83-122): hour
    kicker/label, `NetworkLensControl` (129-166, KEEP mechanism),
    `TimeScrubber` (105-112, DELETE), `NetworkReadout` (168-196, KEEP
    content), `NetworkRankList` top-18 with hover-sync + Link-to-route
    (211-285, KEEP mechanism).
  - Helpers: `routeSpeed(feature, hour)` = `hours[hour] ?? currentMph`
    (287-289), `compareRankedRoutes` (291-304), `rankTitle/rankValue/
    rankSubline` (306-323), `compactNumber` (325-329). Kickers at lines
    86, 179, 201, 228 (`uppercase tracking-[0.12em]` etc.).
  - Null-network fallback card (lines 66-69) — KEEP.
- `apps/web/src/components/TimeScrubber.tsx` (142 LOC) — autoplay interval
  (850ms, wraps 23→5, reduced-motion aware). After plan 055 its ONLY
  consumer is this page → DELETE the file here.
- `apps/web/src/components/route/NetworkMapLibre.tsx` + `.map.tsx` — the
  lazy map pair; consumes `hour` for line coloring; hover works via
  `hoveredRouteId`/`setHoveredRouteId`; NO click handler on features.
- `apps/web/src/components/route/maplibre-style.ts` — `MAP_COLORS`,
  `speedToColor(speed)` (the severity ramp — legend source), `hourTag`,
  `formatMapHour` (the latter two lose their last consumers here; leave
  them exported, plan 060 sweeps).
- `apps/web/src/routes/map.tsx` — loader (routes + network geo + context);
  KEEP untouched.
- Plan 049 primitives available; doctrine allowlist contains
  `studio/pages/network-map.tsx`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun --filter @bp/web typecheck` | exit 0 |
| Web tests | `bun run test:web` | all pass (incl. maplibre-style tests) |
| Doctrine | `bun run check:design-doctrine` | exit 0 |
| Build + budget | `bun --filter @bp/web build` | "Bundle within budget." |
| Style | `bun run check:style` | exit 0 |
| Dev server | `bun --filter @bp/web dev` | `/map` interactive |

## Scope

**In scope**:
- REWRITE `apps/web/src/studio/pages/network-map.tsx`
- EDIT `apps/web/src/components/route/NetworkMapLibre.tsx` + `.map.tsx`
  (period prop, click-to-route, cursor affordance)
- DELETE `apps/web/src/components/TimeScrubber.tsx`
- CREATE `apps/web/test/shared/network-map.test.ts`
- EDIT `tests/harness/design-doctrine.test.ts` (allowlist shrink)
- `plans/README.md` (status row)

**Out of scope**:
- `maplibre-style.ts` (shared with the route map; unused exports are plan
  060's sweep).
- The loader, artifact endpoints, and `fetchNetworkMapGeo`.
- Mobile-specific map UX beyond the overlay collapse noted in step 2.

## Git workflow

- Branch: `codex/059-network-map-redesign`
- Commits: (1) page + overlays, (2) map click-through, (3) scrubber
  deletion. Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Replace hour+autoplay with a 3-way period toggle

In `network-map.tsx`: delete `hour`/`playing` state and the `TimeScrubber`
import/usage. Add:

```ts
type MapPeriod = "all" | "am" | "pm";
const PERIOD_HOURS: Record<MapPeriod, number[] | null> = {
  all: null,           // use currentMph
  am: [7, 8, 9],       // AM peak
  pm: [16, 17, 18, 19] // PM peak
};
function periodSpeed(feature: NetworkMapFeature, period: MapPeriod): number {
  const hours = PERIOD_HOURS[period];
  if (hours === null) return feature.properties.currentMph;
  const values = hours
    .map((h) => feature.properties.hours[h])
    .filter((v): v is number => typeof v === "number" && v > 0);
  if (values.length === 0) return feature.properties.currentMph;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
```

Replace every `routeSpeed(feature, hour)` call with
`periodSpeed(feature, period)`; `compareRankedRoutes`/`rankValue`/
`rankSubline` take `period` instead of `hour`. Period toggle UI = the
`NetworkLensControl` pattern with labels `All day` / `AM peak` / `PM peak`
(default `all`).

### Step 2: Full-bleed layout with overlays

New page structure:

```tsx
<main className="flex h-full min-h-0 flex-col">
  {/* slim header row */}
  <div className="flex items-baseline gap-3 px-7 py-3 max-md:px-4">
    <h1 className="m-0 text-[18px] font-semibold">Network map</h1>
    <span className="text-[12px] text-[var(--bp-color-ink-55)]">
      {network?.features.length ?? 0} routes, colored by {lensLabel(lens)}.
    </span>
  </div>
  {/* map fills the rest; overlays absolutely positioned */}
  <div className="relative min-h-0 flex-1">
    <NetworkMapLibre …fills container… />
    <div className="absolute left-4 top-4 z-10 flex flex-col gap-2">{/* lens + period toggles, card-styled */}</div>
    <div className="absolute bottom-6 left-4 z-10">{/* legend */}</div>
    <aside className="absolute right-4 top-4 z-10 w-[300px] max-md:hidden">{/* readout + top-10 */}</aside>
  </div>
</main>
```

- Overlay containers: `rounded-[3px] bg-[var(--bp-color-card)]/95 p-3
  shadow-[0_1px_6px_rgba(0,0,0,0.15)]` (readable over the map).
- **Legend** (speed lens): five swatches from
  `speedToColor(v)` for v = 3, 5, 7, 9, 11 labeled "3", "5", "7", "9",
  "11+ mph" plus a caption "average {periodLabel} speed". For riders/lanes
  lenses render the equivalent caption ("line width by daily riders" /
  "colored by lane coverage") — derive what the map actually encodes from
  `NetworkMapLibre.map.tsx` before writing the captions; the legend must
  describe the real encoding, not an assumed one.
- **Right panel**: `NetworkReadout` + `NetworkRankList` content salvaged;
  list sliced to 10; kicker classes replaced with plain
  `text-[10.5px] font-semibold text-[var(--bp-color-ink-55)]` labels
  (sentence case); `max-md:hidden` on the panel, and add a small
  `max-md`-only bottom sheet ALTERNATIVE ONLY IF trivial — otherwise mobile
  simply gets map + legend + toggles (note the choice in the status row).
- Keep the null-network fallback card.

### Step 3: Click-through on map features

In `NetworkMapLibre.tsx`/.`map.tsx`: add an
`onSelectRoute?: (routeId: string) => void` prop; on feature click, call
it; set `cursor: pointer` on feature hover (MapLibre `mouseenter`/
`mouseleave` on the route layer — the hover plumbing already exists for
`setHoveredRouteId`; mirror it). In the page:

```tsx
const navigate = useNavigate();
onSelectRoute={(routeId) => {
  const slug = routeSlugById.get(routeId);
  if (slug) navigate({ to: "/routes/$routeId", params: { routeId: slug } });
}}
```

**Verify** (steps 1-3 together): `bun --filter @bp/web typecheck` → exit 0;
dev server `/map`: map fills the viewport; lens + period toggles work;
legend matches the active lens; hovering a line highlights it and the
panel row; clicking a line navigates to the route page; NO play button
anywhere.

### Step 4: Delete `TimeScrubber`

`rg -ln "TimeScrubber" apps/web/src` → must list ONLY
`components/TimeScrubber.tsx` (055 removed the route-map usage; step 1
removed this page's). Delete the file.

**Verify**: typecheck exit 0.

### Step 5: Doctrine ratchet + full gate

Remove `studio/pages/network-map.tsx` from the plan-050 allowlists.

**Verify**:
`bun run check:design-doctrine && bun run test:web && bun --filter @bp/web build && bun run check:style`
→ all pass, in budget (no new eager imports; the map stays behind the lazy
`.map.tsx` boundary — do not import `maplibre-gl` in the page file).

## Test plan

CREATE `apps/web/test/shared/network-map.test.ts` — the page itself
mounts MapLibre (not statically renderable), so test the PURE layer:

- `periodSpeed`: all-day returns `currentMph`; `am` averages hours 7-9;
  zero/missing hour values fall back to `currentMph`; mixed
  present/missing hours average only the present ones.
- `compareRankedRoutes` with `period`: speed lens ranks ascending
  (slowest first); riders descending; lanes ascending.
- `rankValue`/`rankSubline`: no `·`, no `/`-joined interpunct styling
  regressions (the current sublines use "/" — acceptable; do NOT introduce
  `·`).
- Export these helpers from the page module for testability (they already
  are module-level; add `export` if needed).

**Verification**: `bun run test:web` → all pass.

## Done criteria

- [ ] `rg -n "TimeScrubber|setPlaying|playing" apps/web/src` → 0 matches
- [ ] `/map` fills the viewport with overlay controls + legend; map click
      navigates to a route page (dev-server check)
- [ ] Period toggle (All day / AM peak / PM peak) replaces the hour slider
- [ ] Doctrine check passes with `network-map.tsx` off the allowlists
- [ ] Typecheck, `test:web`, build (in budget), style all exit 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Plan 055 not DONE and `RouteMapSection.tsx` still imports TimeScrubber —
  execute 055 first (or skip step 4 and note it).
- `NetworkMapLibre.map.tsx`'s layer structure doesn't expose a route
  feature layer you can attach click handlers to — report the layer ids
  you find; do not restructure the style layers.
- The legend cannot honestly describe the riders/lanes encodings (e.g.
  lens changes color AND width in ways hard to caption) — write the
  caption for what IS true, and flag the encoding for operator review.
- Full-bleed layout fights the app shell's `overflow-hidden` scroll model
  (`StudioShell` wraps children in `min-h-0 flex-1 overflow-auto`) — if
  `h-full` doesn't propagate, use the route-detail pattern
  (`h-full min-h-0 overflow-auto` on the page root; `RouteDetailShell.tsx`
  is the exemplar) rather than fixed pixel heights.

## Maintenance notes

- The map's period averages are client-side over the served `hours[]`
  array; if the artifact ever ships precomputed period aggregates, swap
  `periodSpeed` to read them.
- `hourTag`/`formatMapHour` in `maplibre-style.ts` likely lose their last
  consumers here — plan 060 sweeps them; don't delete shared-module
  exports in this plan.
- Deferred ideas recorded for the operator: borough isolation filter on
  the map (needs per-feature borough already present — small), and a
  treatments overlay layer (bus-lane geometry) — both fit the overlay
  architecture this plan establishes.

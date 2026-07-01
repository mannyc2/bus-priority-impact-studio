# Plan 002: Replace the SVG route map with a real interactive MapLibre map on the route detail Map tab

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 58dfaeb..HEAD -- apps/web/src/components/route/RouteMapSection.tsx apps/web/src/components/route/RouteGeoMap.tsx apps/web/src/studio/api-client.ts apps/web/package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `58dfaeb`, 2026-06-13

## Why this matters

NYC bus reliability is a spatial product, and the app currently has **no real
map anywhere**: the route detail "Map" tab renders a hand-rolled static SVG
(`RouteGeoMap.tsx` is a `<svg>` with `<path>` elements), with no pan/zoom, no
hover, no street context. The user's 2026-06-12 design review said the map
surfaces "aren't even maps." `maplibre-gl` is already declared in
`apps/web/package.json:36` but imported nowhere. ADR-0003 and
`knowledge/wiki/engineering/map_strategy.md` already commit the stack
(MapLibre GL JS, GeoJSON artifacts from R2, lazy-loaded, custom-styled — no
external tile services). This plan makes the Map tab a real interactive map:
segment pace choropleth on real street geometry, hover → segment details,
treatment overlays. It is the single most visible upgrade for the project's
portfolio purpose and the foundation for the citywide map (plan 003).

## Current state

- `apps/web/src/components/route/RouteGeoMap.tsx` — static SVG renderer
  (verified: `<svg>` at line 53, `<path>` elements at 71/95/108). Projects
  route-segment GeoJSON into a fixed viewBox. Keep this file untouched as the
  no-WebGL/print fallback.
- `apps/web/src/components/route/RouteMapSection.tsx` — the Map tab section.
  Key parts (verified at commit 58dfaeb):
  - `useRouteSegmentsGeo(routeId)` (lines 77–105) fetches
    `fetchRouteSegmentsGeo(routeId)` (typed
    `MapRouteSegmentFeatureCollection` from `@bp/domain/maps`) plus
    `fetchMapContext()` (shoreline context, progressive enhancement), via
    `apps/web/src/studio/api-client.ts`.
  - Render (lines 137–149): `geo.status === "ready"` → `<RouteGeoMap …/>`;
    `"loading"` → 420px pulse skeleton; `"unavailable"` → `<CorridorMap …/>`
    schematic fallback.
  - Below the map: three `MapStat` blocks (Bus lanes %, ACE/TSP segment
    count, focus segment) — keep these.
  - `routeMapHighlight` (lines 30–43) picks the flagged/insight segment;
    `segments` carry `lane` ("none" | …), `ace`, `tsp`, `speedMph`,
    `riderHours`, `from`, `to`, `flagged` (see usage at lines 54–65, 111–112).
- Data already served (no backend work needed):
  - Route segment geometry: fetched per-route by `fetchRouteSegmentsGeo` —
    follow that function in `apps/web/src/studio/api-client.ts` to see the
    endpoint; payload is a `MapRouteSegmentFeatureCollection` whose feature
    properties carry `segmentId: z.string().min(1)` (verified at
    `packages/domain/src/maps/index.ts:19`) — that is the join key to
    `StudioSegment.id`.
  - Map manifest + artifacts: `GET /api/v1/map/manifest` and
    `GET /api/v1/artifacts/{key}` (R2 passthrough, immutable cache) — see
    `packages/studio-api/src/public-api.ts` (`buildMapManifestResponse`,
    `buildArtifactResponse`).
- Design canon (read these before writing any JSX — they are in-repo):
  - `knowledge/raw/downloads/design-handoffs/03-canonical/bus-priority-impact-studio/project/corridor-geo.jsx` —
    the route-detail geographic map mockup (canonical per the 2026-06-12 user
    verdict).
  - `knowledge/raw/downloads/design-handoffs/03-canonical/bus-priority-impact-studio/chats/chat27.md` and
    `chat28.md` — interactive map strategy the user converged on: full-bleed
    map, segment pace choropleth, hover/tap → segment card (speed,
    rider-hours, treatment overlap), daypart toggle later, paper/ink palette,
    NO third-party glossy tiles.
  - `knowledge/wiki/engineering/map_strategy.md` — stack commitments:
    MapLibre GL JS in apps/web; GeoJSON from R2 first (PMTiles later);
    lazy-load MapLibre only on map surfaces; never embed large artifacts in
    the bundle.
  - Do NOT implement anything from `verdict-*.jsx` / `Verdict Layer*.html`
    mockups — explicitly rejected by the user.
- **Hard constraint — 168KB initial-JS budget**: `bun --filter @bp/web build`
  runs `check:bundle-budget` and fails if the initial bundle grows.
  `maplibre-gl` is ~210KB gzipped and MUST be code-split. Known repo gotcha:
  an eager route head/loader importing a VALUE from a component module leaks
  the whole module into the initial bundle. Follow the existing lazy-chart
  convention — it is well established (9 files, verified):
  `apps/web/src/components/{TrendOverlay,SpeedTrend,HourBars,Spark,CorridorProfile,CorridorOverlay,HourOverlay,HourExposure}.chart.tsx`.
  Read `TrendOverlay.tsx` (the thin wrapper) + `TrendOverlay.chart.tsx` (the
  lazy heavy module) and copy that exact wiring.
- **MapLibre CSS**: `apps/web/src/global.css` contains `.maplibregl-*`
  selectors (custom overrides, from line ~252) but does NOT import the base
  stylesheet. Import `maplibre-gl/dist/maplibre-gl.css` inside
  `RouteMapLibre.map.tsx` (the lazy module — keeps the CSS out of the
  initial bundle too).
- Styling tokens: paper/ink palette via `--bp-color-*` CSS vars; cards are
  `rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)]`;
  numbers are mono `tabular-nums`.

## UI/UX specification (authoritative for all visuals in this plan)

This section translates the converged mockup
(`knowledge/raw/downloads/design-handoffs/03-canonical/bus-priority-impact-studio/project/corridor-geo.jsx`,
all line refs below are into that file) into the production spec. Where this
section and your own taste disagree, this section wins. The aesthetic is
**editorial transit cartography**: warm paper, near-black ink, hairline
rules, mono eyebrows — and the speed ramp is the ONLY saturated color on the
page. Restraint everywhere except the data.

### Design tokens (real values, from `apps/web/src/global.css:14-66`)

| Token | Value | Use here |
|---|---|---|
| `--bp-color-paper` | `#f4f1ea` | page background, route line casing |
| `--bp-color-card` | `oklch(0.99 0.007 75)` | map land fill, panels |
| `--bp-color-ink` | `#16140f` | primary text, terminus stops |
| `--bp-color-ink-55/40/20` | rgba ink at 0.66/0.4/0.2 | labels / axis text / context lines |
| `--bp-color-rule` | `rgba(22,20,15,0.14)` | all hairlines (1px, never heavier) |
| `--bp-color-good/warn/bad/accent` | see global.css | lane=good, partial-lane=warn, ACE=accent, TSP=good |
| `--bp-font-mono` | SF Mono stack | eyebrows, axis labels, all small annotations |
| Water | `linear-gradient oklch(0.915 0.014 232) → oklch(0.885 0.018 236)` | the only cool tone (corridor-geo.jsx:31-34) |

### Speed → color ramp (the signature element)

Port `speedToColor` EXACTLY from the canonical mockup
(`…/project/geo-data.jsx:20-44`) into `maplibre-style.ts`. Six oklch anchors,
linearly interpolated in L/C/H so colors tween smoothly while scrubbing
instead of snapping between tiers:

```
3.3 mph → oklch(0.50 0.165 27)   (deep red)
4.6 mph → oklch(0.55 0.150 38)
5.6 mph → oklch(0.62 0.135 58)   (amber)
6.6 mph → oklch(0.67 0.125 78)
7.8 mph → oklch(0.58 0.120 150)  (green)
9.5 mph → oklch(0.60 0.105 162)
```

Compute colors in JS (per segment, per hour) and set them via MapLibre
feature-state or a recomputed paint expression — do NOT approximate with a
3-stop `interpolate` expression; the tween through amber is the point.
Discrete tier labels (`bad < 5 / warn < 6.5 / good`) stay aligned with the
existing `SegmentRow` severity tiers.

### Layout (route detail Map tab)

Two-column grid, from corridor-geo.jsx:353: `gridTemplateColumns: '512px 1fr'`
(map left, control column right; collapse to single column under `max-lg`).

- **Left — the map.** Card surface, `rounded-[3px]`,
  `shadow-[0_0_0_1px_var(--bp-color-rule)]`, inner padding 8-10px. Header
  row above it: title "The corridor, on the street" (15px/600) with a mono
  right-aligned annotation (10.5px, ink-55) for direction/day context.
  Map height ≥ 560px on desktop.
- **Right — the reading column** (background `card`, left hairline border),
  stacked with `gap: 16px`, in this order (corridor-geo.jsx:366-435):
  1. **TimeScrubber** (spec below) + corridor-average hero: eyebrow
     `Corridor average · {h:00 PM}`, then a 34px/700 tabular number colored
     `speedToColor(avg)` with `transition: color .5s`, "mph" in 12px ink-55
     beside it.
  2. **Priority layer toggles** — three pill-buttons in a row (corridor-geo.jsx:195-218):
     each = swatch + label (11.5px/600) + sub (9.5px mono ink-40) + a
     26×15px toggle switch. ON state: 1px border in the layer color +
     `color-mix(in oklch, <color> 9%, var(--bp-color-card))` background.
     Layers: **Bus lane** (good; sub "solid=full · dashed=partial"),
     **ACE cameras** (accent), **Signal priority** (good). Defaults:
     lane ON, ace OFF, tsp OFF.
  3. **Linked speed profile strip** — reuse the existing `CorridorProfile`
     component; hover here and hover on the map must share ONE
     `hoveredSegmentId` state (the linking is the feature, corridor-geo.jsx:7).
     Frame it on `paper` with an inset rule ring; title
     "Speed profile · linked to the map" with the suffix in ink-55/400.
  4. **Readout panel** (min-height 132px, paper bg, inset ring): two modes —
     - *No hover*: one-sentence instruction in 11.5px ink-55, then the
       worst-segment summary: a 26px square `bad` badge with "!", and a
       12.5px line bolding the segment name and its share of route delay
       (use real payload fields; drop the share clause if not served).
     - *Hover*: segment detail — mono eyebrow `{NB|SB} · SEGMENT`, segment
       name 15px/600, hero speed 40px/700 tabular colored by ramp
       (`transition: color .5s`), right-aligned delta `−{gap}` vs scheduled
       (bad ink when gap > 1.5), then a ruled 2-cell stat strip
       (RIDERS/DAY · SHARE OF ROUTE DELAY), then "In place:" chips — each
       `color-mix(… 12%, card)` bg, 6px dot, layer color text. "WORST" chip
       on the worst segment.
  5. **Corridor KPI footer** — 3 ruled columns (no cards): eyebrow label,
     21px/600 number (+unit in 10px ink-55), 10px sub. Rider-hours lost
     gets `bad` ink.

### Map content & interaction

- **Geometry**: real route GeoJSON. Casing first — paper-colored line,
  width 13, round caps — then the colored segment line (width 7; worst
  segment 8; hovered 10) per corridor-geo.jsx:66-104. Hit area: invisible
  22px-wide line layer above.
- **Hover dimming**: when a segment is hovered, all OTHER segments drop to
  opacity 0.5 (`transition: opacity .2s`); never dim the hovered one.
- **Per-segment mph labels**: 10.5px/600 tabular, colored by the ramp,
  offset perpendicular to the line; hovered/worst grow to 12px/700. Use a
  MapLibre `symbol` layer with `text-offset`; if label collision makes this
  unreadable at low zoom, show labels only at zoom ≥ 13 — never overlap.
- **Worst-segment treatment**: a 20px-wide `bad` line at opacity 0.16
  underneath (the "glow"), plus a flag label `WORST · {cross-street}` —
  white 9px mono 700 on a `bad` rect, rx 3.
- **Stops**: circles — terminus r=5 ink-filled; regular r=3.2 card-filled
  with ink-70 stroke (1.6px). From the geometry payload's stop features if
  present; omit cleanly if not served.
- **Bus-lane layer**: offset line 9px to one side of the casing, width 3,
  `good` solid for full lane, `warn` dashed `5 4` for partial
  (corridor-geo.jsx:76-84), opacity 0.9. ACE/TSP: small icon markers at
  segment midpoints — ACE = 14×10 accent rect + white dot ("camera"),
  TSP = 10×14 good rect + two stacked white dots ("signal").
- **Water/context**: water polygons (from `fetchMapContext` shoreline) in
  the water gradient; land stays `card`. If the context payload has water
  body names, label them 10.5px mono 600, letter-spacing 0.18em, ink-20,
  rotated along the feature — pure cartographic garnish, skip if absent.

### TimeScrubber (port faithfully from network-map.jsx:28-88)

A precise transport control, shared with plan 003 — build it once as
`apps/web/src/components/TimeScrubber.tsx` (no heavy deps; plain DOM+CSS):

- 40px circular play/pause button, ink bg, paper glyph; when playing, a
  `0 0 0 3px color-mix(in oklch, ink 18%, transparent)` halo.
- Rail: 7px tall, `ink-10` track, rounded; AM peak (7–9) and PM peak
  (16–19) shaded `warn` at opacity 0.32; filled progress in ink; hour ticks
  (1px, ink-20, taller every 3h); 16px card-colored thumb with
  `0 0 0 2.5px ink` ring shadow.
- A time pill rides above the thumb: ink bg, paper text, 11px mono 700,
  e.g. `5:00 PM`, `transition: left .12s linear`.
- Mono axis labels under the rail: `6a 9a 12p 3p 6p 9p` (9px, ink-40).
- Input: an invisible `<input type="range" min=5 max=23 step=1>` overlay —
  keyboard accessible (arrow keys step hours) for free.
- Play advances one hour per 850ms, wrapping 23→5; any manual scrub pauses.
- All speed-dependent colors transition `.5s` when the hour changes — the
  page should visibly "breathe" into rush hour.

Hourly speeds come from the served payload: each `StudioSegment.hours` is a
24-entry severity array, and the existing derivation
`speed = max(2, route.scheduledMph − severity × 4.2)` already lives at
`apps/web/src/components/route/route-derived.ts:104-110` — reuse it
per-segment (do not invent a new formula).

### States

- **Loading**: keep the existing 420px pulse skeleton (height-match the new
  map: 560px).
- **No geometry**: existing `CorridorMap` fallback unchanged, plus the
  existing one-line muted explanation (`RouteMapSection.tsx:150-155`).
- **No WebGL** (`maplibregl.supported()` false or map `error` event):
  render the old `RouteGeoMap` SVG silently — never a broken canvas.
- **Reduced motion**: respect `prefers-reduced-motion` — disable the play
  loop's auto-advance and shorten color transitions to 0s; scrubbing by
  hand still works.

### Accessibility

- Scrubber: `aria-label="Hour of day"`, value text `5:00 PM`.
- Hovered-segment readout doubles as the screen-reader live region
  (`aria-live="polite"` on the readout panel).
- mph labels + ramp colors always paired with text (never color-only).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web typecheck | `bun --filter @bp/web typecheck` | exit 0 |
| Web build + bundle budget | `bun --filter @bp/web build` | exit 0; budget check passes |
| Dev server (manual check) | `bun --filter @bp/web dev` | vite serves; open /routes/m15-sbs → Map tab |

Do NOT run root `bun run check:types` (OOMs); use the per-package command.

## Scope

**In scope** (the only files you should modify/create):
- `apps/web/src/components/route/RouteMapLibre.tsx` (create — lazy wrapper)
- `apps/web/src/components/route/RouteMapLibre.map.tsx` (create — the actual
  MapLibre component; suffix mirrors the `.chart.tsx` lazy convention)
- `apps/web/src/components/TimeScrubber.tsx` (create — shared transport
  control per the UI/UX spec; plain DOM+CSS, no heavy deps)
- `apps/web/src/components/route/RouteMapSection.tsx` (becomes the
  two-column layout owner: map + reading column per the UI/UX spec)
- `apps/web/src/global.css` (maplibre css import if needed — check how it
  currently references maplibre)
- `apps/web/src/components/route/maplibre-style.ts` (create — tokens,
  `speedToColor` port, bounds/expression helpers)

**Out of scope** (do NOT touch):
- `RouteGeoMap.tsx` and `CorridorMap.tsx` — they remain the fallback chain.
- The Overview tab mini-map — it keeps the static SVG (fast first paint);
  upgrading it is a follow-up.
- Any studio-api / packages/db change — this plan is frontend-only.
- New basemap tiles. **v1 ships with NO basemap**: route geometry +
  shoreline context (already fetched via `fetchMapContext`) on the paper
  background, exactly like the SVG version but interactive. A Protomaps/PMTiles
  basemap is plan 003's concern.
- The route list, compare, search pages.

## Git workflow

- Branch: `advisor/002-maplibre-route-detail-map` off `main`.
- Commit per step; short imperative messages (e.g. "Render route map with
  MapLibre behind lazy boundary").
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the lazy boundary

Create `RouteMapLibre.tsx`: a thin component that `React.lazy(() => import("./RouteMapLibre.map.tsx"))`
inside `<Suspense fallback={<the existing 420px pulse skeleton>}>`. Props:
`{ collection: MapRouteSegmentFeatureCollection; context: RouteGeoContext | null; segments: readonly StudioSegment[]; highlightId?: string }`.
Copy the exact prop typing approach used by an existing `*.chart.tsx` wrapper.
TYPE-ONLY imports from the map module are fine; never import a value from it
eagerly.

**Verify**: `bun --filter @bp/web typecheck` → exit 0.

### Step 2: Port the ramp + build TimeScrubber

1. In `maplibre-style.ts`: port `speedToColor` exactly per the UI/UX spec's
   "Speed → color ramp" (six oklch anchors, L/C/H linear interpolation),
   plus the token constants (paper/card/ink values from `global.css`) and a
   `boundsOf(collection)` helper.
2. Build `apps/web/src/components/TimeScrubber.tsx` per the spec's
   "TimeScrubber" subsection (play button, peak-shaded rail, ticks, thumb,
   time pill, invisible range input, 850ms play loop, reduced-motion
   handling). It is a controlled component:
   `{ hour, setHour, playing, setPlaying }`.

**Verify**: `bun --filter @bp/web typecheck` → exit 0; ramp unit tests from
the Test plan pass.

### Step 3: Implement the MapLibre component

In `RouteMapLibre.map.tsx`, per the spec's "Map content & interaction":

1. `import maplibregl from "maplibre-gl"` and `import "maplibre-gl/dist/maplibre-gl.css"`
   (check `apps/web/src/global.css` first — it already mentions maplibre; if
   the css is already wired there, don't double-import).
2. Initialize with **no remote style** (`style: { version: 8, sources: {},
   layers: [background in paper] }`, `attributionControl: false`,
   `dragRotate: false`), colors from `maplibre-style.ts`.
3. Layer stack bottom→top: water/shoreline context (water gradient tone),
   route casing (paper, 13px-equivalent, round caps), worst-segment glow
   (bad @ 0.16, wide), bus-lane offset layer (good solid / warn dashed),
   colored segment lines (7 / worst 8 / hovered 10), ACE/TSP midpoint
   markers, stops, mph symbol labels, invisible 22px hit lines.
4. Hourly recolor: props include `segments` (with their `hours` arrays) and
   `hour`; compute per-segment speed via the existing derivation
   (`route-derived.ts:104-110` formula), set colors via feature-state with
   CSS-comparable 0.5s tweens (MapLibre paint transitions:
   `line-color-transition: { duration: 500 }`).
5. Hover: shared `hoveredSegmentId` lifted to `RouteMapSection` (the map,
   the profile strip, and the readout all read/write it). Dim non-hovered
   segments to 0.5.
6. Fit bounds on load (padding 40); clean up the map instance on unmount.

**Verify**: `bun --filter @bp/web typecheck` → exit 0.

### Step 4: Rebuild RouteMapSection as the two-column experience

Per the spec's "Layout" subsection: left = map card; right = reading column
(TimeScrubber + corridor-average hero, three `CG_LayerToggle`-style layer
toggles, the linked `CorridorProfile` reusing the shared hover state, the
two-mode readout panel, and the 3-column ruled KPI footer). Keep
`routeMapHighlight`/`routeMapFocusSummary` logic for the worst-segment
identification; keep the existing loading skeleton and `CorridorMap`
fallback branches exactly as they are (the fallback renders in the left
column; the reading column still renders, minus map-linked hover).

The readout's "share of route delay" cell: compute
`segment.riderHours / Σ(riderHours)` from the served segments — that is a
real derivation, not invented data. Omit any spec'd field the payload
doesn't carry; never fabricate.

**Verify**: `bun --filter @bp/web build` → exit 0 **and** the bundle budget
check passes (this is the step where a leaked eager import would fail it —
`TimeScrubber` is small and may be eager within the route chunk, but
`maplibre-gl` must only load behind the Step 1 lazy boundary).

### Step 5: Manual interaction check

Run `bun --filter @bp/web dev`, open a route with published geometry (try
`/routes/m15-sbs`, then 2–3 others from `/routes`), Map tab:

- map renders segments colored by speed on the paper background; pressing
  play visibly "breathes" the corridor into rush hour (colors tween, no
  snapping)
- pan/zoom works; hovering a segment dims the others, swaps the readout to
  segment mode, and highlights the same segment in the profile strip (and
  hovering the strip highlights the map)
- layer toggles add/remove lane/ACE/TSP marks
- a route WITHOUT published geometry still shows the CorridorMap fallback
  and a composed reading column
- no console errors; `prefers-reduced-motion` disables autoplay

If you have a browser tool/skill available, use it; otherwise report this
step as "needs manual QA" in your completion summary rather than claiming it
verified.

**Verify**: described behavior observed (or explicitly flagged for manual QA).

## Test plan

This is a rendering-heavy change; the repo's web tests don't currently cover
WebGL components. Required:

- Unit test the pure helpers in `maplibre-style.ts`, colocated under the web
  app's existing test location (find where `routeMapHighlight`-style helpers
  are tested — grep `apps/web` for existing `*.test.ts`; match that
  location/pattern). Cases:
  - `speedToColor`: exact anchor outputs at 3.3/9.5 mph (clamped below/above),
    a midpoint interpolation (e.g. 5.1 mph lands between the 4.6 and 5.6
    anchors with monotonically interpolated L/C/H), and tier alignment
    (`<5 bad`, `<6.5 warn`).
  - `boundsOf`: bounds of a 2-feature collection; empty collection guard.
  - The per-segment hourly speed derivation call (route-derived reuse):
    severity 0 → scheduledMph; floor at 2 mph.
- TimeScrubber: one rendering test only if a DOM test harness already
  exists in `apps/web` (check for @testing-library usage); otherwise rely
  on the manual pass — do not introduce a test framework.
- Do NOT attempt to unit-test the MapLibre canvas itself.

## Done criteria

- [ ] `bun --filter @bp/web typecheck` exits 0
- [ ] `bun --filter @bp/web build` exits 0, bundle budget passes
- [ ] `grep -rn "from \"maplibre-gl\"" apps/web/src` matches ONLY `RouteMapLibre.map.tsx` (and css import)
- [ ] `RouteGeoMap.tsx` and `CorridorMap.tsx` are unmodified (`git diff --stat`)
- [ ] Helper unit tests exist and pass
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The bundle budget fails even with the lazy boundary — report the
  `check:bundle-budget` output; do NOT raise the budget yourself.
- `fetchRouteSegmentsGeo`'s payload lacks a per-feature segment id you can
  join to `StudioSegment.id` — report the actual feature properties instead
  of inventing a join.
- `maplibre-gl`'s catalog version fails to resolve/build under the repo's
  Vite/Bun setup after one honest attempt.
- You find an existing partially-built MapLibre component elsewhere in the
  repo (grep first: `grep -rn "maplibregl" apps/web/src`) — reconcile with it
  rather than duplicating.

## Maintenance notes

- Plan 003 (citywide map) must reuse `RouteMapLibre.map.tsx`'s style module
  and lazy pattern — reviewer should reject a second bespoke map style.
- When PMTiles/Protomaps basemap lands (map_strategy.md future path), it
  slots in as an additional source in `maplibre-style.ts`.
- The daypart toggle (chat27/28 design) is deliberately deferred until an
  hour-grain segment endpoint exists (see plan 004's maintenance notes).
- Reviewer should scrutinize: map instance cleanup on route change (the tab
  can remount per route), and that the hover card uses real payload numbers,
  not derived guesses.

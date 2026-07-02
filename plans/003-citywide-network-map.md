# Plan 003: Build the citywide network map page (/map) with metric lenses

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 58dfaeb..HEAD -- apps/web/src/routes apps/web/src/components/route/RouteMapLibre.map.tsx packages/studio-api/src/public-api.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. This plan additionally assumes
> plan 002 is DONE — verify `apps/web/src/components/route/RouteMapLibre.map.tsx`
> exists before starting.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/002-maplibre-route-detail-map.md
- **Category**: direction
- **Planned at**: commit `58dfaeb`, 2026-06-13

## Why this matters

There is currently **no citywide map page at all** — `apps/web/src/routes/`
has no map route, even though the user's design review demanded "an actual
map" and the canonical design handoff contains a converged citywide
network-map design (every route drawn, colored by a switchable metric lens,
hover → route mini-card, click → route detail). This page is the product's
front door for spatial discovery ("where is the city slow?") and the single
most demo-able artifact for the portfolio goal. All route geometry already
exists as per-route R2 GeoJSON artifacts listed in the map manifest; the only
new serving work is one combined citywide artifact so the page doesn't make
~380 requests.

## Current state

- No map page: `ls apps/web/src/routes` shows index/routes/compare/search/
  findings/briefs/docs/methods/system/account/admin/auth/signin only.
- Plan 002 (prerequisite) created `RouteMapLibre.map.tsx` +
  `maplibre-style.ts` — the MapLibre init pattern, paper/ink style, severity
  color ramp, and lazy-loading convention. Reuse them.
- Serving (verified in `packages/studio-api/src/public-api.ts`):
  - `buildMapManifestResponse` reads `map/{month}/manifest.json` from R2 and
    returns per-artifact entries `{ artifactKind, artifactKey, contentType, byteLength, sha256, featureCount, routeId, apiPath }`.
  - `buildArtifactResponse` serves `GET /api/v1/artifacts/{key}` straight from
    R2 with `Cache-Control: public, max-age=31536000, immutable`.
- Route-level metrics for lens coloring are already served by the route list
  endpoints: `/api/v1/studio/routes` (R2-backed index with capability flags)
  and `/api/v1/routes` (D1-backed list with speed/trend metrics) — see
  `packages/studio-api/src/studio/read-handlers.ts` (~line 2700) and
  `public-api.ts:287-347`. The web app already consumes the studio route index
  on `/routes` (`apps/web/src/routes/routes/index.tsx`) — copy its loader
  pattern.
- Bus-lane geometry exists locally at
  `data/artifacts/map/bus-lanes/local-streets.min.geojson` (1.6MB, verified)
  but is NOT in the R2 map manifest — optional overlay, see Step 6 escape
  hatch.
- Design canon (read before writing JSX):
  - `knowledge/raw/downloads/design-handoffs/03-canonical/bus-priority-impact-studio/project/network-map.jsx` —
    the citywide map mockup: full-viewport map, lens switcher (speed / trend /
    rider pain / treatment coverage), hover mini-card, legend.
  - `…/project/geo-data.jsx` — geo data treatment conventions.
  - `…/chats/chat27.md`, `chat28.md` — converged interaction model.
  - Do NOT build the "data coverage" lens on this public page (user verdict
    2026-06-12: public pages don't talk about our own data coverage), even if
    a mockup shows one.
- Constraints:
  - 168KB initial-JS budget; the map page must lazy-load MapLibre exactly like
    plan 002 (route-level code splitting via TanStack Router file routes
    already exists; keep heavy imports out of the route module's eager scope —
    known gotcha: importing a VALUE from the component module in a route
    head/loader leaks it into the initial bundle).
  - Pipeline rule (CLAUDE.md): heavy data work runs in `tools/pipeline-v2`
    and writes artifacts; do not aggregate 380 GeoJSONs inside the Worker
    request path.

## UI/UX specification (authoritative for all visuals in this plan)

Source of truth: the converged mockup
`knowledge/raw/downloads/design-handoffs/03-canonical/bus-priority-impact-studio/project/network-map.jsx`
(line refs below are into that file). Its concept line is the product brief:
**"Watch the city's buses slow into rush hour."** This page is not a lens
dashboard — it is a single living artifact: every modeled route drawn where
it runs, recolored live as the user scrubs the clock, with a persistent
reading panel that always shows *something* (never an empty rail).

Shares plan 002's foundations: the oklch `speedToColor` ramp (six anchors,
3.3→9.5 mph, from `…/project/geo-data.jsx:20-44`, ported in plan 002's
`maplibre-style.ts`), the `TimeScrubber` component
(`apps/web/src/components/TimeScrubber.tsx`, built in plan 002), the design
tokens table in plan 002's spec, and the water gradient
`oklch(0.915 0.014 232) → oklch(0.885 0.018 236)`.

### Page anatomy (top to bottom, from network-map.jsx:371-429)

1. **Header band** (card bg, bottom hairline): an accent-colored mono
   eyebrow `NETWORK MAP · THE CITY {context}` (11px/600, letter-spacing
   0.16em, uppercase), then a flex row: display headline
   "Watch the city's buses slow into rush hour." (30px/600,
   letter-spacing −0.025em) left, and a 12.5px ink-70 dek paragraph
   (max-width 380px) right: "Every corridor we model, drawn where it runs
   and colored by speed at the hour on the clock. Hover a line or a row;
   press play to run the day."
2. **Body grid**: `gridTemplateColumns: 1fr 392px`, no gap — map column |
   reading rail. Under `max-lg`, the rail moves below the map.
3. **Map column** (padding ~18-22px, vertical stack, gap 14):
   - **Transport toolbar** — one card row (radius 8, ring rule, padding
     12×18): the TimeScrubber takes the flexible width; a 1px vertical rule;
     then a fixed 150px legend block: mono eyebrow `SPEED · MPH` (9px,
     letter-spacing 0.08em), an 8px-tall gradient bar built from the ramp
     (`linear-gradient(90deg, speedToColor(3.5), speedToColor(5), speedToColor(6.5), speedToColor(8))`),
     and `slow / fast` mono captions (8.5px ink-40) at the ends.
   - **Filter row**: borough chips `All · Manhattan · Bronx · Queens ·
     Brooklyn · Staten Island` — active chip ink bg/paper text, inactive
     ink-06 bg/ink-70 text. Right-aligned mono caption:
     `{n} routes · {AM peak|Midday|PM peak|Shoulder|Off-peak}` (the
     `hourTag` mapping at network-map.jsx:15-21).
   - **The map**, filling remaining height (≥ 640px desktop), ring rule,
     radius 6.
4. **Reading rail** (card bg, inset left hairline, padding 22×24):
   - **Detail panel** (network-map.jsx:240-297) — always populated by
     `hovered ?? pinned ?? rank-1` route:
     - Identity row: `RouteBadge` (size lg) + route name (15px/600) +
       borough (11px mono ink-55). Right edge: when pinned, an ink
       `PINNED ✕` mono button (9.5px/700); when not, the caption
       `click to pin` (9.5px mono ink-40).
     - Hero: current speed in **46px/700 tabular**, letter-spacing −0.035em,
       colored `speedToColor(v)` with `transition: color .5s`; "mph" +
       the clock time (10.5px mono) stacked beside; right-aligned
       `#rank` (20px/700, `bad` ink when rank ≤ 2) over a mono caption
       `of {n} slowest now`.
     - **HourCurve** (network-map.jsx:94-128): a 312×66 sparkline of the
       route's full day — warn-tinted peak bands (opacity 0.08), dashed
       scheduled line with a mono `sched {v}` end label, an area fill in
       the current hour's ramp color at opacity 0.1, the 1.6px ink-70
       speed line, and a "now" marker (vertical hairline + 4.5px dot
       filled with the ramp color, card-stroked) that **slides as you
       scrub** (`transition: cx .12s linear`).
     - Ruled stat strip (no cards — hairlines above/below, 1px divider
       between cells): `DAILY RIDERS` (16px/600 tabular) and `12-MONTH`
       (tone-colored arrow ↑/→/↓ + status word + a 56×18 sparkline of the
       trend series).
     - Actions: primary ink button `Open {route} →` (navigates to
       `/routes/$routeId`) + secondary `Add to brief` ONLY if a
       send-to-brief affordance already exists app-wide; otherwise omit.
   - Hairline rule, then **rank list** (network-map.jsx:302-340):
     header "Slowest right now" + mono caption `scrub to re-rank →`.
     Rows (grid `18px 52px 1fr 46px`): two-digit index (10.5px mono
     ink-40), RouteBadge sm, route name (11.5px, ellipsized) over a 3px
     proportional speed bar (track ink-06, fill ramp-colored,
     `transition: width .5s, background .5s`), right-aligned speed
     (14px/700 tabular, ramp-colored). Active row: ink-06 bg +
     `inset 2px 0 0 ink` left bar. Hovering a ROW highlights the route on
     the MAP and vice versa — one shared `hoveredId`. Show the 12 slowest;
     the list re-sorts as the hour changes (animate nothing — the width/
     color tweens carry the motion).

### Map content & interaction

- **Layers** (bottom→top): water gradient background; land polygons in
  `card` with ink-20 1.2px coastline (from the shoreline context artifact);
  optional water-body labels + a small compass rose (ink-40, opacity 0.5)
  if coordinates are easy — garnish, skip freely; route **casings** (paper,
  width 9 equivalent, round caps); routes (ramp-colored, width ~5.5 px
  equivalent; active route 8); invisible 20px hit lines.
- **Focus model** (network-map.jsx:137-144): `focus = hovered ?? pinned`.
  When focus exists, all other routes dim to opacity 0.26
  (`transition .3s`); borough filter dims non-matching routes the same way.
  Click toggles pin; clicking water/land unpins. Hovering anything never
  moves the layout — the detail panel swaps content in place.
- **Hotspot pulses** (network-map.jsx:194-205): the 2 slowest routes at the
  current hour get a pulsing ring at their midpoint — two staggered
  2.1s rings (`@keyframes`: scale 0.7→2.5, opacity 0.8→0; second ring
  delayed 1.05s), stroke = the route's ramp color. Suppress under
  `prefers-reduced-motion`.
- **Route labels**: small ink chips (rect rx 3.5, `rgba(22,20,15,0.78)`;
  full ink when active) with the route number in 10px/700 white — as a
  MapLibre symbol layer at a stable midpoint anchor. If label density is
  unreadable citywide, show chips only for: focused route, the 12 ranked
  routes, and zoom ≥ 12.
- **Cursor**: pointer over any route; default elsewhere.

### Data & the hour dimension

Primary experience is hour-scrubbed speed. Server work in Step 1 emits, per
route feature: `routeId`, `label`, `sbs`, `borough`, `scheduledMph`,
`currentMph`, `trend6mPct`, `riderHoursLost`, `dailyRiders`, and
`hours: number[24]` (route-level mean of per-segment hourly severity — the
exact derivation already shipping in
`apps/web/src/components/route/route-derived.ts:96-110`:
`severity = mean(segment.hours[h])`, `speed = max(2, scheduledMph − severity × 4.2)`).
Client computes `speedAtHour(feature, h)` with that same formula and updates
feature-state on scrub — no refetch, ever.

**Fallback** (only if Step 1's escape hatch fires and `hours` cannot be
emitted): ship the static metric experience — replace the TimeScrubber with
three text-tab lenses (`Speed now · 6-month trend · Rider pain`), reusing
the same detail panel minus the HourCurve. The page must still feel
complete; do not ship a disabled scrubber.

### States

- **Loading**: full-map pulse skeleton (ink-06) + skeleton rail (three
  ink-06 blocks), no spinner.
- **Artifact missing**: honest empty state — headline stays, map area
  renders a centered 12.5px ink-55 message "The citywide map artifact for
  this release has not been published yet." No fake content.
- **No WebGL**: same message pattern ("This map needs WebGL…") + a plain
  link-list of the 12 slowest routes so the page still serves navigation.
- **Reduced motion**: no pulses, no auto-play; scrubbing still recolors
  (transitions 0s).

### Accessibility

- The rank list is the keyboard path: rows are buttons; Enter pins,
  second Enter navigates. The map itself is `aria-hidden`; the detail panel
  is `aria-live="polite"`.
- Scrubber inherits plan 002's range-input semantics.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web typecheck | `bun --filter @bp/web typecheck` | exit 0 |
| Web build + bundle budget | `bun --filter @bp/web build` | exit 0 |
| Pipeline tests | `bun --filter @bp/pipeline-v2 test` | all pass |
| Pipeline CLI (fixture run) | `bun --filter @bp/pipeline-v2 cli -- <command> --help` | command help prints |
| Dev server | `bun --filter @bp/web dev` | open /map |

**Budget warning**: the initial-JS budget currently has **~59 bytes** of
headroom (`data/artifacts/web-audits/latest/performance-budget.json`).
Adding the `/map` route to the eager route tree and a nav link may alone
exceed it. If `check:bundle-budget` fails on bytes that are genuinely
irreducible (route-tree entry + nav label), that is a STOP condition: report
the exact overage; the operator decides whether to free headroom elsewhere
or adjust the budget. Never raise the budget yourself.

## Scope

**In scope**:
- `apps/web/src/routes/map.tsx` (create — new TanStack route)
- `apps/web/src/studio/pages/network-map.tsx` (create — page component)
- `apps/web/src/components/route/NetworkMapLibre.tsx` + `.map.tsx` (create —
  citywide variant reusing `maplibre-style.ts`)
- Nav: the shell component that renders the top navigation (grep
  `apps/web/src` for where "Routes / Compare / Findings / Briefs" links are
  defined; likely `__root.tsx` or a StudioBar/shell component) — add "Map".
- `tools/pipeline-v2/src/commands/` — ONE new command that materializes a
  citywide simplified network GeoJSON artifact
  (`map/{month}/network-simplified.geojson`) from the existing per-route
  segment artifacts, registering it in the map manifest. Follow an existing
  map artifact command as the pattern (grep `tools/pipeline-v2/src/commands`
  for the command that builds `map/{month}/manifest.json`).
- `packages/studio-api` ONLY if the manifest schema needs the new
  artifactKind enum value.

**Out of scope** (do NOT touch):
- `RouteMapLibre.map.tsx`'s route-detail behavior (reuse, don't refactor).
- Borough/area rollup choropleths (design E9 — later).
- PMTiles/Protomaps basemap — same "no basemap in v1" rule as plan 002.
- Production publish (`publish:serving-release --execute`) — produce the
  artifact locally + the command; the operator runs production publishes.
- The homepage; do not add a map teaser there.

## Git workflow

- Branch: `advisor/003-citywide-network-map` off `main` (after 002 merges; if
  002 is unmerged, branch from 002's branch and say so in your report).
- Commit per step; short imperative messages.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Preconditions (cheap, do first)

1. Verify plan 002 landed: `ls apps/web/src/components/route/RouteMapLibre.map.tsx
   apps/web/src/components/route/maplibre-style.ts apps/web/src/components/TimeScrubber.tsx`
   → all three exist. If any is missing, **STOP and report** ("plan 002 must
   land first") — do not build your own map foundation.
2. Inspect one per-route segment artifact for the baseline month under
   `data/artifacts/map/` (or wherever the manifest-builder command reads
   them) and confirm whether per-segment `hours` arrays (24 entries) are
   present in the features or reachable from the detail projections the
   studio release builds. Record YES/NO — it decides whether Step 1 emits
   `hours` and whether Step 3 builds the scrubber experience or the
   static-lens fallback. Do not start Step 3 without this answer.

**Verify**: both checks answered explicitly in your working notes.

### Step 1: Pipeline command for the citywide artifact

Add a pipeline-v2 command (e.g. `map:network-artifact`) that:
1. Reads the per-route segment GeoJSON artifacts for the baseline month from
   the local artifact store (find where the existing manifest-builder command
   reads/writes `data/artifacts/map/{month}/…` and match it).
2. Concatenates features, keeping the per-feature properties the UI/UX spec
   requires: `routeId`, `label`, `sbs`, `borough`, `scheduledMph`,
   `currentMph`, `trend6mPct`, `riderHoursLost`, `dailyRiders`, and
   `hours` (24-entry route-level mean of per-segment hourly severity —
   reuse the derivation in
   `apps/web/src/components/route/route-derived.ts:96-110`; the per-segment
   `hours` arrays are in the same detail projections the studio release
   pipeline already builds, so compute the route mean where those are
   materialized). Join scalar metrics from the same source the D1 route
   list is built from (inspect what the manifest command can reach and
   reuse it). If route-level `hours` genuinely cannot be derived at this
   point in the pipeline, emit the scalar properties only and note in your
   report that the page must ship the spec's static-lens fallback.
3. Simplifies geometry (the pipeline already has simplification for map
   artifacts — grep for "simplif" in tools/pipeline-v2; reuse) to keep the
   artifact under ~3MB.
4. Writes `map/{month}/network-simplified.geojson` and adds a manifest entry
   with a new `artifactKind: "network_simplified"`.
Add a fixture-backed test following an existing map-command test in
`tools/pipeline-v2`.

**Verify**: `bun --filter @bp/pipeline-v2 test` → all pass; run the command
against the local baseline month → artifact file exists and is <5MB
(`ls -la data/artifacts/map/<month>/`).

### Step 2: Route + page skeleton

Create `apps/web/src/routes/map.tsx` modeled on
`apps/web/src/routes/routes/index.tsx` (loader pattern, stale time, lazy page
import). Loader fetches: (a) the map manifest (`/api/v1/map/manifest`), (b)
the studio route list (same call `/routes` uses) for lens metrics + labels.
The page component (`studio/pages/network-map.tsx`) renders a full-viewport
layout: lens switcher (left/top), legend, and the lazy `NetworkMapLibre`.

**Verify**: `bun --filter @bp/web typecheck` → exit 0.

### Step 3: NetworkMapLibre + reading rail

Build the page exactly per the **UI/UX specification** section above. Order
of construction inside this step:

1. `NetworkMapLibre.map.tsx` (lazy via `NetworkMapLibre.tsx`, identical
   pattern to plan 002): fetch the `network_simplified` artifact via its
   manifest `apiPath`; missing artifact → the spec's honest empty state
   (see `apps/web/src/components/route/HonestEmptySection.tsx` for tone) —
   never a fake map. Layer stack, casings, focus-dimming, pin model, pulse
   rings, and route-label chips per the spec's "Map content & interaction".
2. Hour engine: `speedAtHour(feature, hour)` as a pure exported function;
   scrub updates per-feature `feature-state` (or a rebuilt match
   expression) — verify visually there is no refetch on scrub (network tab
   silent while playing).
3. Reading rail: `NetworkDetailPanel` (identity row, 46px hero,
   `HourCurve`, ruled stat strip, actions) and `NetworkRankList` (12 rows,
   shared `hoveredId` with the map, re-ranks per hour) per the spec's
   "Reading rail" subsection. `HourCurve` is a plain SVG component —
   build it from the spec (peak bands, dashed sched line, tinted area,
   sliding now-marker); it is small enough to live beside the panel, not
   behind another lazy boundary.
4. Toolbar + filter row: reuse `TimeScrubber` from plan 002; legend
   gradient bar from the ramp; borough chips with the focus-dim wiring.
5. If (and only if) Step 1 reported no `hours` data: ship the static-lens
   fallback described in the spec — same panel/rail, no scrubber, three
   text-tab lenses.

**Verify**: `bun --filter @bp/web build` → exit 0 with bundle budget passing
(see the budget warning under "Commands you will need" — a failure on
irreducible bytes is a STOP, not a license to raise the budget).

### Step 4: Navigation entry

Add "Map" to the main nav between Routes and Compare (match existing link
component and active-state styling exactly).

**Verify**: `bun --filter @bp/web typecheck` → exit 0; dev server shows the
nav item.

### Step 5: Manual QA

`bun --filter @bp/web dev` → `/map`: all routes render; switching lenses
recolors without refetch; hover card shows real numbers; click lands on the
route detail page; empty-manifest case (temporarily point at a bogus month
via query param if supported, else skip) shows the honest empty state.
If no browser tooling is available, flag "needs manual QA" in your report.

### Step 6 (OPTIONAL — skip without penalty): Bus-lane overlay

Only if Steps 1–5 are done and verified: extend the Step 1 pipeline command to
also copy `data/artifacts/map/bus-lanes/local-streets.min.geojson` into
`map/{month}/bus-lanes.geojson` + manifest entry
(`artifactKind: "bus_lanes"`), and add a "Bus lanes" toggle layer (thin
underlay in a neutral ink tone). If the manifest schema or pipeline plumbing
resists after one attempt, drop this step and note it in the report.

## Test plan

- Pipeline: fixture-backed test for the new command (Step 1) — artifact
  written, manifest entry present, feature properties include routeId.
- Web: unit-test the lens → paint-expression builder and the routeId→metrics
  join (pure functions in `network-map`-adjacent module), colocated with the
  app's existing test pattern. Cases: each lens produces stops; missing
  metrics for a routeId falls back to a neutral color, not a crash.
- `bun --filter @bp/pipeline-v2 test` and the web unit tests all pass.

## Done criteria

- [ ] `/map` exists, in nav, renders the citywide network from the R2-backed artifact
- [ ] Hour scrubbing recolors the network with no refetch (or, if Step 1's
      escape hatch fired, the three static lenses work); nothing on the page
      discusses internal data coverage
- [ ] `bun --filter @bp/web build` exits 0, bundle budget passes
- [ ] `bun --filter @bp/pipeline-v2 test` passes incl. new command test
- [ ] Empty-manifest path renders an honest empty state (code path exists and is tested or manually demonstrated)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- Plan 002's `maplibre-style.ts` / lazy pattern doesn't exist (002 not done).
- The per-route GeoJSON artifacts aren't readable locally for any month
  (report which months exist under `data/artifacts/map/`).
- The combined artifact can't get under ~5MB even simplified — report sizes;
  the fallback decision (PMTiles, per-borough split) is the operator's.
- Adding a manifest artifactKind breaks `MapManifestResponseSchema` consumers
  in a way one schema-enum addition doesn't fix.
- The route list payload lacks trend/riderHoursLost fields for the lens join —
  report the actual fields; do not invent metrics.

## Maintenance notes

- This page is the natural home for future lenses (reliability grade once
  Track B Wave 1 lands; treatment coverage once route-level treatment % is
  served). Lens definitions should stay data-driven (one array) so adding a
  lens is a 10-line change.
- When a real basemap lands, hover/click hit-testing may need `layers:`
  filters on `queryRenderedFeatures`.
- Reviewer should scrutinize: artifact size + cache headers (immutable is
  correct because the key is month-versioned), and that lens switching does
  not refetch the artifact.

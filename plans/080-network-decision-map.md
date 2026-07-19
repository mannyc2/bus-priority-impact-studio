# Plan 080: Turn `/map` into an accessible, shareable network decision explorer

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` (Generation 9 table).
>
> **Drift check (run first)**:
> `git diff --stat cd878f7..HEAD -- apps/web/src/routes/map.tsx apps/web/src/studio/pages/network-map.tsx apps/web/src/components/route/NetworkMapLibre.tsx apps/web/src/components/route/NetworkMapLibre.map.tsx apps/web/src/components/route/maplibre-style.ts apps/web/src/components/route/load-maplibre.ts apps/web/src/studio/api-client.ts apps/web/src/components/SearchField.tsx apps/web/src/components/ui apps/web/test/shared/network-map.test.ts apps/web/test/shared/maplibre-runtime.test.ts tools/pipeline-v2/src/checks/check-web-performance.ts tests/harness/design-doctrine.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

> **Amendment (2026-07-12 — de-month direction, binding; see plan 079's
> amendment for the full mapping).** Month-keyed release identity is retired
> (ADR-0022). For this plan: the compact context line above the map reads
> from the amended 079 manifest's `coverage.end` — "Data through <Month
> YYYY> · …" — never "As of <baseline month>"; Data Notes expose
> `coverage` and `publishedAt` (not `baselineMonth`); any join/validity check
> against route facts uses the `coverage_mismatch` state 079 defines. Do not
> introduce new fields, props, or copy containing "baseline".

> **Amendment (2026-07-17 — approved round-3 Atlas comp, binding).**
> The operator selected the light Atlas surface and approved implementation.
> D4 replaces the persistent desktop inspector/list with the opt-in
> "Find a route" overlay panel. D7 adds the "Vs all day" compare mode with
> the approved diverging delta bins. D17 replaces the ticked legend with the
> self-labelled proportional legend strip. D15 width-by-daily-riders is
> deferred and must not ship in this milestone. The visual checkpoint on
> `codex/080-map-visual-redesign` implements those approved decisions plus
> the attention scale, route badges/labels, DOT-lanes layer, popup redesign,
> and remembered note dismissal. It does not complete Plan 080: URL state,
> served-borough binding, Data notes, mobile Sheet, hover-performance rework,
> and the remaining lens-eligibility gates still depend on Plan 079 and the
> steps below. The dark Signal comp is retained only as a rejected alternative.

> **Execution rebind (2026-07-19 — post-079 live-tree drift, binding).** Plan
> 079 is merged on `main` at `11e21ee0`. The required drift check shows that
> the approved Atlas visual checkpoint has already landed: neutral first
> paint, opt-in Find-a-route panel, click-to-pin popup, attention scales,
> AM/PM and Vs-all-day controls, proportional legend, route badges/labels,
> lazy bus lanes, and remembered note dismissal are present and tested. Treat
> the stale "Current state" bullets and any step text that asks for those
> features as historical evidence, not work to repeat. The remaining contract
> is: strict shareable URL state and evidence-aware canonicalization; exact
> served-borough filtering; O(1) MapLibre hover/pin updates through feature
> state; lazy selected-route/segment validation; Data Notes with
> `coverage`/`publishedAt` and source/lens posture; an accessible mobile
> `Sheet`; and final keyboard/touch/reduced-motion/performance QA. Do not add a
> change lens unless the served contract carries its real endpoint months.
>
> Parallel worktrees are permitted only within this plan, from the same
> amended-plan commit, with these non-overlapping ownership boundaries:
>
> - **URL/model lane:** `apps/web/src/routes/map.tsx`, a focused new pure
>   search/canonicalization module, and its new focused test file.
> - **Runtime lane:** `NetworkMapLibre.map.tsx`, `NetworkMapLibre.tsx`,
>   `load-maplibre.ts`, and `maplibre-runtime.test.ts`; it may not edit page,
>   API-client, or URL-model files.
> - **API/selected-route lane:** `apps/web/src/studio/api-client.ts` and
>   `apps/web/test/shared/api-client.test.ts`; it exposes only the lazy typed
>   loader/validation input needed by the integration lane.
> - **Integration lane:** `network-map.tsx`, optional focused
>   inspector/controls components, `network-map-model.ts`, and
>   `network-map.test.ts`; it composes Data Notes, desktop/mobile UI, borough
>   behavior, and the three lane commits.
>
> Finish and verify Plan 080 on the integration branch before starting Plan
> 081. Plans 080/081/085/086 remain sequential because their live contracts
> and UI files overlap.

## Status

- **Plan status**: DONE (completed 2026-07-19; implementation commit
  `926ce17c`, with the browser and verification receipt recorded in
  `knowledge/log.md`)
- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: `plans/077-restore-maplibre-rendering.md`,
  `plans/079-truthful-map-contracts.md`
- **Category**: direction
- **Planned at**: commit `cd878f7`, 2026-07-09 (working tree already dirty in
  `plans/` only)

## Why this matters

People do not visit this product to admire a colored route network. Riders and
advocates want to find a route and see where/when it struggles; planners want
to rank route-slice passenger-delay exposure and inspect treatment gaps;
journalists and policy staff
need a reproducible state with period, universe, sources, and caveats. The
current map dims almost the whole network on first paint, offers no route
search, hides its only inspector on mobile, immediately navigates on tap, and
cannot be reproduced from its URL. This plan turns the existing `/map` route
into a map-first triage workflow without adding a page, tab, trip-planning
behavior, or opaque opportunity score.

## Current state

- The page selects a route the user did not select.
  `apps/web/src/studio/pages/network-map.tsx:43-56` sorts the active lens and
  sets:

  ```ts
  const activeRouteId = hoveredRouteId ?? ranked[0]?.properties.routeId ?? null;
  ```

  It passes that value as `selectedRouteId` at lines 78-91.
- The WebGL adapter interprets that as focus.
  `NetworkMapLibre.map.tsx:63-100` lowers all non-active routes to 20% opacity.
  The SVG fallback repeats it at `NetworkMapLibre.tsx:85-110`. Changing lens
  therefore changes the apparent selection before the user acts.
- Map click immediately navigates to route detail
  (`network-map.tsx:86-90`; `NetworkMapLibre.map.tsx:241-247`). There is no
  inspect/pin step.
- The only named route list is the top ten and desktop-only:
  `network-map.tsx:118-128,254-327`. Below `md`, users get map + controls but no
  readout or list.
- Rank rows only synchronize on mouse enter/leave. An unlinked fallback button
  at `network-map.tsx:299-310` has no useful click action.
- The MapLibre wrapper is an interactive canvas labelled as a static speed
  image (`NetworkMapLibre.map.tsx:339-345`) even when another lens is active.
  The static SVG puts `onClick` on a non-focusable `<g>` under an accessibility
  lint suppression (`NetworkMapLibre.tsx:92-101`).
- `/map` has no `validateSearch` (`apps/web/src/routes/map.tsx:11-24`), so lens,
  period, borough, route, segment, and layers disappear on reload/share.
  `routes/$routeId.tsx:16-41` is the local exemplar for validated search state.
- Map interactivity strategy already requires route search/select, fit to
  bounds, segment click, metric/time selectors where evidence exists, and a
  source/caveat drawer (`knowledge/wiki/engineering/map_strategy.md:118-130`).
- Product engagement guidance says the hooks are: find my route, rider pain,
  surprise/change, actionable treatment gap, and citeable trust
  (`knowledge/wiki/engineering/serving_snapshot_2_surface_manifest.md:44-62`).
- Hover is expensive. `NetworkMapLibre.map.tsx:63-100,191-194,331-335`
  deep-copies all geometry and calls `GeoJSONSource.setData` whenever hover or
  selection changes. The current artifact has 52,907 coordinates.
- Cartography has water background + land polygons only. Borough names are
  discarded; there are no labels or actual bus-lane layers even though plan
  079 preserves the context and manifest.
- MapLibre navigation controls are added top-right
  (`NetworkMapLibre.map.tsx:225-226`), directly underneath the 300px top-right
  inspector (`network-map.tsx:118`).
- The July-4 design handoff contains useful concepts—borough/water context,
  click-to-pin, a persistent readout, route labels—but its autoplay/time
  scrubber was explicitly rejected and removed in commit `9789242`. Reuse the
  interaction concepts, not autoplay or fabricated demo data.
- Binding operator direction in `plans/README.md`: no new top-level page, tab,
  or nav item; deep links use query parameters; upgrade the existing map in
  place.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web typecheck | `bun --filter @bp/web typecheck` | exit 0 |
| Focused tests | `bun test apps/web/test/shared/network-map.test.ts apps/web/test/shared/maplibre-runtime.test.ts --timeout 5000` | all pass |
| Web tests | `bun run test:web` | all pass |
| Worker tests | `bun run test:worker` | all pass |
| Design doctrine | `bun run check:design-doctrine` | exit 0 |
| Web build/vendor budget | `bun --filter @bp/web build && bun run check:web-performance` | exit 0; entry, lazy map chunk, and MapLibre vendor budgets pass; plan 079's artifact audit—not this command—owns generated network/lane budgets |
| Architecture/style | `bun run check:web-architecture && bun run check:style` | exit 0 |
| Dev server | `bun --filter @bp/web dev` | `/map` loads for manual viewport/input checks |

## Suggested executor toolkit

- Use `shadcn` and compose the installed `ToggleGroup`, `Input`/`SearchField`,
  `Select`, `Sheet`, `ScrollArea`, `Button`, `Checkbox`/`Switch`, `Badge`, and
  `Tooltip` primitives. Every `SheetContent` must contain `SheetTitle` and
  `SheetDescription`; do not build a second overlay system.
- Use `vercel-react-best-practices` for the feature-state updates, derived
  lists, lazy selected-route fetch, and preload behavior.
- MapLibre's official hover example uses `setFeatureState` instead of replacing
  source data: https://maplibre.org/maplibre-gl-js/docs/examples/create-a-hover-effect/
- W3C guidance treats maps as complex non-text content and recommends a short
  description plus an equivalent structured description/data view:
  https://www.w3.org/WAI/tutorials/images/complex/
- WCAG keyboard guidance requires pointer actions to have a keyboard
  equivalent: https://www.w3.org/WAI/WCAG22/Understanding/keyboard

## Scope

**In scope**:

- `apps/web/src/routes/map.tsx`
- `apps/web/src/studio/pages/network-map.tsx`
- `apps/web/src/components/route/NetworkMapLibre.tsx`
- `apps/web/src/components/route/NetworkMapLibre.map.tsx`
- `apps/web/src/components/route/maplibre-style.ts` only for shared scale/style
  additions not already delivered by 077
- `apps/web/src/components/route/load-maplibre.ts` only for safe preload support
- `apps/web/src/studio/api-client.ts` only for lazy selected-route/layer fetch
  helpers over plan 079's manifest
- focused new `apps/web/src/components/route/network-map-model.ts` and
  `NetworkMapInspector.tsx`/`NetworkMapControls.tsx` modules if needed to keep
  state/scales, Data Notes, and responsive composition below doctrine limits;
  do not create a parallel map runtime or contract
- existing `apps/web/src/components/SearchField.tsx` if a small controlled-mode
  extension is required; otherwise reuse unchanged
- existing installed shadcn primitives under `apps/web/src/components/ui/`
  only if a missing variant/prop is required by Base UI composition
- `apps/web/test/shared/network-map.test.ts`
- `apps/web/test/shared/maplibre-runtime.test.ts`
- one focused new test file under `apps/web/test/shared/` if keeping state/model
  tests separate is clearer
- `tests/harness/design-doctrine.test.ts` only to ratchet any temporary map-page
  allowlist after the redesign
- `plans/README.md` (status row only)

**Out of scope**:

- A new route/page/tab/nav item.
- Opportunity/composite ranking from plan 076; expose only transparent served
  measures and filters until the operator approves that design.
- A hosted street basemap, third-party tiles, PMTiles migration, renderer swap,
  or CSP expansion. Start with first-party borough, route, stop, and bus-lane
  artifacts.
- Realtime vehicle animation, trip planning, drawing tools, autoplay, or an
  hour-by-hour movie.
- Exact ACE/TSP points. Route/corridor proxies remain textual until plan 081 or
  075 has audited geography.
- Replacing the route-detail Segments explorer; plan 081 owns it.
- Adding a browser automation dependency. Manual real-browser checks are an
  explicit gate because no browser binary is installed in the audit
  environment.

## Git workflow

- Branch: `codex/080-network-decision-map`
- Commit logical units: (1) URL/state model, (2) map feature-state/cartography,
  (3) desktop/mobile inspector and selected-route drill, (4) tests/ratchets.
- Example message: `Network map: add searchable pinned evidence explorer`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Define the question model and URL contract before writing UI

Add a strict `validateSearch` to `/map` with only these bounded values:

```ts
type NetworkMapSearch = {
  lens?: "speed" | "delay-exposure" | "change";
  period?: "all" | "am" | "pm"; // valid only for speed
  borough?: "Bronx" | "Brooklyn" | "Manhattan" | "Queens" | "Staten Island";
  route?: string;                 // canonical route slug
  segment?: string;               // stable spine ID; valid only with route
  lanes?: true;
};
```

Omit defaults from the URL (`speed`, `all`, all boroughs, no pin, no layer).
Drop invalid combinations during validation. UI controls use `replace: true` so
toggle changes do not flood browser history; an explicit route pin may push one
history entry. Hover/focus is transient and never enters the URL.

Use two-stage canonicalization: `validateSearch` checks only structural
shape/enums, then a pure evidence-aware helper runs against the loaded bundle
and route facts and replaces unsupported lenses, periods, route slugs, segment
IDs, or unavailable layers. Do not make the router validator depend on data it
cannot access.

Segment validation is explicitly tri-state because stable segment IDs arrive
only from the pinned route's lazy detail response:

- `pending`: preserve a structurally valid `route` + `segment` URL unchanged
  while detail is loading; render the route pin and a “validating segment”
  state;
- `ready`: keep the segment only when it resolves to one unique non-null spine
  ID for that route; otherwise remove only `segment` with `replace: true` and
  explain that the saved segment is unavailable;
- `unavailable`/request error: preserve the structurally valid URL so a
  transient failure does not destroy a shared link, but disable segment
  highlighting and say validation is unavailable. Retry may move it to
  `ready`; never treat pending/error as invalid.

Test a direct reload and Back/Forward through all three states. Route/lens/
borough validation that depends only on the already-loaded network/fact bundle
may still run immediately. If an incoming URL pins a route outside its borough
filter, canonicalization clears `route` and `segment`. Likewise, when the user
explicitly changes borough to one that excludes the current pin, clear both
IDs, return the Sheet/inspector to the filtered browse list, and announce the
change; never preserve a contradictory hidden selection.

Define lens eligibility from plan 079's canonical route facts:

- Speed: route speed exists; AM/PM additionally passes hourly coverage gate.
- Route-slice delay exposure: the dedicated map fact's
  `delayExposure.status === "available"`, its `valueRiderHours` is non-null,
  and plan 079's producer invariant has already proved equality to the
  canonical route projection before publication; facts coverage
  is complete for the declared mapped universe. The release-level threshold is
  exactly 100%: numerator = mapped routes with a same-baseline canonical fact,
  non-null value, and the required route-slice coverage/denominator
  metadata; denominator = manifest actual mapped route count. Show the lens
  only when numerator equals denominator (no rounding or partial threshold),
  and test N/N versus (N−1)/N. Visible copy must use “route-slice delay
  exposure” or “rider-hours of delay,” never generic wording that sounds like
  a full-route passenger metric.
- Change: optional. Canonical `movement6mPct` must be non-null **and** the
  served fact must identify the actual latest/comparison months used. The
  planned payload does not currently expose those per-route months, so hide
  this lens unless plan 079's live implementation (or an already-landed
  canonical route contract) supplies them. Never infer both endpoints from the
  map manifest alone. Label an eligible lens “6-month speed change” and
  describe it as route-level context—not a stable-segment or causal claim.

Hide a lens that is unsupported across the release; do not render a control
that produces mostly invented/default values. Show its coverage count in Data
Notes. Do not add a treatment-gap composite.

Define the visual domains as pure, tested release-level scale models before
rendering:

- Speed reuses one fixed mph domain/anchors across All/AM/PM; borough filters
  never renormalize a speed value's color.
- Route-slice delay exposure is shown in rider-hours over the served
  route-slice window, with the exact service-day/coverage denominator supplied
  by the canonical fact metadata. Do not relabel it “per average weekday”
  unless that exact denominator is present. Use either
  documented fixed thresholds or full-release quantile breaks calculated once
  from eligible routes, with duplicate-quantile collapse and explicit cap/no-
  data keys. Never recompute breaks after borough/search filtering.
- If Change is eligible, use a diverging scale centered exactly at zero with a
  symmetric full-release domain (a documented robust absolute percentile may
  cap outliers). Negative speed change is “worsening,” positive is “improving,”
  zero is neutral. Use numeric/sign labels and line treatment in the list so
  red/green hue is not the only distinction.

Legends display raw units, exact break values, cap behavior, and eligible N.
Tests prove the same raw value keeps the same color across filters/selection,
zero is neutral, and change ranking/labels use the correct sign.

Create pure helpers for URL normalization, eligibility, ordering nulls last,
and route/segment lookup. The borough filter uses plan 079's verified
`servedBoroughs[]` membership, not `StudioRoute.borough` (which is only a
route-prefix/primary-family label). Cross-borough routes appear in every served
borough. Features whose demo data lacks verified membership stay visible only
under All and are counted in Data Notes; full production publication rejects
that gap. Test these helpers before component work.

Keep identity domains explicit. URL `route` is a canonical slug, MapLibre
feature state is keyed by source `routeId`, and route detail/artifact helpers
take the form their API contract names. Build and test both `slugByRouteId` and
`routeIdBySlug` from the exact plan-079 join; never call a source ID a slug or
vice versa. Include the SBS canary `M15+` ↔ `m15-sbs` in normalization, pin,
feature-state, and detail-fetch tests.

**Verify**:

```sh
bun test apps/web/test/shared/network-map.test.ts --timeout 5000
bun --filter @bp/web typecheck
```

Expected: invalid search values downgrade to canonical defaults; only eligible
records rank; null/no-data records sort last with stable label tie-break.

### Step 2: Establish honest default, hover, focus, and pinned-selection states

Use separate state concepts:

- `hoveredRouteId`: source-ID-keyed pointer preview only;
- `focusedRouteId`: source-ID-keyed keyboard/DOM-focus preview only;
- `pinnedRouteSlug`: click/tap/search selection, sourced from URL;
- `pinnedRouteId`: exact source ID derived from `pinnedRouteSlug` through the
  tested bidirectional route map;
- `pinnedSegmentId`: optional selected-route segment, sourced from URL;
- `previewRouteId`: focused route first, then pointer-hovered route;
- `readoutRoute`: preview route, else pinned route, else top-ranked route;
- map visual focus: preview or pin only. The top-ranked readout is not a visual
  selection.

Pointer leave clears only `hoveredRouteId`; row blur clears only
`focusedRouteId`. A pointer event must not erase an active keyboard preview,
and a blur must not erase a live map hover. Test interleaved enter/focus/leave/
blur sequences and cleanup on unmount.

On initial load, all eligible routes are fully legible; no route is dimmed.
Label the initial readout explicitly as “Top ranked for [lens/period]”; label
hover previews as previews and pinned routes as selected. Hover/focus
temporarily emphasizes one. First click/tap pins and opens the inspector; it
does not navigate. Clicking map background, pressing Escape, or the
inspector's Clear button unpins. `Open route` is the explicit navigation action
and links to `?tab=segments`. This plan does not add `segment` to route-detail
search, so it must not pass that unsupported parameter; plan 081 upgrades the
CTA to preserve an exact selected spine segment after that route contract
exists.

Search selection pins and fits the map to route bounds. Borough filtering fits
the retained features only after explicit filter change, not on every render.

**Verify**: focused model tests prove the top-ranked readout leaves
`pinnedRouteSlug`/derived ID null and that lens changes never create/replace a
pin.

### Step 3: Replace hover-time GeoJSON replacement with feature state

Keep route geometry immutable after source load. Continue using
`promoteId: "routeId"` and express hover/pin in MapLibre paint properties via
`["feature-state", ...]`. On pointer/focus change:

1. clear the old feature state;
2. set the new feature state;
3. do not call `GeoJSONSource.setData`.

Rebuild/set source data only when geometry, period, lens, or route-fact values
actually change. Do not deep-copy coordinate arrays merely to add display
properties. Keep one transparent hit layer with a touch-friendly width.

Add a fake-MapLibre regression test counting `setData` and `setFeatureState`:
crossing ten route IDs must produce feature-state calls and zero network-source
`setData` calls; changing period may produce one data update.

Move navigation controls to a corner not covered by the desktop inspector and
set overlay-aware map padding for fit operations.

**Verify**:

```sh
bun test apps/web/test/shared/maplibre-runtime.test.ts --timeout 5000
```

Expected: hover test passes with zero full-source updates; cleanup still
detaches all events.

### Step 4: Build restrained first-party cartography and the selected-route drill

Use plan 079's context artifact:

- water/background;
- borough land/outline hierarchy;
- borough label-point symbol layer;
- route casing + metric line;
- selected/hovered route label only, so 346 labels never collide;
- a neutral dashed/no-data encoding and matching legend/list text.

Add an optional `NYC DOT bus lanes` layer using the manifest's actual bus-lane
GeoJSON. Fetch it only when toggled, respect layer readiness, and label it as
source geometry—not route coverage or legal operating-hour coverage. Keep it
visually subordinate to the active bus routes.

When a route is pinned, lazy-fetch its route detail and route-segment GeoJSON
in parallel with an AbortController. Overlay its segment geometry above the
network, keyed by plan 078 identities. In the inspector show the three slowest
current all-day segments with from/to, speed, current route-slice
delay-exposure hours, and availability. Label this block “Current all-day
segment context — [release
month]” regardless of the network lens. It is aligned context for the all-day
speed/delay-exposure view, but an explicitly different grain/period for AM/PM or
6-month change; never imply it was ranked by the active network lens. If an
exact aligned segment measure does not exist, say so rather than adapting the
drill. Selecting a matched one pins it and updates the network map's `segment`;
do not fetch every route's detail or perform network-wide segment analytics in
the browser. Only a non-null, unique `spineSegmentId` enters that URL field. An
unmatched current segment remains visible with “stable selection unavailable”
and may be previewed locally, but it cannot receive a fabricated durable pin.

If selected-route detail is unavailable, retain the route-level inspector and
show one explicit unavailable sentence. Never block the citywide map.

**Verify**: component/model tests cover lazy fetch cancellation, absent layer,
route detail unavailable, and a selected segment with an exact identity.

### Step 5: Compose the desktop inspector and mobile sheet from existing primitives

Replace the custom `MapToggle` button loop with installed `ToggleGroup` for
three-choice lens/period controls. Use:

- a controlled `SearchField`/Input with a labelled result list over every
  filtered route in the manifest-declared mapped universe;
- a compact borough Select or ToggleGroup (choose based on available width);
- Checkbox/Switch for the bus-lane layer;
- a proper legend with numeric ticks and a separate no-data entry for every
  lens;
- a visible compact line above the map: `As of <baseline month> ·
  Local/Limited/SBS · <verified routes>/<expected routes>` plus a `Data notes`
  action;
- a desktop right inspector (roughly 320-360px) with route summary, rank among
  eligible routes, data coverage, selected segments, and `Open route`;
- a bottom `Sheet` on mobile opened by pin/search. Include `SheetTitle`,
  `SheetDescription`, a visible close/clear action, and a non-obscured primary
  route action.

The mobile toolbar must also contain an always-visible `Browse all N routes`
button. It opens the Sheet directly to the complete ranked/list alternative
before any pin and without requiring the canvas or a known search term. Pinning
from that list switches the same Sheet to the selected readout; Back/Clear
returns to browse state.

The ranked route view must be a real keyboard-accessible DOM list, not the
canvas. Include every eligible filtered route in its scroll region (346 rows is
bounded); default viewport may show the top rows. Focusing/hovering a row
highlights the map, Enter/Space pins, and the row's visible text includes route,
metric value, period, and borough. Do not rely on color alone.

Give the map container `role="region"`, a dynamic label, and
`aria-describedby` pointing to a short live summary. Do not wrap MapLibre's
focusable controls inside `role="img"`. In the SVG fallback, remove click
handlers from `<g>`; use the same external list for interaction.

Use at least 24×24px targets (prefer 40px for primary map controls) and
`ink-55` or stronger for 10-12px text. WCAG 2.2's minimum target guidance is
https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.

Data Notes must expose plan 079's `baselineMonth`, `generatedAt`, exact route
universe/inclusions, layer and verification status, complete-facts N/M, source
snapshot names/dates/status, active metric unit/grain/formula/coverage, network
artifact key/SHA-256, compact route-facts key/SHA-256, and manifest
key/generatedAt. Add `Copy view + citation` that copies the canonical query URL
and this release metadata. Be explicit that the URL is a
**current/month-alias state link, not an immutable archive**: corrected objects
may replace the alias, while the copied SHA-256 makes that detectable. Do not
claim version-pinned reproducibility until content-addressed fetch/navigation
is separately implemented.

**Verify**:

```sh
bun --filter @bp/web typecheck
bun run test:web
bun run check:design-doctrine
```

Expected: all pass; no accessibility lint suppression remains on the SVG route
groups.

### Step 6: Preload the map runtime without blocking data and keep a useful loading state

Expose a guarded `preloadNetworkMap()` that starts both the lazy `.map.tsx`
module and MapLibre vendor request in the browser. Invoke it at `/map` loader
start/navigation intent in parallel with route/network/context fetches; attach
a rejection handler and never await it as a data dependency. SSR/non-browser
execution must be a no-op.

Keep a visible cartographic/static skeleton until MapLibre fires `load`; do not
show a blank container after React renders but before the vendor is ready.
Plan 079's performance check must continue to budget the vendor file.

**Verify**:

```sh
bun --filter @bp/web build
bun run check:web-performance
bun run test:worker
```

Expected: all pass; the preload is absent from the initial application bundle
except for the small loader wrapper; MapLibre remains a separate vendor file.

### Step 7: Run desktop, tablet, mobile, mouse, keyboard, touch, and reduced-motion QA

Run the dev server and record results for at least 1440×900, 1024×768, and
390×844. The advisor could not run a browser, so this gate is mandatory.

At each viewport verify:

- initial network remains readable with no implicit selection;
- search finds a route outside the top ten;
- borough filter and eligible lenses work; time controls appear only for speed;
- hover/focus previews, click/tap pins, background/Escape clears;
- pin opens inspector/sheet; `Open route` is the only route navigation action;
- selected route loads exact segments and an unavailable response degrades
  honestly;
- map controls are not covered;
- full ranked list is usable by keyboard and screen-reader inspection without
  canvas interaction;
- mobile `Browse all routes` reaches that list before any pin/search;
- bus-lane toggle describes actual source geometry;
- shared URL restores lens/period/filter/route/segment/layer state;
- Data Notes/copy citation report the visible release, universe, sources,
  verification, metric grain, manifest/network/route-facts keys and hashes,
  and mutable-alias caveat;
- a route's color does not change merely because a borough/search filter is
  applied, and an eligible change lens centers exactly on zero;
- reduced motion has no pulsing skeleton or animated paint transition.

Capture one screenshot per viewport for PR review if the execution environment
supports it; do not commit screenshots unless the repo has an established
location.

## Test plan

- Search parsing/canonical URL defaults and invalid combinations.
- Lens eligibility and null-last ranking for speed, route-slice delay exposure,
  and change.
- Fixed scale semantics: filter-invariant colors, traversal/units, duplicate
  quantiles, caps, zero-centered change, correct worsening/improving sign.
- Route slug/source-ID round trips, including `M15+` ↔ `m15-sbs`.
- No implicit visual selection from top-ranked route.
- Map feature-state call counts and no `setData` on hover.
- Pointer, focus, keyboard pin, Escape/background clear, and explicit route
  navigation.
- Mobile Sheet title/description and inspect-before-navigate behavior.
- Mobile browse entry works before search/pin and exposes the complete list.
- Selected-route lazy fetch success/unavailable/abort.
- Layer unavailable/available and no-data legend cases.
- Release line/Data Notes/copy citation include period, universe, verification,
  source status, metric grain, manifest/network/route-facts keys and hashes,
  and mutable-link caveat.
- SVG fallback interaction via external list, with no static-element handler.
- Build/performance budgets and mandatory manual viewport/input matrix.

## Done criteria

- [ ] `/map` has validated, canonical search state for lens/period/borough/
      route/segment/layer.
- [ ] Initial view does not dim the network or create a user selection.
- [ ] Search can reach every route in the declared mapped universe; the ranked
      DOM list is keyboard accessible and synchronized with the map.
- [ ] Slug URL state and source-ID map state round-trip through explicit tested
      mappings; SBS IDs do not diverge.
- [ ] Click/tap pins and inspects; only an explicit CTA navigates.
- [ ] Mobile gets a titled/described bottom Sheet, not a map with its inspector
      removed.
- [ ] Mobile can browse the complete ranked list before operating the canvas or
      entering a search.
- [ ] Hover/pin uses feature state; hovering never replaces the full source.
- [ ] Borough labels, no-data encoding, honest legends, and optional actual bus
      lanes provide cartographic/evidence context.
- [ ] Speed/delay-exposure/change scales (when eligible) have fixed documented
      domains, units, sign semantics, caps, and filter-invariant colors.
- [ ] Selected route can reveal exact segment evidence without eager
      network-wide detail fetches.
- [ ] Period controls only affect speed and enforce plan 079's coverage gate.
- [ ] URL reload/share reproduces the analytical state.
- [ ] The visible release line and Data Notes expose universe, source, quality,
      grain, coverage, all evidence keys/hashes, and clearly label the URL as a mutable alias
      rather than an immutable archive.
- [ ] Typecheck, focused/web/worker tests, doctrine, build/performance,
      architecture, and style pass.
- [ ] Manual 1440/1024/390 mouse/keyboard/touch/reduced-motion QA is recorded.
- [ ] No files outside the in-scope list are modified (`git status`).
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 079's route facts cover too little of the configured production route
  universe to support the chosen default lens. Do not hide a publication/data
  gap with geometry properties.
- `MapRouteFact.delayExposure` or `movement6mPct` lacks enough eligible routes
  for a useful lens. Hide/defer that lens and report measured coverage; do not
  synthesize it.
- The exact endpoint months behind `movement6mPct` are not served. Hide/defer
  the change lens; do not label manifest months as the route's comparison
  period by assumption.
- The requested selected-route drill cannot join by plan 078's exact IDs. Fix
  or block on 078; never reintroduce positional association.
- Bus-lane layer metadata is missing/stale. Disable it with the manifest reason;
  do not show an unlabeled route-coverage proxy.
- Mobile Sheet or searchable list cannot provide full inspect/navigation
  equivalence. Do not ship pointer-only canvas behavior.
- A proposed basemap requires external origins, attribution, terms review, or
  CSP expansion. Keep first-party context in this plan and propose a separate
  operator-reviewed spike.
- Performance fails after feature-state and lazy selected-route loading. Measure
  before proposing PMTiles or a new renderer.

## Maintenance notes

- Keep raw measures transparent. If plan 076 later approves an opportunity
  score, add it as a separately named, eligibility-gated lens with its formula
  and inputs—not as a silent replacement for speed/route-slice delay
  exposure.
- The map is an evidence triage surface, not a trip planner or realtime
  operations dashboard.
- Review URL-state changes for backward-compatible default omission and browser
  history behavior.
- Any future layer must supply: manifest readiness, source/grain label,
  unavailable state, legend, keyboard-equivalent representation, and payload
  budget before it appears in the control set.

# Plan 077: Restore validated MapLibre rendering and recover cleanly from failures

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` (Generation 9 table).
>
> **Drift check (run first)**:
> `git diff --stat cd878f7..HEAD -- package.json bun.lock apps/web/package.json apps/web/src/components/route/maplibre-style.ts apps/web/src/components/route/load-maplibre.ts apps/web/src/components/route/maplibre-runtime.ts apps/web/src/components/route/NetworkMapLibre.tsx apps/web/src/components/route/NetworkMapLibre.map.tsx apps/web/src/components/route/RouteMapLibre.tsx apps/web/src/components/route/RouteMapLibre.map.tsx apps/web/test/shared/maplibre-style.test.ts apps/web/test/shared/maplibre-runtime.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/068-verification-baseline.md`; coordinate with
  `plans/072-dependency-hygiene.md` because both may touch `bun.lock`
- **Category**: bug
- **Planned at**: commit `cd878f7`, 2026-07-09 (working tree already dirty in
  `plans/` only)

## Why this matters

The installed MapLibre 5.24 style parser rejects every `oklch(...)` value used
by the two WebGL maps. The base background is invalid before either map reaches
its `load` handler, and the generated speed/ridership/lane colors are invalid
too. Both components treat any MapLibre error as fatal, so users can receive
the static fallback even when WebGL is available. This plan restores the actual
interactive renderer, adds an executable style-compatibility gate, and makes a
transient vendor/runtime failure cleanly retryable.

## Current state

- `apps/web/package.json` uses `maplibre-gl` from the root catalog; `bun.lock`
  currently resolves MapLibre `5.24.0` and
  `@maplibre/maplibre-gl-style-spec` `24.8.1` transitively.
- `apps/web/src/components/route/maplibre-style.ts:15-34` contains the invalid
  fixed and generated values:

  ```ts
  bad: "oklch(0.52 0.16 28)",
  warn: "oklch(0.48 0.13 70)",
  good: "oklch(0.45 0.12 155)",
  water: "oklch(0.9 0.016 234)",

  function oklch([lightness, chroma, hue]: Oklch): string {
    return `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} ${hue.toFixed(1)})`;
  }
  ```

- Both base styles use the invalid water value:
  `NetworkMapLibre.map.tsx:146-157` and
  `RouteMapLibre.map.tsx:276-288` set
  `paint: { "background-color": MAP_COLORS.water }`.
- Both network renderers generate more invalid values:
  `NetworkMapLibre.map.tsx:349-363` and
  `NetworkMapLibre.tsx:187-201` return dynamic `oklch(...)` strings for riders
  and lanes.
- The existing test enshrines the bug. `apps/web/test/shared/maplibre-style.test.ts:69-75`
  expects `speedToColor` to return OKLCH strings, but never asks MapLibre to
  parse them.
- A read-only check against the installed parser returned:

  ```text
  layers[0].paint.background-color: color expected,
  "oklch(0.9 0.016 234)" found
  ```

  The official MapLibre Style Specification permits named colors, hex,
  RGB(A), and HSL(A), all in sRGB; it does not list OKLCH:
  https://maplibre.org/maplibre-style-spec/types/
- Error handling is too broad. `NetworkMapLibre.map.tsx:249,302-337` and
  `RouteMapLibre.map.tsx:370,484-523` call `setFailed(true)` for every
  MapLibre `error` event, but only remove the live map during effect cleanup.
- `apps/web/src/components/route/load-maplibre.ts:19-55` permanently caches a
  rejected promise and leaves the failed script element in the document, so a
  transient vendor failure poisons the SPA session.
- `knowledge/wiki/engineering/map_strategy.md:34-41` already defines the
  allowable NYC bounds. Neither constructor applies them.
- Browser CSS may continue to use OKLCH. The restriction in this plan applies
  only to values passed into MapLibre's style/expression engine.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install` | exit 0; lockfile updated only for the explicit style-spec test dependency |
| Web typecheck | `bun --filter @bp/web typecheck` | exit 0, no errors |
| Focused tests | `bun test apps/web/test/shared/maplibre-style.test.ts apps/web/test/shared/maplibre-runtime.test.ts --timeout 5000` | all tests pass |
| Web tests | `bun run test:web` | all pass |
| Build/budget | `bun --filter @bp/web build` | exit 0 and `Bundle within budget.` |
| Style | `bun run check:style` | exit 0 |

## Suggested executor toolkit

- Use `vercel-react-best-practices` for the loader/retry and effect lifecycle
  work.
- Read the official MapLibre color type contract before editing:
  https://maplibre.org/maplibre-style-spec/types/
- Use the installed style-spec package in tests; do not write a local regex
  that approximates MapLibre's parser.

## Scope

**In scope** (the only files you should modify):

- `package.json` — add the style-spec package to the workspace catalog at the
  version compatible with installed MapLibre.
- `apps/web/package.json` — add the style-spec as a dev dependency for tests.
- `bun.lock`
- `apps/web/src/components/route/maplibre-style.ts`
- `apps/web/src/components/route/load-maplibre.ts`
- `apps/web/src/components/route/maplibre-runtime.ts` (create; pure lifecycle
  seam shared by both React wrappers)
- `apps/web/src/components/route/NetworkMapLibre.tsx`
- `apps/web/src/components/route/NetworkMapLibre.map.tsx`
- `apps/web/src/components/route/RouteMapLibre.tsx`
- `apps/web/src/components/route/RouteMapLibre.map.tsx`
- `apps/web/test/shared/maplibre-style.test.ts`
- `apps/web/test/shared/maplibre-runtime.test.ts` (create)
- `plans/README.md` (status row only)

**Out of scope**:

- Data contracts, ranking formulas, route/segment identity, or treatment
  provenance; plans 078-079 own those.
- The citywide/route-map layout and interaction redesign; plans 080-081 own
  those.
- A third-party basemap, external tile provider, PMTiles migration, or renderer
  replacement.
- Changing browser CSS design tokens from OKLCH.
- Adding Playwright or another browser-test framework.

## Git workflow

- Branch: `codex/077-restore-maplibre-rendering`
- Commit logical units: (1) sRGB style contract/tests, (2) lifecycle/retry and
  motion/bounds hardening.
- Commit-message style follows the repo's imperative sentence pattern, for
  example: `Map runtime: validate sRGB styles and retry cleanly`.
- Do not push or open a PR unless the operator instructs it.

## Steps

### Step 1: Add the real MapLibre style validator to the web test surface

Add `@maplibre/maplibre-gl-style-spec` to the root workspace catalog and as an
`apps/web` dev dependency. Use the version resolved by the active MapLibre
dependency; at planning time that is `^24.8.1`. Run `bun install` once.

In `maplibre-style.test.ts`, import `Color` and `validateStyleMin`. Add a helper
that tests every fixed color, every speed anchor output, and representative
minimum/middle/maximum network-scale outputs with `Color.parse(value)`. Export
the shared base-style factory from `maplibre-style.ts` and validate its complete
result with `validateStyleMin`.

Do not import the validator into production code.

**Verify**:

```sh
bun --filter @bp/web typecheck
git diff -- package.json apps/web/package.json bun.lock
```

Expected: typecheck exits 0; the package diff contains only the explicit
style-spec dependency and its lockfile resolution.

### Step 2: Replace every MapLibre-facing OKLCH value with an sRGB value

Keep the perceptual ordering of the existing ramp but represent it in supported
colors. The direct sRGB conversions of the current anchors are the intended
starting values:

```ts
const MAP_COLORS = {
  bad: "#b33830",
  warn: "#8a4c00",
  good: "#006836",
  water: "#d4e0e7",
  // Existing hex/rgba values remain unchanged.
} as const;

const SPEED_ANCHORS = [
  [3.3, "#ae2e2a"],
  [4.6, "#b84a27"],
  [5.6, "#c16e21"],
  [6.6, "#bf8a2a"],
  [7.8, "#3d8e53"],
  [9.5, "#3a946d"],
] as const;
```

Interpolate numeric RGB channels and serialize as hex or `rgb(...)`; do not
interpolate color strings. Add one shared `scaledMapColor`/network-scale helper
to `maplibre-style.ts` and call it from both the WebGL and SVG network paths so
the two renderers cannot drift. Use fixed light/dark endpoints for the current
riders and lane scales until plan 080 replaces the lens design.

Move the duplicated `baseStyle()` implementation into a single exported
`mapBaseStyle()` in `maplibre-style.ts`. Both maps must consume it.

**Verify**:

```sh
rg -n 'oklch\(' \
  apps/web/src/components/route/maplibre-style.ts \
  apps/web/src/components/route/NetworkMapLibre.tsx \
  apps/web/src/components/route/NetworkMapLibre.map.tsx \
  apps/web/src/components/route/RouteMapLibre.map.tsx
bun test apps/web/test/shared/maplibre-style.test.ts --timeout 5000
```

Expected: `rg` returns no matches and exits 1; tests pass; every
`Color.parse(...)` assertion is defined; `validateStyleMin(mapBaseStyle())`
returns an empty array.

### Step 3: Make initialization failures clean, bounded, and retryable

In `load-maplibre.ts`:

- Reset `loadPromise` when loading rejects.
- Remove a failed `script[data-bp-maplibre]` before allowing a retry.
- Register load/error listeners with `{ once: true }` and remove the opposite
  listener when one fires.
- Export a focused test-only-safe `resetMapLibreLoader()` or equivalent retry
  entry point; it must not delete a successfully loaded global.

In both `.map.tsx` components:

- Distinguish initialization/style failures before `load` from recoverable
  runtime events after the map is ready.
- On fatal failure, detach handlers and call `map.remove()` before rendering
  the fallback. Never leave a detached WebGL instance alive.
- Do not turn an arbitrary post-load source warning into a permanent fallback.
  Preserve a concise diagnostic in development and keep the already-loaded
  map usable.
- Give the fallback a `Retry interactive map` button that remounts the lazy map
  and invokes the loader retry path. The SVG remains visible while degraded.
- If the static route fallback cannot represent an enabled overlay, do not show
  a control that appears to work; render a short `Interactive layers
  unavailable` note instead. Plan 081 will redesign the full control set.

Do not add a DOM test dependency. Extract a small pure lifecycle seam in
`maplibre-runtime.ts`: it accepts a vendor loader/map factory plus `onReady`,
`onFatal`, and `onRecoverableError` callbacks; owns phase tracking, listener
registration, and idempotent cleanup; and returns its cleanup/retry controls.
Both React effects call this seam and only translate `onFatal` into component
fallback state. For `load-maplibre.ts`, inject a minimal window/document/script
adapter into an internal helper so the retry path can be tested with plain
objects under Bun.

Create `maplibre-runtime.test.ts` with those pure seams and a minimal fake
MapLibre map. Cover:

1. rejected vendor load resets and a second call can resolve;
2. fatal pre-load error removes the map exactly once and calls `onFatal`;
3. a post-load recoverable error does not replace the map;
4. unmount detaches every registered handler and removes the map exactly once.

Rendering the visible SVG/retry fallback after `onFatal` is verified in the
mandatory browser step; server rendering cannot execute the effect and is not
an adequate substitute. The lockfile must still change only for the explicit
style-spec dependency.

**Verify**:

```sh
bun test apps/web/test/shared/maplibre-runtime.test.ts --timeout 5000
```

Expected: all four lifecycle cases pass with no unhandled rejection.

### Step 4: Apply bounds, cooperative gestures, and reduced-motion behavior

Add the documented buffered NYC bounds from
`knowledge/wiki/engineering/map_strategy.md:34-41` as a shared constant in
`maplibre-style.ts` and set `maxBounds` on both constructors. Keep the
citywide map's direct pan/zoom interaction, but set `cooperativeGestures: true`
for the embedded route map so a one-finger touch scrolls the route page.

Honor `prefers-reduced-motion`:

- add `motion-reduce:animate-none` to the full-map skeletons;
- set route paint transition durations to zero when the media query matches;
- retain `duration: 0` for initial `fitBounds`.

**Verify**:

```sh
bun --filter @bp/web typecheck
bun run test:web
bun --filter @bp/web build
bun run check:style
```

Expected: all commands exit 0 and the build reports `Bundle within budget.`

### Step 5: Perform the real-browser acceptance check

Run `bun --filter @bp/web dev` and inspect `/map` plus one route's Segments tab
in a WebGL-capable browser. The advisor environment had no browser binary, so
this is a mandatory executor gate, not an optional polish check.

Verify at desktop and a 390px device viewport:

- the WebGL canvas reaches `load` and navigation controls appear;
- lines use the intended red→amber→green/blue ramps rather than default black;
- panning cannot leave the buffered NYC area;
- route-page vertical scrolling works over the embedded map;
- reduced-motion emulation removes pulse and paint transitions;
- forcing the vendor request to fail shows the SVG plus a working retry.

Record the browser/version and the two routes tested in the plan status note.

## Test plan

- Update `maplibre-style.test.ts` to cover fixed colors, interpolated speed
  colors, network scales, and the complete base style through MapLibre's own
  parser.
- Create `maplibre-runtime.test.ts` around the pure loader/lifecycle seams for
  vendor retry, pre/post-load error classification, teardown, listener cleanup,
  and callback state; verify visible fallback/retry in the browser matrix.
- Keep existing `boundsOf` tests and add the shared NYC bounds shape if it is
  exported.
- Run the existing network and route helper suites through `bun run test:web`.
- Manual browser checks are required because the repo has no installed browser
  harness and the bug occurs at the WebGL/style boundary.

## Done criteria

- [ ] MapLibre's `Color.parse` accepts every fixed and generated map color.
- [ ] `validateStyleMin(mapBaseStyle())` returns no issues.
- [ ] `rg -n 'oklch\('` across the four MapLibre-facing source files returns no
      matches; browser CSS tokens may still contain OKLCH.
- [ ] A failed vendor load can be retried without reloading the SPA.
- [ ] Fatal initialization removes the map before fallback; post-load warnings
      do not destroy an otherwise usable map.
- [ ] Both maps are bounded to NYC; the embedded map uses cooperative gestures.
- [ ] Reduced-motion preference disables map pulses/paint transitions.
- [ ] Web typecheck, focused tests, `test:web`, build/budget, and style all pass.
- [ ] Desktop and 390px real-browser checks are recorded.
- [ ] No files outside the in-scope list are modified (`git status`).
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 072 is actively changing `bun.lock`; serialize the two plans rather than
  resolving lockfile conflicts by hand.
- The installed MapLibre version resolves a style-spec major incompatible with
  the catalog version proposed above; report both resolved versions.
- Any generated map color still fails `Color.parse` after one conversion fix.
- A browser error remains after the style validates; capture the first error
  and stack before changing renderer architecture.
- Clean retry requires deleting a successfully loaded `window.maplibregl` or
  mutating global state used by another mounted map.
- The change appears to require a basemap, tile provider, or data-contract
  change; those belong to later plans.

## Maintenance notes

- Keep CSS display colors and MapLibre colors visually paired, but test the
  MapLibre half with its parser whenever the palette changes.
- Reviewers should scrutinize the error classification: `error` is not
  synonymous with `fatal` after `load`.
- Plan 080 replaces per-hover GeoJSON replacement with feature state; plan 079
  owns vendor/artifact performance budgets. Do not pull either broader refactor
  into this repair.
- If MapLibre later adds OKLCH support, do not switch back without retaining the
  parser test and cross-browser visual comparison.

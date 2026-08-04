# Plan 121: Calm the network map — hover never dims, pin outranks pointer, the title band goes sr-only

> **Executor instructions**: Follow this plan step by step; run every
> verification and confirm the expected result. On any STOP condition, stop
> and report. When done, update this plan's status row in `plans/README.md`
> (Generation 21 section).
>
> **Branch base**: audited against `origin/main@e0c00aaf`. Branch off current
> `origin/main` — NOT the stale local `ops/gen18-artifact-publication` tree.
>
> **Reference implementation**: the operator already approved this behavior
> once (2026-07-26) and a working implementation exists as UNCOMMITTED edits
> in the stale local checkout at `/mnt/models/dev/bus-reliability-tracker`
> (dirty files: `apps/web/src/components/route/network-map-model.ts`,
> `NetworkMapLibre.map.tsx`, `NetworkMapControls.tsx`,
> `apps/web/src/studio/pages/network-map.tsx`, plus tests
> `apps/web/test/shared/network-map.test.ts` and `maplibre-runtime.test.ts`).
> If that tree still exists, run
> `git -C /mnt/models/dev/bus-reliability-tracker diff origin/main -- <file>`
> per file and use the hunks as reference — but REIMPLEMENT on top of current
> main rather than applying blindly (main has moved ~122 commits; hunks may
> not apply). If the tree is gone, the target behavior below is the complete
> spec.
>
> **Drift check (run first)**:
> `git fetch origin && git diff --stat e0c00aaf..origin/main -- apps/web/src/components/route/network-map-model.ts apps/web/src/components/route/NetworkMapLibre.map.tsx apps/web/src/components/route/NetworkMapInspector.tsx apps/web/src/studio/pages/network-map.tsx`
> On drift, compare excerpts; unexplained mismatch = STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (independent of 115-120; touches different files)
- **Category**: bug (interaction)
- **Planned at**: commit `e0c00aaf` (origin/main), 2026-08-02

## Why this matters

Moving the mouse across the citywide map strobes the whole canvas. Mechanics
on origin/main, all verified by reading the code:

1. **Dwell-then-dim with a latch**: hovering any route for 160 ms
   (`HOVER_DIM_DELAY_MS`, `network-map-model.ts:489`) drops all ~348 other
   routes from 0.92 to 0.2 opacity across three layers at once
   (`NetworkMapLibre.map.tsx:158-165`). Once engaged, every route crossed
   re-fires the dim instantly with no re-arming delay
   (`network-map-model.ts:526-531`); it releases only when the pointer leaves
   the hit layer entirely — then the canvas flashes back, and re-dims on the
   next route.
2. **Hover outranks the pin**: `resolveNetworkFocusPresentation`
   (`NetworkMapLibre.map.tsx:106-129`) checks `hoveredRouteId` before
   `selectedRouteId`, and a pinned route sets `focusElsewhere = true`
   (`:567-572`), which SKIPS the 160 ms grace — with a pin active the network
   dims on the very first mousemove and the emphasis jumps off the pinned
   route.
3. **A second dim path through the list**: every ranked row fires
   `onPointerEnter → setPointerPreviewRouteId` React state
   (`NetworkMapInspector.tsx:153-156`, `network-map.tsx:241`), and a
   non-null `previewRouteId` maps straight to `mode: "focus"` — full dim
   with NO dwell — while re-rendering all ~350 unvirtualized, un-memoized
   rows per hover.
4. **No transitions**: the only `line-opacity-transition` configured is the
   ghost layer's lens crossfade (`:830, :835`); every dim/undim and every
   feature-state width change (2.2px → 5.5px, `:77-82`) snaps in one frame.

The "hover must not dim" decision was made by the operator on 2026-07-26 but
was never landed, never recorded in knowledge/ or plans/, and exists only in
the stale local tree — the committed Plan 080 text even permits hover
emphasis. This plan lands the behavior on main and records the decision so
it cannot silently revert again.

Separately, the operator has directed (2026-08-02) that the visible
"Network map" title band be removed. The band was sanctioned by Plans
059/080, so this is a recorded supersession, not a regression fix: the h1
becomes `sr-only` (SEO/a11y keep their heading) and the band's contents
(coverage sentence, verified-routes count, Data notes button) relocate into
the map chrome — the reference tree already does exactly this (its
`network-map.tsx` keeps the error-branch h1 at the old spot, makes the main
h1 `sr-only`, and its NetworkMapControls carries the comment "coverage
sentence and Data notes dialog live here now that the title band is
deleted").

**Operator bug sweep additions (2026-08-02).** Four chrome defects join
this plan (same files, same "calm the map" intent):

5. **Single-option toggles.** When facts are absent (the live Plan-115
   regression state: `delayEligible`/`amEligible`/`pmEligible` all false),
   the top-left chrome renders a one-item "Speed" lens toggle and a
   one-item "All day" period toggle (`NetworkMapControls.tsx:129-157`) — a
   tab bar with one tab. A control that offers no choice is noise.
6. **The borough selector is deleted** (operator direction). For the
   record: it IS the lib `ui/select` — the desktop trigger just lacks the
   card-pill styling every neighboring control carries
   (`NetworkMapControls.tsx:170-189` vs the styled mobile one at
   `:224-247`), which is why it reads as foreign chrome. The operator chose
   deletion over restyle; map pan/zoom covers borough focus.
7. **The map note runs its lead and body together** —
   `network-map.tsx:887` renders `<b>{insight.lead}</b> {insight.rest}` as
   one run-on paragraph ("**Color marks slow routes.** 0 run under 7 mph
   and…"), and carries no interaction guidance at all.
8. **The legend can render every band at (0)** — pure noise
   (`LegendStrip`, `network-map.tsx:1086-1115`). Plan 115 owns the data
   fix; the legend still needs an honest degrade for any recurrence.

The single-option and all-zero states are SYMPTOMS of the Plan-115 data
regression; the guards here also improve the healthy state (fewer controls
when there is nothing to control).

## Current state (origin/main excerpts)

`apps/web/src/components/route/NetworkMapLibre.map.tsx:158-165`:

```ts
  const setDimmed = (next: boolean) => {
    if (next === dimmed) return;
    dimmed = next;
    const opacity = next ? FOCUSED_LINE_OPACITY_EXPRESSION : DEFAULT_LINE_OPACITY;
    for (const layerId of [CASING_LAYER, NODATA_LAYER, LINE_LAYER]) {
      map.setPaintProperty(layerId, "line-opacity", opacity);
    }
  };
```

`NetworkMapLibre.map.tsx:116-121` (hover promotes to focus when the latch is
engaged):

```ts
  if (input.hoveredRouteId !== null) {
    return {
      mode: input.hoverDimEngaged ? "focus" : "preview",
      routeId: input.hoveredRouteId,
    };
  }
```

`network-map-model.ts:489`: `export const HOVER_DIM_DELAY_MS = 160;` with the
engaged latch at `:526-531` and `leave()` clearing at `:545-547`; the
still-hovered hysteresis guard at `:521`
(`if (hovered !== null && candidates.includes(hovered)) return;`).

Header band: `apps/web/src/studio/pages/network-map.tsx:775-792` — the
visible `<h1>Network map</h1>` plus coverage sentence
(`Data through ${releaseCoverage}. Local, Limited & SBS.
{completeFactCount}/{n} verified routes.`) and the Data notes ghost button.
The `network === null` error branch at `:729-738` keeps its own h1 — leave
that branch's h1 VISIBLE (it is the whole page in that state).

Hit geometry (context, unchanged): 18px invisible hit layer (`:747-753`),
`mousemove`/`mouseleave` bound to it (`:764-765`), no throttle — hover state
writes are refs + imperative controller (no React state on the canvas path).

## Target behavior (the spec)

1. Pointer hover NEVER dims: `createHoverIntent` loses the delay/latch
   (`HOVER_DIM_DELAY_MS`, `dimEngaged`, the timer, the `focusElsewhere`
   argument all deleted); hover resolves to `preview` unconditionally.
   Keep the `:521` hysteresis guard (it prevents flicker inside the 18px
   buffer).
2. `mode: "focus"` (network dim) has exactly three sources: keyboard/list
   focus (`focusedRouteId`), keyboard-driven list preview (`previewRouteId`
   — see 3), and the durable pin (`selectedRouteId`). Presentation priority:
   pin and keyboard focus outrank pointer hover; pointer hover only ever
   contributes the `active` feature-state (width/color step) on top.
3. List POINTER preview becomes non-dimming: `NetworkMapInspector`'s
   `onPointerEnter/Leave` path routes to the same non-dim `preview`
   treatment as map hover. Keyboard focus (`onFocusPreview` /
   `focusedRouteId`) keeps the dim — it is the accessibility affordance.
   Wrap the ranked row component in `React.memo` so a preview change
   re-renders one row, not ~350.
4. Hover width step shrinks 5.5 → 4 (casing stays `+2.6`).
5. Add `line-opacity-transition: { duration: 200, delay: 0 }` to
   CASING_LAYER, NODATA_LAYER, LINE_LAYER right after layer creation, so the
   remaining legitimate dims (pin engage/release, keyboard focus) ease
   instead of snap. (Feature-state width changes cannot animate in MapLibre —
   that is why the width step must be small.)
6. Title band: main-branch h1 → `className="sr-only"`; move the coverage
   sentence + verified count + Data notes button into `NetworkMapControls`
   (top overlay region); delete the band container. The error-branch h1
   stays visible. `routes/map.tsx` head/title unchanged. The `mapMessage`
   status paragraph (`:793-798`) survives — after Plan 115 it only carries
   real coverage/integrity messages.
7. Record the decision: append a `knowledge/log.md` entry ("hover never
   dims; dim reserved for pin/keyboard focus; title band sr-only — operator
   decisions 2026-07-26/2026-08-02, landed by Plan 121") and update
   `knowledge/index.md` if the map page has an entry. This supersedes Plan
   080's hover-emphasis permission — note it in the log line.
8. **No single-option toggles**: `SingleToggle` renders `null` when
   `options.length < 2` (one guard covers the desktop overlay AND
   `NetworkMapMobileOptions`). The lens toggle disappears when the delay
   lens is ineligible; the period toggle disappears when neither AM nor PM
   is eligible. Both return automatically once Plans 115/116 restore
   eligibility. (The compare toggle always has two options — unaffected.)
9. **Borough selector deleted**, both mounts (desktop `:169-189`, mobile
   sheet `:224-247`): remove the `Select` blocks, the `onBoroughChange`
   prop threading, and the `NETWORK_BOROUGHS` import if this was its last
   consumer. KEEP `?borough=` URL parsing, the feature filter, and
   `fitCollectionKey` — inbound shared links still work; no UI writes the
   param anymore. The DOT-lanes switch keeps its pill container.
10. **Structured map note**: the note (`network-map.tsx:883-899`) renders
    `insight.lead` as a bold line of its own, `insight.rest` as a body line
    below it, and a NEW third muted line `insight.hint` — one standing
    interaction tip per encoding, added to `insightModel`
    (`network-map-model.ts:336`): speed → "Click a route for its numbers;
    pin it to compare." / delay → "Click a route to see its delay
    exposure." / delta → "Click a route to compare peak against all day."
    Promise only interactions that exist (click/pin/find). Dismiss (✕) and
    the italic-"i" restore button are unchanged.
11. **Honest legend degrade**: `legendModel` returns `null` when every
    band count is zero (a legend of "(0) (0) (0) no data (349)" asserts
    nothing); `LegendStrip` therefore does not mount in the facts-absent
    state. With facts present, behavior is unchanged.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Map model tests | `bun test apps/web/test/shared/network-map.test.ts --timeout 10000` | exit 0 |
| Map runtime tests | `bun test apps/web/test/shared/maplibre-runtime.test.ts --timeout 10000` | exit 0 |
| Full web tests | `bun test apps/web/test --timeout 15000` | exit 0 |
| Typecheck | `bun run check:types` | exit 0 |
| Build + budget | `bun --filter @bp/web build` | exit 0 |
| Doctrine/architecture | `bun run check:architecture` | exit 0 |
| Knowledge gate | `bun run check:knowledge` | exit 0 |

## Scope

**In scope**:

- `apps/web/src/components/route/network-map-model.ts`
- `apps/web/src/components/route/NetworkMapLibre.map.tsx`
- `apps/web/src/components/route/NetworkMapInspector.tsx`
- `apps/web/src/components/route/NetworkMapControls.tsx`
- `apps/web/src/studio/pages/network-map.tsx`
- `apps/web/test/shared/network-map.test.ts`,
  `apps/web/test/shared/maplibre-runtime.test.ts`
- `knowledge/log.md` (+ `knowledge/index.md` if it references the map page)

**Out of scope**:

- `RouteMapLibre.map.tsx` (route-detail map) — Plan 122 owns its hover
  hygiene.
- Lens/period logic, legend, popup content, delay-coverage gating.
- `api-client.ts` (Plan 115).

## Git workflow

- Branch off `origin/main`: `codex/121-calm-network-map`
- Commits: (1) hover/dim model + runtime, (2) list preview + memo,
  (3) title band, (4) degenerate-control suppression, (5) borough selector
  removal, (6) map note structure + hint, (7) knowledge entry.
- No push/PR unless the operator instructed it.

## Steps

### Step 1: De-dim pointer hover in the model

Rework `createHoverIntent` (`network-map-model.ts:~480-560`) per target
behavior 1. Delete `HOVER_DIM_DELAY_MS` and the `dimEngaged()` accessor;
simplify `move()` to: resolve candidate (keep the `:521` hysteresis), notify
host on change; `leave()` clears. Update
`resolveNetworkFocusPresentation` + its call sites
(`NetworkMapLibre.map.tsx:106-137, 541-580, 894-900`) so hover maps to
`preview` only, and reorder per target behavior 2.

**Verify**:
`bun test apps/web/test/shared/network-map.test.ts --timeout 10000` → the
two new tests below pass:
- "sweeping across routes swaps the light highlight without dimming" — three
  successive hovers never produce a `focus` call.
- "resting on one route never escalates into a network-wide dim" — no timer,
  no escalation (use fake timers if the old test did).
(If the stale tree exists, its `network-map.test.ts:379,395` and
`maplibre-runtime.test.ts:303` contain ready-made versions — port them.)

### Step 2: Non-dimming list pointer preview + row memo

`NetworkMapInspector.tsx`: pointer enter/leave routes to the non-dim preview
path; keyboard focus unchanged (still dims). Wrap the ranked row component in
`React.memo`. In `network-map.tsx`, thread the distinction (pointer preview
vs keyboard focus) — the state fields already exist
(`pointerPreviewRouteId` vs `focusedPreviewRouteId`, `:241` region); the fix
is in how the presentation resolver consumes them.

**Verify**: `bun test apps/web/test/shared/network-map.test.ts --timeout 10000`
→ new test: pointer preview yields `preview` (no dim), keyboard focus yields
`focus` (dims).

### Step 3: Width step + transitions

`LINE_WIDTH_EXPRESSION` hover width 5.5 → 4; add the 200 ms
`line-opacity-transition` to the three layers at creation
(`NetworkMapLibre.map.tsx` layer-add block around `:640-700`).

**Verify**: `bun test apps/web/test/shared/maplibre-runtime.test.ts --timeout 10000`
→ runtime test asserts the transition paint properties are set on all three
layers (model on how existing runtime tests assert paint properties).

### Step 4: Title band → sr-only + relocation

Per target behavior 6. Keep DOM order sensible: sr-only h1 first in `<main>`.

**Verify**: `bun test apps/web/test --timeout 15000` → exit 0 (update any
test asserting the visible header); then
`rg -n 'text-\[18px\] font-semibold">Network map' apps/web/src/studio/pages/network-map.tsx`
→ exactly ONE match remaining (the `network === null` error branch).

### Step 5: Suppress degenerate controls

Target behaviors 8 and 11. `SingleToggle` returns `null` for
`options.length < 2`; `legendModel` returns `null` for all-zero band
counts. Both are model/component-level so one change covers desktop and
mobile.

**Verify**: `bun test apps/web/test/shared/network-map.test.ts --timeout 10000`
→ new tests: single-option lens/period props render no toggle group;
two-option props render it; all-zero legend model is null; mixed counts
unchanged.

### Step 6: Delete the borough selector

Target behavior 9. Then
`rg -n "NETWORK_BOROUGHS|onBoroughChange" apps/web/src/components/route/NetworkMapControls.tsx`
→ no matches.

**Verify**: full web tests → any control tests updated; a URL test asserts
`?borough=` still filters features and drives `fitCollectionKey` (parsing
survives, only the UI is gone).

### Step 7: Structure the map note

Target behavior 10: lead line, body line, hint line; `insightModel` gains
`hint` with the three per-encoding strings; note markup becomes three
stacked lines (bold 12px / 11px body / 11px muted hint — match existing
note typography scale).

**Verify**: model tests pin `hint` per encoding; note render test asserts
three block lines (no inline `<b>…</b> text` run-on remains at
`network-map.tsx:887`).

### Step 8: Record the decision + full gates

Knowledge entry per target behavior 7 — extend the log line with "borough
selector deleted from map chrome; single-option toggles and all-zero
legend suppressed (operator 2026-08-02)". Then all commands in the table →
0; `git status --porcelain` → in-scope only.

## Test plan

- Ported/new model tests: no-dim sweep, no-escalation dwell, pin-outranks-
  hover (pin set + hover elsewhere → pinned route keeps `focus`; hovered
  route gets only `active`), pointer-vs-keyboard list preview split.
- Runtime tests: three-layer opacity transition present; hover width 4.
- Chrome tests: single-option toggle suppression (lens + period, desktop +
  mobile paths); all-zero legend model null; `?borough=` filters without a
  UI writer; `insightModel().hint` pinned per encoding; note renders three
  stacked lines.
- Existing suites green.

## Done criteria

- [ ] `rg -n "HOVER_DIM_DELAY_MS|dimEngaged" apps/web/src` → no matches
- [ ] All commands exit 0
- [ ] Exactly one visible "Network map" h1 remains (error branch); main h1 is sr-only
- [ ] Coverage sentence + Data notes reachable in the map chrome (cite the new lines in the PR)
- [ ] `rg -n "NETWORK_BOROUGHS|onBoroughChange" apps/web/src/components/route/NetworkMapControls.tsx` → no matches; `?borough=` parsing still tested
- [ ] No toggle group can render with a single option; all-zero legend renders nothing
- [ ] Map note renders lead/body/hint as three lines; `insightModel` hint tested
- [ ] `knowledge/log.md` entry appended; `bun run check:knowledge` exits 0
- [ ] `plans/README.md` gen-21 row updated

## STOP conditions

- The reference tree is gone AND any part of the target spec is ambiguous
  against current main — report the specific gap instead of guessing.
- Keyboard-focus dim cannot be preserved while removing pointer dim (a11y
  regression) — report the coupling.
- A test exists asserting hover MUST dim (would mean a decision conflict) —
  report, do not delete silently.
- Bundle budget or doctrine gates fail.

## Maintenance notes

- The 18px hit layer + `:521` hysteresis are the tuning knobs if dense-area
  hover still feels jumpy; widen hysteresis (short leave-grace before
  clearing) before touching hit width.
- Plan 080's text permitted hover emphasis-with-dim; the knowledge/log entry
  from step 5 is the superseding record. If a future map redesign reads plan
  080, it must read that entry too.
- MapLibre constraint to remember: paint-property VALUE changes animate with
  `*-transition`; feature-state-driven expression outputs do not. Keep hover
  deltas small; never try to animate them via transitions.

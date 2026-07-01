# Plan 004: Add the multi-year segment carpet to "Where & when" from the already-served speed-history endpoint

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 58dfaeb..HEAD -- apps/web/src/components/route/SlowSegments.tsx apps/web/src/studio/api-client.ts apps/web/src/studio/api-contract.ts packages/studio-api/src/studio/read-handlers.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `58dfaeb`, 2026-06-13

## Why this matters

The studio API serves a multi-year, month×segment speed matrix per route
(`GET /api/v1/studio/routes/{slug}/speed-history`, built from the R2 artifact
`studio/v2/routes/{slug}/speed-history.json`) — and the web app **never calls
it** (verified: no `speedHistory` fetch exists in
`apps/web/src/studio/api-client.ts`). Meanwhile the "Where & when" tab — which
the user's 2026-06-12 review said "needs complete redesign" — answers *where*
(corridor profile, segment cards) and *when within a day* (hour bars), but not
*when across years*: you cannot see that a segment got slow in mid-2024 or
that a bus lane visibly changed the corridor. A month×segment carpet heatmap
is the canonical figure for that question, the planning docs already commit to
it ("multi-year carpet" in `knowledge/wiki/engineering/website_surface_data_plan.md`
Where & when section), and the wiki's serving plan
(`serving_snapshot_2_visualization_and_multiyear.md`) was written for exactly
this. This is the highest data-leverage chart in the backlog: zero serving
work, big analytical payoff.

## Current state

- Endpoint (verified, `packages/studio-api/src/studio/read-handlers.ts`):
  - line 63–64: `StudioRouteSpeedHistoryResponse` type +
    `StudioRouteSpeedHistoryResponseSchema` imported/defined for the handler.
  - line 1977–1981: `routeSpeedHistoryArtifactKey(slug)` →
    `studio/v2/routes/{slug}/speed-history.json`;
    `buildStudioRouteSpeedHistoryResponse(...)` follows.
  - Registered as `studio.routeSpeedHistory` / `getStudioRouteSpeedHistory` in
    `packages/studio-api/src/contracts/registry.ts:353-354`.
  - Read the schema definition before coding the client: grep
    `packages/studio-api/src` for `StudioRouteSpeedHistoryResponseSchema` to
    learn the exact cell shape (months axis, segments axis, observation
    counts, missing-cell handling, and the `speedHistoryCoverage` /
    missing-cell caveat mentioned at read-handlers.ts:396-400).
- Web tab today (`apps/web/src/components/route/SlowSegments.tsx`, verified):
  - line 63: `const hourProfile = averageHourlySpeed(route, segments)` — hour
    profile is derived client-side from the detail payload.
  - lines 113–128: layout grid = "Profile" card (`CorridorProfile`) +
    `ChartFrame title="By hour"` with `HourBars`.
  - Below: featured `SlowSegmentCard`s with a direction toggle and
    send-to-brief.
  - `WhereWhenSummaryCards` at line 112 renders the summary from
    `apps/web/src/components/route/where-when-summary.ts` (note: it has a
    `dataAsOf` field — do NOT add any new "data as of" chip UI; that form was
    rejected by the user 2026-06-12).
- Charts convention: heavy chart code lives in a lazy `X.chart.tsx` module
  behind a thin `X.tsx` wrapper (exemplar:
  `apps/web/src/components/TrendOverlay.chart.tsx`). Charts use the native
  shadcn chart component (Recharts v3); **custom marks** are drawn as direct
  children using the v3 hooks `useXAxisScale`/`useYAxisScale`/`usePlotArea`
  (Recharts v3 deprecated `Customized`). A dense month×segment carpet is a
  grid of rects — for this, a plain SVG grid component (no Recharts) is
  acceptable and matches the existing `Heatmap` component
  (`apps/web/src/components/Heatmap.tsx`, already used by ChartFrame
  consumers); prefer extending/reusing `Heatmap` over a new chart lib. No
  visx/Plot/D3 imports (repo decision).
- Loader convention: route detail data loads via TanStack route loaders with
  abort signals and route-specific stale times; per-tab lazy fetches use
  `useEffect` + `AbortController` (exemplar: `useRouteSegmentsGeo` in
  `apps/web/src/components/route/RouteMapSection.tsx:77-105`). The carpet
  fetch must be tab-local like that — speed-history artifacts can be large,
  so never put it in the route's eager loader.

## UI/UX specification (authoritative for Steps 3–4's visuals)

The carpet is an **argument figure**, not a dashboard widget: a reader
should be able to point at it and say "that segment went red in mid-2024."
It must share its visual language with the rest of the route page — the
oklch speed ramp, paper/ink, mono annotations — so the Map tab, the profile
strip, and the carpet read as three views of one dataset.

### Color

Use the canonical continuous speed ramp — six oklch anchors interpolated in
L/C/H, defined in
`knowledge/raw/downloads/design-handoffs/03-canonical/bus-priority-impact-studio/project/geo-data.jsx:20-44`
(3.3 → `oklch(0.50 0.165 27)`, 4.6 → `oklch(0.55 0.150 38)`,
5.6 → `oklch(0.62 0.135 58)`, 6.6 → `oklch(0.67 0.125 78)`,
7.8 → `oklch(0.58 0.120 150)`, 9.5 → `oklch(0.60 0.105 162)`).
If plan 002 has landed, import `speedToColor` from its `maplibre-style.ts`;
otherwise implement it in this plan's helper module with the same name and
note in your report that 002 should de-duplicate. Do NOT use the existing
`Heatmap` component's color logic if it differs — ramp consistency across
the page outranks component reuse (it's fine to render with your own SVG).

### Geometry

- **Grid**: x = months (left → right, oldest → newest), y = segments in
  route order, **north/route-start at top**, matching `CorridorProfile`'s
  orientation so the y-axis reads like the corridor.
- **Cells**: width = `max(10px, available/monthCount)`, height 14px, 1px
  gap both axes (the gap shows `paper`, giving the carpet its woven
  texture; no cell borders). Corner radius 0 — this is a field, not chips.
- **Missing cells** (`null`): `--bp-color-ink-06` fill — visibly "fabric,
  no data", clearly distinct from any ramp color. Never interpolate over a
  hole.
- If `monthCount × 10px` exceeds the container, the grid scrolls
  horizontally **anchored to the newest month** (scroll left for history);
  axis labels scroll with it; the y-axis segment labels stay fixed
  (sticky left column, card background).

### Axes & annotations (all mono, the page's annotation voice)

- **X axis**: a tick + label per January (`'24`, `'25`, `'26` — 9px mono
  ink-40) plus the first and last months as full `YYYY-MM` labels. A 1px
  `ink-20` vertical rule at each year boundary running the grid's full
  height — these year rules are what makes multi-year structure legible.
- **Y axis**: segment cross-street labels (9.5px mono, ink-55), ellipsized
  at ~14ch; terminus rows 700 weight ink (mirroring corridor-geo.jsx:53-58's
  cross-street treatment). If the route has > 28 segments, label every
  other row but render all rows.
- **Legend**, top-right of the frame: the same 8px ramp gradient bar +
  `slow / fast` captions spec'd in plan 003's toolbar legend, plus a
  separate 10×10 `ink-06` swatch labeled `no data` (8.5px mono ink-40).

### Interaction

- **Hover**: the hovered cell gets a 1.5px ink inset ring; its row and
  column headers turn full ink; a crosshair highlight (row + column washed
  with `ink-06`) helps the eye track. Tooltip — positioned above the cell,
  same card style as the map hover cards
  (`rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)]`,
  padding 8×10): line 1 = segment label (11.5px/600), line 2 = mono
  `{YYYY-MM} · {speed} mph` + `· {n} obs` if observation counts exist in
  the payload. Null cell tooltip: `{YYYY-MM} · no published data`.
- **Hover linking**: share the tab's existing `hovered` segment state if
  `SlowSegments.tsx` exposes one — hovering a carpet row SHOULD highlight
  the same segment in `CorridorProfile` above (this is the corridor-geo
  "linked views" principle, corridor-geo.jsx:7). If the existing state
  isn't liftable without refactoring out-of-scope components, skip the
  linking and note it; do not refactor for it.
- **No click action in v1**; cursor stays default. (Click-to-pin a month
  column arrives with treatment-event overlays — see Maintenance notes.)
- **Motion**: none on data (the carpet is static history); hover ring and
  crosshair appear instantly (no transition) — sluggish hover on a dense
  grid feels broken.

### Frame & copy

- Wrap in the tab's standard `ChartFrame` with title
  **"Speed by segment and month"** and a sub line
  "Every segment of the corridor, every month we observe — darker red is
  slower." Source note (ChartFrame's `source` prop if it has one):
  `MTA bus route segment speeds`.
- The unavailable state (endpoint 404/empty): one muted 11.5px line —
  "Multi-year segment history is not published for this route yet." — and
  nothing else. No skeleton-that-never-resolves.
- Loading: a pulse skeleton block at the carpet's expected height
  (`segments × 15px`, clamp 180–420px), idiom copied exactly from
  `RouteMapSection.tsx:140-145`.

### Accessibility

- The SVG gets `role="img"` and an `aria-label` summarizing the figure:
  "Speed by segment and month, {first month} to {last month}, {n} segments."
- Tooltips must also be reachable via keyboard: make the grid one
  focusable element with arrow-key cell navigation ONLY if a precedent
  exists in the codebase; otherwise document the gap in your report rather
  than inventing a bespoke focus system.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web typecheck | `bun --filter @bp/web typecheck` | exit 0 |
| Web build + bundle budget | `bun --filter @bp/web build` | exit 0 |
| API tests (only if api-contract mirror changes) | `bun --filter @bp/studio-api test` | all pass |
| Dev server | `bun --filter @bp/web dev` | /routes/m15-sbs → Where & when |

## Scope

**In scope**:
- `apps/web/src/studio/api-client.ts` (add `fetchRouteSpeedHistory`)
- `apps/web/src/studio/api-contract.ts` (mirror the response type if this
  file is hand-maintained — check for a generated-file header first)
- `apps/web/src/components/route/SlowSegments.tsx` (mount the carpet section)
- `apps/web/src/components/route/SegmentCarpet.tsx` + `SegmentCarpet.chart.tsx`
  (create — lazy pair)
- One unit-test file for the carpet's data-shaping helper

**Out of scope** (do NOT touch):
- `packages/studio-api` server code — the endpoint already exists. (Only
  exception: none. If the endpoint seems broken, that's a STOP condition.)
- Hour×day-of-week matrix — the served payloads carry hour-of-day only, no
  DOW grain; do not fake it. (Deferred until an hourly DOW projection exists.)
- `where-when-summary.ts` and the existing summary cards/hour bars/profile —
  the carpet is additive; the "complete redesign" verdict is satisfied by
  adding the missing time dimension, not by churning working components.
- The Overview tab and `TrendOverlay`.

## Git workflow

- Branch: `advisor/004-where-when-multiyear-carpet` off `main`.
- Commit per step; short imperative messages.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Ramp decision (cheap, do first)

Read `apps/web/src/components/Heatmap.tsx`. If its color logic is NOT the
six-anchor oklch ramp from the UI/UX spec (it almost certainly is not — it
predates the canonical handoff), do not reuse its colors: build the carpet
as your own SVG grid using `speedToColor` (imported from plan 002's
`apps/web/src/components/route/maplibre-style.ts` if it exists; otherwise
implemented in this plan's helper module per the spec's anchor table).
Record which branch you took.

**Verify**: you can state Heatmap's actual color mechanism in one sentence.

### Step 1: API client + contract

Read the server schema (grep as described above), then add
`fetchRouteSpeedHistory(routeId: string, opts: { signal?: AbortSignal })` to
`apps/web/src/studio/api-client.ts`, modeled exactly on
`fetchRouteSegmentsGeo` (same base-path handling, error→null convention if
that's what siblings do — match the file's existing style). Mirror the
response type into `apps/web/src/studio/api-contract.ts` if hand-maintained.

**Verify**: `bun --filter @bp/web typecheck` → exit 0.

### Step 2: Data shaping helper

Create a pure helper (colocate in `SegmentCarpet`-adjacent module, e.g.
`segment-carpet-data.ts`): input = the speed-history response + the detail
payload's `segments` (for labels/order); output =
`{ months: string[], rows: Array<{ segmentId, label, cells: Array<number|null> }> }`
ordered along the route (match the segment order used by `CorridorProfile`).
Null cells = missing months (the artifact has missing-cell coverage;
read-handlers.ts:396-400 proves missing cells are expected). Cap rendering at
the route's real segment count; if months > 40, keep all (carpet scrolls
horizontally) — no silent truncation.

Unit-test it: ordering, null-cell passthrough, empty response → empty rows.

**Verify**: the new test passes via the app's test runner (find existing
`apps/web` unit tests' run command — check root `package.json` `test:web`;
run that filtered to your file) → all pass.

### Step 3: Carpet component (lazy pair)

`SegmentCarpet.chart.tsx`: an SVG grid — x = months, y = segments (route
order, matching CorridorProfile's orientation), cell fill = the same
speed-severity ramp used elsewhere (reuse the existing `Heatmap` color
interpolation if it accepts a domain; else copy its ramp). Null cells render
as the paper background with a faint rule. Hover a cell → title/tooltip with
`{segment label} · {month} · {speed} mph ({n} observations)` if observation
counts exist in the payload. Mark months where the cell speed differs from
the route's current speed only via color — no annotations in v1.
`SegmentCarpet.tsx` is the `React.lazy` wrapper with a height-matched pulse
skeleton (copy the skeleton idiom from `RouteMapSection.tsx:140-145`).

**Verify**: `bun --filter @bp/web typecheck` → exit 0.

### Step 4: Mount in the tab

In `SlowSegments.tsx`, add a full-width "Across the years" ChartFrame section
below the Profile/By-hour grid (line ~129, before the featured segment
cards): a tab-local fetch using the `useRouteSegmentsGeo` pattern
(`useEffect` + `AbortController`, three states loading/ready/unavailable).
`unavailable` → render nothing plus one muted line
"Multi-year segment history is not published for this route yet." (matches
the existing geometry-unavailable copy style at `RouteMapSection.tsx:150-155`).
Section title: use plain language ("Speed by segment and month"), no
judged words.

**Verify**: `bun --filter @bp/web build` → exit 0, bundle budget passes
(carpet module must be lazy).

### Step 5: Manual QA

Dev server → a flagship route (m15-sbs): carpet renders with plausible
month axis (2023→current); a sparse route shows the unavailable line; hover
tooltips show real numbers; direction toggle and existing sections
unaffected. Flag "needs manual QA" in your report if no browser tooling.

## Test plan

- `segment-carpet-data` helper tests (Step 2): ordering, nulls, empty.
- Existing web tests still pass: run the repo's web test script
  (root `package.json` line 88 chains `test:web`; use the underlying command
  filtered if the full chain is heavy).

## Done criteria

- [ ] `grep -n "fetchRouteSpeedHistory" apps/web/src/studio/api-client.ts` matches
- [ ] Where & when renders the carpet for a route with published history; honest fallback otherwise
- [ ] `bun --filter @bp/web typecheck` and `bun --filter @bp/web build` exit 0
- [ ] New helper tests pass
- [ ] No new "data as of" chips (`grep -rn "data as of" apps/web/src` count unchanged)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The speed-history response shape doesn't contain a month×segment matrix you
  can map to the detail payload's segment ids (report the actual schema —
  the spine/cell key may differ; the cell key is known to be non-unique in
  the source data, so if segment joining is ambiguous, stop rather than
  guess).
- Typical payloads exceed ~2MB for flagship routes (check
  `Content-Length` in dev) — report sizes; a server-side thinning projection
  would be needed first and server changes are out of scope.
- `api-contract.ts` is codegen'd and you can't find the generator after one
  search.
- The endpoint 404s for every route you try locally (artifact not in the dev
  R2 fixture) — report which fixtures exist instead of mocking data.

## Maintenance notes

- This carpet is the natural place to later overlay treatment-event markers
  (vertical month rules from the timeline endpoint) — that's the
  "intervention-effect eyeballing" figure; keep the month axis pixel math in
  one exported function so the overlay can align.
- If plan 002/003's daypart ambitions revive, the hour-grain equivalent needs
  a new serving projection first — do not derive DOW client-side.
- Reviewer should scrutinize: lazy boundary (bundle budget), abort handling
  on fast tab switches, and color ramp consistency with the map/segment dots.

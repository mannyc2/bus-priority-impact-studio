# Plan 125: One click surface on the network map — the anchored popup leads; the panel stops shadowing it

> **Executor instructions**: Follow this plan step by step; run every
> verification and confirm the expected result. On any STOP condition, stop
> and report. When done, update this plan's status row in `plans/README.md`
> (Generation 21 section).
>
> **Branch base**: audited against `origin/main@e0c00aaf`. Plan 121 must be
> merged first (same page file; it also changes hover/pin semantics this plan
> builds on). Branch off current `origin/main` after 121 lands.
>
> **Drift check (run first)**:
> `git fetch origin && git diff --stat e0c00aaf..origin/main -- apps/web/src/studio/pages/network-map.tsx apps/web/src/components/route/NetworkMapInspector.tsx`
> Plan 121's edits are expected drift; re-anchor by content. Unexplained
> mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: MED (URL contract + a11y paths must survive)
- **Depends on**: plans/121-calm-network-map-interaction.md
- **Category**: bug (duplicate surface)
- **Planned at**: commit `e0c00aaf` (origin/main), 2026-08-02

## Why this matters

Clicking a route on the desktop map opens TWO surfaces at once: the
map-anchored popup (`NetworkMapPopup`) AND the right rail swaps from the
browse list to a selected-route inspector (`NetworkMapSelected`). They
restate the same route metrics side by side — the exact "same metric as two
styled modules" pattern the no-duplicate-surfaces doctrine bans. Operator
decision (2026-08-02, binding): **the anchored popup is the click surface;
the rail must not auto-swap into a duplicate card.**

The panel is not purely duplicative, so three things it uniquely carries
must survive elsewhere:

1. the selected route's **rank** within the current view,
2. the **segment-evidence list with segment pinning** — the render surface
   for `?segment=` share links and their canonicalization notices,
3. the **mobile sheet / keyboard inspector** role (mobile has no anchored
   popup; the sheet mounts the same component).

## Current state (origin/main excerpts)

`apps/web/src/studio/pages/network-map.tsx:943-978` — the desktop rail swap:

```tsx
{browseOpen || selectedFeature === null ? (
  <NetworkMapBrowse ... />
) : (
  <NetworkMapSelected
    feature={selectedFeature}
    route={selectedRoute}
    view={view}
    rank={selectedRank}
    ...
    evidence={activeEvidence}
    selectedSegmentId={effectiveSearch.segment}
    segmentNotice={segmentNotice}
    ...
    onBack={() => setBrowseOpen(true)}
  />
)}
```

`:740-756` — the popup mounts simultaneously from the same click
(`selectedFeature`/`selectedAnchor` → `NetworkMapPopup`), with hero value,
percentile line, `MapHourStrip`, slowest-window line, `popupStatRows` trio,
studies summary (`:1167-1260+`).

`:983-1041` — the mobile sheet mounts `NetworkMapSelected` as the "route
inspector"; mobile keeps working exactly as today.

Per-route evidence fetch: `selectedRouteEvidenceKey` (`:119`) +
`activeEvidence` (`:758-761`) — fetched on selection; today consumed only by
the panel. Segment link canonicalization notices: `segmentNotice`
(`:720-727`).

## Target behavior

- Desktop click (map OR browse-list pin): popup opens; the rail STAYS on the
  browse list (the pinned row already highlights there — Plan 121 made the
  pin the only dim source). No auto-swap.
- The popup gains one line it lacks: `#${rank} of ${routeCount} in this
  view` (data already computed at `:762-766`). Nothing else moves into the
  popup — it stays a 264px summary with its existing "Route detail" link.
- `NetworkMapSelected` remains mounted in exactly two cases:
  1. mobile sheet (unchanged), and
  2. desktop when `?segment=` is present in the URL — a shared segment link
     still lands on its evidence list with the segment pinned and the
     canonicalization notice intact. Clearing the segment (or the pin)
     returns the rail to browse.
- The evidence fetch (`activeEvidence`) only fires when a surface will
  render it (mobile sheet open, or `?segment=` present) — stop fetching on
  every desktop click.
- Popup close (✕ / Esc / background click) keeps its current clear-pin
  behavior; focus returns per the existing `clearPin(restoreFocus)` logic.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Map tests | `bun test apps/web/test/shared/network-map.test.ts --timeout 10000` | exit 0 |
| Full web tests | `bun test apps/web/test --timeout 15000` | exit 0 |
| Typecheck | `bun run check:types` | exit 0 |
| Build + budget | `bun --filter @bp/web build` | exit 0 |
| Doctrine | `bun run check:architecture` | exit 0 |

## Scope

**In scope**:

- `apps/web/src/studio/pages/network-map.tsx`
- `apps/web/src/components/route/NetworkMapInspector.tsx` (only if the
  browse/selected components live there — locate `NetworkMapBrowse` /
  `NetworkMapSelected` definitions first and confirm)
- `apps/web/test/shared/network-map.test.ts`

**Out of scope**:

- `NetworkMapSelected`'s internal layout — it keeps serving mobile and
  segment links as-is.
- The popup's existing content/anatomy beyond the one added rank line
  (comp-approved; do not redesign).
- `network-map-search.ts` URL contract — `?segment=` semantics unchanged.
- Deleting `NetworkMapSelected` — it has two live roles.

## Git workflow

- Branch off `origin/main` (after 121): `codex/125-single-click-surface`
- Commits: (1) rail behavior + fetch gating, (2) popup rank line, (3) tests.
- No push/PR unless the dispatching operator instructed it.

## Steps

### Step 1: Stop the desktop auto-swap

In `network-map.tsx:943-978`, change the rail condition: render
`NetworkMapSelected` on desktop ONLY when `effectiveSearch.segment` is
present (with a selected feature); otherwise always `NetworkMapBrowse`.
Remove the now-unreachable `onBack`/`browseOpen` plumbing that existed only
to toggle back from the desktop selected card — but first
`rg -n "browseOpen" apps/web/src/studio/pages/network-map.tsx` and keep any
use the mobile flow still needs.

**Verify**: `bun test apps/web/test/shared/network-map.test.ts --timeout 10000`
→ updated tests pass; a new test asserts: pinned route + no segment param →
browse list rendered; pinned route + segment param → selected panel rendered.

### Step 2: Gate the evidence fetch

Make the `activeEvidence` fetch condition match the render condition
(mobile sheet open, or segment param present). Confirm no loading state
leaks into the popup.

**Verify**: new test — desktop pin without segment param does not trigger
the evidence request (assert via the mocked fetch layer, matching how
existing tests stub `api-client`).

### Step 3: Rank line in the popup

Add the rank line to `NetworkMapPopup` under the percentile line:
`#${rank} of ${routeCount}` with the view's label, muted 11px style matching
the percentile line. Null-safe (rank null → no line).

**Verify**: popup render test asserts the rank line for a ranked route and
its absence when rank is null.

### Step 4: Full gates

All commands exit 0; `git status --porcelain` → in-scope only.

## Test plan

- Rail: no-swap on plain pin; swap only with `?segment=`; mobile sheet
  unchanged (existing mobile tests keep passing).
- Evidence fetch gating (step 2).
- Popup rank line (step 3).
- Keyboard: pin via browse list → focus stays in the rail list (no focus
  jump into a swapped panel) — assert whatever the existing a11y tests
  assert for pin interactions.

## Done criteria

- [ ] Desktop click renders exactly ONE new surface (the popup)
- [ ] `?segment=` share links still render the evidence list + notice
- [ ] Mobile sheet flow byte-identical in tests
- [ ] Evidence fetch no longer fires on plain desktop clicks
- [ ] All commands exit 0; `plans/README.md` gen-21 row updated

## STOP conditions

- `?segment=` handling turns out to flow through `NetworkMapSelected` in a
  way that cannot render without the full panel swap — report the coupling
  (do NOT change the URL contract to work around it).
- The mobile sheet shares the `browseOpen` state such that removing the
  desktop toggle breaks mobile mode switching.
- A comp/test asserts the desktop panel must appear on selection (would
  mean a sanctioned-behavior conflict) — report it.

## Maintenance notes

- If a future comp wants richer selected-route content on desktop, it goes
  INTO the popup or behind its "Route detail" link — the rail's selected
  card must not return as a parallel surface (this plan is the recorded
  no-duplicate-surfaces ruling for the map).
- The rank line duplicates nothing (the browse list shows rank ordering,
  not the pinned route's ordinal under the current lens).

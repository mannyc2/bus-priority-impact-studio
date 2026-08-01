# Plan 110: Delete apps/web's unreachable component layer (~3.5K LOC + 41 CSS lines)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Every
> deletion step begins with a grep gate — an unexpected importer is a STOP.
> When done, update the status row in `plans/README.md` (Generation 20 table).
>
> **Drift check (run first)**: `git diff --stat 292d2bd0..HEAD -- apps/web/src apps/web/test apps/web/public package.json tests/harness/production-boundaries.test.ts`
> The gen-18/19 branch modifies several apps/web files — NONE of them are in
> this plan's delete set (verified at planning time). If any file this plan
> deletes shows in that diff, STOP and reconcile first.
>
> **Honesty note carried from the audit**: none of this code ships in the
> production bundle — Rollup already tree-shakes it. Do not claim bundle-size
> wins in the PR; the payoff is maintenance surface, typecheck time, and
> doctrine-lint scope.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: none (coordinate base branch with in-flight gen-19 work)
- **Category**: tech-debt
- **Planned at**: commit `292d2bd0`, 2026-08-01 (dirty tree)

## Why this matters

apps/web (~46K LOC) carries a full shadcn primitive set that was never adopted
(the app builds cards from `SectionCard`, has no dialogs), a May-era dev
design-gallery whose route was deleted, orphaned chart pairs that mimic the
live code-splitting convention, and a fixture test-suite for a surface that
moved to `packages/db`. It all reads as live API to contributors and is walked
by typecheck, Biome, and the design-doctrine gate on every run.

Reachability facts (from the audit's transitive-closure pass, entries =
`src/routes/**`, `src/main.tsx`, `src/worker/index.ts`, `src/routeTree.gen.ts`,
`src/global.css`): 43 files / 3,265 LOC have no live importer; the rest of the
total is dead exports inside live modules and dead CSS tokens.

Two files that look dead but are LIVE — do not touch: `components/CorridorMap.tsx`
(the no-geometry fallback at `OverviewSection.tsx:147`) and
`components/route/RouteGeoMap.tsx` (the non-MapLibre fallback at
`RouteMapLibre.tsx:46-53`); both are correctly listed in the design-doctrine
ratchet (`tests/harness/design-doctrine.test.ts:33-34`), which errors on STALE
entries — so if you deleted them the gate would fail; they stay, and the
allowlist stays untouched.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install` | exit 0 |
| Types | `bun run check:types` | exit 0 |
| Web build | `bun --filter @bp/web build` | exit 0, budgets green |
| Web tests | `bun run test:web` | exit 0 |
| Architecture | `bun run check:architecture` | exit 0 |
| Style | `bun run check:style` | exit 0 |

## Scope

**In scope** (delete or edit only these):
- `apps/web/src/components/ui/`: `dropdown-menu.tsx`, `field.tsx`, `item.tsx`,
  `alert-dialog.tsx`, `dialog.tsx`, `pagination.tsx`, `breadcrumb.tsx`,
  `card.tsx`, `avatar.tsx`, `table.tsx`, `button-group.tsx`, `accordion.tsx`,
  `progress.tsx`, `tooltip.tsx`, `scroll-area.tsx`, `hover-card.tsx`,
  `radio-group.tsx`, `switch.tsx`, `checkbox.tsx`, `spinner.tsx`,
  `separator.tsx`, `label.tsx`, `tabs.tsx` (23 files — tabs only after step 2)
- `apps/web/src/dev/system-gallery.tsx`, `apps/web/src/dev/examples/` (9 files)
- `apps/web/src/fixtures/demo-snippets.ts`, `apps/web/src/fixtures/route-scorecards.ts`
- `apps/web/src/components/{SegmentRow.tsx,TreatmentRow.tsx,LaneGlyph.tsx,DirIndicator.tsx,HourStrip.tsx,InterventionOverlay.tsx,HourExposure.tsx,HourExposure.chart.tsx}`
- `apps/web/src/components/route/MetricColumns.tsx`
- Dead-export edits inside: `apps/web/src/components/route/route-derived.ts`,
  `apps/web/src/studio/{treatment-model.ts,metric-model.ts,page.tsx}`,
  `apps/web/src/lib/recent-routes.ts`, `apps/web/src/components/route/{maplibre-style.ts,section-registry.ts}`,
  `apps/web/src/router-events.ts`, `apps/web/src/global.css`
- `apps/web/test/route-scorecards/` (delete dir), `apps/web/test/README.md`,
  `apps/web/test/shared/section-registry.test.ts` (remove the
  `routeSectionNavigationTarget` cases only)
- `package.json` (the `test:web` script line), `tests/harness/production-boundaries.test.ts`
  (the `fixtures/demo-snippets` guard branch, ~line 78)
- `knowledge/log.md` (append), `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- `apps/web/src/dev/design-review.tsx` and `apps/web/src/dev/screens/` —
  UNTRACKED in-flight gen-19 work sharing the `dev/` directory with the dead
  gallery. Delete only the tracked files named above (`git ls-files` is the
  arbiter).
- `CorridorMap.tsx`, `RouteGeoMap.tsx`, `SectionHeader.tsx`, `ChartFrame.tsx`,
  `ChartFallback.tsx`, `EmptyState.tsx`, `StudioMark.tsx`, `SearchField.tsx`,
  `RouteBadge.tsx`, `HourBars.tsx`, `Spark.tsx` — imported by the demos but
  ALSO by live code; they survive the gallery.
- `tests/harness/design-doctrine.test.ts` — its allowlist is correct as-is.
- Every file modified/untracked on the gen-18/19 branch (`git status`), incl.
  `src/studio/pages/*.tsx`, `api-client.ts`, `network-map-model.ts` — the
  audit found dead exports in some of those too, but they are in-flight; the
  branch owner sweeps them.
- `apps/web/src/components/ui/chart.tsx` and every other ui/ file not listed —
  live (7+ importers).
- Worker code, `wrangler.jsonc`, plan-097 machinery.

## Git workflow

- Branch: `advisor/110-web-dead-code` off landed main.
- One commit per step; message style `apps/web: delete <thing>`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Route-scorecards corpse (64 LOC + script edit)

Gate: `grep -rn "routeScorecardFixtures\|fixtures/route-scorecards" --include="*.ts" --include="*.tsx" apps/web/src apps/web/test | grep -v "route-scorecard.fixtures.test\|src/fixtures/route-scorecards.ts"` → no matches.

Delete `apps/web/src/fixtures/route-scorecards.ts` and the whole
`apps/web/test/route-scorecards/` directory. Edit root `package.json:86` from
`"test:web": "bun test apps/web/test/route-scorecards apps/web/test/shared --timeout 5000"`
to `"test:web": "bun test apps/web/test/shared --timeout 5000"` (verified: the
harness's `requiredRootScripts` pins four OTHER scripts, not `test:web`). Drop
the `route-scorecards/` bullet from `apps/web/test/README.md` (~line 9). The
real scorecard contract remains covered by `packages/db/test/route-scorecard.test.ts`.

**Verify**: `bun run test:web` → exit 0; `bun run check:architecture` → exit 0.

### Step 2: The May-era dev gallery tree (1,019 LOC)

Gate: `grep -rn "SystemGallery\|dev/examples\|demo-snippets" --include="*.ts" --include="*.tsx" apps/web/src apps/web/test | grep -v "src/dev/system-gallery.tsx\|src/dev/examples/"` → no matches.

Delete (all tracked — confirm each with `git ls-files`):
`src/dev/system-gallery.tsx`, all 9 files under `src/dev/examples/`,
`src/fixtures/demo-snippets.ts`, and the five components ONLY the demos used:
`src/components/SegmentRow.tsx`, `src/components/TreatmentRow.tsx`,
`src/components/LaneGlyph.tsx`, `src/components/DirIndicator.tsx`,
`src/components/HourStrip.tsx`. Then remove the now-vacuous
`fixtures/demo-snippets` guard branch in
`tests/harness/production-boundaries.test.ts` (~line 78) — it exists to keep
that fixture out of production imports.

**Verify**: `bun run check:types && bun --filter @bp/web build && bun run check:architecture` → all exit 0; `ls apps/web/src/dev/` → only the untracked `design-review.tsx` and `screens/` remain.

### Step 3: The 22+1 unadopted shadcn primitives (2,028 LOC)

Gate (run for EACH file before deleting): `grep -rn "ui/<basename>" --include="*.ts" --include="*.tsx" apps/web/src apps/web/test | grep -v "src/components/ui/"` → no matches. (`separator` and `label` will show importers `item.tsx`/`field.tsx`/`button-group.tsx` — those are in the delete set themselves; `tabs` was freed by step 2.)

Delete the 23 files listed in Scope under `components/ui/`.

**Verify**: `bun run check:types && bun --filter @bp/web build` → exit 0.

### Step 4: Orphan components + metric model (~306 LOC)

Gate: `grep -rn "InterventionOverlay\|MetricColumns\|HourExposure\|ROUTE_METRICS" --include="*.ts" --include="*.tsx" apps/web/src apps/web/test | grep -v "components/InterventionOverlay.tsx\|components/route/MetricColumns.tsx\|components/HourExposure\|studio/metric-model.ts"` → no matches.

Delete `InterventionOverlay.tsx`, `route/MetricColumns.tsx`,
`HourExposure.tsx`, `HourExposure.chart.tsx`. Shrink
`src/studio/metric-model.ts` to just the `MetricTone` type (its one live
consumer is `reliability-summary.ts:2`), or inline the type there and delete
the module — either way, `ROUTE_METRICS` and `RouteMetric` go.

**Verify**: `bun run check:types && bun --filter @bp/web build` → exit 0.

### Step 5: Dead exports inside live modules (~120 LOC)

For each, gate with an exact-identifier grep across `apps/web` excluding the
defining file, then delete: `route-derived.ts` — `dossierSpeedSeries`,
`routeHistorySpeedSeries`, `routeHistoryRidershipSeries`, `routeHistoryWindow`,
`averageHourlySeverity` (drop imports they alone justified);
`treatment-model.ts` — `countTreatmentStates` and `legacyToTreatments` (its
last importer, `TreatmentRow.tsx`, died in step 2; `TREATMENT_META`,
`groupTreatments`, `TREATMENT_FAMILIES`, `TREATMENT_STATE_META` are LIVE and
stay); `recent-routes.ts` — the `useRecentRoutes` hook (keep
`pushRecentRoute`); `page.tsx` — `toneForMetric`; `maplibre-style.ts` —
`speedTier`; `section-registry.ts` — `routeSectionNavigationTarget` plus its
test cases in `apps/web/test/shared/section-registry.test.ts` (~lines 297-304);
`router-events.ts` — `NAVIGATION_RESOLVED_EVENT` and its dispatch (nothing
listens for it).

**Verify**: `bun run check:types && bun run test:web && bun --filter @bp/web build` → all exit 0.

### Step 6: The 36 fictional design tokens (41 CSS lines)

In `apps/web/src/global.css` (tokens live in a plain `:root` block, NOT inside
`@theme`, so Tailwind generates no utilities from them — usage can only be
`var(--bp-…)`): delete the spacing scale (`--bp-space-2xs`…`--bp-space-4xl`,
lines ~66-74), the radius scale EXCEPT `--bp-radius-md` (~77-84), the shadows
EXCEPT `--bp-shadow-lg` (~87-90), both layout tokens (`--bp-page-inline`,
`--bp-section-block`, ~93-94), and the semantic-alias block
`--bp-color-background-raised`…`--bp-color-white` (~45-59) EXCEPT
`--bp-color-background` and `--bp-color-foreground` (used by global.css itself
at ~147, 153-154). Gate each deleted name:
`grep -rn -- "--bp-<name>" apps/web/src` → only the definition line.

**Verify**: `bun --filter @bp/web build` → exit 0; then a MANUAL visual pass —
run `bun run dev`, open `/`, `/routes`, one route page, `/map`,
`/interventions`, confirm no layout/spacing regressions (token deletion is
invisible to typecheck; this eyeball check is the real gate). Record in the PR
that the pass was done and on which pages.

### Step 7: Full gate + bookkeeping

`bun run check:types && bun run test:web && bun --filter @bp/web build && bun run check:architecture && bun run check:style` → all exit 0. Append a dated
`knowledge/log.md` entry; set this plan's README row DONE.

## Test plan

No new tests. Deleted tests (`route-scorecard.fixtures.test.ts`, the
`routeSectionNavigationTarget` cases) covered only deleted code. Regression
net: `test:web` + build + typecheck at every step, plus the step-6 visual pass.

## Done criteria

- [ ] All files in Scope deleted/edited; nothing outside it modified (`git status --porcelain`)
- [ ] `apps/web/src/dev/` contains only the untracked in-flight harness
- [ ] `bun run check:types`, `test:web`, `@bp/web build`, `check:architecture`, `check:style` all exit 0
- [ ] `grep -rn "ui/card\|ui/dialog\|ui/table\|SystemGallery" apps/web/src` → no matches
- [ ] Step-6 visual pass recorded in the PR description
- [ ] `plans/README.md` row updated; `knowledge/log.md` entry appended

## STOP conditions

- Any gate grep returns an importer the plan says should not exist.
- The design-doctrine gate reports a stale allowlist entry after your changes
  (means you deleted CorridorMap or RouteGeoMap — restore them).
- `git ls-files` shows any `src/dev/` target as UNTRACKED (you are about to
  delete in-flight work — stop).
- The step-6 visual pass shows any spacing/appearance change.

## Maintenance notes

- Re-adding a shadcn primitive later is one `shadcn add` command; deletion now
  loses nothing.
- The audit deliberately left dead exports inside the gen-18/19 in-flight
  files (`studio/pages/interventions.tsx` has 7 zero-reference exports;
  `api-client.ts` has `fetchRouteSegmentsGeo` and
  `fetchStudioInterventionCorpus` caller-free; `network-map-model.ts` has 3
  unused constants; `route-detail.tsx` has an unused `RouteDetailLoadingPage`)
  — hand this list to whoever lands that branch rather than sweeping here.
- Two 0-LOC-today items are recorded so nobody "rediscovers" them: the
  plan-097 recovery module (3,673 LOC incl. tests) is LIVE production serving
  until plan 098 lands — its deletion belongs on plan 098's checklist; and
  `TreatmentsHistorySection` (623 LOC) is what actually serves route history
  in production today — the gen-18 `PublicRouteHistory` replaces it only when
  the new artifact key can serve and the `?study=`/`?record=` deep links move
  over.

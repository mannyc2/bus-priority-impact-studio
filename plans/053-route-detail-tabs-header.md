# Plan 053: Route detail becomes a real tabbed page with a compact, self-evident header

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (Generation 6 table).
>
> **Drift check (run first)**: Written against a DIRTY working tree at
> commit `ce3baca`, 2026-07-06. Compare the "Current state" excerpts against
> the live files; on mismatch, STOP. Requires 048-050 landed; 049 is a HARD
> dependency (RouteBadge/BoroughBadge/SectionCard).

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED-HIGH (restructures the product's core page; mitigated by
  keeping all section CONTENT unchanged — this plan moves structure only)
- **Depends on**: 049 (hard), 048, 050
- **Category**: direction (product/UX)
- **Planned at**: commit `ce3baca` (dirty tree), 2026-07-06

## Why this matters

Operator verdict 2026-07-06 on the route detail page:

- "The route tabs don't seem to even be tabs … you can hardly tell you went
  from slow segment section to route map section. I think it's preferable
  to just have actual tabs rather than a single page." Today the "tabs" are
  anchor links in a sticky bar that smooth-scroll one long page
  (`RouteDetailShell.tsx:30-64`).
- The header metrics "are too large … takes up a ton of viewport" (five
  30px-mono stats, ~140px tall, `RoutePublicKpiStrip.tsx`), click-to-scroll
  should go ("I'm not really a fan of clicking it"), and the stats aren't
  self-evident ("I have no idea what a '100% of route' is, or 'trend',
  what trend? Why do we arbitrarily have some stat that ACE is active?").
- The badge is broken for long names ("M86 SBS-SBS" clipped) and
  "Manhattan route" is kicker slop — "we should have some special
  component" for boroughs (BoroughBadge, plan 049).
- "The route right now" lede is "absolutely ugly … completely useless"
  (`RouteVerdictLede.tsx`), and — verified — the page HAS no overview
  section: `OverviewSection.tsx` (266 LOC) has ZERO importers; the
  "Overview" anchor just scrolls to the header.

This plan converts the page to four real tabs (Overview / Slow segments /
Riders & reliability / Treatments & history), rebuilds the header compact
and self-evident, deletes the verdict lede + KPI strip, and moves the
"Evidence & data notes" section into an always-present "About this data"
collapsible. Section CONTENT is moved, not redesigned — plans 054-057
redesign each tab's interior. Tab state lives in the URL (`?tab=`), so
views are shareable and the capability-manifest gating keeps working.

## Current state

- `apps/web/src/studio/pages/route-detail.tsx` (210 LOC) — orchestrates:
  `RPubHeader` (identity) + `RoutePublicKpiStrip` (5 stats, click-to-scroll
  via `navigateToSection`, lines 43-48) in the shell header; then
  `RouteVerdictLede` + `RouteInsightList` (lines 92-99); then sections via
  `section(value, render)` (lines 58-70) in order: `where-when` →
  `map` → `reliability` → `riders` → `treatments` → `evidence`. Data comes
  fully loaded from the route loader (`data: StudioRouteDetailResponse`,
  `evidence: StudioRouteEvidenceBundle | null`) — tabs need NO new fetches.
- `apps/web/src/components/route/RouteDetailShell.tsx` (87 LOC) — header +
  sticky anchor nav (`<a href="#route-section-…">`) + content well. Nav
  badges: per-section notice counts + honest-empty labels
  ("Checked"/"Building"/"Thin"/"Blocked").
- `apps/web/src/components/route/section-registry.ts` (212 LOC) — 7
  sections with capability gating: `sectionPresentation()` returns
  `render | empty | hidden` per section from
  `StudioRouteCapability.surfaces`; `routeSectionRegistry()` builds
  visible/hidden lists + badges. `overview` and `evidence` are
  unconditional (`SECTION_CONFIG`, lines 58-69). KEEP all of this — tabs
  compose it.
- `apps/web/src/components/route/RoutePublicAtoms.tsx` — `RPubHeader`
  (lines 64-95: inline badge fixed in plan 049; `{route.borough} route`
  kicker at line 80-82; termini + interpunct facts line at 86-89),
  `RPubBigStat` (97-156), `routePublicLede` (24-62). `RPubSlowCard` and
  `RPubInterventionCard` in the same file are used by later plans — do not
  touch them.
- `apps/web/src/components/route/RoutePublicKpiStrip.tsx` (137 LOC) —
  Speed / Trend / Excess wait / Riders / "Bus lane {n}% of route" with
  "ACE since {year}" sub; every tile `onClick` scrolls. DELETE.
- `apps/web/src/components/route/RouteVerdictLede.tsx` (14 LOC) — "The
  route right now". DELETE.
- `apps/web/src/components/route/OverviewSection.tsx` — dead (zero
  importers). Plan 054 rebuilds the Overview tab; this plan renders
  `RouteInsightList` as the interim Overview content.
- `apps/web/src/routes/routes/$routeId.tsx` — route file (lazy page
  import; loader fetches detail + evidence). Tab search param goes here.
- `apps/web/src/components/ui/tabs.tsx` — Base UI tabs:
  `Tabs, TabsList, TabsTrigger, TabsContent` (controlled via
  `value`/`onValueChange`).
- Tests that pin today's structure:
  `apps/web/test/shared/route-detail-shell.test.ts` (anchor hrefs, sticky
  nav, badge visibility, retired question-titles),
  `apps/web/test/shared/route-public-kpi-strip.test.ts` (dies with the
  component), `apps/web/test/shared/section-registry.test.ts`,
  `apps/web/test/shared/route-public-atoms.test.ts`.
- Data available for header stats (all real, never fabricated):
  `dossier?.speed.current ?? route.weightedAvgSpeed` (mph),
  `dossier?.speed.movement6mPct ?? route.movement6mPct` (%, nullable),
  `dossier?.speed.dataAsOf` ("YYYY-MM", nullable), `route.dailyRiders`
  (0 = unmeasured), `route.termini.north/south`, `route.miles` (nullable),
  `route.stops`, `route.borough`, `route.sbs`, `route.label`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun --filter @bp/web typecheck` | exit 0 |
| Web tests | `bun run test:web` | all pass |
| Doctrine | `bun run check:design-doctrine` | exit 0 |
| Build + budget | `bun --filter @bp/web build` | "Bundle within budget." |
| Style | `bun run check:style` | exit 0 |
| Dev server | `bun --filter @bp/web dev` | `/routes/m15-sbs` tabs work |

## Scope

**In scope**:
- EDIT `apps/web/src/components/route/section-registry.ts` (add tab layer)
- REWRITE `apps/web/src/components/route/RouteDetailShell.tsx`
- CREATE `apps/web/src/components/route/RouteDetailHeader.tsx`
- EDIT `apps/web/src/studio/pages/route-detail.tsx`
- EDIT `apps/web/src/routes/routes/$routeId.tsx` (validateSearch + tab plumbing)
- DELETE `RoutePublicKpiStrip.tsx`, `RouteVerdictLede.tsx`,
  `apps/web/test/shared/route-public-kpi-strip.test.ts`
- EDIT `apps/web/src/components/route/RoutePublicAtoms.tsx` (remove
  `RPubHeader` + `RPubBigStat` + `routePublicLede` ONLY if unused after the
  rewrite — see step 4)
- EDIT tests: `route-detail-shell.test.ts`, `section-registry.test.ts`,
  `route-public-atoms.test.ts`; CREATE `route-detail-header.test.ts`
- EDIT `tests/harness/design-doctrine.test.ts` (allowlist: remove
  `RouteVerdictLede.tsx`; remove `RoutePublicAtoms.tsx` from the KICKER
  list only if its last kicker was `RPubHeader`'s — the `RPubSlowCard`
  interpunct entry stays until plan 055)
- `plans/README.md` (status row)

**Out of scope**:
- Interior redesign of any section (SlowSegments, RouteMapSection,
  RidersSection, ReliabilitySection, TreatmentsHistorySection,
  DataNotesSection render AS-IS inside their tabs) — plans 054-057.
- `OverviewSection.tsx` — leave the dead file; plan 054 replaces it.
- Loader/data contract changes — none needed.

## Git workflow

- Branch: `codex/053-route-detail-tabs-header`
- Commits: (1) registry tab layer + tests, (2) shell/header/page rewrite,
  (3) deletions + test updates. Do NOT push or open a PR unless the
  operator instructed it.

## Steps

### Step 1: Add the tab layer to `section-registry.ts`

Append (keep everything existing):

```ts
export type RouteDetailTabValue = "overview" | "segments" | "riders" | "history";

export const ROUTE_DETAIL_TABS = [
  { value: "overview", label: "Overview", sections: ["overview"] },
  { value: "segments", label: "Slow segments", sections: ["where-when", "map"] },
  { value: "riders", label: "Riders & reliability", sections: ["riders", "reliability"] },
  { value: "history", label: "Treatments & history", sections: ["treatments"] },
] as const satisfies readonly {
  value: RouteDetailTabValue;
  label: string;
  sections: readonly RouteDetailSectionValue[];
}[];
```

Plus:
- `tabPresentation(registry, tab)`: mode is the BEST of the member
  sections' presentations (any `render` → render; else any `empty` → empty
  with that state; else hidden). `evidence` belongs to NO tab (it becomes
  the About-this-data collapsible; its presentation stays unconditional).
- `routeTabRegistry(capability, sectionBadges)`: returns
  `{ sectionRegistry, visibleTabs, presentations }` where a tab's badge =
  sum of its member sections' badge counts (severity = max). `overview` is
  always visible.
- `routeTabForSection(section): RouteDetailTabValue | null` — maps a
  section to its owning tab (`evidence` → null); used to convert the
  existing `onNavigate(section)` callbacks into tab switches.

**Verify**: extend `apps/web/test/shared/section-registry.test.ts` with tab
cases (see Test plan) → `bun run test:web` passes.

### Step 2: Rewrite `RouteDetailShell` as a tab shell

New API:

```tsx
RouteDetailShell({
  header,            // ReactNode
  tabs,              // visibleTabs from routeTabRegistry
  activeTab,         // RouteDetailTabValue
  onTabChange,       // (tab: RouteDetailTabValue) => void
  aboutData,         // ReactNode | null — the collapsible, rendered under the panel
  children,          // the ACTIVE tab's panel content
})
```

- Keep the outer scroll container (`h-full min-h-0 overflow-auto`) and a
  NON-sticky header block (plan 033's decision: header scrolls away).
- Tab bar: sticky `top-0 z-10`, card background, bottom hairline. Use
  `Tabs`/`TabsList`/`TabsTrigger` from `@/components/ui/tabs` controlled by
  `activeTab`/`onTabChange`; render `children` in ONE panel below (the page
  provides the active tab's content — do not mount all four `TabsContent`
  panels; unmounted tabs must not fetch or render). If Base UI `Tabs`
  cannot render under `renderToStaticMarkup` (test blows up on context or
  effects), FALL BACK to plain markup: `role="tablist"` div with
  `role="tab"`-`aria-selected` buttons — visual parity, zero deps; note the
  fallback in the status row.
- Active trigger style: `font-semibold text-[var(--bp-color-ink)]` with a
  2px MTA-blue underline (`shadow-[inset_0_-2px_0_var(--bp-color-accent)]`);
  inactive: `text-[var(--bp-color-ink-55)]`. Keep the honest-empty badges
  ("Building"/"Thin"/"Blocked"/"Checked") and notice-count badges on
  triggers, reusing the existing `emptyStateLabel`/`emptyStateVariant`
  helpers (`RouteDetailShell.tsx:70-87`).
- Below `children`, render `aboutData` inside a `Collapsible`
  (`@/components/ui/collapsible`) with a quiet full-width trigger:
  `About this data` + chevron, 12.5px muted — collapsed by default.

**Verify**: `bun --filter @bp/web typecheck` → exit 0.

### Step 3: Build `RouteDetailHeader`

Create `apps/web/src/components/route/RouteDetailHeader.tsx`:

```tsx
// [RouteBadge xl] [name + termini + borough]                [3 compact stats]
<header className="bg-[var(--bp-color-card)] px-7 py-5 shadow-[inset_0_-1px_0_var(--bp-color-rule)] max-md:px-4">
  <div className="flex flex-wrap items-start gap-5">
    <RouteBadge route={route.label} sbs={route.sbs} size="xl" />
    <div className="min-w-0 flex-1">
      <h1 className="m-0 text-[24px] font-semibold leading-[1.1] tracking-[-0.02em] max-md:text-[20px]">
        {route.corridorFull || route.corridor}
      </h1>
      <div className="mt-1 text-[13px] text-[var(--bp-color-ink-55)]">
        {route.termini.north} → {route.termini.south}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[var(--bp-color-ink-55)]">
        <BoroughBadge borough={route.borough} />
        <span>{routeFactsSentence(route)}</span>  {/* "8.9 miles, 42 stops" — commas, no interpunct */}
      </div>
    </div>
    <div className="flex shrink-0 items-start gap-6 max-md:w-full max-md:justify-start">
      <HeaderStat label="Avg speed" value={speedLabel} sub={speedMonthLabel} tone={speedTone} />
      <HeaderStat label="6-mo change" value={movementLabel} sub="vs 6 months ago" tone={movementTone} />
      <HeaderStat label="Riders" value={ridersLabel} sub="per weekday" />
    </div>
  </div>
</header>
```

`HeaderStat`: label 10.5px semibold muted (sentence case, NOT uppercase-
tracked — the kicker pattern is banned), value 20px mono semibold
tabular-nums, sub 11px muted. NOT clickable. Value derivations (from
"Current state" data facts): speed `X.X mph` or `—` when ≤0; month sub =
`dataAsOf` "2026-05" formatted `May 2026`, else `observed average`;
movement `+X.X%`/`−X.X%` (tone good/bad) or `—` with sub `not enough
history` when null; riders via `formatCompact` or `—` with sub
`not yet measured` when 0. Reuse `formatCompact` from
`@/components/route/route-derived`.

**Verify**: new `route-detail-header.test.ts` (see Test plan) passes.

### Step 4: Rewire `route-detail.tsx` + the route file

1. `$routeId.tsx`: add
   `validateSearch: (s) => ({ ...(isTab(s.tab) ? { tab: s.tab } : {}) })`
   where `isTab` checks `"segments" | "riders" | "history"` (overview =
   no param). Pass `tab` into the page via `Route.useSearch()`.
2. `route-detail.tsx`:
   - Build `routeTabRegistry(data.capability, routeSectionBadges(data.insights))`.
   - Active tab: the search param, downgraded to `"overview"` when the
     param names a hidden tab.
   - `onTabChange`: `navigate({ to: ".", params, search: (prev) => ({ ...prev, tab: v === "overview" ? undefined : v }), replace: true })`
     (TanStack `useNavigate`; keep `viewTransition` off for tab switches).
   - Replace `navigateToSection` (scroll) with
     `navigateToTab(routeTabForSection(section))` and pass it to the
     components that take `onNavigate` (`RouteInsightList`,
     `DataNotesSection`) — signature unchanged, behavior = switch tab.
   - Render per active tab, content unchanged: overview →
     `RouteInsightList` (interim, until plan 054); segments →
     `SlowSegmentsSection` then `RouteMapSection` (both exactly as today,
     honest-empty wrappers preserved via the section registry
     presentations); riders → `RidersSection` then `ReliabilitySection`;
     history → `TreatmentsHistorySection`. Keep the `section(value,
     render)` honest-empty wrapper helper, minus the anchor ids.
   - `aboutData` = the existing `<DataNotesSection …/>` (unchanged
     interior).
   - Header = `<RouteDetailHeader route={route} dossier={data.dossier} />`.
   - DELETE the `RouteVerdictLede` + lede plumbing and the KPI strip.
3. Delete `RoutePublicKpiStrip.tsx`, `RouteVerdictLede.tsx`, and their
   imports. In `RoutePublicAtoms.tsx`, delete `RPubHeader` and
   `RPubBigStat` (now importerless — verify with
   `rg -n "RPubHeader|RPubBigStat" apps/web/src`); KEEP `routePublicLede`
   only if plan 054 hasn't landed (it is the Overview summary's likely
   input — leave it exported with a `// consumed by plan 054` comment if
   unused, or delete if you also execute 054).
4. Update `RouteDetailLoadingPage` (in `route-detail.tsx`): skeleton =
   compact header (badge block + title line + 3 small stats) + 4 tab
   triggers + one panel block. Delete the 5-KPI skeleton grid.

**Verify**: `bun --filter @bp/web typecheck` → exit 0. Dev server on
`/routes/m15-sbs`: four tabs render; `?tab=history` deep-link opens
History; switching tabs updates the URL without full reload; a sparse
route (any non-flagship slug from the local corpus) shows honest-empty
badges on gated tabs.

### Step 5: Doctrine ratchet + full gate

Remove `components/route/RouteVerdictLede.tsx` (deleted) from the plan-050
allowlists; remove `RoutePublicAtoms.tsx` from the KICKER allowlist (its
kicker was `RPubHeader`'s "{borough} route"); RoutePublicAtoms REMAINS in
the interpunct allowlist (`RPubSlowCard`'s `&middot;`, plan 055's job).

**Verify**:
`bun run check:design-doctrine && bun --filter @bp/web typecheck && bun run test:web && bun --filter @bp/web build && bun run check:style`
→ all pass, build in budget (structure moved, nothing new eager — the
deleted KPI strip/lede shrink the route chunk).

## Test plan

Model all on `renderToStaticMarkup` + `toContain`:

- `section-registry.test.ts` (extend): with the existing `rich`/`clean`/
  `sparse` capability fixtures — rich → 4 visible tabs; clean (treatment
  `not_applicable`) → history tab hidden; sparse (`speedHistory: building`,
  `reliability+ridership: insufficient_data`, `treatment: blocked`) →
  segments tab EMPTY (building wins over map-ready? map surface is `ready`
  in that fixture — assert segments tab mode `render` because map renders;
  adjust fixture expectations to the best-of rule), riders tab hidden
  (reliability has hiddenStates for insufficient_data; ridership
  insufficient → empty → riders tab EMPTY not hidden — encode the exact
  best-of outcomes for all three fixtures). Also: `routeTabForSection`
  mapping; `evidence` → null.
- `route-detail-shell.test.ts` (rewrite): renders 4 tab triggers for rich;
  hides History for clean; active tab content renders; `aboutData`
  collapsible trigger text "About this data" present; badges render on
  triggers; the retired anchor hrefs (`#route-section-…`) are GONE.
- `route-detail-header.test.ts` (new): full-data route renders `6.3 mph`
  `May 2026`-style sub, movement with sign, riders compact; null-movement
  route renders `—` + "not enough history"; zero-riders renders `—` + "not
  yet measured"; contains `M15-SBS` roundel text and `Manhattan`
  BoroughBadge text; does NOT contain "route" kicker text ("Manhattan
  route") or `·`.
- `route-public-atoms.test.ts` (adjust): drop RPubHeader assertions; keep
  RPubSlowCard/RPubInterventionCard coverage.

**Verification**: `bun run test:web` → all pass.

## Done criteria

- [ ] `/routes/$routeId?tab=…` deep-links work; unknown/hidden tab falls
      back to Overview (dev-server check)
- [ ] `rg -ln "RoutePublicKpiStrip|RouteVerdictLede" apps/web/src` → 0 files
- [ ] `rg -n "The route right now|% of route|ACE active" apps/web/src/components/route` → 0 matches
- [ ] `rg -n "route-section-" apps/web/src/components/route/RouteDetailShell.tsx` → 0 matches (anchor nav gone)
- [ ] All commands in step 5 exit 0; bundle in budget
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `route-detail.tsx` or `RouteDetailShell.tsx` don't match the excerpts
  (lines cited above) — parallel edit landed; re-baseline.
- Base UI `Tabs` breaks `renderToStaticMarkup` AND the plain-markup
  fallback still fails tests — report the render error verbatim.
- The capability best-of rule produces a surprising outcome for a real
  route (e.g. a tab visibly empty that previously rendered content) — list
  the route + surface states and stop; do not invent a new gating rule.
- You find yourself editing `SlowSegments.tsx`, `RidersSection.tsx`,
  `ReliabilitySection.tsx`, or `TreatmentsHistorySection.tsx` beyond import
  paths — that's 054-057 scope; stop.

## Maintenance notes

- Plans 054-057 own tab interiors; each must keep the tab-visibility
  contract (`routeTabRegistry`) untouched or extend its tests.
- The `?tab=` values are now public URL surface — renaming a tab value is
  a breaking link change; add a fallback if ever renamed.
- SEO: tab panels are client-side conditional rendering of ONE document —
  no SEO manifest change needed (single canonical URL per route).
- Deferred: per-tab lazy `React.lazy` code-splitting of section modules
  (charts/maps are already lazy at the component level; measure before
  adding another split layer).

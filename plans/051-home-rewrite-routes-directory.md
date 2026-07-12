# Plan 051: Rewrite the homepage (neutral, search-first) and move the full index to a new /routes directory page

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (Generation 6 table).
>
> **Drift check (run first)**: Written against a DIRTY working tree at
> commit `ce3baca`, 2026-07-06. Compare the "Current state" excerpts against
> the live files; on mismatch, STOP. Requires plans 048 (tokens), 049
> (primitives), 050 (doctrine check) landed.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED (rewrites the front door; loader change; new route)
- **Depends on**: 048, 049, 050
- **Category**: direction (product/UX)
- **Planned at**: commit `ce3baca` (dirty tree), 2026-07-06

## Why this matters

Operator verdict 2026-07-06 on the homepage: "I pretty much dislike the
entire homepage." Specifics, all verified in code:

- The hero editorializes against the agency ("We track every bus route in
  New York that should be moving faster than it is", `home.tsx:487`) — the
  operator is applying for MTA roles and wants neutral, factual framing.
- "route feed generated Jul 5, 2026" renders twice (`home.tsx:511, 389`);
  "users do not care."
- "In focus this month" (`home.tsx:582-607`) is three HARDCODED editorial
  cards with static mph numbers (`FEATURED`, lines 162-201) — vestigial
  from the deleted findings product; "delete it entirely now."
- The full ~381-row route table renders unpaginated on the homepage
  (`home.tsx:610-764`) — "it takes 30 seconds to scroll to the bottom."
- "How to use this site" (persona cards, lines 766-773) and "How we know
  this" (dark trust strip, lines 356-395) are "useless filler."
- The tagline "Bus Priority Impact Studio · A civic data project" renders
  in the hero eyebrow (line 484) and again in the footer (line 783).
- The borough stat is an interpunct chain (line 577) while its three
  sibling stats use natural language.

The fix: a short, neutral, search-first homepage (hero + topline stats +
top-15 route preview), and a new `/routes` directory page that hosts the
existing grouped/filterable index (which is good code — it just doesn't
belong unbounded on the front door). This combination is the operator's
"some combination" option.

## Current state

- `apps/web/src/studio/pages/home.tsx` (824 LOC) — structure:
  - lines 27-73: tone maps, `boroughStripe` record, `formatRiders`,
    `formatDate`, `trendStatus` helpers
  - lines 79-115 `BigStat` (62px mono stat with natural-language label+sub — KEEP, it's the pattern the operator likes)
  - lines 117-146 local `SectionHeader` with REQUIRED `kicker` prop (the eyebrow pattern — DELETE)
  - lines 148-281 `FEATURED` data + `FeaturedCard`/`FeaturedStat` (DELETE)
  - lines 283-354 `RoleCard`/`HomeRoleCards` persona cards (DELETE)
  - lines 356-409 `HomeTrustStrip` + `TrustLink` (DELETE — also the only
    consumer of `sourceGroupCount`)
  - lines 415-789 `HomePage` (hero 479-545, topline 547-580, in-focus
    582-607, full index 610-764, how-to 766-773, trust strip 775-779,
    footer 782-786)
  - lines 791-823 `HomeLoadingPage` skeleton
- `apps/web/src/routes/index.tsx` — home route; loader fetches BOTH
  `fetchStudioRoutes` AND `fetchStudioMethods` (methods only feeds
  `sourceGroupCount` for the trust strip). `head:` sets the meta description
  "Track every NYC bus route the city's speed-up program has touched…"
  (editorial — replace).
- `apps/web/src/studio/home-route-index.ts` (79 LOC) — pure helpers
  `orderRoutesForIndex` (ridership sort), `filterRoutesForIndex`
  (borough+token filter), `groupRoutesForIndex` (borough groups),
  `ROUTE_INDEX_BOROUGHS`. Reuse as-is on the new page.
- NO `/routes` index route exists: `apps/web/src/routes/routes/` contains
  only `$routeId.tsx`. Its lazy-import pattern (the route file
  `React.lazy`s the page module) is the pattern to copy so the directory
  page stays out of the entry chunk:

  ```tsx
  const RouteDetailPage = lazy(() =>
    import("../../studio/pages/route-detail.js").then((module) => ({
      default: module.RouteDetailPage,
    })),
  );
  ```

- `apps/web/src/studio/seo.ts` — `PUBLIC_STUDIO_ROUTES` (lines 20-26; add
  `/routes`) and `getStudioSeoMetadata` per-path blocks (add a `/routes`
  block). `tools/pipeline-v2/src/checks/check-web-seo.ts` imports
  `PUBLIC_STUDIO_ROUTES` and loops it (line 22) — adding the entry
  automatically extends the SEO check.
- `apps/web/src/worker/spa.ts:18` — SPA shell path regex
  `/^\/(?:interventions|map|methods)\/?$/`; the new top-level `/routes`
  path must be added: `/^\/(?:interventions|map|methods|routes)\/?$/`.
- `tests/harness/design-doctrine.test.ts` (from plan 050) — `home.tsx` sits
  in all three allowlists; this plan must remove it (the stale-entry guard
  enforces it).
- Primitives available (plan 049): `SectionCard`, `SourceNote`,
  `BoroughBadge`, `boroughColor` in `apps/web/src/lib/borough.ts`,
  hardened `RouteBadge`.
- Memory/doctrine constraint: the citywide topline numbers ("88", "11.4M",
  borough mph) are DELIBERATELY static editorial copy — do not make them
  data-driven (recorded product decision). `routeCount` stays live.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun --filter @bp/web typecheck` | exit 0 |
| Web tests | `bun run test:web` | all pass |
| Doctrine check | `bun run check:design-doctrine` | exit 0 |
| Build + budget | `bun --filter @bp/web build` | "Bundle within budget." |
| SEO check (needs build) | `bun run check:web-seo` | exit 0 |
| Style | `bun run check:style` | exit 0 |
| Dev server | `bun --filter @bp/web dev` | serves `/` and `/routes` |

## Scope

**In scope**:
- REWRITE `apps/web/src/studio/pages/home.tsx`
- CREATE `apps/web/src/studio/pages/routes-directory.tsx`
- CREATE `apps/web/src/routes/routes/index.tsx` (the `/routes` file route)
- EDIT `apps/web/src/routes/index.tsx` (loader + head)
- EDIT `apps/web/src/studio/seo.ts` (add `/routes`)
- EDIT `apps/web/src/worker/spa.ts` (path regex)
- EDIT `tests/harness/design-doctrine.test.ts` (remove `home.tsx` from allowlists)
- CREATE `apps/web/test/shared/routes-directory.test.ts`
- `plans/README.md` (status row)

**Out of scope**:
- `apps/web/src/studio/shell.tsx` nav (048 restyled it; the "Routes" nav
  item already points at `/` — see step 4 for the one label decision).
- Deleting `/methods` or `fetchStudioMethods` — plan 052 owns that; this
  plan merely stops CALLING it from the home loader and drops home's
  `/methods` links (they die with the deleted sections).
- `SearchAutocomplete` internals — consume as-is.
- Route detail pages (plans 053-057).

## Git workflow

- Branch: `codex/051-home-rewrite-routes-directory`
- Commits: one for the `/routes` page, one for the home rewrite is a clean
  split. Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the `/routes` directory page

Create `apps/web/src/studio/pages/routes-directory.tsx` exporting
`RoutesDirectoryPage({ routes })` and `RoutesDirectoryLoadingPage()`. MOVE
(cut, don't copy) from `home.tsx`: the borough-filter + text-filter +
grouped-table implementation (current lines 610-764), the `trendStatus`
helper (68-73), `formatRiders` (54-56), and the mobile row variant. Changes
while moving:

- Page header: plain `<h1>` "All routes" (26px/semibold — no kicker), one
  sub line: "Grouped by borough, sorted by daily riders." plus the live
  "Showing X of N routes" count (this is functional state, not slop).
- Borough group headers: replace the inline dot+`boroughStripe` markup with
  `BoroughBadge` from plan 049; delete the local `boroughStripe` record and
  import `boroughColor`/`BOROUGH_COLOR` from `@/lib/borough` if a raw color
  is still needed for the row accent.
- The two mobile interpunct separators (`<span aria-hidden>·</span>`,
  old lines 705/707): replace with `<span aria-hidden>,</span>`-free
  natural phrasing — render the mobile meta line as
  `{speed} mph · …` → `` `${speed} mph, ${status}, ${riders} riders/day` ``
  as ONE template string with commas.
- Initial filters come from URL search params `q` and `borough` (see step
  2); filter state changes do NOT need to write back to the URL (keep it
  simple; note it as a nice-to-have).
- Keep `filterRoutesForIndex`/`groupRoutesForIndex`/`orderRoutesForIndex`
  from `home-route-index.ts` unchanged.

Create `apps/web/src/routes/routes/index.tsx` following the `$routeId.tsx`
lazy pattern exactly (lazy page import + `Suspense`), with:

```tsx
loader: ({ abortController }) => fetchStudioRoutes({ signal: abortController.signal }),
staleTime: staticStudioLoaderStaleTimeMs,
validateSearch: (search: Record<string, unknown>) => ({
  ...(typeof search.q === "string" && search.q ? { q: search.q } : {}),
  ...(typeof search.borough === "string" && search.borough ? { borough: search.borough } : {}),
}),
head: () => routeHead("Routes", "Browse every NYC bus route in the index — grouped by borough, sorted by daily riders, filterable by route, corridor, or borough."),
```

**Verify**: `bun --filter @bp/web typecheck` → exit 0;
`bun --filter @bp/web dev` → GET `/routes` returns the directory (HTTP 200
and visible table with fixture/seeded data).

### Step 2: Rewrite `home.tsx`

Target ≈350 LOC. Keep exports `HomePage`, `HomeLoadingPage` (same names —
`routes/index.tsx` imports both). Delete `HomeRoleCards`, `HomeTrustStrip`
(and their atoms), `FEATURED`/`FeaturedCard`/`FeaturedStat`, the local
`SectionHeader`. New structure:

1. **Hero** (white card section, two-column grid as today, minus eyebrow
   and timestamp):
   - `<h1>` (52px scale kept): `Speed and reliability for every NYC bus route.`
   - One paragraph: `Bus Priority Impact Studio tracks monthly speeds, slow
     segments, ridership, and documented street treatments for
     {routeCount} routes — built from public MTA and NYC DOT data.`
     (This names the site once — the ONLY brand statement on the page —
     and credits the data neutrally.)
   - Buttons: primary `Link to="/routes"` → `Browse all {routeCount}
     routes →`; secondary `Link to="/interventions"` → `Browse
     interventions`. NO `route feed generated` span.
   - Right rail "Find a route" card stays (search + top-5 `RouteBadge`
     chips), but its label div drops the uppercase-tracking styling — use
     the SectionCard title style (15px semibold, sentence case).
   - `SearchAutocomplete.onSubmitQuery`: navigate to the directory instead
     of scrolling: `navigate({ to: "/routes", search: { q: query } })`.
     `onSelect` unchanged (route detail).
2. **Topline** (`The system today` as a plain 26px heading, no kicker, no
   sub): the four `BigStat`s kept verbatim EXCEPT the fourth's sub becomes
   natural language: `Manhattan averages 6.4, Brooklyn 6.6, Queens 7.2, and
   Staten Island 9.8 mph.` Numbers stay static by design.
3. **Route preview** (`Find your route` heading, no kicker): the top 15 by
   ridership (`orderRoutesForIndex(routes).slice(0, 15)`) rendered with the
   same row markup as the directory (import the row component from
   `routes-directory.tsx` — export a `RouteIndexRow` from there to share),
   flat (no borough groups), followed by a full-width quiet button:
   `View all {routeCount} routes →` → `/routes`.
4. **Footer** (one line, no interpunct, no tagline): `Built from public MTA
   and NYC DOT data. Code and data are open —` + GitHub link
   (`https://github.com/mannyc2/bus-priority-impact-studio`).

Update `HomeLoadingPage` to skeleton the new structure (hero + 4 stats +
~6 preview rows; delete the removed sections' skeletons).

Update `apps/web/src/routes/index.tsx`:
- loader: `fetchStudioRoutes` only (drop `fetchStudioMethods` import/call
  and the `sourceGroupCount` plumbing; `HomePage` loses the
  `sourceGroupCount` and `generatedAt` props — `generatedAt` has no
  remaining consumer once the timestamps are gone).
- `head:` description → the hero paragraph's neutral phrasing (e.g. "Speed
  and reliability for every NYC bus route — monthly speeds, slow segments,
  ridership, and documented street treatments from public MTA and NYC DOT
  data.").

**Verify**: `bun --filter @bp/web typecheck` → exit 0;
`rg -n "civic data project|feed generated|In focus|How we know|How to use this site|RoleCard|TrustStrip|FEATURED" apps/web/src/studio/pages/home.tsx`
→ 0 matches; `rg -n "·" apps/web/src/studio/pages/home.tsx` → 0 matches;
`rg -n "fetchStudioMethods" apps/web/src/routes/index.tsx` → 0 matches.

### Step 3: SEO + SPA shell wiring

1. `apps/web/src/studio/seo.ts`: add to `PUBLIC_STUDIO_ROUTES`:
   `{ path: "/routes", label: "All routes", expectedTitleText: "Routes" }`;
   add a `pathname === "/routes"` block in `getStudioSeoMetadata` BEFORE the
   `/routes/:slug` regex match (order matters — the regex
   `/^\/routes\/([^/]+)$/` does not match bare `/routes`, but place the
   exact-match block first anyway for clarity), returning title "Routes"
   and the step-1 description.
2. `apps/web/src/worker/spa.ts:18`: extend the regex to
   `/^\/(?:interventions|map|methods|routes)\/?$/`.

**Verify**: `bun --filter @bp/web build && bun run check:web-seo` → exit 0
(the check now visits `/routes` via `PUBLIC_STUDIO_ROUTES`).

### Step 4: Nav label

In `shell.tsx` `navItems` the first item is `{ to: "/", label: "Routes" }`
with an active-state that also matches `/routes/*`. With a real `/routes`
page this is ambiguous. Change the first item to
`{ to: "/", label: "Home" }` and add `{ to: "/routes", label: "Routes" }`
immediately after; update `StudioNavLink`'s active logic so `/` matches
only `pathname === "/"` and `/routes` matches `pathname === "/routes" ||
pathname.startsWith("/routes/")`.

**Verify**: `bun --filter @bp/web typecheck` → exit 0; dev-server: `/`
highlights Home; `/routes` and `/routes/m15-sbs` highlight Routes.

### Step 5: Doctrine ratchet

Remove `studio/pages/home.tsx` from all three `ALLOWLIST` arrays in
`tests/harness/design-doctrine.test.ts`.

**Verify**: `bun run check:design-doctrine` → exit 0 (fails with a
stale-entry message if step 2 left any banned pattern; fix home.tsx, not
the allowlist).

### Step 6: Full gate

**Verify**: `bun --filter @bp/web typecheck && bun run test:web && bun --filter @bp/web build && bun run check:web-seo && bun run check:style && bun run check:design-doctrine`
→ all pass; build stays within budget (home shrinks by ~400 LOC and the
directory page is lazy — entry should not grow; if entry grows >2 KB,
check that `routes-directory.tsx` is NOT imported eagerly from
`routes/routes/index.tsx` — the loader/head must not import any VALUE from
the page module, that leaks it into the entry chunk).

## Test plan

New `apps/web/test/shared/routes-directory.test.ts`, modeled on
`route-detail-shell.test.ts` (renderToStaticMarkup + toContain), with a
small `StudioRoute[]` fixture (3 routes across 2 boroughs; reuse field
shapes from `apps/web/test/shared/route-public-kpi-strip.test.ts`'s route
fixture):

- Renders one group header per borough present (assert `BoroughBadge` text
  "Manhattan", "Brooklyn").
- `filterRoutesForIndex` already covered? No existing test — add pure-fn
  cases here: borough filter narrows; token filter matches corridor text;
  empty query returns all.
- The `q` initial-filter path: render `RoutesDirectoryPage` with an
  `initialQuery` prop (however step 1 wired search params → props) and
  assert the filtered route's label renders while the excluded one doesn't.
- Home: extend/adjust any failing existing tests; assert the new home
  renders WITHOUT the banned strings (one test: rendered HomePage HTML does
  not contain "civic data project" / "generated" / "·").

**Verification**: `bun run test:web` → all pass including the new file.

## Done criteria

- [ ] `/routes` serves the full grouped/filterable directory; `/` shows a
      15-row preview + link (verified in dev server)
- [ ] `rg -n "·|civic data project|feed generated" apps/web/src/studio/pages/home.tsx apps/web/src/studio/pages/routes-directory.tsx` → 0 matches
- [ ] `rg -n "fetchStudioMethods" apps/web/src/routes/index.tsx apps/web/src/studio/pages/home.tsx` → 0 matches
- [ ] `bun run check:design-doctrine` exit 0 with `home.tsx` out of all allowlists
- [ ] `bun --filter @bp/web typecheck`, `bun run test:web`,
      `bun --filter @bp/web build` (in budget), `bun run check:web-seo`,
      `bun run check:style` all exit 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `home.tsx` no longer matches the "Current state" line map (lines
  480-786) — a parallel edit landed; re-baseline before rewriting.
- The bundle-budget check fails on entry size after step 6's eager-import
  check — report the chunk analysis, do not raise the budget.
- `check:web-seo` fails for a route OTHER than `/routes` — unrelated
  drift; report it.
- You need to edit `SearchAutocomplete.tsx` for the submit-navigation —
  its `onSubmitQuery` prop already exists (used at `home.tsx:525`); if the
  prop is missing, STOP (the component drifted).

## Maintenance notes

- The static topline numbers (88 routes slower, 11.4M rider-hours, borough
  mph) are editorial constants by decision; when the underlying facts drift
  too far, the operator updates the copy — do not wire them to the API in
  review.
- `RouteIndexRow` is now shared between home preview and `/routes`; if the
  row grows columns, verify both surfaces.
- Deferred nice-to-have: write directory filter state back to the URL for
  shareable filtered views.
- Plan 052 deletes `/methods` next — home no longer references it after
  this plan, so 052's scope is clean.

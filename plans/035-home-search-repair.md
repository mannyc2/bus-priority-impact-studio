# Plan 035: Routes home + search repairs — editorial voice, usable free-text search, mobile directory, a11y, dead code

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat ce3baca..HEAD -- apps/web/src/studio/pages/home.tsx apps/web/src/components/SearchAutocomplete.tsx apps/web/src/components/SearchField.tsx apps/web/src/components/RouteBadge.tsx apps/web/src/components`
> Plan 032 edits `home.tsx` first — that drift is expected; re-locate via the
> excerpts. Any OTHER structural mismatch with "Current state" is a STOP
> condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW-MED (copy, layout, and a11y changes on the homepage; one deletion step)
- **Depends on**: plans/032-honest-route-card.md (the directory trend chips become real there; this plan builds on that state)
- **Category**: tech-debt (UX) / bug (a11y, mobile)
- **Planned at**: commit `ce3baca`, 2026-07-04

## Why this matters

The homepage is the product's front door and mostly matches the July design's
editorial structure (hero → citywide stats → featured route stories → grouped
directory → trust strip). The audit found a set of small, verified divergences
that together make it feel rougher than it is: featured-card CTAs break the
editorial voice, free-text search dead-ends (Enter does nothing unless you
pick an autocomplete suggestion), the 381-row directory loses its column
meanings entirely on mobile (`max-md:hidden` header with no fallback), the
borough filter is invisible to screen readers, and four dead component files
(including two competing `RouteHeader`s) confuse every future edit. Each fix
is small and independently verifiable; none is a redesign.

## Current state

### Files

- `apps/web/src/studio/pages/home.tsx` (800 lines) — the homepage: hero with
  `SearchAutocomplete` (~:510-535), featured route cards (~:257-261), route
  directory with borough chips + `SearchField` filter + grouped table
  (~:605-720).
- `apps/web/src/studio/home-route-index.ts` — `filterRoutesForIndex`,
  `groupRoutesForIndex`, `orderRoutesForIndex` helpers (tested in
  `apps/web/test/shared/home-route-index.test.ts`).
- `apps/web/src/components/SearchAutocomplete.tsx` — hero autocomplete
  (dropdown-pick only today).
- Dead files (verified zero importers at `ce3baca`):
  `apps/web/src/components/DotGlyph.tsx`,
  `apps/web/src/components/RouteHeader.tsx`,
  `apps/web/src/components/route/RouteHeader.tsx`,
  `apps/web/src/components/route/RouteIdentity.tsx` (imported ONLY by the dead
  `route/RouteHeader.tsx`). NOTE: `MetricColumns.tsx` is NOT dead
  (`RouteMetricStrip.tsx` imports it) — do not delete it.

### Key excerpts (as of `ce3baca`)

`home.tsx:259` — featured-card CTA (design `home-public.jsx:148-149` says
"Read the full story →"):

```tsx
            Open route profile →
```

`home.tsx:613-629` — borough filter buttons with visual-only selection state:

```tsx
              {boroughs.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBorough(b)}
                  className="cursor-pointer rounded-[3px] px-3 py-1.5 text-[12px] font-semibold transition-colors"
                  style={ borough === b ? { background: "var(--bp-color-ink)", ... } : { ... } }
                >
                  {b}
                </button>
              ))}
```

`home.tsx:647` — the directory column header row is simply hidden on mobile:

```tsx
          <div className="grid grid-cols-[90px_1fr_90px_110px_120px_90px_16px] ... max-md:hidden">
```

`home.tsx:634-641` — the directory `SearchField` sits in a separate grid row
below the section header, while the design (`home-public.jsx:425-436`) places
filter controls together in the section header's right rail.

### Decided constraints (do not violate)

- "/" is the public home; the static citywide numbers are DELIBERATELY static.
- The gen-3 cutover deleted the findings/briefs/search SURFACES — do not
  create a `/search` route or "findings" links in this plan (reviving a
  dedicated search-results page per `search-results.jsx` is a direction
  decision recorded for the operator in `plans/README.md`).
- The merged SBS roundel in `RouteBadge.tsx:44-48` is documented-deliberate
  ("no separate SBS pill, and never doubled") — do NOT change it.
- Honest data: the trend chips derive from `movement6mPct` after plan 032 —
  keep that; never reintroduce spark-derived status.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web types | `bun --filter @bp/web typecheck` | exit 0 |
| Shared web tests | `bun run test:web` | exit 0 |
| Build + budget | `bun --filter @bp/web build` | exit 0 |
| Style | `bun run check:style` | exit 0 |
| Dev server | `bun run dev` | serves the app |

## Scope

**In scope**:

- `apps/web/src/studio/pages/home.tsx`
- `apps/web/src/components/SearchAutocomplete.tsx` (submit handler only)
- Deletions: `apps/web/src/components/DotGlyph.tsx`,
  `apps/web/src/components/RouteHeader.tsx`,
  `apps/web/src/components/route/RouteHeader.tsx`,
  `apps/web/src/components/route/RouteIdentity.tsx`
- A11y touch-ups in exactly: `apps/web/src/components/route/RouteMapSection.tsx:362`,
  `apps/web/src/components/route/DataNotesSection.tsx:446`,
  `apps/web/src/components/route/RoutePublicAtoms.tsx:142` (icon-only buttons)
- `apps/web/test/shared/home-route-index.test.ts` and any test asserting the
  changed copy/markup

**Out of scope** (do NOT touch):

- `RouteBadge.tsx` (deliberate merged roundel), `MetricColumns.tsx` (live).
- Creating a `/search` route or shell nav changes.
- The static hero copy/citywide numbers.
- `interventions.tsx` filter model (evidence-status filters are a defensible
  product choice; treatment-type filtering is a recorded direction option).
- Regrouping the directory away from boroughs (geographic grouping stays;
  the status column is real data after plan 032).

## Git workflow

- Branch: `codex/035-home-search-repair` from `origin/main` (after 032).
- Commit per step; short imperative subjects.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Editorial CTA voice on featured cards

`home.tsx:259`: change `Open route profile →` to `Read the full story →`
(design `home-public.jsx:148-149`). Leave the "Browse interventions" button
(`home.tsx:~500`) AS IS — the design's "Read this month's findings" label
targets a surface the product deleted; do not reintroduce findings language.

**Verify**: `grep -n "Read the full story" apps/web/src/studio/pages/home.tsx`
→ 1 match; `bun run test:web` → exit 0 (update any copy assertion).

### Step 2: Make free-text search land somewhere

In the hero, pressing Enter with a non-empty query that matches no
autocomplete suggestion currently does nothing. Wire it to the directory
filter that already exists:

- Give `SearchAutocomplete` an optional `onSubmitQuery?: (query: string) => void`
  invoked on Enter when no suggestion is highlighted (do not change the
  existing pick behavior).
- In `home.tsx`, pass a handler that sets the directory's `routeFilter` state
  to the query and scrolls to the directory section
  (`document.getElementById(...)?.scrollIntoView({ behavior: "smooth" })` — give
  the directory section a stable id, e.g. `route-directory`).

**Verify**: `bun --filter @bp/web typecheck` → exit 0; manual: type "flatbush"
in the hero, press Enter → page scrolls to the directory filtered to matching
routes, "Showing N of 381 routes" reflects the filter.

### Step 3: Directory columns must mean something on mobile

Replace the `max-md:hidden`-only treatment (`home.tsx:647`): on `max-md`,
render each route row as a compact two-line card — line 1: badge + corridor;
line 2: inline labeled values (`6.6 mph · Improving · 12.3K riders/day`),
reusing the row's existing data and the trend chip. Implementation approach:
keep the desktop grid classes, add a `max-md:` variant layout inside the same
row component (conditional classes, not a second component tree). The column
header row stays `max-md:hidden` (the inline labels replace it).

**Verify**: `bun run test:web` → exit 0; manual at 375px: rows readable, no
horizontal overflow, filter still works.

### Step 4: Move the directory filter into the section header rail

Per design `home-public.jsx:425-436`, the borough chips and the text filter
belong together: move the `SearchField` block (`home.tsx:634-641`) into the
same `right` slot as the borough chips, stacked (`flex-col gap-2`,
`max-md:` full-width). Keep the "Showing N of M routes" line adjacent to the
table (left-aligned above it).

**Verify**: `bun --filter @bp/web typecheck` → exit 0; manual: desktop shows
chips + filter in the header right rail; mobile stacks them full-width.

### Step 5: A11y pass on the verified misses

- Borough chips (`home.tsx:613-629`): add `aria-pressed={borough === b}` and
  `aria-label={b === "All boroughs" ? "Show all boroughs" : `Filter to ${b}`}`
  (adjust the exact "all" literal to `ROUTE_INDEX_ALL_BOROUGHS`).
- Icon-only buttons at `RouteMapSection.tsx:362`, `DataNotesSection.tsx:446`,
  `RoutePublicAtoms.tsx:142`: add descriptive `aria-label`s (read each
  button's onClick to name the action truthfully).
- The trend chip cell: after plan 032 it is text ("Improving"/"Declining"),
  which is screen-reader-safe — no change needed; just confirm it is not
  icon-only.

**Verify**: `grep -n "aria-pressed" apps/web/src/studio/pages/home.tsx` → ≥1
match; `bun run test:web` → exit 0.

### Step 6: Delete the dead components

Delete `DotGlyph.tsx`, `components/RouteHeader.tsx`,
`components/route/RouteHeader.tsx`, `components/route/RouteIdentity.tsx`.
BEFORE deleting, re-verify zero importers (the codebase may have drifted):

```
grep -rn "DotGlyph\|RouteHeader\|RouteIdentity" apps/web/src --include="*.tsx" --include="*.ts" | grep -v "components/RouteHeader.tsx\|components/route/RouteHeader.tsx\|RouteIdentity.tsx\|DotGlyph.tsx"
```

Expected: no matches (MetricColumns hits are fine — it stays). If any importer
appears, STOP for that file and report.

**Verify**: `bun --filter @bp/web typecheck` → exit 0;
`bun --filter @bp/web build` → exit 0.

### Step 7: Visual gate + full gates

Manual at desktop + 375px: hero search submit path, directory (header rail,
mobile cards, filter), featured-card CTA. Screenshots per repo practice.

**Verify**: `bun run test:web`, `bun run test:worker`,
`bun --filter @bp/web build`, `bun run check:style` → all exit 0.

## Test plan

- Update: copy assertions touching "Open route profile"; any DOM assertions on
  the directory header/filter placement in `home-route-index.test.ts`-adjacent
  suites.
- New: one test for `SearchAutocomplete`'s `onSubmitQuery` (Enter with free
  text calls the handler; Enter on a highlighted suggestion does NOT), modeled
  on the existing SearchAutocomplete/route tests under `apps/web/test/shared/`.
- Must stay green: everything else in `bun run test:web`.

## Done criteria

- [ ] `grep -rn "Open route profile" apps/web/src` → no matches
- [ ] `ls apps/web/src/components/DotGlyph.tsx apps/web/src/components/RouteHeader.tsx apps/web/src/components/route/RouteHeader.tsx apps/web/src/components/route/RouteIdentity.tsx 2>&1` → all four report "No such file"
- [ ] `grep -n "aria-pressed" apps/web/src/studio/pages/home.tsx` → ≥1 match
- [ ] All commands in "Commands you will need" exit 0
- [ ] Step 7 manual checks recorded with screenshots
- [ ] `git status` clean outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 032 has not landed (the trend-chip step assumes real `movement6mPct`).
- The dead-component grep in Step 6 finds an importer.
- The mobile card variant (Step 3) requires restructuring `home.tsx` beyond
  the directory row markup (e.g., extracting the whole table) — report
  instead; that is the monolith-decomposition follow-up, not this plan.
- Any change would add a `/search` route, findings/briefs language, or a
  second SBS pill.

## Maintenance notes

- Direction options recorded for the operator (not planned): a dedicated
  `/search` results page per `search-results.jsx`; an analyst triage home per
  `route-first.jsx`; treatment-type filters on `/interventions` per
  `interventions-refactor.jsx`. All three are product-scope calls that gen-3
  explicitly cut — revive only by explicit decision.
- `home.tsx` is 800 lines; if a future plan touches the directory again,
  extract it to `components/home/RouteDirectory.tsx` first (monolith note in
  the audit ledger).
- The design-pass status doc's audit-priority list names the dead
  `RouteHeader.tsx` — after this plan deletes it, the operator should refresh
  that wiki page (knowledge edits are outside this plan's scope).

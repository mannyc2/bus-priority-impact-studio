# Plan 058: Interventions page — a bounded, filterable network chronicle instead of a flat record dump

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (Generation 6 table).
>
> **Drift check (run first)**: Written against a DIRTY working tree at
> commit `ce3baca`, 2026-07-06. Compare the "Current state" excerpts against
> the live files; on mismatch, STOP. HARD dependencies: 049 (SourceNote),
> 057 (row pattern precedent + CitationChips already gone). 052 recommended
> first (it deletes methods, StudioHero's other consumer).

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW-MED (single-page rewrite; data assembly kept)
- **Depends on**: 049 + 057 (hard); 052 recommended
- **Category**: direction (product/UX)
- **Planned at**: commit `ce3baca` (dirty tree), 2026-07-06

## Why this matters

Operator, 2026-07-06: "Interventions page: Also slop. Completely useless in
its current state. Citations block are (unboundedly) ugly as I've
complained previously."

Verified: the page flattens FIVE record types (serving interventions, wiki
timeline events, wiki treatments, wiki projects, wiki source gaps) from
every route into ONE unbounded list (`interventions.tsx:98-106` renders
`filteredRows.map(...)` with no limit — ~200+ heterogeneous rows), fronted
by four meta-stat tiles ("Routes with records" etc.) and rendered through
the same `RPubInterventionCard` year-badge/citation-wall card the operator
rejected on the route page. Undated wiki records fabricate their "year"
label from other fields — `wikiProjectRow` literally sets
`year: project.status ?? "undated"`, so a STATUS string renders where a
date belongs.

Post-057, route pages own per-route history. This page's distinct job is
the CROSS-ROUTE chronicle: what changed on the network, when, with filters
that answer real questions (borough, evaluated, upcoming). Bounded lists,
plain dates, SourceNote citations.

## Current state

- `apps/web/src/routes/interventions.tsx` (22 LOC) — loader fetches
  `fetchStudioRoutes` + `fetchStudioInterventionsEvidence` (non-blocking
  evidence, degrades to `[]`); KEEP as-is.
- `apps/web/src/studio/pages/interventions.tsx` (374 LOC):
  - Lines 61-73: `StudioHero label="Interventions" title="What changed on
    the street, and what happened next." …` + 4 `InterventionStat` tiles
    (Routes with records / Interventions / Evaluated / Future).
  - Lines 75-107: "Timeline" `SectionHeader` + 4 filter buttons
    (All/Evaluated/Future/Needs source) + the unbounded
    `filteredRows.map(...)` list of `InterventionListRow`s (each renders
    `RPubInterventionCard` + a right-hand delta readout).
  - Lines 129-240+: DATA ASSEMBLY — `interventionRows()` (flatten + sort
    newest first), `wikiInterventionRows()` (timeline + treatments +
    projects + source gaps), per-type row builders. KEEP the assembly,
    with the date fixes below.
  - `matchesFilter`/`isFutureEvent` helpers further down — KEEP.
- `apps/web/src/studio/page.tsx` — `StudioPage` (KEEP; used by
  route-detail too) + `StudioHero` (after plan 052 deletes methods, this
  page is its LAST consumer — delete StudioHero with its usage here).
- `apps/web/src/components/route/RoutePublicAtoms.tsx` —
  `RPubInterventionCard` survives only for this page (plan 057 left a
  note); DELETE it here, and delete `RoutePublicAtoms.tsx` entirely if
  nothing else remains (plans 053/055/057 removed the rest; verify with
  grep before deleting the file).
- Plan 049: `SourceNote` + `citationEntries`. Plan 051:
  `ROUTE_INDEX_BOROUGHS` in `apps/web/src/studio/home-route-index.ts` for
  the borough filter; `BoroughBadge` available.
- Doctrine allowlist contains `studio/pages/interventions.tsx` — comes off
  here.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun --filter @bp/web typecheck` | exit 0 |
| Web tests | `bun run test:web` | all pass |
| Doctrine | `bun run check:design-doctrine` | exit 0 |
| Build + budget | `bun --filter @bp/web build` | "Bundle within budget." |
| Style | `bun run check:style` | exit 0 |
| Dev server | `bun --filter @bp/web dev` | `/interventions` renders |

## Scope

**In scope**:
- REWRITE the render half of `apps/web/src/studio/pages/interventions.tsx`
  (keep + patch the data assembly)
- EDIT `apps/web/src/studio/page.tsx` (delete `StudioHero`)
- EDIT `apps/web/src/components/route/RoutePublicAtoms.tsx` (delete
  `RPubInterventionCard`; delete the file if empty; update
  `route-public-atoms.test.ts` accordingly — delete the test file if the
  component file goes)
- CREATE `apps/web/test/shared/interventions-page.test.ts`
- EDIT `tests/harness/design-doctrine.test.ts` (allowlist shrink)
- `plans/README.md` (status row)

**Out of scope**:
- The loader/route file and the evidence endpoint.
- Route-page History tab (057).
- `matchesFilter` semantics (keep the four filters' behavior).

## Git workflow

- Branch: `codex/058-interventions-page`
- One or two commits. Do NOT push or open a PR unless the operator
  instructed it.

## Steps

### Step 1: Patch the data assembly (dates must be dates)

In the row builders:
1. `wikiProjectRow`: `year: project.status ?? "undated"` →
   `year: "undated"` (status renders as a chip, not a date — pass
   `project.status` through on the display event as a new optional
   `statusLabel` field if you want the chip; simplest: title row already
   shows the status chip via kind — add `kind: project.projectType ??
   "project"` style field to `InterventionDisplayEvent` if absent).
2. Add to `InterventionDisplayEvent` a `kind: string` (serving →
   "program record"; wiki timeline → its eventKind; treatment →
   treatmentKind; project → projectType; source gap → "source gap") so the
   row chip is uniform. Derive per builder; humanize underscores at render.
3. Reuse plan 057's year-label rule: a `yearLabel(dateish: string)` that
   extracts a 4-digit year or returns "Undated" (copy the 5-line helper;
   do NOT import across page/component boundaries for this).

### Step 2: Rewrite the page render

1. **Header** (plain, no StudioHero): `<h1>` 26px "Interventions"; one sub
   line: "Documented bus lanes, camera enforcement, signal priority, and
   service changes across the tracked network, newest first." DELETE the
   4 `InterventionStat` tiles; counts move into the filter chips.
2. **Filters row**: the four existing filters as chips WITH live counts —
   `All (212) · …` NO — no interpuncts: each chip label is
   `${label} (${count})`. ADD a borough filter (second chip group from
   `ROUTE_INDEX_BOROUGHS` + "All boroughs", filtering on
   `row.route.borough.includes(b)`). Both filter groups keep the existing
   button styling (aria-pressed, ink-inverted active state — reuse the
   markup at lines 80-95).
3. **The chronicle** — `SectionCard title="Network timeline"
   sub="Open a route for maps, speed history, and full citations."`:
   grouped by `yearLabel(event.sortKey)` (years desc, "Undated" last —
   the list is already sorted; derive groups in order). Row (match plan
   057's visual): grid `[64px_auto_minmax(0,1fr)_auto]` — plain mono date
   text (`event.year` when it looks like a date, else "Undated" muted) ·
   `RouteBadge route={row.route.label} sbs={row.route.sbs} size="sm"`
   (links to the route page: wrap the badge + title in a
   `Link to="/routes/$routeId" params={{routeId: row.route.slug}}`) ·
   kind chip + title (13px semibold) + detail (12px muted, `line-clamp-2`)
   · right rail: the evaluated delta readout when `comparisonCohort`
   exists (keep the existing delta figures/labels), else nothing. Below
   the title line: `<SourceNote entries={citationEntries(row.evidence,
   row.event.citationKeys)}/>` (or the `sourceLabel` fallback entry, as
   in plan 057).
   **BOUNDED**: render the first 30 filtered rows; below, a quiet button
   `Show 30 more (${remaining} left)` appending 30 per click (local
   state); filter changes reset to 30.
4. Delete `InterventionStat`, `InterventionListRow`'s card usage, the
   `RPubInterventionCard` + `SectionHeader` + `StudioHero` imports.

**Verify**: `bun --filter @bp/web typecheck` → exit 0; dev server
`/interventions`: year groups render; filters narrow WITH counts; 30-row
bound + Show more works; citations behind "Sources (n)"; no status strings
in date positions.

### Step 3: Delete the last legacy pieces

1. `page.tsx`: delete `StudioHero` (verify last consumer:
   `rg -ln "StudioHero" apps/web/src` → only `page.tsx` after step 2).
2. `RoutePublicAtoms.tsx`: delete `RPubInterventionCard`; if the file has
   no remaining exports with consumers, delete it and its test file.

**Verify**: `rg -n "StudioHero|RPubInterventionCard" apps/web/src` → 0
matches; typecheck exit 0.

### Step 4: Doctrine ratchet + full gate

Remove `studio/pages/interventions.tsx` (and `RoutePublicAtoms.tsx` if
deleted) from the plan-050 allowlists.

**Verify**:
`bun run check:design-doctrine && bun run test:web && bun --filter @bp/web build && bun run check:style`
→ all pass, in budget.

## Test plan

CREATE `apps/web/test/shared/interventions-page.test.ts`
(renderToStaticMarkup + toContain). Fixtures: 3 routes; one with 2 serving
interventions (one evaluated), one with a wiki bundle (timeline event with
duplicate citation keys + a project with `status: "planned"` and no date),
one with nothing.

- `interventionRows` pure cases (it is exported): count = serving + wiki
  rows; sort newest first; the project row's `year` is "undated" (NOT
  "planned").
- Rendered page: year group headers present; "Undated" group last;
  `planned` renders as a chip not a date; the no-record route contributes
  no rows; the evaluated row shows its delta readout.
- Bounding: with >30 fixture rows (generate programmatically), the 31st
  row's title is absent from initial HTML and the Show-more button text
  includes the remaining count.
- Filter counts: "Evaluated (1)" appears in the chip label.
- No banned strings: no `·` in copy, no "What changed on the street"
  editorial title if you removed it (the new sub replaces it), no
  `RPubInterventionCard` classes.

**Verification**: `bun run test:web` → all pass.

## Done criteria

- [ ] `rg -n "StudioHero|RPubInterventionCard|InterventionStat" apps/web/src` → 0 matches
- [ ] `/interventions` renders grouped, bounded, filterable chronicle
      (dev-server check); citations only via SourceNote popovers
- [ ] Status strings never render in date positions (test-asserted)
- [ ] Doctrine check passes with `interventions.tsx` off the allowlists
- [ ] Typecheck, `test:web`, build (in budget), style all exit 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Plan 057 not DONE (`CitationChips` still exists / route History tab not
  landed) — the shared row pattern and SourceNote conversion must precede
  this page.
- `StudioHero` has consumers beyond `page.tsx`/`interventions.tsx`
  (methods should be gone via 052; if it is NOT gone, execute 052 first).
- The evidence payload shape diverges from the row builders (fields named
  in step 1 missing) — report; do not guess field names.
- Rendering all fixture rows statically exceeds the test's practicality —
  test the pure helpers (`interventionRows`, `yearLabel`, bounding
  slice function) instead of full-page HTML for the >30 case; note it.

## Maintenance notes

- The page and the route History tab share a visual row pattern by
  CONVENTION, not by shared component — if a third consumer appears,
  extract a shared `EvidenceRow` then (rule of three).
- Filter counts recompute per render over ~200 rows — trivial today;
  memoize only if the corpus grows 10×.
- Deferred: a treatment-type filter (bus lane / ACE / TSP…) — the `kind`
  field added in step 1 makes it a small follow-up.

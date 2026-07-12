# Plan 034: Make the route page scan — verdict lede, ranked insights, compact header, section rhythm

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat ce3baca..HEAD -- apps/web/src/studio/pages/route-detail.tsx apps/web/src/components/route/`
> Plans 032/033 intentionally edit these files first — that drift is expected;
> re-locate via the excerpts (they quote the `ce3baca` state; apply the intent
> to the current code). Any OTHER structural mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED (visual changes across the product's most important page)
- **Depends on**: plans/032-honest-route-card.md (honest fields), plans/033-route-shell-scroll-chrome.md (scroll architecture). Execute after both.
- **Category**: tech-debt (UX) / bug (one hooks violation)
- **Planned at**: commit `ce3baca`, 2026-07-04

## Why this matters

The operator's verdict: *"Route detail pages are visually weak and hard to
scan."* The July 2026 design source resolves this with a specific reading
structure the current page lacks: a short **verdict** ("a 20-second answer to
'what's the story of this route?'"), a **ranked 'What stands out' list** with
severity and confidence as separate visual channels, a **compact** title row,
and consistent question-shaped sections. The current page has all the DATA for
this (a real lede sentence builder, detector-readiness insights served on
every route detail, capability-gated sections with honest empty states) but
presents it as same-weight stacked sections led by a map, with the insights
reduced to tiny count badges on the section nav. This plan is an incremental
re-composition of existing parts — no new data dependencies, no redesign.

## Current state

### Files (all under `apps/web/src/`)

- `studio/pages/route-detail.tsx` (198 lines) — page assembly; section order
  comes from `ROUTE_DETAIL_SECTIONS` usage at lines 89–119 (map, where-when,
  reliability, riders, treatments, evidence). Contains a REAL BUG: the
  component returns early at line 41 (`if (data === null) return <NotFoundPage />;`)
  BEFORE the `useCallback` at line 48 — a rules-of-hooks violation (hook count
  changes if `data` flips between renders).
- `components/route/RoutePublicAtoms.tsx` — `routePublicLede` (lines 24–60,
  builds the real semicolon-joined route summary sentence), `RPubHeader`
  (62–101: borough kicker, **34px h1**, meta line, lede paragraph),
  `RPubBigStat` (103–150: **38px mono numerals**).
- `components/route/RoutePublicKpiStrip.tsx` (128 lines) — five real KPI
  columns (Speed / Trend / Excess wait / Riders / Bus lane), each column
  already navigates to its section via `onClick` (lines 68–71) but shows no
  visible link affordance.
- `components/route/route-insight-placement.ts` — `routeSectionBadges(insights)`
  reduces detector insights to per-section count badges; insights carry
  severity and section/segment placements (this is the ranked-list source).
- `components/route/section-registry.ts` — section list, presentations
  (render / empty / hidden), `HonestEmptySection` wiring.
- `components/SectionHeader.tsx` — existing shared section header atom.
- Section components with their own header markup to converge:
  `OverviewSection.tsx`, `RidersSection.tsx`, `ReliabilitySection.tsx`,
  `TreatmentsHistorySection.tsx`, `DataNotesSection.tsx`, `SlowSegments.tsx`,
  `RouteMapSection.tsx`.

### Key excerpts (as of `ce3baca`)

`route-detail.tsx:41-53` — the hooks violation:

```tsx
  if (data === null) return <NotFoundPage />;

  const { route, segments } = data;
  const flagged = segments.find((s) => s.flagged);

  const sectionBadges = routeSectionBadges(data.insights);
  const sectionRegistry = routeSectionRegistry(data.capability, sectionBadges);
  const navigateToSection = useCallback((sectionValue: RouteDetailSectionValue) => {
```

`RoutePublicAtoms.tsx:84-95` — the oversized header:

```tsx
          <h1 className="m-0 mt-1 text-[34px] font-semibold leading-[1.05] tracking-normal text-[var(--bp-color-ink)] max-md:text-[28px]">
            {route.corridorFull || route.corridor}
          </h1>
          ...
          {lede ? (
            <p className="m-0 mt-4 max-w-[960px] text-[16px] leading-[1.6] text-[var(--bp-color-ink)]">
              {lede}
            </p>
          ) : null}
```

### Design authority (July 4 2026 export — quoted so the executor need not re-derive)

- `knowledge/raw/design-handoffs/bus-priority-impact-studio-2026-07-04/verdict-compositions.jsx`
  — "The Overview tab reimagined as a verdict: a 20-second answer to 'what's
  the story of this route?'… Ranked column — insights-first, sparse-safe
  default (severity = colored blocks · confidence = ink pips)".
- `screenshots/v-compA-top.png` — the composition: compact header (badge, ~21px
  title, meta line, one action) → 5-col KPI strip → tabs → "THE VERDICT"
  narrative block with a left accent bar → "What stands out — 3 ranked
  findings" numbered `01`, severity blocks + confidence pips + caveat chips,
  small evidence strip on the right of each row.
- `verdict-shell.jsx:148-163` — `VerdictRouteHeader`: 21px title, geo line,
  posture pill, single primary action.
- `verdict-shell.jsx:28-104` — `JudgedKpiStrip`: 30px value numerals, eyebrow
  labels, per-column mono footer link "`{tab} →`".
- `verdict-shell.jsx:423-478` — `ZeroInsight`: the checked-clean report card
  ("No flags raised … Checked through {month} across N detector families") —
  the credibility treatment when a route has zero insights.
- `route-public.jsx:1-18` — the public page's editorial order: hero → key
  numbers → **"Where the bus slows down"** → speed trend as story → riders →
  what's been tried → about → how we know. The map is not the lead.

### Standing product constraints (must honor)

- **Banned since the 2026-06-12 operator verdict** (plans/README.md gen-3
  constraints): "data as of" chips, judged-word KPI labels, self-referential
  coverage copy. The July 4 verdict-layer designs DO show `DataAsOf` chips —
  that conflict is deliberately NOT resolved by this plan: implement the
  verdict STRUCTURE (lede block, ranked list, compact header) but do NOT add
  "data as of" chips or judged-word labels. If the operator wants the chips
  back, that is a separate explicit decision.
- Honest empty states; every wiki-derived fact keeps its citations; never
  fabricate (plan 032 establishes the honest-or-absent card contract — build
  on it, e.g. no miles in the meta line when null).
- Charts stay Recharts-v3/shadcn behind lazy `X.tsx` + `X.chart.tsx`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web types | `bun --filter @bp/web typecheck` | exit 0 |
| Shared web tests | `bun run test:web` | exit 0 |
| Worker harness | `bun run test:worker` | exit 0 |
| Build + budget | `bun --filter @bp/web build` | exit 0 |
| Style | `bun run check:style` | exit 0 |
| Dev server | `bun run dev` | serves the app |

## Scope

**In scope**:

- `apps/web/src/studio/pages/route-detail.tsx`
- `apps/web/src/components/route/RoutePublicAtoms.tsx`
- `apps/web/src/components/route/RoutePublicKpiStrip.tsx`
- `apps/web/src/components/route/route-insight-placement.ts`
- `apps/web/src/components/route/section-registry.ts` (section order only)
- NEW: `apps/web/src/components/route/RouteVerdictLede.tsx` and
  `apps/web/src/components/route/RouteInsightList.tsx`
- Section header convergence ONLY (their header/title markup, not their
  bodies): `OverviewSection.tsx`, `RidersSection.tsx`, `ReliabilitySection.tsx`,
  `TreatmentsHistorySection.tsx`, `DataNotesSection.tsx`, `SlowSegments.tsx`,
  `RouteMapSection.tsx`
- `apps/web/src/components/SegmentRow.tsx` (mobile variant only — Step 7)
- Tests under `apps/web/test/shared/` for the pieces above

**Out of scope** (do NOT touch):

- `RouteDetailShell.tsx` (plan 033 owns it)
- Chart/map internals (`*.chart.tsx`, `*.map.tsx`, maplibre styles)
- The API/domain contracts (plan 032 owns them)
- Global tokens in `global.css`
- Authoring/analyst surfaces; anything outside the route detail page

## Git workflow

- Branch: `codex/034-route-detail-scanability` from `origin/main` (after 032/033).
- Commit per step; short imperative subjects.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix the hooks violation

In `route-detail.tsx`, move the `if (data === null) return <NotFoundPage />;`
early return BELOW all hook calls (`useCallback` — and keep any hooks plan 033
introduced above it too). Simplest correct shape: compute
`const navigateToSection = useCallback(...)` first, then the null guard.

**Verify**: `bun --filter @bp/web typecheck` → exit 0; `bun run test:web` → exit 0.

### Step 2: Compact the header (typography only)

In `RoutePublicAtoms.tsx` `RPubHeader`:

- h1: `text-[34px] … max-md:text-[28px]` → `text-[24px] … max-md:text-[21px]`
  with `tracking-[-0.02em]` (design's 21px title scaled up slightly for the
  wider app canvas).
- The lede `<p>` moves OUT of the header in Step 3 — remove the `lede`
  rendering from `RPubHeader` (keep the prop removal clean: it becomes a
  2-prop component: route + stats).

In `RPubBigStat`: numeral `text-[38px] … max-md:text-[32px]` →
`text-[30px] … max-md:text-[26px]` (design's KPI value size), and `min-h-[40px]`
→ `min-h-[34px]`.

In `RoutePublicKpiStrip.tsx`: add the design's per-column footer affordance —
inside each `RPubBigStat` (it already accepts `sub`), append a mono link line
matching `verdict-shell.jsx:17-21`'s `{tab} →` treatment: 10px, semibold,
`text-[var(--bp-color-ink-40)]`, rendered only when the column has a
`onClick` target (e.g. "Where & when →", "Reliability →", "Riders →",
"Treatments →"). Implement by giving `RPubBigStat` an optional `footer`
string prop rendered under `sub`.

**Verify**: `bun --filter @bp/web typecheck` → exit 0; `bun run test:web` → exit 0
(update `route-public-atoms.test.ts` / `route-public-kpi-strip.test.ts`
expectations if they assert the old sizes/props).

### Step 3: Verdict lede block (new component, existing content)

Create `apps/web/src/components/route/RouteVerdictLede.tsx`:

- Input: the existing `routePublicLede({ route, dossier })` string (real,
  derived), rendered as the design's verdict treatment
  (`screenshots/v-compA-top.png`): mono eyebrow reading `THE ROUTE RIGHT NOW`
  (NOT "THE VERDICT" — avoids the judged-word framing), a 3px left accent
  border (`border-l-[3px] border-[var(--bp-color-ink)] pl-4`), body
  `text-[16.5px] leading-[1.6] max-w-[900px]`.
- Render `null` when the lede is null (sparse routes keep their honest
  emptiness).
- In `route-detail.tsx`, render it as the FIRST element of the scrolling
  content (above all sections), passing the same lede string currently
  computed at line 75.

**Verify**: `bun --filter @bp/web typecheck` → exit 0.

### Step 4: "What stands out" — ranked insight list (new component, served data)

Create `apps/web/src/components/route/RouteInsightList.tsx`:

- Input: `data.insights` (the served detector-readiness insights already used
  for badges — see `route-insight-placement.ts` for their shape: severity,
  title/body, section/segment placement).
- Behavior: sort by severity (high → low), cap at 5, render as numbered rows
  per the composition: mono `01`-style index in severity color, insight title
  (15–17px semibold), severity shown as 1–3 small colored blocks + text label,
  and a "`{section label} →`" link that calls the page's existing
  `navigateToSection` for the insight's placement section (segment placements
  link to `where-when`).
- Zero insights AND capability shows detectors ran clean → render the quiet
  checked-clean card per `verdict-shell.jsx:427-439` ("No flags raised" +
  families count if available from capability; otherwise the plain sentence
  "No detector flags raised for this route."). Zero insights because detectors
  DIDN'T run → render nothing (the section registry's honest empty states
  already communicate coverage; do not duplicate).
- Render it in `route-detail.tsx` directly under the verdict lede.
- Do NOT invent confidence pips — the served insight shape may not carry
  confidence; render only fields that exist (check the type in
  `route-insight-placement.ts` / the `StudioRouteDetailResponse` insights type
  in `@bp/domain`; if a confidence field exists, render it as ink pips, else
  omit).

**Verify**: `bun --filter @bp/web typecheck` → exit 0; add
`apps/web/test/shared/route-insight-list.test.ts` (model on
`route-public-atoms.test.ts`): severity ordering, cap at 5, zero-insight
clean-card vs nothing branches → `bun run test:web` → exit 0.

### Step 5: Narrative-first section order

In `section-registry.ts`, reorder `ROUTE_DETAIL_SECTIONS` so `where-when`
precedes `map` (new order: where-when, map, reliability, riders, treatments,
evidence), per `route-public.jsx:12-13` ("Where the bus slows down" leads;
the map is context, not the lead). Section ids, anchors, and the KPI strip's
navigation targets are id-based and need no change. Update any test that
asserts the old order.

**Verify**: `bun run test:web` → exit 0.

### Step 6: Converge section headers on the shared atom

For each section component in scope, replace bespoke header markup with the
shared `SectionHeader` (`apps/web/src/components/SectionHeader.tsx`) so every
section opens with the same kicker/title/sub rhythm and `mb` spacing. Do NOT
change section bodies. If a section's header carries controls (filters,
toggles), keep them in the header's right slot if `SectionHeader` has one;
if it doesn't, keep that section's controls where they are and only align the
title typography.

**Verify**: `bun --filter @bp/web typecheck` → exit 0; `bun run test:web` → exit 0.

### Step 7: SegmentRow mobile variant (verified responsive break)

`apps/web/src/components/SegmentRow.tsx:67` hardcodes
`grid grid-cols-[1fr_84px_92px_168px_132px]` with no responsive variant —
~476px of fixed columns plus gaps overflows a 375px viewport, making the
slow-segments table unreadable on phones. Add a `max-md:` variant inside the
same component: two-line layout (line 1: segment name + direction; line 2:
labeled mph + hour strip), keeping the desktop grid untouched. Update
`SegmentRowHeader`/`SegmentRowSkeleton` in the same file consistently
(skeleton is used by the route-detail loading page).

**Verify**: `bun --filter @bp/web typecheck` → exit 0; manual at 375px: no
horizontal overflow in the where-when section.

### Step 8: Visual gate (desktop + mobile)

`bun run dev`; check `/routes/m15-sbs` (rich), a mid route, and a sparse route
(e.g. `/routes/b102`):

1. Cold read order is: header → KPI strip → (sticky nav) → verdict lede →
   ranked insights (or clean-card / nothing) → where-when → map → …
2. The rich route's insights render ranked with working section links.
3. The sparse route still renders a complete honest page (no blank verdict
   area artifacts, empty states intact).
4. 375px width: no horizontal overflow; ranked rows wrap acceptably.
5. Take desktop + mobile screenshots per repo practice
   (`knowledge/wiki/engineering/studio_design_pass_status.md` requires both
   before a design pass is done).

**Verify**: all five checks hold; screenshots captured.

### Step 9: Full gates

**Verify**: `bun run test:web`, `bun run test:worker`,
`bun --filter @bp/web build`, `bun run check:style` → all exit 0.

## Test plan

- New: `route-insight-list.test.ts` (ordering, cap, empty-state branches).
- Updated: `route-public-atoms.test.ts` (header sizes/props),
  `route-public-kpi-strip.test.ts` (footer link), any section-order test.
- Must stay green: all other `apps/web/test/shared/` suites, worker tests.
- Pattern exemplar: `apps/web/test/shared/route-public-atoms.test.ts`.

## Done criteria

- [ ] `grep -n "useCallback" apps/web/src/studio/pages/route-detail.tsx` shows it ABOVE the `data === null` return
- [ ] `ls apps/web/src/components/route/RouteVerdictLede.tsx apps/web/src/components/route/RouteInsightList.tsx` — both exist
- [ ] `grep -n "text-\[34px\]" apps/web/src/components/route/RoutePublicAtoms.tsx` returns no matches
- [ ] All commands in "Commands you will need" exit 0
- [ ] Step 8 checks recorded as passing with screenshots
- [ ] `git status` clean outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plans 032/033 have not landed (check `plans/README.md` status) — this plan
  assumes the honest contract and the scrolling header.
- `data.insights` turns out to carry no severity or placement fields usable
  for ranking (inspect the type first) — report the actual shape instead of
  inventing a ranking.
- The bundle budget fails after adding the two new components (they must be
  plain TSX — no new deps; if the budget still trips, STOP).
- Any change would re-introduce a banned element ("data as of" chip,
  judged-word KPI label, fabricated value) to satisfy the design mock —
  report the conflict instead.

## Maintenance notes

- The DataAsOf/judged-labels conflict between the June ban and the July
  verdict designs is REAL and unresolved — the operator should adjudicate it
  explicitly; record the outcome in `plans/README.md` and
  `studio_design_pass_status.md`.
- If a future plan serves insight confidence, `RouteInsightList` grows the
  ink-pips channel (design: `screenshots/v-compA-top.png` "CONF ●●● Well-evidenced").
- KPI strip column count: `route-public.jsx:386-416` shows FOUR oversized
  stats while `verdict-shell.jsx:28-104` (the newer verdict layer) shows FIVE
  columns — this plan keeps five per the verdict reference. If the operator
  prefers the four-stat editorial lead, that is a one-line follow-up.
- Follow-ups deliberately deferred to a post-034 polish round (audited
  2026-07-04, real but lower leverage than landing the verdict structure):
  narrated slow-segment CARDS (`route-public.jsx` RPubSlowCard) replacing the
  segment table rows in `SlowSegments.tsx`; prose-first section leads
  replacing the grid-first pattern in `RidersSection`/`ReliabilitySection`
  (design leads with narrative, current sections lead with 3-4 col KPI
  grids); treatments section leading with the intervention timeline cards;
  unifying the two hour-visualization treatments (`HourStrip.tsx` strip vs
  the 24-cell grid in `RoutePublicAtoms.tsx:152-245`); chart annotation
  restraint (gridline weight, event-marker labels) per
  `route-public.jsx:218-232`.

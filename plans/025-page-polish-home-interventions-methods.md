# Plan 025: Finish the supporting pages — home trust strip, interventions tone, methods metric cards

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Read first**: the canonical mockups this plan converges on —
> `03-canonical/bus-priority-impact-studio/project/home-public.jsx`,
> `.../interventions-refactor.jsx`, `.../methods-public.jsx`
> (under `knowledge/raw/downloads/design-handoffs/`).

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plan 019; plan 022 (shared atoms; do the route page first
  so atom styles are settled); plan 020 helps /interventions
- **Category**: design
- **Planned at**: 2026-07-01

## Why this matters

The 2026-07-01 design audit found the supporting pages close but unfinished:
home ~85% converged (missing the footer trust strip and the three
"how to use this site" persona cards), interventions ~75% (cards lack the
tone-colored year badge/rule system), methods ~90% (dataset rows exist;
per-metric definition cards don't). Finishing them is cheap and makes the
whole site read as designed rather than approximated — which matters for a
portfolio product whose audience includes people who notice.

## Current state

- Home: `apps/web/src/studio/pages/home.tsx` (597 LOC) — editorial hero,
  story cards, route index. Missing: trust strip (methods/sources/contact
  links), persona entry cards.
- Interventions: `apps/web/src/studio/pages/interventions.tsx` (194 LOC) —
  hero, filter tabs, timeline list. Missing: tone system
  (good/warn/accent/bad year badges + rules), treatment glyphs (the
  `interventions-refactor.jsx` glyph taxonomy is reference material — adopt
  only if it earns its bytes).
- Methods: `apps/web/src/studio/pages/methods.tsx` (149 LOC) — status
  chips, dataset table, principles grid. Missing: `MPubMetricCard`s (per
  metric: definition, grain, source, "we call it / not" wording, caveat).
- Shared atoms from plan 022 (`RPubInterventionCard` tone system) should be
  reused directly on /interventions.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Web typecheck | `bun --filter @bp/web typecheck` | exit 0 |
| Shared tests | `bun test apps/web/test/shared --timeout 5000` | pass |
| Web build | `bun --filter @bp/web build` | budget passes |

## Scope

**In scope**: the three pages above + shared footer component; static copy
where the design specifies it (persona cards, trust strip, metric wording).

**Out of scope**: route page (022), map redesign, new data, nav changes,
anything from superseded/verdict mockups. The home page's citywide numbers
stay static editorial copy per the recorded decision — do not make them
data-driven.

## Steps

### Step 1: Trust strip + persona cards on home

Footer trust strip per `home-public.jsx`: links to /methods, source count
with real number from served status, contact/GitHub. Three persona cards
("I ride the …", "I plan service", "I report on transit" — use the mockup's
copy) linking to a route page, /map, /methods respectively. Static copy;
route link goes to a real flagship route.

### Step 2: Tone-colored intervention cards

Reuse plan 022's `RPubInterventionCard` on /interventions (lifecycle → tone
mapping identical to the route page). Glyphs: only if a small fixed set
covers the served treatment kinds; otherwise skip — the tone system is the
requirement, glyphs are garnish.

### Step 3: Methods metric cards

`MPubMetricCard` per served metric (speed, trend, excess wait, riders,
bus-lane coverage, plus wiki-evidence provenance): definition, grain,
source dataset, "We call it / Not" wording guidance from the mockup, caveat
where one is recorded. Source the metric list from what the site actually
renders — every KPI on the route page must have a card here.

**Verify each step**: shared tests render the new sections; typecheck;
build+budget.

## Test plan

Shared render tests per page; full pre-merge gate; quick before/after
screenshots in the PR (same rationale as plan 022 — taste gets reviewed).

## Done criteria

- [ ] Home has trust strip + persona cards.
- [ ] Interventions cards use the shared tone system.
- [ ] Every route-page KPI has a methods metric card.
- [ ] Gates pass; screenshots in PR; `plans/README.md` updated.

## STOP conditions

- Any impulse to add data-driven citywide stats to the static home copy.
- Metric cards would document a metric the site doesn't render — trim the
  card list, don't pad it.

## Maintenance notes

- When plan 023 adds hour/DOW surfaces, add their metric cards here in the
  same PR that renders them — the "every rendered KPI has a card" invariant
  is the point.

# Plan 119: Real disclosure controls on the interventions surfaces

> **Executor instructions**: Follow this plan step by step; run every
> verification and confirm the expected result. On any STOP condition, stop
> and report. When done, update this plan's status row in `plans/README.md`
> (Generation 21 section).
>
> **Branch base**: audited against `origin/main@e0c00aaf`; Plans 117 and 118
> must be merged first (same files). Branch off current `origin/main`.
>
> **Drift check (run first)**:
> `git fetch origin && git diff --stat e0c00aaf..origin/main -- apps/web/src/components/interventions apps/web/src/components/ui/collapsible.tsx`
> Drift from 117/118 is expected; re-anchor by content. The five `<details>`
> sites must still exist (117/118 do not remove them); if any is gone, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (one summary wraps a large interactive grid; focus/hit-target
  behavior changes)
- **Depends on**: plans/117-merge-crossroute-episodes.md,
  plans/118-episode-public-copy.md
- **Category**: bug (a11y/UX)
- **Planned at**: commit `e0c00aaf` (origin/main), 2026-08-02

## Why this matters

The live /interventions page and route History entries use bare native
`<details>/<summary>` with the marker hidden (`list-none
[&::-webkit-details-marker]:hidden`) and nothing in its place. The group
header's toggle is a static accent-colored `<span>Open</span>` that never
changes when opened — no affordance, no state feedback, no button semantics.
The repo already ships the right primitive — shadcn/Radix `Collapsible` at
`apps/web/src/components/ui/collapsible.tsx` — and uses it correctly twice,
with a rotating chevron and a state-aware label. Five disclosure sites on the
two highest-traffic public surfaces should match that convention. (Note:
there is no `accordion.tsx` in this repo — Collapsible is the convention.)

## Current state

The five sites (line numbers per `e0c00aaf`; 117/118 may shift them —
anchor by content):

| Site | Summary label today |
|---|---|
| `apps/web/src/components/interventions/PublicChangeEntry.tsx:132-135` (AffectedRoutes overflow) | `` `and ${rest.length} more ${…"route"/"routes"}` `` |
| `PublicChangeEntry.tsx:184-187` (Components overflow) | `` `and ${rest.length} more in the same change` `` |
| `PublicChangeEntry.tsx:240-243` (PlacementHistory) | `` `${n} historical placement ${…}` `` |
| `apps/web/src/components/interventions/PublicInterventions.tsx:169-172` (smaller plans) | `` `${…} smaller plans` `` |
| `PublicInterventions.tsx:229-274` (ChangeGroup) | a whole grid inside `<summary>`, containing the static `<span>Open</span>` at :246 |

Convention exemplars (read both before writing code):

- State-aware label: `apps/web/src/components/route/TreatmentsHistorySection.tsx:208-274` —
  `CollapsibleTrigger` with `{open ? "Hide project activity" : "Show project activity"}`.
- Chevron affordance: `apps/web/src/components/route/RouteDetailShell.tsx:85-96` —
  rotating chevron via `group-data-[panel-open]:rotate-180`.
- The primitive: `apps/web/src/components/ui/collapsible.tsx` (Radix wrapper).

Constraint from the ChangeGroup structure: the current `<summary>` contains
the date line, heading, source label, and a route-badge strip. Radix
`CollapsibleTrigger` renders a `<button>`; nested interactive content inside
a button is invalid. The badges in the group summary are plain `RouteBadge`
spans (NOT links) as of 117, so they may stay inside the trigger; if 117/118
changed them to links, move the badge strip OUT of the trigger (render it as
a sibling row below the trigger, still visible when collapsed).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Scoped tests | `bun test apps/web/test/shared/public-episode-projection.test.ts --timeout 10000` | exit 0 |
| Full web tests | `bun test apps/web/test --timeout 15000` | exit 0 |
| Typecheck | `bun run check:types` | exit 0 |
| Build + budget | `bun --filter @bp/web build` | exit 0 |
| Doctrine harness | `bun run check:architecture` | exit 0 |

## Scope

**In scope**:

- `apps/web/src/components/interventions/PublicChangeEntry.tsx`
- `apps/web/src/components/interventions/PublicInterventions.tsx`
- `apps/web/test/shared/public-episode-projection.test.ts` (assertions on the
  new trigger labels/roles)

**Out of scope**:

- `apps/web/src/components/route/NetworkMapDataNotes.tsx:194-195` — its
  `<details>` is inside a Sheet dialog, different surface; leave it.
- `components/ui/collapsible.tsx` itself — consume, don't modify.
- Copy content (118 owns words; you own controls).

## Git workflow

- Branch off `origin/main` (after 118 merges): `codex/119-disclosure-controls`
- Commit per site or per component; short imperative subjects.
- No push/PR unless the operator instructed it.

## Steps

### Step 1: Convert the three PublicChangeEntry sites

Replace each `<details>/<summary>` with
`Collapsible`/`CollapsibleTrigger`/`CollapsibleContent`, following
`TreatmentsHistorySection.tsx:214-216` for the state-aware label pattern:

- AffectedRoutes: closed `Show ${rest.length} more ${route|routes}` / open
  `Hide ${…}`.
- Components: closed `Show ${rest.length} more in the same change` / open
  `Hide ${…}`.
- PlacementHistory: closed `${n} placement records` with chevron / open same
  label, chevron rotated (the count IS the label; add the chevron per
  `RouteDetailShell.tsx:88-93`).

Keep the existing text sizes/colors (accent, 11.5px) — this is a control
change, not a restyle.

**Verify**: `bun test apps/web/test/shared/public-episode-projection.test.ts --timeout 10000`
→ pass (update any assertion that queried `summary`/`details` elements).

### Step 2: Convert the smaller-plans site

`PublicInterventions.tsx:169-178` → Collapsible with closed label
`Show ${n} smaller plans` / open `Hide smaller plans`.

**Verify**: scoped tests pass.

### Step 3: Restructure ChangeGroup

- `CollapsibleTrigger` contains: count square, date line, heading, and a
  trailing chevron + state label (`{open ? "Close" : "Open"}` → better:
  `{open ? "Hide changes" : "Show changes"}`) replacing the static "Open"
  span.
- Source label and the route-badge strip move OUT of the trigger into a
  sibling block (rendered regardless of state) IF any badge is interactive;
  otherwise they may remain inside. Decide by inspecting the code as merged
  (see Current state constraint) and record the choice in the commit message.
- Preserve the shared left-gutter alignment (`ENTRY_GUTTER`).

**Verify**: full web tests pass; manual keyboard check documented in the PR:
Tab reaches the trigger, Enter/Space toggles, focus stays on the trigger.

### Step 4: Full gates

All commands in the table exit 0; `git status --porcelain` → in-scope only.

## Test plan

- Update `public-episode-projection.test.ts` renders: triggers are `<button>`
  elements with accessible names matching the new labels; content hidden
  until toggled (Radix sets `data-state` — assert on it, matching however
  `TreatmentsHistorySection`'s tests assert, if they exist:
  `rg -n "Collapsible" apps/web/test` for a pattern).
- New: ChangeGroup renders "Show changes" closed and "Hide changes" open.

## Done criteria

- [ ] `rg -n "<details|<summary" apps/web/src/components/interventions` → no matches
- [ ] `rg -n '>Open<' apps/web/src/components/interventions` → no matches
- [ ] All commands exit 0
- [ ] `plans/README.md` gen-21 row updated

## STOP conditions

- A `<details>` site expected here was already removed/converted (drift).
- Radix Collapsible inside the `<ol>`/list structure breaks list semantics in
  a way you cannot resolve without restructuring `ChangeGroup`'s parent —
  report the DOM you'd need.
- Bundle budget fails after adding Radix imports to this chunk (unexpected —
  Collapsible is already in the app; if it fires, report the budget delta).

## Maintenance notes

- Any future disclosure on public surfaces should import
  `components/ui/collapsible.tsx`; the doctrine harness does not enforce
  this — reviewers should.
- If Plan 120 later restructures the page composition, the triggers built
  here carry over 1:1.

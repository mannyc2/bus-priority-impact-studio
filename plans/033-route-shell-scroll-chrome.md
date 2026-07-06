# Plan 033: Collapse the route page's pinned chrome — header scrolls, one slim sticky nav

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat ce3baca..HEAD -- apps/web/src/components/route/RouteDetailShell.tsx apps/web/src/studio/pages/route-detail.tsx apps/web/src/studio/shell.tsx apps/web/src/studio/page.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1 (the operator's top frontend complaint)
- **Effort**: M
- **Risk**: MED (scroll behavior touches anchors, section navigation, and the loading skeleton)
- **Depends on**: none functionally; plan 032 touches sibling route components — coordinate merges. Land BEFORE plan 034 (which restyles the header content this plan un-pins).
- **Category**: bug / tech-debt (UX architecture)
- **Planned at**: commit `ce3baca`, 2026-07-04

## Why this matters

The operator's verdict: *"Header/nav feels ugly and overbearing, especially
while scrolling."* The mechanism is architectural, not cosmetic. The app is a
fixed-viewport layout (`apps/web/src/studio/shell.tsx:16` renders
`h-screen … overflow-hidden` with an inner scrolling div), so the global 54px
bar never scrolls away — which is fine and matches the design's `StudioBar`.
But the route detail page (`RouteDetailShell`) stacks THREE more permanently
pinned rows above its scroll container: the full editorial route header
(badge + 34px title + lede paragraph + a 5-column KPI strip with 38px
numerals) and the section anchor nav. Together ≈250–290px of chrome is fixed
on every route page — on a 768px-tall laptop that is more than a third of the
viewport, forever. The July 2026 design intends the opposite reading
experience: a slim persistent bar and question tabs, with the big header
content scrolling away like an article. Bonus bug: the section nav's
"Overview" link targets the pinned header itself
(`RouteDetailShell.tsx:25` puts `id={routeSectionAnchorId("overview")}` on an
element OUTSIDE the scroll container), so clicking it does nothing.

## Current state

### Files

- `apps/web/src/studio/shell.tsx` (61 lines) — global fixed-viewport shell.
  **Do not change its structure** — non-flush pages already scroll correctly
  under the slim bar; only route detail is broken.
- `apps/web/src/components/route/RouteDetailShell.tsx` (87 lines) — the route
  page chrome; the file this plan restructures.
- `apps/web/src/studio/pages/route-detail.tsx` (198 lines) — mounts
  `RouteDetailShell` (lines 71–120) and contains `RouteDetailLoadingPage`
  (lines 125–198) whose skeleton mirrors the pinned structure — it must be
  restructured in lockstep.
- `apps/web/src/studio/page.tsx` — `StudioPage` (`flush` = `h-full min-h-0`
  wrapper used by route detail).
- `apps/web/src/components/route/section-registry.ts` —
  `routeSectionAnchorId`, section list (referenced, not modified).

### Key excerpts (as of `ce3baca`)

`RouteDetailShell.tsx:22-66` — everything except `children` is outside the
scroll container (`shrink-0` rows in a `h-full` flex column):

```tsx
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header
        id={routeSectionAnchorId("overview")}
        className="shrink-0 bg-[var(--bp-color-card)] px-7 pb-6 pt-6 shadow-[inset_0_-1px_0_var(--bp-color-rule)] max-md:px-4"
      >
        {header}
      </header>
      <nav
        aria-label="Route page sections"
        className="shrink-0 overflow-x-auto bg-[var(--bp-color-card)] px-7 shadow-[inset_0_-1px_0_var(--bp-color-rule)] max-md:px-4"
      >
        ...
      </nav>
      <div className="min-h-0 flex-1 overflow-auto px-8 py-8 max-md:px-4">{children}</div>
    </div>
  );
```

`route-detail.tsx:58` — sections currently compensate with `scroll-mt-5`:

```tsx
      <section id={routeSectionAnchorId(sectionValue)} className="scroll-mt-5">
```

`route-detail.tsx:48-53` — KPI-strip navigation scrolls via
`scrollIntoView({ behavior: "smooth", block: "start" })`.

`shell.tsx:16,37` — the global shell (KEEP AS IS):

```tsx
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--bp-color-canvas)] text-[var(--bp-color-ink)]">
      <header className="flex h-[54px] shrink-0 items-center gap-8 ..." >
      ...
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
```

### Design authority (July 4 2026 export — quote-level facts the executor has not read)

- `knowledge/raw/design-handoffs/bus-priority-impact-studio-2026-07-04/verdict-shell.jsx:117-145`
  — `QuestionTabs`: a single slim tab row (`fontSize: 12.5`, `padding: '11px 0'`,
  active = `inset 0 -2px 0` ink underline, count badges as severity dot +
  number). This is the ONE element that should persist while reading.
- `verdict-shell.jsx:148-163` — `VerdictRouteHeader`: compact title row
  (21px title, geo line, posture pill, one action) that scrolls with the page.
- `screenshots/v-compA-top.png` — composition reference: slim global bar,
  header block, KPI strip, tabs, then content; the page reads as a document.
- Design doctrine (`knowledge/wiki/engineering/studio_design_pass_status.md`):
  incremental repairs; validate desktop AND mobile screenshots before calling
  a design pass done.

### Conventions

- Tailwind v4 utility classes with CSS-var tokens (`var(--bp-color-*)`) —
  match the existing class style in `RouteDetailShell.tsx`.
- `position: sticky` works inside the shell's inner scroll container (nearest
  scrolling ancestor) — no portal/JS scroll listeners; do not add any.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web types | `bun --filter @bp/web typecheck` | exit 0 |
| Shared web tests | `bun run test:web` | exit 0 |
| Worker harness | `bun run test:worker` | exit 0 |
| Build + bundle budget | `bun --filter @bp/web build` | exit 0 |
| Style | `bun run check:style` | exit 0 |
| Dev server (manual check) | `bun run dev` | serves the app locally |

## Scope

**In scope** (the only files you should modify):

- `apps/web/src/components/route/RouteDetailShell.tsx`
- `apps/web/src/studio/pages/route-detail.tsx` (section `scroll-mt` + loading page)

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/studio/shell.tsx` — the global bar is correct; changing the
  app to body-scroll would ripple through every page's layout assumptions.
- `apps/web/src/components/route/RoutePublicAtoms.tsx`,
  `RoutePublicKpiStrip.tsx` — header CONTENT/typography is plan 034.
- `apps/web/src/router.tsx` / scroll-restoration config.
- Any other page (`home.tsx`, `interventions.tsx`, …) — they already scroll
  correctly.

## Git workflow

- Branch: `codex/033-route-shell-scroll-chrome` from `origin/main`.
- Commit style: short imperative subject (match `git log --oneline`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Move the route header inside the scroll container; make the nav sticky

Restructure `RouteDetailShell.tsx` to a single scrolling column:

```tsx
  return (
    <div className="h-full min-h-0 overflow-auto">
      <header
        id={routeSectionAnchorId("overview")}
        className="scroll-mt-16 bg-[var(--bp-color-card)] px-7 pb-6 pt-6 shadow-[inset_0_-1px_0_var(--bp-color-rule)] max-md:px-4"
      >
        {header}
      </header>
      <nav
        aria-label="Route page sections"
        className="sticky top-0 z-10 overflow-x-auto bg-[var(--bp-color-card)] px-7 shadow-[inset_0_-1px_0_var(--bp-color-rule)] max-md:px-4"
      >
        {/* inner row unchanged */}
      </nav>
      <div className="px-8 py-8 max-md:px-4">{children}</div>
    </div>
  );
```

Rules:

- The outer div is now THE scroll container for the whole route page
  (`overflow-auto`), replacing the inner content-only scroller.
- The `<nav>` keeps its exact inner markup (section links, badges); only the
  wrapper classes change (`shrink-0` → `sticky top-0 z-10`).
- The header loses `shrink-0` and gains `scroll-mt-16` so the "Overview"
  anchor lands below the sticky nav.

**Verify**: `bun --filter @bp/web typecheck` → exit 0.

### Step 2: Compensate section anchors for the sticky nav height

In `route-detail.tsx:58`, change the section wrapper `scroll-mt-5` →
`scroll-mt-16` (the sticky nav is ~40px tall; 4rem clears it with margin).
The KPI strip's `scrollIntoView` navigation (lines 48–53) needs no change —
`scroll-mt` applies to it too.

**Verify**: `bun --filter @bp/web typecheck` → exit 0.

### Step 3: Restructure the loading skeleton identically

`RouteDetailLoadingPage` (`route-detail.tsx:125-198`) mirrors the old pinned
structure (`shrink-0` header block at :129, `shrink-0` nav strip at :154,
inner scroller at :161). Apply the same restructure: one `overflow-auto`
column; skeleton header scrolls; skeleton nav strip `sticky top-0 z-10`;
content block loses its own `overflow-auto`. The pending→loaded transition
must not jump layout (same paddings and heights as Step 1's structure).

**Verify**: `bun run test:web` → exit 0 (route-detail-adjacent shared tests
still pass).

### Step 4: Manual behavior check (desktop + mobile widths)

Run `bun run dev`, open a rich route (e.g. `/routes/m15-sbs`) and confirm:

1. On load: global bar (54px) + full route header + KPI strip + section nav
   visible — unchanged first paint.
2. Scroll down: the route header and KPI strip scroll away; ONLY the global
   bar + the slim section nav remain (~94px total pinned chrome).
3. Click every section link including "Overview": the page scrolls to the
   section, heading NOT hidden under the sticky nav; "Overview" scrolls back
   to the top header (this was dead before).
4. At 375px width: sticky nav still horizontally scrollable; no horizontal
   page overflow; header wraps as before.
5. Navigate away and back (view transition): no double scrollbars, no frozen
   scroll position oddities.

Record the results (screenshots per repo practice if a browser tool is
available — desktop and mobile widths).

**Verify**: the 5 checks above all hold.

### Step 5: Full gates

**Verify**:
- `bun run test:web` → exit 0
- `bun run test:worker` → exit 0
- `bun --filter @bp/web build` → exit 0 (budget unchanged — this plan adds no imports)
- `bun run check:style` → exit 0

## Test plan

- Existing shared tests must stay green (`bun run test:web`); this plan is
  structural, and current tests assert content, not scroll containers.
- If `apps/web/test/shared/` contains a RouteDetailShell/section-nav DOM test
  (check with `ls apps/web/test/shared/ | grep -i 'shell\|section'`), update
  its structural expectations; otherwise add ONE small test asserting the nav
  element has the `sticky` class and the header carries the overview anchor id
  — model it on any neighboring `*.test.ts` that renders a component with
  `react-dom/server` or testing-library (match whichever pattern the existing
  shared tests use).
- The main verification is Step 4's manual matrix — scroll behavior is not
  unit-testable here.

## Done criteria

Machine-checkable plus the manual matrix. ALL must hold:

- [ ] `grep -n "sticky top-0" apps/web/src/components/route/RouteDetailShell.tsx` returns 1 match
- [ ] `grep -c "overflow-auto" apps/web/src/components/route/RouteDetailShell.tsx` returns 1 (the single page scroller)
- [ ] `grep -n "scroll-mt-16" apps/web/src/studio/pages/route-detail.tsx` matches the section wrapper
- [ ] `bun --filter @bp/web typecheck`, `bun run test:web`, `bun run test:worker`, `bun --filter @bp/web build`, `bun run check:style` all exit 0
- [ ] Step 4's five manual checks recorded as passing
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The sticky nav does not stick (indicates an intermediate `overflow` ancestor
  between it and the new scroll container — report the ancestor chain; do not
  add JS scroll listeners).
- The view-transition navigation (`viewTransitionName: "persistent-nav"` on
  the global header) visually breaks on route change after the restructure.
- Step 4 check 3 fails for anchors after adjusting `scroll-mt` once.
- You find yourself editing `shell.tsx`, `router.tsx`, or any page other than
  route-detail.

## Maintenance notes

- Plan 034 restyles the header content this plan un-pins (title scale, verdict
  lede, KPI weights). If 034 changes header height, no chrome math needs
  updating — nothing above the nav is pinned anymore.
- If a future design pass wants a condensed sticky KPI summary (the
  verdict-composition "fixed judged-KPI header" variant), implement it as a
  SECOND sticky row that appears on scroll — do not re-pin the full header.
- Reviewers: watch for regressions in deep-link behavior (`/routes/x#anchor`)
  — the hash now resolves against the page scroller.

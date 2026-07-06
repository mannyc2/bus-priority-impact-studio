# Plan 049: Shared design primitives — SectionCard, SourceNote, BoroughBadge, RouteBadge hardening, dead-component deletion

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (Generation 6 table).
>
> **Drift check (run first)**: Written against a DIRTY working tree at
> commit `ce3baca`, 2026-07-06. Compare the "Current state" excerpts against
> the live files; on mismatch, STOP. Plan 048 should land first (tokens);
> this plan works with either palette.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (new components + one surgical bug fix + deletion of
  zero-importer files)
- **Depends on**: 048 (recommended, not hard)
- **Category**: tech-debt (design system) + bug
- **Planned at**: commit `ce3baca` (dirty tree), 2026-07-06

## Why this matters

Three systemic problems from the operator's 2026-07-06 review get their
shared machinery here, so the page plans (052-059) converge instead of
re-diverging:

1. **Card-title anarchy.** Section titles render three ways today: 19px
   outside the card (`SectionHeader`), 15px `h2` outside, 14px inside
   (`ChartFrame`, ad-hoc divs). Operator: "standardize with: same header
   font size, same subheading font size, always inside the card the data is
   displayed on." → `SectionCard`.
2. **Citation blocks are unbounded text walls** ("huge blocks of arbitrary
   text nobody needs to see"), and the same citation renders twice when the
   served `citationKeys` array contains duplicate keys. Operator wants "some
   mostly hidden way of doing this that looks good design wise." →
   `SourceNote` (popover, deduped).
3. **The route header badge is broken and boroughs have no component.**
   The route-detail header does NOT use `RouteBadge` — it re-implements the
   roundel inline and appends `-SBS` to labels that already contain "SBS",
   rendering "M86 SBS-SBS" wrapped/clipped in a fixed-height box (the
   operator's "all I can see is 'SBS-'" report). → use `RouteBadge`
   everywhere, harden its normalization, add `BoroughBadge` ("we should have
   some special component for it").

Also deletes four dead components left behind by earlier design passes.

## Current state

- `apps/web/src/components/route/RoutePublicAtoms.tsx:72-78` — the buggy
  inline header badge:

  ```tsx
  <div
    className="inline-flex h-10 min-w-[82px] items-center justify-center rounded-[3px] px-3 font-mono text-[17px] font-bold text-white"
    style={{ backgroundColor: route.sbs ? "var(--bp-color-accent)" : boroughColor(route) }}
  >
    {route.sbs ? `${route.label}-SBS` : route.label}
  </div>
  ```

  If `route.label` is `"M86 SBS"` and `route.sbs` is true, this renders
  literally `M86 SBS-SBS`; the string contains a space, the div has no
  `whitespace-nowrap`, and the fixed `h-10` clips the two wrapped lines.
  `boroughColor()` (same file, lines 342-349) maps borough → token.

- `apps/web/src/components/RouteBadge.tsx` (70 LOC) — the correct shared
  roundel. Its normalization (lines 43-48):

  ```tsx
  const base = route.replace(/[\s-]?SBS$/i, "").trim();
  const isSbs = sbs || base !== route;
  const display = isSbs ? `${base}-SBS` : base;
  ```

  It handles `"Q44 SBS"`/`"Q44-SBS"` but not `"Q44 +SBS"`, and today has
  zero usages in the route-detail header (it is used on home, interventions,
  and dev demos).

- `apps/web/src/components/ChartFrame.tsx` (33 LOC) — the ONLY existing
  inside-the-card title pattern; container class:
  `flex flex-col rounded-[3px] bg-[var(--bp-color-card)] p-[18px] shadow-[0_0_0_1px_var(--bp-color-rule)]`,
  title `text-sm font-semibold tracking-[-0.005em]`, source
  `mt-[3px] text-[11px] text-[var(--bp-color-ink-55)]`.

- `apps/web/src/components/SectionHeader.tsx` (26 LOC) — 19px
  outside-the-card title + sub. Stays for now (page plans migrate its
  callers, then plan 059's final ratchet removes it if unused — see
  maintenance notes).

- `apps/web/src/components/route/WikiEvidence.tsx` — `citationByKey()`
  (lines 12-16), `citationLabel()` (lines 18-22: joins
  `source / publisher / date / p. N`), and `CitationChips` (lines 24-68)
  which maps `citationKeys` with NO dedupe (lines 32-34) and renders one
  bordered chip per key — the unbounded text-wall the operator flagged.

- `apps/web/src/components/ui/popover.tsx` exports `Popover`,
  `PopoverTrigger`, `PopoverContent`, `PopoverHeader`, `PopoverTitle`,
  `PopoverDescription` (Base UI). Use these; do not add a dependency.

- Dead components (verified zero importers outside themselves and
  `src/dev/`): `apps/web/src/components/route/RouteMetricStrip.tsx` (48
  LOC), `apps/web/src/components/route/RouteVitalsCard.tsx` (43),
  `apps/web/src/components/StudioFooter.tsx` (30, imported only by
  `apps/web/src/dev/examples/studio-bar-demo.tsx`),
  `apps/web/src/components/route/InterventionsSection.tsx` (26, unrendered
  stub).

- Borough color mapping exists twice: `boroughStripe` record in
  `apps/web/src/studio/pages/home.tsx:43-49` and `boroughColor()` in
  `RoutePublicAtoms.tsx:342-349`.

- Test conventions: `apps/web/test/shared/*.test.ts`, `bun:test` +
  `renderToStaticMarkup` from `react-dom/server` + `expect(html).toContain(…)`
  string assertions. Exemplar: `apps/web/test/shared/route-detail-shell.test.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun --filter @bp/web typecheck` | exit 0 |
| Shared web tests | `bun run test:web` | all pass, incl. new tests |
| Build + budget | `bun --filter @bp/web build` | "Bundle within budget." |
| Style | `bun run check:style` | exit 0 |

## Scope

**In scope**:
- CREATE `apps/web/src/components/SectionCard.tsx`
- CREATE `apps/web/src/components/SourceNote.tsx`
- CREATE `apps/web/src/components/BoroughBadge.tsx`
- CREATE `apps/web/src/lib/borough.ts` (shared borough→color mapping)
- EDIT `apps/web/src/components/ChartFrame.tsx` (reimplement on SectionCard)
- EDIT `apps/web/src/components/RouteBadge.tsx` (normalization hardening)
- EDIT `apps/web/src/components/route/RoutePublicAtoms.tsx` (use RouteBadge)
- DELETE `RouteMetricStrip.tsx`, `RouteVitalsCard.tsx`, `StudioFooter.tsx`,
  `route/InterventionsSection.tsx`; EDIT `dev/examples/studio-bar-demo.tsx`
  to drop the StudioFooter usage
- CREATE tests: `apps/web/test/shared/route-badge.test.ts`,
  `apps/web/test/shared/source-note.test.ts`,
  `apps/web/test/shared/section-card.test.ts`
- `plans/README.md` (status row)

**Out of scope**:
- Migrating existing sections onto SectionCard/SourceNote — plans 053-058
  own their sections; do not sweep-refactor here.
- `SectionHeader.tsx` deletion — it still has callers until those plans land.
- `CitationChips` deletion — still used by TreatmentsHistorySection and
  RoutePublicAtoms until plan 057 replaces those call sites.
- Any change to header layout/stats (plan 053) or home page (plan 052).

## Git workflow

- Branch: `codex/049-shared-primitives`
- Commit style: short imperative subject; one commit per step group is fine.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: `SectionCard` + ChartFrame reimplementation

Create `apps/web/src/components/SectionCard.tsx`:

```tsx
import type { ReactNode } from "react";

/** The single approved section container: title INSIDE the card it titles.
 * Title 15px/semibold, sub 11.5px muted — every route/home/interventions
 * section converges on this (design doctrine 2026-07-06). */
export function SectionCard({
  title,
  sub,
  right,
  children,
  bodyClassName,
}: {
  title: string;
  sub?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className="flex flex-col rounded-[3px] bg-[var(--bp-color-card)] p-[18px] shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="mb-3.5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="m-0 text-[15px] font-semibold leading-tight tracking-[-0.005em]">
            {title}
          </h2>
          {sub ? (
            <div className="mt-[3px] text-[11.5px] leading-normal text-[var(--bp-color-ink-55)]">
              {sub}
            </div>
          ) : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className={bodyClassName ?? "min-w-0"}>{children}</div>
    </section>
  );
}
```

Reimplement `ChartFrame.tsx` as a thin wrapper so all framed charts pick up
the standard header (title moves 14px→15px; that is the intended
convergence): keep its exact public API (`title?`, `source?`, `right?`,
`height`, `children`); when `title` is present render `SectionCard` with
`sub={source}` and a `<div style={{ minHeight: height }}>` body; when
absent keep the bare container div as today.

**Verify**: `bun --filter @bp/web typecheck` → exit 0; `bun run test:web`
→ all pass (no existing test pins ChartFrame's 14px class).

### Step 2: `borough.ts` + `BoroughBadge`

Create `apps/web/src/lib/borough.ts`:

```ts
export const BOROUGH_COLOR: Record<string, string> = {
  Manhattan: "var(--bp-route-manhattan)",
  Bronx: "var(--bp-route-bronx)",
  Brooklyn: "var(--bp-route-brooklyn)",
  Queens: "var(--bp-route-queens)",
  "Staten Island": "var(--bp-route-si)",
};

export function boroughColor(borough: string): string {
  const key = borough.toLowerCase();
  if (key.includes("brooklyn")) return BOROUGH_COLOR.Brooklyn as string;
  if (key.includes("bronx")) return BOROUGH_COLOR.Bronx as string;
  if (key.includes("queens")) return BOROUGH_COLOR.Queens as string;
  if (key.includes("staten")) return BOROUGH_COLOR["Staten Island"] as string;
  return BOROUGH_COLOR.Manhattan as string;
}
```

(Behavior copied from `RoutePublicAtoms.tsx:342-349` so existing rendering
is unchanged.) Create `apps/web/src/components/BoroughBadge.tsx`: an
inline-flex chip — colored dot (`h-2 w-2 rounded-full`, background from
`boroughColor`) + borough name, classes
`inline-flex items-center gap-1.5 rounded-[3px] bg-[var(--bp-color-ink-06)] px-2 py-0.5 text-[11px] font-medium text-[var(--bp-color-ink-70)]`.
Point `RoutePublicAtoms.tsx`'s local `boroughColor()` callers at the new
module and delete the local copy. Do NOT touch `home.tsx`'s
`boroughStripe` (plan 052 rewrites that file).

**Verify**: `bun --filter @bp/web typecheck` → exit 0.

### Step 3: Harden `RouteBadge` normalization + adopt it in the header

1. In `RouteBadge.tsx:46`, widen the suffix strip to tolerate the `+SBS`
   and doubled forms seen in served labels:

   ```tsx
   const base = route.replace(/[\s+-]*SBS\s*$/i, "").trim();
   ```

2. In `RoutePublicAtoms.tsx`, replace the inline badge div (lines 72-78,
   excerpt above) with:

   ```tsx
   <RouteBadge route={route.label} sbs={route.sbs} size="xl" express={false} />
   ```

   Import it from `@/components/RouteBadge`. Keep the surrounding grid; the
   `86px` first column may need to become `auto` —
   `grid-cols-[auto_minmax(0,1fr)]` — so the wider xl roundel fits. Note
   express detection: `StudioRoute` has no express flag in the detail
   payload; pass `express={false}` (matches today's behavior, where express
   styling only came from borough color fallthrough).

**Verify**: `bun run test:web` → route-public-atoms tests pass (they exist:
`apps/web/test/shared/route-public-atoms.test.ts`; update expectations ONLY
if they pin the old inline-div markup — e.g. assertions on `h-10` or
`min-w-[82px]` — to instead assert the rendered label text).

### Step 4: `SourceNote`

Create `apps/web/src/components/SourceNote.tsx` — the single approved
provenance affordance ("mostly hidden"): a quiet trigger that opens a
popover listing deduped entries.

```tsx
import type { ReactNode } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  citationByKey,
  citationLabel,
  type WikiCitationEvidence,
} from "@/components/route/WikiEvidence";

export type SourceNoteEntry = { label: string; href?: string; detail?: string };

/** Resolve citation keys to deduped entries (dupes in served citationKeys
 * arrays are a known data issue — dedupe by key, then by label). */
export function citationEntries(
  evidence: WikiCitationEvidence | null,
  citationKeys: readonly string[],
): SourceNoteEntry[] {
  const byKey = citationByKey(evidence);
  const seen = new Set<string>();
  const entries: SourceNoteEntry[] = [];
  for (const key of citationKeys) {
    const citation = byKey.get(key);
    if (citation === undefined) continue;
    const label = citationLabel(citation);
    const dedupe = citation.key || label;
    if (seen.has(dedupe) || seen.has(label)) continue;
    seen.add(dedupe);
    seen.add(label);
    entries.push({ label, ...(citation.sourceUrl ? { href: citation.sourceUrl } : {}) });
  }
  return entries;
}

export function SourceNote({
  label = "Sources",
  entries,
}: {
  label?: string;
  entries: readonly SourceNoteEntry[];
}) {
  if (entries.length === 0) return null;
  return (
    <Popover>
      <PopoverTrigger className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-[var(--bp-color-ink-55)] underline decoration-dotted underline-offset-2 hover:text-[var(--bp-color-ink)]">
        {label} ({entries.length})
      </PopoverTrigger>
      <PopoverContent align="start" className="max-w-[360px] p-3">
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {entries.map((entry) => (
            <li key={entry.label} className="text-[11.5px] leading-[1.45]">
              {entry.href ? (
                <a href={entry.href} target="_blank" rel="noreferrer" className="text-[var(--bp-color-accent)] underline-offset-2">
                  {entry.label}
                </a>
              ) : (
                <span className="text-[var(--bp-color-ink-70)]">{entry.label}</span>
              )}
              {entry.detail ? (
                <div className="text-[10.5px] text-[var(--bp-color-ink-55)]">{entry.detail}</div>
              ) : null}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
```

Match the file to the repo's biome style on save. Entries with plain facts
(no href) make this double as the "how much data we have" disclosure — e.g.
`entries={[{ label: "36 months of segment speeds, Jun 2023 – May 2026" }]}`
with `label="About this data"`.

**Verify**: `bun --filter @bp/web typecheck` → exit 0.

### Step 5: Delete the dead components

Delete `apps/web/src/components/route/RouteMetricStrip.tsx`,
`apps/web/src/components/route/RouteVitalsCard.tsx`,
`apps/web/src/components/StudioFooter.tsx`,
`apps/web/src/components/route/InterventionsSection.tsx`. Remove the
`StudioFooter` import/usage from `apps/web/src/dev/examples/studio-bar-demo.tsx`
(keep the rest of the demo).

**Verify** (before deleting, re-confirm zero importers):
`rg -l "RouteMetricStrip|RouteVitalsCard|StudioFooter|route/InterventionsSection" apps/web/src`
→ only the four files themselves + `studio-bar-demo.tsx`. After deleting:
`bun --filter @bp/web typecheck` → exit 0.

### Step 6: Full gate

**Verify**: `bun --filter @bp/web typecheck && bun run test:web && bun --filter @bp/web build && bun run check:style` → all pass.

## Test plan

New tests, modeled after `apps/web/test/shared/route-detail-shell.test.ts`
(bun:test + `renderToStaticMarkup` + `toContain`):

- `route-badge.test.ts`: render `RouteBadge` with `route`/`sbs` combos —
  `("M86", true)` → contains `M86-SBS`; `("M86 SBS", true)` → contains
  `M86-SBS` and does NOT contain `SBS-SBS`; `("M86-SBS", false)` →
  `M86-SBS`; `("M86 +SBS", false)` → `M86-SBS`; `("B41", false)` → `B41`
  with no `-SBS`. Also: rendered markup contains `whitespace-nowrap`.
- `source-note.test.ts`: (a) duplicate citation keys in `citationKeys`
  render ONE entry (build a `WikiCitationEvidence` fixture with one
  citation, pass `["k1","k1"]`, assert the label appears exactly once —
  `html.split(label).length === 2`); (b) unresolvable keys render nothing
  (`SourceNote` given `citationEntries(null, ["x"])` returns empty → HTML
  is empty string); (c) `href` entries render an `<a>` with
  `rel="noreferrer"`.
- `section-card.test.ts`: title renders inside the card container element;
  `sub` renders when given; `right` slot renders.

**Verification**: `bun run test:web` → all pass including the new files.

## Done criteria

- [ ] `bun --filter @bp/web typecheck` exit 0
- [ ] `bun run test:web` exit 0 with the 3 new test files running
- [ ] `rg -l "StudioFooter|RouteMetricStrip|RouteVitalsCard" apps/web/src` → 0 files
- [ ] `rg -n "SBS-SBS" apps/web/src` → 0 matches (nothing can render it; test proves it)
- [ ] `bun --filter @bp/web build` exit 0, "Bundle within budget."
- [ ] `bun run check:style` exit 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The inline badge div in `RoutePublicAtoms.tsx` doesn't match the excerpt
  (lines 72-78) — the header may already be mid-rebuild by plan 053.
- `route-public-atoms.test.ts` failures that are NOT markup-pin updates
  (i.e., a behavioral regression in header rendering).
- Popover primitives fail to render under `renderToStaticMarkup` (Base UI
  portal issue) — if `source-note.test.ts` cannot assert popover CONTENT
  statically, assert the trigger text + entry-building function
  (`citationEntries`) as pure-function tests instead, and note it in the
  README row. Do not pull in a DOM emulator.
- Any file outside the scope list needs edits to keep typecheck green.

## Maintenance notes

- Plans 052-058 must consume these primitives (SectionCard for every
  titled section, SourceNote for every citation/coverage affordance,
  BoroughBadge in the route header and directory groups). Reviewers should
  reject new ad-hoc card headers or citation chips in those PRs.
- `SectionHeader.tsx` (19px outside-card header) becomes legacy the moment
  sections migrate; plan 059's doctrine ratchet checks for remaining
  callers, and it should be deleted when the count hits zero.
- `CitationChips` in `WikiEvidence.tsx` is replaced at its call sites by
  plan 057; delete it there, not here.
- The `citationKeys` duplicate-key data issue also deserves a pipeline-side
  dedupe someday (mta-wiki export); `citationEntries` makes the UI immune
  regardless.

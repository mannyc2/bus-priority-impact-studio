# Plan 048: Adopt the MTA visual language — cool signage palette, MTA-blue accent, black nav bar

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (Generation 6 table).
>
> **Drift check (run first)**: This plan was written against a DIRTY working
> tree (the uncommitted gen-4/5 execution) at commit `ce3baca`, 2026-07-06.
> `git diff --stat ce3baca..HEAD` is therefore NOT a reliable drift signal.
> Instead, compare the "Current state" excerpts below against the live files;
> on any mismatch, treat it as a STOP condition. Before starting, confirm the
> operator has committed the current working tree (ask; do not commit it
> yourself).

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (global token swap touches every page's rendering, but all
  consumers reference CSS variables, so the blast radius is visual, not
  functional)
- **Depends on**: none (first plan of generation 6)
- **Category**: direction (design system)
- **Planned at**: commit `ce3baca` (dirty tree), 2026-07-06

## Why this matters

The operator's 2026-07-06 design verdict: "This site does not feel very
'MTA' to me which is a problem. I think its all the browns and off white.
We should move towards more MTA." The site is a portfolio piece aimed at
MTA data/software roles; the current "warm civic/editorial" palette (the
May "tarbell" system: warm-white surface ladder at hue ~75, warm near-black
ink, muted blue accent) reads as a newspaper, not a transit authority. MTA
visual identity is: white/near-white surfaces, true black signage bars with
white Helvetica, MTA Blue (Pantone 286, `#0039a6`) as the working accent,
and colored route roundels. The body font is already the right Helvetica
stack; this plan swaps the color system and restyles the top nav into an
MTA-signage black bar. Every later gen-6 plan builds on these tokens.

This plan supersedes the "warm paper/card surfaces … as the current visual
language" doctrine recorded in
`knowledge/wiki/engineering/studio_design_pass_status.md` (lines 69-71).
The operator's 2026-07-06 critique is the new design authority.

## Current state

- `apps/web/src/global.css` — single source of design tokens (Tailwind v4;
  tokens are CSS custom properties on `:root`, mapped into Tailwind via the
  `@theme inline` block at lines 286-328). The warm ladder today
  (`global.css:13-27`):

  ```css
  --bp-color-canvas: #f0eee9;
  --bp-color-paper: #f4f1ea;
  --bp-color-paper-deep: #ece7db;
  --bp-color-card: oklch(0.99 0.007 75);
  --bp-color-card-raised: oklch(0.995 0.004 75);
  --bp-color-ink: #16140f;
  --bp-color-ink-70: rgba(22, 20, 15, 0.7);
  --bp-color-ink-55: rgba(22, 20, 15, 0.66);
  --bp-color-ink-40: rgba(22, 20, 15, 0.4);
  --bp-color-ink-20: rgba(22, 20, 15, 0.2);
  --bp-color-ink-10: rgba(22, 20, 15, 0.1);
  --bp-color-ink-06: rgba(22, 20, 15, 0.06);
  --bp-color-rule: rgba(22, 20, 15, 0.14);
  --bp-color-accent: oklch(0.42 0.13 252);
  --bp-color-accent-bg: oklch(0.95 0.04 252);
  ```

  Borough roundel colors (`global.css:37-42`) are KEPT as-is — the operator
  likes the route-badge system: `--bp-route-manhattan: #0039a6`,
  `--bp-route-bronx: #c81f18`, `--bp-route-brooklyn: #6e3219`,
  `--bp-route-queens: #a83f00`, `--bp-route-si: #6e4c9f`,
  `--bp-route-express: #00752f`. Semantic tone tokens
  (`--bp-color-bad/warn/good` + `-bg` variants, `global.css:31-36`) are
  KEPT as-is (they are severity colors, not part of the warm ladder).

- `apps/web/src/components/route/maplibre-style.ts:4-20` — `MAP_COLORS`
  duplicates the palette as literals because MapLibre canvases cannot read
  CSS variables:

  ```ts
  export const MAP_COLORS = {
    paper: "#f4f1ea",
    card: "oklch(0.99 0.007 75)",
    ink: "#16140f",
    ink70: "rgba(22, 20, 15, 0.7)",
    ...
    water: "oklch(0.9 0.016 234)",
  } as const;
  ```

- `apps/web/src/studio/shell.tsx` (61 LOC) — the app shell. Header today is
  a light bar: `bg-[var(--bp-color-card)]` with ink text (line 18); nav
  links active state = ink underline (`shadow-[inset_0_-2px_0
  var(--bp-color-ink)]`, line 54). Brand block (lines 21-27) renders
  `StudioMark` + "Bus Priority **Impact Studio**".

- `apps/web/src/components/StudioMark.tsx` — the logo SVG already supports
  `tone: "dark" | "light"` (light = paper-colored rect on ink); default is
  `"dark"`.

- Repo conventions: Tailwind arbitrary values reference tokens as
  `bg-[var(--bp-color-…)]`; do not introduce new Tailwind theme keys; match
  `biome` formatting (2-space, double quotes; `bun run check:style` gates).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck (scoped — repo-wide OOMs) | `bun --filter @bp/web typecheck` | exit 0 |
| Shared web tests | `bun run test:web` | all pass |
| Build + bundle budget | `bun --filter @bp/web build` | exit 0, "Bundle within budget." |
| Style | `bun run check:style` | exit 0 |
| Dev server (visual spot-check) | `bun --filter @bp/web dev` | serves on localhost |

## Scope

**In scope** (the only files you should modify):
- `apps/web/src/global.css`
- `apps/web/src/components/route/maplibre-style.ts` (MAP_COLORS values only)
- `apps/web/src/studio/shell.tsx`
- `apps/web/test/shared/maplibre-style.test.ts` (only if a color literal is
  asserted — none was found at planning time)
- `knowledge/wiki/engineering/studio_design_pass_status.md`, `knowledge/log.md`
  (doctrine record)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `--bp-route-*` borough colors and `RouteBadge.tsx` — deliberately kept.
- `--bp-color-bad/warn/good` (+`-bg`) severity tokens — semantic, kept.
- The speed-color ramp and severity functions inside `maplibre-style.ts`
  (anything below MAP_COLORS) — data encoding, not surface palette.
- `apps/web/src/studio/pages/home.tsx` — its hardcoded
  `rgba(244,241,234,…)` literals live in sections that plan 052 deletes
  outright; restyling them here is wasted work.
- Any component-level color/typography changes — plans 049-059 own those.

## Git workflow

- Branch: `codex/048-mta-visual-language` (repo convention: `codex/NNN-slug`)
- Commit style: short imperative subject (match `git log`: "Serve compact
  route hourly profiles"). One commit for tokens+map, one for shell is fine.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Swap the surface/ink/accent tokens in `global.css`

Replace ONLY the values of the following custom properties in the `:root`
block (`global.css:13-27`), keeping every property name and the rest of the
file untouched:

```css
  --bp-color-canvas: #f4f5f7;
  --bp-color-paper: #fafbfc;
  --bp-color-paper-deep: #eceef1;
  --bp-color-card: #ffffff;
  --bp-color-card-raised: #ffffff;
  --bp-color-ink: #101418;
  --bp-color-ink-70: rgba(16, 20, 24, 0.72);
  --bp-color-ink-55: rgba(16, 20, 24, 0.6);
  --bp-color-ink-40: rgba(16, 20, 24, 0.42);
  --bp-color-ink-20: rgba(16, 20, 24, 0.2);
  --bp-color-ink-10: rgba(16, 20, 24, 0.1);
  --bp-color-ink-06: rgba(16, 20, 24, 0.06);
  --bp-color-rule: rgba(16, 20, 24, 0.14);
  --bp-color-accent: #0039a6;
  --bp-color-accent-bg: #e8eef8;
```

Also update the two neutral chart series anchors (`global.css:29-30`):
`--bp-color-series-a: #0039a6;` and leave `--bp-color-series-b` unchanged.
Update the comment block above the ladder (`global.css:7-12`) to describe
the new system in one or two lines (cool near-white ladder, true white
cards, MTA Blue #0039a6 accent — Pantone 286; warm tarbell ladder retired
2026-07-06 by operator verdict). Do not change spacing/radius/shadow/layout
tokens or the `@theme inline` block.

**Verify**: `rg -n "f0eee9|f4f1ea|ece7db|22, 20, 15" apps/web/src/global.css`
→ no matches. `bun run check:style` → exit 0.

### Step 2: Mirror the palette into `MAP_COLORS`

In `apps/web/src/components/route/maplibre-style.ts:4-20`, update the
literal values to match step 1 exactly: `paper: "#fafbfc"`,
`card: "#ffffff"`, `ink: "#101418"`, the six ink alphas to
`rgba(16, 20, 24, …)` with the same alpha values as step 1,
`rule: "rgba(16, 20, 24, 0.14)"`, `accent: "#0039a6"`. Keep `bad`, `warn`,
`good`, and `water` unchanged.

**Verify**: `rg -n "22, 20, 15|#f4f1ea|#16140f" apps/web/src/components/route/maplibre-style.ts`
→ no matches. `bun run test:web` → all pass (at planning time
`apps/web/test/shared/maplibre-style.test.ts` asserts structure, not hex
values; if a hex assertion fails, update only that expectation to the new
value).

### Step 3: Restyle the shell header as an MTA signage bar

In `apps/web/src/studio/shell.tsx`:

1. Header container (line 17-20): change
   `bg-[var(--bp-color-card)] … shadow-[inset_0_-1px_0_var(--bp-color-rule)]`
   to a black signage bar:
   `bg-[var(--bp-color-ink)]` with no bottom hairline (the contrast is the
   separator). Keep height `h-[54px]`, paddings, and
   `viewTransitionName: "persistent-nav"`.
2. Brand block (lines 21-27): pass `tone="light"` to `StudioMark`; brand
   text becomes `text-white` for "Bus Priority" and
   `text-[rgba(255,255,255,0.65)]` for "Impact Studio".
3. `StudioNavLink` (lines 48-60): active =
   `text-white shadow-[inset_0_-2px_0_#ffffff]` (white underline, MTA
   signage style — MTA blue is illegible on near-black); inactive =
   `text-[rgba(255,255,255,0.65)] hover:text-white`. Keep font sizes and
   `viewTransition`.

Target shape for the link class strings:

```tsx
active
  ? "shrink-0 pb-[2px] text-[13px] font-semibold text-white no-underline shadow-[inset_0_-2px_0_#ffffff]"
  : "shrink-0 pb-[2px] text-[13px] font-normal text-[rgba(255,255,255,0.65)] no-underline hover:text-white"
```

**Verify**: `bun --filter @bp/web typecheck` → exit 0. Then
`bun --filter @bp/web dev` and load `/` — the top bar renders black with
white nav text, page surfaces render cool white/gray (no warm beige), links
and focus rings render MTA blue. (HTTP smoke only if no browser: the
change is class-string only, covered by typecheck + style.)

### Step 4: Repo-wide warm-literal sweep

**Verify**: `rg -n "f0eee9|f4f1ea|ece7db|22, 20, 15" apps/web/src --glob '!**/dev/**'`
→ the ONLY remaining matches are in `apps/web/src/studio/pages/home.tsx`
(the `rgba(244,241,234,…)` trust-strip literals are a different string and
are deleted by plan 052 — `rg -n "244,241,234|244, 241, 234" apps/web/src`
matching only `home.tsx` is acceptable). Any other match is a missed
consumer: update it to tokens.

### Step 5: Record the doctrine change in the wiki

Append to `knowledge/wiki/engineering/studio_design_pass_status.md` a new
dated subsection under "Current design source" stating: the 2026-07-06
operator critique supersedes the July-4 export's warm/editorial tokens; the
visual language is now "MTA signage": white/cool-gray surfaces, true-white
cards, ink `#101418`, MTA Blue `#0039a6` accent, black nav bar, Helvetica
(unchanged), borough roundels (unchanged); gen-6 plans 048-059 implement
it. Add a one-line `## [2026-07-06] design | MTA visual language cutover`
entry to `knowledge/log.md`. Keep both edits short; do not rewrite history
sections.

**Verify**: `bun run check:knowledge` → exit 0.

### Step 6: Full gate

**Verify**: `bun --filter @bp/web typecheck && bun run test:web && bun --filter @bp/web build && bun run check:style`
→ all exit 0; build prints "Bundle within budget." (CSS-only + class-string
changes cannot move the JS budget; if it trips, something unrelated drifted
— STOP.)

## Test plan

No new tests: this plan changes token values and class strings, which the
repo deliberately does not pin in tests (verified: `maplibre-style.test.ts`
and `route-detail-shell.test.ts` assert structure/behavior, not colors).
The gate is the full existing suite (`bun run test:web`) plus the grep
sweeps in steps 1, 2, and 4.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `rg -n "f0eee9|f4f1ea|ece7db|22, 20, 15" apps/web/src --glob '!**/dev/**'` → 0 matches outside `studio/pages/home.tsx`
- [ ] `rg -n '"#0039a6"' apps/web/src/components/route/maplibre-style.ts` → 1 match (accent)
- [ ] `bun --filter @bp/web typecheck` exit 0
- [ ] `bun run test:web` exit 0
- [ ] `bun --filter @bp/web build` exit 0 with "Bundle within budget."
- [ ] `bun run check:style` exit 0
- [ ] `bun run check:knowledge` exit 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `:root` token block in `global.css` does not match the "Current
  state" excerpt (another plan/agent got there first).
- Any test failure is NOT a color-literal expectation (behavioral failures
  mean a consumer depended on a computed color — report it).
- You find a Tailwind class like `bg-[#f4f1ea]` (hex inline, not via token)
  in more than 3 files during step 4 — the sweep scope was mis-estimated;
  report the census instead of restyling ad hoc.
- The operator has not committed the current working tree and cannot be
  reached — do not start work on top of 374 uncommitted files.

## Maintenance notes

- MapLibre cannot read CSS variables, so `MAP_COLORS` MUST be updated in
  lockstep with `global.css` forever. A follow-up could generate one from
  the other; not planned now.
- `home.tsx` still contains warm literals until plan 052 deletes those
  sections — reviewers should not flag them in this PR.
- Reviewer should eyeball `/`, `/routes/m15-sbs`, `/map`, `/interventions`
  in the dev server: black bar, white cards, MTA-blue accents, no beige.
- Deferred: borough color refinements (Brooklyn `#6e3219` is muddy on the
  new white surfaces) — operator taste call, not planned.

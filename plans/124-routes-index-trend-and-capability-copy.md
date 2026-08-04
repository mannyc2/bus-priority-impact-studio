# Plan 124: Routes-index trend column honesty + capability reasons stop leaking to public copy

> **Executor instructions**: Follow this plan step by step; run every
> verification and confirm the expected result. On any STOP condition, stop
> and report. When done, update this plan's status row in `plans/README.md`
> (Generation 21 section).
>
> **Branch base**: audited against `origin/main@e0c00aaf`. Branch off current
> `origin/main` — NOT the stale local `ops/gen18-artifact-publication` tree.
>
> **Drift check (run first)**:
> `git fetch origin && git diff --stat e0c00aaf..origin/main -- apps/web/src/studio/pages/routes-directory.tsx apps/web/src/studio/pages/home.tsx apps/web/src/components/route/HonestEmptySection.tsx apps/web/src/components/route/rider-impact-summary.ts`
> On drift, compare excerpts; unexplained mismatch = STOP.

## Status

- **Priority**: P1
- **Effort**: S-M (grew by two steps in the 2026-08-02 bug sweep)
- **Risk**: LOW
- **Depends on**: none (client half). The DATA half — trend/spark actually
  populating — is owned by plan 116's amended G2/G4 gates, not this plan.
- **Category**: bug
- **Planned at**: commit `e0c00aaf` (origin/main), 2026-08-02

## Why this matters

Two related honesty failures, one shared root cause:

1. **The "12-mo trend" column on /routes (and the homepage preview) is blank
   for every route.** Probed 2026-08-02 on the active release
   (`pub_20260801T232501631Z`): the schema-3 routes index serves
   `spark: null` AND `movement6mPct: null` for **375/375 routes**, while the
   route-DETAIL response for the same routes carries real movement values
   (bx20: `movement6mPct: 1.4`). The index projection was built without the
   trend/history inputs — exactly what the served capability admits
   (`speedHistory: {"state":"building","reason":"speed months present,
   history artifact not built"}`). The row component then renders `null` for
   a null spark — a silent blank cell under a labeled column header.
2. **Raw pipeline diagnostics render as public copy.** The route-detail
   honest-empty placeholder prints the capability `reason` string verbatim in
   mono under "Pipeline still building." — the literal
   "speed months present, history artifact not built" originates at
   `packages/analytics/src/evaluation/build-route-capability-manifest.ts:173`
   and reaches the public page untouched. `rider-impact-summary.ts` has the
   same leak (`capability?.reason ?? "Monthly ridership not attached yet."`).
   The four honest-empty STATES are a designed, sanctioned feature (frontend
   §8.2 — the credibility system); the raw internal reason line is not, and
   the repo's own taste rule says check/gate internals never render on faces.

For the avoidance of doubt on the chart question: the trend cell already
uses the repo's chart convention — `Spark` is the lazy two-file chart pair
(`apps/web/src/components/Spark.tsx` + `Spark.chart.tsx`), which IS the
sanctioned chart-lib pattern. No library change is needed or wanted here;
the fixes are a data gate (116) and honest fallbacks (this plan).

**Amendment (2026-08-02, operator bug sweep — two additions, one
supersession).** The operator rejected two more pieces of capability
vocabulary on public faces, extending this plan's theme:

3. **The `checked_clean` empty state reads as pipeline internals.** A route
   with no treatments-and-history content renders a tab badge "Checked"
   (`RouteDetailShell.tsx:105-106`) and the empty panel "Checked clean /
   Detectors ran; no publishable signal." (`HonestEmptySection.tsx:13-18`)
   over the mono reason line ("no bus lane or ACE treatment on record").
   "Checked" as a badge is meaningless to a rider and the body is detector
   vocabulary on a public face. THIS SUPERSEDES this plan's own
   "keep the four state titles/bodies verbatim" out-of-scope rule — for the
   `checked_clean` member only; Building/Thin/Blocked copy stays verbatim.
   The §8.2 credibility claim (we looked and found nothing) must survive
   the rewording.
4. **The /routes filter input drifted off the search primitive.** The call
   site (`routes-directory.tsx:155-161`) overrides `SearchField` with
   `border-[1px] … shadow-none`, flattening the homepage's white
   card/ink-border/offset-shadow treatment into a thin grey-reading box.
   Operator: make it read like the homepage "Find a route" input — reuse
   the primitive's presentation, don't restyle per page.

## Current state (origin/main excerpts)

`apps/web/src/studio/pages/routes-directory.tsx:37-42` and `:72-85` —
`RouteIndexRow` is SHARED by `/routes` and the homepage preview:

```tsx
function trendStatus(movement6mPct: number | null): { status: string; tone: Tone } {
  if (movement6mPct === null) return { status: "No trend", tone: "neutral" };
  ...
}
      <div className="max-md:hidden">
        {route.spark === null ? null : (
          <Spark data={route.spark} width={104} height={22} color={toneColor[tone]} fill />
        )}
      </div>
      ...
      <div ... style={{ color: toneColor[tone] }}>
        {status}
      </div>
```

Column headers: `routes-directory.tsx:169` and `home.tsx:207` — `<span>12-mo
trend</span>`. So today every row shows a labeled empty cell plus a
right-side "No trend" label.

`apps/web/src/components/route/HonestEmptySection.tsx:19-24, 53-55`:

```tsx
  building: { ..., title: "Building", body: "Pipeline still building." },
  ...
      {reason ? (
        <p className="m-0 font-mono text-[11px] text-[var(--bp-color-ink-55)]">{reason}</p>
      ) : null}
```

Mounted at `apps/web/src/studio/pages/route-detail.tsx:103`
(`<HonestEmptySection state={presentation.state} reason={presentation.reason} />`).

`apps/web/src/components/route/rider-impact-summary.ts` (locate with
`rg -n "reason" apps/web/src/components/route/rider-impact-summary.ts`) —
falls back to rendering `capability?.reason` verbatim.

Copy conventions to match: terse, no internals on faces (study-card rules);
honest-empty state copy stays exactly as designed.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Scoped tests | `bun test apps/web/test/shared --timeout 15000` | exit 0 |
| Typecheck | `bun run check:types` | exit 0 |
| Build + budget | `bun --filter @bp/web build` | exit 0 |
| Doctrine | `bun run check:architecture` | exit 0 |

## Scope

**In scope**:

- `apps/web/src/studio/pages/routes-directory.tsx` (the null-spark cell +
  the SearchField call site)
- `apps/web/src/components/route/HonestEmptySection.tsx`
- `apps/web/src/components/route/RouteDetailShell.tsx` (badge label only)
- `apps/web/src/components/route/rider-impact-summary.ts`
- `knowledge/log.md` (one line recording the §8.2 copy supersession)
- Matching tests under `apps/web/test/shared/`

**Out of scope**:

- The trend DATA itself — plan 116's G2 gate verifies the rebuilt candidate's
  index carries non-null `spark`/`movement6mPct` before activation; do not
  attempt a client-side workaround (no fabricating trends from other fields).
- `Spark.tsx`/`Spark.chart.tsx` — already the sanctioned chart pattern.
- `packages/analytics/**` — the reason literal may stay in the manifest
  (it is a useful internal diagnostic); only its public rendering changes.
- The Building / Thin / Blocked honest-empty titles/bodies — designed copy,
  keep verbatim. (`checked_clean` is superseded — see the amendment and
  Step 4.)
- `coverage-matrix.ts` labels and DataNotesSection's "Checked" column —
  they render inside the About-this-data provenance surface, where check
  internals are sanctioned.

## Git workflow

- Branch off `origin/main`: `codex/124-trend-cell-capability-copy`
- Commits: (1) trend cell fallback, (2) reason-leak fixes,
  (3) checked_clean rewording + badge, (4) search-field unification.
- No push/PR unless the dispatching operator instructed it.

## Steps

### Step 1: Honest fallback in the trend cell

In `RouteIndexRow`, replace the bare `null` branch with a muted placeholder
that keeps the column honest and scannable — an em dash in the same slot:

```tsx
<div className="max-md:hidden">
  {route.spark === null ? (
    <span aria-hidden className="text-[12px] text-[var(--bp-color-ink-40)]">—</span>
  ) : (
    <Spark data={route.spark} width={104} height={22} color={toneColor[tone]} fill />
  )}
</div>
```

(The right-side "No trend" label already carries the words; the cell only
needs to stop being invisible. Do NOT render a fake flat sparkline.)

**Verify**: `bun test apps/web/test/shared --timeout 15000` → any
routes-directory/home-index render tests updated and passing; then
`rg -n "route.spark === null \? null" apps/web/src` → no matches.

### Step 2: Stop rendering raw capability reasons publicly

- `HonestEmptySection.tsx`: gate the reason paragraph on `import.meta.env.DEV`
  so the diagnostic stays visible in local dev and disappears from
  production builds. Keep the prop (callers unchanged).
- `rider-impact-summary.ts`: use its existing product-copy fallback
  unconditionally (drop the `capability?.reason ??` branch so the raw
  string can never surface); keep the fallback sentence exactly as written.

**Verify**: new/updated tests assert (a) HonestEmptySection production
render (mock `import.meta.env.DEV` false, or assert via the component's
output when DEV is false if the harness supports it — otherwise assert the
DEV-gated branch exists by rendering with DEV true and checking the reason
appears ONLY then; note which approach the harness allowed) and (b)
rider-impact-summary never returns the raw reason string. Then
`rg -n "capability\?\.reason" apps/web/src` → no matches.

### Step 3: Sweep for other raw-reason renders

`rg -n "\.reason" apps/web/src/components/route apps/web/src/studio -g '*.tsx' -g '*.ts'`
— for each hit, classify: internal state plumbing (fine) vs rendered-to-DOM
(fix like step 2). Expected from the audit: only the two sites above render
capability reasons; SegmentExplorer's lane/manifest `reason` strings are
client-authored copy (fine). List the classification in the commit message.

**Verify**: sweep classification recorded; scoped tests green.

### Step 4: Reword `checked_clean` for riders (amendment item 3)

- `HonestEmptySection.tsx:13-18`: title "Checked clean" → **"Nothing on
  record"**; body "Detectors ran; no publishable signal." → **"We checked
  this release and found nothing to report for this route."** Icon
  (CircleCheck) and the affirmative good tone stay — the looked-and-found-
  nothing claim is the point; only the vocabulary changes.
- `RouteDetailShell.tsx:105-106`: tab badge for `checked_clean` "Checked" →
  **"None"** (variant stays "good").
- Append one `knowledge/log.md` line: "§8.2 checked_clean public copy
  reworded (badge 'None'; 'Nothing on record') — operator 2026-08-02,
  landed by Plan 124; detector vocabulary stays on the About-this-data
  surface only."

**Verify**: `rg -n "Checked clean|publishable signal" apps/web/src` → only
`coverage-matrix.ts` (About-this-data labels) remains; empty-state tests
pin the four titles/bodies with the new checked_clean strings;
`bun run check:knowledge` exits 0.

### Step 5: /routes filter input back on the primitive (amendment item 4)

`routes-directory.tsx:155-161`: drop the `border-[1px] px-3.5 py-2
shadow-none` overrides (keep `w-full`), so the field renders `SearchField`'s
default presentation — white card surface, 1.5px ink border, solid offset
shadow, ink-40 placeholder — the same family as the homepage "Find a
route" panel. If the default 17px type genuinely overwhelms the filter bar,
the ONLY permitted local overrides are typography/padding — never
border/background/shadow.

**Verify**: `rg -n "shadow-none" apps/web/src/studio/pages/routes-directory.tsx`
→ no matches; side-by-side check against the homepage input (screenshot in
the PR).

### Step 6: Full gates

All table commands exit 0; `git status --porcelain` → in-scope only.

## Test plan

- Routes-index row: null spark → em-dash placeholder present (and Spark
  absent); non-null spark → Spark rendered. Model on existing
  routes-directory/home tests (`rg -ln "RouteIndexRow" apps/web/test`).
- HonestEmptySection: reason hidden in prod-mode render; four state
  titles/bodies pinned — Building/Thin/Blocked verbatim, checked_clean at
  its NEW strings (they are designed copy either way).
- RouteDetailShell: checked_clean badge label "None", variant "good".
- rider-impact-summary: capability with a reason string → product fallback
  sentence, never the raw reason.
- Routes-directory search field renders without the flattening overrides.

## Done criteria

- [ ] `rg -n "route.spark === null \? null" apps/web/src` → no matches
- [ ] `rg -n "capability\?\.reason" apps/web/src` → no matches
- [ ] `rg -n "Checked clean|publishable signal" apps/web/src` → only
      `coverage-matrix.ts`
- [ ] `rg -n '"Checked"' apps/web/src/components/route/RouteDetailShell.tsx`
      → no matches
- [ ] `rg -n "shadow-none" apps/web/src/studio/pages/routes-directory.tsx`
      → no matches
- [ ] `knowledge/log.md` line appended; `bun run check:knowledge` exits 0
- [ ] All commands exit 0; no out-of-scope files modified
- [ ] `plans/README.md` gen-21 row updated

## STOP conditions

- The routes index tests render live-shaped fixtures whose `spark` is
  ALWAYS non-null — meaning the fixtures hide the production state; update
  fixtures to include a null-spark route rather than weakening assertions,
  and note it.
- You find a third surface rendering capability reasons that is not a
  mechanical copy of step 2 — report it instead of improvising copy.
- Anything tempts you to synthesize trend data client-side — out of scope,
  data belongs to plan 116.

## Maintenance notes

- After plan 116 activates a candidate with populated trend inputs, the
  em-dash fallback becomes rare — keep it; it is the honest state for any
  future route without 12 months of history.
- If the capability system ever wants public-facing reasons, they must go
  through a label map (the plan-118 `episode-copy.ts` pattern), never the
  raw manifest string.

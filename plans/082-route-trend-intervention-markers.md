# Plan 082: Dated intervention markers + a real month axis on the route Overview speed-trend chart

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 99fa763..HEAD -- apps/web/src/components/SpeedTrend.tsx apps/web/src/components/SpeedTrend.chart.tsx apps/web/src/components/route/OverviewSection.tsx apps/web/src/components/route/route-derived.ts apps/web/src/components/route/TreatmentsHistorySection.tsx`
> The tree at planning time was already dirty (plan 074/079 execution in
> flight), so compare the "Current state" excerpts against the live code
> before proceeding; on a mismatch, treat it as a STOP condition. Plan 075
> may land before this plan and edits `TreatmentsHistorySection.tsx` — that
> is expected; this plan only IMPORTS one exported function from it.

## Status

- **Priority**: P1 (the highest-leverage route-detail upgrade after plan 075)
- **Effort**: M
- **Risk**: MED (public chart surface; mitigated by a comp gate, annotation-only rule, and byte-identical fallback when no dated events exist)
- **Depends on**: plans/075-studies-surface.md recommended first (sequencing only — 075 is the priority surface and both plans smoke the same tab set; there is no hard code dependency). Operator-approved comp (step 1) is a HARD gate.
- **Category**: direction
- **Planned at**: commit `99fa763`, 2026-07-12

## Why this matters

Route detail is the product's spine, but its one plain speed-trend chart
(Overview tab) is disconnected from the intervention history the same page
already loads: the chart shows monthly speeds on an anonymous 1,2,3… index
axis, while dated, source-labeled intervention events render only as text
rows in the History tab. A reader cannot see "enforcement started here" on
the speed line. The segment-study engine (plan 074) produces causal estimates
for only 5 routes today; dated intervention events exist for ~201 routes
inside the served speed window (2023-04..2026-03). Drawing those dates as
quiet reference markers on the existing chart makes most route pages more
useful at annotation-level honesty — the chart shows *when*, the reader sees
the before/after with their own eyes, and no computed claim is added. This
was already flagged in gen-6 (plan 057 maintenance notes: "trend chart with
intervention event markers — attractive but needs a design pass"). This plan
is that design pass plus the implementation.

**What this plan must NOT do**: compute or display any before/after delta,
percentage, or verdict from the marker. The repo's own studies proved naive
before/after numbers mislead (M79+ shows a +0.36 mph raw uplift that is
gate-flagged for congestion-pricing overlap; B82+ shows a descriptive
worsening with a failed pre-trend gate). Markers are annotation; numbers come
only from plan 074/075 study artifacts.

## Current state

All excerpts verified at commit `99fa763` (dirty tree).

- **The chart pair** (lazy, keeps Recharts out of the eager bundle):
  - `apps/web/src/components/SpeedTrend.tsx` — wrapper; `React.lazy` at lines 6-8.
  - `apps/web/src/components/SpeedTrend.chart.tsx` — the Recharts chart. Its
    x-axis is a sequential index today (line 41 and 65):

```tsx
const rows = data.map((value, index) => ({ period: index + 1, value }));
// ...
<XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} interval={1} />
```

  Props today (lines 19-30): `data: readonly number[]`, optional `scheduled`,
  `height`, `seriesLabel`, `scheduledLabel`, `tone`, `legend`. The file
  already imports and renders `ReferenceLine` (dashed scheduled baseline,
  lines 78-92) and `ReferenceDot` (endpoint, lines 101-110) — the marker
  rendering below reuses these exact primitives.

- **The data feeding it** — `apps/web/src/components/route/OverviewSection.tsx`
  lines 39 and 85-90:

```tsx
const historySpeeds = dossierSpeedSeries(data.dossier);
// ...
<SpeedTrend
  data={historySpeeds}
  {...(route.scheduledMph === null ? {} : { scheduled: route.scheduledMph })}
  height={172}
  legend
/>
```

  `dossierSpeedSeries` (`apps/web/src/components/route/route-derived.ts:17-23`)
  **drops the month field and silently skips null months**:

```ts
export function dossierSpeedSeries(dossier: RouteDossierSummaryForDetail | null): number[] {
  return (
    dossier?.speed.sparkline.flatMap((point) =>
      point.value === null ? [] : [Number(point.value.toFixed(2))],
    ) ?? []
  );
}
```

  The underlying dossier sparkline DOES carry calendar months:
  `packages/domain/src/studio/route-dossier.ts` — series points are
  `{ month: "YYYY-MM", value: number | null }`, arrays capped at 36 points,
  monthly grain. So months exist server-side and are thrown away client-side.
  Consequence: today the index axis misrepresents gaps (a missing month
  visually collapses), and a dated marker cannot be placed. Fixing the axis
  to real months is a prerequisite inside this plan, not a separate task.

- **Dated events already on the page** (no new fetches needed). The route
  loader (`apps/web/src/routes/routes/$routeId.tsx:30-37`) already fetches
  both inputs:
  - `route.interventions` — `StudioIntervention` rows. The field named `year`
    actually carries the implementation MONTH: verified in
    `packages/domain/src/studio/interventions.ts:230`
    (`year: comparison.implementationMonth`, format `YYYY-MM`). Rows carry
    `eventId`, `interventionType`, `title`, `tone`, `sourceLabel`.
  - `evidence.timeline` — `StudioRouteEvidenceTimelineEvent` rows
    (`packages/domain/src/studio/route-evidence.ts:34-46`) with
    `dateNormalized` (`YYYY`, `YYYY-MM`, or `YYYY-MM-DD`), `title`,
    `eventKind`, `citationKeys`.
  - The History tab already merges both into one row model:
    `mergedTreatmentTimelineRows(interventions, evidence)` — EXPORTED from
    `apps/web/src/components/route/TreatmentsHistorySection.tsx:112-140`.
    Each row: `{ key, dateLabel, sortKey, kind, title, detail, source:
    "serving"|"wiki", citationKeys, sourceLabel, tone }`. Wiki rows are
    admitted only when `citationKeys.length > 0` (line 134). Date-format
    check helper `isNormalizedDate` is at lines 172-174. **Reuse this
    exported builder — do not re-derive event admission rules.**

- **Design authority (binding)**:
  - Approved chart grammar from the 075 comp
    (`plans/mockups/075-history-tab/study-cards-comp.html`, rules extracted in
    `knowledge/wiki/engineering/studio_design_pass_status.md`, section
    "Study-card / chart-card rules — 2026-07-10"): dashed implementation
    reference line labeled in plain language ("enforcement starts Sep 2024"),
    first/last month ticks, no date/window text where the chart itself
    carries the dates, terse labels, method detail never on the card face.
  - Comp-before-implementation gate (same wiki section): this plan does not
    touch app code until an operator-approved HTML comp exists under
    `plans/mockups/`.
  - Doctrine lint: `bun run check:architecture` includes
    `check:design-doctrine` with a ratchet allowlist — new code must pass
    with NO new allowlist entries.
  - Claim language: no causal verbs, no computed deltas anywhere in this
    plan's output. Marker labels state the event, never the effect.

- **Perf budget**: entry ≤145KB gz (currently ~115KB); everything here lives
  in the already-lazy chart chunk and the route page chunk. Entry must not
  grow more than ~0.5KB (the helper is tiny).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run check:types` | exit 0 |
| Web tests | `bun run test:web` | all pass |
| Web build + budget | `bun --filter @bp/web build` | exit 0, budget passes |
| Doctrine/architecture | `bun run check:architecture` | exit 0, no new allowlist entries |
| Style | `bun run check:style` | exit 0 |
| Local artifact seed | `bun run seed:local-studio-r2` | exit 0 |
| Smoke | `bun run serve:web-smoke` | route pages render |

## Scope

**In scope** (the only files you should create/modify):
- `plans/mockups/082-overview-trend-markers/comp.html` (new — step 1)
- `apps/web/src/components/SpeedTrend.chart.tsx` (month axis + markers prop)
- `apps/web/src/components/SpeedTrend.tsx` (prop passthrough only)
- `apps/web/src/components/route/route-derived.ts` (month-preserving series helper)
- `apps/web/src/components/route/trend-markers.ts` (new — pure marker derivation)
- `apps/web/src/components/route/OverviewSection.tsx` (wire series + markers)
- `apps/web/test/shared/trend-markers.test.ts` (new)
- `apps/web/test/shared/` — extend an existing overview/speed-trend test only if one exists (check first)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `apps/web/src/components/route/TreatmentsHistorySection.tsx` — plan 075
  owns its edits; this plan only IMPORTS `mergedTreatmentTimelineRows` from it.
- Any map component (`RouteGeoMap`, `CorridorMap`, `RouteMapLibre*`) — gen-9
  plan 081 owns map-geometry truthfulness; markers are time-axis only.
- `packages/studio-api/**`, `tools/pipeline-v2/**`, `packages/domain/**` —
  no serving or schema changes; the data is already on the page.
- The Riders tab ridership sparkline and the Segments tab hour chart —
  Overview's speed trend only, this pass.
- `/interventions` page.

## Git workflow

- Branch: `advisor/082-trend-markers` off the current branch.
- Commit per step; short imperative messages matching `git log --oneline` style.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Comp round — STOP for operator approval

Build `plans/mockups/082-overview-trend-markers/comp.html`: a static,
self-contained HTML comp of the Overview "Speed history" ChartFrame in app
tokens (copy the token values used by
`plans/mockups/075-history-tab/study-cards-comp.html` — same palette,
Helvetica stack, card anatomy), showing REAL data for two routes:

- **BX28** (has a 2024-09 ACE onset inside the window; pull its real monthly
  speeds from `data/artifacts/studio/v2/routes/bx28/studies.json` treated
  series or the served dossier) — one dashed vertical marker labeled in plain
  language ("ACE enforcement starts Sep 2024").
- A route with 2+ dated events in-window and at least one null month, to
  show the clustered-marker treatment and the null gap.

Decisions the comp must present for operator resolution (mark each variant):
1. Marker anatomy: dashed vertical rule in `var(--bp-color-ink-40)` with a
   small rotated/inline label vs. tick-top label chip. Label text is terse
   plain language from the event title/kind — never a number.
2. Same-month clustering: one marker with "2 treatments, Jun 2024"-style
   label vs. stacked labels. (Recommend: one marker, combined count label.)
3. Marker cap: max markers per chart before overflow (recommend 4, with the
   quiet text "+N more in History" NOT rendered — History tab is one tab
   away; comp decides whether any overflow hint appears at all).
4. Month axis ticks: first/last month only (075 comp grammar) vs. sparse
   auto ticks. With real month ticks, the ChartFrame `source` line
   ("Observed average speed, 2023-04 to 2026-03") becomes redundant per the
   "no date lines when the chart carries dates" rule — comp shows it removed
   and kept; operator picks.
5. Null months rendered as visible gaps (`connectNulls={false}`) — this
   changes today's look (gaps currently collapse); the comp must show a
   route where this is visible.
6. Whether wiki-derived (citation-backed) events get markers in v1, or only
   serving/registry interventions. (Recommend: serving interventions only in
   v1 — they have exact months and tones; wiki events keep timeline-only.)

Run the doctrine banned-pattern greps against the comp text (no "data as of",
no interpunct chains, no verdict words). **Then STOP and report** — do not
proceed to step 2 until the operator approves a variant set. Record the
resolved decisions in this plan file under a "## Approved comp decisions"
heading, and note the approval in
`knowledge/wiki/engineering/studio_design_pass_status.md` following the 075
precedent.

**Verify**: file exists; banned-pattern greps clean; operator approval
recorded.

### Step 2: Month-preserving series

In `apps/web/src/components/route/route-derived.ts`, add (do not modify the
existing `dossierSpeedSeries` — other callers exist):

```ts
export type TrendPoint = { month: string; value: number | null };
export function dossierSpeedPoints(dossier: RouteDossierSummaryForDetail | null): TrendPoint[]
```

returning the sparkline with months preserved, values rounded to 2 decimals,
nulls KEPT (honest gaps). In `SpeedTrend.chart.tsx`, extend props to accept
`points?: readonly { month: string; value: number | null }[]` alongside the
legacy `data` (keep `data` working — grep for other `SpeedTrend` call sites
first and list them in your report; `RouteBoardingsTrend` or peers may share
the file). When `points` is provided: `rows = points`, x-axis becomes
`dataKey="month"` (category axis) with ticks per the approved comp decision
(default: first and last month only via explicit `ticks={[first, last]}`),
and the Area gets `connectNulls={false}`. Y-domain math must skip nulls.

**Verify**: `bun run check:types` → exit 0; `bun run test:web` → pass
(existing tests unaffected because `data` path is unchanged).

### Step 3: Pure marker derivation + tests

New `apps/web/src/components/route/trend-markers.ts`:

```ts
export type TrendMarker = { month: string; label: string; count: number; tone: string };
export function trendMarkers(
  interventions: readonly StudioIntervention[],
  evidence: StudioRouteEvidenceBundle | null,
  months: readonly string[],          // the sparkline months, ascending
  cap?: number,                        // from the approved comp decision
): TrendMarker[]
```

Rules (encode exactly; unit-test each):
- Build rows via the EXPORTED `mergedTreatmentTimelineRows(interventions, evidence)`
  from `TreatmentsHistorySection.tsx` — one admission ruleset in the app.
  If the approved comp restricted v1 to serving interventions, filter
  `row.source === "serving"` here (single line, comment pointing at the comp
  decision).
- Keep only rows whose `sortKey` starts with a month: `/^\d{4}-\d{2}/` —
  year-only and undated events get NO marker (a year cannot be honestly
  placed at a month position).
- Truncate `sortKey` to `YYYY-MM`; keep only months present in `months`
  (events outside the chart window drop silently).
- Cluster by month: one marker per month, `count` = merged rows, label = the
  single row's plain-language title when count is 1, else the approved
  cluster label form. Labels must never contain digits that read as effects
  (dates are fine).
- Sort ascending by month; apply `cap` keeping the most recent markers.

Tests in `apps/web/test/shared/trend-markers.test.ts`, modeled structurally
on `apps/web/test/shared/treatments-history.test.ts` (fixture builders +
`bun:test`): in-window month match, year-only exclusion, undated exclusion,
out-of-window exclusion, same-month clustering, cap-keeps-most-recent,
null evidence bundle, empty months array → `[]`.

**Verify**: `bun run test:web` → all pass including the new file.

### Step 4: Render markers

- `SpeedTrend.chart.tsx`: optional `markers?: readonly TrendMarker[]` prop.
  For each marker render a `<ReferenceLine x={marker.month} ...>` styled per
  the approved comp (dashed, `var(--bp-color-ink-40)` stroke or the comp's
  resolved token, small label). Reuse the existing scheduled-baseline
  ReferenceLine at lines 78-92 as the styling exemplar. Markers render only
  when the month axis (`points`) is active.
- `OverviewSection.tsx`: swap `dossierSpeedSeries` → `dossierSpeedPoints`,
  compute `trendMarkers(route.interventions, evidence, months, cap)` and pass
  both. The section receives `evidence` — check `route-detail.tsx` for how
  `evidence` is threaded to sections and match it (TreatmentsHistorySection
  already receives it; add the same prop to OverviewSection's call site).
- When `trendMarkers` returns `[]`, the rendered chart must be visually
  identical to the step-2 state (no marker layer artifacts).

**Verify**: `bun run check:types` → exit 0; `bun --filter @bp/web build` →
exit 0, entry budget delta ≤ 0.5KB vs the pre-plan build (record both
numbers); `bun run check:architecture` → exit 0 with no new allowlist
entries; `bun run check:style` → exit 0.

### Step 5: Smoke the four states

Seed local artifacts (`bun run seed:local-studio-r2`), `bun run
serve:web-smoke`, then check:
1. A route with ≥1 in-window dated intervention (BX28) → marker at the right
   month with the approved label.
2. A route with no dated in-window events → chart renders with month axis,
   zero markers.
3. A route with a null month → visible gap, no crash, tooltip skips it.
4. Evidence fetch absent/null → identical to state 2 (loader already
   tolerates null evidence).

**Verify**: all four render; screenshot or DOM-assert per the repo's
verification convention (if no headless browser exists in the workspace,
note that and rely on SSR render tests + HTTP smoke, matching the gen-6
precedent).

## Test plan

- New: `apps/web/test/shared/trend-markers.test.ts` (cases in step 3).
- Extend: if an SSR test covering OverviewSection exists under
  `apps/web/test/`, add one assertion that a fixture route with a dated
  intervention renders exactly one marker label and that a route with no
  dated events renders none; if none exists, add a minimal one modeled on
  `treatments-history.test.ts` and say so in the report.
- Gates: `check:types`, `test:web`, `check:architecture`, `check:style`,
  `bun --filter @bp/web build` budget.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Operator-approved comp exists at `plans/mockups/082-overview-trend-markers/comp.html` and its resolved decisions are recorded in this file
- [ ] `bun run test:web` exits 0 including `trend-markers.test.ts` (≥8 cases)
- [ ] `grep -rniE "caused|improved because|thanks to" apps/web/src/components/route/trend-markers.ts apps/web/src/components/SpeedTrend.chart.tsx` → no hits
- [ ] `grep -n "delta\|Delta\|%" apps/web/src/components/route/trend-markers.ts` → no hits (markers carry no computed numbers)
- [ ] `bun run check:types`, `bun run check:architecture` (no new allowlist entries), `bun run check:style`, `bun --filter @bp/web build` all exit 0; entry budget delta ≤0.5KB recorded
- [ ] Four smoke states from step 5 verified
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The operator does not approve a comp variant (step 1) — this plan does not
  proceed on an unapproved design.
- `mergedTreatmentTimelineRows` is no longer exported or its row shape lost
  `sortKey`/`source`/`tone` (plan 075 landed a breaking edit) — report; do
  not fork a private copy of the admission rules.
- The dossier sparkline months turn out not to be contiguous calendar months
  (e.g. quarter-decimated) for real routes — the month-axis assumption
  failed; report with two examples.
- Placing markers requires a new fetch or any change under
  `packages/studio-api/` — the data-already-on-page assumption failed.
- `check:design-doctrine` requires an allowlist entry — report the violating
  pattern instead of adding it.

## Maintenance notes

- Plan 075's `?tab=history&study=<eventKey>` deep link is the natural click
  target for a marker whose event has a study; deliberately NOT in this plan
  (markers are static v1). If added later, it needs a fresh comp round.
- If plan 075 step 4 later merges corpus rows into
  `mergedTreatmentTimelineRows`, markers inherit them automatically — but all
  310 corpus records are currently pre-window (0 have `evaluableInWindow:
  true`), so no visual change is expected; re-run the step-5 smoke after 075
  lands to confirm.
- The riders sparkline (`dossierRidershipSeries`) could reuse
  `dossierSpeedPoints`'s month-preserving pattern later; out of scope here.
- Reviewer scrutiny points: the `year`-field-holds-a-month quirk
  (`interventions.ts:230`) — if the serving pipeline ever renames it to
  `implementationMonth`, `trend-markers.ts` and the timeline both need the
  rename; the null-gap rendering change on the Overview chart (operator
  approved it via the comp, but it is a visible change on EVERY route page).

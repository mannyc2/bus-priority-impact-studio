# Plan 082: Dated intervention markers + a real month axis on the route Overview speed-trend chart

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Dependency check (run first)**: Plans 090 and 092 in `plans/README.md`
> must both say `DONE`. Do not begin the comp/app work against a draft
> observation schema or before the route loader/Overview presentation seam is
> migrated to the typed intervention inventory.
>
> **Drift check (run next)**: `git diff --stat b41169df..HEAD -- apps/web/src/studio/api-contract.ts apps/web/src/studio/api-client.ts 'apps/web/src/routes/routes/$routeId.tsx' apps/web/src/studio/pages/route-detail.tsx apps/web/src/components/SpeedTrend.tsx apps/web/src/components/SpeedTrend.chart.tsx apps/web/src/components/route/OverviewSection.tsx apps/web/src/components/route/route-derived.ts apps/web/src/components/route/intervention-trend-model.ts apps/web/test/shared/api-client.test.ts apps/web/test/shared/overview-section.test.ts apps/web/test/shared/intervention-trend-model.test.ts packages/domain/src/studio/intervention-observations.ts packages/domain/src/studio/intervention-observations-key.ts`
> Plan 090, Plan 092, and the required Generation 11 plans are expected to change some
> listed files after this amendment. Compare the live domain type, binding
> ids, artifact key, and web excerpts against "Current state" before
> proceeding. If the contract is not semantically equivalent, stop and
> report instead of adapting it privately in web code.

## Status

- **Priority**: P1 (the highest-leverage remaining route-detail chart upgrade)
- **Effort**: M
- **Risk**: MED (public chart surface; mitigated by a comp gate,
  annotation-only rule, and marker-free fallback when no dated events exist)
- **Depends on**: `plans/090-structured-intervention-observations.md` and
  `plans/092-route-intervention-recognition-ui.md` (both HARD; together they
  transitively require exact route identity, Plan 091, and plans 084, 088,
  085, and 086). Plan 075's UI integration has landed but activation remains
  blocked by its recorded gates; it remains the study-presentation authority.
  Operator-approved comp (step 1) is a second HARD gate.
- **Category**: direction
- **Planned at**: commit `99fa763`, 2026-07-12
- **Binding amendment**: commit `b41169df`, 2026-07-18; rc23-capable
  contracts checked at `origin/main` commit `27ceded6`
- **Dependency reconciliation**: commit `ac940967`, 2026-07-18; exact route
  identity plus Plans 091/092 supersede the historical rc23/UI premises

## Approved comp decisions — 2026-07-20

The operator approved the Plan 082 comp at
`plans/mockups/082-overview-trend-markers/comp.html` with D1-D6 unchanged.
These decisions are the binding implementation and acceptance target:

- **D1 — marker anatomy**: render a quiet dashed vertical rule with an inline
  plain-language label from Plan 092's typed presentation helper.
- **D2 — same-month clustering**: render one marker per month. A cluster label
  reports the number of distinct occurrences; it does not stack labels.
- **D3 — marker cap**: retain at most four marker months, keeping the most
  recent, with no overflow hint. The real v1 corpus has at most two eligible
  marker months on any route (44 routes have one and 14 have two), so the cap
  is a latent safety bound rather than active v1 truncation.
- **D4 — month ticks**: show the first and last displayed months and remove the
  redundant source-date line.
- **D5 — missing observations**: preserve explicit null months as visible
  gaps; never connect or collapse them.
- **D6 — typed fallback**: when observations are null, unsupported, or have no
  usable speed binding, show the dossier's calendar series with zero markers
  and no unavailable-annotation treatment.

The approval used the canonical Plan 090 export (401 events; 72 events with a
usable metric series). No real route has two eligible occurrences in the same
month, so the comp's clearly labeled B11 synthetic occurrence exists only to
exercise D2's latent cluster anatomy. Six events resolve as missing, providing
real D6 fallback cases.

## Binding amendment — typed observation bundle (2026-07-18)

This amendment replaces the plan's original event-admission and data-flow
assumption. **It controls wherever later historical wording conflicts with
it.** Plan 082 must consume the Plan 090 public artifact
`StudioRouteInterventionObservationBundle`. It must never derive chart
markers or data relevance from `mergedTreatmentTimelineRows`,
`TreatmentsHistorySection`, `StudioRouteEvidenceBundle`, intervention titles,
evidence prose, citation text, or other display-copy heuristics.

The required data flow is:

```text
Plan 090 typed bundle key
  → api-client nullable artifact fetch
  → route loader fail-soft result
  + Plan 091 inventory already fetched by Plan 092
  → RouteDetailPage props
  → OverviewSection
  → pure intervention-trend model
  → SpeedTrend real-month points + structured event markers
```

The pure model recognizes the typed binding id
`route_speed_around_implementation_v1` and verifies its metric id is
`route_average_speed_mph`. It selects the most recent eligible event by
`implementationMonth` then `occurrenceId`/`eventId`, never by observed values. That event's
available/partial 25-month series becomes the chart's points. The focal event
and any other eligible events inside those point months become markers,
clustered by month. Marker
copy comes from Plan 092's named presentation helper after resolving each
Plan 090 `treatmentId`/`occurrenceId` in the same-release Plan 091 inventory.
The helper owns an optional operational annotation stem; v1's canonical ACE
treatment returns `Enforcement starts`. Web code never equates Plan 091's
presentation family with Plan 090's analysis family, and never reads event
description, source text, or UI timeline title.

If the bundle is null, unsupported, or contains no available/partial speed
binding, preserve the month-axis improvement by rendering the dossier's
month-preserving speed points with **zero intervention markers**. Do not fall
back to text-derived markers. Missing observations remain explicit null gaps.
The chart remains annotation/descriptive only: no before/after aggregate,
delta, percent, direction, verdict, or causal language may be added.

## Why this matters

Route detail is the product's spine, but its one plain speed-trend chart
(Overview tab) is disconnected from the intervention history the same page
already loads: the chart shows monthly speeds on an anonymous 1,2,3… index
axis, while dated, source-labeled intervention events render only as text
rows in the History tab. A reader cannot see "enforcement started here" on
the speed line. The segment-study engine (plan 074) produces causal estimates
for only 5 routes today. The original ~201-route count measured historical
raw-event reach inside the served speed window; it is not typed v1 coverage.
Plan 090 v1 is intentionally ACE-only. Plan 093 owns the reviewed non-ACE
expansion after this first renderer lands. For supported routes, quiet
reference markers make Overview more useful at
annotation-level honesty — the chart shows *when*, the reader sees the
observations around it, and no computed claim is added. This
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

- **Typed observations become the only chart-event input after Plan 090.**
  `packages/domain/src/studio/intervention-observations.ts` exports
  `StudioRouteInterventionObservationBundle`. Each event carries structured
  `eventId`, `occurrenceId`, `treatmentId`, `treatmentKind`,
  `analysisFamily`, `implementationMonth`, `resolutionStatus`, and bounded
  series. Each series carries `bindingId`, `metricId`, `role`,
  `claimCeiling`, `status`, `coverage`, and explicit month/value/null points.
  The key-only function
  `interventionObservationBundleKey(routeSlug)` resolves
  `studio/v2/routes/<routeSlug>/intervention-observations.json`.
- **The generic artifact fetch pattern already exists.**
  `apps/web/src/studio/api-client.ts` imports key-only helpers for the corpus
  and studies, passes them through `publicArtifactPath`, and uses
  `loadNullableStudioJson<T>` so a 404 becomes `null`. Add the observation
  fetch by matching `fetchStudioRouteStudies`; do not add a Worker route.
- **The route loader has an established fail-soft optional-artifact pattern.**
  `apps/web/src/routes/routes/$routeId.tsx` fetches detail, evidence, and route
  studies in `Promise.all`; studies catch non-abort errors and return null.
  Add observations with the same abort-preserving behavior. Thread the result
  through `RouteDetailPage` in
  `apps/web/src/studio/pages/route-detail.tsx`, then only into
  `OverviewSection`. History continues to receive evidence/studies unchanged.
- **Binding ids are semantic keys, not display copy.** V1 recognizes exactly
  `route_speed_around_implementation_v1` plus metric
  `route_average_speed_mph`. Unknown binding/metric pairs are ignored and
  surfaced only through the bundle's existing limitations; web code must not
  guess from labels, units, descriptions, or numeric values.

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
| Observation artifact build | `bun run pipeline -- studio export-intervention-observations --db data/local/pipeline.sqlite --inventory-index data/artifacts/studio/v2/interventions/route-inventory-index.json --release-artifact data/artifacts/studio/v1/release.json --artifact-root data/artifacts` | exit 0; nonzero bundle/event summary |
| Local artifact seed | `bun run seed:local-studio-r2` | exit 0 |
| Smoke | `bun run serve:web-smoke` | route pages render |

## Scope

**In scope** (the only files you should create/modify):
- `plans/082-route-trend-intervention-markers.md` (record approved comp
  decisions)
- `plans/mockups/082-overview-trend-markers/comp.html` (new — step 1)
- `apps/web/src/studio/api-contract.ts` (explicit domain type re-export)
- `apps/web/src/studio/api-client.ts` (nullable bundle fetch)
- `apps/web/src/routes/routes/$routeId.tsx` (fail-soft loader fetch)
- `apps/web/src/studio/pages/route-detail.tsx` (typed prop plumbing)
- `apps/web/src/components/SpeedTrend.chart.tsx` (month axis + markers prop)
- `apps/web/src/components/SpeedTrend.tsx` (prop passthrough only)
- `apps/web/src/components/route/route-derived.ts` (month-preserving series helper)
- `apps/web/src/components/route/intervention-trend-model.ts` (new — pure,
  typed binding/point/marker selection)
- `apps/web/src/components/route/OverviewSection.tsx` (wire series + markers)
- `apps/web/test/shared/intervention-trend-model.test.ts` (new)
- `apps/web/test/shared/api-client.test.ts` (artifact path/null/abort coverage)
- `apps/web/test/shared/overview-section.test.ts` (bundle/fallback rendering)
- `apps/web/test/shared/speed-trend-chart.test.ts` (new — direct chart-model
  and non-lazy chart render coverage)
- `knowledge/wiki/engineering/studio_design_pass_status.md` (record approved
  comp decisions)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `apps/web/src/components/route/TreatmentsHistorySection.tsx` and all
  route-evidence/timeline display helpers — History owns them; this plan must
  not import them.
- Any map component (`RouteGeoMap`, `CorridorMap`, `RouteMapLibre*`) — gen-9
  plan 081 owns map-geometry truthfulness; markers are time-axis only.
- `packages/studio-api/**`, `tools/pipeline-v2/**`, `packages/domain/**` — Plan
  090 owns the typed contract/materializer and the generic artifact endpoint
  already serves it. Do not patch that contract from the web consumer plan.
- The Riders tab ridership sparkline and the Segments tab hour chart —
  Overview's speed trend only, this pass.
- `/interventions` page.

## Git workflow

- Branch: `codex/082-trend-markers` off the current branch.
- Commit per step; short imperative messages matching `git log --oneline` style.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Comp round — STOP for operator approval

After confirming Plans 090 and 092 are DONE, preflight the canonical local inputs:

```bash
test -f data/local/pipeline.sqlite
test -f data/artifacts/studio/v1/release.json
test -f data/artifacts/studio/v2/interventions/route-inventory-index.json
bun run pipeline -- studio export-intervention-observations --db data/local/pipeline.sqlite --inventory-index data/artifacts/studio/v2/interventions/route-inventory-index.json --release-artifact data/artifacts/studio/v1/release.json --artifact-root data/artifacts
```

The export must exit 0 and report nonzero `routeBundleCount` and `eventCount`;
record its full summary, including rejected-event/reason counts. If either
input is absent, the release artifact fails strict decode, either required DB
table is missing, or the summary is zero, STOP. Rebuild the upstream local DB
and Studio release through
`knowledge/wiki/engineering/cli_commands.md` and
`knowledge/wiki/engineering/cloudflare_operations_runbook.md`; never invent
release metadata or hand-author an observation artifact. The generated route
bundles/index are the canonical real inputs for this comp and Step 6 smoke;
reuse them rather than substituting study/dossier values.

Build `plans/mockups/082-overview-trend-markers/comp.html`: a static,
self-contained HTML comp of the Overview "Speed history" ChartFrame in app
tokens (copy the token values used by
`plans/mockups/075-history-tab/study-cards-comp.html` — same palette,
Helvetica stack, card anatomy), showing REAL data for two routes:

- **BX28** (has a 2024-09 ACE onset inside the window; use its real
  `route_speed_around_implementation_v1` points from the Plan 090 route
  observation bundle) — one dashed vertical marker labeled in plain language
  ("Enforcement starts Sep 2024").
- A real route with 2+ supported events in the same displayed window and at
  least one null month, to show clustering and the null gap. If no real route
  has 2+ supported same-window events, use a clearly labeled synthetic
  same-month event pair over a real Plan 090 speed series solely to compare
  cluster anatomy. The comp must say it is synthetic and must never present
  that pair as production coverage.

Decisions the comp must present for operator resolution (mark each variant):
1. Marker anatomy: dashed vertical rule in `var(--bp-color-ink-40)` with a
   small rotated/inline label vs. tick-top label chip. Label text comes from
   Plan 092's typed presentation registry plus the structured implementation
   month — never an event title, description, source string, or effect number.
2. Same-month clustering: one marker with "2 starts, Jun 2024"-style label
   vs. stacked labels. The count is distinct occurrence IDs, not treatments
   or source rows. (Recommend: one marker, combined occurrence count label.)
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
6. Typed eligibility treatment: only events with the supported speed binding
   and matching metric become marker candidates. Compare a quiet dossier-only
   fallback (recommended) against an unavailable annotation when the typed
   bundle is null, unsupported, or has no usable speed points. Text/evidence
   fallback is not a variant and must not appear in the comp.

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
nulls KEPT (honest gaps). In `SpeedTrend.chart.tsx`, replace the ambiguous
required-`data` plus optional-`points` shape with a discriminated union:

```ts
type SpeedTrendSeriesInput =
  | { mode: "legacy"; data: readonly number[]; points?: never }
  | { mode: "calendar"; points: readonly TrendPoint[]; data?: never };
```

Keep the legacy mode working—grep all `SpeedTrend` call sites first and list
them in the report. Calendar mode uses `dataKey="month"`, ticks per the
approved comp (default first/last), and `connectNulls={false}`. Reject an
input containing both or neither series shape at compile time. A chart is
available only when it has at least one finite observed value. Empty or
all-null calendar input retains its rows in the pure model for diagnostics but
renders the existing honest empty state; a scheduled line alone does not turn
it into observed history. Y-domain math skips null/nonfinite values, includes
the optional finite scheduled value only after observed availability is true,
and returns `null` rather than an invented domain for empty/all-null input.

In `SpeedTrend.chart.tsx`, also export a pure `buildSpeedTrendChartModel`
helper used by `SpeedTrendChart` itself. Given legacy `data` or calendar `points`, optional
scheduled speed, and markers, it returns the rows, x-axis data key, explicit
first/last calendar ticks, `hasObservedData`, nullable finite y-domain, last
non-null point, and retained markers. The calendar path must preserve every
explicit null row, calculate the y-domain from finite non-null values plus the
optional scheduled value only in the observed case, and never collapse
missing months. Keep this helper free of React/Recharts so its null/tick/domain
behavior is directly testable.

Create `apps/web/test/shared/speed-trend-chart.test.ts`. Unit-test
`buildSpeedTrendChartModel` for legacy rows, ordered calendar rows, explicit null retention,
first/last ticks, y-domain ignoring nulls, scheduled-domain inclusion, and
last non-null point. Add empty, all-null, scheduled-only, both-input compile-
time, and neither-input compile-time cases. Do not claim static Recharts
markup proves ticks or reference labels: `ResponsiveContainer` emits only its
wrapper under `renderToStaticMarkup`. Verify rendered SVG/ticks/reference
labels in the Step 6 browser smoke instead.

**Verify**: `bun run check:types` → exit 0; `bun run test:web` → pass,
including the new direct chart tests.

### Step 3: Build the pure typed observation trend model

Create `apps/web/src/components/route/intervention-trend-model.ts`. Import
`StudioRouteInterventionObservationBundle` and
`StudioRouteInterventionInventoryBundle` from the web API contract, Plan
092's named pure `interventionPresentationForTreatment` helper, and the
`TrendPoint` type from `route-derived.ts`; do not import any History, timeline,
corpus, evidence, or study component/helper.

Export these semantic constants and types:

```ts
export const ROUTE_SPEED_OBSERVATION_BINDING_ID =
  "route_speed_around_implementation_v1" as const;
export const ROUTE_SPEED_OBSERVATION_METRIC_ID =
  "route_average_speed_mph" as const;

export type TrendMarker = {
  month: string;
  label: string;
  count: number;
  eventIds: readonly string[];
  occurrenceIds: readonly string[];
  treatmentIds: readonly string[];
};

export type RouteSpeedTrendModel = {
  source: "observation_bundle" | "dossier_fallback";
  points: readonly TrendPoint[];
  markers: readonly TrendMarker[];
  focalEventId: string | null;
  limitations: readonly string[];
};
```

Implement
`routeSpeedInterventionTrend(observations, inventory, dossierPoints,
markerCap)` with these rules in this exact order:

1. Both typed inputs are nullable. Before inspecting events, require matching
   inventory/observation `releaseId`, `publishedAt`, and exact route identity.
   A null or mismatched pair returns the marker-free dossier fallback plus a
   typed limitation; it does not display a stale observation series.
2. Read only `observations.events`. An eligible event has a series whose
   `bindingId` and `metricId` equal the two constants, whose status is
   `available` or `partial`, and whose points contain at least one non-null
   value. Ignore display labels, units, descriptions, limitations, and other
   prose plus numeric magnitudes/direction when deciding eligibility; explicit
   non-null coverage remains the eligibility check stated above.
3. Sort eligible events by `implementationMonth`, then `eventId`, and choose
   the last as the focal event. Selection must not depend on speed magnitude,
   direction, sample count, null count, or study result.
4. When there is a focal event, return its selected series points in calendar
   order with nulls retained. When there is none, return `dossierPoints`, an
   empty marker array, and `source: "dossier_fallback"`.
5. Marker candidates are eligible observation events whose structured
   `implementationMonth` occurs in the focal point months. Require a same-
   bundle occurrence + treatment resolution by the explicit IDs.
   Pass the resolved treatment to Plan 092's presentation helper and use only
   its non-null `operationalAnnotationStem`. An unknown/dangling ID, mismatched
   route/release, or null annotation stem produces no marker and an explicit
   model limitation; it never falls back to either family enum or prose.
6. Cluster same-month candidates deterministically. A single marker label is
   `<annotation stem> <Mon YYYY>`; a cluster uses the operator-approved
   occurrence-count form. Sort markers ascending and apply the approved cap
   by retaining the most recent months. Sort/deduplicate `eventIds`,
   `occurrenceIds`, and `treatmentIds` for stable output; `count` is the number
   of distinct occurrence IDs.

Tests in `apps/web/test/shared/intervention-trend-model.test.ts`, modeled on
the fixture-builder + `bun:test` style in
`apps/web/test/shared/overview-section.test.ts`, must cover: null bundle
fallback; exact binding+metric match; wrong binding despite a matching label;
available and partial admission; missing/no-non-null exclusion; latest-event
selection; point null retention; out-of-window event exclusion; same-month
clustering; cap keeps most recent; mismatched release/route, dangling
occurrence/treatment, and null annotation-stem exclusion; and marker labels
remaining byte-identical when event descriptions/titles and numeric values
are changed. The last test is the web-layer anti-cherry-picking guard.

**Verify**: `bun run test:web` → all pass including the new file (at least 12
named cases).

### Step 4: Fetch the bundle and thread it to Overview

1. In `apps/web/src/studio/api-contract.ts`, explicitly re-export the
   `StudioRouteInterventionObservationBundle` type from
   `@bp/domain/studio/intervention-observations`. Reuse the
   `StudioRouteInterventionInventoryBundle` export already added by Plan 092.
2. In `apps/web/src/studio/api-client.ts`, import
   `interventionObservationBundleKey` from the Plan 090 key-only subpath and
   add:

```ts
export function fetchStudioRouteInterventionObservations(
  routeSlug: string,
  options?: StudioQueryOptions,
): Promise<StudioRouteInterventionObservationBundle | null>
```

   Implement it with `loadNullableStudioJson` and `publicArtifactPath`, exactly
   like `fetchStudioRouteStudies`. Add API-client tests for encoded bundle
   path, decoded JSON passthrough, 404 → null, and abort propagation.
3. In `apps/web/src/routes/routes/$routeId.tsx`, add the fetch to the existing
   `Promise.all`. Like studies, non-abort errors log once and return null;
   `AbortError` is rethrown. Include `observations` in loader data and pass it
   to `RouteDetailPage`.
4. In `apps/web/src/studio/pages/route-detail.tsx`, add the optional typed prop
   `observations?: StudioRouteInterventionObservationBundle | null`, default
   it to null. Continue passing Plan 092's nullable inventory to both Overview
   and History; pass the new observations prop only to `<OverviewSection>`.
   Do not alter History's evidence/study/inventory plumbing.

The route detail request must still render when the new artifact is absent,
404s, or its optional fetch fails. Do not add a Worker endpoint or make the
optional artifact part of the route-detail response contract.

**Verify**: `bun run check:types` → exit 0; `bun run test:web` → all pass,
including the API-client cases.

### Step 5: Render the real-month series and structured markers

- `OverviewSection.tsx`: build dossier fallback points with
  `dossierSpeedPoints`, call
  `routeSpeedInterventionTrend(observations, inventory, dossierPoints,
  approvedCap)`, and pass the returned points/markers to `SpeedTrend` in
  calendar mode. Determine chart
  availability, month count, and displayed coverage window from the returned
  points, not from the discarded legacy number array. Do not read
  `route.interventions`, evidence, or display text for the chart.
- `SpeedTrend.chart.tsx`: accept optional
  `markers?: readonly TrendMarker[]`. Render one `<ReferenceLine>` per marker
  only when the month-axis `points` path is active, styled exactly as the
  approved comp. Reuse the existing scheduled-baseline `ReferenceLine` only
  as a Recharts implementation exemplar; intervention marker labels remain
  annotation-only.
- `SpeedTrend.tsx`: pass the new point/marker props through the lazy boundary
  without importing domain or route-page modules into the eager entry.
- Add a concise visually hidden marker summary and give SpeedTrend's owned
  chart wrapper `role="img"`, `aria-label={seriesLabel}`, and an
  `aria-describedby` value containing the summary's unique ID. The summary
  lists each marked month and annotation stem; a cluster includes the
  distinct occurrence count (for example, “June 2024, 2 starts”). Do not
  assume the current plain `ChartContainer` div or Recharts SVG labels expose
  the accessible name/description without this explicit role-bearing target.
- When the model returns `dossier_fallback`, the month axis and null gaps
  remain, but the marker layer is absent. Do not synthesize a marker from any
  other route data.

`OverviewSection` renders the lazy `SpeedTrend` wrapper, so server
`renderToStaticMarkup` sees `ChartFallback`, not Recharts output. Extend
`apps/web/test/shared/overview-section.test.ts` only for model-derived card
metadata and fallback behavior: a typed bundle changes the displayed coverage
window/month count from the selected model points; a null bundle uses dossier
metadata; no usable points render the honest empty state. Do not assert month
ticks, marker labels, SVG paths, or visual gaps in this SSR test. Those belong
in `speed-trend-chart.test.ts`, which tests the pure chart model and may
assert the wrapper's accessible name/description plus hidden marker-summary
text. It must not claim static Recharts output contains ticks or reference
lines. Use fixture values only in tests; the comp/smoke uses the real Step 1
artifacts.

**Verify**: `bun run check:types` → exit 0; `bun run test:web` → all pass;
`bun --filter @bp/web build` → exit 0 and budget passes; record the entry
gzip size before/after and keep growth ≤0.5KB; `bun run check:architecture`
and `bun run check:style` → exit 0 with no new allowlist entry.

### Step 6: Smoke chart, fallback, and accessibility states

Reuse the observation artifacts generated and recorded in Step 1; do not
regenerate them with alternate release metadata. Run
`bun run seed:local-studio-r2` and `bun run serve:web-smoke`, then check:

1. BX28 with its supported speed binding → the Plan 090 25-month point series
   renders and the marker lands on 2024-09 with the Plan 092 treatment
   presentation helper's annotation stem.
2. A route whose bundle has only unsupported events or no usable speed
   binding → dossier month points render with zero intervention markers.
3. A supported series with a null month → a visible gap, no crash, and the
   tooltip does not invent a value.
4. Observation artifact request returns 404/null → route detail still renders,
   dossier month points remain, and zero intervention markers appear.
5. With keyboard/browser accessibility inspection, the owned chart wrapper
   exposes `role="img"`, the series label as its accessible name, and the
   hidden marker summary through `aria-describedby`; each marked month is
   present in that summary, clustered starts announce their occurrence count,
   and no SVG-only label is required to understand the annotations.

**Verify**: all five states pass in the available browser/manual smoke. Record
screenshots or DOM assertions where the existing harness supports them; do
not replace visual tick/reference-line verification with static SSR claims.

## Test plan

- New: `apps/web/test/shared/intervention-trend-model.test.ts` (at least the
  12 cases named in step 3, including value/description invariance).
- New: `apps/web/test/shared/speed-trend-chart.test.ts` for pure calendar
  rows/ticks/nullable-y-domain/null behavior, discriminated input modes, and
  nonvisual marker-summary structure. Actual SVG tick/reference placement is
  verified in browser smoke, not static Recharts markup.
- Extend: `apps/web/test/shared/api-client.test.ts` for artifact path, 404,
  JSON, and abort behavior.
- Extend: `apps/web/test/shared/overview-section.test.ts` for typed bundle,
  dossier fallback, and honest card metadata/empty state only; it must not
  claim to inspect lazy chart markup.
- Gates: `check:types`, `test:web`, `check:architecture`, `check:style`, and
  `bun --filter @bp/web build` budget.

## Completion receipt — 2026-07-20

- The approved D1-D6 comp is implemented through `8383e805`. The canonical
  Plan 090 export produced 323 route bundles and 401 admitted events, with 168
  rejected inputs. Of the admitted events, 78 are in the reviewed ACE family;
  72 have a usable metric series. Emitted series statuses were 71 available,
  73 partial, and 12 missing, spanning 2023-04 through 2026-05.
- `bun run check` exited 0 after the final source change. This includes types,
  style, architecture, design/month doctrine, unit tests, 330 web tests, and
  22 Cloudflare Worker tests. The focused model/chart/Overview run passed 28
  tests with 89 assertions.
- `bun --filter @bp/web build` exited 0. The eager entry is 138.3 KB gzip
  against the 145 KB budget, up about 0.1 KB from the measured 138.2 KB
  baseline and within the 0.5 KB delta cap. Total JavaScript is 399.6 KB gzip
  against the 400 KB budget.
- `bun run seed:local-studio-r2` exited 0 and seeded 1,086 objects. A headless
  browser harness using the shipped `SpeedTrendChart`, the shipped typed trend
  model, real Plan 090 observation bundles, real Plan 091 inventories, and the
  available real route dossiers verified all five chart states: BX28's 25
  points and Sep 2024 dashed marker; B100 and B1 marker-free dossier fallbacks;
  B11's eight trailing nulls, visible gap, and empty null-month tooltip; and
  the role/image name plus marker summaries, including the synthetic clustered
  occurrence safeguard. The browser rendered first/last month ticks and real
  Recharts reference lines; these claims do not rely on static SSR markup.
- The exact route-page smoke cannot run against the available ignored serving
  inputs. The only full v1 route projections predate Plans 085/086: they still
  contain retired `baselineMonth`, lack `releaseId`/`publishedAt`/`coverage`,
  and have null dossiers. A canonical four-route rebuild with the byte-exact
  Plan 090 release identity failed before output because the available D1
  export lacks `route_catalog_trip_type`. Regenerating a current D1 export
  succeeded but truthfully produced zero serving routes from the current local
  DB. No release identity or route payload was fabricated to bypass this
  upstream artifact drift. API-client 404/abort tests, loader fail-soft tests,
  Overview SSR integration tests, and the real-data component browser smoke
  cover Plan 082's changed boundaries; rebuilding the broader serving inputs
  remains outside this plan's file scope.
- The final diff is confined to the declared Plan 082 scope, and every banned
  History/prose/causal-pattern grep is clean.

## Done criteria

Machine-checkable. ALL must hold:

- [x] Operator-approved comp exists at `plans/mockups/082-overview-trend-markers/comp.html` and its resolved decisions are recorded in this file
- [x] Plans 090 and 092 are DONE; the app imports Plan 090's public type/key
      subpaths, resolves observation occurrence/treatment IDs against Plan
      091 inventory, and reuses Plan 092's named presentation helper and
      annotation stem with no private duplicate interface or enum collapse
- [x] The exact Step 1 export command exits 0 against
      `data/local/pipeline.sqlite` and
      `data/artifacts/studio/v1/release.json`, with nonzero
      `routeBundleCount`/`eventCount` and recorded admission counts
- [x] `bun run test:web` exits 0, including at least 12 named intervention-model cases, API-client cases, Overview metadata/fallback cases, and `speed-trend-chart.test.ts`
- [x] The pure SpeedTrend chart model tests preserve calendar null rows,
      first/last tick values, finite observed y-domain, and null domain for
      empty/all-null/scheduled-only input; static structure exposes a named
      `role="img"` wrapper associated with the hidden marker summary without
      claiming Recharts SVG output
- [x] `rg -n 'mergedTreatmentTimelineRows|TreatmentsHistorySection|StudioRouteEvidenceBundle' apps/web/src/components/route/intervention-trend-model.ts apps/web/src/components/route/OverviewSection.tsx` → no matches
- [x] `rg -n 'description|title|citation|evidence' apps/web/src/components/route/intervention-trend-model.ts` → no matches
- [x] `test ! -e apps/web/src/components/route/trend-markers.ts` → exit 0
- [x] `rg -n 'beforeMean|afterMean|delta|percentChange|effectEstimate|verdict|caused|improved because|thanks to' apps/web/src/components/route/intervention-trend-model.ts apps/web/src/components/SpeedTrend.chart.tsx` → no matches
- [x] `rg -n 'fetchStudioRouteInterventionObservations|observations=' apps/web/src/studio/api-client.ts apps/web/src/routes/routes/\$routeId.tsx apps/web/src/studio/pages/route-detail.tsx` finds the fetch, loader result, and prop plumbing
- [x] `bun run check:types`, `bun run check:architecture` (no new allowlist entries), `bun run check:style`, and `bun --filter @bp/web build` all exit 0; entry budget delta ≤0.5KB recorded
- [x] Five browser/manual smoke states from step 6 verified, including actual
      month tick/reference placement and the nonvisual marker summary
- [x] Only in-scope files modified (`git status --short`)
- [x] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 090 or Plan 092 is not DONE, or Plan 090's live public contract lacks
  `StudioRouteInterventionObservationBundle`,
  `interventionObservationBundleKey`, the speed binding id, structured
  occurrence/treatment IDs, `implementationMonth`, or explicit null points
  with equivalent semantics; or Plan 092 lacks the named treatment
  presentation helper/annotation stem.
- `data/local/pipeline.sqlite` or
  `data/artifacts/studio/v1/release.json` is absent/invalid, either required DB
  table is missing, or the canonical export returns zero bundles/events.
  Rebuild upstream through the documented runbook; never invent release
  metadata, fixture events, or production coverage to pass the comp gate.
- The operator does not approve a comp variant in step 1.
- The generic artifact endpoint cannot serve the Plan 090 key and completing
  the fetch appears to require a Worker route, D1 migration, or change under
  `packages/studio-api/**`.
- Anyone proposes selecting the focal series, markers, label, visibility, or
  priority from event/source prose, display titles, observed magnitude/sign,
  sample count, a before/after comparison, or a study verdict.
- The marker label would require a new private map instead of Plan 092's
  exhaustive typed presentation helper, or would require treating Plan 090's
  analysis family as Plan 091's presentation family.
- Optional observation fetch failure blocks the route page instead of
  degrading to dossier points with zero markers.
- The dossier or observation point months are not valid ascending calendar
  coordinates, or Plan 090 no longer retains explicit null gaps.
- `check:design-doctrine` requires an allowlist entry; report the violating
  pattern instead of adding it.
- A verification fails twice after a reasonable fix, or implementation needs
  a file outside Scope.

## Maintenance notes

- Plan 090 owns relevance, event admission, artifact schema, and binding ids;
  Plan 092 owns treatment presentation labels, and Plan 082 owns only the
  first typed web renderer. If a binding id changes,
  update the analytics/domain contract and its invariance tests first, then
  deliberately migrate this consumer—never add a label/text fallback.
- History evidence and Plan 075 study cards remain separate lanes. A future
  click-through from a marker to `?tab=history&study=<eventKey>` needs an
  explicit typed event/study join plus a fresh comp; it is not inferred here.
- The ridership binding in Plan 090 is deliberately not rendered in this
  slice. A later Riders-tab renderer may reuse the pure selection pattern but
  needs its own product question, comp, and missing-data behavior.
- Reviewers should scrutinize binding+metric matching, value-blind focal
  selection, typed family labels, abort-preserving fail-soft loading, null-gap
  rendering, and the visible month-axis change on every route page.

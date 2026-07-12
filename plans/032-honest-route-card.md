# Plan 032: Stop serving fabricated route-card metrics (honest-or-absent contract)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat ce3baca..HEAD -- packages/domain/src/studio/routes/index.ts packages/studio-api/src/studio/read-handlers.ts apps/web/src`
> Plans 030/031 edit `read-handlers.ts` first — that drift is expected;
> re-locate via the excerpts. Any OTHER mismatch with "Current state" is a
> STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED (public contract fields become nullable; many render sites and test fixtures update together)
- **Depends on**: plans/030-snapshot-v2-root-cause.md, plans/031-worker-error-envelope.md (same backend file; land those first). Plans 033/034 touch some of the same FE components — land 032 BEFORE 033/034.
- **Category**: bug (product integrity)
- **Planned at**: commit `ce3baca`, 2026-07-04

## Why this matters

The project's standing doctrine is **"honesty is the product"**: never
synthesize dates, metrics, or impact claims (`plans/README.md` generation-3
constraints; `knowledge/wiki/engineering/studio_design_pass_status.md` design
doctrine). The Worker's route-card builder violates it today, and the
fabrications render publicly:

- Every route's homepage row shows a **sparkline and trend status derived from
  a hardcoded wiggle** `[0.92, 0.96, 1, 0.98, 1.02, 0.99, 1]` scaled by speed —
  identical shape for all 381 routes.
- The route page header states a route length of **`shapeCount × 1.2` miles**.
- Charts draw a "scheduled" speed reference that is just **observed × 1.18**,
  and the Data Notes table attributes that fabricated number to a real source:
  `["Schedule", "MTA GTFS", "X mph scheduled"]` (`DataNotesSection.tsx:68`).
- The Riders section renders **"0 per weekday"** rider-hours-lost as if
  measured; the Data Notes table can render ACE **"since Serving export"**.
- The route card's `interventions` array contains placeholder pseudo-events
  ("Serving export generated") that render as "N recorded changes".

For a portfolio product whose thesis is honest public evidence, these are the
most damaging class of bug. The fix: serve real values where they already
exist, `null`/empty where they don't, and make every render site degrade
honestly (omit, don't invent).

## Current state

### The fabrication site — `packages/studio-api/src/studio/read-handlers.ts:617-679`

`buildStudioRouteCardFromIndexRow` (feeds `GET /api/v1/studio/routes`, the
route-detail `route` object, and the homepage). Excerpts as of `ce3baca`:

```ts
  const scheduledMph = Number((speedMph * 1.18).toFixed(1));            // :623
  ...
    speedPercentile: Math.max(1, Math.min(99, 101 - (row.summary?.routeScore ?? 100))),  // :637
    dailyRiders: Math.round((row.summary?.totalRidership ?? 0) / 30),   // :638
    ridersYoyPct: 0,                                                    // :639
    riderHoursLost: 0,                                                  // :640
    ...
    aceSince: row.summary?.aceActive === true ? "Serving export" : null, // :643
    ...
    spark: [0.92, 0.96, 1, 0.98, 1.02, 0.99, 1].map((factor) =>          // :648-650
      Number((speedMph * factor).toFixed(1)),
    ),
    ...
    miles: Number(Math.max(1, row.shapeCount * 1.2).toFixed(1)),         // :652
    ...
    interventions:                                                       // :658-677
      row.summary === null ? [] : [ { year: "Baseline", title: "Serving export generated", ... },
        ...(row.summary.aceActive ? [{ year: "Baseline", title: "ACE evidence present", ... }] : []) ],
```

Real data available on the same D1 row (no new queries needed):
`row.historyStats.speedMovement6mPct` / `speedMovement12mPct` (already served
as `movement6mPct`/`context12mPct` at :656-657 — REAL), `row.summary.*` counts,
and the sorted card list in `listStudioRouteCardsFromD1` (:681-701) from which
a REAL speed percentile can be computed in one pass.

### The contract — `packages/domain/src/studio/routes/index.ts:102-122,158,164`

All fabricated fields are currently required:
`scheduledMph: z.number()` (:102), `speedPercentile: z.number()` (:104),
`dailyRiders: z.number()` (:105), `ridersYoyPct: z.number()` (:106),
`riderHoursLost: z.number()` (:107), `aceSince: z.string().nullable()` (:110 —
already nullable), `spark: z.array(z.number())` (:115), `miles: z.number()`
(:122). Segment: `scheduledMph: z.number()` (:158), `miles: z.number().optional()` (:164).

### Render sites (verified by unabridged grep on `ce3baca`; the complete set for the fields changing)

| Field | Site | Behavior today |
|---|---|---|
| `spark` | `apps/web/src/studio/pages/home.tsx:676,699` | `trendStatus(r.spark)` chip + `<Spark data={r.spark}>` per directory row |
| `spark` | `apps/web/src/components/route/RouteMetricStrip.tsx:28` | sparkline |
| `spark` | `apps/web/src/components/route/RidersSection.tsx:94` | fallback when no real ridership history |
| `spark` | `apps/web/src/components/route/OverviewSection.tsx:41`, `TreatmentsHistorySection.tsx:86`, `TimelineSection.tsx:20` | `speedTrendData = hasSpeedHistory ? historySpeeds : route.spark` fallback |
| `scheduledMph` | `apps/web/src/components/route/RoutePublicAtoms.tsx:36` and `OverviewSection.tsx:162` | lede prose "…against a X mph schedule" |
| `scheduledMph` | `apps/web/src/components/route/DataNotesSection.tsx:68` | **worst instance**: `["Schedule", "MTA GTFS", "X mph scheduled"]` — fabricated value attributed to a real source |
| `scheduledMph` | `apps/web/src/components/route/OverviewSection.tsx:85`, `TreatmentsHistorySection.tsx:164`, `TimelineSection.tsx:46` | `<SpeedTrend scheduled={route.scheduledMph}>` reference line on the main charts |
| `scheduledMph` | `apps/web/src/components/CorridorProfile.tsx:46-47,60,70`, `CorridorMap.tsx:60-61,76` | "scheduled" target line / scale bounds |
| `scheduledMph` | `apps/web/src/components/route/SlowSegments.tsx:169,172`, `RouteMetricStrip.tsx:34` | `sched=` / `baseline=` props |
| `scheduledMph` | `apps/web/src/components/route/route-derived.ts:109`, `maplibre-style.ts:74` | synthesizes hour-speed curves from severity + the fabricated schedule |
| `scheduledMph` | `apps/web/src/components/route/RouteMapLibre.map.tsx:57,185` | map popup value |
| `miles` | `apps/web/src/components/route/RouteVitalsCard.tsx:21` | "Length: X mi" |
| `miles` | `apps/web/src/components/route/RouteIdentity.tsx:14` and `RoutePublicAtoms.tsx:89` | "X mi · Y stops" in headers |
| `speedPercentile` | `apps/web/src/components/route/RoutePublicAtoms.tsx:45`, `route-derived.ts:68` | fallback when dossier absent |
| `speedPercentile` | `apps/web/src/studio/metric-model.ts:31` | "Nth percentile of NYC SBS routes" sub-label |
| `riderHoursLost` | `apps/web/src/components/route/RidersSection.tsx:48,151` | KPI tone + prose "…{n} per weekday…" |
| `riderHoursLost` | `apps/web/src/components/route/rider-impact-summary.ts:69-97`, `metric-model.ts:43` | burden labels/tones from the always-0 value |
| `ridersYoyPct` | `apps/web/src/studio/metric-model.ts:38`, `rider-impact-summary.ts:60` | "+0.0% YoY" labels |
| `aceSince` | `apps/web/src/components/route/DataNotesSection.tsx:70`, `apps/web/src/studio/treatment-model.ts:161`, `metric-model.ts:58` | `since ${route.aceSince}` → can print "since Serving export" |
| `interventions` | `apps/web/src/components/route/TimelineSection.tsx:24,26,160` | "N recorded changes" copy + timeline events |
| `interventions` | `apps/web/src/components/route/TreatmentsHistorySection.tsx:80-81` | comparison cards + source rows |

(`RoutePublicKpiStrip.tsx:89-91` uses `dossier.speed.sparkline` — REAL — do
not touch. `RoutePublicKpiStrip.tsx:66` uses `posture.aceSince` from the
dossier — REAL — do not touch.)

### Conventions that apply

- Honest empty states: sections use the capability registry +
  `HonestEmptySection` (`apps/web/src/components/route/HonestEmptySection.tsx`)
  — when data is absent, omit or state the absence; never render a synthetic
  value. Exemplar: `RidersSection.tsx:94`'s `hasRidershipHistory` branching.
- Zod v4 `.strict()` contracts; nullable over optional for "known-absent"
  values (matches `aceSince`'s existing shape).
- Match existing formatting patterns (`toLocaleString("en-US")`, `toFixed(1)`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Domain tests | `bun --filter @bp/domain test` | exit 0 |
| Domain types | `bun --filter @bp/domain typecheck` | exit 0 |
| Studio API tests | `bun --filter @bp/studio-api test` | exit 0 |
| Studio API types | `bun --filter @bp/studio-api typecheck` | exit 0 |
| Shared web tests | `bun run test:web` | exit 0 |
| Worker harness | `bun run test:worker` | exit 0 |
| Web types | `bun --filter @bp/web typecheck` | exit 0 |
| Web build + budget | `bun --filter @bp/web build` | exit 0 |
| Style | `bun run check:style` | exit 0 |

Do NOT run repo-wide `bun run check:types` (known OOM).

## Scope

**In scope**:

- `packages/domain/src/studio/routes/index.ts` (field nullability only)
- `packages/studio-api/src/studio/read-handlers.ts` (`buildStudioRouteCardFromIndexRow`, `listStudioRouteCardsFromD1`, `segmentFromSpeedSpineTarget` scheduledMph passthrough at :1150)
- The render sites listed in the table above (exactly those files), i.e.:
  `apps/web/src/studio/pages/home.tsx`, `apps/web/src/studio/metric-model.ts`,
  `apps/web/src/studio/treatment-model.ts`, `apps/web/src/studio/api-client.ts`
  (NetworkMap schema `scheduledMph` only if typecheck demands),
  `apps/web/src/components/CorridorProfile.tsx`, `CorridorMap.tsx`,
  `SpeedTrend.tsx` + `SpeedTrend.chart.tsx` (accept absent `scheduled`),
  and under `apps/web/src/components/route/`: `RoutePublicAtoms.tsx`,
  `RouteMetricStrip.tsx`, `RouteVitalsCard.tsx`, `RouteIdentity.tsx`,
  `RidersSection.tsx`, `OverviewSection.tsx`, `TimelineSection.tsx`,
  `TreatmentsHistorySection.tsx`, `SlowSegments.tsx`, `DataNotesSection.tsx`,
  `RouteMapLibre.map.tsx`, `route-derived.ts`, `maplibre-style.ts`,
  `rider-impact-summary.ts`
- Test fixtures/tests that construct route cards:
  `apps/web/test/shared/*.test.ts` (home-route-index, route-header,
  route-public-atoms, route-public-kpi-strip, interventions-page,
  where-when-summary, rider-impact-summary, route-performance-summary,
  maplibre-style, segment-carpet-data, route-map-highlight),
  `packages/studio-api/test/api-facade.test.ts`,
  `packages/studio-api/test/http-routing.test.ts`,
  `apps/web/src/fixtures/**` (if route-card fixtures exist there),
  `apps/web/src/dev/examples/corridor-profile-demo.tsx`

**Out of scope** (do NOT touch):

- `dailyRiders` (monthly total ÷ 30 — a labeled derivation of a real number),
  `diagnosis`, `termini`, `reliability` label, `flags` — derived from real
  values; copy-level concerns belong to plans 033/034.
- `RoutePublicKpiStrip` dossier sparkline (already real).
- Serving REAL intervention-comparison rows from D1
  (`route_intervention_comparison` exists locally) — follow-up, see
  Maintenance notes.
- Any new D1 query or serving projection.
- `packages/db/**`.

## Git workflow

- Branch: `codex/032-honest-route-card` from `origin/main` (after 030/031 merge).
- Commit per step; short imperative subjects.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Loosen the domain contract to honest-or-absent

In `packages/domain/src/studio/routes/index.ts`, change ONLY:

- `scheduledMph: z.number()` → `z.number().nullable()` (route :102 AND segment :158)
- `speedPercentile: z.number()` → `z.number().nullable()` (:104)
- `ridersYoyPct: z.number()` → `z.number().nullable()` (:106)
- `riderHoursLost: z.number()` → `z.number().nullable()` (:107)
- `spark: z.array(z.number())` → `z.array(z.number()).nullable()` (:115)
- `miles: z.number()` → `z.number().nullable()` (:122)

Leave everything else (incl. `dailyRiders`, `aceSince`) as-is.

**Verify**: `bun --filter @bp/domain typecheck` → exit 0;
`bun --filter @bp/domain test` → exit 0.

### Step 2: Serve honest values from the card builder

In `packages/studio-api/src/studio/read-handlers.ts`
`buildStudioRouteCardFromIndexRow` (and its callers):

- `scheduledMph: null` (delete the `speedMph * 1.18` line :623; also update
  `segmentFromSpeedSpineTarget` :1150 `scheduledMph: input.routeScheduledMph`
  to pass through the now-nullable value).
- `spark: null` (delete the wiggle :648-650).
- `miles: null` (delete :652).
- `ridersYoyPct: null`, `riderHoursLost: null` (:639-640).
- `aceSince: null` always (:643) — a real date is not available in the serving
  summary; the KPI strip already prefers `dossier` posture dates.
- `interventions: []` always (:658-677) — delete the placeholder rows.
- `speedPercentile`: compute REAL percentile in `listStudioRouteCardsFromD1`
  (:681-701): among rows where `summary !== null`, rank by `speedMph`
  ascending; `percentile = Math.round((rankAscending / (countWithSummary - 1 || 1)) * 98) + 1`
  (1–99, slow = low). Rows without a summary get `null`. Pass it into the
  builder as a parameter (builder signature may gain
  `speedPercentile: number | null`).

Update `packages/studio-api/test/api-facade.test.ts` /
`http-routing.test.ts` expectations accordingly (fixtures that assert
`scheduledMph`, `spark`, `miles` etc. now expect `null`/`[]`; add one
assertion that two routes with different speeds get different REAL
`speedPercentile` values).

**Verify**: `bun --filter @bp/studio-api typecheck` → exit 0;
`bun --filter @bp/studio-api test` → exit 0.

### Step 3: Degrade every render site honestly

Apply, per the render-site table (all listed files; nothing else). The
uniform rule: **null → omit the element/sentence/reference-line; never
substitute a synthetic value.** Typecheck is your worklist — after Steps 1–2,
`bun --filter @bp/web typecheck` fails at every site that must change.

Sparkline/trend sites:

- `home.tsx:676` — `trendStatus` takes `r.movement6mPct` (REAL, already on the
  card) instead of `r.spark`; a null movement renders the neutral/no-trend
  state. `:699` — render `<Spark>` only when a real series exists; with
  `spark: null`, render nothing in that cell (no placeholder).
- `RouteMetricStrip.tsx:28,34` — render the spark cell only when
  `route.spark !== null`; drop the `baseline={route.scheduledMph}` prop when
  null (after this plan: always).
- `OverviewSection.tsx:41`, `TreatmentsHistorySection.tsx:86`,
  `TimelineSection.tsx:20`, `RidersSection.tsx:94` — remove the `route.spark`
  fallback arm: when there is no real history, the chart block renders the
  section's existing empty treatment instead of a fake series.

Scheduled-speed sites (null → observed-only rendering):

- `RoutePublicAtoms.tsx:36` and `OverviewSection.tsx:162` — drop the
  "against a X mph schedule" clause when null (the guard `> 0` becomes a null
  check; after this plan the clause never renders from the card).
- `DataNotesSection.tsx:68` — REMOVE the `["Schedule", "MTA GTFS", …]` row
  entirely when `scheduledMph === null`. Never attribute a value to a source
  it did not come from.
- `OverviewSection.tsx:85`, `TreatmentsHistorySection.tsx:164`,
  `TimelineSection.tsx:46` — pass `scheduled` to `<SpeedTrend>` only when
  non-null; `SpeedTrend` must accept an absent scheduled prop and omit the
  reference line + legend entry.
- `CorridorProfile.tsx:46-47,60,70`, `CorridorMap.tsx:60-61,76` — when null,
  omit the scheduled target/legend and compute scale bounds from observed
  values only.
- `SlowSegments.tsx:169,172` — omit the `sched` marker; compute `max` from the
  hour profile alone.
- `route-derived.ts:109` and `maplibre-style.ts:74` — these SYNTHESIZE
  hour-speed curves from severity + the fabricated schedule. Make them return
  `null` when `scheduledMph` is null and make their consumers hide the
  affected hour visuals (they were synthetic data, not styling).
- `RouteMapLibre.map.tsx:57,185` — make the popup field nullable; omit the row
  when null.

Remaining fields:

- `RidersSection.tsx:48,151` — render the rider-hours KPI/prose only when
  `riderHoursLost !== null`; otherwise omit the KPI cell and the sentence.
- `rider-impact-summary.ts:60,69-97` and `metric-model.ts:38,43` — null
  `riderHoursLost`/`ridersYoyPct` produce no burden/YoY labels (return the
  existing "not yet measured"-style absence, matching
  `RoutePublicKpiStrip`'s current pattern).
- `metric-model.ts:31`, `RoutePublicAtoms.tsx:45`, `route-derived.ts:68` —
  percentile renders only when non-null (real percentile from Step 2 usually
  is).
- `DataNotesSection.tsx:70`, `treatment-model.ts:161`, `metric-model.ts:58` —
  derive ACE state from `aceStatus`; append `since ${aceSince}` ONLY for a
  real value (after this plan: never from the card; the dossier path in
  `RoutePublicKpiStrip.tsx:66` is unaffected).
- `TimelineSection.tsx:24,26,160` and `TreatmentsHistorySection.tsx:80-81` —
  with `interventions: []` these must render their existing empty/evidence-only
  treatment. TreatmentsHistorySection already receives real wiki `evidence` —
  verify the section still renders evidence-backed content and that the copy
  "N recorded changes" never claims fake counts (0 is acceptable and true).

Update the shared web tests listed in Scope to the new expectations (e.g.
`home-route-index.test.ts` trend chips from `movement6mPct`;
`route-public-atoms.test.ts` header without "mi" and lede without the
schedule clause).

**Verify**: `bun run test:web` → exit 0; `bun --filter @bp/web typecheck` → exit 0.

### Step 4: Full gates + visual sanity

**Verify**:
- `bun run test:worker` → exit 0
- `bun --filter @bp/web build` → exit 0 (bundle budget must pass)
- `bun run check:style` → exit 0
- Manual spot-check (dev server or `bun run serve:web-smoke` if configured):
  homepage directory rows show no sparkline placeholders and no identical
  trend chips; a route page header shows "· N stops" without a miles claim.

## Test plan

- Studio API: card builder emits nulls/[] for the seven fields; REAL
  percentile differs across two speeds (Step 2).
- Web shared: home trend chip from `movement6mPct` (up/down/flat/null cases);
  header renders without miles; RidersSection omits rider-hours prose when
  null; DataNotes ACE row says "active"/"none active" without fake dates.
- Pattern exemplars: existing tests in `apps/web/test/shared/home-route-index.test.ts`
  and `route-public-atoms.test.ts`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "1.18\|0.92, 0.96\|shapeCount \* 1.2\|Serving export generated" packages/studio-api/src/studio/read-handlers.ts` returns no matches
- [ ] `bun --filter @bp/domain test` && `bun --filter @bp/studio-api test` exit 0
- [ ] `bun run test:web` exits 0
- [ ] `bun run test:worker` exits 0
- [ ] `bun --filter @bp/web build` exits 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A render site outside the table turns out to require one of the nulled
  fields non-null (typecheck will surface it) AND honest degradation there is
  not obvious — report the file/line instead of inventing a value.
- `bun --filter @bp/web build` fails the bundle budget after your FE edits.
- The KPI strip or route header loses REAL data (dossier-backed values) in
  manual spot-check — that means a null-guard was applied at the wrong layer.
- You find yourself adding a new D1 query or serving projection.

## Maintenance notes

- **Same fabrication upstream (named follow-up, out of scope here)**: the
  pipeline map-artifact builder writes `scheduledMph: rounded(route.summary.averageSpeedMph * 1.18, 2)`
  at `tools/pipeline-v2/src/commands/map/artifacts.ts:890` into the citywide
  network-map GeoJSON (rendered via `NetworkMapFeatureCollectionSchema` in
  `apps/web/src/studio/api-client.ts:245` and the network map popups). Fixing
  it requires a pipeline change + artifact regeneration + R2 re-publish —
  plan it separately; do not let the network map block this plan.
- Follow-up worth planning later: serve REAL intervention comparisons
  (`route_intervention_comparison` D1 table, 741 rows locally) into the route
  detail so `TreatmentsHistorySection` regains numeric before/after cards with
  provenance; and a REAL per-route speed mini-series for the homepage spark
  (needs a compact serving projection; do NOT hack it into the index query).
- Reviewers: reject any future PR that re-introduces multiplicative
  placeholder metrics — grep for `* 1.1`, `* 1.2` style constants near the
  card builder.
- Plans 033/034 restyle some of the same components; they assume this plan's
  honest-or-absent contract.

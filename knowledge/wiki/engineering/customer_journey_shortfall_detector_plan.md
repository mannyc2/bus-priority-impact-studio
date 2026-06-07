---
title: Customer Journey Shortfall Detector Plan
type: engineering
status: draft
last_updated: 2026-06-07
owner: packages/analytics
source_count: 0
tags: [analytics, applied-research, detectors, customer-journey, cjtp, reliability, authoring]
---

# Customer Journey Shortfall Detector Plan

First detector to consume MTA's Customer Journey Time Performance (CJTP) surface
(`local_bus_customer_journey_metric`). Today nothing in `@bp/analytics` reads it. The detector
surfaces routes with poor rider-experienced journey-time performance for a selected snapshot month
and **decomposes the shortfall into wait-side vs in-vehicle-side**, so a reader can tell whether the
implicated lever is frequency/reliability or speed/priority.

Conforms to [[wiki/engineering/applied_research_detector_authoring|Applied research and detector
authoring]] and to ADR 0017's mixed-freshness model (historical corpus, baseline month, current
signal, source-capture snapshot, serving projection, publication gate) -- not the retired "monthly
release" slogan.

## Data grounding (verified -- reproducible)

Source: `data/local/pipeline.sqlite` -> `local_bus_customer_journey_metric`, 25,041 rows,
2023-04..2026-04 (37 months), 362 routes, **zero nulls** on all metric columns. Dataset
`8mkn-d32t` (MTA Bus Customer Journey-Focused Metrics).

- `period` in {`Peak`, `Off-Peak`}; `tripType` in {`LCL/LTD`, `EXP`, `SBS`}.
- `customers` = monthly customer count (exposure weight, already in the row -- no APC proxy needed).
- `additional_bus_stop_time` = avg **wait** minutes beyond scheduled wait (range -6.1..49.5).
- `additional_travel_time` = avg **in-vehicle** minutes beyond scheduled travel (range -19.8..21.5).
- `customer_journey_time` = **CJTP**: the percentage (0..1, higher is better, fleet avg 0.655) of
  customers whose journey completes within 5 minutes of schedule.

These figures are not lore -- regenerate them (and keep an audit artifact under
`data/artifacts/cjtp-grounding/` when this lands):

```sql
-- shape, range, null audit
SELECT COUNT(*) rows, MIN(month) first_month, MAX(month) last_month,
       COUNT(DISTINCT month) months, COUNT(DISTINCT route_id) routes,
       SUM(additional_bus_stop_time_minutes IS NULL) abst_null,
       SUM(additional_travel_time_minutes IS NULL) att_null,
       SUM(customer_journey_time_minutes IS NULL) cjt_null
FROM local_bus_customer_journey_metric;
SELECT period, COUNT(*) FROM local_bus_customer_journey_metric GROUP BY period;
SELECT trip_type, COUNT(*) FROM local_bus_customer_journey_metric GROUP BY trip_type;
SELECT ROUND(MIN(customer_journey_time_minutes),3) min, ROUND(MAX(customer_journey_time_minutes),3) max,
       ROUND(AVG(customer_journey_time_minutes),3) avg FROM local_bus_customer_journey_metric;
```

### Field misnomer (load-bearing -- must survive into code comments, detector spec, review packet)

The DB column / `@bp/sources` adapter call CJTP `customerJourneyTimeMinutes`. **It is not minutes --
it is a 0..1 performance share.** Negative additional-time means *better* than schedule. The new
analytics feature maps it as `journeyTimePerformance` with a comment; we do **not** rename the DB
column/adapter (out of scope, ripples through migrations + sources). Claim text says "% of customers
completed within 5 minutes of schedule," never "journey time of N minutes." This warning is repeated
in the detector source comment, the `registry/specs.ts` known-failure-modes, and the review packet
evidence so a downstream reader cannot misread the unit.

## Start with the question (authoring guide's 7)

1. **Question:** Which routes deliver poor customer journey-time performance for the resolved CJTP
   snapshot month (`asOfMonth`), and is the shortfall wait-side or in-vehicle-side?
2. **Universe:** all non-`ALL` bus routes in `local_bus_customer_journey_metric` for the resolved
   `asOfMonth` (`ALL` cumulative rows are dropped at ingest, adapter line 57).
3. **Grain:** one candidate per `route x period x tripType`; plus a route-level rollup (see Goal 6).
4. **Supporting evidence:** `journeyTimePerformance`, `additionalWaitMinutes`,
   `additionalTravelMinutes`, `customers`, within-cohort percentile, persistence summary.
5. **Counter-evidence / blockers:** sub-floor `customers`; missing `asOfMonth`; cross-cohort
   comparison; negative additional-time (better than schedule); the 5-minute binary hiding large
   absolute delays on long trips; one-month dip without persistence.
6. **Clean no-hit:** route at/above the cohort cutoff with adequate exposure -> no candidate, a
   coverage row records it was evaluated.
7. **Consumer:** detector run -> review packet -> later public serving. A real detector, not a
   research notebook.

## Scope decision: snapshot output, historical-panel decision, multi-year serving

Three different scopes, three different answers. The reason output is snapshot-keyed is
**reviewability and stable snapshotting**, not because the product is a monthly release (ADR 0017).

- **Output scope = latest complete CJTP source month / selected snapshot month (`asOfMonth`).** The
  detector emits candidates for one resolved snapshot so review packets, coverage, and publication
  gates have a stable, citable baseline. Per-month emission across 37 months would be a ~37x
  candidate flood that is mostly un-actionable. Historical months stay available for baselines and
  calibration, not steady candidate emission.
- **Decision scope = historical CJTP panel (all months).** A single-month score would promote
  one-month dips (snowstorm, one-off detour) and ignore CJTP's strong winter seasonality. The
  snapshot hit is **persistence-gated** using history: poor at `asOfMonth` **and** poor across
  trailing-N and/or vs same-month-prior-year (`lookback12` + `seasonalPeerWindow` +
  `SAME_MONTH_PRIOR_YEAR` + `ADJACENT_MONTH_GUARD`). Pooling all months into one ranking would be
  worse (blurs seasonality).
- **Serving scope = multi-year history plus current/latest highlights.** Serving shows the full CJTP
  panel per route with the snapshot's candidates highlighted; it is not limited to `asOfMonth`.

### `asOfMonth`, not the global release month

CJTP currently extends to `2026-04` while other surfaces sit at `2026-03`. The existing runner keys
every read off `input.releaseMonth` (= `isoMonth(options.year, options.month)`), so a global release
month would silently ignore fresher CJTP data. **This detector resolves its own `asOfMonth`** =
latest complete CJTP source month (or an explicitly requested snapshot), independent of the global
release month. The CJTP feature `month` is that resolved snapshot. (Calibration windows are anchored
on this snapshot, not the global release_month -- see Goal 4 caveat.)

**Level here, trend elsewhere.** "Did this route get *worse over time*" is a trend question that the
suite already owns via `degradation-trend` (consumes a metric-history grain). CJTP is not in that
surface today (`local_route_month_trend` does not carry it). Feeding CJTP as a metric into the
history grain is a clean **follow-on**, not a reason to overload this detector.

**One-time historical pass.** Because this is a brand-new detector, no prior snapshot ever covered
it. A bounded historical run is worth doing once, for (a) score-vector calibration / gold-set per the
guide's evaluation step, and (b) optionally surfacing currently-persistent bad states on first
serving. This is calibration/backfill, not steady-state per-month emission.

## Cohort-safe route filtering (classic quiet bug -- design constraint)

The detector ranks within `(month, period, tripType)` cohorts. The current
`loadDetectorStudyLocalDbRows()` pushes `routeId` into the SQL `WHERE`, so a `--routeId B41` run would
load only B41 and its percentile would be computed against a cohort of one (always 0th/100th).

**Rule for cohort detectors:** the resolver loads the **whole cohort** (all routes for the
`asOfMonth`, plus the trailing history needed for persistence), and any requested-route filter is
applied **after scoring** (mark/keep the requested route, but rank against the full cohort). Route
filtering must never narrow the percentile population. A test asserts B41-filtered percentile equals
the all-routes percentile for B41.

## Placement (decision tree)

| Piece | Home |
| --- | --- |
| Detector ID allowlist + claim tier | `packages/domain/src/findings/index.ts` (`KNOWN_DETECTOR_IDS`) |
| Pure decision rule, thresholds, candidate emission | `packages/analytics/src/findings/customer-journey-shortfall.ts` |
| Feature type + contract + key builder | `packages/analytics/src/features/customer-journey.ts` + `features/contracts.ts` |
| Detector spec / registry row / calibration policy | `packages/analytics/src/registry/specs.ts`, `registry/detectors.ts`, `calibration/detector-policy.ts` |
| Generic SQLite resolver registry (`sqlite_table` -> reader, keyed on `resolverId`) | `packages/applied-research/src/feature-resolvers/` + wired in `detector-runs/` |
| CJTP local SQLite reader (cohort-loading) | `packages/applied-research/src/local-db/` |
| Pure row -> feature transform | `packages/applied-research/src/feature-resolvers/` |
| Route-level rollup materializer | `packages/applied-research/src/feature-resolvers/` (or `route-briefs/`) |
| Data product | **reuse** `local_bus_customer_journey_metrics_history` (`data-products/registry.ts:810`) |
| Command | `tools/pipeline-v2` stays thin -- **no SQL added** |

Guardrail: `@bp/analytics` must not import `@bp/db`, `@bp/applied-research`, fs, or SQLite. The
detector takes prepared features only.

### Seam reality (corrected)

The 2026-06-07 assembler (`assembleDetectorStudySourceRows()`) dispatches **artifact/model** feature
inputs by `modelId`. It does **not** generically dispatch `sqlite_table` feature contracts;
`loadDetectorStudyLocalDbRows()` is still a per-detector `if (detectorId === ...)` SQL chain. So the
optimistic "a registered grain is auto-picked-up" claim from the prior draft is **not true yet**.

Chosen approach (preferred over another hand-written branch, and it advances the "simplify the CLI via
detector work" goal): **add a generic SQLite resolver registry** that maps a feature contract's
`resolverId` (e.g. `sqlite.local_bus_customer_journey_metric.v1`) to a registered reader, and have the
assembler dispatch `materializationKind:"sqlite_table"` contracts through it. CJTP is the first
consumer; existing detector-oriented SQL can migrate incrementally. Fallback if that proves too large
for one change: wire CJTP explicitly in local-db and record the generic registry as a known remaining
seam -- but the registry is the intended target.

## Goals (guide step order; action -> verify)

1. **Domain ID + tier.** Add `customer_journey_shortfall` to `KNOWN_DETECTOR_IDS`; claim tier
   `descriptive` (weakest honest -- it is a published metric; the wait-vs-travel "lever" is
   supporting interpretation, never causal claimText).
   -> verify: `bun test packages/domain` (ID-allowlist test passes).

2. **Feature grain (pure, no DB).** New `features/customer-journey.ts`: `CustomerJourneyFeature`
   (keys `routeId, month, period, tripType`, where `month` = resolved `asOfMonth`; fields `customers`,
   `additionalWaitMinutes`, `additionalTravelMinutes`, `journeyTimePerformance` (0..1), `quality`) +
   `customerJourneyFeatureKey()`. Register `FeatureContract` (`featureGrain:"customer_journey"`,
   `resolverId:"sqlite.local_bus_customer_journey_metric.v1"`, `routeMonthUsage:"route_level_only"`).
   -> verify: `bun test packages/analytics/test/feature-contracts.test.ts registry.test.ts`.

3. **Pure detector.** `findings/customer-journey-shortfall.ts` modeled on
   `rider-weighted-excess-wait.ts`. Exports `CUSTOMER_JOURNEY_SHORTFALL_DETECTOR_ID`,
   `DEFAULT_*_THRESHOLDS`, input/output types, `detectCustomerJourneyShortfall(input)`. Ranks within
   `(month, period, tripType)` cohort over the **full cohort population** (route filter applied after
   scoring, per the cohort-safe rule); **persistence-gated** hit (`asOfMonth` + history baseline);
   labels wait- vs travel-dominated via `dominanceMargin` (only when the relevant additional-time is
   positive). Emits a **coverage row for every skipped class** (sub-floor exposure, missing month, no
   cohort peers, failed-persistence). No model artifact (cohort percentile from snapshot rows).
   -> verify: new `packages/analytics/test/customer-journey-shortfall.test.ts` covers hit / no-hit /
   skipped-missing **and the cohort-safe-filter invariant** (single-route filter == full-cohort
   percentile for that route); fails before impl, passes after.

4. **Register in analytics registry.** Re-export in `detectors/index.ts`; spec in `registry/specs.ts`
   (claim strength 3, the field-misnomer warning, counter-evidence + known failure modes below); row
   in `registry/detectors.ts` (`featureGrains:[CUSTOMER_JOURNEY_FEATURE_GRAIN, FEED_HEALTH_FEATURE_GRAIN]`,
   baseline families `own_history`/`peer`, gates `sample_support`+`coverage`, no `modelArtifacts`);
   policy in `calibration/detector-policy.ts` (snapshot output; `lookback12`+`seasonalPeerWindow`
   baselines; `SAME_MONTH_PRIOR_YEAR`+`ADJACENT_MONTH_GUARD`+`SERVICE_PERIOD_BREAK`; new backfill
   surface `customer_journey_metrics`); let `requiredDataProducts` resolve to
   `local_bus_customer_journey_metrics_history` via the grain.
   -> caveat: the `releaseMonth` CalibrationWindowId is anchored at `release_month`; for CJTP it must
   be interpreted as the resolved `asOfMonth` snapshot. If the window anchor cannot diverge from the
   global release month, this is the one wiring point to resolve (see Open decisions).
   -> verify: `bun test packages/analytics/test/registry.test.ts calibration.test.ts`;
   `getAnalyticsDetector("customer_journey_shortfall")` returns it.

5. **Generic SQLite resolver + CJTP reader (applied-research, not pipeline).** Add the generic
   `sqlite_table` resolver registry keyed on `resolverId`; register a CJTP reader that loads the
   **whole cohort** for the resolved `asOfMonth` (latest complete CJTP month via `MAX(month)` unless a
   snapshot is requested) plus the trailing history for persistence -- read-only handle, Zod-parsed,
   no `routeId` in the percentile-population query. Add the pure row->`CustomerJourneyFeature`
   transform. Confirm the assembler dispatches `sqlite_table` contracts through the registry.
   -> verify: `bun test packages/applied-research/test/<new>.test.ts` (fixture-backed, no live DB,
   includes a cohort-loading assertion); then a real run against `data/local/pipeline.sqlite` emits
   >=1 candidate with the decomposition populated and uses 2026-04 (not the global release month).

6. **Route-level rollup (applied-research).** Materialize a route-level summary alongside the
   `route x period x tripType` candidates: worst cohort, customer-weighted CJTP, dominant side
   (wait vs travel), persistence count, total exposed customers. Detector still emits the
   period/tripType candidates; the rollup is the review/frontend-facing summary.
   -> verify: rollup unit test (fixture-backed) asserts customer-weighting and dominant-side logic;
   rollup row count == distinct routes with >=1 cohort.

7. **Evaluation + knowledge.** Confirm review packets carry the performance %, both additional-minute
   sides, exposure, and the field-misnomer note. Update `knowledge/index.md` / `knowledge/log.md`.
   -> verify: `bun run check:knowledge`.

## Known failure modes / counter-evidence (for the spec)

- **Unit misread:** treating CJTP as minutes (it is a 0..1 share) -- the load-bearing misnomer.
- **Route-filtered cohort:** computing the within-cohort percentile on a route-narrowed population
  (a `--routeId` run must not change the percentile). Mitigation: cohort-safe filtering (after-scoring).
- **Stale month:** scoring the global release month instead of the fresher CJTP `asOfMonth`.
- Treating the 5-minute binary CJTP as if it captured magnitude (long routes can have large absolute
  delay with decent CJTP). Mitigation: always carry the additional-minutes decomposition.
- Ranking across `period` or `tripType` cohorts (express vs local are not comparable).
- Reading negative additional-time as a problem (it means better than schedule).
- Promoting a one-month dip (mitigated by the persistence gate).
- Treating wait/travel decomposition as a causal diagnosis rather than a lever hint.
- `ALL`-route aggregate rows leaking in (already dropped at ingest; classify as coverage-skip if seen).

## Open decisions (lock before Goal 3)

- `asOfMonth` policy: always latest complete CJTP month vs explicit snapshot flag; and whether the
  calibration `releaseMonth` window anchor can be the CJTP snapshot rather than the global release
  month (Goal 4 caveat).
- `maxJourneyTimePerformance` absolute floor vs pure within-cohort `bottomPercentile` (proposal: use
  both -- percentile within cohort AND an absolute floor).
- `minCustomers` exposure floor (needs a quick distribution check).
- Persistence rule: trailing-N count/threshold vs same-month-prior-year, and how many must agree.
- Route-level rollup grain: confirm the five summary fields above are what review/frontend want.
- Claim strength 3 (published KPI) vs 2 -- reviewer can dial down.

## Verification commands (per authoring guide)

```bash
# data grounding (regenerate the figures above)
sqlite3 data/local/pipeline.sqlite < (the SQL in Data grounding)
bun test packages/analytics/test/customer-journey-shortfall.test.ts
bun test packages/analytics/test/registry.test.ts
bun test packages/applied-research/test/<research-unit>.test.ts
bun test tools/pipeline-v2/test/<command-or-boundary>.test.ts
bun --filter @bp/analytics typecheck
bun --filter @bp/applied-research typecheck
bun run check:knowledge
```

## Follow-on (separate work)

CJTP-into-`degradation-trend`: add CJTP (`journeyTimePerformance`, and optionally the two
additional-time sides) as metrics on the route metric-history surface so the existing trend detector
can answer "getting worse over time" with the right `higher_is_worse` / `lower_is_worse` direction.

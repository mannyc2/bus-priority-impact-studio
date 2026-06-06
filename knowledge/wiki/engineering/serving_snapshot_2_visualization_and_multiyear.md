---
title: Serving Snapshot 2.0 — Visualization & Multi-Year Expansion
type: engineering
status: draft
last_updated: 2026-06-05
owner: claude
source_count: 0
tags: [serving, snapshot-2, visualization, charts, multi-year, time-series, curb-pulse, studio]
---

# Serving Snapshot 2.0 — Visualization & Multi-Year Expansion

This page expands [[wiki/engineering/serving_snapshot_2_full_route_baseline|Serving Snapshot 2.0
full-route baseline]] along the two axes the baseline plan deferred: **time** (it freezes everything
at one baseline month, `2026-03`) and **visual form** (it defines coverage contracts but no system
for turning the data into figures). Rendering-engine choice is settled separately in
[[wiki/engineering/charting_library_evaluation|charting library evaluation]]; this page is about
*what to build*, not *what to draw it with*.

## The fact that reframes everything

**The multi-year data is already ingested.** `local_route_segment_speed` already holds, for the B41
alone, **36 consecutive months (2023-04 → 2026-03) × 21 segments × 24 hours-of-day**, ~4,000+ rows
per month — and the same depth exists network-wide (datasets `58t6-89vi` for 2023–24 and
`kufs-yh3x` for 2025+, ~19 M rows). 311 runs **2019-01 → 2026-03** (2.56 M rows). Permits, weather,
and interventions are all multi-year.

So "plan for more multi-year data" is **not primarily an ingestion problem.** The corpus is already
multi-year; the product serves `2026-03` and throws away the other 35/36. The work is (1) *serving*
the time dimension and (2) building a visual language that uses it. The headline reframing:

> We don't have "too much data." We have a single-month directory sitting on a multi-year corpus,
> and no spine to navigate it. The answer to "so much data" is an **editorial spine**, not a bigger
> dashboard.

## The spine: three altitudes, one falsifiable story at the bottom

The antidote to "I'm not sure what to do with all this" is to stop trying to *show* the data and
start using it to *nominate and defend one finding at a time*. Three altitudes, each a single
beautiful frame, each multi-year-native, zooming from city to segment:

```text
NETWORK  → nominates   : "of 381 routes × 36 months, where is something surprising worth a look?"
ROUTE    → locates      : "on this route, where in space and when in time does it bleed/recover?"
SEGMENT  → explains      : "here is the one segment, the cause, the counter-evidence, the test."
```

Each level hands the user down to the next. The multi-year axis is the protagonist at every level:
network = trend over months, route = time is a literal axis (the carpet below), segment = the 36-month
pulse. This mirrors the curb-pulse case-study arc in
[[wiki/engineering/curb_pulse_natural_experiment_plan|curb pulse natural experiment plan]] — the
product *is* the arc, made navigable.

## Altitude 1 — Network: the anomaly nominator

This is the direct answer to "so much data, where do I look." Let the data nominate.

**The nominator (signature):** a beeswarm/scatter where **each dot is a segment-daypart**.
- **x = effect size** of its strongest multi-year signal (trend slope, or the size of its largest
  episodic pulse / event response);
- **y = surprise** — how far it defies the network average (e.g. sign-flip magnitude: a segment that
  speeds up when the network slows scores high);
- **dot size = rider-hours at stake** (so big effects on empty segments don't dominate);
- **color = whether an official intervention already explains it** (explained = muted; unexplained =
  accent).

The eye goes straight to the top-right, large, accent dots: **big effect, defies expectation, lots of
riders, unexplained = your next case study.** This operationalizes the curb-pulse "hypothesis engine"
as one frame. It is also honest: most dots cluster near the origin, which is the truth — most
segment-months are unremarkable.

**Supporting network views:** a borough/route-family **sparkline wall** (small-multiple trend per
route, 36-month) for browsing; a **rider-hours-lost league/bump chart** (which routes are worsening
over time). These are navigation, not argument.

## Altitude 2 — Route: the speed-carpet (the marquee multi-year visual)

This is the single most beautiful, most distinctive, and most multi-year-native figure in the
product — and it is **buildable today from already-ingested data** (B41 = 21×36 = 756 cells per
daypart).

**Form — a raster/heatmap of the route's whole life in space × time:**
- **x = position along the route** (ordered segments, terminal → terminal; reuse
  `orderCorridorSegments` from `CorridorProfile.tsx`);
- **y = month** (36+ rows, multi-year);
- **cell color = speed**, encoded as **observed-vs-its-own-baseline** (so a slow-but-consistent
  segment doesn't drown out a segment that *changed*).

**How you read it — every product question is a visual shape:**

| Shape in the carpet | Meaning |
|---|---|
| Persistent dark **vertical stripe** | A segment that bleeds time *always, everywhere* — the chronic bottleneck. |
| A stripe that **lightens below a horizontal line** | An intervention that *worked* — you watch the fix take at its date. |
| A stripe unchanged below that line | An intervention that *didn't* — the honest null. |
| Faint **horizontal ripples** in one stripe | A seasonal / episodic pulse — the curb-pulse signature. |
| The whole **column structure jumps** at a date | A schedule change moved the timepoints — a comparability caveat made visible (see the spine problem below). |

**Daypart small-multiples:** four carpets side by side (AM-peak / midday / PM-peak / night). The
curb-pulse is AM-specific, so the AM carpet shows ripples the others don't — the daypart contrast
*is* part of the argument.

**Interaction:** intervention dates render as horizontal rules; permit windows as faint overlays;
hover a cell → the segment-month tooltip (reuse the dumbbell's tooltip); click a stripe → drill to
the segment case study; brush a date range → recompute the stop-by-stop ladder for that window.

The existing **stop-by-stop dumbbell ladder** (`CorridorProfile.chart.tsx`) becomes the carpet's
companion: the carpet picks the *when*, the ladder shows the *stop-by-stop* state for that window.

## Altitude 3 — Segment: the case-study arc

The bottom of the zoom: one segment, the full falsifiable story, rendered entirely from a
precomputed `natural_experiment_case` payload (no analytics in the request path). Mirrors the
curb-pulse narrative beats one-to-one.

| # | Figure | What it shows | Source field |
|---|---|---|---|
| 1 | **Episode pulse strip** | 36-month travel-time; episodes highlighted; "pulse, not trend"; speed climb annotated | `series` + `episodes` |
| 2 | **Event-study CI** | Coefficient + 95% CI at the official intervention date; interval straddling zero = "barely moved the clock" | `eventStudy` |
| 3 | **The flip** | Diverging effect: network **+48 s** vs this segment **−95 s**, each with a CI whisker; opposite signs, neither crosses zero | `flip` |
| 4 | **Robustness forest** | Estimate under each control set + adjacent-block placebo + boardings demand check, CIs, zero line — **reuses the dumbbell primitive** | `robustness` |
| 5 | **Episode ↔ permit overlay** | Episodes as a lane chart vs filed permit windows (88% inside); 311 double-parking series co-moving beneath | `episodes` + permits + 311 |
| 6 | **Curb-vs-lane map** | The segment with curb-complaint density — where the binding constraint is the curb, not the lane | 311 geocodes + geometry (maplibre) |
| 7 | **Pre-registered RD** | The forward test: predicted discontinuity band at the next permit onset + required 311 co-move | `preRegistration` |

## The one hard engineering problem: a stable segment spine

The carpet's x-axis is *not* free. The speed-data wiki warns that **timepoints change between
schedule versions** — names are unstable join keys, and a route's timepoint set shifts over 36
months. If you key segments by timepoint name/pair, the carpet's columns won't line up across years
(the "column structure jumps" above is partly *real* schedule change and partly *artifact*).

**Proven on B41 (2026-06-05).** Querying all 36 months for B41 shows the drift is real but small and
mechanical — a *single Jan-2026 schedule change* with two symptoms:

- **Northbound** — the timepoint "FLATBUSH AV/**NOSTRAND**" (40.6328, −73.9475) became
  "FLATBUSH AV/**EASTERN PKWY**" (40.6321, −73.9467) — **~80 m apart, same physical corner, new
  name** — re-keying 4 of 11 timepoint-pair segments from 2026-01.
- **Southbound** — `stop_order` renumbered **+1** at the same change (a segment shifted ord 15→14,
  20→19, 28→27), so the *same street* splits into two carpet rows if you key by `stop_order`.

So **neither raw timepoint-pair nor raw `stop_order` is a safe spine key** — each breaks under one
symptom of the same event. But the **physical location is stable**: the corner is the corner under
either name or ordinal.

**The fix — snap timepoints to geographic nodes, don't trust labels or ordinals.** Bin each timepoint
by coordinate (~100 m tolerance, optionally projected onto `local_route_shape_geom` per
[[wiki/engineering/map_strategy|map strategy]]) into a stable **spine node**; a segment is the
ordered pair of spine nodes. B41's ~11 NB keys collapse to ~8 physical segments; SB stays 7; the
carpet columns line up across the schedule change. This is lighter than full linear-referencing and
is offline pipeline work (CLAUDE.md). The honest bonus: where a spine segment genuinely has no data
in a month, the carpet cell is a **gap**, and the Jan-2026 change renders as an annotated rule — *not*
silently misaligned rows.

## Multi-year serving plan — the data-preparation path is the work

**Ingested ≠ servable.** The 165 GB `data/local/pipeline.sqlite` is not reachable from a Cloudflare
Worker; only what we *build into R2/D1 artifacts and publish* is. And the current build chain is
**single-month by construction** end to end:

```text
local sqlite
  → route-slice raw export        keyed  data/.../route-slices/<slug>-<month>/   (per month)
  → route-brief-input.json        per <slug>-<month>
  → studio release (_release-segments.buildRouteSegmentEvidence(slug, id, MONTH, …))
                                   → emits ONE month: each segment has a scalar `month`,
                                     one observedSpeedMph, one 24-bin `hours` array
  → studio/v1/{release.json, routes.json, routes/<slug>/detail.json, …}   (R2)
  → export d1  +  scripts/publish-serving-release.sh   → R2 + D1 (dry-run gated)
  → packages/studio-api contracts → Worker → apps/web api-contract.ts + loader → component
```

There is **no time axis anywhere in that chain.** `month` is a scalar parameter, `studio/v1` keys a
single baseline release, and `StudioSegment`/`StudioRouteSegmentEvidence` have no series field. So
"prepare the data" is a real, concrete pipeline-plus-serving job, not a flip of a switch. Heavy work
stays **offline in pipeline-v2** (CLAUDE.md); D1/R2 serve precomputed results only.

### What is genuinely new vs. plumbing-with-a-template

| Stage | Status | Work |
|---|---|---|
| **Stable segment spine** | **implemented for current source routes** | `studio route-speed-spines` builds stable `studio/v2/routes/<slug>/speed-spine.json` artifacts plus `studio/v2/speed-spines/<range>/manifest.json`. The 2023-04→2026-03 run wrote 385 route spines: 134 `series_ready`, 36 `series_ready_with_gaps`, 215 `needs_pattern_review`, 0 failed. |
| **Month-spanning producer** | **implemented for all spine routes** | `studio route-speed-histories` reads the spine manifest and materializes `spine × month × daypart` cells from `local_route_segment_speed`. It is resumable: valid existing route artifacts are skipped unless `--force` is passed. |
| **Artifacts** | **generated locally** | `studio/v2/routes/<slug>/speed-history.json` is now present for 385 routes. Current full run: 718,816 cells, 499,693 available, 219,123 explicit missing, 42 unmapped raw keys across 20 routes; all 385 artifacts validate against `StudioRouteSpeedHistoryResponseSchema`. Total size is ~320 MB raw JSON / ~13.1 MB gzipped. |
| **`export d1` / publish** | **R2 upload path covered; D1 coverage index still pending** | Existing `publish r2-artifacts` already uploads the full `studio` prefix, including nested `studio/v2/routes/<slug>/speed-history.json`; a regression test now covers this key shape. The remaining D1 work is a compact coverage/index table so route lists can advertise which route histories are published without probing R2. |
| **Contract + Worker** | **implemented** | `GET /api/v1/studio/routes/{slug}/history` serves compact route-month speed/ridership history from D1. `GET /api/v1/studio/routes/{slug}/speed-history` now resolves the full route-segment month/daypart R2 artifact and validates it against the domain schema before returning it. Snapshot 2.0 advertises `route_speed_history` as a partial R2 projection. |
| **Loader + component** | **template exists** | Web route loader fetches speed-history **deferred/lazy** (off the 168 KB initial bundle); the carpet component paints it. The dumbbell loader is the template. |
| **Coverage matrix** | **new (small)** | `signal_month_coverage_matrix` (speed / ridership / permit / 311 / weather per month) as a D1 table + R2 doc — itself a public honesty surface so no figure implies a month we don't hold. |
| **`natural_experiment_case`** | **new (depends on analytics)** | The segment-arc payload (episodes, event-study, flip, robustness, permit-overlap %, 311 co-move, RD spec) from the curb-pulse pipeline. Gated behind that analytics work; the carpet/series do **not** depend on it. |

The honest read now: the **producer + stable spine + API** are no longer speculative. The next hard
gate is productizing the coverage/index layer and the deferred route-carpet UI without implying that
routes with `needs_pattern_review` have the same geometric confidence as `series_ready` routes.

Storage split (reuse [[wiki/engineering/serving_storage_split_plan|serving storage split]] /
[[wiki/engineering/map_strategy|map strategy]]):

```text
D1   = route index, coverage-matrix rows, decimated segment×month overview, case index rows
R2   = studio/v2/routes/<slug>/speed-history.json (series + carpet), case payloads, map geo
Pipe = geographic segment spine, multi-month weighting/percentiles, decimation, episodes, event studies
Browser = paint + interact only
```

### Snapshot contract additions

Extend the baseline plan's `StudioRouteSurfaceFlags` and support levels:

```ts
// add to StudioRouteSurfaceFlags
speedHistorySeries: "available" | "decimated_only" | "upstream_blocked" | "missing";
carpet:             "available" | "missing";
coverageMatrix:     "available" | "missing";
naturalExperiment:  "available" | "candidate" | "none";
```

| New support level | Requirement | Unlocks |
|---|---|---|
| `series_ready` (between `artifact_ready` and `evidence_ready`) | Route has a multi-year series on the geographic spine. | Network nominator dot, the route carpet, the league wall. |
| `case_ready` (new top tier) | Route/segment has a promoted `natural_experiment_case`. | The full segment-arc spread (figures 1–7). |

A route with no series still renders — its carpet slot shows an explicit "single-month baseline only"
state, consistent with the baseline plan's section-level-unavailable rule.

## House visual system

One publication, not a dashboard kit. Reuse the tokens already in `CorridorProfile.chart.tsx`:
`--bp-color-ink[/-40/-55/-70]`, `--bp-color-good/warn/bad`, `--bp-color-accent`, `--bp-color-rule`,
`--font-mono`, `tabular-nums`. Principles:

- **Number first.** Every figure leads with the magnitude and carries a one-line *findings-deck line*
  (e.g. "B41's four-block AM segment runs 31% faster — −95 s, +2.6 mph — when a permit clears the
  curb"). The chart defends the sentence.
- **Show uncertainty as a first-class mark.** A coefficient that crosses zero must *look* like it.
- **Annotate in place, not in a legend** (the dumbbell already does this); legends only for small
  multiples.
- **Baseline-relative color** for dense views, so *change* reads louder than *level*.

## Prototype sequence — data path is wide, UI remains vertical

The data-preparation path is now network-wide. The UI can still launch as a one-route vertical slice,
but it should consume the same all-route contracts the final product will use. "Done" still means *the
carpet renders on the deployed site*, not merely that artifacts exist on disk.

1. **Geographic segment spine** (done locally) — `studio route-speed-spines --start-month 2023-04
   --end-month 2026-03` wrote 385 route spines and the all-route readiness manifest.
2. **Month-spanning producer + artifacts** (done locally) — `studio route-speed-histories
   --start-month 2023-04 --end-month 2026-03` wrote or resumed all 385 speed-history artifacts.
3. **Serve it** (implemented in contract/API) — `GET /api/v1/studio/routes/{slug}/speed-history`
   resolves the R2 artifact and validates it. Existing R2 publish picks up `studio/v2/**` via the
   `studio` prefix.
4. **Coverage/index layer** (next) — add a compact D1/R2 coverage manifest for `route_speed_history`
   so route lists and Snapshot 2.0 can distinguish `series_ready`, `series_ready_with_gaps`,
   `needs_pattern_review`, missing, and unpublished without probing per-route R2 keys.
5. **Extract the chart kit** from `CorridorProfile.chart.tsx`; re-paint the dumbbell on it (no
   Recharts). *Verify:* no visual regression in the system gallery.
6. **The route speed-carpet** (UI vertical slice) — deferred loader, daypart small-multiples,
   schedule-pattern quality label, click to drill. B41 remains a good first visual target, but the
   loader should work for any route with a published speed-history artifact.
6. **Generalize the producer to all `series_ready` routes**, then build **the network nominator**
   beeswarm and **the segment arc** (pulse strip → the flip → robustness forest) on the segment the
   carpet+nominator point to.

That sequence delivers a working end-to-end zoom (nominate → locate → explain) **served from the
site** for one real route before generalizing to 381.

## Acceptance gates (extend the baseline plan)

- `signal_month_coverage_matrix` reports the true per-source month span; no figure implies an absent
  month.
- A `series_ready` route paints a 36-month carpet on a *stable* segment spine; a non-series route
  shows the explicit "single-month baseline only" state.
- A `case_ready` route renders figures 1–7 entirely from its precomputed payload — **no analytics in
  the request path.**
- The carpet's columns line up across at least one known schedule change (spine-stability proof).

## Open decisions

1. **Carpet color encoding** — observed-vs-own-baseline (recommended: change reads loudest) vs
   absolute mph vs observed-vs-scheduled gap. Possibly a user toggle.
2. **Spine granularity** — keep timepoint-pair segments projected to geometry, or re-bin to fixed
   street lengths? (Leaning: projected timepoint-pairs first; fixed-length only if columns still
   drift.)
3. **Case surface gating** — public on the route page, or Studio-review until publication-wording
   gates pass (mirror finding/brief promotion)?
4. **Product IA** — are the segment-arc figures a dedicated "Case" surface, or embeddable
   `BriefBlock` figures in the composer (ADR-0015)?

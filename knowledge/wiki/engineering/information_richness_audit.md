---
title: Information Richness Audit
type: engineering
status: active
last_updated: 2026-05-30
owner: codex
source_count: 0
tags: [audit, data-corpus, grain, projection, studio-api, opportunities]
---

# Information Richness Audit

## Purpose

`website_data_support_audit.md` tracks **product-shape** gaps — is a feature surfaced, is it real vs. mocked, is it editorially reviewed. This page tracks **information-richness** gaps — when a dimension exists in the raw corpus but gets collapsed before reaching the user.

Most collapses are deliberate. The point of the audit is to keep the *opportunity surface* visible, so the next product call about "should the route page show X" is evidence-based rather than guessed.

Companion to [[wiki/architecture/data-corpus-overview]] (in `docs/architecture/`), which has the three-tier diagram and stage-by-stage pipeline summary.

## Relationship to sibling audits

Three audits with adjacent but distinct lenses — keep them straight:

- **`website_data_support_audit.md`** — *product-shape*: is a feature surfaced, real vs. mocked, editorially reviewed.
- **`synthetic_data_inventory.md`** — *field-by-field renderer view*: for each visible UI field, is the displayed value backed by observation, proxy, or invention. Tracks per-page audits, P0/P1/P2 remediation queues, and the Observed/Proxy/Prototype bucket framework (2026-05-24).
- **This page** — *axis-by-axis grain view*: where in raw → pipeline → serving → UI does each information axis get collapsed.

The same underlying gap can appear in two audits at once. Example: per-stop ridership shows up as "synthetic source for stop-level boarding context" in the synthetic inventory **and** as "stop axis collapsed at ingest" here. Both views are accurate; cross-link when fixing one.

When this page and the synthetic inventory disagree, the synthetic inventory wins on field-level facts (it inspects the renderer); this page wins on grain-level lineage (it traces the pipeline).

## Method

Per axis, four columns:

- **Raw grain** — what `knowledge/raw/` carries, sourced from captured Socrata metadata.
- **Pipeline grain** — what `@bp/db/local` stores after `tools/pipeline-v2` runs, sourced from command code.
- **Serving grain** — what D1 + R2 carries, sourced from `packages/db/src/d1/schema.ts`.
- **UI grain** — what `apps/web` actually renders, sourced from `packages/domain/src/studio-schemas.ts` + route components.

Plus a rationale line for the largest collapse and an opportunity line if surfacing more would be cheap or strategic.

Last code inspection: 2026-05-30.

## Axes

### A. Speed — hour of day

| Layer | Grain |
|---|---|
| Raw | hour 0–23 per (route, direction, timepoint-pair, month, day-of-week). 7.3M rows for 2025+, 11.7M for 2023–24. |
| Pipeline | Two products: (a) 5 dayparts (AM peak 6–9, Midday 10–15, PM peak 16–19, Evening 20–23, Overnight else) for slow-window flagging in `route/brief-metrics.ts`; (b) 24 observed slow-window bins per segment emitted by the route-brief build into `route-brief-input.json`. |
| Serving | **Segment grain:** `segment.hours` array of 24 values per segment ships in route-detail and route-segment API responses; `audit:studio-coverage` enforces 24-element arrays. **Route-summary grain:** dayparts are not exposed; no per-route-month hour vector. |
| UI | Used as input to segment-level rendering (`HourOverlay` component exists). Not exposed as a primary route-summary visualization. |

**Largest collapse (route-summary grain):** the per-route, per-month, per-hour profile is never assembled. You can see hours on a segment row, but you cannot see "how does route Bx12 perform across the day?" as a single chart.
**Opportunity:** add a `dayparts` block (or 24-element vector) to `StudioRouteDetailResponseSchema` summarized across the route's segments, so the route page can render a peak-hour profile without drilling into individual segments. Pipeline data already exists at the segment grain; the work is aggregation + schema + UI.
**Note:** the synthetic inventory tracks `segment.hours` as real and observed; this audit's lens is the *route-summary* gap, not the segment-grain field.

### A2. Speed — day of week

| Layer | Grain |
|---|---|
| Raw | Mon–Sun per (route, direction, timepoint-pair, month, hour). |
| Pipeline | Carried through hotspot rollup at the window-key level (`${dayOfWeek}:${hourOfDay}`). |
| Serving | Not exposed. |
| UI | Not rendered. |

**Largest collapse:** weekday vs. weekend (and within-week variation) entirely absorbed. A route that's fine M–F and broken Saturday looks identical to a route that's uniformly mediocre.
**Opportunity:** weekday/Saturday/Sunday split per route-month is one extra serving column. Highest-value pairing with the daypart grid above (the natural visualization is a 7×5 heatmap).

### A3. Speed — direction

| Layer | Grain |
|---|---|
| Raw | Both directions per timepoint-pair. |
| Pipeline | Preserved at hotspot grain (`segmentId` carries direction). |
| Serving | Exposed in `routes/$routeId/ladder` views and hotspot lists. |
| UI | Rendered in the ladder; **not** in the route summary scorecards. |

**Largest collapse:** route summary blends directions; a route slow only inbound looks half as bad.
**Opportunity:** small — split the scorecard summary by direction. Already represented end-to-end except in the summary projection.

### A4. Speed — severity

| Layer | Grain |
|---|---|
| Raw | Continuous mph (0 to ~30). |
| Pipeline | Continuous through hotspot scoring, but a binary flag fires below `slowSpeedThresholdMph = 8`. |
| Serving | Hotspot score and a slow boolean. |
| UI | Mostly binary "slow" indication. |

**Largest collapse:** the gradient between 8 mph (flagged) and 12 mph (not flagged) is treated identically by anything reading the flag.
**Opportunity:** UI use of `hotspotScore` directly (as a color ramp) costs nothing — the value already ships.

### B. Headway / observed reliability — distribution shape

| Layer | Grain |
|---|---|
| Raw | Per-trip GTFS-RT vehicle positions (Worker-captured protobufs, second resolution). |
| Pipeline | Per-(route, stop, direction) headway-minute samples in `observed_headway_sample`. Reduced per route-month to median, p90, mean, excess-wait estimator. 2.6M recovered samples at the sample-row level. |
| Serving | 6 scalar fields per route-month (`StudioObservedReliabilitySchema`): `medianObservedHeadwayMinutes`, `p90ObservedHeadwayMinutes`, `observedBunchingShare`, `observedLongGapShare`, `excessWaitMinutes`, `sampleCount`. |
| UI | Renders the scalars. No distribution shape. |

**Largest collapse:** the headway *distribution* is reduced to two quantiles. Bunching/long-gap shares add some shape, but the histogram is not surfaced.
**Opportunity:** ship a compact bucketed histogram (e.g. 0–2, 2–4, 4–6, 6–10, 10–20, 20+ minutes) as an R2 release document per route-month. The pipeline can produce it from `observed_headway_sample` with no new computation, just a new emitter. High-impact for any user who understands what "p90 = 14" actually means.

### C. Ridership

| Layer | Grain |
|---|---|
| Raw | stop × hour × date for 2025+ (115M rows, `gxb3-akrn`) and 2020–24 (362M rows, `kv7t-n8in`). |
| Pipeline | Route × month sums via SoQL `SUM(ridership), SUM(transfers) GROUP BY bus_route, year, month` in `ingest/route-trends.ts`. |
| Serving | Route × month totals on the trend row. |
| UI | Used for trend chart and as input to rider-impact scoring; per-stop, per-hour not surfaced. |

**Largest collapse:** stop and hour axes are both summed away at ingest. We **never store** sub-route, sub-month ridership locally — to recover those axes you must re-pull from Socrata at a different grain.
**Opportunity:** highest-value but highest-cost. Per-stop ridership heatmap per route is a portfolio-grade visualization (especially overlaid on a route polyline). Cost: a separate ingest pipeline at the finer grain, and storage; the existing one is route × month for a reason.

### D. Trend / time series

| Layer | Grain |
|---|---|
| Raw | Months back to 2023-01 from segment-speeds 2023–24, continuing through latest available 2025+ month. |
| Pipeline | Route × month rows in `route_month_trend`. 105 route-month rows for current 7 built routes per the v1 audit. |
| Serving | `route.spark: number[]` + `route.sparkMonths: string[]` per route. |
| UI | Spark line / spark bar; comparison overlay on `/compare`. |

**Largest collapse:** trend is monthly only. Within-month structure (e.g. a route slowing only during a 2-week construction window) is invisible.
**Opportunity:** weekly trend rollup as an optional extension. Not high-priority; monthly is the publisher's own grain so the gap is honest.

### E. Context joins (collisions, permits, 311, parking, weather)

| Layer | Grain |
|---|---|
| Raw | Per-event with location + timestamp. Tens of millions of rows per source. |
| Pipeline | Joined to routes via LION buffer (150m near, 400m on-street). Stored as detector evidence and `context_event_route_touches`. |
| Serving | Used in finding evidence packets and brief context appendices; not as a first-class route-page surface. |
| UI | Surfaced inside finding reasoning trails when relevant; mostly invisible elsewhere. |

**Largest collapse:** none, structurally — the join is preserved. The gap is **product**: context exists in the corpus and pipeline but doesn't have a user-facing home outside findings.
**Opportunity:** a "what's happening on this route" context strip on the route detail page (recent collisions, open permits, 311 spike) could expose joins that already exist in `@bp/db/local`. Frame as caveat/context, not causal.

### F. Corridor membership

| Layer | Grain |
|---|---|
| Raw | Route polylines + LION centerline graph. |
| Pipeline | `corridor_route_member` with per-route attribution; `corridor_month_summary` blends across members. |
| Serving | Corridor summary endpoints + member refs. |
| UI | Rendered where corridors appear; route summary doesn't display "this route is in corridor X with these peers." |

**Largest collapse:** mostly cosmetic — attribution is stored, just not always shown alongside the route summary.
**Opportunity:** route detail page can show corridor peers as a small chip/list. Free given the data.

### G. Weather

| Layer | Grain |
|---|---|
| Raw | Daily NOAA GHCN observations (temperature, precipitation) for NYC stations. |
| Pipeline | Route-day weather-reliability split exists; control windows for matched comparisons (per `knowledge/index.md` open issue 10). |
| Serving | Used in finding context appendix as a caveat; route-page weather narrative is partial. |
| UI | Mostly absent from route-page summaries. |

**Largest collapse:** in line with the deliberate "weather is context, not headline" framing. Not a richness gap so much as a product positioning choice.

### H0. Route geometry (maps)

| Layer | Grain |
|---|---|
| Raw | Route polylines (`h2wf-afav`), stop points (`ai5j-txmn`), bus-lane geometry (`ycrg-ses3`). |
| Pipeline | `tools/pipeline-v2/src/commands/map/artifacts.ts` writes monthly per-route GeoJSON (route polyline + stops + bus-lane overlay + all-day route-segment geometry colored by observed speed inputs) under `data/artifacts/.../map/`. |
| Serving | R2 holds the GeoJSON artifacts under release keys; `MapManifestResponse` indexes them. |
| UI | **Not rendered.** `apps/web/src/components/MapThumb.tsx` is a decorative SVG placeholder. No MapLibre canvas mounts anywhere despite `maplibre-gl` + `pmtiles` being installed and `.maplibregl-*` CSS being present. |

**Largest collapse:** the renderer step. Everything from raw geometry through the R2 release artifact ships end-to-end; the consuming component does not exist.
**Opportunity (documented decision):** **route detail pages should render a real map.** Per-route-month GeoJSON is already keyed and built; the work is a `<RouteMap>` component that reads `MapManifestResponse`, fetches from R2, and renders the route polyline + stops + segment-speed coloring. The existing decorative `MapThumb` slot on `/routes/$routeId` is the natural mount point. Secondary placements (findings detail inset, NYC-scale overview) follow once the primary renderer exists.

### H. Intervention timing (ACE, bus lanes)

| Layer | Grain |
|---|---|
| Raw | ACE start dates (clean), bus-lane install dates (partial — gap-filled where public dates exist). |
| Pipeline | `intervention_event` rows with effective dates and route attribution. |
| Serving | `route_intervention_comparison` rollups; intervention list on the route. |
| UI | Rendered as intervention markers and in before/after comparisons. |

**Largest collapse:** bus-lane date recovery limits how many event-study windows are valid. This is a **source gap**, not a projection gap — surfaced honestly in the existing open issues.

## Summary table

| Axis | Pipeline has it | Serving has it | UI shows it | Cheapness to surface |
|---|---|---|---|---|
| Route geometry (map on route detail) | Yes (GeoJSON artifacts) | Yes (R2 + `MapManifestResponse`) | No (placeholder only) | Cheap — single component |
| Speed × hour (segment grain) | Yes (24 bins) | Yes (`segment.hours`) | Partial (input to `HourOverlay`) | Already shipping |
| Speed × hour (route-summary grain) | Partial (segment-aggregable) | No | No | Cheap (aggregate + render) |
| Speed × day of week | Yes | No | No | Cheap |
| Speed × direction | Yes | Partial | Partial | Trivial in summary |
| Speed severity (continuous) | Yes | Yes (`hotspotScore`) | Partial | Free (use existing field) |
| Headway distribution | Yes (samples) | No (6 scalars) | No | Medium (new R2 doc) |
| Ridership × stop × hour | No (collapsed at ingest) | No | No | Expensive (re-ingest) |
| Trend × week | No (monthly only) | No | No | Medium |
| Context joins (existing) | Yes | Findings-only | Findings-only | Cheap product surface |
| Corridor peers on route page | Yes | Yes | Partial | Trivial |

## Ranked follow-up queue

1. **Render a real map on the route detail page.** Documented decision. Pipeline GeoJSON artifacts and R2 manifest already exist; `maplibre-gl` + `pmtiles` already installed. Work is a single `<RouteMap>` component replacing the decorative `MapThumb` slot on `/routes/$routeId`. See axis H0.
2. **Surface dayparts on the route detail page.** Highest leverage per unit work after the map. Pipeline data exists; needs schema field, D1 column, UI component.
3. **Direction split in the route scorecard.** Already represented except in the summary projection.
4. **Headway distribution as an R2 release document.** New emitter, no new computation. High product impact for analyst audience.
5. **Day-of-week × daypart heatmap.** Pairs with #2; the natural visualization (7×5 grid) is portfolio-grade.
6. **Context strip on route detail.** Joins exist; needs a UI home and honest framing.
7. **Per-stop ridership heatmap.** Expensive (new ingest grain), but the most visually striking option for an MTA portfolio.

## Update protocol

Update this page when:

- A new ingest or rollup stage changes the pipeline grain of any axis.
- A schema in `packages/domain/src/studio-schemas.ts` adds, removes, or changes a richness-bearing field.
- A UI route surfaces (or removes) an axis listed here.
- A follow-up from the ranked queue ships, in which case retire the row.

Pair with `website_data_support_audit.md` (product-shape) and `synthetic_data_inventory.md` (real-vs-mocked). The three together describe everything the public site does and doesn't yet say.

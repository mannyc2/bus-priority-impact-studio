# Data corpus overview

Navigation and glossary for how data flows from public sources to the public website. This page consolidates concepts that exist in scattered form across `knowledge/wiki/` and `docs/decisions/`; it does not introduce new design.

## The three tiers

```
┌─────────────────────────────────────────────────────────────────┐
│  1. RAW CORPUS                                                  │
│  Immutable point-in-time captures of every public source.       │
│  ~7M+ speed rows, GTFS bundles, GTFS-RT protobufs, policy docs. │
│  Lives on local disk under knowledge/raw/. Never read by a      │
│  public request.                                                │
└──────────────────────┬──────────────────────────────────────────┘
                       │ tools/pipeline-v2 (heavy aggregation,
                       │ geospatial joins, detector runs)
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. LOCAL ARTIFACTS                                             │
│  Generated rollups, corridor joins, hotspot scores,             │
│  intervention evaluations, brief drafts, evidence packets.      │
│  Bigger than what we serve, smaller than raw. Gitignored.       │
│  Source of truth for what *could* be published.                 │
└──────────────────────┬──────────────────────────────────────────┘
                       │ promote serving projection
                       │ (not a monthly-product doctrine)
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. SERVING PROJECTION                                          │
│  Compact pre-baked answers in Cloudflare D1 + R2.               │
│  D1: indexed rows (scorecards, time-series, hotspots).          │
│  R2: immutable bundles (ladder JSON, finding trails, GeoJSON).  │
│  This is what apps/web reads. The public never sees the raw     │
│  corpus or local artifacts.                                     │
└─────────────────────────────────────────────────────────────────┘
```

### 1. Raw corpus — `knowledge/raw/`

The on-disk layout (`source_manifest.yaml`, `metadata/`, `downloads/`, `assets/`, `notes/`, `tier2_document_backlog.json`) is the wrapper. What matters is **what the data actually says about NYC buses**. Per `CLAUDE.md`, this tier is **immutable**: new captures only, never edits to existing files.

Everything below is sourced from the captured Socrata metadata (row counts are publisher-reported as of the last `checkedAt`).

#### The observation layer — what buses actually did

| Source | Dataset ID | Rows | Grain | What it tells us |
|---|---|---:|---|---|
| MTA Bus Route Segment Speeds: 2025+ | `kufs-yh3x` | 7.3M | route × direction × timepoint-pair × month × day-of-week × hour | Average speed (mph), average travel time (min), road distance, trip count for every adjacent timepoint pair. **The spine of every speed/reliability claim.** |
| Same dataset, 2023–2024 | `58t6-89vi` | 11.7M | identical | Historical baseline for trend and intervention before/after. |
| CBD Bus Speeds: 2023+ | `r6db-kkzj` | 595k | optional, CBD-scoped | Congestion-zone-specific cut, less used. |
| MTA Bus Wait Assessment: 2015+ | `v4z4-2h6n` | 166k | route × month | Historical wait-time reliability metric. Coarse but long history. |
| GTFS-RT vehicle positions / trip updates / alerts | n/a (Worker-captured) | continuous protobuf | seconds | Real-time observations. The pipeline derives observed headways from these (see § 2). |

**What's lost vs. raw observation:** segment speeds are already publisher-side aggregated to month × hour × day-of-week. Individual trips aren't in this dataset — you cannot ask "what did the 8:14am B46 do on 2025-09-12." For that you'd need GTFS-RT.

#### The demand layer — who is riding

| Source | Dataset ID | Rows | Grain | What it tells us |
|---|---|---:|---|---|
| MTA Bus Hourly Ridership: 2025+ | `gxb3-akrn` | 115M | route × stop × hour × date | Boardings (+ transfers) per stop per hour. |
| MTA Bus Hourly Ridership: 2020–2024 | `kv7t-n8in` | 362M | identical | Historical ridership for weighting and trend. |

These power the rider-impact weighting in route scoring — slow speed × high ridership = higher priority.

#### The network layer — the bus system itself

| Source | Dataset ID | Rows | What it is |
|---|---|---:|---|
| MTA Current Bus Routes | `h2wf-afav` | 1,640 | Route polylines, short/long names, direction, color, bounding box. The active route set. |
| MTA Current Bus Stops | `ai5j-txmn` | 23,048 | Stop points, lat/long, timepoint flag, CBD flag, route/direction membership. |
| MTA Bus Routes (all bundles) | `bzwk-3hb4` | 200,476 | Route shape history including retired routes. |
| MTA Bus Stops (all bundles) | `2ucp-7wg5` | 3.1M | Historical stop versions. |
| MTA Bus Schedules: 2026 | `4fnn-qsea` | 8.9M | Scheduled trips and timepoints — the planned-service baseline observed speeds are compared against. |
| GTFS static bundles | per borough | bundle files | Canonical scheduled service in GTFS format (one bundle per operating borough + MTA Bus Company). |

#### The intervention layer — what the city did

| Source | Dataset ID | Rows | What it tells us |
|---|---|---:|---|
| MTA ACE Routes (enforced routes) | `ki2b-sg5y` | 81 | Which routes carry Automated Camera Enforcement, with start dates. |
| MTA ACE Violations | `kh8p-hcbm` | 5.2M | Each camera violation: route, location, time. Used for treatment-effect studies. |
| NYC DOT Bus Lanes (Local Streets) | `ycrg-ses3` | 4,068 | Bus-lane geometry, install dates where recoverable. |
| MTA Express Bus Capacity | `4tpr-3bvc` | 49k | Apr–Sep 2023 capacity context for express routes. |

#### The context layer — why a route is slow

| Source | Dataset ID | Rows | What it tells us |
|---|---|---:|---|
| DOT Traffic Speeds | `i4gi-tjb9` | 104M | NYC-wide vehicle speed observations from DOT sensors. |
| Automated Traffic Volume Counts | `7ym2-wayt` | 1.9M | Vehicle volumes on counted segments. |
| Motor Vehicle Collisions | `h9gi-nx95` | 2.3M | Crash records — incident context for reliability hits. |
| Street Construction Permits (2022+) | `tqtj-sjs8` | 3.6M | Open construction windows along route corridors. |
| Street Opening Permits | `9jic-byiu` | (alias of construction) | Duplicate channel. |
| 311 Service Requests (2010–2019) | `76ig-c548` | 22.6M | Historical complaints; bus/traffic-related types are filtered downstream. |
| 311 Service Requests (2020+) | `erm2-nwe9` | live (not row-counted at capture) | Current complaint stream. |
| Parking Violations FY2023–current | various | hundreds of millions | Curb-use signal; double-parking proxy near bus corridors. |
| NOAA GHCN Daily — NYC | external | daily | Temperature/precipitation. Feeds the weather-reliability split. |

#### The structural/equity layer

| Source | Dataset ID | Rows | What it tells us |
|---|---|---:|---|
| NYC Borough Boundaries | `gthc-hcne` | 5 | Five-borough clipping geometry. |
| NYC LION Street Centerline | external | streets | Street-network graph for route ⇄ corridor joins (see ADR 0007 — spatialite). |
| Census ACS5 Profile (tracts) | external | tracts | Demographics for equity context per route catchment. |

#### The policy/document layer — the "Tier 2" corpus

| Source | What it is |
|---|---|
| MTA segment-speed blog posts (2024, 2026) | Editorial framing of the speed data; cited in briefs. |
| MTA ACE program page | Authoritative ACE narrative. |
| MTA Open Data Program page | Context for the program this project aligns with. |
| MTA Developer Resources / data feed terms | Compliance and integration references. |
| GTFS-RT reference docs | Spec for parsing realtime feeds. |
| `tier2_document_backlog.json` queue | Board materials, press releases, planning documents pending OCR/extract for intervention-record mining. |

#### Tradeoffs and known holes

- **Coverage skew toward post-2023.** The 7M + 11.7M segment-speed rows give us strong 2023→present coverage. Pre-2023 speed analysis is not directly supported.
- **No trip-level granularity in public speeds.** Anything per-trip must come from GTFS-RT capture, which only began under our own Worker cron — see `mta_bus_time_realtime.md`.
- **Intervention dates are partial.** Bus-lane install dates are recovered where public dates exist; ACE start dates are clean. Some treatment-effect studies are gated on this.
- **Provenance labels matter.** The current `Observed Release` is March 2026 with `third_party_recovered` provenance — meaning the underlying speed rows were captured by a third party we mirrored, not by direct Socrata pull. May 2026 self-collected data sits as a `Current Signal` appendix until the public publication catches up.

### 2. Local artifacts — `tools/pipeline-v2` output

`tools/pipeline-v2` reads `knowledge/raw/` plus gitignored source snapshots under
`data/raw/`, runs deterministic transformations, and writes both **rows into
`@bp/db/local` (the local SQLite pipeline DB)** and **JSON/GeoJSON artifacts
under `data/artifacts/`**. The local pipeline DB is the canonical handoff: it
replaced the older DB-shaped JSON files (see `local_pipeline_db_cutover.md`).

The local `data/` tree has a strict role split:

- `data/raw/` holds durable external source snapshots and mirrored raw handoffs.
- `data/working/` holds resumable intermediate state and scratch materialization.
- `data/artifacts/` holds deterministic derived products such as review packets,
  route briefs, map payloads, OCR markdown, and coverage reports.
- `data/exports/` holds release/publish handoffs.
- `data/local/` holds local databases and stores.
- `data/ops/` holds operational run control and observability: logs, PIDs, retry
  traces, progress ledgers, and restart scripts. It is not the canonical home for
  raw downloads or derived corpus artifacts.

These artifacts are the *staging ground* — what the publish step promotes from. They are not served directly. They are versioned by run and date (e.g. `tier2-full-corpus-2026-05-24-pass2/`).

Derived products are now registered separately from raw sources in
`tools/pipeline-v2/src/registry/data-products.ts`. The read-only
`audit data-product-completeness` command joins that registry to local SQLite tables and
`data/artifacts/` paths so the project can distinguish source availability from derived-product
completeness. Its statuses are `complete`, `partial`, `missing`, `stale`, `waived`, `blocked`, and
`fetching`.

The pipeline is a chain of stages, each with its own granularity-loss profile. Walking the chain:

#### Stage A — Ingest (1:1 typed mirror)

Commands under `tools/pipeline-v2/src/commands/ingest/`: `route-catalog`, `route-coverage`, `route-trends`, `ace-routes`, `ace-violations`, `bus-lanes`, `bus-wait-assessment`, `dot-traffic-speeds`, `dot-traffic-volumes`, `dot-street-permits`, `nypd-collisions`, `parking-violations`, `311-service-requests`, `lion-centerline`, `noaa-weather`, `equity-context`, `express-bus-capacity`, `gtfs-rt-snapshots`.

**What happens:** Socrata/external rows are pulled (often via SoQL filters on year/month/route), type-coerced, and inserted into `@bp/db/local` tables. Each ingest is a typed mirror — no aggregation yet, except where Socrata itself aggregates server-side.

**Where granularity is lost — Socrata-side aggregation in `route-trends`:**

```text
speed rows pulled with SoQL:
  SELECT route_id, year, month,
         COUNT(*) AS observation_count,
         SUM(bus_trip_count) AS bus_trip_count,
         AVG(average_road_speed) AS average_speed_mph
  GROUP BY route_id, year, month
```

The native grain is *route × direction × timepoint-pair × month × day-of-week × hour*. The trend ingest collapses to **route × month**, throwing away direction, timepoint-pair, day-of-week, and hour. This is intentional for the route-trend chart but irreversible — to recover those axes you must re-pull from the segment-speeds dataset directly.

Ridership trends collapse similarly: stop and hour are summed away into **route × month** sums.

#### Stage B — Spatial joins and link tables

Commands under `tools/pipeline-v2/src/commands/build/`: `lion-geometry-index`, `route-shape-geometry-index`, `route-lion-link`, `observed-headways`, `context-events`, `context-event-route-touches`, `parking-violation-matches`, `express-route-analysis`, `express-bus-capacity-context`.

**What happens:** geometry is joined via spatialite (ADR 0007). Route shapes are matched against the LION street centerline graph to build `route_lion_link` — the join that lets non-bus sources (DOT speeds, traffic volume, collisions, permits, 311, parking violations) attach to bus routes.

**Where granularity is lost — spatial buffering:**

```text
busLaneProximityThresholdMeters    = 150   // bus lane considered "near" a stop
busLaneStreetMatchThresholdMeters  = 400   // bus lane considered "on" a route street
```

(From `route/brief-metrics.ts`.) Anything beyond the buffer is dropped from the join. This trades precision for recall — a permit 200m from the route is included in context, a permit 500m away is not.

**GTFS-RT → observed headways:** `build/observed-headways.ts` walks raw vehicle-position protobufs, infers stop events, then computes headway samples as the time between successive same-route vehicles passing the same stop. Cap: `maxHeadwaySeconds = 6 * 60 * 60` (six hours — anything longer is treated as missing, not a real headway). The raw second-resolution protobuf is collapsed to *(route, stop, direction, headway-minutes)* sample rows.

#### Stage C — Route-month aggregation

Commands under `tools/pipeline-v2/src/commands/route/`: `readiness`, `build-plan`, `reliability-baseline`, `observed-reliability`, `intervention-evaluation`, `equity-context`, `brief-metrics`, `brief-model`.

**What happens:** the per-route, per-month rollups that the website actually serves. This is where most of the granularity loss lives.

**`reliability-baseline`** — collapses scheduled-headway samples into route-window summaries:

```text
medianHeadwayMinutes  = quantile(intervals, 0.5)
p90HeadwayMinutes     = quantile(intervals, 0.9)
shortHeadwayWindow    = medianHeadwayMinutes <= threshold
longGapWindow         = p90HeadwayMinutes    >= threshold
```

Thousands of scheduled intervals per route → two numbers (median + p90) per window. Every intermediate value is dropped.

**`observed-reliability`** — same collapse but for GTFS-RT-observed headways. Adds an "excess wait time" estimator from the headway distribution:

```text
excess_wait ≈ sum(h²) / (2 · sum(h))       per route × month
```

A whole month of observed headways becomes one row per route. The estimator assumes Poisson passenger arrivals; it does not preserve the headway distribution.

**`brief-metrics`** — buckets the day into dayparts (the threshold for what counts as a "slow segment" comes from here):

```text
slowSpeedThresholdMph = 8
daypart(hour):
   6–9   → "AM peak"
   10–15 → "Midday"
   16–19 → "PM peak"
   20–23 → "Evening"
   else  → "Overnight"
```

24 hours collapse to 5 dayparts. A segment is flagged "slow" if its average road speed drops below 8 mph in the relevant window — anything between 8.1 and (say) 12 is treated identically in the hotspot signal.

**Hotspot rollup** produces `LocalRouteHotspot` rows: weighted average travel time, weighted average speed, bus-trip count, `hotspotScore`, and `riderImpactScore` per *(route, direction, timepoint-pair-segment)*. Multiple months and hours are blended by trip-count weighting — the per-hour signal is gone.

#### Stage D — Corridor model

Command: `corridor/model.ts`.

Routes that share street-corridor membership (via the LION link from stage B) are grouped into corridors. Per-route hotspots become corridor-level summaries with route membership preserved as a child table. The granularity loss is *which route is contributing what* — the corridor summary blends, but a `corridor_route_member` table keeps the per-route attribution for drill-down.

#### Stage E — Findings (detectors + agent proposals)

Commands under `tools/pipeline-v2/src/commands/findings/`: deterministic detectors run over the route-month tables and emit candidate findings; the agent harness (`agent-propose`, `agent-brief-propose`) can also propose findings with evidence-payload-aware validation. Findings go through a review/promote workflow; only promoted findings ever reach the serving projection.

**Granularity preserved here, not lost:** finding records carry references back to the specific route-month rows, detector parameters, evidence packets, and (for agent proposals) the validator decisions. This is what lets the Studio show a reasoning trail.

#### Stage F — Brief composition and serving promotion

Commands under `tools/pipeline-v2/src/commands/brief/` and `publish/`: assemble per-route brief artifacts from the route-month tables + promoted findings + map artifacts, then `publish:serving-release` writes the D1 row set and R2 objects.

This is the final projection step into Tier 3. The publish command name is historical; it should be
read as **promote a reviewed serving projection**, not "ship one monthly dataset as the product."
The public app should prefer multi-year route/corridor evidence wherever source coverage supports
it. The promotion step is the boundary at which `Pending Publication` → `Observed Release`.

#### Summary: where the corpus loses information

| Stage | Collapsed away | Preserved |
|---|---|---|
| Ingest (route-trends) | direction, timepoint-pair, day-of-week, hour | route, month, total trips, avg speed |
| Spatial join | exact distance, anything beyond buffer thresholds | route ⇄ corridor membership, "near" flag |
| Observed-headways | sub-minute timing, vehicle identity | per-(route, stop, direction) headway samples |
| Route-month aggregation | individual samples, per-hour detail | median, p90, dayparted windows, hotspot scores |
| Corridor model | per-route distinction inside a corridor | corridor membership table for drill-down |
| Findings | nothing structural | full back-references to inputs |
| Serving promotion | nothing further; just a projection boundary | the reviewed serving package |

Reversing any of these collapses requires going back to `knowledge/raw/` and re-running from the appropriate stage.

### 3. Serving projection — Cloudflare D1 + R2

The rule from [serving_storage_split_plan](../../knowledge/wiki/engineering/serving_storage_split_plan.md):

> If the API needs `WHERE route = ? AND month = ?`, use **D1**.
> If the API needs `fetch this complete versioned object`, use **R2**.

- **D1** holds compact, pre-answered queries: `route_scorecard`, `route_month_trend`, `corridor_hotspot`, `route_brief_summary`, intervention events, equity context. Indexed for the read patterns the API issues. See `packages/db/src/d1/schema.ts`.
- **R2** holds serving documents: route/timeline JSON, finding reasoning trails with evidence refs, brief shells, map GeoJSON, PMTiles. Immutable per promoted projection.

ADR [0002](../decisions/0002-postgres-drizzle-and-d1-serving-projections.md) sets the long-term plan: D1 stays as an edge serving projection; Postgres via Hyperdrive is the planned canonical analytics store when the project outgrows local artifacts.

## What "snapshot" can mean

The word is overloaded. Four distinct meanings live in this corpus:

| Meaning | Where it shows up | Example |
|---|---|---|
| **Source-capture snapshot** | `metadata/*.json` `checkedAt` | "Re-captured kufs-yh3x metadata on 2026-04-27." |
| **Native data-grain row** | The dataset's own period | A single (route, timepoint-pair, month, day-type, hour) row in segment speeds. |
| **Serving projection package** | D1 + R2 frozen package | "Projection promoted with March 2026 as the baseline anchor." |
| **Pipeline artifact corpus** | Dated working directories | `tier2-full-corpus-2026-05-24-pass2/`. |

When clarifying, say which axis you mean.

## Mixed Freshness Doctrine

ADR [0017](../decisions/0017-mixed-freshness-publication-model.md) is the canonical doctrine:

> The product is a multi-year evidence system with versioned baselines, current signals, and audited
> publication gates.

Avoid using "monthly release" as a product slogan. The target public contract is **multi-year by
default**: a route page should show history windows, baselines, current signals, treatment dates,
and document evidence together. A single baseline month is a provenance/review anchor, not the
shape of the product. Use the narrower terms instead:

| Term | What it answers |
|---|---|
| **Historical corpus** | What history do we have for trends, baselines, detector calibration, and route visuals? |
| **Baseline month** | What reviewed complete public monthly performance month anchors current route cards? |
| **Current signal** | What fresher evidence can be shown as an explicitly labeled appendix? |
| **Source-capture snapshot** | What raw upstream state did we preserve before it changed or expired? |
| **Pipeline artifact corpus** | What deterministic derived products can be reviewed and promoted? |
| **Serving projection** | What D1/R2 package can the public app read quickly and honestly? |
| **Publication / promotion** | Which reviewed mutation moved a projection to production? |

Monthly cadence remains valid for monthly source grains and review/audit keys. It is not the whole
product model, and new public surfaces should not be designed as single-month slices unless the
source itself only supports a one-month/latest-status view.

## Serving Projection Versus Analysis Corpus

The baseline month is not the analytical universe. It is one anchor inside a larger serving
projection. Historical local tables and artifacts are allowed to be much larger than the public
projection because detectors need history for baselines, calibration, near-miss analysis, and
false-positive review. The frontend goal is to expose more of that multi-year corpus directly,
not to keep flattening it into the latest month.

Current policy:

- Public current-state wording comes from the release month and any explicitly labeled current
  appendix.
- Baselines and detector thresholds come from named historical windows.
- Fine-grain historical sources must pass coverage audits before detectors use them as default
  baseline substrates.
- D1/R2 serving outputs should not expand just because the local analytical corpus expands.
- Public pages and APIs should expose mixed freshness explicitly: baseline month, history window,
  current signals, source coverage, projection freshness, and section-level support flags.

See `knowledge/wiki/engineering/analytics_corpus_profile.md` for the full-history detector-window
policy and the post-backfill coverage gate.

## Release labels

The audit release model names four layers (defined in [data_pipeline_v1_completion_plan](../../knowledge/wiki/engineering/data_pipeline_v1_completion_plan.md)):

| Label | What it is |
|---|---|
| **Baseline Release** | The published baseline rollup the public site uses as its reference point. |
| **Current Signal** | The latest available monthly signal stitched in as an appendix; may use self-collected evidence ahead of public publication. |
| **Pending Publication** | Candidate next release prepared locally, not yet promoted. Promoted by running `publish:serving-release --execute`. |
| **Observed Release** | The release a user is actually seeing right now. Today: March 2026 with `third_party_recovered` provenance, plus a May 2026 self-collected appendix. |

> **Caveat on "Current Signal" cadence.** The May 2026 appendix is currently sourced from a single 24-hour GTFS-RT capture (`gtfs-rt-v1-20260517T103607Z-24h`), not a continuously rolling current month. The production Worker cron (`apps/web/wrangler.jsonc` `crons: ["* * * * *", "17 10 * * *"]`) is configured to write GTFS-RT to R2, but the local mirror under `data/raw/r2-mirror/` is pulled on demand and may be stale relative to what's in R2. Treat "Current Signal" as a recent operational sample, not a live feed, until a longer-rolling appendix replaces it.

Every major metric carries a **completeness label** (`complete`, `partial_realtime_only`, `partial_public_monthly_only`, `missing_speed`, `missing_realtime`, `insufficient_samples`, `source_lag_expected`) so the product can answer what is confident vs. directional vs. unavailable.

## Known underserving — what's in the corpus but not on the site

Two kinds of "underserving" to keep separate.

### Product-shape gaps (tracked)

[`website_data_support_audit.md`](../../knowledge/wiki/engineering/website_data_support_audit.md) is the formal audit, kept current with code inspection. Today's open items: most briefs are generated rather than editorially reviewed (#5), findings are detector candidates rather than approved publication claims (#6), the write-side agent API is design-only (#7), and authoring infra around briefs is still a templated pipe over real metrics (#9). [`synthetic_data_inventory.md`](../../knowledge/wiki/engineering/synthetic_data_inventory.md) tracks per-component mock-vs-real status on the frontend.

### Information-richness gaps (not formally measured)

The pipeline collapses many axes the raw corpus carries. The serving projection then collapses further. Confirmed by inspecting `packages/domain/src/studio-schemas.ts` against the stage walk in § 2 above:

| Axis | In raw | In local pipeline | On the site |
|---|---|---|---|
| Speed: hour of day | Every hour 0–23, per timepoint-pair | Bucketed into 5 dayparts in `brief-metrics.ts` | Not exposed at all (used only for slow-window flagging) |
| Speed: day of week | Mon–Sun, per timepoint-pair | Carried through hotspot rollup | Not exposed at all |
| Speed: direction | Both directions, per timepoint-pair | Preserved at hotspot grain | Exposed in ladder/hotspot views; not in summary scorecards |
| Speed: severity | Continuous mph | Binary against `slowSpeedThresholdMph = 8` | Binary "slow" flag only |
| Observed reliability | Distribution of headway samples | Reduced to median + p90 + excess-wait estimator | **6 scalar fields** in `StudioObservedReliabilitySchema` — no distribution shape |
| Ridership | 115M rows at stop × hour × date grain | Route × month sums (via `route-trends.ts` SoQL collapse) | Route × month sums |
| Trend | Per-route 24×7 grid possible from raw | Monthly aggregates | `spark: z.array<number>` — monthly only |
| Context (collisions, permits, 311) | Per-event detail within buffer | Used as detector signals, attached to evidence packets | Rarely user-facing; mostly internal to detector reasoning |
| Corridor membership | Per-route LION-linked | `corridor_route_member` keeps attribution | Surfaced where corridors render, not in route summaries |

This is **not** a list of bugs — most of these collapses are deliberate (the publisher already collapses speed to month × DoW × hour; we collapse further because the UI doesn't ask for it yet). The point is that the *opportunity* to surface more is real and not currently quantified by any audit doc.

**Suggested follow-ups, ranked by ROI:**

1. **Cheap, high-impact:** surface the dayparts the pipeline already computes. The 5-bucket grid (AM peak / Midday / PM peak / Evening / Overnight) per route-month exists in local artifacts; exposing it through the route-detail schema and rendering a heatmap is a small typed-contract change and a meaningful product step for an analyst audience.
2. **Medium effort:** add a complementary `knowledge/wiki/engineering/information_richness_audit.md` that does for grain what the website data support audit does for shape. Per axis, document native grain → ingest grain → serving grain → UI grain, with a one-line rationale for each collapse. Makes the next product call evidence-based.
3. **Strategic:** pick one richness expansion to ship as a portfolio differentiator — per-DoW speed grid, observed-headway histogram, or per-stop ridership heatmap. Reads as data-quality literacy to an analytics interviewer (relevant to the MTA application goal).

## Where to read more

- **Per-dataset detail** — `knowledge/wiki/data/*` (one page per major source).
- **Source registry** — `knowledge/wiki/data/source_registry.md` and `knowledge/raw/source_manifest.yaml`.
- **Derived-product registry** — `tools/pipeline-v2/src/registry/data-products.ts` and
  `audit data-product-completeness`.
- **Local analytical layer rules** — `knowledge/wiki/engineering/data_model.md` § "Local analytical layer".
- **D1/R2 split** — `knowledge/wiki/engineering/serving_storage_split_plan.md`.
- **ETL flow** — `knowledge/wiki/engineering/etl_plan.md`.
- **Why D1 vs Postgres** — `docs/decisions/0002-postgres-drizzle-and-d1-serving-projections.md`.
- **Why spatialite for geo joins** — `docs/decisions/0007-spatialite-for-local-geo-joins.md`.
- **Tier 2 (policy/board docs)** — `knowledge/wiki/engineering/tier_2_document_corpus_pipeline.md`.

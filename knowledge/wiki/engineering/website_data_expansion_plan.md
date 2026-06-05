---
title: Website Data Expansion Plan
type: engineering
status: planning
last_updated: 2026-06-04
owner: codex
source_count: 0
tags: [website, data-expansion, studio-api, serving, tier2, corpus]
---

# Website Data Expansion Plan

## Purpose

The public Studio now has enough local corpus depth that the next website step should not be
"extract more data" by default. It should be **Serving Snapshot 2.0**: publish a richer, audited,
route-first serving snapshot from the data products that already exist.

This page turns that direction into an implementation plan.

## Planning assumptions

- Treat Tier 2 as done for planning purposes: reviewed/promoted document-derived intervention,
  timeline, source-stated date, and evidence rows are available to projection builders.
- Treat the local analytical corpus as broad and extracted: the first expansion pass should
  prioritize projection, API, and UI work over raw-source ingestion.
- Keep the MVP TypeScript-only and Cloudflare-shaped: local Bun pipeline, D1 compact serving
  indexes, R2 immutable artifacts, Worker REST resources.
- Keep public pages on `/api/v1/studio/*` resources. Do not expose R2 keys or local artifact paths.
- Keep claim posture explicit: observed, reviewed, proxy/provisional, unavailable, or
  research-only. More data must not mean stronger claims.

## Product thesis

The website should move from "route cards plus generated briefs" to a **data-rich route evidence
studio**:

1. A user can open any public route and see what evidence exists.
2. Missing data is visible as a state, not silence.
3. Route maps, hourly profiles, reliability distributions, context strips, findings, timelines,
   briefs, and source evidence all connect through stable refs.
4. Tier 2 document evidence enriches route timelines and evidence cards, but does not automatically
   become causal proof.

## Plain alignment

The route universe is the product baseline:

- The website should show every public MTA bus route we have route-level data for, not a curated
  sample, fixed demo list, or hand-picked route set.
- A route page should exist when the corpus has route-level data for that route. Missing child
  surfaces, such as findings, timelines, headway histograms, or lane links, should render as
  section-level unavailable states instead of hiding the whole route.
- Bus lanes are a supporting dataset. They should enrich route pages and maps, but they must not
  define which bus routes are visible.
- The first expansion milestone should make route index, search, route detail URLs, and map/data
  refs work for the full served route universe.

## Expansion lanes

### Lane 0: Serving snapshot manifest

Create a release-level manifest that the Worker and UI can use to describe what the website can
honestly show.

Target resource:

```text
GET /api/v1/studio/snapshot
```

Minimum fields:

- `releaseId`, `baselineMonth`, `currentSignalMonth`, `generatedAt`.
- public route count, route-detail count, route-ladder count, map-artifact count.
- route universe list: route id, label, borough/family, available surface flags, public URL, and
  route-detail/map artifact refs where available.
- bus-lane corpus count: source rows, mappable lane features, route-linked lane features, and
  unmatched/unlinked lane features.
- brief count by status: reviewed/published/generated/draft-overlay.
- finding count by provenance: reviewed/promoted/review-candidate/generated.
- Tier 2 timeline route coverage and evidence-card coverage.
- observed reliability coverage and current-signal coverage.
- route context coverage: weather, equity, traffic speed, traffic volume, permits/311/collisions.
- caveats from data-product completeness, studio coverage, and source freshness audits.

Why first: every richer page needs one shared truth source for coverage labels, release notes, and
empty states.

### Lane 1: Route detail becomes the main data surface

Use already-generated route artifacts to make route pages visually and analytically richer.

Priority surfaces:

| Surface | Existing backing | Serving shape |
|---|---|---|
| Real route map | `data/artifacts/map/{month}/manifest.json`, route-segment GeoJSON | R2 map refs plus `/api/v1/map/manifest` or Studio map refs |
| Hour/daypart profile | `StudioSegment.hours`, route-slice speed/ridership/schedule rows | route-level 24-hour vector and later 7x5 daypart grid |
| Direction split | route-segment speed/delay by direction | route summary split by direction |
| Headway distribution | observed headway samples / EWT artifacts | bucketed R2 route-month histogram |
| Context strip | finding context appendix and route-month signal features | compact D1/R2 route-context projection |
| Corridor peers | corridor membership and peer route metadata | route detail companion block |

Initial UI placement:

- Route index/search: generated from the snapshot route universe, not from a fixed sample list.
- Route overview: real map, route-hour profile, context strip.
- Route ladder: keep segment inspection but add links to hour breakdown and evidence refs.
- Riders tab: keep route/hour boardings; keep stop boardings as unavailable until a real source
  exists.
- Data notes tab: read from snapshot/quality payloads instead of static explanatory copy.
- Empty and not-found states: remove internal implementation wording such as "hard cutover",
  "converged route map", "fixed route set", or "defined routes"; tell users plainly that the route
  or page was not found and offer search/route-list recovery.

### Lane 2: All bus lanes as a first-class corpus surface

The website should support **all bus lanes we have**, not only a fixed list of route-linked or
curated lanes. Route pages can show the subset that intersects a route, but the data product should
start from the full NYC DOT bus-lane corpus.

Current backing:

- `local_bus_lane` / `local_bus_lane_coordinate` store the ingested lane rows and line coordinates.
- `data/artifacts/map/bus-lanes/local-streets.min.geojson` stores the mappable citywide layer. The
  current local artifact has 3,048 mappable bus-lane features.
- route-slice `bus-lane-overlay.json` artifacts and route/segment Studio fields should be treated
  as route-linked projections of that larger corpus, not as the universe.

Target resources:

```text
GET /api/v1/studio/data/bus-lanes?borough=&facility=&type=&route=&q=
GET /api/v1/studio/data/bus-lanes/:segmentId
GET /api/v1/studio/routes/:routeId/bus-lanes
```

Required fields:

- DOT `segmentId`, street, borough, facility, direction, traffic direction;
- lane type, subtype, width, operating hours, operating days, source `openDate` text;
- normalized geometry or R2 GeoJSON feature ref;
- source row refs and source snapshot metadata;
- route-link summaries when a lane intersects route shapes, including method/tolerance caveats;
- publication posture: `source_inventory`, `route_linked`, `needs_date_review`,
  `geometry_unavailable`, or `research_only`.

Implementation rules:

- The citywide lane inventory is the source surface; route-linked lane coverage is a derived view.
- Snapshot and audit counts must compare source rows, mappable features, route-linked features, and
  unlinked features so a route projection cannot silently become the bus-lane universe.
- Reserve `matched` for internal pipeline joins only. Public copy and docs should use clearer terms:
  source inventory lane, mappable lane feature, route-linked lane, route-shape overlap, or lane-date
  source gap.
- Public copy should say "NYC DOT bus-lane geometry" or "route-shape overlap" rather than
  "all bus lanes on this route" unless the route-link audit supports that wording.
- Bus-lane `openDate` values can be shown as source text, but before/after evaluation still needs
  parsed dates and method gates.

Initial UI placement:

- Map layer toggle: show all bus lanes, then highlight the route-linked subset when a route is
  selected.
- Data browser: searchable/filterable bus-lane inventory with borough/facility/type filters.
- Route detail: bus-lane card links to the route-linked lane list and the full citywide layer.
- Methods/Data: display source row count, mappable feature count, and route-link method caveats.

### Lane 3: Tier 2 route timelines

Assuming Tier 2 is complete, the most important new public data product is a route/corridor
intervention timeline.

Target resources:

```text
GET /api/v1/studio/routes/:routeId/timeline
GET /api/v1/studio/timelines?route=&family=&status=&from=&to=
```

Allowed public inputs:

- reviewed/promoted Tier 2 route timeline records;
- source-stated operational/planned date assertions with route links;
- proof-harness status when available;
- existing ACE/ABLE and DOT bus-lane intervention rows;
- route-review decisions when they promote a row to public timeline context.

Required fields:

- stable `timelineEventId` and optional `interventionId`;
- route ids, corridor text, treatment/intervention family;
- source-stated status, date text, normalized date/month/range, precision;
- date validation state and confidence;
- route resolution tier and route-resolution caveats;
- source id/title/url/date/page/block/line refs;
- public claim posture: `timeline_fact`, `supporting_context`, `planned_future`,
  `needs_review`, or `research_only`;
- causal-gate status. Default is non-causal.

Do not publish:

- raw discovery candidates;
- ambiguous route links as route facts;
- causal/effect language from document claims without applied-research gates;
- planned dates as implemented dates.

### Lane 4: Evidence catalog and source reader

The corpus should become browseable through product resources, not object paths.

Target resources:

```text
GET /api/v1/studio/data/evidence?route=&kind=&source=&q=
GET /api/v1/studio/data/evidence/:evidenceId
GET /api/v1/studio/data/sources?route=&group=&q=
```

Public evidence kinds:

- route metric evidence;
- reviewed finding evidence;
- Tier 2 timeline evidence;
- source-stated metric/claim evidence with authority labels;
- caveat/counter-evidence;
- method/source freshness notes.

The evidence catalog should power:

- brief evidence pages;
- finding detail reasoning trails;
- route timeline citations;
- route data notes;
- composer attach/send-to-brief workflows.

### Lane 5: Findings and coverage expansion

The site should expose all reviewed/promoted finding value, not just a small visible slice.

Target improvements:

- publish all approved/promoted findings for the release;
- add filters by detector family, severity, confidence, borough, treatment state, source gap;
- show detector/evidence provenance in detail pages;
- show route no-finding states from detector coverage audits;
- add "what was checked" counts by detector so quiet routes do not look ignored.

This lane should stay downstream of review/promotion artifacts. Detector review candidates can be
shown only with explicit review-candidate labels.

### Lane 6: Compare and cohort context

After route pages are richer, compare pages can graduate from two-route metric diffs to cohort-aware
comparisons.

Target additions:

- peer-universe label and percentile context;
- similar-route cohort cards;
- direction/daypart comparison;
- observed reliability distribution comparison;
- treatment/timeline differences;
- detector/finding overlap.

Keep peer comparisons descriptive unless a causal method gate explicitly supports stronger wording.

## New-ingestion backlog

These are useful, but not prerequisites for the first expansion pass:

| Need | Why not first |
|---|---|
| Stop-level local/SBS boardings | Current public ridership is route/hour, not stop/APC grain. Requires FOIL/APC or future public OD release. |
| Current authoritative TSP feed | Current TSP status is a dated source snapshot. Need a current route/intersection source before stronger claims. |
| Regulatory bus-lane mileage | Current lane overlap is route-shape/DOT-geometry proximity, not audited regulatory mileage. Needs domain review. |
| Full causal event-study artifacts | Tier 2 timelines can provide anchors, but applied-research panels/effect contrasts are still separate gates. |
| PMTiles/full-system map tiles | Per-route GeoJSON can ship first. Escalate to PMTiles when route/borough payloads become too heavy. |

## Serving contract rules

- D1 indexes compact queryable rows: route cards, evidence refs, timeline indexes, finding/brief
  metadata, snapshot counts, source cards.
- R2 stores immutable nested artifacts: maps, route detail documents, evidence bundles, headway
  histograms, published brief bodies, timeline detail bundles.
- Worker handlers validate every public response with `packages/domain` schemas.
- Missing data is a section-level unavailable state with `quality`, not a 404 for the whole route.
- A route with route-level corpus data should be routable even when some rich surfaces are missing.
- Fixed demo/sample route lists are allowed only as local fallback fixtures, not as the production
  route universe.
- Public request handlers must not import `packages/analytics`, `packages/sources`,
  `packages/applied-research`, `tools/*`, or `knowledge/*`.

## First implementation slice

Ship the smallest coherent data expansion that users can feel:

1. Define `StudioSnapshotResponseSchema` in `packages/domain`.
2. Generate the full route universe projection from existing route-level data, including per-route
   availability flags and public route refs.
3. Generate `studio/v1/snapshot.json` from existing release, data-product completeness, map
   manifest, bus-lane inventory, finding, brief, context, and Tier 2 coverage artifacts.
4. Serve `GET /api/v1/studio/snapshot` through the Worker.
5. Drive route index/search and route detail routing from the snapshot route universe instead of a
   fixed route list.
6. Add a route detail map panel using existing map artifact refs, with an all-bus-lanes layer and
   route-linked lane highlighting.
7. Add `GET /api/v1/studio/data/bus-lanes` as a compact D1/R2-backed inventory endpoint, or emit
   the matching R2 projection first if D1 indexing is not ready.
8. Add a route context strip from the context appendix: weather, equity, traffic speed/volume,
   and route-touch counts where available.
9. Update `/docs` and Methods/Data pages to consume snapshot coverage instead of static copy.

Verification:

```sh
bun run check:knowledge
bun run check:web-architecture
bun run test:worker
bun --filter @bp/web build
```

For projection work, also run the relevant Studio coverage and data-product completeness audits
before publishing.

## Follow-up implementation slices

1. **Route-hour profile:** aggregate route-level 24-hour speed/delay/ridership profiles and render
   them on route overview.
2. **Headway histogram:** emit compact route-month histogram artifacts from observed headway
   samples and show them beside observed reliability scalars.
3. **Bus-lane inventory detail:** add per-lane detail pages/panels with source metadata, route links,
   and open-date parse/review status.
4. **Tier 2 timeline:** add route timeline schemas/projection builder/endpoint/page panel.
5. **Evidence catalog:** build D1 evidence index plus R2 detail bundles and route/brief/finding
   cross-links.
6. **Finding feed expansion:** publish all promoted findings with detector-family filters and
   route coverage/no-finding states.
7. **Cohort compare:** add peer/cohort context and daypart/direction comparisons.

## Acceptance gates

A data expansion slice is done only when:

- every displayed field maps to observed/reviewed/proxy/unavailable/research-only posture;
- public UI copy avoids internal projection, hard-cutover, corpus, storage, or route-map
  implementation language unless it is in a Methods/Data documentation page;
- bus-lane surfaces prove whether they are showing the full source inventory, the mappable subset,
  or only a route-linked subset;
- public bus-lane UI avoids the label "matched" except in Methods/API field documentation that
  explicitly defines the legacy/internal field;
- source refs or artifact refs are stable and private object keys are not public contracts;
- `audit:studio-coverage` or an equivalent release audit verifies coverage and dangling refs;
- `check:web-architecture` confirms public runtime boundaries;
- docs/OpenAPI include the new resources;
- the wiki pages below are updated when their tracked surface changes:
  - [[wiki/engineering/website_data_support_audit|Website Data Support Audit]]
  - [[wiki/engineering/information_richness_audit|Information Richness Audit]]
  - [[wiki/engineering/synthetic_data_inventory|Synthetic Data Inventory]]
  - [[wiki/engineering/serving_storage_split_plan|Serving Storage Split Plan]]
  - [[wiki/engineering/web_api_endpoint_architecture|Web API Endpoint Architecture]]

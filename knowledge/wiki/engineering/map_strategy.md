---
title: Map Strategy
type: engineering
status: active
last_updated: 2026-04-27
owner: codex
tags: [maps, maplibre, pmtiles, geospatial, artifacts, nyc-scope]
---

# Map Strategy

## Recommendation

Use MapLibre GL JS in `apps/web`, render precomputed GeoJSON artifacts first, support PMTiles as the future R2/static vector-tile path, and keep all route-segment construction in the local Bun pipeline.

Serving rule:

```text
D1/Postgres = metadata, artifact indexes, scorecard rows
R2/static assets = GeoJSON, PMTiles, briefs, source snapshots
Browser = rendering and interaction only
Local pipeline = geospatial joins, line slicing, clipping, simplification, scoring
```

## Scope

P0 map scope is NYC bus-priority evidence, not rider trip planning.

- Use current MTA route and stop datasets for public map geometry.
- Include Local, Limited, and SBS route types first.
- Exclude Express and School routes unless explicitly enabled later.
- Clip or tag display artifacts by NYC borough boundaries, water excluded.
- Preserve raw source geometry untouched under `data/raw`; clipping happens only in generated map artifacts.
- Constrain MapLibre to a five-borough bounding box with a small buffer:

```ts
export const NYC_MAP_BOUNDS = [
  [-74.35, 40.45],
  [-73.65, 40.98],
] as const;
```

## Core Map Sources

| Purpose | Source | ID | MVP priority |
|---|---|---:|---|
| Current route shapes | MTA Current Bus Routes | `h2wf-afav` | P0 |
| Current stop points | MTA Current Bus Stops | `ai5j-txmn` | P0 |
| Speed metrics | MTA Bus Route Segment Speeds: Beginning 2025 | `kufs-yh3x` | P0 |
| NYC clipping/scope | NYC Borough Boundaries | `gthc-hcne` | P0 |
| Bus lane geometry | NYC DOT Bus Lanes - Local Streets | `ycrg-ses3` | P1 |
| ACE routes | MTA Bus Automated Camera Enforced Routes | `ki2b-sg5y` | P1 |
| ACE violations | MTA Bus Automated Camera Enforcement Violations | `kh8p-hcbm` | P2 |

Do not use Socrata `Map` visualization pages as primary data sources when canonical tabular/geospatial datasets exist.

## Derived Artifacts

The pipeline should generate map artifacts under a stable, content-addressable shape such as:

```text
data/artifacts/map/
  sources/
    source-snapshot.json
  boroughs/
    nyc-boroughs.min.geojson
  routes/
    current-local-limited-sbs.min.geojson
  stops/
    current-timepoints.min.geojson
  route-segments/
    M1/2026-03/hour-08.geojson
    M1/2026-03/all-day.geojson
  bus-lanes/
    local-streets.min.geojson
```

Artifact rules:

- Feature IDs must be stable.
- Properties must be minimal.
- Coordinates should use 5-6 decimal places.
- Lines should be simplified for display, not for measurement.
- Every artifact must have source snapshot metadata, schema hash, row count, and created-at timestamp.
- Product databases store artifact keys and hashes, not full route geometry for P0.
- Route-segment artifacts validate through `MapRouteSegmentFeatureCollectionSchema` in `packages/domain`.

## Segment Geometry Construction

Pipeline algorithm:

1. Fetch route-shape rows for route/direction from `h2wf-afav`.
2. Fetch current timepoint stops from `ai5j-txmn`.
3. Fetch speed rows from `kufs-yh3x` for route/month/day/hour.
4. Match speed-table start/end timepoints to stop points.
5. Project start/end stop points to the route shape.
6. Slice the route shape between projected positions.
7. Attach speed/hotspot properties to the sliced LineString.
8. Validate the artifact through `MapRouteSegmentFeatureCollectionSchema`.

Do not render straight lines between stops except as an explicit fallback marked as approximate.

## Performance Rules

- Lazy-load MapLibre only on pages/components that display a map.
- Fetch generated GeoJSON from URL/R2/static assets instead of embedding large artifacts in the app bundle.
- Load one route or one route set at a time for P0.
- Strip unused properties from GeoJSON.
- Use layer visibility and zoom rules so dense layers are not drawn too early.
- Keep stop points off by default or show only timepoints.
- Put large artifacts behind long cache headers with content hashes in filenames.

Escalate to vector tiles or PMTiles when route/borough GeoJSON becomes too large for fast mobile loading, or when the app needs a full-system overview with many simultaneous lines and points.

## Interactivity Model

P0 interactions:

- Route search/select.
- Map fit to selected route bounds.
- Segment click opens an evidence panel.
- Segment hover highlights the line on desktop.
- Metric toggle for speed versus hotspot score.
- Month/hour selector where artifacts exist.
- Source/caveat drawer for dataset freshness and metric definitions.

Do not implement drag-to-select, custom drawing tools, realtime bus animations, or rider trip planning in the MVP.

## Package Responsibilities

- `apps/web` renders MapLibre layers and owns interaction state.
- `packages/domain` owns shared GeoJSON/map artifact contracts.
- `tools/pipeline` owns geospatial construction, validation, and artifact writes.
- `packages/sources` owns MTA, Socrata, NYC DOT, and Census source clients/adapters.
- `packages/db` owns artifact indexes and serving-table repositories.

## Sources

- MTA segment-speed mapping article: https://www.mta.info/article/mapping-movement-exploring-nyc-bus-route-shapes-through-segment-level-speed-data
- MTA Current Bus Routes (`h2wf-afav`): https://data.ny.gov/Transportation/MTA-Current-Bus-Routes/h2wf-afav
- MTA Current Bus Stops (`ai5j-txmn`): https://data.ny.gov/Transportation/MTA-Current-Bus-Stops/ai5j-txmn
- MTA Bus Route Segment Speeds (`kufs-yh3x`): https://data.ny.gov/Transportation/MTA-Bus-Route-Segment-Speeds-Beginning-2025/kufs-yh3x
- NYC Borough Boundaries (`gthc-hcne`): https://data.cityofnewyork.us/City-Government/Borough-Boundaries/gthc-hcne
- MapLibre GL JS: https://maplibre.org/maplibre-gl-js/docs/
- PMTiles for MapLibre: https://docs.protomaps.com/pmtiles/maplibre

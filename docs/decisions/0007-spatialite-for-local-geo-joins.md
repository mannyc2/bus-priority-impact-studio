# 0007 - Spatialite for local route ⇄ LION geometry joins

Date: 2026-05-19

## Status

Accepted. Scope: local pipeline only.

## Context

The MVP corpus now includes:

- 350 MTA bus routes with multi-line GTFS shape geometry, loaded as a JSON
  snapshot under `data/raw/.../route-shapes-*.json`.
- ~122,000 NYC LION centerline segments with stable `physical_id`s and
  `wkt_geom` (WKT or JSON MultiLineString), persisted in
  `local_lion_segment`.
- Three address-keyed context sources — NYPD collisions, 311 service
  requests, parking violations — that need to be joined to a stable
  street-segment id before any per-route findings can be computed.

There is currently no geometry library on the read path or in the local
pipeline. The CLAUDE.md project rules state that "heavy data work runs
locally through tools/pipeline" and forbid hosted Postgres / PostGIS /
Python / VPS additions without a documented requirement or ADR. Spatialite
is the SQLite-equivalent geospatial dependency and falls under the spirit
of that rule, so this ADR records the decision before adoption.

## Decision

Adopt spatialite as a loadable SQLite extension, loaded only by the
**local pipeline** (`tools/pipeline`). The Cloudflare Worker continues to
read from D1, which never sees spatialite. Geometry computation produces
a flat `local_route_lion_link` lookup table that the serving layer
consumes as ordinary rows.

```
local geometry inputs ──▶ spatialite (offline)
                          │
                          ▼
              local_route_lion_link        (flat lookup, no geom)
                          │
                          ▼
                 Worker / D1 / R2          (geom-free)
```

Concretely:

- Add `db.loadExtension("mod_spatialite")` in
  `tools/pipeline/src/lib/local-db.ts` behind an opt-in flag, so non-geo
  pipeline jobs keep the same fast open path.
- Materialize LION and route-shape geometries into
  `local_lion_segment_geom` and `local_route_shape_geom`, each with a
  spatialite R-tree spatial index.
- Compute `local_route_lion_link(route_id, physical_id, overlap_meters,
  match_kind)` via `ST_Buffer` + `ST_Intersects` + `ST_Length` per route.
- Use the same spatialite session to snap context-source lat/lon points
  to the nearest LION segment during geocoding.

## Alternatives considered

- **Turf.js (pure-TS):** No native dependency; works inside Bun easily.
  Rejected as the primary engine because 350 × 122K candidate pairs
  brute-force per route is slow; an R-tree prefilter via spatialite is an
  order of magnitude faster and avoids hand-rolling spatial indexes in
  JavaScript. Turf may still be used for one-off transformations where
  it is more ergonomic.
- **PostGIS / Hyperdrive:** Excellent fit operationally but breaks the
  MVP infrastructure rule (no hosted Postgres without explicit need).
  Out of scope for this milestone.
- **Precomputed JSON checked into repo:** Simplest possible answer, but
  every refresh (new GTFS release, LION update, new buffer width)
  requires regenerating and checking in a large binary blob. Worse
  ergonomics than a SQLite table that the pipeline owns.

## Consequences

### Positive

- Real R-tree spatial index keeps the per-route join under a few minutes
  total for all 350 routes.
- No additional services to operate; everything stays inside the local
  SQLite file and the existing pipeline package.
- D1 and the Worker are unaffected. Spatialite never ships to the edge.
- The same machinery supports later use cases (nearest LION snap during
  geocoding, corridor visualizations, polyline simplification).

### Negative

- Local dev requires installing `libsqlite3-mod-spatialite` (apt / brew /
  nix one-liner). Recorded in `knowledge/wiki/engineering/package_structure.md`.
- CI must install the same package before running pipeline tests that
  touch the spatial layer.
- bun-sqlite must be able to call `loadExtension`. This is supported but
  exercised here for the first time; failure mode is a clear error at
  open time, gated by `check:spatialite` smoke command.
- `SPATIALITE_PATH` is a code-loading switch, not just a path hint: any
  shared object at that path will be dlopened by `sqlite.loadExtension`.
  This is fine for a local-only pipeline (anyone who can set the env var
  can already run arbitrary code), but it must not be exposed via any
  `.env.example`, web form, or CI-injected secret, and the variable should
  never be plumbed into the deployed Worker.

## Open questions

- Buffer width for the corridor join — start at 25m and tune. CLI flag
  `--buffer-m` makes this adjustable.
- Whether to widen `local_route_lion_link` later with directional /
  one-way handling using LION `traffic_dir`. Not in v1 scope.

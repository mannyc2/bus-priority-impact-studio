# packages/domain

Pure domain layer.

## Responsibilities

- Branded IDs and shared types such as `RouteId`, `DirectionId`, `SegmentId`, `ServiceMonth`.
- Metric names and route-score input/output types.
- Pure scoring/math helpers that do not touch network, filesystem, D1, R2, or Worker bindings.

## Rules

- No runtime dependency on other local packages.
- No Cloudflare types.
- No source-fetching code.
- No database queries.

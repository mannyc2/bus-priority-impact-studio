# 0021 - Native transit kit in the Effect zone

Date: 2026-07-05

## Status

Accepted.

## Context

Plan 029 adopted `nyc-transit-kit` in this repo through the compatibility package so the bus repo
could consume released generic SODA3 and GTFS Realtime helpers before the local Effect migration was
complete. Plan 045 then split into smaller orders: the immediate bus-repo prerequisite is only the
`0.2.0` package bump, while later toolkit work owns CSV streaming and resumable downloads.

At the same time, ADR 0019 established `tools/pipeline-v2` as the Effect runtime zone. That zone
should not keep Promise-shaped compatibility wrappers around toolkit code once the toolkit exposes
native Effect clients and layers. The remaining exception is the Worker-facing Studio API package:
Plan 026 measured a Worker regression for a fuller Effect migration, so `packages/studio-api` stays
on the compatibility package until that runtime cost is resolved separately.

## Decision

Use native `@nyc-transit-kit/*` packages in Effect-zone code.

For the current SODA3 surface this means:

- `tools/pipeline-v2/src` and `packages/sources/src` import from native package subpaths such as
  `@nyc-transit-kit/soda3/client` and `@nyc-transit-kit/soda3/errors`;
- pipeline SODA3 queries and exports run through native toolkit Effects and layers;
- pipeline-owned retry, timeout, app-token, and error-metadata policy remains in the pipeline layer,
  with toolkit retry disabled where the pipeline wraps the native HTTP client;
- `@nyc-transit-kit/compat` is forbidden in `tools/pipeline-v2/src`,
  `packages/sources/src`, and those packages' manifests.

Promise-edge code may use compatibility helpers when the runtime boundary is not Effect-native.
Today that exception is limited to `packages/studio-api`, where the source-refresh Worker path still
imports `querySoda3Rows` from `@nyc-transit-kit/compat/soda3` and
`isSoda3ClientError` from `@nyc-transit-kit/compat/errors`.

## Consequences

- The boundary harness enforces that Effect-zone source and manifests do not import or depend on
  `@nyc-transit-kit/compat`.
- `packages/studio-api` is the sanctioned compatibility edge until the Worker Effect regression is
  remeasured and fixed.
- Local CSV snapshot and resumable download helpers can remain bus-repo owned until the follow-up
  toolkit release from Plan 045 Orders 2-4. This ADR does not require touching those paths early.
- Future toolkit adoption in the pipeline should prefer native Effects/layers first, with thin
  Promise adapters only at explicit non-Effect boundaries.

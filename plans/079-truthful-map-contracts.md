# Plan 079: Publish truthful network-map data, layer readiness, and freshness

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` (Generation 9 table).
>
> **Drift check (run first)**:
> `git diff --stat cd878f7..HEAD -- packages/domain/src/maps packages/domain/src/studio/shared.ts packages/domain/src/studio/release.ts packages/domain/src/studio/projections.ts packages/domain/test packages/analytics/src/evaluation/map-artifacts.ts packages/analytics/test/evaluation-products.test.ts tools/pipeline-v2/src/commands/map tools/pipeline-v2/src/commands/studio/release.ts tools/pipeline-v2/src/commands/studio/route-speed-spines.ts tools/pipeline-v2/src/commands/audit/map-artifacts.ts tools/pipeline-v2/src/commands/verify/d1.ts tools/pipeline-v2/src/commands/publish tools/pipeline-v2/src/checks/check-publish-completeness.ts tools/pipeline-v2/src/checks/check-web-performance.ts tools/pipeline-v2/test scripts/publish-serving-release.sh packages/studio-api/src/public-api.ts packages/studio-api/test apps/web/test/worker/public-routes.worker.test.ts apps/web/src/studio/api-client.ts apps/web/src/routes/map.tsx apps/web/src/studio/pages/network-map.tsx apps/web/src/components/route/NetworkMapLibre.tsx apps/web/src/components/route/NetworkMapLibre.map.tsx apps/web/test/shared tests/harness/month-doctrine-allowlist.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

> **Amendment (2026-07-12 — de-month direction, binding).** The operator
> retired month-keyed release identity repo-wide (ADR-0022 via plan 084;
> serving sweep in 085, pipeline identity in 086; harness gate in 088).
> Implement this plan with the new vocabulary — the substance (same-window
> joins, verified manifests, currency records, readiness gating) is
> unchanged:
>
> - Wherever this plan's contracts use a month as RELEASE IDENTITY
>   (`baselineMonth`/`month: IsoMonth` on the network manifest, context, and
>   `MapRouteFactsResponse`), define instead `publishedAt` (ISO datetime) and
>   `coverage: { start: IsoMonth | null, end: IsoMonth }`. For a
>   single-month data window, `coverage.start === coverage.end`. The month
>   survives as the data-window label (`coverage.end`), never as the release
>   name.
> - Every "must equal the baseline/release month" join or gate becomes "must
>   have identical `coverage`" (same strictness for monthly windows). The
>   `period_aligned` currency verdict compares a layer's `coverage.end` to
>   the release's `coverage.end`.
> - The client mismatch state is named `coverage_mismatch` (not
>   `baseline_mismatch`) and its message speaks coverage, e.g. "Map geometry
>   covers 2026-05, but route facts cover 2026-03."
> - Public resolver ownership is staged. This plan owns a minimal D1
>   `map_release_catalog`, its migration/query/registration SQL, and the map
>   endpoint's fail-closed latest-v2 resolver. It leaves the existing shared
>   `releaseStatusMonth` selector untouched for the four non-map callers.
>   Plan 085 removes those callers' `?month=` / `env.BASELINE_MONTH` fallback.
>   Existing v1 map artifacts are never backfilled into the new catalog.
> - CLI `--month` flags stay as data-window selectors;
>   `data/artifacts/map/<YYYY-MM>/` stays as a partition layout. This plan
>   removes defaults only from the map commands it owns. Plan 086 owns the
>   existing `studio release` default and the top-level static-release
>   identity.
> - The shared-file boundary is exact. In
>   `packages/domain/src/studio/release.ts`, this plan adds only the map-fact
>   metadata contract; its top-level `baselineMonth` remains Plan 086 debt.
>   In `tools/pipeline-v2/src/commands/studio/release.ts`, this plan owns
>   only the two `MapRouteDelayExposure` output-member matches currently near
>   lines 770/782. The route-brief input/window reads near 293/579/755 are
>   legal analysis grain and stay. Plan 086 owns the top-level release payload
>   tokens and hardcoded default.
> - `packages/domain/src/studio/projections.ts` is staged too. Its initial
>   `retired-identity-token` entry is `retire-079` for all six current
>   occurrences across three assignment sites. This plan removes only the two
>   map-facts projection occurrences, then atomically shrinks the entry to the
>   exact four routes/detail projection occurrences and reassigns it to
>   `retire-085`.
> - `tools/pipeline-v2/src/checks/check-publish-completeness.ts` has the same
>   staged split: its initial four `baselineMonth` occurrences are
>   `retire-079`. This plan removes the two map/route-fact comparison
>   occurrences, then shrinks and reassigns the exact two Studio routes
>   comparison occurrences to `retire-085`.
> - `packages/studio-api/src/public-api.ts` is also staged. This plan removes
>   the map handler's exact four retired-token matches: its env/month error,
>   map-manifest `baselineMonth`, and two legacy quality literals. The handler
>   moves to the v2 catalog resolver, while the shared `releaseStatusMonth`
>   function and its four non-map callers remain for Plan 085. Shrink the
>   initial 21-match `retired-identity-token` entry to the exact 17 non-map
>   remainder and reassign it from `retire-079` to `retire-085`. Preserve the
>   separate two-match `public-month-selector` / `retire-085` entry.
> - The map manifest producer and its direct publication consumer are atomic:
>   this plan replaces the two `analysisPeriod` checks in
>   `commands/publish/r2-artifacts.ts` with `publishedAt`/coverage checks and
>   owns that file's `analysis-period-identity` entry. Plan 086 must not defer
>   this consumer migration.
>
> Plans 085/086 grep-gate on the names `publishedAt`/`coverage`, and the
> month-doctrine harness gate (plan 088) bans the retired tokens with a
> shrink-only allowlist. Delete this plan's unambiguous entries as each
> contract lands; for only the staged `public-api.ts`, `projections.ts`, and
> `check-publish-completeness.ts` pairs, shrink the count and reassign the exact
> remainder to `retire-085`.
> Editing those initial `retire-079` pairs in
> `tests/harness/month-doctrine-allowlist.ts` is in scope and required; a stale
> or growing entry is a failure, not a reason to loosen the scanner. Do not
> improvise different field names.

## Binding completion audit and residual execution (2026-07-19)

This section supersedes the old drift STOP, current-state inventory, scope,
Steps 1-6, test plan, done criteria, and STOP conditions below wherever they
describe already-landed work. Those sections are retained as the design
record; **do not replay them**. Commits `28ac88bd`, `994aabd0`, `327c8e05`,
`dec02748`, `eed4266f`,
`84a46edc`, `a536354b`, `82b1c500`, `a0740d3e`, `89aa2e1c`, `7080fa13`,
`75145271`, and `337f2143` already delivered the strict map schemas,
null-preserving hourly evidence, borough context, canonical route facts,
content-addressed publication checks, full/demo readiness, manifest
verification, same-root release orchestration, and artifact budgets. The
checked 2026-03 fixture certifies 350 expected, geometry, route-segment, and
route-fact routes. First rerun the focused fixture suite; a regression is a
STOP, but the existence of that landed implementation is expected drift.

The only remaining Plan 079 work is the ADR-0022 v2 map-release identity
cutover below. It runs after Plans 084 and 088 and before Plans 085 and 086.
Do not parallelize production edits for those plans with this cutover.

### Residual Step A: define one release identity contract

1. Add and explicitly export `CoverageWindowSchema` / `CoverageWindow` from
   `packages/domain/src/studio/shared.ts`: `{ start: IsoMonth | null, end:
   IsoMonth }`. Plan 085 imports this exact schema rather than redefining it.
2. Add one shared `releaseIdFromPublishedAt(publishedAt)` helper beside that
   contract. It must accept only a canonical UTC ISO timestamp, preserve
   millisecond precision in a compact non-month identifier, and round-trip to
   the same instant. Reject non-canonical or lossy inputs. A repeated ID is
   idempotent only when all persisted catalog values match; a same-ID or
   same-manifest-key collision with different metadata fails.
3. Capture exactly one `publishedAt = new Date().toISOString()` in
   `runMapRelease`. Derive `releaseId` once and pass both values plus
   `coverage` through the Studio map-facts build, map artifact build,
   manifest verification, and catalog-registration builder. Nested commands
   must not call `new Date()` for release identity.
4. `coverage.end` is the required `--month` build partition.
   `coverage.start` is the earliest month present in the already-loaded
   route-fact/history evidence, or `null` when no honest lower bound exists.
   Month-keyed filesystem paths remain build partitions, not release IDs.

Focused tests must prove canonical/non-canonical timestamps, millisecond
preservation, identical retry, conflicting collision, one timestamp across
all outputs, and honest null/start coverage.

### Residual Step B: hard-cut map wire contracts to v2

Replace map release-identity `baselineMonth` and `analysisPeriod` members with
`releaseId`, `publishedAt`, and `coverage` on the network collection root,
map-route-facts response, route-facts manifest reference, analytics manifest,
and public manifest response. Keep each network feature's
`properties.month`: it is the feature's observed evidence grain, not release
identity. Bump every changed schema literal and annotation/registry ID from v1
to v2; do not make a v1 field optional and do not accept a dual shape. Segment
months and route-brief analysis periods likewise remain legal evidence grain.

In `tools/pipeline-v2/src/commands/studio/release.ts`, migrate only the two
map-fact output `analysisPeriod` members targeted by Plan 088. Preserve the
three route-brief input/window reads and `_release-types.ts`. In
`packages/domain/src/studio/projections.ts`, remove only the map-facts identity
pair, then shrink/reassign the exact four routes/detail remainder to
`retire-085`. Likewise, remove only the map comparison pair from
`check-publish-completeness.ts` and reassign its exact two Studio-route
remainder to `retire-085`.

Migrate `commands/publish/r2-artifacts.ts` in the same commit as the manifest
producer: require v2, exact `releaseId`/`publishedAt`/coverage agreement,
`coverage.end === options.month`, full/pass verification, declared artifact
hashes, and the existing route-universe gates. Its two retiring
`analysisPeriod` matches go to zero here; Plan 086 must not defer this
consumer.

In `commands/verify/d1.ts`, replace the redundant outward `isoMonth` and
`analysisPeriod` aliases with the same `releaseId`/`publishedAt`/coverage
triple supplied by `runMapRelease`; a standalone verifier captures one
canonical timestamp at its command boundary. Remove its Plan-079
`analysis-period-identity` entry. Plan 086 later migrates the underlying D1
export summary and may thread this existing identity into that producer, but
must not rename or weaken the verifier's landed v2 contract.

### Residual Step C: add the fail-closed D1 map-release catalog

Add `map_release_catalog` to `packages/db/src/d1/schema.ts` and migration
`0033`, including generated Drizzle snapshot/journal metadata. The table is
minimal and publication-oriented:

```text
release_id TEXT PRIMARY KEY
published_at TEXT NOT NULL
coverage_start TEXT NULL
coverage_end TEXT NOT NULL
manifest_key TEXT NOT NULL UNIQUE
manifest_sha256 TEXT NOT NULL
release_profile TEXT NOT NULL
verification_status TEXT NOT NULL
route_count INTEGER NOT NULL
```

Add `packages/db/src/d1/queries/map-release-catalog.ts`, explicit D1-barrel
exports, and fixture-backed DB tests. The latest query orders by canonical
`published_at DESC, release_id DESC` and defensively returns only
`release_profile = 'full'` and `verification_status = 'pass'`. Validate the
stored coverage/timestamp/hash/route count on decode. Leave the table empty
for all existing v1 artifacts; there is no compatibility backfill or
month-based fallback.

Add a pure registration-SQL builder under `packages/db/src/d1/seed/` and
export it explicitly. `runMapRelease` writes
`data/exports/d1/<coverage.end>/map-release-registration.sql` only after the
v2 manifest verifies, using the final manifest key and body SHA-256. The SQL
must be retry-safe: an identical row succeeds, while any field mismatch for
the same release ID or any manifest-key collision hard-fails. Test SQL
escaping, identical retry, both collision modes, and that demo/unverified v1
input cannot produce registration SQL.

### Residual Step D: publish, then make the release discoverable

Change `scripts/publish-serving-release.sh` and its focused ordering test to
enforce this exact sequence:

```text
local completeness verification
→ ordinary D1 schema/serving seed
→ all declared R2 uploads
→ final D1 map-release catalog registration
```

The final registration uses the generated SQL file and the same retry wrapper
as other D1 mutations. An R2 failure therefore creates no catalog row. A final
D1 registration failure leaves an undiscoverable upload and is safe to retry;
it must not delete or overwrite R2 data. Dry-run validates local inputs and
prints the same ordering without remote mutation.

In `packages/studio-api/src/public-api.ts`, the map endpoint queries only the
latest verified/full v2 catalog row, fetches exactly its `manifest_key`, checks
the body SHA-256, parses the v2 schema, and requires every stored identity
field to match. If no row exists or any check fails, return a clear 503/502
failure; never consult `?month=`, `BASELINE_MONTH`, a directory scan, or a v1
manifest. Leave the shared selector and four non-map handlers for Plan 085.

### Residual Step E: ratchet, verification, and operator boundary

Update only Plan 079's exact Plan-088 entries. At the audited baseline:

- `public-api.ts` has 21 retired-token matches; remove the four map matches,
  reassign the exact 17 non-map remainder to `retire-085`, and preserve its
  two `public-month-selector` matches for Plan 085;
- `studio/projections.ts` goes from six matches to four assigned to
  `retire-085`;
- `check-publish-completeness.ts` goes from four matches to two assigned to
  `retire-085`;
- `r2-artifacts.ts` goes from two `analysisPeriod` matches to zero; and
- only the two scanner-targeted map-fact output members in Studio release are
  removed; its three legal route-brief/window uses remain excluded.

Run focused domain, DB, analytics, pipeline, Studio API, Worker, and web tests,
then `bun run check:month-doctrine`, `bun run check:architecture`,
`bun run check:style`, and `bun run check:prepush`. Update Plan 079's README
row only when the v2 fixture cutover is green.

This plan generates and tests a v2 release locally. The first production
rebuild, R2 upload, and catalog registration is a separate operator-authorized
deployment gate; fixture completion does not authorize remote mutation.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: `plans/062-delete-pipeline-v1-doctrine.md`,
  `plans/068-verification-baseline.md`,
  `plans/078-canonical-map-segment-identity.md`,
  `plans/084-retire-month-anchors-doctrine.md`, and
  `plans/088-month-doctrine-gate.md`
- **Category**: bug
- **Planned at**: commit `cd878f7`, 2026-07-09 (working tree already dirty in
  `plans/` only)

## Why this matters

The citywide map currently publishes an invalid lane ratio, silently replaces
missing hourly observations with all-day speed, duplicates route metrics in an
unvalidated private shape, discards manifest freshness in the client, and
marks a base-layer-only manifest as complete/high-confidence. It also serves
mutable artifact keys with a one-year immutable cache. This plan makes the
network artifact a strict geometry/hourly-evidence contract, uses the canonical
Studio release projection as the single source for route-level metrics, preserves
missingness and layer readiness, and makes cache semantics match the key.

## Current state

- The network shape is duplicated rather than shared:
  `tools/pipeline-v2/src/commands/map/artifacts.ts:127-152` defines a
  pipeline-private `NetworkMapProperties`, while
  `apps/web/src/studio/api-client.ts:192-220` hand-copies it. There is no
  `NetworkMapFeatureCollectionSchema` under `packages/domain/src/maps/`.
- `fetchNetworkMapGeo` (`api-client.ts:238-246`) fetches the manifest, finds a
  path, then returns only the cast GeoJSON. It discards `baselineMonth`,
  `generatedAt`, `quality`, hashes, and layer availability.
- The map producer invents or duplicates several route facts at
  `artifacts.ts:885-900`:

  ```ts
  scheduledMph: rounded(route.summary.averageSpeedMph * 1.18, 2),
  currentMph: rounded(route.summary.averageSpeedMph, 2),
  trend6mPct: null,
  dailyRiders: Math.round(route.summary.totalRidership / 30),
  riderHoursLost: null,
  laneCoverage: laneCoverage(route.summary, route.segmentPayload.features.length),
  ```

- The lane formula divides incompatible units. `artifacts.ts:828-833` divides
  the count of matched NYC DOT lane features by the count of route segments.
  The source field is explicitly a feature count at
  `tools/pipeline-v2/src/lib/route-briefs/model.ts:592-603`; its caveat at
  lines 617-618 says it is not exact route-segment coverage.
- A correct route-shape overlap calculation already exists at
  `tools/pipeline-v2/src/commands/studio/_release-geometry.ts:776-785` and feeds
  canonical `StudioRoute.laneCoverage`.
- Current checked artifacts demonstrate the error:

  ```text
  network routes: 346
  network laneCoverage == 100: 273 (79%)
  distinct network lane values: 38
  M15 network: 20,493 riders/day, 100% lanes
  M15 Studio route: 19,832 riders/day, 82% route-shape overlap
  ```

  The Studio value uses `averageCalendarDayRiders` and actual month length at
  `_release-routes.ts:49-67,383-389`.
- `routeHourSpeeds` (`artifacts.ts:818-825`) emits 24 numbers and substitutes
  all-day speed for every absent hour. `NetworkMapLibre.tsx:31-38` falls back
  again, and `apps/web/test/shared/network-map.test.ts:61-65` locks that in.
- The map's period toggle remains visible for Riders and Lanes, even though
  those lenses do not change by period (`network-map.tsx:93-114,348-353`).
- The manifest is not a verified promotion contract.
  `packages/analytics/src/evaluation/map-artifacts.ts:26-38,103-124` permits
  only `status: "pass"` and always writes it; verification at lines 254-291
  does not require the citywide network artifact and makes expected-route
  coverage optional.
- The public API maps that generation marker to
  `completenessStatus: "complete"` and `confidence: "high"` at
  `packages/studio-api/src/public-api.ts:568-598`. A checked
  `data/artifacts/map/2026-05/manifest.json` says pass with zero route-segment
  artifacts and only four base artifacts.
- Every artifact response gets
  `Cache-Control: public, max-age=31536000, immutable`
  (`public-api.ts:620-625`), but keys such as
  `map/routes/current-local-limited-sbs.min.geojson` and
  `map/2026-03/network-simplified.geojson` can be corrected at the same URL.
  The map strategy requires content-hashed filenames for immutable caching
  (`knowledge/wiki/engineering/map_strategy.md:106-116`).
- The context artifact already keeps `properties.boroName`
  (`tools/pipeline-v2/src/commands/map/context.ts:173-203`), but the web type
  drops every property (`api-client.ts:176-183`) and both MapLibre adapters
  replace properties with `{}`.
- `StudioRoute.borough` is not served geography: `_release-routes.ts:36-42`
  derives it solely from the route-ID prefix. Cross-borough service therefore
  needs a separate offline `servedBoroughs` relation before `/map` offers a
  geographic borough filter.
- The map and route facts can resolve different months. The public map resolver
  uses the requested/environment baseline month, while the D1 route listing
  intentionally uses the latest serving month; `StudioRoutesResponse` does not
  expose that month. A cross-month join can therefore display facts from one
  month under another month's map caption without detection.
- The latest D1 catalog-card projection is not a canonical metric source for
  the map: `read-handlers.ts:571-578,620-647` recomputes lane coverage as
  matched features/stops, divides ridership by 30, and hardcodes
  `riderHoursLost: null`. The dedicated same-coverage map-facts projection planned
  below is built from the same canonical route objects as the static Studio
  projection. Do not silently use the convenient latest D1 listing for map
  colors/ranks.
- Current network payload baseline, measured read-only:
  4,610,607 raw bytes, about 395 KB gzip, 346 features, 52,907 coordinates.
  Keep it behind a URL and a generated-release budget; do not embed it in
  JavaScript.
- Current NYC DOT lane payload baseline: 1,649,117 raw bytes, 79,699 gzip
  bytes, and 3,048 features.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Domain | `bun --filter @bp/domain typecheck && bun --filter @bp/domain test` | exit 0; all pass |
| Analytics | `bun --filter @bp/analytics typecheck && bun --filter @bp/analytics test` | exit 0; all pass |
| Pipeline | `bun --filter @bp/pipeline-v2 typecheck && bun --filter @bp/pipeline-v2 test` | exit 0; package tests, including publication gates, pass |
| Studio API | `bun --filter @bp/studio-api test` | all pass |
| Worker | `bun run test:worker` | all pass |
| Web | `bun --filter @bp/web typecheck && bun run test:web` | exit 0; all pass |
| Performance | `bun run check:web-performance` plus focused map verification tests | exit 0; vendor budget is reported by the web check and generated map/lane/map-facts budgets are enforced by manifest verification |
| Architecture/style | `bun run check:web-architecture && bun run check:style` | exit 0 |

## Suggested executor toolkit

- Use `effect-ts` for domain schemas, matching the live schema dialect after
  plans 066-067.
- Use `vercel-react-best-practices` for the route-fact/geometry join and
  null-aware memoized view model.
- Official MapLibre large-GeoJSON guidance supports URL-loaded data, removing
  unused properties, reduced precision, simplification, and escalation to
  vector tiles only when measured:
  https://maplibre.org/maplibre-gl-js/docs/guides/large-data/

## Scope

**In scope**:

- `packages/domain/src/maps/index.ts` and focused domain tests
- `packages/domain/src/studio/shared.ts` only to add the canonical shared
  `CoverageWindowSchema`/type consumed by map and later serving contracts
- `packages/domain/src/studio/release.ts` and
  `packages/domain/src/studio/projections.ts`, plus focused tests, only to add
  and build the dedicated strict map-facts projection without changing the
  shared `StudioRouteSchema` or any top-level release identity field
- `packages/analytics/src/evaluation/map-artifacts.ts`
- `packages/analytics/test/evaluation-products.test.ts`
- `tools/pipeline-v2/src/commands/map/artifacts.ts`
- `tools/pipeline-v2/src/commands/map/context.ts`
- new `tools/pipeline-v2/src/commands/map/release.ts`, focused test, and
  `tools/pipeline-v2/test/cli/registry.test.ts` for the new command descriptor
- `tools/pipeline-v2/src/commands/studio/release.ts` only to write the
  dedicated map-facts projection and replace its map-fact `analysisPeriod`
  members with coverage
- `tools/pipeline-v2/src/commands/audit/map-artifacts.ts`
- `tools/pipeline-v2/src/commands/verify/d1.ts` and
  `tools/pipeline-v2/test/commands/verify/d1.test.ts` only to return and test
  the exact verified schema path alongside the existing seed path
- `tools/pipeline-v2/test/map-network-artifact.test.ts`
- focused map context/manifest fixtures/tests under `tools/pipeline-v2/test/`
- `tools/pipeline-v2/src/checks/check-publish-completeness.ts` and one focused
  test for rejecting demo/unverified map manifests at publication
- `tools/pipeline-v2/src/commands/publish/r2-artifacts.ts` and focused publish
  tests for content-hash filename verification
- `tools/pipeline-v2/src/commands/publish/publish-artifact-keys.ts` so manifest
  collection includes the available external `routeFacts.artifactKey` and
  emits none for the unavailable variant
- `scripts/publish-serving-release.sh` and a focused pipeline test that asserts
  completeness runs before every remote mutation
- `packages/studio-api/src/public-api.ts`
- focused `packages/studio-api/test/` coverage
- `apps/web/test/worker/public-routes.worker.test.ts`
- `apps/web/src/studio/api-client.ts`
- `apps/web/src/routes/map.tsx`
- `apps/web/src/studio/pages/network-map.tsx`
- `apps/web/src/components/route/NetworkMapLibre.tsx`
- `apps/web/src/components/route/NetworkMapLibre.map.tsx`
- `apps/web/test/shared/network-map.test.ts`
- focused shared map tests/fixtures that consume the network or map-facts
  bundle; do not version or migrate unrelated route-detail fixtures
- `tools/pipeline-v2/src/checks/check-web-performance.ts`
- focused harness/performance tests if the current check has a sibling test
- `tests/harness/month-doctrine-allowlist.ts` (remove only initial
  `retire-079` entries whose production matches this plan removes; for the
  staged public API and projections pairs, shrink and reassign only the exact
  remainder to `retire-085`)
- `plans/README.md` (status row only)

**Out of scope**:

- The retired `commands/pipeline/finalize.ts` and
  `commands/check/pipeline-v1.ts`; plan 062 deletes them. Never recreate either
  as part of this release builder.
- The final `/map` control/layout redesign, route search, URL state, mobile
  sheet, or feature-state optimization; plan 080 owns those.
- A composite treatment-opportunity score. Plan 076 is the operator-gated
  design spike; do not preempt it.
- Exact ACE/TSP spatial claims or route-segment explorer UX; plan 081 owns the
  presentation and plan 075 owns reviewed treatment studies.
- A PMTiles migration, hosted basemap, PostGIS, new server, or browser/Worker
  analytics.
- Rewriting ignored `data/` in place. Use temporary artifact roots.

## Git workflow

- Branch: `codex/079-truthful-map-contracts`
- Commit logical units: (1) strict geometry/manifest contracts, (2) producer
  and verifier, (3) API/cache/client adaptation, (4) performance gate.
- Example message: `Map data: preserve missingness and layer readiness`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Define strict network geometry, context, and manifest contracts

First add and export the canonical `CoverageWindowSchema` (`start:
IsoMonth | null`, `end: IsoMonth`) from
`packages/domain/src/studio/shared.ts`; map contracts import it. Plan 085 is a
downstream consumer of this landed schema and must not redefine it.

Add explicit named schemas/types to `packages/domain/src/maps/index.ts` (no
wildcard barrel):

1. `MapNetworkFeatureCollectionSchema` with `MultiLineString` geometry and
   minimal properties:

   ```ts
   {
     routeId: RouteId;
     month: IsoMonth;
     hourlySpeedMph: readonly (number | null)[];       // exactly 24
     hourlyTraversalCount: readonly number[];         // exactly 24
     servedBoroughs: readonly MapBorough[];            // sorted, unique
     servedBoroughsStatus: "verified" | "unavailable";
   }
   ```

   Add a five-value `MapBoroughSchema`. If status is `verified`, the array must
   be non-empty; `unavailable` must carry an empty array. Route label, primary
   route-family borough, all-day speed, daily riders, route-slice
   delay-exposure hours,
   movement, lane coverage, ACE, and reliability come from the same-coverage
   dedicated `MapRouteFactsResponse` referenced by the manifest—not the latest
   D1 catalog-card response. `servedBoroughs` is geographic map evidence and
   deliberately remains in this artifact.

2. `MapContextFeatureCollectionSchema` preserving `boroName` and a pipeline
   generated `[lon, lat]` `labelPoint` for each borough. Its required top-level
   `sourceRevision` foreign member carries
   `sourceId: "nyc_borough_boundaries"`, SHA-256 of the exact raw CSV bytes,
   and `currencyPolicy: "revision_pinned"`; it never exposes a local path.
   Also add a strict
   `MapBusLaneFeatureCollectionSchema` for LineString features with bounded
   coordinates and exactly these properties: `segmentId`, `street`, `borough`,
   `facility`, nullable `laneType`, and nullable `openDate`. Validate the lane
   collection before writing and again in the lazy client helper; 080/081 must
   not cast pipeline-private GeoJSON.
3. Manifest layer/source status schemas with typed readiness values
   `available | partial | missing | failed`, feature/route counts, source
   snapshot date/status, and the included route universe: Local/Limited/SBS
   included; Express/School excluded. Keep currency separate from readiness
   and use a discriminated policy instead of inventing one `fetchedAt` for
   sources that do not have it:

   - `max_age_snapshot` for current route/stop and bus-lane snapshots, carrying
     `fetchedAt`, `evaluatedAt`, `ageDays`, and `maxAgeDays: 45`; compare exact
     elapsed milliseconds against 45×24 hours and never use file mtime;
   - `coverage_window` for segment-speed/route-fact evidence, carrying
     `{ start: IsoMonth | null, end: IsoMonth }`; it is `period_aligned` only
     when it equals the manifest coverage and its evidence gate passes;
   - `revision_pinned` for borough boundary context, carrying the captured
     source ID and SHA-256 of the exact CSV/body used. This says the geometry is
     reproducible, not that a dateless boundary capture is “fresh.”

   Every logical layer/dependency record also carries `priority: "p0" | "p1"`
   and `requiredForFull: boolean`. Refine the schema against one fixed registry
   so a producer cannot downgrade a layer to make verification pass:

   - P0/required: route shapes, timepoint stops, simplified network, the
     route-segment artifact for every expected route, borough context, and the
     manifest-referenced route-facts projection;
   - P1/optional: NYC DOT bus-lane source geometry. Its absence must never
     block the core route map, speed evidence, or route drill.

   Every source/layer record carries `currencyStatus: "current" | "stale" |
   "period_aligned" | "revision_pinned" | "unknown"`, the policy-specific
   fields, and a typed reason. A layer derives the least-usable status of its
   sources. Full publication accepts `current` for max-age snapshots,
   `period_aligned` for observations, and `revision_pinned` for static context;
   it rejects `stale`/`unknown` on P0 records. A missing, stale, failed, or
   over-budget P1 bus-lane layer remains a typed optional gap: set its public
   artifact reference to null, exclude its key from publication, preserve the
   status/reason in the manifest, and let the UI disable the toggle. If an
   optional artifact is referenced for upload, its hash, schema, currency, and
   budget must all pass just like P0. Demo output may remain visibly
   stale/unknown. Test the exact 45-day boundary, missing snapshot timestamp,
   coverage mismatch, source-hash mismatch, and fixed P0/P1 registry.
4. A `releaseProfile: "demo" | "full"`, separate `buildStatus` from
   `verificationStatus`, and per-entry gzip bytes. A generated file is not
   automatically a verified complete release.
5. A required discriminated `routeFacts` field. Its `available` variant contains
   the exact compact map-facts projection artifact key, body SHA-256, schema
   version, `publishedAt`, coverage window, and route count; its `unavailable` variant contains
   no key and a typed reason. This is an external manifest dependency, not
   duplicated route facts inside network GeoJSON. Full verification requires
   `available`, recomputes the referenced body hash, and checks its parsed
   contract/universe; publication completeness includes that key. Demo may
   carry `unavailable` and render neutral geometry without inventing facts.

Do not version or add identity fields to `StudioRoutesResponseSchema` or
`StudioRouteDetailResponseSchema`; Plan 085 owns those serving contracts. In
`StudioReleasePayloadSchema`, add only the map-fact metadata needed below;
Plan 086 owns its top-level release identity migration. Map alignment is
proved entirely by the dedicated map-facts response's `publishedAt` and
coverage.

Do **not** add fields to shared `StudioRouteSchema`: it is embedded in route
detail, history, search, compare, and release contracts with independent
schema versions. Instead add a dedicated strict `MapRouteFactSchema` and
`MapRouteFactsResponseSchema` under the map domain. Each fact contains the
strict compact `MapRouteSummarySchema` plus map-only evidence. The summary is
an explicit pick, not an embedded `StudioRoute`, so interventions, diagnosis,
sparks, termini, and other route-page-only data never enter the eager map
payload:

```ts
{
  route: {
    routeId: RouteId;
    slug: string;
    label: string;
    corridor: string;
    borough: string; // primary family label, not served-geography filter
    sbs: boolean;
    speedMph: number;
    dailyRiders: number;
    reliability: string;
    movement6mPct: number | null;
  };
  delayExposure: {
    valueRiderHours: number | null;
    status: "available" | "unavailable";
    coverage: { start: IsoMonth | null; end: IsoMonth } | null;
    grain: "all_observed_timepoint_segments" | null;
    source: "mta_bus_segment_speeds" | null;
    segmentCount: number;
    ridershipDenominator: "average_service_day_route_hourly_ridership" | null;
    serviceDayRidershipCoverage: "available" | "not_available";
    hourlyPassengerDelayCoverage: "available" | "not_available";
    unavailableReason: string | null;
  };
  provenance: {
    lane: {
      status: "available" | "unavailable";
      valuePct: number | null;
      method: "route_shape_proximity_overlap" | null;
      sourceId: "nyc_dot_bus_lanes_local_streets" | null;
      unavailableReason: string | null;
    };
    ace: {
      status: "active" | "none" | "unknown";
      grain: "route_month";
      sourceId: "ace_routes" | null;
      sourceAsOf: string | null;
      sourceStatus: "available" | "unavailable";
      unavailableReason: string | null;
    };
    tsp: {
      status: "installed" | "candidate" | "unknown";
      grain: "route_or_corridor";
      sourceId: "nyc_dot_tsp_status_2017" | null;
      sourceDate: string | null;
      corridor: string | null;
      matchMethod: string;
    };
  };
}
```

The response carries schema version 2, `releaseId`, `publishedAt`, coverage,
and one unique
fact per route. Add a map-only `mapRouteFactsMetadata: { publishedAt, coverage
}` member plus `routeFactMetadata: Array<{ routeId, delayExposure, provenance
}>` to `StudioReleasePayloadSchema` v2. Stamp the map metadata once in `studio
release` from the build time and selected window while the validated
route-brief/pipeline-extended lane/TSP inputs are available.
`buildMapRouteFactsProjection` must source its identity metadata from that
map-only member, not the retiring top-level field, and project the exact named summary fields from
the same route objects used by `buildStudioRoutesProjection`; write
`studio/v1/map-route-facts.json` beside `routes.json`. For delay exposure,
populate metadata only from the existing route-brief `segmentUniverse`;
`available` requires the exact literals above, positive segment count,
matching evidence/response coverage, and equality between `valueRiderHours` and
the canonical route's non-null `riderHoursLost`. Otherwise the dedicated value
is null with an explicit unavailable reason—never convert missing evidence to
zero. Populate lane/TSP provenance from the release's already-built geometry
and TSP evidence. Lane coverage exists only once in the fact: `available`
requires `valuePct` to equal the canonical route's `laneCoverage`, the named
method/source to be present, and no unavailable reason; `unavailable` requires
a null value/method/source and a non-empty reason. Never copy the canonical
fallback `0` into an unavailable lane fact or display it as measured 0%.
ACE status also exists only once in the fact: when its source is available,
`provenance.ace.status` must equal the canonical route's `aceStatus`; when the
source is unavailable it is `unknown`, with null source fields and a non-empty
reason. Its best served source as-of value may honestly be null even when the
source is available. Tests prove the fact's nested `route` fields and every
available lane/ACE value are individually equal to the corresponding
canonical route fields in `routes.json`; unavailable facts obey the null
invariants. No second metric derivation is allowed.

In `packages/domain/src/studio/projections.ts`, replace only the map-facts
projection's retiring month member with the new map-only metadata above. In the
same change, shrink that file's `retired-identity-token` allowlist count from
its initial six occurrences to the exact four routes/detail projection
occurrences and
reassign the pair from `retire-079` to `retire-085`; Plan 085 migrates those
remaining serving projections. Do not edit them here.

The latest D1 catalog-card builder remains a discovery response and is never
adapted into this richer fact schema. This dedicated contract avoids silently
changing the embedded `StudioRoute` shape across route history, search,
compare, or segment-card responses. No route-detail schema bump belongs in
this plan.

Version changed public schemas rather than weakening `.strict()`. If plan 067
has landed, implement this in native Effect Schema.

**Verify**:

```sh
bun --filter @bp/domain typecheck
bun --filter @bp/domain test
```

Expected: all pass; domain tests reject the wrong hour-array length, invalid
coordinate shape, duplicate/invalid boroughs, a verified empty borough set,
unknown layer status, a context feature without a name, and contradictory
delay-exposure value/coverage metadata; projection tests prove route-object
parity, ACE parity, lane-coverage parity, unavailable-lane/ACE nullability,
and unique route IDs. Lane tests reject an invalid geometry/property shape.

### Step 2: Make the producer preserve evidence and remove duplicated route facts

Replace `routeHourSpeeds` with a null-aware aggregate returning the 24-cell
speed and traversal-count arrays. `LocalRouteSegmentSpeed` supplies
`busTripCount`; that is the only genuine weight in this source and becomes
`hourlyTraversalCount`. Do not invent an observation-count field from row
count. A missing hour stays `null` with zero traversals; never substitute
all-day speed. Define and test a minimum AM/PM coverage rule as a pure web model
in step 5; the artifact only reports evidence. `periodSpeed` uses traversal-
weighted hourly speed after the hour-coverage gate. An available speed with a
non-positive traversal count is a contract failure. Add an unequal-hour-count
fixture so equal-hour averaging cannot return.

Delete these network-only fields and their producer helpers:

- synthesized `scheduledMph`;
- duplicated `currentMph`, `dailyRiders`, `laneCoverage`, ACE, and hotspot
  values;
- permanently null `trend6mPct` and `riderHoursLost`;
- `laneCoverage(summary, segmentCount)`.

The network GeoJSON is geometry + hourly evidence. All all-day route metrics
must be joined from the manifest-referenced `MapRouteFactsResponse.routes` by
exact `fact.route.routeId` in the app. The compact fields are projected from
the same canonical route object written
to the static route projection, so detail/map agree without the lossy D1
catalog-card derivation.

Add `routeFactsPath`/`--route-facts` to `map artifacts`. Make
`MapArtifactsInputs` a discriminated contract: `releaseProfile: "full"`
requires an explicit `routeFactsPath`; demo may omit it and emit the manifest's
typed `routeFacts: { status: "unavailable", reason }` variant.
The CLI resolves an omitted flag only to
`<artifactRoot>/studio/v1/map-route-facts.json` (the same artifact root as the
map build; never silently fall back to repo-global state when a temporary root
is passed). Parse `MapRouteFactsResponse` schema version 2, recompute its body
hash, require its coverage to equal the map manifest coverage, and copy its
exact `publishedAt`/coverage metadata into the typed manifest reference. In
`full`, every mapped route must exist
exactly once in this projection; broader Express/School facts may exist.
In `demo`, a measured partial projection is allowed and reported. Never read a
route-facts URL from the browser that was not first declared and hash-checked
by this manifest.

Make bus-lane loading follow the P1 contract rather than the current
unconditional snapshot read. Route-shape and stop snapshot failures remain P0
errors. A missing, unreadable, stale, or over-budget lane snapshot/collection
produces the typed unavailable lane record, no public lane artifact reference,
and no publish key; it does not abort an otherwise valid full core-map build.
Only a current, schema-valid, in-budget lane input is written/referenced.

Add an optional `contextPath`/`--context` input to `map artifacts`, defaulting
to the generated NYC borough context artifact. Derive `servedBoroughs` offline
by assigning the route's current in-effect stop coordinates to the validated
borough multipolygons with a tested point-in-polygon helper. A cross-borough
route carries multiple boroughs; do not reduce to the route-ID prefix or a
plurality. Full releases fail when a route has no verified assignment. Demo
fixtures may publish `unavailable` and must report the count. Include an M60
fixture proving Manhattan + Queens membership.

Extend `map context` to emit a deterministic point-on-surface for each borough,
not an unchecked polygon centroid (which can land in water or a hole). Use the
largest polygon as the search surface, respect interior rings, and validate
with the same pure point-in-polygon helper that every emitted point is inside
its named polygon and outside holes; fail generation otherwise. Include a
concave polygon + hole + multipolygon fixture. Do not hardcode visual pixel
positions. Add a programmatic `sourcePath` input plus CLI `--source`, defaulting
only in the CLI adapter to the current raw CSV. Read that file as bytes once,
compute its
SHA-256 before parsing, and embed the `sourceRevision` above in the validated
context collection. `map artifacts --context` must propagate that source ID +
raw hash into the manifest's revision-pinned currency record; hashing only the
derived GeoJSON is insufficient. Add `contextSourcePath`/`--context-source`:
the full `MapArtifactsInputs` variant requires it, recomputes the raw CSV hash,
and rejects a mismatch with the context's embedded revision. `runMapRelease`
passes the exact source path it gave `runMapContext`; demo may omit it and
report unverified revision posture. Tests change one raw fixture byte and prove
both the recorded revision changes and a stale context/raw pairing fails.

Use the domain schemas to parse the network/context payloads before writing.

**Verify**:

```sh
rg -n 'busLaneMatchedLaneCount /|averageSpeedMph \* 1\.18|totalRidership / 30|trend6mPct: null|riderHoursLost: null' tools/pipeline-v2/src/commands/map/artifacts.ts
bun test tools/pipeline-v2/test/map-network-artifact.test.ts --timeout 5000
bun --filter @bp/pipeline-v2 typecheck
```

Expected: `rg` returns no matches and exits 1; tests prove null hours and exact
counts; typecheck exits 0.

### Step 3: Turn verification and the full-release profile into publication truth

Add `releaseProfile: "demo" | "full"` to `MapArtifactsInputs` and the CLI as
`--profile` (default `demo` so a local fixture cannot be mistaken for a public
release). Make the programmatic `runMapArtifacts` input required rather than
silently defaulted; the CLI adapter supplies its explicit default. Plan 062 is
a prerequisite and deletes the retired `pipeline finalize` and
`check pipeline-v1` commands. Do not edit, recreate, or make correctness depend
on either legacy surface.

Create `tools/pipeline-v2/src/commands/map/release.ts` with an exported
`runMapRelease` and CLI path `map release`. This is the focused local builder
for one publishable map/Studio release, not a revival of the retired v1 QA
doctrine. Its programmatic input includes the open local DB, year/month,
required `contextSourcePath`, optional artifact/export roots, the plan-078
spine start month (defaulting to
`ROUTE_SPEED_SPINE_DEFAULT_START_MONTH`), shared optional
`routeShapeSnapshotPath` and `stopSnapshotPath`, optional
`busLaneSnapshotPath`, and focused Studio-only overrides (`tspSourcePath`,
document/manual-intervention paths, route-slice raw root) for fixture tests. It
always builds `releaseProfile: "full"`; demo callers continue to use the
individual commands.

Resolve `artifactRoot` and `exportRoot` once with the shared path helpers. The
orchestrator also resolves route-shape, stop, and lane snapshot paths once.
Forward the exact same route-shape and stop paths to Studio and map; forward
the exact lane snapshot path to map. Never let those consumers independently
choose defaults and accidentally combine facts from one snapshot with geometry
or freshness metadata from another. The
exact dependency order inside `runMapRelease` is:

1. `runRouteBriefModel` into the resolved artifact root;
2. plan 078's exported `runRouteSpeedSpines` for all routes, from the configured
   start month through the requested month, into that root;
3. one `runVerifyD1Export` using both resolved roots;
4. exported `runMapContext` using the exact required context-source path;
5. `runStudioRelease` using only returned/explicit inputs;
6. `runMapArtifacts` with `releaseProfile: "full"` using the returned context
   and map-facts paths; then `verifyMapArtifactManifest` on that output.

Full release building must produce a valid spine artifact for every route that
the Studio/map universe requires. Preserve plan 078's hard failure for
missing/ambiguous spines rather than borrowing an ambient root or weakening
`requireSpine`.

Extend `D1VerifyResult` to return `schemaPath: exportResult.schemaPath` beside
its existing exact `seedPath`. Also add `artifactRoot` to `VerifyD1Inputs` and
the `verify d1` CLI, and pass it unchanged into `runExportD1Seed`; otherwise
that exporter reads and writes detector-readiness, route-capability, dossier,
timeline, and evidence artifacts under the default root. This single verified
export is the sole D1 input to Studio; `runMapRelease` never exports again.

In the same `verify/d1.ts` contract edit, replace its redundant top-level
`isoMonth` and `analysisPeriod` identity aliases with `publishedAt` and
`coverage: { start: null, end: month }` in the result, descriptor output
schema, and tests. The command's `month` input remains the D1 partition
selector. Remove its `analysis-period-identity` / `retire-079` entry in the
same change, and add a focused grep assertion that neither retired output key
survives.

Call `runStudioRelease` with the requested month and these explicit inputs:
`schemaPath: d1.schemaPath`, `seedPath: d1.seedPath`,
`localDbPath: inputs.local.path`,
`routeSliceArtifactsRoot: join(resolvedArtifactRoot, "route-slices")`,
`speedSpineRoot: resolvedArtifactRoot`, the output path under that root, and
`profile: "full"`. Forward any declared Studio source-path overrides. Never
permit its hard-coded March schema/seed, route-slice, or speed-spine defaults to
participate. Write `<artifactRoot>/studio/v1/release.json`. Extend
`RunStudioReleaseResult` with the exact `mapRouteFactsPath`; pass that path and
the returned context paths to `runMapArtifacts`.

Because command discovery is glob-based and snapshot-pinned, update
`tools/pipeline-v2/test/cli/registry.test.ts` after plan 062's deletion
baseline: total descriptors move from 96 to 97 and the map group is exactly
`["artifacts", "context", "release"]` (plus any prerequisite command already
present in the live post-062 snapshot; do not overwrite unrelated drift).

Return the route brief, speed-spine, D1, context, Studio, map, and audit results
from `runMapRelease`. Add `commands/map/release.test.ts`: start with empty
custom artifact and export roots, use a non-default month and fixture source
paths, and prove one D1 verify occurs before Studio, which records those exact
schema/seed and local-DB paths before map consumes the exact returned fact and
context paths. Assert Studio and map receive identical resolved route-shape and
stop paths and map receives the declared lane snapshot. Every
generated/derivative path must be under the custom roots;
no D1 derivative, route-slice, speed-spine, map/context, or Studio-output
access may fall back to the defaults. Existing TSP, document-chunk, and manual-
intervention inputs are declared read-only canonical sources rather than
derivatives; pass fixture overrides in this test instead of claiming the real
release performs zero reads anywhere under `data/artifacts`.

A missing/partial fact, invalid context, missing required spine, second D1
export, or path outside the resolved roots fails the focused release before it
can be certified. In `full`, compute the authoritative expected map universe
from the validated route-shape snapshot filtered to Local/Limited/SBS. Every
expected map route must have a canonical row in the same-coverage map-facts
projection, but that projection may legitimately include Express/School facts
and those extras are not an error. Every compact route field must exactly match
its same-coverage static Studio route projection source. The latest D1 catalog index is
useful for discovery but is not this metric contract.
Filter map production to the expected set; network features and route-segment
artifacts must then match it exactly, with missing or extra mapped routes
failing verification. ID normalization differences are reported, not silently
collapsed. In `demo`, publish the measured subset as partial.
Thread the same required profile through `audit map-artifacts`; the audit reads
and checks the manifest profile rather than relabeling it from the CLI flag.

Require every fixed-registry P0 artifact/dependency in
`verifyMapArtifactManifestContents`, including
`map_network_simplified_geojson`, verified borough context, available route
facts, and one route-segment artifact for every expected route. Do not require
the P1 bus-lane artifact for full core-map completeness. Make expected route
coverage non-optional in the `map artifacts` production path and report:

- expected route IDs/count;
- geometry route IDs/count;
- route-segment artifact route IDs/count;
- referenced route-fact projection IDs/count/month/key/hash;
- missing and extra IDs;
- per-layer feature count and verification status;
- source snapshot availability/date.

Compute source and layer currency during the same verification pass. A full
manifest with any P0 `stale`/`unknown` source or layer fails; a demo manifest
records the condition as partial and remains inspectable. A P1 lane gap does
not fail full verification, but it must have a null public artifact reference
and cannot enter the publish-key collector. A present P1 artifact with a bad
hash/contract is not publishable: exclude it and record the failure before the
manifest can pass. The publication report must name priority,
`requiredForFull`, source, policy, policy-specific evidence
(timestamp/age/threshold, analysis month, or source revision hash), status, and
reason so the UI can disable an optional layer without parsing prose.

Validate the citywide network payload through the new domain schema. Add
quality checks that fail for duplicate route IDs, an all-null/zero hour vector
misrepresented as available, and a missing network artifact. Do not reject a
legitimate partially observed hour; report coverage.

Write the manifest's verification result only after file hashes, byte lengths,
payload schemas, and expected-route coverage have been checked. Public
`quality.completenessStatus` must derive from typed P0 layer/route coverage,
not from the old hardcoded `status: "pass"`; expose P1 gaps separately so
"complete" never implies that optional lanes are present.

Local/sample releases may honestly be partial. Production publish-completeness
must fail if the configured public route universe is not fully represented.
Update `check-publish-completeness.ts` to parse the map manifest and reject
anything except `releaseProfile: "full"`, `verificationStatus: "pass"`, and
complete expected/actual route/P0-layer coverage before it emits publish keys.
It must also require the map manifest and parsed route-facts response to carry
identical coverage, require the manifest's route-facts reference metadata to
match the response's `publishedAt` and coverage exactly, and require
`coverage.end` to equal both the selected D1 serving partition and requested
publish partition. Report every conflicting value. Do not add a top-level
Studio release-identity check here; Plan 086 owns that payload migration.
Remove the map pair from this file's initial `retired-identity-token` entry,
then shrink and reassign its exact two Studio routes comparison occurrences to
`retire-085`; Plan 085 converts that remaining comparison to coverage with the
routes projection.
Thus a default demo build can be inspected locally but can never reach R2 as a
production release.

Make that gate fail closed at both publication entry points:

- move `check-publish-completeness.ts` in
  `scripts/publish-serving-release.sh` before the first remote D1 schema/seed
  mutation, R2 operation, or Worker deploy; a failure performs zero external
  writes;
- make `publish r2-artifacts` itself parse any map manifest it discovers and
  reject upload (including direct invocation) unless the manifest is `full`,
  verified, P0-complete, currency-acceptable for every P0 policy, and within
  required artifact budgets. It also rejects any optional artifact key offered
  for upload unless that layer is available, current, hash/contract-valid, and
  within its P1 budget; an unavailable optional layer has no key to upload.
  There is no bypass
  flag; `--dry-run` evaluates the same invariant before remote HEAD requests.

This producer/consumer cutover is atomic. In
`commands/publish/r2-artifacts.ts`, replace the current
`manifest.analysisPeriod` equality check with validation that `publishedAt`
exists and `manifest.coverage.end === options.month`; preserve all other
checks. Remove that file's `analysis-period-identity` / `retire-079` pair in
the same change. Plan 086 may strengthen or retest the landed gate, but must not
be required to make this Plan 079 manifest publishable.

Add a test that pins shell ordering and direct publisher tests proving a
demo/P0-stale manifest cannot upload, a full manifest with typed unavailable
lanes can publish its P0 keys, and an optional stale/over-budget lane key cannot
be smuggled into that upload. This prevents the wrapper and the independently
callable publisher from drifting apart.

**Verify**:

```sh
bun test packages/analytics/test/evaluation-products.test.ts tools/pipeline-v2/test/map-network-artifact.test.ts --timeout 5000
bun test tools/pipeline-v2/test/commands/verify/d1.test.ts tools/pipeline-v2/test/commands/studio/release.test.ts tools/pipeline-v2/test/commands/map/release.test.ts tools/pipeline-v2/test/cli/registry.test.ts tools/pipeline-v2/test/checks/publish-completeness.test.ts tools/pipeline-v2/test/commands/publish/r2-artifacts.test.ts tools/pipeline-v2/test/publish-serving-release-order.test.ts --timeout 5000
```

Expected: tests cover full complete, demo partial, missing-network,
missing/extra route, duplicate route, invalid hour, unavailable borough,
map/route-fact/D1 coverage mismatch, current/stale/period-aligned/revision-pinned/
unknown thresholds, required-versus-optional layer gating, pre-mutation
shell ordering, same-coverage/custom-root D1-before-Studio-before-map
release building with exactly one D1 verification, and direct publish
rejection of demo/unverified/P0-stale manifests; all pass.

### Step 4: Correct cache semantics with an exact content-addressed grammar

In `packages/studio-api/src/public-api.ts`, first migrate only the map-manifest
response member from the retiring month field to the parsed manifest's
`publishedAt`/coverage. Leave `releaseStatusMonth`, its env/error behavior, and
shared quality literals for Plan 085. Atomically shrink this file's
`retired-identity-token` allowlist count to the exact non-map remainder and
reassign it from `retire-079` to `retire-085`; leave its separate
`public-month-selector` entry unchanged.

Then classify artifact keys without a
manifest lookup on every request. Adopt one exact content-addressed grammar:
the filename must end `<stem>.<64 lowercase hex SHA-256>.<extension>`. Then:

- only a key matching that complete grammar receives
  `public, max-age=31536000, immutable`;
- current stable/month aliases receive a short revalidating policy such as
  `public, max-age=300, stale-while-revalidate=3600` plus the existing ETag;
- manifests themselves use the revalidating policy.

Do not pretend `map/2026-03/...` is immutable: corrected releases can be
republished. A future content-addressed-key migration may restore long caching
without changing this rule.

Do not infer immutability from an ETag, month, short hex token, directory name,
or a hash appearing anywhere else in the key. The current map keys therefore
all revalidate until a producer explicitly emits content-addressed filenames.
At the trusted publication boundary, recompute SHA-256 for any candidate using
the content-addressed grammar and reject upload when the filename token does
not equal the body hash. This makes the API's syntax classification an enforced
publisher invariant without an R2/manifest lookup per request.
Update Studio API and Worker tests to cover a mutable alias, a correctly
hash-addressed key, near-miss hash patterns, ETag preservation, and a corrected
object at the same mutable key. Add publisher tests for matching/mismatching
hash filenames.

**Verify**:

```sh
bun --filter @bp/studio-api test
bun run test:worker
```

Expected: all pass; mutable map keys no longer contain `immutable`; a truly
hash-addressed fixture still does.

### Step 5: Preserve manifest metadata and join geometry to canonical route facts

Change `fetchNetworkMapGeo` to parse and return an envelope. Use one generic
discriminated `ArtifactLoad<T>`: `ready` carries `data`, expected hash, and
actual hash; `missing | unavailable | integrity_mismatch | invalid_contract |
request_failed` carry no data plus their typed diagnostics. For example:

```ts
type NetworkMapBundle = {
  manifest: MapManifestResponse;
  network: ArtifactLoad<MapNetworkFeatureCollection>;
  context: ArtifactLoad<MapContextFeatureCollection>;
  routeFacts: ArtifactLoad<MapRouteFactsResponse>;
};
```

Preserve `publishedAt`, coverage, `generatedAt`, quality, layer status, hash,
and route universe. Implement one `fetchVerifiedMapArtifact` boundary that reads
bytes, computes SHA-256 with cross-runtime Web Crypto, compares the matching
manifest entry/reference, and only then JSON-parses with the supplied shared
schema. Use it for network, context, route facts, and lazy lanes—not just route
facts—because all current keys are mutable aliases. Network/context mismatch
produces an integrity-unavailable map with the structured route-fact list still
usable; route-fact mismatch leaves neutral geometry; lane mismatch disables
that optional layer. Report expected/actual hashes. Parse borough context with
its shared schema and retain `boroName`/`labelPoint` through the MapLibre
adapter.

Return that typed client load result for each artifact; components must not
infer integrity from thrown-message text. A manifest `routeFacts.status ===
"unavailable"` returns `ArtifactLoad` unavailable without issuing a request;
it is valid for demo and invalid for full publication. Tests mutate each
fixture body independently and assert the corresponding layer/result is not
rendered.

Add one lazy `fetchMapBusLanes(manifest, signal)` helper that resolves only the
manifest-declared lane key, checks readiness/currency before requesting it, and
parses `MapBusLaneFeatureCollectionSchema`. Focused client tests cover ready,
stale/missing (no request), abort, and malformed payload behavior. Plans
080/081 reuse this helper rather than define another lane type.

Add a reusable `fetchMapRouteFacts(manifest, signal)` helper that fetches and
parses the strict `MapRouteFactsResponse` from the manifest's declared
available `routeFacts.artifactKey`, not from the latest D1 route-list endpoint
and not as a naked route array. For the unavailable manifest variant it returns
an unavailable `ArtifactLoad` without fetching. The network-bundle loader calls
it in parallel with the network collection; route detail may call it with only
the manifest and does not need to download the 4.6 MB raw network GeoJSON. A same-coverage hash mismatch
from the shared verified-fetch boundary is
`factsStatus: "integrity_mismatch"`: retain neutral geometry, disable fact
lenses, and report expected/actual hashes; never join a corrected mutable alias
to an older manifest. Before joining route facts, require both exact
`bundle.routeFacts.data.coverage` equality with `bundle.manifest.coverage` and
equality between the response's `publishedAt` and the manifest's route-facts
reference `publishedAt`. On mismatch, retain the geometry/context but mark every
joined fact `factsStatus: "coverage_mismatch"`, disable metric lenses that
require those facts, and show both coverage windows in one explicit unavailable
message. Never relabel either side or select the newer window in the browser.
Full publication should prevent this, but the runtime remains fail-honest for
skewed deploys.

Create one pure web view-model join only when both `bundle.network` and
`bundle.routeFacts` are ready, from `bundle.network.data.features` and
`bundle.routeFacts.data.routes`, keyed by exact `fact.route.routeId`. A ready
fact list remains independently usable when network geometry is unavailable.
The result carries:

- geometry/hourly evidence and verified multi-borough membership from the map
  artifact;
- route label/slug/borough, all-day speed, daily riders, route-slice
  delay-exposure hours,
  movement, lane coverage/source posture, ACE, and reliability from
  the compact map fact, with projection-time equality to `StudioRoute`.

Do not backfill an absent route fact from deleted network properties. Mark it
`factsStatus: "unavailable"`, render a neutral/no-data line, and report
`N of M routes have complete metric facts`. The publish gate may require full
coverage even though local sample releases remain usable and honest.

Change `periodSpeed` to return `{ value: number | null, observedHours,
expectedHours }`. Require at least two of three AM hours and three of four PM
hours before ranking/coloring; after that gate, weight hour speeds by traversal
count. A speed with zero traversals is invalid at the artifact boundary rather
than a second weighting mode. Otherwise return unavailable. There is no
all-day fallback.

Until plan 080 rewrites the controls, hide/disable the time toggle when the
active metric is not speed and include a visible no-data legend entry.

**Verify**:

```sh
bun test apps/web/test/shared/network-map.test.ts --timeout 5000
bun --filter @bp/web typecheck
bun run test:web
```

Expected: tests cover full/partial/missing hour coverage, exact route-fact
join, unmatched facts, network/context/route-fact/lane hash mismatches, and
manifest metadata; all pass.

### Step 6: Enforce generated network/lane budgets and expose the vendor budget

The full map artifacts are gitignored and `bun --filter @bp/web build` does not
generate them. Do not create a CI check that silently passes because a local
file is absent. Instead:

1. extend map artifact entries/verification to compute and report raw bytes,
   deterministic gzip bytes, feature count, and coordinate count for the
   generated network, plus raw/gzip/feature count for NYC DOT lanes;
   also measure raw/gzip/route count for the eagerly loaded compact map-facts
   projection;
2. fail `audit map-artifacts --profile full` and production publish
   completeness when a P0 network/map-facts value exceeds the checked
   constants. A P1 lane overage makes the lane layer unavailable, nulls and
   excludes its public reference/key, and reports the measured overage; it
   does not make an otherwise complete core map fail. Direct publication of
   that excluded lane key still fails;
3. cover the budget evaluator with a small tracked synthetic fixture under
   `tools/pipeline-v2/test/fixtures/` so clean CI exercises pass/fail logic;
4. extend `check-web-performance.ts` to report/fail on
   `dist/client/vendor/maplibre-gl.js`, which does exist after the web build.

Set initial ceilings no higher than:

```text
network raw:       4,610,607 bytes
network gzip:        400,000 bytes (round current ~395 KB upward)
network features:        400
network coords:       60,000
map facts raw:         600,000 bytes
map facts gzip:        100,000 bytes
map fact routes:           400
bus lanes raw:      1,700,000 bytes
bus lanes gzip:        85,000 bytes
bus lane features:      3,200
MapLibre vendor raw: 1,100,000 bytes
MapLibre gzip:         290,000 bytes
```

If the new strict/minimal artifact is smaller, lower the checked-in ceiling to
roughly 10% above the generated fixture rather than preserving unnecessary
headroom. The check must print every measured value.

**Verify**:

First run the clean-CI gate. It is fixture-backed and must not depend on the
operator's ignored artifacts or live network:

```sh
bun --filter @bp/pipeline-v2 test
bun --filter @bp/web build
bun run check:web-performance
bun run check:web-architecture
bun run check:style
```

Expected: all exit 0; the tracked synthetic full manifest exercises P0
network/map-facts pass/fail, P1 lane include/exclude, and currency policies,
and the web output includes MapLibre vendor measurements.

Before certifying a real full release, refresh the max-age sources explicitly,
build context and full map facts into the **same empty root**, then pass the
returned fact path to the map build:

```sh
bun --filter @bp/pipeline-v2 cli -- ingest route-catalog
if ! bun --filter @bp/pipeline-v2 cli -- ingest bus-lanes; then
  printf '%s\n' 'Optional bus-lane refresh failed; map release must record/exclude P1 lanes.' >&2
fi
MAP_ROOT="$(mktemp -d)"
EXPORT_ROOT="$(mktemp -d)"
bun --filter @bp/pipeline-v2 cli -- map release --year 2026 --month 3 --db data/local/pipeline.sqlite --context-source data/raw/socrata-bulk/nyc_borough_boundaries/rows.csv --artifact-root "$MAP_ROOT" --export-root "$EXPORT_ROOT"
```

Expected after source access and full Studio prerequisites are available: all
exit 0; the release was generated after fresh route/stop/lane captures, the
context carries its raw CSV revision hash, the Studio release writes schema-v1
map facts before the map consumes them, and the generated audit reports
network + lane + map-facts measurements. Remove `MAP_ROOT` and `EXPORT_ROOT`
after recording the report. Run this gate once with a successful current lane
refresh to prove inclusion, and keep a fixture/recorded dry path where refresh
fails or remains stale: P0 certification still passes, the lane status/reason
is preserved, and no lane artifact key is published.
If a required P0 source refresh is unavailable, or the full Studio release
cannot cover the current Local/Limited/SBS universe, STOP and report that
release certification prerequisite; do not reuse checked stale route/stop
snapshots, the 12-route demo projection, or fabricate a timestamp. A stale or
missing P1 lane snapshot is excluded and reported, not promoted to a P0
blocker. The fixture-backed CI gate can still complete implementation
verification, but production publish remains blocked until the real-data P0
gate passes.

## Test plan

- Domain: strict network/context/manifest parsing, exact 24-cell arrays, layer
  readiness and currency-policy vocabularies.
- Pipeline: weighted hour values and counts, null missing hours, geometry-only
  properties, traversal-weighted period calculation, P0 currency rejection and
  P1 exclusion, cross-borough membership, duplicate route rejection, and
  full/demo universe reports.
- Cross-surface: join one route geometry to canonical `StudioRoute` metrics and
  prove lane/ridership values are identical to the route page because there is
  only one source; mismatched route-facts/map coverage refuses the fact join.
- API/Worker: manifest quality derived from required coverage,
  mutable-vs-hashed cache policies, ETag retained; publisher rejects a hash
  filename that does not match its bytes, rejects demo/P0-stale manifests, and
  refuses an excluded P1 key on direct invocation.
- Web: manifest metadata preserved, route-fact unavailable/integrity-mismatch
  states, period coverage threshold, `coverage_mismatch`, no silent all-day
  substitution.
- Performance: generated full-map verification enforces required
  network/map-facts budgets and excludes an over-budget optional lane layer;
  clean CI tests the evaluator; the web build enforces the vendor budget.

## Done criteria

- [ ] One strict domain schema owns the citywide network GeoJSON.
- [ ] Network geometry contains no synthesized scheduled speed, duplicated
      route-level facts, invalid lane ratio, or permanently null placeholders.
- [ ] Missing hourly observations remain null with counts; period ranking never
      substitutes all-day speed.
- [ ] Route-level metrics on `/map` come from `StudioRoute` by exact route ID.
- [ ] Map, route-fact, D1, and publish coverage must agree; runtime skew
      produces an explicit `coverage_mismatch` state rather than a
      cross-window join.
- [ ] Context retains borough names and deterministic label points.
- [ ] Geographic borough filtering uses verified `servedBoroughs`, not the
      route-ID-derived primary borough.
- [ ] Manifest exposes per-layer/source/route-universe readiness and typed
      priority/currency posture, and public quality derives from P0
      verification while reporting P1 gaps separately.
- [ ] Demo/partial manifests cannot pass production publish completeness.
- [ ] Publish completeness runs before remote D1/R2/Worker mutation, and the
      direct R2 publisher independently rejects non-production map manifests.
- [ ] Mutable aliases are revalidated; only content-addressed keys are
      immutable for one year.
- [ ] Full-release verification enforces network/map-facts budgets, includes
      lanes only when their P1 budget passes, and clean CI tests both branches;
      the web build reports/enforces MapLibre vendor size.
- [ ] Domain, analytics, pipeline, API, Worker, web, performance,
      architecture, and style checks pass.
- [ ] `bun run check:month-doctrine` passes with no `retire-079` entries; the
      staged `public-api.ts`, `projections.ts`, and
      `check-publish-completeness.ts` pairs were shrunk and reassigned to
      `retire-085`, while all other owned pairs were deleted with their
      production matches.
- [ ] No files outside the in-scope list are modified (`git status`).
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 062 has not deleted the retired `pipeline finalize` and
  `check pipeline-v1` surfaces. Execute that prerequisite; do not adapt or
  resurrect them for this map release.
- Plan 067 changed domain schema syntax; rebase to the live native Effect
  exemplar before editing.
- The configured production route universe cannot be identified at map-build
  time. Do not make expected-route coverage optional again.
- Stop/route geometry cannot produce verified borough membership for a full
  release. Do not fall back to route-prefix boroughs for a geographic filter.
- The route index is intentionally partial for the target production release.
  Report its coverage and get an operator decision; do not fabricate geometry
  properties to fill it.
- A route has a real hourly value but no positive traversal count source.
  Report the source contract; do not invent a second count.
- Correct cache classification requires changing keys outside the map artifact
  namespace. Keep the rule generic but do not migrate unrelated artifacts.
- Performance exceeds the current baseline after minimal properties and no
  duplicate coordinates are introduced. Profile/simplify before proposing
  PMTiles; do not switch infrastructure on assumption.
- Any fix would perform analytical/spatial joins in the browser or Worker.

## Maintenance notes

- `StudioRoute` is the route-level metric authority; the network artifact is
  geometry plus time-grained and served-borough evidence. Preserve that split.
- Layer status is part of the product, not only QA. Every future toggle must be
  disabled/qualified from the manifest when its artifact is absent or stale.
- A month in an artifact key is a version label, not a content hash. Keep
  mutable caching conservative until keys become truly content-addressed.
- Plan 080 consumes this bundle for the interactive network explorer. Plan 081
  consumes the same manifest for honest treatment/context layer controls.

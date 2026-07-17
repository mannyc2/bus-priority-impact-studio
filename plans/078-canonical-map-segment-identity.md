# Plan 078: Give map, route-detail, and history segments explicit verified identities

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` (Generation 9 table).
>
> **Drift check (run first)**:
> `git diff --stat cd878f7..HEAD -- packages/analytics/src/feature-history packages/analytics/test packages/domain/src/maps packages/domain/src/studio/routes packages/db/src/d1 packages/db/migrations/d1 tools/pipeline-v2/src/commands/map tools/pipeline-v2/src/commands/studio tools/pipeline-v2/src/commands/export/route-speed-history-coverage-index.ts tools/pipeline-v2/src/commands/export/d1-inputs.ts tools/pipeline-v2/src/lib/route-briefs/model.ts tools/pipeline-v2/src/lib/route-speed-spine-crosswalk.ts tools/pipeline-v2/src/lib/local-db-aggregates/route-speed-history-coverage-index.ts tools/pipeline-v2/src/checks/check-map-segment-identity.ts tools/pipeline-v2/test packages/studio-api/src/studio/read-handlers.ts packages/studio-api/test apps/web/src/components/route/RouteMapLibre.map.tsx apps/web/src/components/route/segment-history-data.ts apps/web/test/shared`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/068-verification-baseline.md`,
  `plans/077-restore-maplibre-rendering.md`
- **Category**: bug
- **Planned at**: commit `cd878f7`, 2026-07-09 (working tree already dirty in
  `plans/` only)
- **Ordering constraint**: land this before
  `plans/074-segment-study-engine.md`; plan 074 must not institutionalize the
  current month-specific/positional identity.

## Why this matters

Current map geometry, route-detail segments, and multi-year history use three
different identities. The web map cannot join them exactly, so it attaches
detail values to geometry by array position; checked-in B41 data proves that
two southbound geometries receive the wrong label, speed, route-slice delay
exposure, and treatment state. None of B41's 16 detail segments joins its
existing history.
This plan establishes an explicit source key, exact current-detail key, stable
geographic-spine key, and public readiness state, then removes positional
matching entirely.

## Current state

- The map producer constructs a raw source ID only:
  `tools/pipeline-v2/src/commands/map/artifacts.ts:205-212`:

  ```ts
  return [
    row.direction,
    row.stopOrder,
    row.timepointStopId,
    row.nextTimepointStopId,
  ].join(":");
  ```

- Route-detail data prepends route and month:
  `tools/pipeline-v2/src/lib/route-briefs/model.ts:172-180`:

  ```ts
  return [
    row.routeId,
    row.isoMonth,
    row.direction,
    row.stopOrder,
    row.timepointStopId,
    row.nextTimepointStopId,
  ].join(":");
  ```

- The stable history spine intentionally uses geographic nodes instead:
  `packages/analytics/src/feature-history/route-speed-spine.ts:657-662`:

  ```ts
  const segmentId = [
    input.routeSlug,
    segment.direction.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    segment.fromNodeId,
    segment.toNodeId,
  ].join("-");
  ```

- `RouteMapLibre.map.tsx:101-119` tries impossible direct comparisons, then
  falls back first to same-direction array position and finally global array
  position. The selected fallback segment supplies the displayed label, speed,
  rider hours, scheduled speed, lane, ACE, and TSP values at lines 146-193.
- Geometryless segments are dropped at
  `tools/pipeline-v2/src/commands/map/artifacts.ts:649-653`, so even producer
  order is not stable.
- `apps/web/src/components/route/segment-history-data.ts:57-97` only normalizes
  exact ID strings and silently drops every history segment that does not match
  a detail ID.
- Reproducible checked-in B41 result at planning time:

  ```text
  mapFeatures: 16
  directMapDetailMatches: 0
  southboundPositionalMatches: 5/7
  historySegments: 16
  exactHistoryDetailMatches: 0
  map tail:    S:34:303324:901681, S:34:303324:801144
  detail tail: ...:801144,          ...:901681
  ```

- The project already documents why raw names and stop order cannot be the
  multi-year identity. `knowledge/wiki/engineering/serving_snapshot_2_visualization_and_multiyear.md:126-153`
  records a real B41 schedule change and selects geographic spine-node pairs.
- The spine artifact retains source-stop-pair aliases, but not an exact raw
  source-key crosswalk. `route-speed-spine.ts:38-70` stores stop IDs, sets of
  stop orders, and sets of months; sets lose the exact month/order pairing.
- Spine readiness exists upstream. `route-speed-spines.ts:27-45` records
  `series_ready`, `series_ready_with_gaps`, `needs_pattern_review`, and
  `failed`; `route-speed-histories.ts:37-51` carries readiness into its build
  manifest.
- The serving path discards it:
  `route-speed-history-coverage-index.ts:17-43,82-100` parses history write
  status but not spine readiness; `packages/db/src/d1/schema.ts:448-468` has no
  readiness column; `packages/studio-api/src/studio/read-handlers.ts:436-450`
  calls history available/partial from missing-cell count alone.
- Package direction remains:
  `packages/analytics -> packages/domain`, and
  `tools/pipeline-v2 -> packages/domain, packages/analytics, packages/db`.
  Do not import pipeline code into a package or browser code.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Analytics typecheck | `bun --filter @bp/analytics typecheck` | exit 0 |
| Domain typecheck/tests | `bun --filter @bp/domain typecheck && bun --filter @bp/domain test` | exit 0; all pass |
| DB typecheck/tests | `bun --filter @bp/db typecheck && bun --filter @bp/db test` | exit 0; all pass |
| Pipeline typecheck | `bun --filter @bp/pipeline-v2 typecheck` | exit 0 |
| Focused identity tests | `bun test packages/analytics/test/feature-history/route-speed-spine-crosswalk.test.ts tools/pipeline-v2/test/map-segment-identity.test.ts apps/web/test/shared/segment-history-data.test.ts --timeout 5000` | all pass |
| Studio API tests | `bun --filter @bp/studio-api test` | all pass |
| Web typecheck/tests | `bun --filter @bp/web typecheck && bun run test:web` | exit 0; all pass |
| Architecture | `bun run check:web-architecture` | exit 0 |
| Style | `bun run check:style` | exit 0 |

## Suggested executor toolkit

- Use `effect-ts` for any domain schema work. If plan 067 has landed, write
  native Effect Schema; if not, match the current `schema-compat` dialect and
  leave plan 067's migration path intact.
- Use `vercel-react-best-practices` for the web join model; build `Map`s once
  and do not perform repeated linear scans during rendering.
- Read `packages/analytics/src/feature-history/route-speed-spine.ts` in full
  before changing its public artifact shape.

## Scope

**In scope** (only files needed for these exact changes):

- `packages/analytics/src/feature-history/route-speed-spine.ts`
- `packages/analytics/src/feature-history/route-speed-history.ts`
- `packages/analytics/src/feature-history/route-speed-spine-crosswalk.ts`
  (create)
- the smallest explicit `packages/analytics/src` export surface needed by
  pipeline-v2; no wildcard barrel
- `packages/analytics/test/feature-history/route-speed-spine-crosswalk.test.ts`
  (create)
- `packages/domain/src/maps/index.ts`
- `packages/domain/src/studio/routes/index.ts`
- matching domain tests under `packages/domain/test/`
- `tools/pipeline-v2/src/commands/map/artifacts.ts`
- `tools/pipeline-v2/src/commands/studio/route-speed-spines.ts`
- `tools/pipeline-v2/src/commands/studio/route-speed-history.ts`
- `tools/pipeline-v2/src/commands/studio/route-speed-histories.ts`
- `tools/pipeline-v2/src/commands/studio/release.ts`
- `tools/pipeline-v2/src/commands/studio/_release-segments.ts`
- `tools/pipeline-v2/src/commands/studio/_release-types.ts`
- `tools/pipeline-v2/src/lib/route-briefs/model.ts`
- `tools/pipeline-v2/src/lib/route-speed-spine-crosswalk.ts` (create; validated
  artifact loading only—crosswalk construction remains pure analytics)
- `tools/pipeline-v2/src/commands/export/route-speed-history-coverage-index.ts`
- `tools/pipeline-v2/src/commands/export/d1-inputs.ts`
- `tools/pipeline-v2/src/lib/local-db-aggregates/route-speed-history-coverage-index.ts`
- `tools/pipeline-v2/src/checks/check-map-segment-identity.ts` (create)
- focused pipeline tests/fixtures under `tools/pipeline-v2/test/`
- `packages/db/src/d1/schema.ts`, the next monotonic D1 migration, affected
  seed/row mappers, and focused DB tests
- `packages/studio-api/src/studio/read-handlers.ts` and focused API tests
- `apps/web/src/components/route/RouteMapLibre.map.tsx`
- `apps/web/src/components/route/segment-history-data.ts`
- focused tests under `apps/web/test/shared/`
- `plans/README.md` (status row only)

**Out of scope**:

- Changing detector/insight target IDs or brief record IDs. Preserve existing
  month-specific `StudioSegment.id` for those consumers and add explicit keys.
- New map controls/layout, temporal visualization, treatment-layer styling, or
  query parameters; plan 081 consumes the fixed identity.
- Rebuilding every ignored local artifact during implementation. Use small
  checked-in fixtures, then run a bounded B41 generation proof.
- Treating `needs_pattern_review` as series-ready.
- Moving spatial or cross-artifact joins into the browser or Worker.

## Git workflow

- Branch: `codex/078-canonical-map-segment-identity`
- Commit logical units: (1) crosswalk model/fixture, (2) producer/domain
  propagation, (3) D1/API readiness, (4) web fallback removal.
- Example message: `Map data: join segments by source and spine identities`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Pin the current failure with one small cross-artifact fixture

Create a minimal fixture that reproduces the B41 tail reversal and one dropped
geometry segment. It must include:

- three exact raw source keys with route, month, direction, stop order, and
  endpoint stop IDs;
- current map features in an order different from detail segments;
- one geometryless detail segment absent from map geometry;
- two spine segments with exact raw-key aliases;
- one deliberately unmatched raw key.

Add characterization assertions showing that positional association yields at
least one wrong match. Do not assert that the bad behavior should remain; this
test should be replaced by exact-join assertions in step 5.

Also preserve the read-only B41 reproduction command in a test comment or plan
maintenance note:

```sh
bun --eval 'const map=await Bun.file("data/artifacts/map/route-segments/b41/2026-03/all-day.geojson").json(); const detail=await Bun.file("data/artifacts/studio/v1/routes/b41/segments.json").json(); const history=await Bun.file("data/artifacts/studio/v2/routes/b41/speed-history.json").json(); console.log({map:map.features.length,detail:detail.segments.length,history:history.dimensions.segments.length})'
```

**Verify**:

```sh
bun test tools/pipeline-v2/test/map-segment-identity.test.ts --timeout 5000
```

Expected before the implementation assertion is flipped: the fixture proves
that position and identity disagree. Do not proceed without a deterministic
reproduction.

### Step 2: Define one exact source key and one ambiguity-rejecting crosswalk

Add a pure analytics helper that distinguishes a complete joinable source key
from an observed row whose stop pair is incomplete:

```ts
type ObservedRouteSegmentSourceKey = {
  routeId: string;
  month: string;
  direction: string;
  stopOrder: number;
  fromStopId: string | null;
  toStopId: string | null;
};

type RouteSegmentSourceKey = {
  routeId: string;
  month: string;
  direction: string;
  stopOrder: number;
  fromStopId: string;
  toStopId: string;
};
```

Add `classifyRouteSegmentSourceKey`, returning either `{ status: "keyed", key:
RouteSegmentSourceKey }` or `{ status: "unkeyable_missing_stop_pair", observed:
ObservedRouteSegmentSourceKey }`. A null endpoint must never become a literal
`"null"`, empty-string, or sentinel component in a public ID. Retain unkeyable
rows and counts in the spine artifact/readiness audit, but exclude them from
the exact alias index; a current public map/detail segment must always be
keyed.

Expose exactly two canonical serializers from that module:

- `serializeSourceSegmentId`, which serializes only
  direction/order/from-stop/to-stop for raw-source provenance; and
- `serializeStudioSegmentId`, which serializes the complete
  `RouteSegmentSourceKey` (route/month plus those raw fields) for the exact
  current record.

Callers must not hand-build either colon string and may call a serializer only
with the classified non-null `RouteSegmentSourceKey`. Extend the spine
accumulator/artifact to retain complete observed source-key records—including
explicitly classified nullable rows—not the lossy cross-product of `months[]`
and `stopOrders[]`. Build a crosswalk keyed by
`serializeStudioSegmentId(sourceKey)` for keyed rows and fail with both
competing IDs if the same exact key maps to two spine segments.

Keep all three concepts explicit:

- `sourceSegmentId`: raw direction/order/stop-pair key for provenance;
- `studioSegmentId`: current detail ID (`routeId:month:sourceSegmentId`), used
  for the exact current map↔detail join;
- `spineSegmentId`: stable geographic node-pair ID, nullable when the route is
  not safely mapped, used for history/studies.

Do not rename the existing public `StudioSegment.id`; add `spineSegmentId` and
`spineJoinStatus: "matched" | "unmatched" | "ambiguous" | "not_built"`.
Ambiguous is a generation failure, not a value that may be published.

Replace both existing serializers—not just the map helper.
`tools/pipeline-v2/src/commands/map/artifacts.ts::routeSegmentIdFor` and
`tools/pipeline-v2/src/lib/route-briefs/model.ts::segmentIdFromSpeedRow` must
call the exported canonical functions. The detail helper calls
`serializeStudioSegmentId` directly; it must not prepend route/month to an
already complete key or restate its fields. Add an architecture-style
test/`rg` assertion for the old hand-built arrays so this drift cannot return.

**Verify**:

```sh
bun test packages/analytics/test/feature-history/route-speed-spine-crosswalk.test.ts --timeout 5000
bun --filter @bp/analytics typecheck
```

Expected: exact aliases resolve independent of order; duplicate aliases fail
with a deterministic error; unmatched aliases return an explicit status; a
null stop endpoint is retained as `unkeyable_missing_stop_pair` and produces
no alias.

### Step 3: Propagate identities through domain, map, detail, and history artifacts

In `packages/domain/src/maps/index.ts`, version the route-segment property
contract to carry `sourceSegmentId`, `studioSegmentId`, `spineSegmentId`, and
`spineJoinStatus`. Keep the old raw `segmentId` only as a compatibility alias if
another live consumer needs it; otherwise remove it after callers migrate.

In `StudioSegmentSchema`, add the nullable stable ID and join status. In the
speed-history response, expose `spineReadiness` and use `segmentId` explicitly
as the spine ID. Do not expose local DB/artifact paths as part of this change.

Treat these shared-schema additions as explicitly backward-compatible rather
than silently bumping every containing response. Define
`spineSegmentId` as nullable with `.default(null)`, `spineJoinStatus` with
`.default("not_built")`, and speed-history `spineReadiness` as the four-value
enum nullable with `.default(null)`. Therefore legacy route detail/segments/
search/release/history payloads still parse, but null/`not_built` never enables
a stable join. New full producers in this plan must emit the real fields and
may not rely on defaults. Keep `StudioRouteDetailResponse` v2,
`StudioSegmentsResponse` v1, `StudioSearchResponse` v1,
`StudioReleasePayload` v1, and speed-history v1 here; plan 079 deliberately
bumps release/routes/detail later for its independent baseline contract. Add
legacy-parse and new-full-output tests so this compatibility choice is
intentional rather than an accidental schema-version collision.

Make both producers consume the same crosswalk through a concrete pipeline
loader, `loadRouteSpeedSpineCrosswalk` in
`tools/pipeline-v2/src/lib/route-speed-spine-crosswalk.ts`:

- input: `{ artifactRoot, routeId }` (or an explicit `spinePath` override for
  focused tests);
- default artifact path: `routeSpeedSpineArtifactPath({ artifactRoot,
  routeSlug: routeSpeedSpineRouteSlug(routeId) })`;
- output: validated `RouteSpeedSpineArtifact`, classified readiness, and the
  ambiguity-rejecting `source key -> spineSegmentId` map;
- missing artifact: explicit `not_built` result in demo/local mode, never an
  empty “ready” map;
- missing artifact with `requireSpine: true`: hard failure; plan 079's full map
  profile and the full Studio release pass this flag, while bounded demo
  fixtures may remain current-only;
- invalid or ambiguous artifact: hard failure with route/path/reasons.

Add `speedSpineRoot?: string` to `MapArtifactsInputs`, `RunStudioReleaseInputs`,
their CLI options (`--speed-spine-root`), and release `CliOptions`. Default it
to the normal artifact root. Load each route crosswalk once before its segment
records are built; pass the validated result into pure map/detail builders.
Do not let either builder discover files internally.

Make both producers consume that supplied result:

- `map artifacts` always constructs `studioSegmentId` from its own exact
  route/month/source values and attaches the spine ID/status when a spine is
  available;
- `studio release` attaches the same spine ID/status to its current detail
  segments;
- `route-speed-histories` carries the originating spine readiness into the
  validated response and build manifest.

The browser and Worker receive the result; they never load a spine artifact or
perform geographic matching.

For `series_ready` routes, generation must fail if any current published detail
segment has an ambiguous spine mapping. Unmatched current segments are allowed
only with explicit counts/reasons and a partial readiness state.
Within one route/month, two current `StudioSegment`s must not publish the same
non-null `spineSegmentId`; fail generation because a durable URL/history
selection would otherwise be ambiguous. This does not prohibit the same spine
ID appearing in different months.

**Verify**:

```sh
bun --filter @bp/domain typecheck
bun --filter @bp/domain test
bun --filter @bp/pipeline-v2 typecheck
bun test tools/pipeline-v2/test/map-segment-identity.test.ts tools/pipeline-v2/test/commands/studio/route-speed-histories.test.ts --timeout 5000
```

Expected: all exit 0; the fixture's map and detail records carry identical
`studioSegmentId`; matched history records carry the same `spineSegmentId`.

### Step 4: Preserve spine readiness in D1 and public projection status

Extend the local coverage materialization and D1
`route_speed_history_coverage` row with:

- `spine_readiness` using the four upstream values;
- `spine_reason_json` (or an existing typed JSON convention) for concise audit
  reasons;
- `matched_current_segment_count` and `unmatched_current_segment_count` if the
  release builder can provide them without a new scan.

`ensureRouteSpeedHistoryCoverageTable()` must upgrade an existing local table,
not rely on `CREATE TABLE IF NOT EXISTS`. Inspect `PRAGMA table_info`, add each
missing column with `ALTER TABLE`, and leave legacy readiness nullable/unknown.
The materializer rewrites the requested month with real values; export must
refuse a legacy null readiness and instruct the operator to rerun that month,
never default it to `series_ready`. Add a test that begins from the pre-plan
table definition, runs the upgrade/materializer, and successfully exports the
new row.

Update `tools/pipeline-v2/src/commands/export/d1-inputs.ts` explicitly: select
the four new coverage columns, map them into the D1 seed row, validate the
reason JSON, and reject a legacy null `spine_readiness` before any SQL is
written. Do not rely only on the dedicated coverage-index exporter; the
canonical D1 export command is a separate production caller.

At planned SHA the next migration number is `0031`; use the next monotonic
number after all prerequisite plans land. Update seed validation, export input,
query mapping, and DB tests together.

In `read-handlers.ts`:

- `series_ready` + no missing cells => available;
- `series_ready_with_gaps` => partial;
- `needs_pattern_review` => partial metadata may be advertised, but stable
  segment comparison is unavailable;
- `failed` => unavailable.

Carry `spineReadiness` in the public speed-history schema so the UI can gate
claims without parsing caveat text.

**Verify**:

```sh
bun --filter @bp/db typecheck
bun --filter @bp/db test
bun --filter @bp/studio-api test
```

Expected: all pass; a focused API test proves `needs_pattern_review` is never
advertised as an available stable segment series.

### Step 5: Delete positional association and join web data by explicit keys

In `RouteMapLibre.map.tsx`, delete `featureOrder`,
`studioSegmentForFeature`'s same-direction/global index fallbacks, and all
parameters used only for positional matching. Build one `Map` keyed by
`StudioSegment.id`; look up `feature.properties.studioSegmentId` exactly.

If a feature is unmatched:

- render its own geometry and artifact speed;
- do not borrow route-slice delay exposure, label, scheduled speed, or
  treatment fields from another segment;
- mark it `detailJoinStatus: "unavailable"` for the readout and count it in a
  concise data note.

In `segment-history-data.ts`, join a detail segment to history by
`segment.spineSegmentId`, not `segment.id`. Return an explicit readiness result
alongside series, so a missing join is distinguishable from a real all-null
series.

Flip the characterization fixture to assert:

- all map/detail matches are correct regardless of order;
- the dropped geometry segment remains detail-only, not reassigned;
- matched detail/history rows use spine IDs;
- unmatched rows render unavailable rather than disappear or borrow data.

**Verify**:

```sh
rg -n 'orderedFeatureIndex|sameDirection\[|segments\[input\.featureIndex\]' apps/web/src/components/route/RouteMapLibre.map.tsx
bun test apps/web/test/shared/segment-history-data.test.ts tools/pipeline-v2/test/map-segment-identity.test.ts --timeout 5000
bun --filter @bp/web typecheck
```

Expected: `rg` returns no matches and exits 1; all focused tests and typecheck
pass.

### Step 6: Run a bounded real-data proof and the full relevant gate

Create `tools/pipeline-v2/src/checks/check-map-segment-identity.ts`. It accepts
`--map`, `--detail`, and `--history` paths plus `--route`/`--month`, parses the
three versioned contracts, prints a JSON report, and exits nonzero unless exact
current joins, stable history joins, uniqueness, and ambiguity checks pass.
Its fixture test is
`tools/pipeline-v2/test/checks/map-segment-identity.test.ts`.

Add a bounded comma-separated `--routes` option to `map artifacts` and
`studio release` (matching `studio route-speed-spines`; pure filtering after
their normal authoritative route-universe load; it must
not change full-production coverage semantics). Then generate B41 outputs in a
temporary artifact root; do not overwrite ignored operator data:

```sh
TMP_ROOT="$(mktemp -d)"
bun --filter @bp/pipeline-v2 cli -- studio route-speed-spines --start-month 2023-04 --end-month 2026-03 --routes B41 --artifact-root "$TMP_ROOT"
bun --filter @bp/pipeline-v2 cli -- studio route-speed-history --route-id B41 --artifact-root "$TMP_ROOT"
bun --filter @bp/pipeline-v2 cli -- map artifacts --year 2026 --month 3 --routes B41 --speed-spine-root "$TMP_ROOT" --artifact-root "$TMP_ROOT"
bun --filter @bp/pipeline-v2 cli -- studio release --month 2026-03 --routes B41 --profile demo --speed-spine-root "$TMP_ROOT" --output "$TMP_ROOT/studio/v1/release.json"
bun tools/pipeline-v2/src/checks/check-map-segment-identity.ts --route b41 --month 2026-03 --map "$TMP_ROOT/map/route-segments/b41/2026-03/all-day.geojson" --detail "$TMP_ROOT/studio/v1/routes/b41/index.json" --history "$TMP_ROOT/studio/v2/routes/b41/speed-history.json"
```

`studio release` writes the per-route `StudioRouteDetailResponse` (including
its `segments`) to `routes/<slug>/index.json`; it does not write a nested
`routes/<slug>/segments.json`. The new options and exact output paths are part
of this plan's contract; keep the focused command test synchronized if the
repository's artifact helper resolves a different path. Always remove the
temporary root after recording the report. Assert:

```text
map/detail exact current matches: 16/16 map features
ambiguous source keys: 0
history/detail stable matches: all segments with matched spine IDs
positional fallback uses: 0
```

If live B41 counts have drifted, report the new denominators; the required
invariant is exact identity, not the literal number 16.

Then run:

```sh
bun --filter @bp/analytics typecheck
bun --filter @bp/domain typecheck
bun --filter @bp/db typecheck
bun --filter @bp/pipeline-v2 typecheck
bun --filter @bp/web typecheck
bun test tools/pipeline-v2/test/checks/map-segment-identity.test.ts --timeout 5000
bun run test:unit
bun run test:web
bun run test:worker
bun run check:web-architecture
bun run check:style
```

Expected: all commands exit 0.

## Test plan

- Analytics crosswalk tests: exact match, order independence, schedule-renumber
  alias, unmatched key, nullable-stop classification with no public alias, and
  duplicate/ambiguous key hard failure.
- Pipeline boundary fixture: reordered map/detail arrays, geometryless drop, and
  stable history join.
- Pipeline loading: missing/invalid/ambiguous spine artifact; explicit path
  override; one load per route; demo `not_built`; exact serializer parity
  between map and route-brief producers.
- Domain tests: strict parsing of all new identity/readiness fields and
  rejection of an invalid readiness value.
- DB/API tests: every upstream readiness maps to the intended public status.
- Web tests: exact map/detail lookup; no positional fallback; history series
  keyed by `spineSegmentId`; explicit unmatched state.
- B41 bounded proof: current geometry matches the correct route-detail record
  and history joins do not silently vanish; the executable checker fails on a
  deliberately swapped or duplicate fixture.

## Done criteria

- [ ] Every published map feature has an exact `studioSegmentId`.
- [ ] Stable-series records use one geographic `spineSegmentId`; exact source
      aliases are retained for audit.
- [ ] Ambiguous source aliases fail generation with both competing IDs.
- [ ] Non-null spine IDs are unique within a current route/month; unmatched
      current segments remain explicit rather than borrowing a stable ID.
- [ ] `RouteMapLibre.map.tsx` contains no order-based detail fallback.
- [ ] `segmentHistorySeries` joins via the explicit spine ID and returns an
      explicit readiness/unmatched state.
- [ ] Spine readiness survives manifest -> local coverage -> D1 -> API -> web.
- [ ] `needs_pattern_review` never enables stable temporal segment claims.
- [ ] The B41 proof reports zero wrong/positional associations.
- [ ] Package typechecks, unit/web/worker tests, architecture, and style pass.
- [ ] No files outside the in-scope list are modified (`git status`).
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 067 changed the schema dialect in any in-scope domain file; rebase this
  plan's schema syntax to the live native Effect patterns before editing.
- Plan 074 has started changing stable segment identity; coordinate and make
  this plan the shared prerequisite rather than creating a second crosswalk.
- An exact raw source key maps to more than one spine segment.
- A `series_ready` route has unexplained unmatched current segments after one
  producer fix attempt.
- Constructing exact aliases would require a Cartesian product of independent
  month/order sets. Extend the spine accumulator to retain exact observed keys;
  do not synthesize combinations.
- The only proposed fix is to sort arrays until B41 lines up. Sorting is not an
  identity contract.
- The Worker or browser would need to perform coordinate snapping/spatial
  matching; keep it in analytics/pipeline.

## Maintenance notes

- Preserve the distinction between a month-specific source/detail ID and a
  stable geographic spine ID. They answer different audit questions.
- Schedule changes can legitimately create unmatched or changed segments; the
  correct behavior is a typed readiness/gap, never positional reassignment.
- Plan 081 uses the stable ID to recolor current geometry with historical
  month/daypart cells. Review that PR for the same readiness gates.
- Update the stale status lines in
  `knowledge/wiki/engineering/serving_snapshot_2_visualization_and_multiyear.md`
  only if this implementation changes the documented readiness/publication
  state; do not rewrite the design history casually.

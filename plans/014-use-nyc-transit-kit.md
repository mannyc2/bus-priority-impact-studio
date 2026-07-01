# Plan 014: Replace duplicated source clients with nyc-transit-kit

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report -
> do not improvise. When done, update the status row for this plan in
> `plans/README.md` - unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
>
> ```sh
> git diff --stat 58dfaeb..HEAD -- \
>   package.json \
>   bun.lock \
>   packages/sources/package.json \
>   packages/sources/src \
>   packages/sources/test \
>   packages/studio-api/package.json \
>   packages/studio-api/src/source-refresh.ts \
>   packages/studio-api/test/source-refresh.test.ts \
>   tools/pipeline-v2/package.json \
>   tools/pipeline-v2/src/lib \
>   tools/pipeline-v2/src/commands \
>   tools/pipeline-v2/test \
>   tests/harness/production-boundaries.test.ts \
>   knowledge/wiki/engineering/sources_adapter_cutover_plan.md \
>   knowledge/log.md
> ```
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none; supersedes `plans/013-effect-native-public-source-kit.md`
- **Category**: migration
- **Planned at**: commit `58dfaeb`, 2026-06-30

### Blocked note - 2026-07-01

Blocked after the Plan 015 Effect runtime landed on `effect@4.0.0-beta.92`.
Current package metadata still shows `@nyc-transit-kit/soda3@0.1.1`,
`@nyc-transit-kit/mta@0.1.1`, and `@nyc-transit-kit/compat@0.1.1` as the
latest published versions, and those packages depend on `effect@4.0.0-beta.83`.
Do not install them into this repo until the toolkit publishes an Effect-aligned
release or this repo makes a deliberate dependency decision with sources,
pipeline, Studio API, and Worker build verification.

## Why this matters

This repo already decided that `@bp/sources` is an internal anti-corruption
layer, not a public source-client product. The separate public toolkit now
exists as `mannyc2/nyc-transit-kit`, with published `0.1.1` packages for SODA3,
MTA, NYC DOT, NYC Open Data, contracts, and Promise compatibility wrappers.
Using it here lets this repo delete duplicated provider-client code while
keeping product-specific normalizers, registry loading, local DB writes, and
analytics in this monorepo.

The target end state is not "delete `packages/sources`." The target is:
`packages/sources` keeps Bus Priority DTO normalization and manifest/probe
contracts, while generic Socrata/SODA3 request execution, endpoint construction,
byte-range export, catalog access where parity is acceptable, and GTFS-RT
protobuf decoding come from `nyc-transit-kit`.

## Current state

- `packages/sources/package.json:19-30` exports custom Socrata client subpaths:

  ```json
  "./clients/socrata": {
    "types": "./src/clients/socrata/index.ts",
    "bun": "./src/clients/socrata/index.ts"
  },
  "./clients/socrata/catalog": {
    "types": "./src/clients/socrata/catalog-client.ts",
    "bun": "./src/clients/socrata/catalog-client.ts"
  },
  "./clients/socrata/soql": {
    "types": "./src/clients/socrata/soql.ts",
    "bun": "./src/clients/socrata/soql.ts"
  }
  ```

- `packages/sources/package.json:129-132` owns the protobuf dependency directly:

  ```json
  "dependencies": {
    "@bp/domain": "workspace:*",
    "gtfs-realtime-bindings": "1.1.1",
    "zod": "catalog:"
  }
  ```

- `packages/sources/src/clients/socrata/soda3-client.ts:1-190` is a full custom
  SODA3 client: zod dataset-id schemas, URL builders, SoQL string builder,
  retry policy, app-token headers, metadata/columns/row-count helpers, query
  pagination, and export byte-range support.

- `tools/pipeline-v2/src/lib/soda3.ts:1-66` is the best pipeline seam. It wraps
  the custom client and already hides source-manifest integration from the many
  ingest commands:

  ```ts
  import {
    buildSoda3ExportUrl,
    buildSoda3SoqlQuery,
    createSoda3Client,
    type SocrataFetch,
    type SocrataRow,
    type Soda3SoqlQuery,
  } from "@bp/sources/clients/socrata";
  ```

- `packages/studio-api/src/source-refresh.ts:323-343` has a direct Worker-safe
  SODA3 call for route-speed availability. This is not imported from
  `@bp/sources`, but it duplicates request construction and app-token headers:

  ```ts
  const url = new URL("https://data.ny.gov/api/v3/views/kufs-yh3x/query.json");
  const response = await fetcher(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-App-Token": appToken,
    },
    body: JSON.stringify({ query: [...].join(" "), includeSynthetic: false }),
  });
  ```

- `tools/pipeline-v2/src/commands/sources/catalog-search.ts:1-80` uses the
  custom `SocrataCatalogClient` and returns rich source-discovery fields such as
  posting frequency, time period, granularity, owner, agency, and column names.
  `nyc-transit-kit@0.1.1` catalog search currently returns a narrower SODA3
  catalog response, so this command needs an explicit parity decision.

- `packages/sources/src/gtfs-realtime/decoder.ts:1-18` hides
  `gtfs-realtime-bindings` behind a local wrapper:

  ```ts
  import { decodeDefaultGtfsRealtimeFeedMessage } from "./vendor/gtfs-realtime-bindings.js";
  ```

- External toolkit facts verified on 2026-06-30:
  - GitHub repo: `https://github.com/mannyc2/nyc-transit-kit`.
  - Latest GitHub tag: `v0.1.1`.
  - `bun pm view @nyc-transit-kit/soda3 version` returned `0.1.1`.
  - `bun pm view @nyc-transit-kit/mta version` returned `0.1.1`.
  - `bun pm view @nyc-transit-kit/compat version` returned `0.1.1`.
  - `@nyc-transit-kit/soda3@0.1.1` depends on
    `@nyc-transit-kit/contracts@0.1.1` and `effect@4.0.0-beta.83`.
  - `@nyc-transit-kit/mta@0.1.1` depends on
    `@nyc-transit-kit/contracts@0.1.1`, `@nyc-transit-kit/soda3@0.1.1`,
    `effect@4.0.0-beta.83`, and `gtfs-realtime-bindings@2.0.0`.
  - The toolkit docs recommend subpath imports such as
    `@nyc-transit-kit/soda3/query`, `@nyc-transit-kit/mta/gtfs-realtime`, and
    Promise wrappers from `@nyc-transit-kit/compat/*`.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Verify package availability | `bun pm view @nyc-transit-kit/soda3 version` | prints `0.1.1` |
| Verify package availability | `bun pm view @nyc-transit-kit/mta version` | prints `0.1.1` |
| Verify package availability | `bun pm view @nyc-transit-kit/compat version` | prints `0.1.1` |
| Install/update lockfile | `bun install` | exit 0; `bun.lock` updates intentionally |
| Sources typecheck | `bun --filter @bp/sources typecheck` | exit 0 |
| Sources tests | `bun --filter @bp/sources test` | exit 0 |
| Pipeline typecheck | `bun --filter @bp/pipeline-v2 typecheck` | exit 0 |
| Pipeline targeted tests | `bun test tools/pipeline-v2/test/lib/socrata-monthly-ingest.test.ts tools/pipeline-v2/test/commands/sources/soda3-range-probe.test.ts tools/pipeline-v2/test/commands/sources/catalog-search.test.ts --timeout 5000` | all pass |
| Studio API typecheck | `bun --filter @bp/studio-api typecheck` | exit 0 |
| Studio source-refresh test | `bun test packages/studio-api/test/source-refresh.test.ts --timeout 5000` | all pass |
| Architecture harness | `bun run check:web-architecture` | exit 0 |
| Web/Worker bundle check | `bun --filter @bp/web build` | exit 0; no JS budget failure |

## Suggested executor toolkit

- Read the current `nyc-transit-kit` docs before editing:
  - `https://github.com/mannyc2/nyc-transit-kit`
  - `https://github.com/mannyc2/nyc-transit-kit/blob/main/docs/getting-started.md`
  - `https://github.com/mannyc2/nyc-transit-kit/blob/main/docs/api-reference.md`
  - `https://github.com/mannyc2/nyc-transit-kit/blob/main/docs/provider-coverage.md`
- Prefer `@nyc-transit-kit/compat/*` in this repo unless a file already has a
  deliberate Effect boundary. This repo does not currently use Effect in browser
  code, and previous plans warned about browser bundle headroom.
- Use package subpaths. Do not import package roots for broad namespace access.

## Scope

**In scope**:

- `package.json`
- `bun.lock`
- `packages/sources/package.json`
- `packages/sources/src/clients/socrata/**` - delete or replace only as needed
  during migration, then remove the public exports.
- `packages/sources/src/gtfs-realtime/**`
- `packages/sources/src/probes/socrata-probe.ts`
- `packages/sources/src/registry/manifest.ts`
- `packages/sources/test/socrata*.test.ts`
- `packages/sources/test/gtfs-rt.test.ts`
- `tools/pipeline-v2/package.json`
- `tools/pipeline-v2/src/lib/soda3.ts`
- `tools/pipeline-v2/src/lib/socrata-token.ts`
- `tools/pipeline-v2/src/lib/http-file-download.ts`
- Pipeline commands and tests that import `@bp/sources/clients/socrata*`
- `packages/studio-api/package.json`
- `packages/studio-api/src/source-refresh.ts`
- `packages/studio-api/test/source-refresh.test.ts`
- `tests/harness/production-boundaries.test.ts`
- `knowledge/wiki/engineering/sources_adapter_cutover_plan.md`
- `knowledge/log.md`

**Out of scope**:

- Do not delete `packages/sources/src/adapters/**` normalizers unless
  `nyc-transit-kit` already has a same-shape replacement and existing fixture
  tests prove parity.
- Do not delete `packages/sources/src/registry/**`; this repo still owns the
  source manifest and project-specific source IDs.
- Do not edit `knowledge/raw/source_manifest.yaml` except for a documented field
  migration. This plan should not need a manifest shape change.
- Do not import `@nyc-transit-kit/*` into browser-facing `apps/web/src` modules.
  Worker/server packages are allowed after bundle checks pass.
- Do not add pnpm, Python, FastAPI, hosted Postgres/PostGIS, or a VPS.
- Do not change route score, detector, local DB, D1/R2 publishing, or UI
  behavior except where source-client return shapes force tests to update.
- Do not run live provider probes in default verification. Keep tests
  fixture-backed.

## Git workflow

- Branch: `codex/014-use-nyc-transit-kit`
- Commit style: sentence-case imperative, matching recent repo history.
- Do not push or open a PR unless the operator asks.
- Keep unrelated dirty worktree changes intact. This repo currently has
  unrelated uncommitted frontend/map files; do not modify or revert them.

## Steps

### Step 1: Add the published toolkit dependencies

Verify the current published versions:

```sh
bun pm view @nyc-transit-kit/soda3 version
bun pm view @nyc-transit-kit/mta version
bun pm view @nyc-transit-kit/compat version
```

Expected: each prints `0.1.1`.

Update the root `package.json` workspace catalog with exact versions:

```json
"@nyc-transit-kit/compat": "0.1.1",
"@nyc-transit-kit/contracts": "0.1.1",
"@nyc-transit-kit/mta": "0.1.1",
"@nyc-transit-kit/nyc-dot": "0.1.1",
"@nyc-transit-kit/nyc-open-data": "0.1.1",
"@nyc-transit-kit/soda3": "0.1.1",
"effect": "4.0.0-beta.83"
```

Add package-level dependencies only where imported:

- `packages/sources`: `@nyc-transit-kit/contracts`,
  `@nyc-transit-kit/mta`, `@nyc-transit-kit/soda3`, and `effect` if this
  package calls `Effect.runSync` or `Effect.runPromise`.
- `tools/pipeline-v2`: `@nyc-transit-kit/compat`,
  `@nyc-transit-kit/soda3`, and `effect` only if direct Effect APIs are used.
- `packages/studio-api`: `@nyc-transit-kit/compat` only if
  `source-refresh.ts` migrates to the compat wrapper.

Do not add `@nyc-transit-kit/*` to `apps/web/package.json`.

Run:

```sh
bun install
```

**Verify**: `bun install` exits 0, `bun.lock` changes, and
`bun pm view @nyc-transit-kit/soda3 dependencies` still shows
`effect: 4.0.0-beta.83`.

### Step 2: Replace pipeline SODA3 row/export execution behind one seam

Rewrite `tools/pipeline-v2/src/lib/soda3.ts` first. This is the central seam
for pipeline consumers.

Target behavior:

- `SocrataRow` remains `Readonly<Record<string, unknown>>` or an equivalent
  plain row type.
- `SocrataFetch` remains compatible with existing tests that inject
  `(input, init) => Promise<Response>`.
- `createSoda3SourceClient(source, options).rows(query)` still returns
  `Promise<readonly SocrataRow[]>`.
- The function still injects the Socrata app token through
  `fetchWithSocrataAppToken`.
- Pagination behavior remains compatible with the old client: when callers do
  not set `limit` or `offset`, fetch pages until a page is shorter than
  `pageSize`.
- Actual HTTP execution uses `querySoda3Rows` from
  `@nyc-transit-kit/compat/soda3`.
- Export execution uses `exportSoda3Response` from
  `@nyc-transit-kit/compat/soda3` where a response is needed.

Important API shape: `querySoda3Rows(input, options)` returns an object with a
`.rows` array, not a bare array.

If you need a `typeof fetch` for compat options, wrap injected test fetchers in
a tiny local adapter in `tools/pipeline-v2/src/lib/soda3.ts`. Keep this adapter
local to pipeline; do not put it back in `@bp/sources`.

Remove unused `exportUrl()` from `PipelineSoda3Client`; no current repo code
calls it.

**Verify**:

```sh
bun test tools/pipeline-v2/test/lib/socrata-monthly-ingest.test.ts --timeout 5000
```

Expected: all tests pass. The fixture should still show paged rows flowing into
the monthly ingest normalizer and snapshot writer.

### Step 3: Migrate all pipeline imports off `@bp/sources/clients/socrata`

Replace every pipeline import from these old subpaths:

```text
@bp/sources/clients/socrata
@bp/sources/clients/socrata/catalog
@bp/sources/clients/socrata/soql
```

Use one of these replacements:

- `tools/pipeline-v2/src/lib/soda3.ts` for project-specific source-manifest
  SODA3 row/export wrappers.
- `@nyc-transit-kit/compat/soda3` for direct Promise query/export/catalog calls.
- `@nyc-transit-kit/soda3/soql` for new parameterized SoQL helpers.
- A tiny pipeline-local helper only when the current command needs the legacy
  `Soda3SoqlQuery` object shape. If you keep such a helper, place it under
  `tools/pipeline-v2/src/lib/`, not under `packages/sources`.

Commands known to import the old subpaths include:

- `tools/pipeline-v2/src/commands/sources/catalog-search.ts`
- `tools/pipeline-v2/src/commands/sources/soda3-range-probe.ts`
- `tools/pipeline-v2/src/commands/ingest/socrata-csv-snapshot.ts`
- `tools/pipeline-v2/src/commands/ingest/socrata-partitioned-csv-snapshot.ts`
- `tools/pipeline-v2/src/commands/ingest/route-schedules-bulk.ts`
- `tools/pipeline-v2/src/commands/ingest/route-segment-speeds.ts`
- `tools/pipeline-v2/src/commands/ingest/route-hourly-ridership.ts`
- `tools/pipeline-v2/src/commands/ingest/route-schedules.ts`
- `tools/pipeline-v2/src/commands/ingest/route-trends.ts`
- `tools/pipeline-v2/src/commands/backfill/route-ridership-trends.ts`
- `tools/pipeline-v2/src/commands/map/artifacts.ts`
- `tools/pipeline-v2/src/commands/studio/release.ts`
- `tools/pipeline-v2/src/commands/studio/_release-types.ts`
- `tools/pipeline-v2/src/commands/studio/_release-geometry.ts`
- `tools/pipeline-v2/src/commands/plan/source-refresh.ts`
- `tools/pipeline-v2/src/lib/http-file-download.ts`
- `tools/pipeline-v2/src/lib/socrata-token.ts`

For `sources:catalog-search`, make an explicit parity decision:

- Preferred: migrate to `searchSoda3Catalog` from
  `@nyc-transit-kit/compat/soda3` and update the command output/tests to the
  narrower toolkit response shape.
- If rich fields such as `postingFrequency`, `timePeriod`, `granularity`, and
  agency are still required, STOP and report that `nyc-transit-kit@0.1.1` needs
  a richer catalog API before this command can be fully migrated. Do not keep a
  hidden copy of `SocrataCatalogClient` under a new name.

For range probes, keep a local `rangeHeader({ start, endInclusive })` string
helper if needed for output, but send the request through
`exportSoda3Response` with `range: { start, end }`.

**Verify**:

```sh
rg -n "@bp/sources/clients/socrata" tools/pipeline-v2/src tools/pipeline-v2/test
bun test tools/pipeline-v2/test/commands/sources/soda3-range-probe.test.ts tools/pipeline-v2/test/commands/sources/catalog-search.test.ts --timeout 5000
bun --filter @bp/pipeline-v2 typecheck
```

Expected: `rg` prints no matches; targeted tests pass; typecheck exits 0.

### Step 4: Remove the public Socrata client surface from `@bp/sources`

Update `packages/sources/package.json`:

- Remove `./clients/socrata`.
- Remove `./clients/socrata/catalog`.
- Remove `./clients/socrata/soql`.

Delete `packages/sources/src/clients/socrata/**` after all imports are gone.
If `packages/sources/src/registry/manifest.ts` still needs a zod dataset-id
schema, move only this tiny validation into `packages/sources/src/core/` or
inline it in the manifest module. Do not keep it in a `clients/socrata` folder.

Update `packages/sources/src/probes/socrata-probe.ts`:

- Use `@nyc-transit-kit/soda3/endpoints` or a small local URL only for metadata
  and columns endpoints that `nyc-transit-kit@0.1.1` does not expose.
- Use `querySoda3Rows`/`exportSoda3Response` for SODA3 row-count/export behavior
  when possible.
- Keep source-probe output shape unchanged unless tests require a deliberate
  migration.

Update or delete `packages/sources/test/socrata-rows.test.ts` and
`packages/sources/test/socrata-catalog.test.ts`:

- If the behavior is now owned by `nyc-transit-kit`, delete duplicated client
  tests from this package.
- Keep only tests for Bus Priority probe/manifest behavior that remains local.

**Verify**:

```sh
rg -n "clients/socrata|createSoda3Client|SocrataCatalogClient|buildSoda3QueryUrl|buildSoda3ExportUrl|buildSoda3SoqlQuery" packages/sources/src packages/sources/test
bun --filter @bp/sources typecheck
bun --filter @bp/sources test
```

Expected: `rg` prints no matches; sources typecheck and tests pass.

### Step 5: Move GTFS-RT protobuf decoding to nyc-transit-kit

Replace the direct local dependency on `gtfs-realtime-bindings`.

Target behavior:

- `packages/sources/src/gtfs-realtime/index.ts` keeps the current normalized
  output schemas and `parseGtfsRealtimeFeed(bytes, options)` API.
- The default decoder no longer imports
  `packages/sources/src/gtfs-realtime/vendor/gtfs-realtime-bindings.ts`.
- The default decoder gets raw decoded `FeedMessage` data from
  `@nyc-transit-kit/mta/gtfs-realtime`.
- Existing injected decoder tests still work for protocol fixtures.
- `gtfs-realtime-bindings` is removed from `packages/sources/package.json`.

Implementation hint:

- `@nyc-transit-kit/mta/gtfs-realtime` exports `decodeGtfsRealtimeBytes`, which
  returns a decoded summary with a `raw` field.
- If you keep `parseGtfsRealtimeFeed` synchronous, call the Effect program with
  `Effect.runSync` inside the default decoder. Use the `feedType` option to map
  local values to toolkit feed kinds:
  - `vehicle_positions` -> `vehicle-positions`
  - `trip_updates` -> `trip-updates`
  - `alerts` -> `alerts`
  - `mixed` or missing -> `vehicle-positions` for decode-only compatibility

Update `packages/sources/test/gtfs-rt.test.ts` so it no longer imports
`gtfs-realtime-bindings` directly. Use small hardcoded fixture bytes or a safe
fixture exported by `nyc-transit-kit` if available.

**Verify**:

```sh
rg -n "gtfs-realtime-bindings" packages/sources/src packages/sources/package.json packages/sources/test
bun test packages/sources/test/gtfs-rt.test.ts --timeout 5000
bun --filter @bp/sources typecheck
```

Expected: `rg` prints no matches; GTFS-RT tests pass; sources typecheck exits 0.

### Step 6: Migrate Studio source-refresh only if Worker bundle checks pass

`packages/studio-api/src/source-refresh.ts` currently constructs its own SODA3
request. Replace that with `querySoda3Rows` from
`@nyc-transit-kit/compat/soda3` only if the Worker/web build remains within
budget.

Target behavior:

- Missing `SOCRATA_APP_TOKEN` behavior stays unchanged.
- Injected `options.fetcher` tests still observe one request to
  `/api/v3/views/kufs-yh3x/query.json`.
- Failure returns the same `status: "failed"` shape.
- Successful rows still flow through `summarizeSpeedRows`.
- No `@bp/sources` import is introduced in `packages/studio-api` or `apps/web`.

If `bun --filter @bp/web build` fails because the Effect/toolkit dependency
enters an unacceptable Worker or client bundle, revert only the
`packages/studio-api` migration and record the blocker in
`knowledge/wiki/engineering/sources_adapter_cutover_plan.md`. Keep the
pipeline/source package migration; do not undo it.

**Verify**:

```sh
bun test packages/studio-api/test/source-refresh.test.ts --timeout 5000
bun --filter @bp/studio-api typecheck
bun --filter @bp/web build
```

Expected: tests and typecheck pass. The web build exits 0 with no bundle-budget
failure.

### Step 7: Tighten architecture gates

Update `tests/harness/production-boundaries.test.ts` so future changes do not
recreate the deleted client.

Add or update checks for:

- `packages/sources/package.json` must not export any `./clients/socrata*`
  subpath.
- Repo code must not import `@bp/sources/clients/socrata`,
  `@bp/sources/clients/socrata/catalog`, or
  `@bp/sources/clients/socrata/soql`.
- `packages/sources/src` must not import `gtfs-realtime-bindings`.
- Browser-facing `apps/web/src` modules outside `apps/web/src/worker/**` must
  not import `@nyc-transit-kit/*`.
- `apps/web/src` and `packages/studio-api/src` must still have zero
  `@bp/sources` imports.

**Verify**:

```sh
bun run check:web-architecture
```

Expected: exits 0.

### Step 8: Update durable docs

Update `knowledge/wiki/engineering/sources_adapter_cutover_plan.md` with a
short "nyc-transit-kit consumer cutover" section:

- The public toolkit exists and is the source for generic SODA3/MTA/DOT client
  behavior.
- `@bp/sources` remains internal and owns manifest parsing, Bus Priority
  normalizers, probes, and project-specific DTOs.
- `@bp/sources` must not expose Socrata client subpaths.
- Catalog-search rich metadata is either migrated, explicitly narrowed, or
  blocked pending upstream support.
- Worker source-refresh either migrated or intentionally remains direct because
  the Worker bundle check blocked Effect/toolkit import.

Append one concise entry to `knowledge/log.md` with the date, files changed, and
verification commands run. Do not include secret values or environment contents.

**Verify**:

```sh
bun run check:knowledge
```

Expected: exits 0.

## Test plan

Update existing tests rather than adding broad new suites:

- `packages/sources/test/source-probes.test.ts`: source-probe behavior still
  returns SODA3 metadata, columns, export URL, and row-count fields where local
  probe logic owns them.
- `packages/sources/test/gtfs-rt.test.ts`: current vehicle-position,
  trip-update, alert, route-id normalization, and injected-decoder cases still
  pass without direct `gtfs-realtime-bindings`.
- `tools/pipeline-v2/test/lib/socrata-monthly-ingest.test.ts`: the pipeline
  wrapper still accepts injected fetchers and produces the same rows/snapshot.
- `tools/pipeline-v2/test/commands/sources/soda3-range-probe.test.ts`: range
  request uses `exportSoda3Response`, preserves range output, and remains dry-run
  by default.
- `tools/pipeline-v2/test/commands/sources/catalog-search.test.ts`: update to
  either the toolkit's narrower output or a STOP-documented blocker.
- `packages/studio-api/test/source-refresh.test.ts`: if migrated, route-speed
  watcher still builds the same SODA3 endpoint and skips when token/bindings are
  missing.
- `tests/harness/production-boundaries.test.ts`: regression gates for deleted
  subpaths and forbidden browser imports.

## Done criteria

All must hold:

- [ ] `bun pm view @nyc-transit-kit/soda3 version` prints `0.1.1`.
- [ ] Root `package.json` catalog pins the `@nyc-transit-kit/*` packages used by
      this repo to `0.1.1`.
- [ ] `packages/sources/package.json` has no `./clients/socrata*` exports.
- [ ] `packages/sources/package.json` no longer depends on
      `gtfs-realtime-bindings`.
- [ ] `rg -n "@bp/sources/clients/socrata" packages tools tests apps` prints no
      matches.
- [ ] `rg -n "createSoda3Client|SocrataCatalogClient|buildSoda3QueryUrl|buildSoda3ExportUrl|buildSoda3SoqlQuery" packages/sources/src tools/pipeline-v2/src packages/studio-api/src` prints no matches.
- [ ] `rg -n "gtfs-realtime-bindings" packages/sources/src packages/sources/package.json` prints no matches.
- [ ] `bun --filter @bp/sources typecheck` exits 0.
- [ ] `bun --filter @bp/sources test` exits 0.
- [ ] `bun --filter @bp/pipeline-v2 typecheck` exits 0.
- [ ] Targeted pipeline tests in "Commands you will need" pass.
- [ ] `bun test packages/studio-api/test/source-refresh.test.ts --timeout 5000`
      passes, whether source-refresh migrated or was documented as blocked.
- [ ] `bun run check:web-architecture` exits 0.
- [ ] `bun --filter @bp/web build` exits 0 if `packages/studio-api` imports
      `@nyc-transit-kit/compat`.
- [ ] `knowledge/wiki/engineering/sources_adapter_cutover_plan.md` and
      `knowledge/log.md` record the cutover and any intentional remaining
      direct-provider code.
- [ ] `plans/README.md` status row for Plan 014 is updated.

## STOP conditions

Stop and report back if:

- `bun pm view` cannot find `@nyc-transit-kit/*@0.1.1` packages.
- The installed package API differs from the verified `0.1.1` API above, such
  as `querySoda3Rows` not returning an object with `.rows`.
- `sources:catalog-search` still requires rich catalog metadata that
  `nyc-transit-kit@0.1.1` cannot return. Do not rebuild the old
  `SocrataCatalogClient` under a new name.
- Migrating `packages/studio-api/src/source-refresh.ts` causes
  `bun --filter @bp/web build` to fail due to bundle size or Worker build
  incompatibility.
- The change appears to require importing `@nyc-transit-kit/*` into
  browser-facing app code outside `apps/web/src/worker/**`.
- The change appears to require changing source manifest shape, analytics
  outputs, D1 schema, public API response contracts, or route-score behavior.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

- Treat `nyc-transit-kit` as the provider-client owner. When a future provider
  transport feature is missing here, prefer adding it upstream instead of
  reintroducing a local generic client.
- Keep `@bp/sources` valuable by limiting it to Bus Priority source manifests,
  product-specific row normalization, source probes, and DTO contracts.
- Watch Effect 4 beta upgrades. `nyc-transit-kit@0.1.1` depends on
  `effect@4.0.0-beta.83`; if the toolkit bumps Effect, update this repo through
  a deliberate dependency PR with sources/pipeline/studio typechecks.
- Reviewers should scrutinize bundle effects, especially any import path that
  can reach browser-facing `apps/web/src` modules.

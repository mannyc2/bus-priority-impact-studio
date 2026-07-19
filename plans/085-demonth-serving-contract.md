# Plan 085: De-month the public serving contract — releaseId + publishedAt + coverage replace baselineMonth

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` (Generation 11 table).
>
> **Drift check (run first)**:
> `git diff --stat 27755f4..HEAD -- packages/domain/src/routes packages/domain/src/studio/routes packages/domain/src/studio/projections.ts packages/domain/src/studio/snapshots.ts packages/domain/src/studio/route-capability.ts packages/domain/src/studio/route-dossier.ts packages/domain/src/studio/field-provenance.ts packages/domain/src/studio/shared.ts packages/domain/test packages/db/src/d1/index.ts packages/db/src/d1/queries/route-observed-reliability.ts packages/db/src/d1/queries/studio-route-index.ts packages/db/test/studio-route-index.test.ts packages/studio-api/src packages/studio-api/test packages/analytics/src/evaluation/build-route-capability-manifest.ts packages/analytics/src/evaluation/build-route-dossier-summary.ts packages/analytics/test tools/pipeline-v2/src/checks/check-publish-completeness.ts tools/pipeline-v2/src/commands/export/d1.ts tools/pipeline-v2/src/commands/export/route-capability-manifest.ts tools/pipeline-v2/src/commands/export/route-dossier-summaries.ts tools/pipeline-v2/src/commands/studio/build-mta-wiki-route-fixture.ts tools/pipeline-v2/test/commands/export tools/pipeline-v2/test/studio-mta-wiki-route-fixture.test.ts apps/web/src apps/web/test apps/web/wrangler.jsonc apps/web/README.md tests/harness/month-doctrine-allowlist.ts`
> Plans 079-081 (amended) and gen-10 plan 082 intentionally touch several of
> these files (public-api.ts, api-client.ts, web tests, the Overview trend
> chart); their completed behavior supersedes the excerpts below and must be
> preserved. On any OTHER mismatch with the "Current state" excerpts, treat
> it as a STOP condition.

> **Amendment (2026-07-19 — plan-088 ownership audit, binding).** The Scope
> list originally omitted seven serving-contract companion groups that its own
> steps require. They are now explicitly in scope: the shared quality and
> dossier domain schemas, dossier builder, D1 query/barrel surface, and the
> MTA-wiki route-fixture producer. These are contract migration edits, not
> permission to change D1 table grain. Remove only `retire-085` file/rule
> pairs from `tests/harness/month-doctrine-allowlist.ts` as their matches
> disappear. In the shared `export/d1.ts`, this plan owns the two scoped
> `releaseMonth` matches in capability/dossier call arguments; Plan 086 owns
> its two `analysisPeriod` matches. In
> `commands/export/route-capability-manifest.ts`, this plan owns only the
> active `RouteCapabilityInputRow` construction and
> `buildRouteCapabilityManifest` call. It must not change the frozen
> detector-readiness schema/read comparison; that remainder is Plan 086.
> Plan 079 also hands this plan two exact staged
> `retired-identity-token` remainders: the non-map portion of
> `packages/studio-api/src/public-api.ts` and the routes/detail portion of
> `packages/domain/src/studio/projections.ts`. Their entries arrive as
> `retire-085` with recomputed counts. Remove the public API remainder; for
> projections, remove the retired response keys but reassign the exact four
> temporary legacy-payload reads to `retire-086`. The separate
> `public-month-selector` entry remains `retire-085` throughout.
> Plan 079 likewise hands off only the exact Studio-routes comparison in
> `checks/check-publish-completeness.ts`; migrate it to coverage and remove its
> `retire-085` remainder without revisiting the landed map checks.
>
> Release identity is the full ADR-0022 triple: `releaseId`, `publishedAt`,
> and `coverage`. Import and reuse Plan 079's canonical
> `releaseIdFromPublishedAt` helper everywhere this plan creates an identity;
> never use request time, a projection prefix, a month, or a second local
> formatter. Replace `releaseIdForPrefix` on release-bearing Studio responses.
> For D1-backed serving, resolve the selected batch's stored `generatedAt` as
> `publishedAt`, derive `releaseId` from it once, and fail closed if that
> certified batch metadata is missing. Capability and dossier artifacts and
> their readers carry the same triple.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED (public contract change; no external clients are known — see
  STOP conditions — and the repo's own SPA + tests are migrated in the same
  slice)
- **Depends on**: `plans/084-retire-month-anchors-doctrine.md` (vocabulary),
  `plans/088-month-doctrine-gate.md` (shrink-only ownership ratchet),
  `plans/079-truthful-map-contracts.md` **as amended** (hard — both edit
  `public-api.ts`, `api-client.ts`, and the map response schemas; 079 owns the
  network-map bundle contract), plus completed Plans 080 and 081 (hard — their
  remaining map/UI work shares the same client and tests). Serialize with
  gen-10 Plan 082 because it shares Overview trend-chart/test files.
- **Category**: tech-debt
- **Planned at**: commit `27755f4`, 2026-07-12

## Why this matters

The public serving path still treats one calendar month as the product's
identity. `apps/web/wrangler.jsonc` pins `BASELINE_MONTH: "2026-03"` and
`LAST_BUILT_SPEED_MONTH: "2026-03"` at deploy time (it is July 2026); five v1
endpoints resolve "which product" from `?month=` / that env var; the status
endpoint serves a field literally named `canonicalMonthlyRelease`; every
studio response carries `baselineMonth` as its release anchor; and the
capability manifest defines freshness as lag *relative to the release month it
was built against* — so data can only ever look as stale as the release,
never as stale as it actually is. ADR-0022 (plan 084) retires all of this:
release identity becomes `releaseId` + `publishedAt` + per-dataset `coverage
{start, end}`,
serving always floats to the latest published data, and freshness is computed
against **now** at read time. This plan executes that contract change across
domain schemas, the Worker read paths, the web client, and their tests — in
one slice, old shape deleted, per the repo's established hard-cutover rule
("schema + handler + UI migrate together, in place; no additive v2 endpoints,
no compatibility shims").

## Current state

Serving-month resolution today has three inconsistent regimes:

1. **Studio path floats on D1** — `packages/studio-api/src/studio/read-handlers.ts:345-362`:
   ```ts
   /**
    * The single internal serving-month resolver (hard-cutover C3). Public responses
    * derive their months from D1 data — the latest brief-summary month and the latest
    * speed-trend month — never from env. `env.BASELINE_MONTH` survives only as
    * pipeline/provenance metadata.
    */
   type ResolvedServingMonths = { servingMonth: string; latestSpeedMonth: string | null };
   async function resolveServingMonths(env: StudioReadEnv): Promise<ResolvedServingMonths | null> {
     ...
     const [servingMonth, latestSpeedMonth] = await Promise.all([
       findLatestStudioServingMonth(db),
       findLatestSpeedTrendMonth(db),
     ]);
   ```
   (`findLatestStudioServingMonth` / `findLatestSpeedTrendMonth` are defined at
   `packages/db/src/d1/queries/studio-route-index.ts:439` and `:450`.)
   The mechanics are right; the CONTRACT still speaks months: responses set
   `baselineMonth: months.servingMonth` (read-handlers.ts:390, :404, :902,
   :1015; also `:1093`, `:1144` via `servingMonth`), and the route-index v2
   response (read-handlers.ts:398-416) emits
   `releaseLayer: "baseline_release"` and
   `completenessStatus: "partial_public_monthly_only"`. A field named
   `releaseId` already exists, but it is derived from
   `releaseIdForPrefix(studioProjectionPrefix(env))` rather than a publication
   timestamp. It is legacy identity debt, not a compliant hook to preserve.

2. **v1 public API pins to env** — `packages/studio-api/src/public-api.ts:80-88`:
   ```ts
   function releaseStatusMonth(url: URL, env: StudioApiEnv): string | null {
     const month = url.searchParams.get("month") ?? env.BASELINE_MONTH ?? null;
   ```
   Five endpoints call it and 400 with `"Query parameter month or
   BASELINE_MONTH must use YYYY-MM format."` (public-api.ts:227, :356, :424,
   :541, :692). The status response (public-api.ts:268-298) serves
   `baselineMonth: month` and `canonicalMonthlyRelease: { month, status,
   routeCount, artifactCount, issueCount }` (:272-280), with
   `releaseLayer: "observed_release" | "baseline_release"` (:291) and
   `completenessStatus: "complete" | "partial_public_monthly_only"` (:292-293).
   `publishedAt` material already exists: `generatedAt: batchStatus.generatedAt`
   (:271) comes from the D1 batch-status row. Other `baselineMonth: month`
   sites: :391, :470, :582, :739. The map-manifest endpoint
   (public-api.ts:534-544) resolves the R2 key `map/${month}/manifest.json`
   from the same function — **plan 079 (amended) reworks that endpoint**; do
   not double-edit it here beyond removing the env fallback it consumes.
   Current-signal caveat copy at :328/:333: "Public monthly speed data is not
   yet available for this month; reliability evidence stands alone."

3. **Worker status/source-refresh math pins to env** —
   `packages/studio-api/src/source-refresh.ts` reads
   `env.LAST_BUILT_SPEED_MONTH` at :11, :353, :366, :407, :416, :465;
   read-handlers.ts:1787 emits "LAST_BUILT_SPEED_MONTH is not configured in
   the serving environment." Env plumbing: `packages/studio-api/src/env.ts:7-8`
   declares both vars; `apps/web/wrangler.jsonc:35-36` pins both to
   `"2026-03"`.

Domain schema sites (all verified; this is the sweep list):

- `packages/domain/src/routes/index.ts` — `baselineMonth: IsoMonthSchema` at
  :103 (release status), :197 (route list), :235 (route profile), :342 and
  :362 (hotspot responses). All five are this plan's serving contracts; there
  is no map-manifest schema in this file.
- `packages/domain/src/studio/routes/index.ts` — `baselineMonth:
  Schema.String.check(isPattern(/^\d{4}-\d{2}$/))` at :263 (routes response),
  :383 (route detail), :625 (route sections).
- `packages/domain/src/studio/snapshots.ts` — :67 (index row), :103 (index
  response), :114 (snapshot 2), :153 (`NullOr` on snapshot response). Reusable
  window pattern already present: `StudioSnapshot2ProjectionRefSchema.months
  {start, end}` (snapshots.ts:57-62).
- `packages/domain/src/studio/route-capability.ts` — manifest schema carries
  `releaseMonth: MonthSchema` (:110); freshness doc at :40 reads "Freshness of
  a surface's data relative to the release month it was built against";
  `freshnessForDataAsOf(dataAsOf, referenceMonth)` (:57-71) with
  `RECENT_DATA_AS_OF_WINDOW_MONTHS = 3` (:50). Builder:
  `packages/analytics/src/evaluation/build-route-capability-manifest.ts`
  (calls `freshnessForDataAsOf(input.dataAsOf, releaseMonth)`); pipeline entry
  `tools/pipeline-v2/src/commands/export/d1.ts:269-275` passes
  `releaseMonth: month`.
- Read-handler-local dossier/artifact schemas: `read-handlers.ts:251`
  (`releaseMonth: Schema.String`), `:271` (`releaseMonth: NullOr(String)`);
  dossier builder `tools/pipeline-v2/src/commands/export/route-dossier-summaries.ts`
  (called with `releaseMonth: month` from export/d1.ts:276-281).
- Caveat/copy strings: `packages/studio-api/src/studio/route-index-read-model.ts:178`
  ("No rich route summary is available for the baseline month."), `:396`
  (`const month = row.summary === null ? "the baseline month" : "the baseline
  serving export"`); field `baselineMonth` at :297/:306.
  `packages/domain/src/studio/field-provenance.ts:58` ("Observed monthly route
  speed in the generated release month.") and :211 ("Observed segment speed
  for the release month.").
- Web: `apps/web/test/worker/public-routes.worker.test.ts:328` expects
  `status.baselineMonth`; ~13 shared-test files pin `baselineMonth`/
  `releaseMonth` fixtures (api-client, overview-section, rider-impact-summary,
  route-archetype, route-map-highlight, route-detail-header, riders-section,
  interventions-page, where-when-summary, riders-section-equity,
  route-performance-summary, treatments-history, reliability-summary — find
  the exact set with `rg -l 'baselineMonth|releaseMonth' apps/web/test`).
  `apps/web/src/components/route/data-quality-labels.ts` maps the
  `releaseLayer`/`completenessStatus` enums. The network-map bundle join in
  `apps/web/src/studio/api-client.ts:571-628` gates on
  `routeFacts.data.baselineMonth !== manifest.baselineMonth`
  (`factsStatus: "baseline_mismatch"`) — **owned by amended 079**; after 079
  it gates on same-release coverage instead. Touch it here only if 079's
  landed shape still exposes a `baselineMonth` name (then it drifted from its
  amendment — STOP).

What is NOT in scope (months as grain — keep): D1 tables keyed
`(routeId, month)` are time-series partitions; `dataAsOf` fields;
`currentSignalMonth`; chart copy like "Monthly ridership"
(apps/web/src/components/route/RidersSection.tsx:101) — that names the
source's monthly grain, not a baseline; insight `asOfMonth`/`month`
coordinates; `StudioRouteHistoryCoverageSchema.startMonth/endMonth` (that IS
the target pattern); the real month AXIS gen-10 plan 082 adds to the Overview
trend chart.

Vocabulary (from ADR-0022, plan 084): `baselineMonth` → `releaseId` +
`publishedAt` + `coverage: { start: IsoMonth | null, end: IsoMonth }` on
release-bearing contracts; `canonicalMonthlyRelease` → `release`;
`"baseline_release"` → `"published_release"`;
`"partial_public_monthly_only"` → `"partial_public_speed_only"`; env vars
deleted.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck (per package) | `bun --filter @bp/domain typecheck` (repeat for `@bp/studio-api`, `@bp/analytics`, `@bp/db`, `@bp/web`, `@bp/pipeline-v2`) | exit 0 |
| Domain tests | `bun --filter @bp/domain test` | pass |
| DB tests | `bun --filter @bp/db test` | pass |
| Studio-api tests | `bun --filter @bp/studio-api test` | pass |
| Analytics tests | `bun --filter @bp/analytics test` | pass |
| Pipeline export tests | `bun --filter @bp/pipeline-v2 test` | pass |
| Web tests | `bun run test:web` | pass |
| Worker tests | `bun run test:worker` | pass |
| Web build + budget | `bun --filter @bp/web build` | exit 0, budget green |
| Architecture gates | `bun run check:web-architecture && bun run check:design-doctrine` | exit 0 |
| Full pre-push gate (final) | `bun run check:prepush` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `packages/domain/src/routes/index.ts`, `src/studio/routes/index.ts`,
  `src/studio/projections.ts`, `src/studio/snapshots.ts`,
  `src/studio/route-capability.ts`,
  `src/studio/route-dossier.ts`, `src/studio/field-provenance.ts`,
  `src/studio/shared.ts`, `packages/domain/test/**` (fixtures)
- `packages/db/src/d1/queries/route-observed-reliability.ts`,
  `packages/db/src/d1/queries/studio-route-index.ts`, and
  `packages/db/src/d1/index.ts` (query rename plus latest-published-release
  and earliest-month exports only; no schema or migration edits), plus
  `packages/db/test/studio-route-index.test.ts`
- `packages/studio-api/src/public-api.ts`, `src/studio/read-handlers.ts`,
  `src/studio/route-index-read-model.ts`, `src/source-refresh.ts`,
  `src/env.ts`, `packages/studio-api/test/**`
- `packages/analytics/src/evaluation/build-route-capability-manifest.ts` and
  `packages/analytics/src/evaluation/build-route-dossier-summary.ts` + their
  tests (schemas + builders migrate together)
- `tools/pipeline-v2/src/commands/export/d1.ts` — ONLY the
  `buildAndWriteRouteCapabilityManifest` / `buildAndWriteRouteDossierSummaries`
  call arguments (lines ~269-281) and
  `tools/pipeline-v2/src/commands/export/route-dossier-summaries.ts`; plus
  their fixture tests under `tools/pipeline-v2/test/commands/export/`
- `tools/pipeline-v2/src/commands/export/route-capability-manifest.ts` — ONLY
  the active capability-row construction and builder input/call; the frozen
  detector-readiness schema/read branch remains Plan 086 scope
- `tools/pipeline-v2/src/commands/studio/build-mta-wiki-route-fixture.ts`
  and `tools/pipeline-v2/test/studio-mta-wiki-route-fixture.test.ts` (migrate
  the served-response fixture shape only)
- `tools/pipeline-v2/src/checks/check-publish-completeness.ts` and its focused
  test, only for the exact Studio-routes comparison handed off by Plan 079
- `apps/web/src/**` (api-client studio types/parsers, data-quality-labels,
  any component reading the removed fields), `apps/web/test/**`,
  `apps/web/wrangler.jsonc`, `apps/web/README.md`
- `knowledge/wiki/engineering/web_api_endpoint_architecture.md` (full rewrite
  of the month-anchored contract/caching material — replaces plan 084's dated
  note), `knowledge/wiki/engineering/data_pipeline_operationalization_status.md`
  (dated addendum), `knowledge/log.md` (append)
- `tests/harness/month-doctrine-allowlist.ts` (remove only `retire-085`
  entries whose production matches this plan removes)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):
- `packages/domain/src/maps/index.ts` and the network-map bundle join in
  `api-client.ts` — plan 079 (amended) owns the map contracts.
- `packages/domain/src/studio/release.ts` (`baselineMonth` at :62) and
  `tools/pipeline-v2/src/commands/studio/release.ts` — the static release
  payload and its builder migrate in plan 086 with artifact regeneration.
- `data/**` — never regenerate or edit artifacts; where a served static
  artifact still carries old field names, the read path must decode the NEW
  shape only after 086 republished (see STOP conditions).
- D1 schema files under `packages/db/migrations/**` — no schema migration is
  needed; month-keyed tables are grain partitions and stay.
- `tools/pipeline-v2/src/commands/publish/**` and pipeline-identity audits are
  Plan 086. In `checks/check-publish-completeness.ts`, Plan 079 owns the map
  comparisons and hands this plan only the exact Studio-routes comparison;
  do not change any other gate here.
- The Overview trend chart files gen-10 plan 082 owns (markers/month axis) —
  update only their FIXTURES if the contract fields they consume change.

## Git workflow

- Branch: `advisor/085-demonth-serving-contract`.
- Commit per step; imperative messages (e.g. "Replace baselineMonth with
  coverage window in studio responses").
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Confirm sequencing and consumer assumptions

- Confirm plans 079 (amended), 080, 081 rows are DONE in `plans/README.md`;
  if not, STOP (this plan rebases their files otherwise). Note gen-10 plan
  082's status: if IN PROGRESS, serialize (its Overview chart work shares
  test files with this sweep).
- Inventory public selector code with
  `rg -n 'searchParams\.get\("month"\)|[?&]month=' packages/studio-api/src apps/web/src`.
  At the planned snapshot, the only production selector hits are the shared
  latest-serving resolver and the historical route-scorecard selector in
  `public-api.ts`; any additional production consumer is a STOP. Separately
  inventory in-scope tests/docs with
  `rg -n '\?month=' packages/studio-api/test apps/web/test apps/web/README.md knowledge/wiki/engineering/web_api_endpoint_architecture.md` and migrate the
  applicable fixtures/copy. Historical `knowledge/log.md` entries are records,
  not consumers and not a STOP.

**Verify**: both checks as stated.

### Step 1: Domain — replace month identity with the release triple

In `packages/domain/src/routes/index.ts` and
`packages/domain/src/studio/routes/index.ts` and
`packages/domain/src/studio/snapshots.ts`:

1. Import and reuse the canonical schema and helper Plan 079 landed in
   `packages/domain/src/studio/shared.ts`:
   ```ts
   export const CoverageWindowSchema = Schema.Struct({
     start: Schema.NullOr(IsoMonthSchema), // null when unknown/heterogeneous
     end: IsoMonthSchema,                  // latest covered month
   });
   ```
   Also import `releaseIdFromPublishedAt`; do not redefine either export.
   Match the existing schema import idiom and keep the shared module
   dependency-cycle-free.
2. Replace every `baselineMonth` field in scope with the release triple:
   `releaseId: Schema.String`, `publishedAt: Schema.String`, and `coverage:
   CoverageWindowSchema` (sites: routes/index.ts :103, :197, :235, :342,
   :362; studio/routes/index.ts :263, :383, :625; snapshots.ts :67, :103,
   :114, :153). Where a schema already has `releaseId`, retain one field and
   replace its prefix-derived producer in Step 3; add `publishedAt` and
   `coverage`. For the nullable snapshot site, use one nullable nested release
   struct containing all three fields so partial identity cannot decode.
3. In `routes/index.ts` release-status schema, rename the
   `canonicalMonthlyRelease` struct to `release` and its `month` member to
   the full `{ releaseId, publishedAt, coverage }` triple (publishedAt comes
   from batch status `generatedAt`). Any top-level identity fields on the
   response must equal the nested release values; test the invariant.
4. Rename enum literals wherever defined in domain:
   `"baseline_release"` → `"published_release"`,
   `"partial_public_monthly_only"` → `"partial_public_speed_only"`.
5. `route-capability.ts`: bump `schemaVersion: Schema.Literal(2)`; replace
   `releaseMonth: MonthSchema` with `releaseId: Schema.String`, `publishedAt:
   Schema.String`, and `coverage: CoverageWindowSchema`; rewrite the :40 doc comment ("Freshness
   of a surface's data relative to the reference date it is evaluated
   against"); change `freshnessForDataAsOf(dataAsOf, referenceMonth)` to
   accept `referenceMonth: string` derived by callers from a DATE (add a
   sibling helper `freshnessReferenceMonth(nowIso: string): string`), keep the
   3-month window; update `RouteCapabilityManifestForIndexSchema` to
   `schemaVersion: Literal(2)`.
6. `route-dossier.ts`: bump the affected manifest/summary schema versions and
   replace both `releaseMonth` identity members with the full
   `releaseId`/`publishedAt`/coverage triple; keep month-valued evidence fields
   that describe source grain.
7. `field-provenance.ts` :58/:211 — rewrite the two notes without release-month
   framing (e.g. "Observed monthly route speed for the latest covered month.").
8. In `packages/domain/src/studio/projections.ts`, migrate the two routes/detail
   projection builders handed off by Plan 079 to emit the full release triple
   matching their new schemas. For this transitional internal builder only,
   use `release.generatedAt` as `publishedAt`, derive `releaseId` through the
   shared helper, and derive both coverage endpoints from the still-legacy
   `release.baselineMonth`; this changes each output key but intentionally
   leaves four exact compatibility reads until Plan 086 migrates the payload.
   Reassign the unchanged exact count from `retire-085` to `retire-086` in the
   same change; do not make it permanent or restore a month-named response key.
9. Update domain fixtures/tests (`package-shape.test.ts:112`,
   `studio-route-insights.test.ts:324`, capability tests) to the new fields.

**Verify**: `bun --filter @bp/domain typecheck && bun --filter @bp/domain test`
→ pass; `rg -n 'baselineMonth|releaseMonth' packages/domain/src --glob '!packages/domain/src/maps/**' --glob '!packages/domain/src/studio/release.ts' --glob '!packages/domain/src/studio/projections.ts'` → 0 hits, and the projections file has exactly the four ratcheted compatibility reads assigned to `retire-086`.

### Step 2: Capability/dossier builders follow their schemas

- `packages/analytics/src/evaluation/build-route-capability-manifest.ts`:
  accept `{ releaseId, publishedAt, coverage }` instead of `releaseMonth`;
  validate `releaseId === releaseIdFromPublishedAt(publishedAt)`; compute stored
  freshness with `freshnessForDataAsOf(dataAsOf,
  freshnessReferenceMonth(publishedAt))`; rename
  `RouteCapabilityInputRow.baselineMonth` to `conditionDataAsOf` (the summary
  row's month is grain, not identity); update its tests.
- `tools/pipeline-v2/src/commands/export/d1.ts` lines ~265-281: pass
  one `releaseId: releaseIdFromPublishedAt(generatedAt)`,
  `publishedAt: generatedAt`, and `coverage: { start: <min month from d1Inputs
  route-month trend rows, or null>, end: month }` to both builders.
  Derive `start` with a small pure helper over the already-loaded
  `d1Inputs` — no new DB query.
- `tools/pipeline-v2/src/commands/export/route-dossier-summaries.ts`: replace
   its `releaseMonth` manifest field with the same release triple; update read-handler local
   schemas in Step 3 to match; update fixture tests under
   `tools/pipeline-v2/test/commands/export/`.
- `packages/analytics/src/evaluation/build-route-dossier-summary.ts`: replace
  the builder input/output `releaseMonth` members with the release triple,
  update schema-version assertions, and migrate its focused tests. The export
  command above must pass the same values; schema and producer land together.
- In `tools/pipeline-v2/src/commands/export/route-capability-manifest.ts`,
  update only the active adapter/builder half: emit `conditionDataAsOf` where
  it currently emits `baselineMonth` (around :216), and pass
  `releaseId`/`publishedAt`/`coverage` where `buildAndWriteRouteCapabilityManifest`
  currently accepts/passes `releaseMonth` (around :250-256). Do not edit the
  frozen `DetectorReadinessRouteSummariesSchema` or its equality check around
  :40/:69-76; Plan 086 owns their semantics.
- Atomically update the ratchet for that shared file: delete its
  `retired-identity-token` / `retire-085` entry; shrink its
  `release-month-identity` count to the exact frozen-reader remainder and
  change that entry's disposition from `retire-085` to `retire-086`. A count
  that includes any active builder match is a STOP, not a compatibility
  reason.

**Verify**: `bun --filter @bp/analytics test && bun --filter @bp/pipeline-v2 test` → pass.

### Step 3: studio-api read handlers and read models

In `packages/studio-api/src/studio/read-handlers.ts`:

- In `packages/db/src/d1/queries/route-observed-reliability.ts`, rename
  `findLatestNonBaselineObservedMonth(db, baselineMonth)` to
  `findLatestObservedMonthExcluding(db, excludedMonth)`; update the D1 barrel,
  `public-api.ts` caller, and focused tests atomically. The query still finds
  the newest observed evidence outside the selected coverage end; only the
  identity-laden name changes.
- Rewrite the `BASELINE_MONTH` / `LAST_BUILT_SPEED_MONTH` comments in
  `packages/db/src/d1/queries/studio-route-index.ts` to describe D1-derived
  latest serving/covered months without preserving retired env vocabulary.

1. Replace the month-only resolver with `resolveServingRelease(env)` returning
   `{ releaseId, publishedAt, coverage: { start, end }, latestSpeedMonth }`.
   Add `findLatestPublishedStudioServingRelease(db)` next to the existing D1
   queries: it returns the latest `pass` route-batch row that has serving data,
   with `end` and its stored `generatedAt` as `publishedAt`, or null. Derive
   `releaseId` only with Plan 079's helper. `start` comes from a new single-row
   `findEarliestSpeedTrendMonth(db)` query added next to
   `findLatestSpeedTrendMonth` (`packages/db/src/d1/queries/studio-route-index.ts:450`
   is the exemplar — copy its shape with `min(month)`). Export both through
   `packages/db/src/d1/index.ts`. Missing/non-pass batch metadata returns the
   existing 503 rather than manufacturing identity from request time or the
   R2 prefix. Keep the internal single-month query
   arguments (`listNormalizedStudioRouteIndexSourceRows(db, coverage.end)`)
   — the latest covered month remains the row-selection grain.
2. Replace every `baselineMonth: months.servingMonth` response assignment
   (:390, :404, :902, :1015 and the detail path around :1093-:1144) with
   the resolver's exact `releaseId`/`publishedAt`/coverage triple per the Step
   1 schemas; keep `dataAsOf`. Delete `releaseIdForPrefix` once no
   release-bearing response uses it.
3. Update the local dossier/artifact schemas (:251, :271) to the Step 2
   builder output (the release triple instead of `releaseMonth`).
4. Recompute capability freshness at read time: where the capability manifest
   joins the index (`loadRouteCapabilityManifest` → `routeCapabilityByRouteId`
   around :382-395), map each surface's `freshness` to
   `freshnessForDataAsOf(surface.dataAsOf, freshnessReferenceMonth(new
   Date().toISOString()))` so served staleness reflects NOW, not build time.
5. Rewrite the quality block (:407-415): `releaseLayer:
   "published_release"`, `completenessStatus` renamed literal.
6. `route-index-read-model.ts`: fields :297/:306 → coverage; caveat strings
   :178/:396 → coverage phrasing ("No rich route summary is available for the
   latest covered month." / "the latest covered month" | "the baseline serving
   export" → "the serving export").
7. read-handlers.ts:1787 and `source-refresh.ts` (:11, :353-:465): delete all
   `env.LAST_BUILT_SPEED_MONTH` reads; last-built month :=
   `findLatestSpeedTrendMonth(db)` (already imported in read-handlers); update
   `env.ts` (:7-8) removing both optional vars; update the "not configured"
   error string to a "no published speed data in D1" 503.
8. Update `packages/studio-api/test/api-facade.test.ts` (~15 fixture sites),
   `http-routing.test.ts:167`, `source-refresh.test.ts` to the new contract.

Also migrate
`tools/pipeline-v2/src/commands/studio/build-mta-wiki-route-fixture.ts` so its
served-response fixture emits coverage instead of `baselineMonth`; update the
focused fixture test. It is a response-shape companion, not a static release
payload migration.

Finally, update only the remaining Studio-routes comparison in
`checks/check-publish-completeness.ts` to validate the projection coverage
against the selected partition. Delete its exact handed-off `retire-085` pair;
preserve Plan 079's landed map checks and all unrelated publication gates.

**Verify**: `bun --filter @bp/db test && bun --filter @bp/studio-api typecheck && bun --filter @bp/studio-api test && bun test tools/pipeline-v2/test/studio-mta-wiki-route-fixture.test.ts tools/pipeline-v2/test/checks/publish-completeness.test.ts --timeout 5000` → pass.

### Step 4: v1 public API — serve latest published, delete month selection

In `packages/studio-api/src/public-api.ts`:

1. Delete `releaseStatusMonth` (:80-88). After Plan 079 has moved the map
   endpoint to its v2 map-release catalog, each of the four remaining callers
   uses the same `findLatestPublishedStudioServingRelease` query and
   `releaseIdFromPublishedAt` helper as Step 3, yielding one
   `{ releaseId, publishedAt, coverage }` value; 503 `"No published serving
   data is available."` when null. The
   `?month=` query parameter is REMOVED (breaking by design; Step 0 confirmed
   no consumers). Keep each endpoint's downstream single-month queries
   unchanged — `coverage.end` is now the latest covered month and remains a
   grain argument.
2. Status response (:268-298): emit the exact release triple and `release: {
   releaseId, publishedAt, status, routeCount, artifactCount, issueCount,
   coverage }` (replacing `canonicalMonthlyRelease` and top-level
   `baselineMonth`); assert any top-level identity fields equal the nested
   values. Rename `releaseLayer`/`completenessStatus`; keep
   `currentSignalMonth` and the observed-evidence block as-is.
3. Other `baselineMonth: month` sites (:391, :470, :739) → the exact release
   triple. The map
   handler around former :582 already uses Plan 079's fail-closed v2 map
   catalog; remove only any residual env fallback and preserve that resolver.
4. Error copy: the four remaining `"Query parameter month or BASELINE_MONTH must use
   YYYY-MM format."` sites disappear with the resolver; the current-signal
   caveats (:328/:333) become "The monthly public speed dataset has not
   published this month yet; reliability evidence stands alone." (grain-true
   phrasing).
5. The route-scorecard endpoint is a historical grain query, not product
   selection. Rename its required `?month=` parameter to `?asOfMonth=`, update
   the validation error, API docs, and worker/Studio API tests, and keep the
   downstream D1 month query unchanged. Both current selector matches in this
   file must disappear, but this legal explicit history selector remains.
6. `apps/web/wrangler.jsonc:35-36`: delete both vars.

**Verify**: `bun --filter @bp/studio-api test && bun run test:worker` → pass
(update `apps/web/test/worker/public-routes.worker.test.ts:328` from
`status.baselineMonth` to the new `coverage.end` expectation in the same
change).

### Step 5: Web client, labels, fixtures

1. `apps/web/src/studio/api-client.ts`: update studio response
   types/validators for the release triple (the manifest check asserted in
   `apps/web/test/shared/api-client.test.ts:116/:163/:177` — mirror whatever
   079 landed for the map side; the studio side compares `coverage.end`).
2. `apps/web/src/components/route/data-quality-labels.ts`: rename the two enum
   literals; sweep renderers with
   `rg -n 'baseline_release|partial_public_monthly_only' apps/web/src` → fix
   all hits.
3. Sweep field consumers: `rg -n 'baselineMonth|releaseMonth' apps/web/src` —
   expected survivors after this step: NONE (the network-map join was already
   migrated by amended 079). `route-insight-card.ts:61` (`asOfMonth ??
   month`) is grain — leave it.
4. Update the ~13 shared-test fixture files (list in Current state) to the
   new shapes: `baselineMonth: "2026-03"` → one matching
   `releaseId`/`publishedAt`/`coverage: { start: "2023-04", end: "2026-03" }`
   triple (or the fixture's real window), `releaseMonth` fixture keys → the
   same triple per the dossier schema.
5. `apps/web/README.md` status-endpoint section (:56-58): rewrite — no
   `month=` param, no `BASELINE_MONTH`; document `releaseId`, `coverage`, `publishedAt`,
   `release`, and that the endpoint always reports the latest published
   release.

**Verify**: `bun run test:web && bun --filter @bp/web build && bun run check:web-architecture && bun run check:design-doctrine` → all pass, bundle budget green.

### Step 6: Docs + log + final gates

1. `knowledge/wiki/engineering/web_api_endpoint_architecture.md`: replace the
   `baselineMonth`/`releaseLayer` meta-contract description and the line-419
   cache row ("Monthly baseline Studio responses" → "Published Studio
   responses"); remove plan 084's dated note in the same edit.
2. `knowledge/wiki/engineering/data_pipeline_operationalization_status.md`:
   dated addendum — serving contract de-monthed; status endpoint now reports
   releaseId + publishedAt + coverage.
3. Append `knowledge/log.md` entry (execution date).
4. Remove every `retire-085` file/rule pair whose scoped match was removed
   from `tests/harness/month-doctrine-allowlist.ts`. For
   `studio/projections.ts` only, preserve the exact four transitional reads and
   reassign that pair to `retire-086`; do not touch another disposition or add
   a permanent exception.
5. Run the month-doctrine check, then the full gate.

**Verify**: `bun run check:month-doctrine && bun run check:prepush` → exit 0.

## Test plan

- Updated (not new) suites carry the regression weight:
  `packages/studio-api/test/api-facade.test.ts` (index/detail/sections emit
  the release triple, no `baselineMonth` or prefix-derived release ID),
  `http-routing.test.ts`,
  `source-refresh.test.ts` (no env-month dependence — last-built derives from
  D1), worker `public-routes.worker.test.ts` (status shape), the ~13 web
  shared-test files.
- `packages/db/test/studio-route-index.test.ts` proves earliest/latest month
  resolution over the in-memory D1 harness, including empty/non-pass batch
  behavior and deterministic release-ID derivation.
- NEW tests to add:
  - domain: `CoverageWindowSchema` accepts `{start: null, end: "2026-03"}`,
    rejects malformed months (model on the existing pattern-check tests in
    `packages/domain/test/package-shape.test.ts`).
  - capability freshness: a surface with `dataAsOf` 4+ months older than the
    reference month is `stale`, ≤3 is `recent`, `null` is `unknown` —
    parameterized by reference month so the read-time recompute is pinned
    (model on the existing capability test file).
  - studio-api: status endpoint with an empty D1 returns the 503
    "No published serving data" (replaces the 400 month-format test).
- Verification: suites named in Commands; all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `rg -n '\b(baselineMonth|BASELINE_MONTH|LAST_BUILT_SPEED_MONTH|canonicalMonthlyRelease|baseline_release|partial_public_monthly_only)\b' packages/domain/src packages/studio-api/src apps/web/src apps/web/wrangler.jsonc --glob '!packages/domain/src/maps/**' --glob '!packages/domain/src/studio/release.ts' --glob '!packages/domain/src/studio/projections.ts'` → 0 hits; `studio/projections.ts` has exactly four `baselineMonth` compatibility reads assigned to `retire-086`
- [ ] `rg -n '\breleaseMonth\b' packages/domain/src/studio/route-capability.ts packages/domain/src/studio/route-dossier.ts packages/studio-api/src/studio/read-handlers.ts packages/analytics/src/evaluation/build-route-capability-manifest.ts packages/analytics/src/evaluation/build-route-dossier-summary.ts tools/pipeline-v2/src/commands/export/d1.ts tools/pipeline-v2/src/commands/export/route-dossier-summaries.ts` → 0 hits (partition/window uses outside these identity surfaces are intentionally legal)
- [ ] `rg -n 'searchParams.get\("month"\)' packages/studio-api/src` → 0 hits
- [ ] `rg -n 'searchParams.get\("asOfMonth"\)' packages/studio-api/src/public-api.ts` → exactly 1 hit (historical scorecard grain)
- [ ] Every release-bearing response, capability manifest, and dossier carries
      a matching `releaseId`/`publishedAt`/coverage triple; no production
      release ID is derived by `releaseIdForPrefix`
- [ ] Per-package typechecks + `bun run test:unit && bun run test:web && bun run test:worker` → pass
- [ ] `bun --filter @bp/web build` → exit 0, bundle budget green
- [ ] `bun run check:prepush` → exit 0
- [ ] `bun run check:month-doctrine` passes with no `retire-085` entries
- [ ] `route-capability-manifest.ts` has no active builder
      `baselineMonth`/`releaseMonth`; its `release-month-identity` allowlist
      entry is reassigned to `retire-086` at the exact frozen-reader count
- [ ] `studio/projections.ts` emits no retired response key and its exact four
      legacy-payload reads are reassigned to `retire-086`
- [ ] `apps/web/README.md` and `web_api_endpoint_architecture.md` no longer
      document `?month=`/`BASELINE_MONTH`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plans 079/080/081 are not all DONE, or 079's landed map contract still
  exposes a field named `baselineMonth` (its amendment was not applied — the
  map side must be reconciled before this sweep can claim the grep gates).
- Step 0 finds a `?month=` consumer outside the documented set.
- The static dossier/capability artifacts in R2/`data/` decode-fail against
  the new read schemas AND plan 086 has not republished — decide-with-operator
  territory: this plan must not regenerate `data/` artifacts (see the shared
  constraint), and shipping a reader that rejects the live artifacts would
  blank real pages. Report which artifact/key mismatched.
- `resolveServingMonths` or `releaseStatusMonth` do not match the excerpts
  (drift from an unplanned change).
- Any test failure survives two focused fix attempts, or the bundle budget
  trips.

## Maintenance notes

- Freshness is now computed at read time in the Worker — a cheap pure
  function per route, but if the capability join ever moves to a per-request
  loop over thousands of surfaces, memoize `freshnessReferenceMonth`.
- Plan 086 renames the pipeline-side release identity (`analysisPeriod`,
  export dirs, release payload). Until it lands, `studio release` output and
  publish gates still speak months — expected, gated by 086's greps.
- Plan 087's ledger consumes `publishedAt` + `coverage` from the export
  summary; keep those field names stable.
- Reviewer focus: the D1 `findEarliestSpeedTrendMonth` query (new SQL — check
  index usage), the 503 paths for empty D1, and that no response silently
  dropped `dataAsOf`.

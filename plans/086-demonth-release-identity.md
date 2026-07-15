# Plan 086: De-month pipeline release identity — publishedAt + coverage manifests, gates check consistency not month equality

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` (Generation 11 table).
>
> **Drift check (run first)**:
> `git diff --stat 27755f4..HEAD -- tools/pipeline-v2/src/commands/studio/release.ts tools/pipeline-v2/src/commands/studio/_release-docs.ts tools/pipeline-v2/src/commands/export/d1.ts tools/pipeline-v2/src/commands/export/route-capability-manifest.ts tools/pipeline-v2/src/commands/publish tools/pipeline-v2/src/commands/audit/data-product-completeness.ts tools/pipeline-v2/src/checks/check-publish-completeness.ts tools/pipeline-v2/test packages/analytics/src/data-products packages/analytics/test packages/domain/src/studio/release.ts knowledge/wiki/engineering/cloudflare_operations_runbook.md knowledge/wiki/engineering/cli_commands.md`
> Plans 079 (amended) and 085 intentionally precede this plan and touch
> `export/d1.ts`, publish files, and domain schemas; their landed behavior
> supersedes the excerpts below. On any OTHER mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M-L
- **Risk**: MED (release/publish gates change; every check keeps an
  equivalent-or-stricter replacement, proven by fixture tests)
- **Depends on**: `plans/084-retire-month-anchors-doctrine.md`,
  `plans/088-month-doctrine-gate.md` (its ratchet forces this plan's token
  deletions), `plans/079-truthful-map-contracts.md` (amended, hard — it owns
  `map artifacts`/`map release` and `evaluateAnalysisPeriodCurrency`),
  `plans/085-demonth-serving-contract.md` (hard — capability/dossier builder
  args and served schemas land there)
- **Category**: tech-debt
- **Planned at**: commit `27755f4`, 2026-07-12

## Why this matters

Even after the serving contract is de-monthed (plan 085), the pipeline still
*produces* releases whose identity is a calendar month: `studio release`
defaults to a hardcoded `"2026-03"`, D1 exports live under
`data/exports/d1/<YYYY-MM>/`, the R2 publish gate hard-fails unless
`manifest.analysisPeriod === --month`, the detector-readiness import throws on
month inequality, and the data-product completeness system classifies
products by a `"release_month"` literal. Per ADR-0022, a release is a
publication event — `releaseId` + `publishedAt` + per-dataset coverage windows
— and months survive only as grain/partitions. This plan makes the pipeline
emit that identity and converts every month-equality gate into a
coverage-consistency gate of equal or greater strictness, so "publish the
March release" becomes "publish the release whose coverage ends at the latest
complete month." It is also the plan that empties the month-doctrine ratchet
allowlist (plan 088) — after this lands, the banned identity tokens are
machine-impossible to reintroduce anywhere in production source.

**Deliberately kept (do not "fix")**: month-partitioned directory layouts and
month arguments that *select data windows* are grain, not identity. The rule:
a month may say WHICH slice of a multi-year corpus an artifact covers; it may
not BE the name of the product. Layout stays; identity fields change.

## Current state

- `tools/pipeline-v2/src/commands/studio/release.ts:88-91`:
  ```ts
  const defaultMonth = "2026-03";
  const defaultOutputPath = "data/artifacts/studio/v1/release.json";
  const defaultSchemaPath = "data/exports/d1/2026-03/schema.sql";
  const defaultSeedPath = "data/exports/d1/2026-03/seed.sql";
  ```
  The command queries all route data for `options.month` and builds
  `docsSections(options.month)` (line ~816). Its payload schema is
  `packages/domain/src/studio/release.ts:62` — `baselineMonth: IsoMonthSchema`
  (excluded from plan 085's sweep specifically so it migrates here together
  with its builder). Find current consumers of the payload field first:
  `rg -n 'baselineMonth' packages/studio-api/src tools/pipeline-v2/src --glob '!**/test/**'`
  after 085 should show only release-payload-related sites.
- `tools/pipeline-v2/src/commands/export/d1.ts:240-292`:
  `exportDir = join(exportRoot, "d1", month)` (:241); result carries
  `isoMonth: month` and `analysisPeriod: month` (:285-286); `generatedAt`
  already stamped (:263). (The capability/dossier builder calls at :265-281
  were already migrated by plan 085.)
- `tools/pipeline-v2/src/commands/publish/r2-artifacts.ts:147-175`
  (`assertPublishableMapManifest`): reads
  `join(artifactRoot, "map", options.month, "manifest.json")` and fails
  publish unless `manifest["analysisPeriod"] !== options.month` is false
  (:164-165), plus releaseProfile/buildStatus/verificationStatus/routeFacts/
  routeUniverse checks. Publish also assumes D1 exports at
  `exportRoot/<month>/schema.sql` + `seed.sql` (per lines ~574-578).
- `tools/pipeline-v2/src/commands/export/route-capability-manifest.ts:69-76`:
  ```ts
  if (manifest.releaseMonth !== input.month) {
    throw new Error(
      `Detector readiness manifest month ${manifest.releaseMonth} does not match export month ${input.month}.`,
    );
  }
  ```
  The detector-readiness manifest is a **frozen artifact** of the deleted
  detector program (gen-7 plan 061); it can never be regenerated with new
  field names, so this gate must learn to accept the frozen shape rather than
  demand equality with the current month.
- `packages/analytics/src/data-products/registry.ts:66-84`:
  `DataProductExpectedUniverseSchema.months:
  Schema.Literals(["release_month", "history_window"])` (:69) and
  `DataProductFreshnessPolicySchema.cadence: Literals(["release_month",
  "historical_window", "run_scoped", "manual", "append_only"])` (:73-79) with
  an existing `staleAfterDays` field (:80-82).
  `packages/analytics/src/data-products/completeness.ts` (~:136) takes
  `releaseMonth: string` as the classification anchor. Four products declare
  `months: "release_month"`.
- `tools/pipeline-v2/src/commands/audit/data-product-completeness.ts` consumes
  the above; its test asserts "semantic JSON checks reject wrong release
  months" (`tools/pipeline-v2/test/commands/audit/data-product-completeness.test.ts:1252`).
- `tools/pipeline-v2/src/checks/check-publish-completeness.ts` (root script
  `bun run check:publish-completeness`) + its test
  `tools/pipeline-v2/test/checks/publish-completeness.test.ts:33` (writes
  `JSON.stringify({ baselineMonth: month })` fixtures).
- Runbook: `knowledge/wiki/engineering/cloudflare_operations_runbook.md:94,120`
  teaches "promote a baseline month" (carries plan 084's dated note).
- Conventions: pipeline commands are `defineCommand` descriptors
  (`@bp/pipeline-v2/cli/compat` — see `commands/plan/source-refresh.ts` for
  the idiom); every command change gets a fixture-backed test under
  `tools/pipeline-v2/test/commands/**` modeled on its existing sibling.
- Gen-10 plan 083 (spine pattern-grouping spike) reads pipeline artifacts but
  is analysis-only — no file overlap with this plan.

Vocabulary (ADR-0022): release identity = `releaseId` (derive as the compact
UTC stamp of `publishedAt`, e.g. `2026-07-12T1430Z` — deterministic given
`publishedAt`, no extra state) + `publishedAt` (ISO datetime) + `coverage
{ start, end }` per dataset family. `analysisPeriod`/`isoMonth` as manifest
identity fields are retired; `--month` CLI args remain as window selectors.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun --filter @bp/pipeline-v2 typecheck` (and `@bp/analytics`, `@bp/domain`, `@bp/studio-api`) | exit 0 |
| Pipeline tests | `bun --filter @bp/pipeline-v2 test` | pass |
| Analytics tests | `bun --filter @bp/analytics test` | pass |
| One fixture-backed command (CLAUDE.md rule) | `bun run tools/pipeline-v2/src/cli.ts export d1 --help` (or the repo's documented invocation — check `knowledge/wiki/engineering/cli_commands.md`) | help text renders, no import error |
| Publish-completeness check | `bun run check:publish-completeness` | exit 0 against fixtures |
| Month-doctrine gate | `bun run check:architecture` | exit 0 with an EMPTY month-doctrine allowlist |
| Full gate (final) | `bun run check:prepush` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `tools/pipeline-v2/src/commands/studio/release.ts`, `_release-docs.ts` (its
  month-anchored doc strings)
- `packages/domain/src/studio/release.ts` (+ any studio-api reader of the
  release payload found in the Step-1 grep, + domain/studio-api tests for it)
- `tools/pipeline-v2/src/commands/export/d1.ts` (identity fields + defaults;
  NOT the capability/dossier call args — 085 already changed them)
- `tools/pipeline-v2/src/commands/export/route-capability-manifest.ts`
- `tools/pipeline-v2/src/commands/publish/**` (r2-artifacts gate + any
  publish-artifact-keys identity fields; per amended 079, do not restructure
  the map manifest itself)
- `tools/pipeline-v2/src/checks/check-publish-completeness.ts`
- `tools/pipeline-v2/src/commands/audit/data-product-completeness.ts`
- `packages/analytics/src/data-products/registry.ts`, `completeness.ts` (+ tests)
- `tools/pipeline-v2/test/**` fixtures/tests for the above
- the month-doctrine ratchet allowlist file (plan 088 names it; remove this
  plan's entries — expected to be the LAST entries, leaving it empty)
- `knowledge/wiki/engineering/cloudflare_operations_runbook.md`,
  `knowledge/wiki/engineering/cli_commands.md` (full de-month rewrite of the
  publish sections — replaces plan 084's dated notes), `knowledge/log.md`
  (append)

**Out of scope** (do NOT touch):
- `data/**` — never regenerate, rename, or delete artifacts/exports. Existing
  month-keyed export directories remain valid historical partitions. The
  frozen detector-readiness manifest is read-only forever.
- `tools/pipeline-v2/src/commands/map/**`, `commands/audit/map-artifacts.ts`,
  `packages/analytics/src/evaluation/map-artifacts.ts` — amended plan 079 owns
  map release identity/currency.
- Ingest/backfill/import commands and `lib/socrata-monthly-ingest.ts` — month
  args there select source partitions (grain); the name is accurate.
- `packages/db` D1/local schemas — month-keyed rows are grain.
- Serving code (`packages/studio-api/src/**` beyond the release-payload
  reader found in Step 1, `apps/web/**`) — plan 085 owns it.

## Git workflow

- Branch: `advisor/086-demonth-release-identity`.
- Commit per step; imperative messages.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Map the release-payload consumers (read-only reconnaissance)

Run `rg -n 'baselineMonth|analysisPeriod|isoMonth' packages tools/pipeline-v2/src --glob '!**/node_modules/**'`
and record the hit list. Expected (post-079/085): only
`domain/studio/release.ts`, `commands/studio/release.ts` + `_release-*`,
`commands/export/d1.ts`, publish files, checks, and their tests. Any hit in
`apps/web` or studio-api read paths beyond the release-payload reader means
085 left residue — STOP and report rather than absorbing it silently.

**Verify**: hit list recorded in the execution notes; unexpected hits → STOP.

### Step 2: Release payload identity (`domain/studio/release.ts` + `studio release`)

1. In `packages/domain/src/studio/release.ts`: replace `baselineMonth:
   IsoMonthSchema` (:62) with `publishedAt: Schema.String`, `releaseId:
   Schema.String`, and `coverage: CoverageWindowSchema` (import the schema
   plan 085 added). Bump the payload `schemaVersion` literal if one exists in
   this schema (check the struct head).
2. In `commands/studio/release.ts`: delete `defaultMonth` and the two
   hardcoded `2026-03` default paths (:88-91). `--month` becomes REQUIRED
   (window selector); schema/seed default paths derive from the month arg
   (`data/exports/d1/${month}/…`). Error text for a missing month must name
   the freshness ledger as the way to pick it: "month is required — run
   `audit freshness` (plan 087) to see the latest complete month per source."
   (Until 087 lands, the string still names the command; acceptable
   forward-reference, it is an error-message hint, not a dependency.)
3. Stamp `publishedAt` (build time ISO), `releaseId` (compact form of
   publishedAt), and `coverage { start, end: options.month }` into the payload
   where `baselineMonth` was; `coverage.start` = earliest month present in
   the loaded trend/history inputs (pure computation over data already in
   memory; if none, `null`).
4. Sweep `_release-docs.ts` month-anchored strings (`rg -in 'monthly|release
   month' tools/pipeline-v2/src/commands/studio/_release-docs.ts`) to
   coverage phrasing.
5. Update the release-payload reader found in Step 1 (studio-api or web) and
   the fixture tests that pin `baselineMonth` in release payloads.

**Verify**: `bun --filter @bp/domain test && bun --filter @bp/pipeline-v2 test`
→ pass; `rg -n '2026-03' tools/pipeline-v2/src/commands/studio/release.ts` → 0.

### Step 3: D1 export identity (`export/d1.ts`)

1. Keep `exportDir = join(exportRoot, "d1", month)` — layout is a partition.
2. In `D1SeedOutputResult` (:283-292) and the written `export-summary.json`:
   replace `analysisPeriod: month` with `coverage: { start, end: month }` and
   add `publishedAt: generatedAt` + `releaseId`. Keep `isoMonth` OUT of the
   result (delete the field); anything needing the partition key derives it
   from `coverage.end`.
3. Make `--year/--month` required-or-derived exactly as the command works
   today (do not add auto-derivation logic here; the ledger advises the
   operator).
4. Update the export fixture tests.

**Verify**: `bun --filter @bp/pipeline-v2 test` → pass;
`rg -n 'analysisPeriod' tools/pipeline-v2/src/commands/export/d1.ts` → 0.

### Step 4: Publish gates check coverage consistency

In `commands/publish/r2-artifacts.ts` (`assertPublishableMapManifest`,
:147-175): the map manifest (as amended 079 shipped it) carries
`publishedAt` + `coverage`. Replace the `analysisPeriod !== options.month`
equality (:164-165) with BOTH:
- `manifest.coverage.end === options.month` (the partition being published
  must be the window the manifest claims), and
- `typeof manifest.publishedAt === "string"` (identity present).
Keep every other check verbatim (releaseProfile/buildStatus/
verificationStatus/routeFacts/routeUniverse). If the landed 079 manifest kept
a differently-named window field, STOP (amendment drift). Update
`checks/check-publish-completeness.ts` + `test/checks/publish-completeness.test.ts:33`
fixtures from `{ baselineMonth: month }` to the new manifest identity, keeping
the check's route/artifact-count assertions unchanged.

**Verify**: `bun --filter @bp/pipeline-v2 test && bun run check:publish-completeness`
→ pass (fixtures updated in the same commit).

### Step 5: Frozen detector-readiness manifest tolerance

In `commands/export/route-capability-manifest.ts:69-76`: the readiness
manifest is frozen with `releaseMonth: "<some 2026 month>"`. Replace the
equality throw with: accept when `manifest.releaseMonth <= input.month`
(string compare is valid for zero-padded ISO months); emit a caveat into the
capability build input (surfacing as a route-capability caveat, the existing
caveats array) noting the readiness data's month when it is older than
`coverage.end`. Reject (keep throwing) only when the manifest month is LATER
than the export month — that still signals a wired-wrong input. Update the
command's test to cover: equal (no caveat), older (caveat), newer (throw).
NOTE for the plan-088 gate: reading the frozen artifact's `releaseMonth`
field is the one legitimate surviving use of that token — the gate's
allowlist carries a PERMANENT documented entry for this file (the field name
belongs to a frozen artifact, not to this codebase's vocabulary).

**Verify**: `bun --filter @bp/pipeline-v2 test` → the three new cases pass.

### Step 6: Data-product registry + completeness vocabulary

1. `packages/analytics/src/data-products/registry.ts`: rename literal
   `"release_month"` → `"latest_month"` in BOTH the
   `DataProductExpectedUniverseSchema.months` literals (:69) and the
   `DataProductFreshnessPolicySchema.cadence` literals (:73-79); update the
   four product declarations and any registry docs/descriptions that say
   "release month". Semantics are unchanged: "one row per route for the
   latest covered month."
2. `completeness.ts`: rename the `releaseMonth: string` input to
   `targetMonth: string` (the month being classified — a grain argument);
   update call sites (`commands/audit/data-product-completeness.ts`) and
   tests, including the `:1252` "reject wrong release months" test (rename to
   "reject wrong target months"; assertions keep the same strictness).

**Verify**: `bun --filter @bp/analytics test && bun --filter @bp/pipeline-v2 test`
→ pass; `rg -n 'release_month|releaseMonth' packages/analytics/src tools/pipeline-v2/src --glob '!**/route-capability-manifest.ts'` → 0.

### Step 7: Empty the ratchet, rewrite the runbook, log

1. Remove every remaining entry from the plan-088 month-doctrine allowlist
   except the permanent frozen-artifact entry (Step 5 note). Run
   `bun run check:architecture` — the month-doctrine test must pass with the
   allowlist at its terminal state.
2. `cloudflare_operations_runbook.md`: rewrite the publish/promotion sections
   ("promote a baseline month" → "publish a release"; document that the
   publish command's `--month` selects the export partition whose
   `coverage.end` must match; remove plan 084's dated note).
3. `cli_commands.md`: update the affected command entries (studio release,
   export d1, publish, audits) with the new identity fields; remove the dated
   note.
4. Append a `knowledge/log.md` entry.

**Verify**: `bun run check:architecture` → exit 0;
`rg -in 'promote a baseline month|promote a new baseline month' knowledge/wiki` → 0;
`bun run check:knowledge` → exit 0.

## Test plan

- Updated fixture tests carry the weight: publish-completeness fixtures,
  r2-artifacts publish-gate tests (add one negative: manifest whose
  `coverage.end` ≠ `--month` must fail with the new message), export/d1
  summary shape, studio release payload shape, capability-manifest month
  tolerance (equal/older/newer), data-product completeness rename.
- Model new tests on their existing siblings in the same directories
  (each command already has a fixture-backed test — the repo convention).
- Verification: `bun --filter @bp/pipeline-v2 test`,
  `bun --filter @bp/analytics test`, `bun run check:publish-completeness` all
  pass.

## Done criteria

- [ ] `rg -n 'analysisPeriod|baselineMonth' tools/pipeline-v2/src packages/analytics/src packages/domain/src` → 0 hits
- [ ] `rg -n 'release_month' packages/analytics/src tools/pipeline-v2/src` → 0 hits
- [ ] `rg -n '"2026-03"' tools/pipeline-v2/src/commands/studio/release.ts` → 0 hits
- [ ] Publish gate proves: correct manifest passes; `coverage.end` mismatch fails; missing `publishedAt` fails (tests exist)
- [ ] Frozen readiness manifest: older month accepted with caveat, newer throws (tests exist)
- [ ] Month-doctrine ratchet allowlist (plan 088) is EMPTY except the
      documented permanent frozen-artifact entry; `bun run check:architecture` exit 0
- [ ] `bun --filter @bp/pipeline-v2 test`, `bun --filter @bp/analytics test`, `bun run check:publish-completeness`, `bun run check:prepush` all exit 0
- [ ] Runbook/CLI wiki rewritten; `rg -in 'promote a baseline month' knowledge/wiki` → 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 085 is not DONE, or Step 1 finds `baselineMonth` consumers outside the
  release-payload path.
- The landed (amended) 079 map manifest does not carry
  `publishedAt`/`coverage` under those names — reconcile the amendment before
  rewriting the publish gate against a shape that does not exist.
- The frozen detector-readiness manifest fails to decode at all under the
  current schema (something else changed it — it must never be edited).
- Changing the publish gate would let a manifest publish that today's gate
  blocks (the replacement must be equal-or-stricter; if you cannot prove it
  with a test, stop).
- Any `data/` mutation appears necessary.

## Maintenance notes

- The operator's next real publish exercises this end-to-end: build export →
  `studio release --month <latest>` → publish. The first post-086 publish
  should be watched for the new gate messages; the runbook documents the
  sequence.
- Plan 087's ledger reads `export-summary.json` `publishedAt`/`coverage` —
  field names are now load-bearing for it.
- The `--month` args intentionally survive as partition selectors. If a
  future generation wants releaseId-keyed export directories, that is a
  layout migration with its own plan — nothing here blocks it.
- After this plan, the month-doctrine gate (plan 088) makes reintroducing the
  banned tokens a harness failure — reviewers should reject any PR that adds
  allowlist entries instead of fixing its code.
- Reviewer focus: the publish-gate replacement (Step 4) and the readiness
  tolerance (Step 5) — both are gates; the diff must show tests proving no
  loosening.

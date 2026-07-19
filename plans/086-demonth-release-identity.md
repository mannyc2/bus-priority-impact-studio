# Plan 086: De-month pipeline release identity — releaseId + publishedAt + coverage replace month equality

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` (Generation 11 table).
>
> **Drift check (run first)**:
> `git diff --stat 27755f4..HEAD -- tools/pipeline-v2/src/commands/studio/release.ts tools/pipeline-v2/src/commands/studio/_release-docs.ts tools/pipeline-v2/src/commands/export/d1.ts tools/pipeline-v2/src/commands/export/d1-inputs.ts tools/pipeline-v2/src/commands/export/route-capability-manifest.ts tools/pipeline-v2/src/commands/publish tools/pipeline-v2/test packages/analytics/src/data-products packages/analytics/test packages/domain/src/studio/release.ts packages/domain/src/studio/projections.ts knowledge/wiki/engineering/cloudflare_operations_runbook.md knowledge/wiki/engineering/cli_commands.md tests/harness/month-doctrine-allowlist.ts`
> Plans 079 (amended) and 085 intentionally precede this plan and touch
> `export/d1.ts`, publish files, and domain schemas; their landed behavior
> supersedes the excerpts below. On any OTHER mismatch, STOP.

> **Amendment (2026-07-19 — plan-088 ownership audit, binding).** The
> month-doctrine gate is surface-aware: `releaseMonth` used only as a local
> source/history window or partition placeholder is legal and is not this
> plan's debt. This plan owns only its `retire-086` file/rule pairs. Add
> `export/d1-inputs.ts` and the staged `studio/projections.ts` compatibility
> reads to the explicit scope below.
> In `export/d1.ts`, Plan 085 already removes the two capability/dossier
> `releaseMonth` call arguments; this plan removes the two manifest-identity
> `analysisPeriod` matches. In `studio/release.ts`, amended Plan 079 removes
> only the two map-fact output members; its route-brief input/window members
> are legal grain. This plan removes the top-level release-payload tokens and
> pinned default. Plan 085 hands off exactly four compatibility reads in
> `studio/projections.ts`; after the payload schema changes, this plan replaces
> them with `release.coverage`. Plan 085 also migrates the active
> builder half of `route-capability-manifest.ts` and reassigns its exact
> frozen remainder to `retire-086`; this plan owns only that frozen
> schema/read semantics. Do not rename legal
> `releaseMonth` window variables in data-product/source/history code merely
> to satisfy an over-broad grep.
> Reuse Plan 079's canonical `releaseIdFromPublishedAt` helper without another
> formatter. Plan 079 captures one publication timestamp in `runMapRelease`;
> this plan may thread that exact triple into D1 export and the top-level
> Studio payload, but must not change the landed map manifest/catalog shapes.

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
complete month." It removes all `retire-086` entries from the month-doctrine
ratchet (plan 088). The later `retire-087` prose entry and exact frozen-reader
exceptions intentionally remain; new identity debt is still
machine-impossible to introduce on the guarded surfaces.

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
  `releaseMonth: string` as the classification anchor. The live registry has
  70 exact serialized literals to migrate: 38 `months:` declarations, 30
  `cadence:` declarations, and the two schema literals above.
- `tools/pipeline-v2/src/commands/audit/data-product-completeness.ts` consumes
  the above; its test asserts "semantic JSON checks reject wrong release
  months" (`tools/pipeline-v2/test/commands/audit/data-product-completeness.test.ts:1252`).
  Its `releaseMonth` argument selects the classification window and is legal
  grain; neither this command nor that test title is part of the rename.
- `tools/pipeline-v2/src/checks/check-publish-completeness.ts` and its tests
  are map-contract surfaces owned by amended Plan 079. Plan 086 runs that
  check as a regression gate but does not re-edit its month vocabulary.
- Runbook: `knowledge/wiki/engineering/cloudflare_operations_runbook.md:94,120`
  teaches "promote a baseline month" (carries plan 084's dated note).
- Conventions: pipeline commands are `defineCommand` descriptors
  (`@bp/pipeline-v2/cli/compat` — see `commands/plan/source-refresh.ts` for
  the idiom); every command change gets a fixture-backed test under
  `tools/pipeline-v2/test/commands/**` modeled on its existing sibling.
- Gen-10 plan 083 (spine pattern-grouping spike) reads pipeline artifacts but
  is analysis-only — no file overlap with this plan.

Vocabulary (ADR-0022): release identity = `releaseId` from Plan 079's
millisecond-preserving, canonical-UTC `releaseIdFromPublishedAt` helper + the
same `publishedAt` ISO datetime + `coverage { start, end }` per dataset
family. Do not truncate or independently format the timestamp.
`analysisPeriod`/`isoMonth` as manifest identity fields are retired;
`--month` CLI args remain as window selectors.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun --filter @bp/pipeline-v2 typecheck` (and `@bp/analytics`, `@bp/domain`, `@bp/studio-api`) | exit 0 |
| Pipeline tests | `bun --filter @bp/pipeline-v2 test` | pass |
| Analytics tests | `bun --filter @bp/analytics test` | pass |
| One fixture-backed command (CLAUDE.md rule) | `bun run tools/pipeline-v2/src/cli.ts export d1 --help` (or the repo's documented invocation — check `knowledge/wiki/engineering/cli_commands.md`) | help text renders, no import error |
| Publish-completeness check | `bun run check:publish-completeness` | exit 0 against fixtures |
| Month-doctrine gate | `bun run check:architecture` | exit 0 with no `retire-086` entries; only `retire-087` and exact frozen-reader entries remain |
| Full gate (final) | `bun run check:prepush` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `tools/pipeline-v2/src/commands/studio/release.ts` and `_release-docs.ts`
  (its month-anchored doc strings)
- `packages/domain/src/studio/release.ts` (+ any studio-api reader of the
  release payload found in the Step-1 grep, + domain/studio-api tests for it)
- `packages/domain/src/studio/projections.ts` (replace only the four
  compatibility reads handed off by Plan 085)
- `tools/pipeline-v2/src/commands/export/d1.ts` (identity fields + defaults;
  NOT the capability/dossier call args — 085 already changed them)
- `tools/pipeline-v2/src/commands/map/release.ts` and
  `tools/pipeline-v2/src/commands/verify/d1.ts`, only to thread Plan 079's
  already-captured `releaseId`/`publishedAt`/coverage into the D1 export and
  top-level Studio payload; do not change map schemas, verification, catalog,
  or registration behavior
- `tools/pipeline-v2/src/commands/export/d1-inputs.ts` (immutable legacy
  route-timeline and detector-readiness compatibility only; local
  source/history window placeholders stay unchanged)
- `tools/pipeline-v2/src/commands/export/route-capability-manifest.ts`
  (frozen detector-readiness schema/read semantics only; Plan 085 already
  migrated the active capability builder half)
- `tools/pipeline-v2/src/commands/publish/**` (remaining identity copy/help;
  Plan 079 already migrated the r2-artifacts map coverage gate)
- `packages/analytics/src/data-products/registry.ts` (+ tests)
- `tools/pipeline-v2/test/**` fixtures/tests for the above
- the month-doctrine ratchet allowlist file (plan 088 names it; remove this
  plan's retiring entries and replace only the landed frozen-reader matches
  with exact permanent entries)
- `knowledge/wiki/engineering/cloudflare_operations_runbook.md`,
  `knowledge/wiki/engineering/cli_commands.md` (full de-month rewrite of the
  publish sections — replaces plan 084's dated notes), `knowledge/log.md`
  (append)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch):
- `data/**` — never regenerate, rename, or delete artifacts/exports. Existing
  month-keyed export directories remain valid historical partitions. The
  frozen detector-readiness and legacy route-timeline artifacts are read-only.
- Other `tools/pipeline-v2/src/commands/map/**`,
  `commands/audit/map-artifacts.ts`, and
  `packages/analytics/src/evaluation/map-artifacts.ts` — amended Plan 079 owns
  map release identity/currency. The narrow `map/release.ts` identity
  pass-through above is the only exception.
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

Run `bun run check:month-doctrine` and record every remaining `retire-086`
file/rule pair. Do not use a repo-wide `analysisPeriod|releaseMonth` grep as
an ownership oracle: route-treatment/study/brief analysis windows and local
source/history partition variables are legal grain and deliberately outside
the gate. Expected owned production surfaces are
`domain/studio/release.ts`, `domain/studio/projections.ts`,
`commands/studio/release.ts`, `commands/export/d1.ts` and `d1-inputs.ts`,
`commands/export/route-capability-manifest.ts`, remaining publish copy, and
`analytics/src/data-products/registry.ts`. Any `retire-086` pair outside
that set is a STOP; do not absorb it silently.

**Verify**: hit list recorded in the execution notes; unexpected hits → STOP.

### Step 2: Release payload identity (`domain/studio/release.ts` + `studio release`)

1. In `packages/domain/src/studio/release.ts`: replace `baselineMonth:
   IsoMonthSchema` (:62) with `publishedAt: Schema.String`, `releaseId:
   Schema.String`, and `coverage: CoverageWindowSchema` (import both the schema
   and `releaseIdFromPublishedAt` contract Plan 079 added and Plan 085 reused).
   Validate that the ID equals the helper result for `publishedAt`. Bump the
   payload `schemaVersion` literal if one exists in this schema (check the
   struct head).
2. In `commands/studio/release.ts`: delete `defaultMonth` and the two
   hardcoded `2026-03` default paths (:88-91). `--month` becomes REQUIRED
   (window selector); schema/seed default paths derive from the month arg
   (`data/exports/d1/${month}/…`). Error text for a missing month must name
   the freshness ledger as the way to pick it: "month is required — run
   `audit freshness` (plan 087) to see the latest complete month per source."
   (Until 087 lands, the string still names the command; acceptable
   forward-reference, it is an error-message hint, not a dependency.)
3. Make the internal `runStudioRelease` input take a canonical `publishedAt`;
   derive `releaseId` only with `releaseIdFromPublishedAt`. The standalone CLI
   captures one timestamp at its command boundary; `runMapRelease` passes the
   timestamp it already captured under Plan 079. Stamp that exact pair and
   `coverage { start, end: options.month }` into the payload where
   `baselineMonth` was; `coverage.start` = earliest month present in the
   loaded trend/history inputs (pure computation over data already in memory;
   if none, `null`). Do not call `new Date()` inside nested builders.
4. In the static release builder's `quality`, use Plan 085's landed
   `published_release` / `partial_public_speed_only` literals; do not retain
   the legacy shared-enum values merely because historical artifacts contain
   them.
5. Sweep `_release-docs.ts` month-anchored strings (`rg -in 'monthly|release
   month' tools/pipeline-v2/src/commands/studio/_release-docs.ts`) to
   coverage phrasing.
6. In `packages/domain/src/studio/projections.ts`, replace the exact four
   `release.baselineMonth` compatibility reads handed off by Plan 085 with the
   new `release.coverage`; remove that file's `retire-086` entry atomically.
   The `analysisPeriod` member in `_release-types.ts` is route-brief window
   grain and remains unchanged/out of scope.
7. Update the release-payload reader found in Step 1 (studio-api or web) and
   the fixture tests that pin `baselineMonth` in release payloads.

**Verify**: `bun --filter @bp/domain test && bun --filter @bp/pipeline-v2 test`
→ pass; `rg -n '2026-03' tools/pipeline-v2/src/commands/studio/release.ts` → 0.

### Step 3: D1 export identity (`export/d1.ts`)

1. Keep `exportDir = join(exportRoot, "d1", month)` — layout is a partition.
2. In `D1SeedOutputResult` (:283-292) and the written `export-summary.json`:
   replace `analysisPeriod: month` with `coverage: { start, end: month }` and
   add `publishedAt` + `releaseId`, validating the ID with the shared helper.
   Make the internal export input accept the publication timestamp: the
   standalone export CLI captures it once, while `verify d1`/`map release`
   pass Plan 079's existing value through. Set `generatedAt` consistently
   from that boundary value rather than generating a second identity time.
   Keep `isoMonth` OUT of the result (delete the field); anything needing the
   partition key derives it from `coverage.end`.
3. In the narrow `map/release.ts` and `verify/d1.ts` pass-through, assert the
   D1 export, Studio payload, map manifest, and catalog registration all carry
   the same `releaseId`/`publishedAt`; only coverage starts may differ by
   dataset family, while every `coverage.end` equals the selected partition.
   Add a fixture that fails on a one-millisecond identity skew.
4. Make `--year/--month` required-or-derived exactly as the command works
   today (do not add auto-derivation logic here; the ledger advises the
   operator).
5. Update the export fixture tests.

**Verify**: `bun --filter @bp/pipeline-v2 test` → pass;
`rg -n 'analysisPeriod' tools/pipeline-v2/src/commands/export/d1.ts` → 0.

### Step 4: Verify the landed publish gate and retire remaining publish copy

Plan 079 already migrated `assertPublishableMapManifest` atomically with the
map producer. Verify, without rewriting it, that it requires both
`manifest.coverage.end === options.month` and a string `publishedAt`, while
preserving every releaseProfile/buildStatus/verificationStatus/routeFacts/
routeUniverse check. Update only remaining Plan-086-owned publish help/copy
(including `"Release month, YYYY-MM"`) to describe a covered-month partition,
and remove the corresponding identity-phrase entry. Do not re-edit
`check-publish-completeness.ts`; Plans 079/085 own its staged map/Studio gates.

**Verify**: `bun --filter @bp/pipeline-v2 test && bun run check:publish-completeness`
→ pass (fixtures updated in the same commit).

### Step 5: Frozen compatibility-reader tolerance

Three reader branches decode immutable artifacts whose producers were deleted:
the detector-readiness readers in
`commands/export/route-capability-manifest.ts:69-76` and
`commands/export/d1-inputs.ts` (currently around :150/:532-534), plus that
file's explicitly named legacy route-timeline reader (around :81/:436-505).
The detector manifests are frozen with `releaseMonth: "<some 2026 month>"`.
In both detector readers, replace equality rejection with: accept when
`manifest.releaseMonth <= input.month`
(string compare is valid for zero-padded ISO months). In the capability
reader, emit a caveat into the build input (surfacing through the existing
caveats array) noting the readiness data's month when it is older than
`coverage.end`. In `d1-inputs.ts`, preserve that provenance by writing each
derived route-artifact row's `month` from `manifest.releaseMonth`, not from
the requested export month. Reject (keep throwing) only when the manifest month is LATER
than the export month — that still signals a wired-wrong input. Update both
detector-reader paths' tests to cover: equal (no caveat), older (caveat), newer
(throw).

Do not hard-cut or delete the legacy route-timeline reader: no producer or
regeneration path remains (deleted by Plan 024 at `7f5c3d9a`), and an operator
may still supply `--route-timeline-projection-path`. Preserve its exact schema
and equality behavior, and add compatibility tests proving a matching frozen
projection still decodes while a wrong-partition projection fails. The three
other `releaseMonth` occurrences in local source-coverage path arguments are
legal window/partition grain and remain excluded by the scanner.

After the edits, regenerate scanner counts. Convert the two file/rule entries
to `permanent-frozen-artifact` with the audited exact landed counts: seven in
`d1-inputs.ts` (four legacy timeline + three detector) and three in
`route-capability-manifest.ts` (detector only). The allowlist notes must state
that count split and name all three immutable readers; a count containing any
active builder or legal local-grain token is a failure.

**Verify**: `bun --filter @bp/pipeline-v2 test` → the three new cases pass.

### Step 6: Data-product registry vocabulary

1. `packages/analytics/src/data-products/registry.ts`: rename the 70 exact
   serialized/cadence literal occurrences
   `"release_month"` → `"latest_month"` in BOTH the
   `DataProductExpectedUniverseSchema.months` literals (:69) and the
   `DataProductFreshnessPolicySchema.cadence` literals (:73-79); update the
   audited 38 `months:` declarations, 30 `cadence:` declarations, two schema
   literals, and any registry docs/descriptions that say "release month".
   Semantics are unchanged: "one row per route for the latest covered month."
2. Keep `releaseMonth` variables used as the selected classification,
   source, or history window in `completeness.ts`, its audit command, and
   local aggregate helpers. They are grain, not serialized release identity,
   and the plan-088 scanner intentionally does not report them.

**Verify**: `bun --filter @bp/analytics test && bun --filter @bp/pipeline-v2 test`
→ pass; `rg -n '\brelease_month\b' packages/analytics/src/data-products/registry.ts` → 0.

### Step 7: Shrink the ratchet, rewrite the runbook, log

1. Remove every `retire-086` entry from the plan-088 month-doctrine allowlist.
   Preserve `retire-087`; convert the two audited frozen-compatibility entries
   only as Step 5 specifies. Run `bun run check:architecture` — the doctrine test must
   pass with only `retire-087` plus exact `permanent-frozen-artifact` entries.
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
  the landed r2-artifacts publish-gate tests (including `coverage.end` ≠
  `--month`), export/d1 summary shape, studio release payload/projection shape,
  both detector-reader tolerance paths (equal/older/newer), legacy timeline
  exact-partition compatibility, and the data-product registry literal rename.
- Model new tests on their existing siblings in the same directories
  (each command already has a fixture-backed test — the repo convention).
- Verification: `bun --filter @bp/pipeline-v2 test`,
  `bun --filter @bp/analytics test`, `bun run check:publish-completeness` all
  pass.

## Done criteria

- [ ] `rg -n '\banalysisPeriod\b' tools/pipeline-v2/src/commands/export/d1.ts tools/pipeline-v2/src/commands/publish/r2-artifacts.ts` → 0 hits; `_release-types.ts` retains its legal route-brief window member
- [ ] `rg -n '\bbaselineMonth\b' packages/domain/src/studio/release.ts packages/domain/src/studio/projections.ts tools/pipeline-v2/src/commands/studio/release.ts` → 0 hits
- [ ] `rg -n '\brelease_month\b' packages/analytics/src/data-products/registry.ts` → 0 hits
- [ ] `rg -n '"2026-03"' tools/pipeline-v2/src/commands/studio/release.ts` → 0 hits
- [ ] Static payload and D1 export IDs equal
      `releaseIdFromPublishedAt(publishedAt)` without timestamp truncation;
      the map-release fixture proves D1, Studio, map, and catalog identity are
      byte-for-byte equal and rejects one-millisecond skew
- [ ] Publish gate proves: correct manifest passes; `coverage.end` mismatch fails; missing `publishedAt` fails (tests exist)
- [ ] Frozen detector manifests: older month accepted with caveat, newer throws;
      the legacy timeline projection still accepts only its matching partition
- [ ] Month-doctrine ratchet has no `retire-086` entries; the two frozen files
      have exact permanent counts 7 and 3 covering all three reader branches, and
      `retire-087` remains; `bun run check:architecture` exits 0
- [ ] `bun --filter @bp/pipeline-v2 test`, `bun --filter @bp/analytics test`, `bun run check:publish-completeness`, `bun run check:prepush` all exit 0
- [ ] Runbook/CLI wiki rewritten; `rg -in 'promote a baseline month' knowledge/wiki` → 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 085 is not DONE, or Step 1 finds `baselineMonth` consumers outside the
  release-payload path.
- The landed (amended) 079 map manifest does not carry
  `releaseId`/`publishedAt`/`coverage` under those names or does not expose the
  shared helper — reconcile the amendment before rewriting the publish gate
  against a shape that does not exist.
- A frozen detector-readiness or legacy route-timeline artifact fails to decode
  under its current schema (something else changed it — neither artifact may
  be edited).
- Changing the publish gate would let a manifest publish that today's gate
  blocks (the replacement must be equal-or-stricter; if you cannot prove it
  with a test, stop).
- Any `data/` mutation appears necessary.

## Maintenance notes

- The operator's next real publish exercises this end-to-end: build export →
  `studio release --month <latest>` → publish. The first post-086 publish
  should be watched for the new gate messages; the runbook documents the
  sequence.
- Plan 087's ledger reads `export-summary.json`
  `releaseId`/`publishedAt`/`coverage` — field names are now load-bearing for
  it even if the first ledger view does not display the ID.
- The `--month` args intentionally survive as partition selectors. If a
  future generation wants releaseId-keyed export directories, that is a
  layout migration with its own plan — nothing here blocks it.
- After this plan, Plan 087 removes its one retiring prose entry. The exact
  frozen-reader entries remain; every other new guarded identity match is a
  harness failure. Reviewers should fix the owning code rather than add a new
  allowlist entry.
- Reviewer focus: the publish-gate replacement (Step 4) and the readiness
  tolerance (Step 5) — both are gates; the diff must show tests proving no
  loosening.

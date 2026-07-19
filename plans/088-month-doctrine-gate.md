# Plan 088: Month-doctrine harness gate — make month-keyed product identity a failing architecture check

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` (Generation 11 table).
>
> **Sequencing note**: Plan 084 is DONE at the planned-at commit and ADR-0022
> is the authority for the vocabulary below. This gate must land before amended
> 079 and the 085-087 code sweeps so those plans shrink a frozen baseline
> instead of redefining it. Binding ratchet/scope amendments in plans 079 and
> 085-087 are part of this planning repair; they make every disposition below
> executable. Plans 080/081 have no frozen violations at the planned-at commit
> and must not add any.
>
> **Drift check (run first)**:
> `git diff --stat 490bec5f..HEAD -- tests/harness package.json knowledge/wiki/engineering/studio_design_pass_status.md knowledge/log.md plans/README.md plans/079-truthful-map-contracts.md plans/085-demonth-serving-contract.md plans/086-demonth-release-identity.md plans/087-freshness-ledger.md packages/*/src apps/web/src apps/web/wrangler.jsonc tools/pipeline-v2/src`
> If scanned production source changed, rerun Step 0. A reduced violation set
> is safe; a new file/rule pair without an owner is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S-M
- **Risk**: MED (the check is additive, but an over-broad rule would block
  legitimate month-grain work)
- **Depends on**: `plans/084-retire-month-anchors-doctrine.md` (ADR-0022 must
  exist and be accepted)
- **Category**: dx
- **Planned at**: commit `490bec5f`, 2026-07-19

## Why this matters

ADR-0022 permits months as source grain, time-series coordinates, coverage
windows, ingest partitions, and operator-selected build windows. It forbids a
calendar month from being the identity of a product or publication. The gate
therefore bans known representations of **month-keyed identity**: retired
contract names, month-pinning env variables, public `?month=` selectors,
release-identity phrases, and hardcoded month defaults on serving/publication
surfaces. It deliberately does not ban `month`, `startMonth`, `endMonth`,
`implementationMonth`, `IsoMonth`, `--month`, monthly source descriptions, or
hardcoded source/study coverage boundaries.

The ratchet freezes existing identity debt with exact per-file/per-rule counts.
Every entry says which plan removes it. Legal grain is excluded by rule design,
not mislabeled as permanent debt; the only eventual permanent entries are
exact reads of an immutable detector-readiness field. New synonyms still
require normal architecture review, but quote choice, whitespace, computed
selector methods, and static query-string variants cannot bypass the rules
defined here.

## Current state and ownership audit

At `490bec5f`, the original broad scan produced too much noise: a raw
`YYYY-MM` scan found 56 matches in 21 files, mostly source coverage boundaries,
study windows, and examples in comments. Those are not product identity. The
repaired rules below produce this auditable baseline:

- exact globally retired identity tokens: 174 matches in 24 files;
- scoped `releaseMonth` identity fields/reads: 82 matches in 11 files;
- scoped release/manifest `analysisPeriod`: 23 matches in 9 files;
- exact serialized data-product `release_month`: 70 matches in one file;
- identity phrases with flexible whitespace/hyphens on contract/copy
  surfaces: 48 matches in 11 files;
- public month selectors: two matches in `packages/studio-api/src/public-api.ts`;
- pinned identity-month literals after comment stripping and path scoping:
  five matches (`apps/web/wrangler.jsonc` x2 and
  `tools/pipeline-v2/src/commands/studio/release.ts` x3: one whole-month
  default and two local D1 path segments).

The executor must generate exact rule-specific counts; the totals above are a
drift signal, not values to hardcode in the test.

### Retiring ownership by rule

Assign every match to the named disposition below. A file appearing under
multiple rule IDs gets one exact-count entry per rule. The rule split is
load-bearing: it lets shared files have different owners without granting one
plan authority over the other's code.

#### `retired-identity-token`

- **`retire-079`**: `apps/web/src/studio/api-client.ts`,
  `packages/analytics/src/evaluation/map-artifacts.ts`,
  `packages/domain/src/maps/index.ts`,
  `packages/domain/src/studio/projections.ts`,
  `packages/studio-api/src/public-api.ts`,
  `tools/pipeline-v2/src/checks/check-publish-completeness.ts`, and
  `tools/pipeline-v2/src/commands/map/artifacts.ts`.
- **`retire-085`**:
  `apps/web/src/components/route/data-quality-labels.ts`,
  `apps/web/wrangler.jsonc`,
  `packages/analytics/src/evaluation/build-route-capability-manifest.ts`,
  `packages/db/src/d1/queries/{route-observed-reliability.ts,studio-route-index.ts}`,
  `packages/domain/src/routes/index.ts`,
  `packages/domain/src/studio/{routes/index.ts,shared.ts,snapshots.ts}`,
  `packages/studio-api/src/{env.ts,source-refresh.ts}`,
  `packages/studio-api/src/studio/{read-handlers.ts,route-index-read-model.ts}`,
  `tools/pipeline-v2/src/commands/export/route-capability-manifest.ts`
  (active capability-row field only), and
  `tools/pipeline-v2/src/commands/studio/build-mta-wiki-route-fixture.ts`.
- **`retire-086`**: `packages/domain/src/studio/release.ts` and
  `tools/pipeline-v2/src/commands/studio/release.ts`.

Three initial `retire-079` entries are staged. Plan 079 removes the map-owned
occurrences in `public-api.ts`, `studio/projections.ts`, and
`check-publish-completeness.ts`, then shrinks each to its exact non-map
remainder and reassigns it to `retire-085`. Plan 085 deletes the public API and
completeness remainders; it changes the projections' retired output keys but
reassigns the exact four temporary legacy-payload reads to `retire-086`.
Plan 086 removes those reads when it migrates the payload.

#### `release-month-identity`

- **`retire-079`**:
  `packages/analytics/src/evaluation/map-artifacts.ts` and
  `tools/pipeline-v2/src/commands/map/artifacts.ts`.
- **`retire-085`**:
  `packages/analytics/src/evaluation/{build-route-capability-manifest.ts,build-route-dossier-summary.ts}`,
  `packages/domain/src/studio/{route-capability.ts,route-dossier.ts}`,
  `packages/studio-api/src/studio/read-handlers.ts`,
  `tools/pipeline-v2/src/commands/export/d1.ts`,
  `tools/pipeline-v2/src/commands/export/route-dossier-summaries.ts`, and
  `tools/pipeline-v2/src/commands/export/route-capability-manifest.ts` (mixed
  at initial landing: Plan 085 removes active builder matches and atomically
  reassigns the exact frozen-reader remainder to `retire-086`).
- **`retire-086`**:
  `tools/pipeline-v2/src/commands/export/d1-inputs.ts`. Plan 086 removes its
  retiring disposition only after testing all seven immutable compatibility
  matches: four legacy route-timeline plus three detector-readiness reads.

#### `analysis-period-identity`

- **`retire-079`**: `apps/web/src/studio/api-client.ts`,
  `packages/analytics/src/evaluation/map-artifacts.ts`,
  `packages/domain/src/maps/index.ts`,
  `tools/pipeline-v2/src/checks/check-publish-completeness.ts`,
  `tools/pipeline-v2/src/commands/map/artifacts.ts`,
  `tools/pipeline-v2/src/commands/publish/r2-artifacts.ts`,
  `tools/pipeline-v2/src/commands/studio/release.ts` (only the two map-fact
  output-member matches), and
  `tools/pipeline-v2/src/commands/verify/d1.ts`.
- **`retire-086`**: `tools/pipeline-v2/src/commands/export/d1.ts` only.

#### Remaining rules

- **`serialized-release-month` / `retire-086`**:
  `packages/analytics/src/data-products/registry.ts`.
- **`identity-phrase` / `retire-079`**:
  `packages/analytics/src/evaluation/map-artifacts.ts` and
  `tools/pipeline-v2/src/commands/audit/map-artifacts.ts`.
- **`identity-phrase` / `retire-085`**:
  `packages/analytics/src/evaluation/{build-route-capability-manifest.ts,build-route-dossier-summary.ts}`,
  `packages/domain/src/routes/index.ts`,
  `packages/domain/src/studio/{field-provenance.ts,route-capability.ts}`, and
  `packages/studio-api/src/studio/route-index-read-model.ts`.
- **`identity-phrase` / `retire-086`**:
  `packages/analytics/src/data-products/registry.ts` and
  `tools/pipeline-v2/src/commands/publish/r2-artifacts.ts`.
- **`identity-phrase` / `retire-087`**:
  `tools/pipeline-v2/src/commands/plan/source-refresh.ts`.
- **`public-month-selector` / `retire-085`**:
  `packages/studio-api/src/public-api.ts`.
- **`pinned-identity-month`**: `apps/web/wrangler.jsonc` is `retire-085`;
  `tools/pipeline-v2/src/commands/studio/release.ts` is `retire-086`.

### Legal grain and the terminal exception model

The scanner intentionally excludes:

- `releaseMonth` used only as a local classification, source/history-window,
  artifact-path, or storage-partition placeholder in analytics and pipeline
  modules;
- `analysisPeriod` in route-treatment, study, route-brief, and route-equity
  analysis windows;
- embedded storage/diagnostic names such as
  `local_route_reliability_baseline_release`,
  `release_month_mismatch`, and `single_release_month`;
- all broad `YYYY-MM` source/study boundaries outside the identity surfaces.

These are not allowlist entries. Initially, every reported match is retiring.
During Plan 085, the mixed `route-capability-manifest.ts` entry shrinks and is
reassigned to `retire-086`. During Plan 086, the `release-month-identity`
entries for `export/d1-inputs.ts` and `export/route-capability-manifest.ts` are
replaced with `permanent-frozen-artifact` entries only after active matches
are gone and compatibility behavior is tested. The audited terminal counts are
seven in `d1-inputs.ts` (legacy timeline 4 + detector readiness 3) and three in
`route-capability-manifest.ts` (detector readiness 3). Recompute them from the
landed tree before changing disposition; the notes must preserve this branch
breakdown. No other permanent exception is pre-approved.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Gate alone | `bun run check:month-doctrine` | exit 0 |
| Architecture | `bun run check:architecture` | exit 0 |
| Style | `bun run check:style` | exit 0 (warnings/infos may remain) |
| Knowledge | `bun run check:knowledge` | exit 0 |
| Full gate | `bun run check:prepush` | exit 0 |

## Scope

**In scope** (the only files to modify/create):

- `tests/harness/month-doctrine.test.ts` (create)
- `tests/harness/month-doctrine-allowlist.ts` (create; the existing doctrine
  ratchet is TypeScript, so keep structured entries in code)
- `package.json`
- `knowledge/wiki/engineering/studio_design_pass_status.md`
- `knowledge/log.md`
- `plans/README.md` (status row only)

**Out of scope**:

- All production files the scanner reports; this plan freezes debt and does
  not remove it.
- `tests/harness/design-doctrine.test.ts`.
- `knowledge/wiki/engineering/cli_commands.md`; it is not where the existing
  doctrine harness is documented.
- `data/**`, `knowledge/raw/**`, and all other plan files.

## Git workflow

- Branch: `codex/088-month-doctrine-gate`.
- Keep gate/allowlist and wiring/docs as separate logical commits if useful.
- Do not push or open a PR unless instructed.

## Steps

### Step 0: confirm ADR and regenerate the inventory

Confirm `docs/decisions/0022-multi-year-corpus-and-freshness-ledger.md`
exists, is Accepted, and contains the vocabulary table described by Plan 084.
Confirm plans 079 and 085-087 contain their binding plan-088 allowlist/scope
amendments. Run discovery with the rule/path pairs from Step 1 and compare
file/rule pairs to the ownership audit above. Expected reductions are safe.
Do not broaden a surface or add a vague permanent exception to make counts fit.

**Verify**: `test -f docs/decisions/0022-multi-year-corpus-and-freshness-ledger.md && rg -n 'Status|Accepted|coverage|publishedAt' docs/decisions/0022-multi-year-corpus-and-freshness-ledger.md` → file exists and the four concepts are present;
`rg -n 'month-doctrine-allowlist|retire-0(79|85|86|87)' plans/079-truthful-map-contracts.md plans/085-demonth-serving-contract.md plans/086-demonth-release-identity.md plans/087-freshness-ledger.md` → each plan has binding ratchet ownership.

### Step 1: implement precise scanner rules

Mirror `tests/harness/design-doctrine.test.ts` for Bun file walking and failure
style, but keep pure `collectViolations` and `auditAllowlist` helpers so rule
behavior can be tested with synthetic text.

Scan `**/*.{ts,tsx}` below `packages/*/src`, `apps/web/src`, and
`tools/pipeline-v2/src`, plus the exact file `apps/web/wrangler.jsonc`.
Exclude any `test`, `tests`, or `fixtures` path segment plus `node_modules`,
migrations, `.repos`, and `vendor`. JSON source captures, SQL, Markdown, and
generated data are not production TypeScript contract surfaces and are not
part of the counts above.

Create `month-doctrine-allowlist.ts` with the exported rule-ID union and an
empty readonly entry array so this first test run compiles. Use these distinct,
stable rule IDs and keep their file scopes next to their regex definitions:

1. **`retired-identity-token`**: globally match exact word-bounded
   `baselineMonth`, `BASELINE_MONTH`, `LAST_BUILT_SPEED_MONTH`,
   `canonicalMonthlyRelease`, `baseline_release`,
   `partial_public_monthly_only`, and `baseline_mismatch`. Quoted exact keys
   match. Longer storage/partition identifiers do not; for example
   `local_route_reliability_baseline_release` is legal.
2. **`release-month-identity`**: match exact word-bounded `releaseMonth` in
   these identity-bearing files only:
   `packages/analytics/src/evaluation/{build-route-capability-manifest.ts,build-route-dossier-summary.ts,map-artifacts.ts}`,
   `packages/domain/src/studio/{route-capability.ts,route-dossier.ts}`,
   `packages/studio-api/src/studio/read-handlers.ts`,
   `tools/pipeline-v2/src/commands/export/{d1.ts,route-capability-manifest.ts,route-dossier-summaries.ts}`,
   and `tools/pipeline-v2/src/commands/map/artifacts.ts`.
   In `tools/pipeline-v2/src/commands/export/d1-inputs.ts`, do **not** match
   every token. Match only `(releaseMonth)(?=\s*:\s*Schema\.)` and the
   captured token in
   `(?:projection(?:\.success)?|manifest)\.(releaseMonth)`. This reports the
   active/frozen serialized readers while excluding the local source-coverage
   path placeholders in the same file.
3. **`analysis-period-identity`**: match exact word-bounded `analysisPeriod`
   only in `apps/web/src/studio/api-client.ts`,
   `packages/analytics/src/evaluation/map-artifacts.ts`,
   `packages/domain/src/maps/index.ts`,
   `tools/pipeline-v2/src/checks/check-publish-completeness.ts`,
   `tools/pipeline-v2/src/commands/export/d1.ts`,
   `tools/pipeline-v2/src/commands/map/artifacts.ts`,
   `tools/pipeline-v2/src/commands/publish/r2-artifacts.ts`,
   and `tools/pipeline-v2/src/commands/verify/d1.ts`. In
   `tools/pipeline-v2/src/commands/studio/release.ts`, match only
   `(analysisPeriod)(?=\s*:\s*(?:options\.month|null)\b)`, the two map-fact
   output members. Do not scan `_release-types.ts` or the same file's
   route-brief input/window reads. Do not scan
   route-treatment, study, route-brief, or equity analysis-window files.
4. **`serialized-release-month`**: match exact word-bounded `release_month`
   only in `packages/analytics/src/data-products/registry.ts`. Diagnostic
   reason codes and one-month-window labels elsewhere are not serialized
   product cadence/identity.
5. **`identity-phrase`**: case-insensitively match `monthly release`,
   `baseline month`, and `release month` using `(?:[\s-]+)` between words.
   Scan raw text (including comments) only in the 11 phrase surfaces listed
   under that rule in the ownership matrix. Do not scan findings or source
   coverage modules whose month is a run/window partition.
6. **`public-month-selector`**: in public runtime source, match
   `searchParams` dot **or bracket** calls to
   `get|getAll|has|set|append|delete`, accepting single, double, or backtick
   quotes, optional chaining, and arbitrary whitespace around
   operators/arguments. Also match static `[?&]month\s*=` query fragments and
   `new URLSearchParams({... month: ...})` / quoted-key variants even when
   `month` is not the first object member. These patterns run only in
   `apps/web/src` and `packages/studio-api/src`, where `month` must not choose
   the served product.
7. **`pinned-identity-month`**: lex quoted string/template literals after
   stripping comments while preserving offsets/newlines. Flag either a whole
   literal equal to `YYYY-MM` or a local path segment matching
   `(?:^|/)YYYY-MM(?:/|$)`. Ignore URI literals beginning with a scheme such as
   `https://`, and do not flag full ISO dates/timestamps merely because their
   prefix contains a month. Use a small lexical state machine that distinguishes
   line comments, block comments, and single/double/template strings; a
   regex-only comment stripper will corrupt URL strings and escaped quotes.
   Apply this rule only to identity-bearing surfaces:
   `apps/web/src`, `packages/studio-api/src`, `apps/web/wrangler.jsonc`,
   `packages/domain/src/routes/**`, `packages/domain/src/maps/**`,
   `packages/domain/src/studio/release.ts`,
   `packages/analytics/src/evaluation/map-artifacts.ts`,
   `tools/pipeline-v2/src/commands/map/**`,
   `tools/pipeline-v2/src/commands/studio/{_release-types.ts,release.ts}`,
   `tools/pipeline-v2/src/commands/publish/**`,
   `tools/pipeline-v2/src/commands/{verify/d1.ts,export/d1.ts}`, and
   `tools/pipeline-v2/src/checks/check-publish-completeness.ts`. Do not scan
   ingest, backfill, study-engine, source-coverage, or feature-history modules
   for this rule.

Bare `month`, `startMonth`, `endMonth`, `implementationMonth`, `IsoMonth`,
month axes, coverage fields, source-grain copy, `--month` partition selectors,
`releaseMonthRowCount`, legal out-of-scope `releaseMonth`/`analysisPeriod`, and
YYYY-MM literals outside the identity surfaces must not produce violations.

**Verify**: `bun test tests/harness/month-doctrine.test.ts --timeout 5000` →
the scanner unit cases run; the current-tree assertion fails only because the
allowlist is not populated yet.

### Step 2: create the disposition-bearing ratchet

In `month-doctrine-allowlist.ts`, export sorted entries shaped as:

```ts
type MonthDoctrineAllowlistEntry = {
  file: string;
  rule: MonthDoctrineRuleId;
  count: number;
  disposition:
    | "retire-079"
    | "retire-085"
    | "retire-086"
    | "retire-087"
    | "permanent-frozen-artifact";
  note: string;
};
```

Counts are exact regex occurrence counts per file/rule. Reject duplicate
file/rule pairs, non-positive counts, missing/nonexistent files, empty notes,
unknown dispositions, unlisted violations, fewer matches (stale), and more
matches (growth). Notes for retiring entries name the exact contract family;
permanent notes identify the immutable external field and reader.

Keep `d1-inputs.ts` as `retire-086` and the initially mixed
`route-capability-manifest.ts` entry as `retire-085`, exactly as the ownership
matrix requires. Neither is permanent at gate landing; do not prematurely
freeze it. Record the audited 7/3 branch breakdown in notes, but recompute the
exact count from the landed tree before Plan 086 changes disposition.

**Verify**: `bun test tests/harness/month-doctrine.test.ts --timeout 5000` →
all current-tree and synthetic ratchet cases pass.

### Step 3: prove rule precision and wire the gate

Synthetic tests in the harness must prove:

- every quote/whitespace selector variant above fails;
- optional-chaining selectors and static `?month=` construction fail;
- every globally retired exact token fails, while an embedded storage token
  such as `local_route_reliability_baseline_release` remains legal;
- `releaseMonth` fails on each identity surface and in both contextual
  `d1-inputs.ts` reader forms, while `releaseMonthRowCount` and a
  source/history-window `releaseMonth` outside those surfaces remain legal;
- `analysisPeriod` fails on a manifest/release surface and remains legal in
  route-treatment, study, route-brief, and equity-window files;
- exact `release_month` fails in the registry but a diagnostic reason code
  outside it remains legal;
- each flexible phrase fails on its contract/copy surface and legal
  source-window copy outside that surface is ignored;
- a whole-month literal and a local `/YYYY-MM/` path segment on an identity
  surface fail even when the file contains comments, while an HTTP(S) URL path,
  a full ISO date/timestamp, and the same literal in an ingest/study file are
  ignored;
- `startMonth`, `endMonth`, `implementationMonth`, `IsoMonth`, `--month`, and
  “monthly ridership” remain legal;
- unlisted, stale, growth, duplicate, note-less, and invalid-disposition
  entries fail.

Add `check:month-doctrine` to `package.json` and place it in
`check:architecture` after `check:design-doctrine` and before
`check:claude-config`.

**Verify**: `bun run check:month-doctrine && bun run check:architecture` → both exit 0; `rg -n 'check:month-doctrine' package.json` → exactly 2 hits.

### Step 4: document and log the gate

Update `knowledge/wiki/engineering/studio_design_pass_status.md`, the current
home of `check:design-doctrine`, with the new gate, its identity-vs-grain
boundary, and shrink-only dispositions. While editing its existing ratchet
paragraph, reconcile the named design-doctrine exceptions with the live
allowlist; do not preserve the already-stale RouteMapLibre/RouteMapSection
claim. Append a `knowledge/log.md` entry and update only Plan 088's status row.

**Verify**: `bun run check:knowledge && bun run check:style` → exit 0.

### Step 5: final verification

Run `bun run check:prepush`. If the Worker harness alone fails because the
execution sandbox cannot bind loopback (`EPERM` on `127.0.0.1`), rerun that
command in an approved environment that permits the local Worker listener;
do not misreport a sandbox limitation as a doctrine failure.

**Verify**: `bun run check:prepush` → exit 0.

## Test plan

The gate is its own test. Keep the precision and ratchet cases from Step 3 as
permanent assertions; do not rely on temporarily editing production source.
The initial current-tree test proves every violation is explicitly retiring;
the permanent disposition exists only for Plan 086's later frozen-reader
transition.

## Done criteria

- [ ] ADR-0022 exists and is Accepted.
- [ ] `bun run check:month-doctrine` exits 0.
- [ ] Selector tests cover single/double/backtick quotes, whitespace, bracket
      access, and static query fragments.
- [ ] Legal-grain tests cover named month fields, CLI selectors, source copy,
      non-identity YYYY-MM literals, out-of-scope `releaseMonth` and
      `analysisPeriod`, and embedded storage/diagnostic names.
- [ ] Every allowlist entry has an exact count, disposition, and useful note;
      no entry is permanent at initial landing.
- [ ] `rg -n 'check:month-doctrine' package.json` returns exactly 2 hits.
- [ ] `bun run check:architecture`, `bun run check:knowledge`,
      `bun run check:style`, and `bun run check:prepush` exit 0.
- [ ] `git status --short` shows no files outside Scope.
- [ ] Plan 088's status row is updated.

## STOP conditions

Stop and report instead of broadening an exception when:

- ADR-0022 is absent, not Accepted, or uses different identity field names.
- A current violation has no disposition in the ownership matrix.
- A proposed permanent exception exists at initial landing or, after Plan
  086, is not an actual remaining match in the two frozen files / three
  immutable branches (legacy timeline plus both detector-readiness readers).
- A legitimate source/history/analysis-window site is reported; fix the
  surface scope instead of allowlisting the false positive.
- The refined pinned-literal rule reports a current site other than the two
  Wrangler values and the three Studio release sites (one default plus two D1
  local-path segments); inspect whether path/URI classification or comment
  stripping is wrong before assigning ownership.
- Scanner helpers cannot preserve line numbers while stripping comments, or
  selector tests reveal an accepted quote/whitespace variant.
- Wiring the check breaks an unrelated architecture script.

There is no arbitrary “more than five month literals” threshold. Legitimate
grain is excluded by rule design; every actual identity match is handled by
explicit ownership.

## Maintenance notes

- 079, 085, 086, and 087 remove their entries as they land. Fewer matches
  without an allowlist edit must fail, forcing the ratchet to shrink in the
  same commit.
- After 086, only `retire-087` plus the permanent entries may remain. After
  087, the terminal allowlist contains only the audited immutable-reader
  entries: `export/d1-inputs.ts` count 7 (timeline 4 + detector 3) and
  `route-capability-manifest.ts` count 3 (detector 3).
- If a frozen compatibility reader is later deleted, its permanent entry must
  shrink or disappear in the same commit; permanence is not a count floor.
- New permanent entries require a doctrine review; “this is convenient” is
  not a justification.
- Reviewers should scrutinize selector-pattern tests and identity-surface
  scoping. The gate protects product identity, not the existence of months.

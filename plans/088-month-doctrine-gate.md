# Plan 088: Month-doctrine harness gate — make month-targeting machine-impossible

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` (Generation 11 table).
>
> **Sequencing note**: this plan runs SECOND in generation 11 (right after
> 084), despite its number — it was numbered late to avoid renumbering after
> a concurrent-session collision claimed 082/083. It intentionally lands
> BEFORE the code sweeps (amended 079-081, 085, 086): the ratchet freezes
> today's violations and forces every later plan to delete its own entries.
>
> **Drift check (run first)**:
> `git diff --stat 27755f4..HEAD -- tests/harness package.json`
> If either changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it
> as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S-M
- **Risk**: LOW (additive check; allowlist freezes the status quo, so nothing
  existing breaks)
- **Depends on**: `plans/084-retire-month-anchors-doctrine.md` (ADR-0022 is
  the doctrine this gate enforces)
- **Category**: dx
- **Planned at**: commit `27755f4`, 2026-07-12

## Why this matters

The operator's requirement is not merely that month-anchoring be removed —
it is that "targeting of months" be **impossible to reintroduce**. This repo
already knows how to make a doctrine machine-enforced: the gen-6 design
slop-lint (`tests/harness/design-doctrine.test.ts`, plan 050) bans copy
patterns with a ratchet allowlist whose stale-entry guard forces the list to
shrink as pages are fixed, and the gen-7 schema-compat module-specifier gate
made a retired schema dialect unrepresentable. This plan applies the same
mechanism to month-identity vocabulary: a harness test that fails the build
when production source names a baseline/release month, reads a month-pinning
env var, accepts a `?month=` product selector, or hardcodes a specific
`"YYYY-MM"` literal. It lands FIRST with today's violations frozen in the
allowlist; plans 079-081 (amended), 085, and 086 each delete their entries
(the stale-entry guard forces it), and 086 asserts the terminal state. After
that, regression is a red `check:architecture`, not a code-review hope.

## Current state

- Harness precedents (copy their structure):
  - `tests/harness/production-boundaries.test.ts` — wired as root script
    `check:web-architecture` (`package.json:70`).
  - `tests/harness/design-doctrine.test.ts` — wired as `check:design-doctrine`
    (`package.json:71`), with a ratchet allowlist + stale-entry guard
    (plan 050's mechanism; plan 060 asserted its end state). Read this file
    before writing anything — the new gate should mirror its scanning,
    allowlist, and failure-message conventions.
  - `package.json:69` — `"check:architecture": "bun run check:web-architecture
    && bun run check:design-doctrine && bun run check:claude-config"`, and
    `check:architecture` runs inside `check` (:64) and `check:prepush` (:79).
- The tokens to ban exist today at (verified 2026-07-12; these become the
  initial allowlist):
  - `baselineMonth` — `packages/domain/src` (routes/index.ts ×5,
    studio/routes/index.ts ×3, studio/snapshots.ts ×4, studio/release.ts ×1,
    maps/index.ts ×4), `packages/studio-api/src` (public-api.ts,
    read-handlers.ts, route-index-read-model.ts), `apps/web/src`
    (api-client.ts).
  - `BASELINE_MONTH` / `LAST_BUILT_SPEED_MONTH` — `apps/web/wrangler.jsonc:35-36`,
    `packages/studio-api/src/env.ts:7-8`, `public-api.ts:81` + error strings,
    `source-refresh.ts` ×6, `read-handlers.ts:1787`.
  - `canonicalMonthlyRelease` — `public-api.ts:274` (+ domain schema).
  - `releaseMonth` — `packages/domain/src/studio/route-capability.ts:110`,
    `packages/analytics/src/evaluation/build-route-capability-manifest.ts`,
    `tools/pipeline-v2/src/commands/export/{d1.ts,route-capability-manifest.ts,route-dossier-summaries.ts}`,
    `packages/studio-api/src/studio/read-handlers.ts:251,271`.
  - `analysisPeriod` — `tools/pipeline-v2/src/commands/export/d1.ts:286`,
    `commands/publish/r2-artifacts.ts:164`,
    `packages/analytics/src/evaluation/map-artifacts.ts` (079's file).
  - `baseline_release` / `partial_public_monthly_only` /
    `baseline_mismatch` — domain quality enums, `public-api.ts:291-293`,
    `read-handlers.ts:408-409`, `apps/web/src/studio/api-client.ts:604-614`,
    `apps/web/src/components/route/data-quality-labels.ts`.
  - `searchParams.get("month")` — `public-api.ts:81`.
  - Pinned month literals `"20XX-XX"` in production source —
    `tools/pipeline-v2/src/commands/studio/release.ts:88-91`
    (`"2026-03"` ×3), `apps/web/wrangler.jsonc:35-36`, plus any
    history-window origin constants the scan surfaces (e.g. a study-spine
    start month near `tools/pipeline-v2/src/lib/study-engine/` — those are
    legitimate coverage-origin facts and get PERMANENT allowlist entries with
    justification notes, not fixes).
- What must NOT be banned (grain vocabulary, legitimate forever): bare
  `month`/`months` fields and args, `IsoMonth`/`IsoMonthSchema`, `dataAsOf`,
  `asOfMonth`, `startMonth`/`endMonth`, `implementationMonth`,
  `currentSignalMonth`, `latestSpeedMonth`, `latestCompleteMonth`,
  `lastBuiltMonth`, `--month` CLI window selectors,
  `socrata-monthly-ingest.ts`, month math/formatting helpers, and the word
  "monthly" in copy that names a source's grain ("Monthly ridership"). The
  gate bans IDENTITY tokens, not the concept of a month.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Run the new gate alone | `bun run check:month-doctrine` | exit 0 |
| Architecture chain | `bun run check:architecture` | exit 0 |
| Style | `bun run check:style` | exit 0 |
| Full gate (final) | `bun run check:prepush` | exit 0 |

## Scope

**In scope** (the only files you should modify/create):
- `tests/harness/month-doctrine.test.ts` (create)
- `tests/harness/month-doctrine-allowlist.json` (create — or `.ts` if the
  design-doctrine allowlist is code; match its format exactly)
- `package.json` (add `check:month-doctrine`; append it to
  `check:architecture`)
- `knowledge/wiki/engineering/cli_commands.md` or the doc that lists harness
  checks (one entry), `knowledge/log.md` (append)

**Out of scope** (do NOT touch):
- Every file the scanner flags — this plan FREEZES violations, it does not
  fix them. Zero production-source edits.
- `tests/harness/design-doctrine.test.ts` and its allowlist — sibling, not a
  merge target; a separate file keeps the two doctrines' lifecycles
  independent.
- `data/**`, `knowledge/raw/**`, `plans/**` (beyond your status row).

## Git workflow

- Branch: `advisor/088-month-doctrine-gate`.
- Two commits: (1) gate + allowlist, (2) wiring + docs.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Write the scanner test

Create `tests/harness/month-doctrine.test.ts`, mirroring
`design-doctrine.test.ts`'s structure (file walking, allowlist load, failure
messages). Rules:

1. **Scan roots**: `packages/*/src`, `apps/web/src`, `tools/pipeline-v2/src`,
   plus the single config file `apps/web/wrangler.jsonc`.
   **Excluded**: any `test`/`tests`/`fixtures` directory segment,
   `node_modules`, `packages/db/migrations`, `.repos`, `vendor`.
2. **Banned identity tokens** (exact, case-sensitive):
   `baselineMonth`, `BASELINE_MONTH`, `LAST_BUILT_SPEED_MONTH`,
   `canonicalMonthlyRelease`, `releaseMonth`, `analysisPeriod`,
   `baseline_release`, `partial_public_monthly_only`, `baseline_mismatch`,
   `searchParams.get("month")`.
3. **Banned phrases** (case-insensitive, string/comment content):
   `monthly release`, `baseline month`, `release month`.
4. **Pinned-month literal rule**: regex
   `["'\`]20[0-9]{2}-(0[1-9]|1[0-2])["'\`]` — a hardcoded specific month in
   production source is a pin. (Fixtures/tests are excluded by rule 1;
   legitimate coverage-origin constants get permanent allowlist entries.)
5. **Allowlist semantics** (ratchet): entries are
   `{ file, rule, count, note }`. A violation not covered → fail with the
   file:line and rule. An entry whose file now has FEWER matches than
   `count` → fail as STALE ("shrink the entry") — this is what forces plans
   085/086 and the amended 079-081 to delete entries as they fix code. An
   entry with more matches than `count` → fail (no silent growth). Every
   entry MUST have a non-empty `note`; permanent entries say why they are
   permanent (e.g. `route-capability-manifest.ts` reads `releaseMonth` from a
   frozen artifact of the deleted detector program — see plan 086 Step 5).

**Verify**: `bun test tests/harness/month-doctrine.test.ts --timeout 5000`
→ runs (fails — allowlist not yet written; expected at this step).

### Step 2: Freeze the allowlist

Run the scanner, capture every current violation, and write the allowlist
with per-file counts and notes of the form "retired by plan 085" / "retired
by plan 086" / "retired by amended plan 079" / "PERMANENT: <justification>".
Cross-check the note assignments against the plan scopes: domain/studio-api/
web sites → 085; pipeline release/publish/data-products sites → 086; maps +
api-client network join sites → amended 079; `source-refresh.ts` strings →
087. If the scan surfaces a site no plan owns, STOP and report it (a gap in
the plan set, not something to silently allowlist).

**Verify**: `bun test tests/harness/month-doctrine.test.ts --timeout 5000` →
exit 0 on the current tree; then temporarily add `const x = "2026-01";` to
any scanned src file → test FAILS naming the file and rule; revert; add a
fake allowlist entry for a non-existent file → test FAILS as stale; revert.

### Step 3: Wire into the architecture chain

In root `package.json`: add
`"check:month-doctrine": "bun test tests/harness/month-doctrine.test.ts --timeout 5000"`
and extend `check:architecture` (:69) to
`"… && bun run check:design-doctrine && bun run check:month-doctrine && bun run check:claude-config"`.

**Verify**: `bun run check:architecture` → exit 0; `bun run check:prepush` →
exit 0 (the gate now runs in the standard chain).

### Step 4: Docs + log

Add the check to the harness-checks documentation (wherever
`check:design-doctrine` is documented — `cli_commands.md` or the architecture
wiki page; match that location) with three sentences: what it bans, that the
allowlist only shrinks, and that permanent entries require a justification
note. Append a `knowledge/log.md` entry.

**Verify**: `bun run check:knowledge` → exit 0.

## Test plan

The gate IS a test. Its own correctness cases (executed manually in Step 2's
verify, then kept as assertions inside the test file where the
design-doctrine harness does the same): unlisted violation fails; stale
entry fails; over-count fails; note-less entry fails; clean tree passes.

## Done criteria

- [ ] `bun run check:month-doctrine` exits 0 on the frozen tree
- [ ] A deliberately added `"2026-01"` literal in `apps/web/src` makes it exit 1 (verified and reverted)
- [ ] A stale allowlist entry makes it exit 1 (verified and reverted)
- [ ] `check:architecture` includes the new check (`rg -n 'check:month-doctrine' package.json` → 2 hits)
- [ ] Every allowlist entry has a `note` naming its retiring plan or PERMANENT justification
- [ ] `bun run check:prepush` exits 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `design-doctrine.test.ts` uses a materially different allowlist mechanism
  than described (the excerpt assumptions drifted) — mirror what exists, and
  report the difference.
- The scan finds a banned-token site that no gen-11 plan or amendment owns
  (a coverage gap in the plan set — the lead must assign it, not you).
- The pinned-month literal rule flags more than ~5 legitimate coverage-origin
  constants — the rule may be too broad; report the list instead of
  allowlisting en masse.
- Adding the check to `check:architecture` breaks unrelated scripts (chain
  ordering matters somewhere) — report rather than reordering the chain.

## Maintenance notes

- The allowlist's terminal state (after 086): empty except PERMANENT entries.
  Plan 086's done criteria assert this; reviewers should reject any later PR
  that grows the allowlist instead of fixing its code.
- When amended 079/080/081 and 085/086/087 land, each deletes its entries —
  the stale-entry guard makes forgetting impossible.
- If a future feature genuinely needs a new permanent entry (another frozen
  artifact), the note requirement is the review surface — a note-less or
  vague entry is the smell.
- This gate bans vocabulary, not months: month-grain fields (`dataAsOf`,
  `startMonth`/`endMonth`, series coordinates) stay legal by design. If the
  gate ever blocks legitimate grain code, fix the rule, don't allowlist the
  code.

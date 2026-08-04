# Plan 115: Restore route facts under byte-reused releases — verify by hash + coverage, not embedded release stamps

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (Generation 21 section).
>
> **Branch base (read first)**: This plan was audited against
> `origin/main@e0c00aaf`. The local checkout `ops/gen18-artifact-publication`
> is ~122 commits BEHIND main with a stale dirty tree — do NOT branch from it.
> Start from a fresh branch off current `origin/main`.
>
> **Drift check (run first)**:
> `git fetch origin && git diff --stat e0c00aaf..origin/main -- apps/web/src/studio/api-client.ts apps/web/src/components/route/route-fact-evidence.ts apps/web/test/shared/api-client.test.ts`
> If any listed file changed since `e0c00aaf`, compare the "Current state"
> excerpts below against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (Plan 116's next activation makes this fix *necessary again*, so land 115 first)
- **Category**: bug
- **Planned at**: commit `e0c00aaf` (origin/main), 2026-08-02

## Why this matters

The Plan 098 activation on 2026-08-01 minted release `pub_20260801T232501631Z`
and re-pointed it at deduplicated, byte-identical artifacts from the previous
release. Those artifact bodies embed the previous release's identity
(`pub_20260725T164123260Z` / `2026-07-25T16:41:23.260Z`). The web client
requires strict equality of embedded `releaseId` + `publishedAt` against the
manifest, so it discards ALL route facts: the network map shows "0/348
verified routes" with a full "no data" legend band, the rider-delay lens is
disabled citywide, every popup shows "No data", and every route-detail
Segments tab shows "verified exposure unavailable" with "—" for rider-hours —
even though every artifact hashes exactly to the SHA-256 the manifest
declares and all 14 per-route parity values agree (verified against
production on 2026-08-02, route BX20).

Under Plan 098's own doctrine, artifacts are content-addressed and release
identity is an activation-time property of the *manifest*, not the bytes.
An artifact whose SHA-256 matches the manifest's declaration IS the artifact
this release intends. This plan makes the client treat the manifest as the
identity authority: integrity = declared-hash match; compatibility = coverage
match. Embedded stamps become informational. Deduplicated re-pointing then
works by construction, and this exact regression class gets a test.

**Operator-confirmed symptom set (2026-08-02, after the gen-17 close).**
With the full-history publications landed (Plans 099-101 closed with
production receipts), the network map STILL renders every legend band at
zero — "under 7 (0) / 7 to 8 (0) / 8+ typical or faster (0) / no data
(349)" — and the lens/period toggles collapse to single-option "Speed" /
"All day" stubs (`delayEligible`/`amEligible`/`pmEligible` all false). The
data is published; the client discards it. This plan is the fix for that
symptom. Plan 121 separately stops RENDERING degenerate single-option
toggles and an all-zero legend, so if this state ever recurs the map
degrades quietly instead of absurdly.

## Current state

Files:

- `apps/web/src/studio/api-client.ts` — network-map bundle join; the strict
  identity check and the mismatch messages (lines 736-742, 776-785, 861-878).
- `apps/web/src/components/route/route-fact-evidence.ts` — per-route parity
  table used by route detail; identity comparison rows (lines 115-121).
- `apps/web/src/components/route/use-route-fact-evidence.ts` — hook feeding
  OverviewSection / SegmentExplorer / Riders surfaces (consumer only; no edit
  expected).
- `apps/web/test/shared/api-client.test.ts` — pins the current mismatch
  messages and join behavior.
- Render sites (consumers, for context): `apps/web/src/studio/pages/network-map.tsx:781`
  (`{completeFactCount}/{n} verified routes`), `:793-798` (`mapMessage` status
  paragraph); `apps/web/src/components/route/SegmentExplorer.tsx:843-847`
  (`delayEvidenceAvailable`), `:913-914` ("verified exposure unavailable").

Excerpts as of `e0c00aaf` — `apps/web/src/studio/api-client.ts:736-742`:

```ts
function releaseIdentityMatches(left: ReleaseIdentityLike, right: ReleaseIdentityLike): boolean {
  return (
    left.releaseId === right.releaseId &&
    left.publishedAt === right.publishedAt &&
    coverageMatches(left.coverage, right.coverage)
  );
}
```

`api-client.ts:776-785`:

```ts
  const networkIdentityMismatch = !releaseIdentityMatches(bundle.network.data, bundle.manifest);
  const routeFactsIdentityMismatch =
    bundle.routeFacts.status === "ready" &&
    (bundle.manifest.routeFacts.status !== "available" ||
      !releaseIdentityMatches(bundle.routeFacts.data, bundle.manifest) ||
      !releaseIdentityMatches(bundle.routeFacts.data, bundle.network.data) ||
      !releaseIdentityMatches(bundle.routeFacts.data, bundle.manifest.routeFacts));
  const coverageMismatch = networkIdentityMismatch || routeFactsIdentityMismatch;
  const facts =
    bundle.routeFacts.status === "ready" && !coverageMismatch ? bundle.routeFacts.data : null;
```

`api-client.ts:861-865` (the message; note the first branch prints a coverage
contrast even when both coverage labels are identical — production today
renders "Manifest covers 2023-04 through 2026-05, but map geometry covers
2023-04 through 2026-05. Release identity mismatch: expected
pub_20260801T232501631Z published …; received pub_20260725T164123260Z
published …" as a public status paragraph):

```ts
  const coverageMismatchMessage = networkIdentityMismatch
    ? `Manifest covers ${coverageLabel(bundle.manifest.coverage)}, but map geometry covers ${coverageLabel(bundle.network.data.coverage)}. Release identity mismatch: expected ${releaseIdentityLabel(bundle.manifest)}; received ${releaseIdentityLabel(bundle.network.data)}.`
    : routeFactsIdentityMismatch && bundle.routeFacts.status === "ready"
      ? `Map geometry covers ${coverageLabel(bundle.network.data.coverage)}, but route facts cover ${coverageLabel(bundle.routeFacts.data.coverage)}. Release identity mismatch: manifest ${releaseIdentityLabel(bundle.manifest)}; network ${releaseIdentityLabel(bundle.network.data)}; route facts ${releaseIdentityLabel(bundle.routeFacts.data)}; manifest reference ${bundle.manifest.routeFacts.status === "available" ? releaseIdentityLabel(bundle.manifest.routeFacts) : "unavailable"}.`
      : null;
```

`apps/web/src/components/route/route-fact-evidence.ts:115-121` (first rows of
the parity table; the two identity rows make `resolveRouteFactEvidence`
return `status: "mismatch"` for every route today):

```ts
  const comparisons: Array<
    readonly [field: string, expected: ComparableFactValue, actual: ComparableFactValue]
  > = [
    ["releaseId", manifest.releaseId, response.releaseId],
    ["publishedAt", manifest.publishedAt, response.publishedAt],
    ["release.coverage.start", manifest.coverage.start, response.coverage.start],
    ["release.coverage.end", manifest.coverage.end, response.coverage.end],
```

Design context the plan must honor (from `plans/079-truthful-map-contracts.md`,
binding 2026-07-12 amendment — the file was deleted from main by Plan 113;
read it via `git show fbbed5e1^:plans/079-truthful-map-contracts.md`):

> The client mismatch state is named `coverage_mismatch` (not
> `baseline_mismatch`) and its message speaks coverage, e.g. "Map geometry
> covers 2026-05, but route facts cover 2026-03."

The plan-sanctioned public message is the coverage sentence ONLY. Raw
`pub_…` identifiers and publish timestamps in public body copy were never
specified and must not survive this plan (they may appear in the Data notes
sheet, which already exists at
`apps/web/src/components/route/NetworkMapDataNotes.tsx`, or in `console.warn`).

SHA-256 integrity verification of both artifacts against the manifest's
declared hashes already exists upstream of the join (the `integrity_mismatch`
states in the same file) — do not weaken it; it is what makes this change
safe.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web unit tests (scoped) | `bun test apps/web/test/shared/api-client.test.ts --timeout 10000` | exit 0, all pass |
| Full web tests | `bun test apps/web/test --timeout 15000` | exit 0 |
| Typecheck | `bun run check:types` | exit 0 (script already sets an 8GB heap) |
| Web build + bundle budget | `bun --filter @bp/web build` | exit 0 |
| Doctrine harness | `bun run check:architecture` | exit 0 |

If a command errors as "unknown script", read root `package.json` scripts and
use the closest equivalent; if the named test file does not exist, STOP.

## Scope

**In scope** (the only files you should modify):

- `apps/web/src/studio/api-client.ts`
- `apps/web/src/components/route/route-fact-evidence.ts`
- `apps/web/test/shared/api-client.test.ts`
- The test file covering `route-fact-evidence` (locate with
  `rg -l "resolveRouteFactEvidence" apps/web/test`; create a case there, or a
  new sibling test file if none exists)

**Out of scope** (do NOT touch, even though they look related):

- Any pipeline/publication code (`tools/pipeline-v2/**`) — stopping the
  builders from embedding `releaseId`/`publishedAt` in artifact bodies is
  Plan 101-sweep territory and requires a republication; this plan is
  client-side only.
- The SHA-256 integrity checks and `integrity_mismatch` states — keep intact.
- `packages/domain` response schemas — embedded fields stay in the schema;
  they become informational.
- `NetworkMapDataNotes.tsx` — optional identity detail there is a follow-up,
  not this plan.

## Git workflow

- Branch off current `origin/main`: `codex/115-route-facts-byte-reuse`
- Commit per step; subject style matches repo history (short imperative, e.g.
  "apps/web: join route facts by hash and coverage").
- Do NOT push or open a PR unless the dispatching operator instructed it.

## Steps

### Step 1: Characterize the current behavior with a failing-fixture test

In `apps/web/test/shared/api-client.test.ts`, find the existing
`joinNetworkMapBundle` tests and add one new test: a bundle whose manifest
carries release A (`pub_B...` current) while `network.data` and
`routeFacts.data` carry release B (older `releaseId`/`publishedAt`), with
IDENTICAL coverage everywhere and both artifact statuses `"ready"` (integrity
already passed upstream). Assert the CURRENT behavior first to prove you have
the right fixture: `factsStatus === "coverage_mismatch"` and the message
contains "Release identity mismatch". Model the fixture on the neighboring
tests' bundle literals.

**Verify**: `bun test apps/web/test/shared/api-client.test.ts --timeout 10000`
→ all pass including the new characterization test.

### Step 2: Redefine the join's compatibility check

In `apps/web/src/studio/api-client.ts`:

1. Replace the `networkIdentityMismatch` / `routeFactsIdentityMismatch`
   computations (lines 776-782) so they use `coverageMatches(...)` on the
   same object pairs instead of `releaseIdentityMatches(...)`. Keep the
   `bundle.manifest.routeFacts.status !== "available"` guard.
2. Delete `releaseIdentityMatches` (it will have no remaining callers —
   confirm with `rg -n "releaseIdentityMatches" apps/web/src`).
3. Rewrite the message construction (lines 861-865): the coverage-contrast
   sentence renders ONLY when the two coverage labels actually differ, in the
   Plan 079 form ("Map geometry covers X, but route facts cover Y."). Delete
   the "Release identity mismatch: …" suffix and `releaseIdentityLabel` if it
   loses all callers. There is no identity-skew message anymore: identical
   coverage + verified hashes = compatible, message `null`.
4. Do not change the `integrity_mismatch` branches. The
   `factFailureMessage` at line 857-860 (integrity SHA text) may keep its
   hashes for now — it indicates real corruption, not routine skew; shorten it
   only if trivial.

Flip the Step 1 test's assertions: same fixture now expects
`factsStatus === "ready"`, `message === null`, and `completeFactCount > 0`.
Add a second new test: identical identity but coverage genuinely different →
`factsStatus === "coverage_mismatch"` with the coverage-contrast message and
NO raw release identifiers in the string (`expect(message).not.toMatch(/pub_/)`).

**Verify**: `bun test apps/web/test/shared/api-client.test.ts --timeout 10000`
→ all pass. Then `rg -n "Release identity mismatch" apps/web/src` → no matches.

### Step 3: Drop the identity rows from the route-fact parity table

In `apps/web/src/components/route/route-fact-evidence.ts`, delete the two
rows `["releaseId", …]` and `["publishedAt", …]` (lines 118-119). Keep all
coverage rows and all value rows — they are the real cross-artifact defense.
Update/add tests: a response stamped with an older `releaseId`/`publishedAt`
but matching coverage and matching values resolves `status: "available"`;
a response with a WRONG `route.speedMph` still resolves `status: "mismatch"`.

**Verify**: `bun test apps/web/test --timeout 15000` → exit 0, including the
new cases.

### Step 4: Full gates

**Verify**, in order:
1. `bun run check:types` → exit 0
2. `bun --filter @bp/web build` → exit 0 (bundle budget passes; this change
   only removes code)
3. `bun run check:architecture` → exit 0
4. `git status --porcelain` → only in-scope files modified

## Test plan

- New tests in `apps/web/test/shared/api-client.test.ts`: (1) byte-reuse
  regression — older embedded stamps + equal coverage + ready statuses →
  `ready`, `message null`; (2) genuine coverage skew → `coverage_mismatch`,
  coverage-form message, no `pub_` substring; (3) existing message-pinning
  tests updated to the new strings.
- Route-fact-evidence tests: older stamps + equal coverage/values →
  `available`; value disagreement still → `mismatch`.
- Pattern to model: the existing `joinNetworkMapBundle` cases in
  `api-client.test.ts`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun test apps/web/test --timeout 15000` exits 0; the byte-reuse
      regression test exists and passes
- [ ] The fixture-backed join test (byte-reused release fixture) asserts
      non-zero legend band counts and delay/AM/PM eligibility; after deploy,
      a production probe confirms the legend no longer reads all-(0)
- [ ] `rg -n "releaseIdentityMatches|Release identity mismatch" apps/web/src`
      → no matches
- [ ] `rg -n '"releaseId", manifest.releaseId' apps/web/src/components/route/route-fact-evidence.ts`
      → no matches
- [ ] `bun run check:types`, `bun --filter @bp/web build`,
      `bun run check:architecture` all exit 0
- [ ] No files outside the in-scope list modified
- [ ] `plans/README.md` gen-21 status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts above don't match the live code (drift since `e0c00aaf`).
- You find a caller that depends on the identity-equality behavior for
  something other than the map join / route-fact parity (search
  `rg -n "coverage_mismatch" apps/web/src` and check each consumer renders a
  state, not logic).
- Removing the identity rows breaks a test that asserts identity mismatch is
  user-visible — that would mean a product surface intentionally surfaces
  release skew; report which.
- You are tempted to touch pipeline stamping or schemas — out of scope.

## Maintenance notes

- Plan 116's June/July activation will again re-point byte-identical objects;
  after this plan that is fine by construction. If a future plan removes the
  embedded `releaseId`/`publishedAt` from artifact BODIES (the cleaner
  long-term fix, Plan 101's vestige-sweep territory), the schema fields become
  optional and this client code needs no further change.
- Reviewer should scrutinize: that SHA verification still gates the join
  upstream (the `integrity_mismatch` branches), and that no public string can
  contain `pub_` identifiers.
- Deferred: showing release identity inside the Data-notes sheet; pipeline-side
  de-stamping.

# Plan 083: Spine pattern-grouping spike — measure whether the 267 `needs_pattern_review` routes (and the 39 blocked ACE studies) can be unlocked without weakening identity

> **Executor instructions**: This is an INVESTIGATION/SPIKE plan — it produces
> measurement tables, pure prototypes, and a decision document, NOT production
> artifact or schema changes. Follow the steps, honor STOP conditions, and
> update the status row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 99fa763..HEAD -- packages/analytics/src/feature-history/route-speed-spine.ts tools/pipeline-v2/src/commands/studio/route-speed-spine.ts tools/pipeline-v2/src/commands/studio/route-speed-spines.ts`
> The tree at planning time was dirty (plan 074/079 execution in flight);
> compare the "Current state" excerpts against live code before proceeding.

## Status

- **Priority**: P2
- **Effort**: M (spike)
- **Risk**: LOW (nothing production-facing changes; prototypes are pure and
  run against existing artifacts)
- **Depends on**: plans/078-canonical-map-segment-identity.md (DONE — this
  spike studies its readiness classifier's output); plan 074's approval
  receipt and review report (already on disk) as fixed inputs.
- **Category**: direction (design/spike)
- **Planned at**: commit `99fa763`, 2026-07-12

## Why this matters

The plan 074 study engine can only study routes whose segment spine is
`series_ready` or `series_ready_with_gaps`. The current spine manifest
classifies **267 of 385 routes `needs_pattern_review`** (93 `series_ready`,
25 `series_ready_with_gaps`, 0 `failed`). The 2026-07-12 operator review of
403 study candidates approved only 5 — and its single largest recoverable
rejection bucket is **39 calendar-eligible ACE candidates rejected solely
because their route remained `needs_pattern_review`** (see
`data/study-event-approvals/reviews/candidate-set-49af8c8721457fa7532a7345.review-report.md`,
"Uncertain and high-scrutiny cases" item 2 — the full 39-route list with
candidate IDs is there). These candidates have authoritative exact-route
onsets from the trusted `mta_ace_routes` source and valid observation
windows; the ONLY blocker is spine coverage classification.

The classifier itself names the fix: its reason code is
`partial_months_require_pattern_grouping`. If pattern grouping can lift even
half of those 39 routes to eligibility WITHOUT weakening the exact-identity
guarantees plan 078 established, the honest path from 5 studies to tens of
studies is: grouping work → spine rebuild → a batch-2 operator review of just
the newly eligible candidates → `study run`. This spike determines whether
that is possible and worth it — by measurement, not argument. No standards
are relaxed: readiness thresholds and review conservatism stay exactly where
they are (thresholds change only by operator decision — plan 074 rule).

## Current state

All excerpts verified at commit `99fa763`.

- **The classifier**:
  `packages/analytics/src/feature-history/route-speed-spine.ts:971-1027`,
  function `classifyRouteSpeedSpineArtifact`. The decision ladder
  (lines 997-1012):

```ts
let readiness: RouteSpeedSpineReadiness;
if (
  artifact.validation.status === "fail" ||
  artifact.summary.spineSegmentCount === 0 ||
  monthCount === 0
) {
  readiness = "failed";
} else if (partialCoverageMonthCount === 0) {
  readiness = "series_ready";
  reasons.push("full_spine_coverage_all_months");
} else if (minCoverageShare >= 0.75 && partialCoverageMonthShare <= 0.25) {
  readiness = "series_ready_with_gaps";
  reasons.push("partial_months_within_gap_tolerance");
} else {
  readiness = "needs_pattern_review";
}
```

  Reason codes computed above it (lines 988-995) include
  `low_monthly_spine_coverage` (minCoverageShare < 0.75),
  `partial_months_require_pattern_grouping` (partialCoverageMonthShare >
  0.25), and `high_raw_key_drift_collapsed_by_spine`
  (rawKeyDriftMonthShare > 0.5). The audit object it returns carries
  `coverage` with all the shares — the manifest therefore already contains
  per-route diagnosis material.

- **The readiness manifest** (the spike's primary input):
  `data/artifacts/studio/v2/speed-spines/2023-04_to_2026-03/manifest.json`
  (~342KB). Verified counts by status: `needs_pattern_review` 267,
  `series_ready` 93, `series_ready_with_gaps` 25. Inspect its per-route
  entry shape with `jq` before scripting against it. Per-route spine
  artifacts live beside it under the same
  `data/artifacts/studio/v2/speed-spines/2023-04_to_2026-03/` directory —
  `ls` that ONE directory to learn the layout. **`data/` is ~409GB overall:
  never run find/grep/du across `data/` broadly; touch only this directory,
  the review-report path above, and `data/artifacts/studio/v2/studies/`.**

- **The blocked-candidate list**: the review report's item-2 list (39
  candidates, each `study-event:<id> (ROUTE, YYYY-MM-DD)`). Six additional
  ACE candidates were rejected as "later phase after existing ABLE" and one
  (M96) for same-route overlap — those are NOT unlockable by spine work;
  exclude them from the target cohort.

- **Spine build commands**:
  `tools/pipeline-v2/src/commands/studio/route-speed-spine.ts` (single route)
  and `route-speed-spines.ts` (batch + manifest). Read their `defineCommand`
  descriptors for exact flags before running anything; run them ONLY with an
  `--output`/root override pointing into a scratch directory if a rebuild is
  needed for prototyping (do NOT overwrite the production
  `2023-04_to_2026-03` artifacts).

- **Identity doctrine (binding, from plan 078 / gen-9)**: one exact source
  key, ambiguity-rejecting crosswalks, no fuzzy or positional joins. Any
  grouping strategy that associates raw segment keys by similarity, position,
  or proximity is out of bounds by construction. Grouping may only merge keys
  the data proves are the SAME segment identity (e.g. exact alias sets
  observed to be mutually exclusive in time with identical stop-pair
  endpoints), or may re-profile month coverage expectations for documented
  service patterns.

- **Study-engine eligibility rule being targeted** (context, do not modify):
  plan 074 method spec §2 — only `series_ready` and `series_ready_with_gaps`
  routes enter segment study estimation.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Analytics tests | `bun --filter @bp/analytics test` | all pass (unchanged) |
| Pipeline tests | `bun --filter @bp/pipeline-v2 test` | all pass (unchanged) |
| Typecheck | `bun run check:types` | exit 0 |
| Inspect manifest | `jq '<query>' data/artifacts/studio/v2/speed-spines/2023-04_to_2026-03/manifest.json` | numbers used in the findings doc |

(If the analytics filter name differs, find it in `packages/analytics/package.json` `name` field.)

## Scope

**In scope**:
- `docs/research/spine-pattern-grouping-findings.md` (new — measurement + taxonomy)
- `docs/research/spine-pattern-grouping-decision.md` (new — strategies, flip counts, recommendation)
- `packages/analytics/src/feature-history/` — new PURE prototype module
  `spine-pattern-grouping-prototype.ts` + a test file beside its siblings
  (prototype functions compute would-be readiness; nothing existing changes)
- A scratch directory under the session scratchpad or `/tmp` for any
  experimental spine rebuild output
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- The production spine artifacts and manifest under
  `data/artifacts/studio/v2/speed-spines/` — read-only inputs.
- `classifyRouteSpeedSpineArtifact` thresholds (0.75 / 0.25 / 0.5) — they
  change only by operator decision, recorded in plan 074's terms.
- The candidate set, approval receipts, `study run`, or anything under
  `data/study-event-approvals/` — batch-2 review is a FOLLOW-UP the decision
  doc commissions, not this plan.
- `apps/web/**`, `packages/studio-api/**`, `packages/domain/**`.

## Git workflow

- Branch: `advisor/083-spine-grouping-spike` off the current branch.
- Commit per step; short imperative messages matching `git log --oneline` style.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Measure the blocked cohort

Extract the 39 blocked ACE routes (review report item 2; parse route IDs from
the list). From the spine manifest, produce a table in
`docs/research/spine-pattern-grouping-findings.md`: route, readiness,
`minCoverageShare`, `partialCoverageMonthCount`, `partialCoverageMonthShare`,
`rawKeyDriftMonthShare`, reason codes. Add three distribution summaries: how
many of the 39 sit within 0.10 of the 0.25 partial-share threshold ("near
misses"), how many carry `high_raw_key_drift_collapsed_by_spine`, and the
same two stats for the full 267-route `needs_pattern_review` population
(the 39 are the priority, but the fix should be judged network-wide).

**Verify**: the table has exactly 39 rows; its readiness column is
`needs_pattern_review` for every row (if any route has since reclassified,
flag it — that candidate may already be reviewable); the two population
counts match `jq` totals from the manifest (267 / 93 / 25).

### Step 2: Taxonomy — WHY are months partial

Pick 5 representative routes from the 39 (include at least one near-miss and
one deep case). For each, open its per-route spine artifact and classify each
partial month's missing segments into: (a) raw-key drift (same physical
segment under a different source key that month — check the artifact's
`sourceKeys`/drift fields), (b) pattern variance (segments genuinely absent
that month — seasonal/holiday/short-turn service), (c) redesign/renaming
events (cluster at a known date, e.g. Queens mid/late-2025), (d) true data
gaps. Add the taxonomy per route to the findings doc with counts per class.
This step is reading artifacts and code (`route-speed-spine.ts` builds the
`monthCoverage` rows — read how `coverageShare` is computed), not new
machinery.

**Verify**: every partial month of the 5 routes is classified; the dominant
class is named per route.

### Step 3: Prototype ≥2 grouping strategies (pure, no production changes)

In `packages/analytics/src/feature-history/spine-pattern-grouping-prototype.ts`,
implement at least two candidate strategies as pure functions over the
existing spine artifact shape, each returning a re-audited readiness:

- **Strategy A — exact alias-set canonicalization**: merge raw keys into one
  spine identity ONLY when their stop-pair endpoints are identical and their
  observed months are disjoint (a rename, not two segments). This targets
  taxonomy class (a).
- **Strategy B — pattern-profile coverage**: compute expected segment sets
  per recurring service pattern (e.g. months where a documented short-turn
  variant runs) and score coverage against the applicable profile instead of
  the union spine. This targets class (b). If step 2 shows class (b) is
  rare, substitute a strategy that targets the actual dominant class and say
  so.

Both must be ambiguity-rejecting: any key that could merge into two
identities merges into none (mirror plan 078's crosswalk doctrine). Unit
tests with synthetic artifacts where the correct answer is known by
construction: a rename-only route flips to `series_ready` under A; a
genuinely gappy route does NOT flip under either; an ambiguous alias is
rejected.

Then run both prototypes over the real manifest + per-route artifacts and
record in the decision doc: per strategy, how many of the 39 flip to
`series_ready`/`series_ready_with_gaps`, how many of the 267 flip
network-wide, and 2 worked examples each (before/after coverage numbers).

**Verify**: `bun --filter @bp/analytics test` passes including the new
tests; `bun run check:types` exits 0; the flip counts print from a
deterministic run (same input → same counts).

### Step 4: Decision document, then STOP

Write `docs/research/spine-pattern-grouping-decision.md` (model its shape on
`docs/research/opportunity-layer-decision.md` if it exists, else on plan
076's step-3 spec): method summary, flip counts per strategy, identity
guarantees preserved/at-risk per strategy, estimated effort to productionize
the recommended strategy (which files: `route-speed-spine.ts` builder +
`route-speed-spines` command + manifest rebuild), and the follow-up chain it
commissions: productionize → rebuild spines → NEW candidate set id → batch-2
operator review of only the newly eligible candidates (prior receipt stays
binding for its set; rejected candidates are never silently readmitted) →
`study run`. End with an explicit recommendation and open questions.
**STOP — the operator decides whether to commission the implementation.**

## Test plan

- Unit tests for each prototype strategy with known-answer synthetic
  artifacts (step 3 list: rename flip, no-flip gappy route, ambiguity
  rejection — minimum 6 cases across the two strategies).
- No production behavior changes to assert; `bun --filter @bp/analytics
  test` and `bun --filter @bp/pipeline-v2 test` must remain green to prove
  the prototype touched nothing live.

## Done criteria

- [ ] `docs/research/spine-pattern-grouping-findings.md` exists: 39-row cohort table + near-miss/drift distributions for the 39 and for all 267
- [ ] Taxonomy for 5 routes with every partial month classified
- [ ] ≥2 pure prototype strategies with ≥6 known-answer unit tests, all passing
- [ ] Real-data flip counts recorded for both the 39-route cohort and the 267-route population
- [ ] `docs/research/spine-pattern-grouping-decision.md` exists with recommendation + commissioned follow-up chain
- [ ] `git status` shows NO changes under `data/`, `apps/web/`, `packages/studio-api/`, `packages/domain/`, or to `route-speed-spine.ts`
- [ ] `bun --filter @bp/analytics test`, `bun --filter @bp/pipeline-v2 test`, `bun run check:types` all exit 0
- [ ] `plans/README.md` status row updated (DONE = spike delivered, decision pending)

## STOP conditions

Stop and report back (do not improvise) if:

- The per-route spine artifacts do not exist beside the manifest (the spike
  assumed they are on disk; if only the manifest survives, a scratch rebuild
  via `route-speed-spines --output <scratch>` is needed — report the disk
  cost first; the volume is 91%+ full).
- Every strategy that produces meaningful flips requires similarity/position
  joins or threshold changes — report "no honest unlock exists"; that is a
  valid spike outcome, not a failure to route around.
- The manifest's readiness counts no longer match this plan's numbers
  (a spine rebuild happened since 2026-07-12) — re-derive the cohort from
  the CURRENT manifest and note the delta.
- Step 2 taxonomy shows the dominant cause is true data gaps (class d) —
  grouping cannot fix absent data; report and recommend closing the spike.

## Maintenance notes

- If the operator commissions the implementation, that plan must bump the
  spine artifact/engine version, rebuild the manifest, and route ALL
  downstream consumers (study engine eligibility, review batch-2 candidate
  build) through the new candidate-set-id flow — never mutate the reviewed
  `candidate-set:49af8c8721457fa7532a7345` artifacts.
- The 6 "later ACE phase after ABLE" rejections and the M96 overlap rejection
  are ontology/overlap questions, not spine questions — if the operator wants
  those studied, that is a separate candidate-ontology decision (treatment
  phase identity), deliberately not part of this spike.
- Watch for interaction with gen-9 plan 079's map release contracts: the
  spine manifest feeds both maps and studies; a readiness reclassification
  changes what maps may claim as ready. The decision doc must name this
  coupling for the operator.

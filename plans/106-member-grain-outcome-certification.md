# Plan 042: Certify outcomes at treated grain in the tracker: verdict-aware candidates, bounded-extent→segment binding, and per-family outcome-product decisions

> **Execution protocol override (2026-07-23)**: Run this plan under
> `plans/README.md` accelerated checkpoint mode, translated to the tracker gates
> named below. Its package sizing, checkpoint cadence, risk-based review, compact
> owner-gate, and evidence-preservation rules override the older per-batch cadence.

> **REPOSITORY**: `/mnt/models/dev/bus-reliability-tracker` (the downstream
> consumer). This plan follows the TRACKER's conventions: its `plans/` directory
> is git-tracked (generations lineage, currently through Plan 096 on branch
> `codex/member-grain-consumer-migration`), verification is `bun run check`
> (types + style + architecture + test), and pipeline commands run via
> `bun run pipeline -- <cmd>`. Do not apply mta-wiki house rules here.
>
> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in the "STOP conditions" section occurs, stop and report. This plan
> authorizes contract/admission work only — NO study runs, no publication, no
> D1/R2 mutation, no deploy, and the Plans 074/075 causal gates remain
> byte-for-byte unchanged (the standing Plan 093 doctrine).
>
> **Execution reconciliation (2026-07-24)**: Consume the exact Plan-039 token
> `binding_absent_after_search`. Bind bounded extents against the Plan-096-pinned
> `RouteSpeedSpineArtifact` stop identities
> (`nodes[].sourceStopIds` and
> `segments[].raw.sourceStopPairs[].fromStopId/toStopId`), not Studio display
> labels. Resolve producer GTFS direction `0`/`1` only by a unique ordered
> boundary-stop orientation; never invent a cardinal-direction crosswalk.
> Preserve the fixed Plan-096 spine inventory
> 393 total / 91 `series_ready` / 25 `series_ready_with_gaps` /
> 277 `needs_pattern_review` / 0 failed. Version the relevance/spec contract:
> `supported_analyst_grain` is a grain verdict, not a V1 relevance status, and
> `local_observed_headway_samples_run` is the product id
> (`local_observed_headway_sample` is only the raw table). Q61 lineage may use
> only Plan-041's typed reviewed exact old/new bindings; names or coordinates
> cannot create a Q15/Q34 crosswalk.
> Candidate reconciliation after the Plan-041 cut: candidate-set v4 has 323
> `nyc_dot` registry-provenance candidates, while the identity-verdict companion
> intentionally covers the exact 321 unresolved registry-only candidates. The
> other two are already occurrence-backed B41/B67 Flatbush rows for
> `occurrence:8c987...` and retain registry provenance through that occurrence.
> Enforce `321 == 321` over the unmatched registry-only denominator; do not
> fabricate verdict rows for the two resolved occurrence-backed dedupes.
> The complete no-member denominator also contains 66 ACE registry candidates.
> Eight already carry accepted Plan-096 route-wide registry scope/product
> decisions; preserve them exactly. Thus the Step-4 complete denominator is
> 695 rows: 308 producer member-grain rows plus one candidate-level row for each
> of 387 no-member candidates (321 terminal bus-lane + 66 ACE), not 629.
> The 308 producer rows cover 168 distinct occurrence×route groups. Candidate
> set v4 materialized only 97 of those groups (236 producer rows); its other 71
> occurrence×route groups (72 producer rows) were source-rejected before the
> Plan-041 closure companions existed. Candidate set v5 must therefore contain
> 555 visible candidates: 168 occurrence×route candidates plus the 387
> no-member candidates. It must not collapse the 308-row matrix denominator to
> the candidate count or retain the obsolete 484-candidate v4 total.
> Analyst-grain stop-set admission remains evidence-conditional. The pinned
> Plan-096 database contains zero observed-headway rows; an unrelated live
> database is not an admissible input, and several Queens stop IDs have
> one-sided June-27/June-30 coverage. Product-registry existence alone cannot
> yield `grain_matched_analyst`. Require a frozen candidate-specific coverage
> receipt plus typed stop-ID lineage; otherwise emit a named authority-false
> block without weakening the owner-authorized analyst-grain contract.
>
> **Evidence-triggered amendment (2026-07-24)**: read-only preflight over the
> exact Plan-041 producer rows and Plan-096 spine inventory activated the
> original `<50%` bounded-binding STOP. The 48 bounded extents split as 39 on
> `needs_pattern_review`, seven on `series_ready`, and two on
> `series_ready_with_gaps`; direct exact boundary-stop binding succeeds for
> zero of the seven `series_ready` rows. Q45 and Q80 carry symbolic corridor
> endpoints, while each Q61 chain lacks at least one reviewed exact endpoint
> equivalence. Under the owner's exact-positive and accelerated fail-closed
> rules, this plan is amended rather than allowed to infer containment:
> preserve every producer positive, emit candidate-specific authority-false
> `blocked:missing_endpoint_stop_id_equivalence` receipts for unbindable rows,
> and separate any later authoritative endpoint-equivalence acquisition into a
> risk-reviewed successor package. This amendment closes the current matrix
> honestly; it does not authorize an occurrence, a segment match, or a Q61
> common-segment frame.
>
> **Pinned tracker verification baseline (clean `b25542b0`)**: the aggregate
> `bun run check` short-circuits at the pre-existing Biome phase, so Plan 042
> must compare the separately captured phases instead of claiming a green
> baseline. `check:style` exits 1 with 6 errors / 39 warnings / 514 infos over
> 1,107 files (log SHA-256 `09e7075ece995d92804e7f481fb420594d3cc5e143ca1696994789db604a10c6`);
> `check:architecture` passes 27 + 5 + 10 tests plus config verification
> (`4dc4f5ce49bf4d79216f53a4c00b02949e9582805b876e184462a164c3dd39a7`);
> `test:unit` passes 1,056 / fails 0
> (`0a16ce191a70f143d7715629649f35590aa79aa04a999c4c4a9b95d4a027af1c`);
> `test:web` passes 342 / fails 0
> (`63ff40e037a2a25147f54c77634513f23adf51f4865553d7348521a99b4e111d`);
> `test:worker` exits 1 only with the sandbox signature
> `listen EPERM 127.0.0.1`
> (`b4f2a914a8841f2d118d24e6f72de96e6d8a61c9260930e175b32ea76a39425f`).
> Captures are under `/tmp/plan042-baseline-logs`. Pin this signature once;
> do not edit unrelated baseline files or repeatedly isolate it. Final gates
> require focused Plan-042 tests, typecheck, deterministic replay, zero
> additional style errors, architecture/unit/web parity, and only the identical
> worker sandbox error.
>
> **Drift check (run first)**: Plan 041's verified producer release must exist
> with its identity-verdict fixture, member-extent companion at closure state,
> and `operational-occurrence-member-grain-v1` fixture/companion. The downstream
> pin is intentionally still old until plan 043.
> Tracker Plan 096 must be DONE. The reviewed branch tip was `d4876431`
> ("Land Plan 096 reviewed universe"); current mainline contains its
> tree-identical squash merge `ecf556a7` ("Land Plan 096 member-grain review
> cut (#100)"). Both resolve to tree
> `9084ff6b01437b7b0454aad444f759b6bd8b259c`, and their diff is empty. Treat
> `ecf556a7` ancestry as the accepted landed lineage; do not require the
> pre-squash branch tip itself to be an ancestor. Any tree mismatch remains a
> STOP.

## Status

- **State**: DONE — public `v1-rc28` assets attested byte-for-byte on
  2026-07-25; consumer and fixed-path closure receipt committed
- **Priority**: P1 — problem 3 of the owner's statement: "do we have the
  appropriate comparable outcome product?"
- **Effort**: L
- **Risk**: MED-HIGH (admission semantics; mitigated by fail-closed bindings,
  fixtures, and untouched causal gates)
- **Depends on**: wiki plans 038–041 (producer side); tracker Plans 074/075/083
  decisions honored as-is; Plan 096 lineage
- **Category**: architecture + migration (consumer)
- **Planned at**: advisor checkout of the tracker at `1246d696`
  (`codex/091-route-intervention-inventory`), 2026-07-22

## Why this matters

After plan 041, the wiki delivers exact treatment identity and exact member
extents. The remaining gap is tracker-owned: an extent is only studyable when an
outcome product exists AT THAT GRAIN and the before/after comparison is
apples-to-apples. Today: bounded extents fail for lack of "matching member-grain
geometry/spine binding" (the Plan 096 receipt names Q45/Q86/Q87/Q63/Q80 exactly
so); stop-set and mixed members are categorically ineligible; frequency changes
have no dedicated product mapping; and redesigns have no route-lineage
comparability ("Current products do not maintain route identity before/after a
redesign" — Plan 093). Meanwhile the raw materials exist: segment×month speeds
(`kufs-yh3x`, `58t6-89vi`), pinned speed-spine artifacts carry exact stop ids
and stop pairs alongside `spineSegmentId`, stop-direction-hour headway
and EWT features exist internally, and the wiki extents now carry stop-pair
identifiers. This plan turns those into per-candidate GRAIN VERDICTS with a
complete denominator — the last leg of the source-backed bridge.

## Current state (verified 2026-07-22 by the advisor)

- Consumer engine (branch `codex/member-grain-consumer-migration`):
  - `tools/pipeline-v2/src/lib/study-engine/member-extents.ts` — fail-closed
    companion validator at occurrence×route×member grain (complete denominator,
    sorted/unique, positive-row requirements).
  - `tools/pipeline-v2/src/lib/study-engine/study-events.ts` — trusted registry
    sources `mta_ace_routes`, `nyc_dot_bus_lanes` (line 34);
    `RC22_QUARANTINED_INPUT` fingerprint (lines 36–44); candidate build from
    registry events + pinned wiki import.
  - `tools/pipeline-v2/src/lib/study-engine/scope.ts` (member scope v2) and
    Plan 096's outputs: candidate universe
    `candidate-set-v4:3373f95c88d08ffef608581d`, review cut
    `study-review-cut-v1:df3d8d2eda43c77738cf50ad`, 484 decisions
    (9 approvals / 475 rejections), execution receipt at
    `docs/research/reviews/rc27-member-grain/plan-096-execution-receipt.md`.
  - Plan 096 contract boundary #5 (binding): "A route-wide producer extent
    needs no geometry binding. A bounded extent resolves only bounded-scope
    identity and still needs exact geometry/spine. Unresolved, stop-set, mixed,
    or heterogeneous members remain ineligible." This plan REPLACES the
    stop-set/mixed blanket ineligibility with explicit per-family
    outcome-product decisions — through contract evolution, not by weakening
    096's validators in place.
- Served segment schema (`packages/domain/src/studio/routes/index.ts:181-205`):
  `StudioSegmentShapeSchema` fields include `id`, `spineSegmentId`
  (nullable), `spineJoinStatus: "matched"|"unmatched"|"ambiguous"|"not_built"`,
  `direction`, `from`, `to`, `speedMph`, `scheduledMph`, `lane:
  "yes"|"partial"|"minimal"|"none"`, `ace`, `tsp`, `hours`.
- Spine states (fixed by the Plan-096 receipt; do NOT reopen): 277
  `needs_pattern_review`, 91 `series_ready`, 25 `series_ready_with_gaps`, and
  0 failed over 393 per-route artifacts.
- Study gates (`packages/domain/src/studio/study.ts:407-413`): `preTrend`,
  `placeboInTime`, `minSample`, `controlEligibility`,
  `congestionPricingOverlap`, `redesignOverlap` — all byte-unchanged by this
  plan.
- Outcome/feature products (verified in
  `knowledge/raw/source_manifest.yaml` and
  `packages/analytics/src/data-products/registry.ts`): segment speeds
  `kufs-yh3x` (2025+) / `58t6-89vi` (2023–24); hourly ridership `gxb3-akrn` /
  `kv7t-n8in`; Bus Wait Assessment `v4z4-2h6n`; Customer Journey/ABST
  `8mkn-d32t`; internal analyst-grain products
  `local_observed_headway_samples_run` (run×route×direction×stop×timestamp) and
  `stop_direction_hour_ewt_features` (registry.ts ~:653–747) — stored, NOT
  publicly served; Plan 023 explicitly rejected serving stop-grain pages
  ("analyst grain, not a public page grain", `plans/023-…:142-143`) — that was
  a SERVING decision, not a study-input decision.
- Relevance registry idiom (Plan 093): every treatment kind carries exactly one
  `TreatmentRelevanceDisposition` — `supported {specIds}` | `blocked {reasonId,
  unlockRequirement}` | `not_relevant {reasonId}`; Plan 093:110 conditions
  `route_segment_month` use on "deterministic physical scope → served segment
  IDs is proven".
- Wiki inputs after Plan 041: identity-verdict companion v1 (complete bus-lane
  denominator; fixture `data/contracts/bus-lane-identity-verdicts-v1/`),
  member-extent companion at closure state (positive rows carry `segment` /
  `stop` components with stop-id identifiers under
  `identity_namespace: "source_literal_v1"`), member-grain companion v1
  (structured `service_scope` and `lineage_segments` at the same denominator),
  bridge ledger schema_version 2 under its v2 path.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Verify | `bun run check` plus the separately pinned phases above | no additional failures relative to the clean `b25542b0` baseline |
| Pipeline CLI | `bun run pipeline -- <cmd>` | per-command |
| Focused tests | `bun test tools/pipeline-v2/test/lib/<file>` | pass |

(Import/merge/review-cut command names evolve with the campaign — locate the
Plan-096 command set via its execution receipt before starting.)

## Suggested executor toolkit

- One executor session for contracts + binding engine; subagent fan-out only
  for the per-family reconciliation sweeps in Step 4 (one read-only subagent
  per treatment family, verifying verdict rows against product coverage).

## Scope

**In scope** (tracker repo only):
- NEW strict decoder for `bus-lane-identity-verdicts-v1` (Effect Schema,
  `onExcessProperty: "error"` like the existing occurrence decoders) +
  import wiring per the Plan-096 release-addressed pattern.
- NEW strict decoder/import for `operational-occurrence-member-grain-v1`, pinned
  to the imported member-extent projection hash and complete denominator.
- Candidate build evolution (`study-events.ts` + domain schemas): registry-born
  bus-lane candidates join to their verdict row; a verdict is REQUIRED for
  every bus-lane candidate (complete denominator, fail-closed).
- NEW `tools/pipeline-v2/src/lib/study-engine/extent-segment-binding.ts`:
  bounded-extent → served-segment resolution (Step 2).
- Relevance-registry extension (Plan 093 idiom) with the per-family decisions
  of Step 3, including new blocked/supported reasons.
- NEW grain-verdict artifact + readiness matrix (Step 4) and its domain schema.
- Candidate-set v5 + fresh review cut per the Plan-096 mechanics.
- Tests under `tools/pipeline-v2/test/`; plan file committed as tracker
  `plans/<next-number>-member-grain-outcome-certification.md` per tracker
  convention. The owning tracker checkout also has user-authored plans 102–105
  outside this worktree's committed base, so reserve plan number 106; never
  overwrite, renumber, or absorb those unrelated plans.
- Tracker `plans/README.md` row.
- Fixed-path machine receipt
  `docs/research/reviews/closure-plan-042/downstream-pin-receipt.json` and a
  `verify-closure-receipt` pipeline command that strict-decodes it and verifies
  its committed consumer artifacts.
- A pure `render-closure-downstream-pin` pipeline command that projects the two
  fixed machine receipts into the wiki pin; Plan 043 never assembles blocks by
  hand.

**Out of scope**:
- Plans 074/075 estimator/causal gates (byte-unchanged), Plan 083 spine
  decisions, Plan 023 public-serving decisions (no new public pages).
- Any wiki-repo edit; any registry re-derivation of route identity (the
  exact-identity contract stands).
- Study runs, approvals, publication, D1/R2 mutation, deploys.
- Re-serving stop-grain data publicly.

## Git workflow

- Branch `advisor/042-grain-certification` (or the campaign's task-branch
  convention) from the current tracker mainline containing Plan 096.
- Conventional small commits per step. Stop after a reviewed local branch;
  pushing, PR creation, CI, and merging are operator decisions outside this
  executor plan.

## Steps

### Step 0: Locate lineage and pins

Fetch; confirm the mainline contains `d4876431` (or its merge); read the
Plan-096 execution receipt for the exact import/merge/review-cut commands and
current pins; confirm the Plan-041 wiki release id + manifest SHA and all three
companion fixtures (member extent, member grain, identity verdict) are available.

Record the clean starting commit as `protected_baseline_commit`. Build the
complete protected-path inventory from that exact commit, not from the working
tree. It contains every tracked baseline file at these exact pathspecs:

- Plan-074 causal math/gates:
  `tools/pipeline-v2/src/lib/study-engine/bootstrap.ts`, `did.ts`,
  `estimator.ts`, `gates.ts`, `matching.ts`, and `panel.ts`;
- Plan-075 public surfaces: `apps/web/src/components/study/`,
  `apps/web/src/components/route/TreatmentsHistorySection.tsx`,
  `apps/web/src/studio/api-client.ts`,
  `apps/web/src/studio/pages/interventions.tsx`, and
  `apps/web/src/routes/routes/$routeId.tsx`;
- Plan-083 settled negative-spike files:
  `packages/analytics/src/feature-history/spine-pattern-grouping-prototype.ts`,
  `packages/analytics/test/feature-history/spine-pattern-grouping-prototype.test.ts`,
  `docs/research/spine-pattern-grouping-findings.md`, and
  `docs/research/spine-pattern-grouping-decision.md`.

Store every resolved path plus its SHA-256 at the baseline commit. A missing
named file or empty resolved inventory is a STOP. New Plan-042 files are not
silently added to this baseline inventory.

**Verify**: reproduce and pin the clean-baseline phase signature above once.
Do not repair its unrelated Biome or worker-sandbox failures.

### Step 1: Import the closure release; verdict-aware candidate universe

Implement the identity-verdict and member-grain strict decoders against the
wiki fixtures, then against the real companions. Require member-grain rows to
match the member-extent denominator and projection hash exactly. Extend the
candidate build:

- Every unmatched registry-only bus-lane candidate MUST match exactly one
  verdict row (candidate-id keyed; missing/duplicate/unknown-candidate rows
  fail closed). The two already occurrence-backed Flatbush registry rows remain
  outside that 321-row companion denominator and keep their occurrence-backed
  provenance.
- `occurrence_created` verdicts: the candidate re-derives from the wiki
  occurrence (routes, onset, member) with the registry row retained as
  corroborating provenance — never dropped (the 096 rule: independent registry
  evidence is preserved; the companion cannot impersonate or revoke it).
- `refuted_*` / `confirmed_out_of_window` /
  `binding_absent_after_search`:
  candidate carries a terminal `identityVerdict` and is EXCLUDED from
  approval-eligible review with the verdict as the recorded reason (visible,
  not deleted).
- `superseded_duplicate`: candidate remains visible and links to the exact
  canonical candidate/occurrence named by the companion; it never creates a
  second occurrence or disappears from denominator accounting.
- Non-bus-lane candidates: unchanged identity mechanics; new member-extent and
  member-grain rows flow in as in Plan 096, with service scope and lineage kept
  as typed candidate fields.

Build candidate-set v5 deterministically (twice, byte-identical).

**Verify**: fixture tests for each verdict class; denominator reconciliation —
`|unmatched registry-only bus-lane candidates| == |verdict rows| == 321`, plus
the two occurrence-backed Flatbush rows accounted separately; exactly 168
occurrence×route candidates cover all 308 producer member rows, exactly 387
no-member candidates remain visible, and the candidate-set-v5 count is 555;
deterministic repeat.

### Step 2: Bounded-extent → served-segment binding

`extent-segment-binding.ts`: for each positive `bounded_segment` (and the
segment part of `mixed`) member extent, resolve its stop-pair identifiers
(`source_literal_v1` stop ids from the wiki components) to served segments:

- Match extent boundary stops directly to the candidate route's pinned
  direction-specific
  `segments[].raw.sourceStopPairs[].fromStopId/toStopId`; admit only a unique
  ordered orientation with a non-null `spineSegmentId`. Producer GTFS
  directions `0`/`1` must not be equated to NB/SB/EB/WB or N/S/E/W strings.
- Emit a binding receipt per member: `{extent_id, candidate_id, matched_segment
  ids + spineSegmentIds, coverage_share_of_extent, unmatched_reason?}`.
- Fail-closed classes (recorded, never guessed): `spine_not_ready` (route in
  the 277 `needs_pattern_review` set), `endpoints_not_on_spine`,
  `ambiguous_join`, `partial_coverage_below_floor` (floor an explicit recorded
  param, default 0.8 of extent length/stops), and
  `missing_endpoint_stop_id_equivalence` (producer positive is preserved but
  its source-literal/symbolic endpoint cannot be proven equivalent to a pinned
  spine endpoint).

This step PROVES the Plan 093:110 condition ("deterministic physical scope →
served segment IDs") for every extent it succeeds on, and records exactly why
for every extent it does not.

**Verify**: fixtures for each class; live run prints the binding histogram and
reproduces the frozen 48-row readiness split (39/7/2) before binding;
Q45/Q86/Q87/Q63/Q80 (the Plan-096 named bounded cases) each produce either an
exact binding receipt or a named fail-closed reason — no silent drops. The
seven `series_ready` rows currently expected to lack exact endpoint
equivalence must be blocked explicitly, not converted to approximate matches.

### Step 3: Per-family outcome-product decisions (relevance registry)

Extend the Plan-093 relevance registry with explicit dispositions — each entry
names product id, grain, resolver, claim ceiling, and unlock evidence:

| member shape | decision this plan encodes |
|---|---|
| bus_lane / busway with bound segments | `supported`: `route_segment_month` speeds (`kufs-yh3x`/`58t6-89vi`) as segment-scope primary for DESCRIPTIVE observation; causal admission still flows only through the untouched 074/075 gates |
| bus_lane route-wide (verdict-backed) | `supported`: existing route×month specs (093's bindings) |
| stop_set members | operator decision point (see below): recommended relevance `supported` through a VERSIONED analyst-grain spec, producing grain verdict `grain_matched_analyst` from `local_observed_headway_samples_run` + `stop_direction_hour_ewt_features` at the extent's stop ids, claim ceiling `descriptive_observation`, NOT publicly served, but only when a frozen candidate-specific coverage receipt and typed stop-ID lineage prove the treated stops and comparison window; product-registry presence alone remains `blocked {reasonId: "missing_pinned_stop_grain_coverage", unlockRequirement: "candidate-specific observed-headway/EWT coverage receipt plus reviewed stop-ID lineage"}` |
| frequency-change members | `supported`: scheduled trips/headway per period as the treatment-side series + observed headway/Wait Assessment (`v4z4-2h6n`) as outcome context; route-wide vs subset scope comes ONLY from the typed member-grain `service_scope`, never parsed rationale |
| route_redesign members | comparability gate (Step 3b) |
| anything else | explicit `blocked`/`not_relevant` with a concrete reason — never silent |

The stop-set row changes an explicit Plan-096 exclusion. The originating user
authorized all closure plans on 2026-07-22; record that authorization and apply
the versioned analyst-grain contract, but emit `grain_matched_analyst` only for
rows whose frozen candidate-specific coverage and typed stop-ID lineage
prerequisites actually pass. At the pinned Plan-096 database state, zero
observed-headway rows means the current stop-set rows remain
`blocked:missing_pinned_stop_grain_coverage`. If an executor cannot verify the
authorization in this plan text, use the same conservative blocked row rather
than guessing.

Step 3b — route-lineage comparability for redesigns: consume the typed
`lineage_segments` from the member-grain companion. Q61 may use Q15/Q34
predecessor mappings only when the Plan-041 companion carries reviewed exact
old/new stop-chain bindings; names, coordinates, or prose cannot create the
lineage. Never parse component descriptions/rationale. A redesign
candidate's outcome verdict is `lineage_comparable_common_segments` ONLY when
its correspondence segments bind (Step 2) on BOTH the old route's pre-period
segment series and the new route's post-period series; the common-segment set
becomes the recorded analysis frame. Otherwise
`route_lineage_incomparable` with the failing side named. Never compare
whole-route averages across a geometry change without this frame.
At the current evidence freeze, Q61 must remain
`route_lineage_incomparable:missing_reviewed_endpoint_equivalence`; the typed
lineage warning and positive extent rows are retained, not downgraded.

**Verify**: registry consistency tests (every canonical treatment kind has
exactly one disposition; no raw column strings without registry tests — the 093
rule); Q61 produces a `lineage_comparable_common_segments` frame or a named
failure; the stop-set decision is recorded with its authorization string.

### Step 4: Grain-verdict readiness matrix (complete denominator)

Emit one grain verdict per exact candidate×treatment-member row. Every
registry-only candidate with no producer member receives exactly one
candidate-level row with `member_extent_id: null`: the 321 terminal bus-lane
identity candidates receive their terminal verdict, while all 66 ACE rows
preserve their prior Plan-096 route-wide scope/product state (including the
eight accepted rows) rather than being relabeled terminal. All
occurrence-backed candidates receive one row per imported member-grain row:
`grain_matched_primary | grain_matched_analyst | grain_context_only |
blocked:<reason>` — joining identity verdicts (Step 1), segment bindings
(Step 2), and registry decisions (Step 3). The denominator is the sum of
the 308 member-grain rows joined to occurrence-backed candidates plus one row
for each of the 387 no-member candidates, exactly 695; do not compare this row
count to the 555 candidate count. Zero unclassified rows; deterministic artifact +
summary (counts by family × verdict). Fresh review cut per Plan-096 mechanics
binding the new universe + scope receipts. Reconciliation sweep (subagents, read-only):
per family, sample rows and confirm the verdict's named product actually has
coverage for the candidate's window.

**Verify**: matrix rows equal the explicit formula above; every candidate has
at least one row and every imported member-grain row has exactly one joined row;
deterministic repeat;
reconciliation sweep reports zero mismatches (or each mismatch fixed/explained).

### Step 5: Receipts, docs, gates

Execution receipt (Plan-096 style) under `docs/research/reviews/`: pins,
histograms (identity verdicts, extent bindings, grain verdicts), the stop-set
authorization, and the explicit statement that 074/075/083 surfaces are
byte-unchanged (`git diff` proof). Run the complete phase matrix and require
zero additional failures versus the pinned clean baseline; commit on the isolated
executor branch, but do not push, open a PR, or merge. Report the import receipt
to plan 043, which owns the wiki downstream-pin update.

The receipt has a fixed machine-readable companion at
`docs/research/reviews/closure-plan-042/downstream-pin-receipt.json`. Use a
two-commit close: first commit all consumer code/imported artifacts and record
that commit as `consumer_commit`; then commit the receipt and prose report.
The strict schema-version-1 receipt contains exactly these required sections:

- `consumer: "bus-reliability-tracker"` and `producer`: Plan-041 `release_id`,
  `manifest_sha256`, producer-handoff path,
  and producer-handoff SHA-256;
- `consumer_commit` and `import`: path, SHA-256, source/eligible/route-projection
  counts;
- `candidate_set`: path, SHA-256, candidate-set-v5 id, candidate count, and
  approval state;
- `member_grain_import`: path, SHA-256, row count, and pinned member-extent
  projection SHA-256;
- `extent_binding`: path, SHA-256, row count, and disposition histogram;
- `grain_verdict`: path, SHA-256, row count, denominator formula inputs, and
  family-by-verdict histogram;
- `review_handoff`: path, SHA-256, review-cut id, row count, status, and
  `approval_applied: false`;
- `operator_authorization`: authorization id
  `mta-wiki-owner-2026-07-22-all-closure-plans`, scope
  `internal_analyst_stop_set_admission`, recorded decision, and source plan;
- `verification_baseline`: protected commit `b25542b0`, the five phase log
  SHA-256 values and baseline counts/signatures pinned above, plus final
  per-phase results proving zero additional failures;
- `authority`: all of `authorizes_study`, `authorizes_publication`,
  `authorizes_d1_r2_mutation`, and `authorizes_deploy` are `false`;
- `protected_surfaces`: `protected_baseline_commit` plus the complete path
  inventory from Step 0; every entry has `path`, `baseline_sha256`, and
  `consumer_sha256`.

Add
`bun run pipeline -- verify-closure-receipt --receipt docs/research/reviews/closure-plan-042/downstream-pin-receipt.json`.
It must verify the receipt strictly, assert `consumer_commit` is an ancestor of
HEAD, read every addressed file from that exact commit (not merely the working
tree), recompute all hashes/counts/histograms, and prove protected surfaces are
byte-unchanged by reading every inventory path from both
`protected_baseline_commit` and `consumer_commit`. It also accepts an optional
`--downstream-pin <absolute-path>`;
when supplied, strict-decode that completed wiki pin and require an exact
field-for-field projection of both machine receipts, all authority flags false,
valid/unique paths and SHA-256 values, nonempty artifact counts, and
`consumer_receipt.receipt_commit == HEAD`. This is Plan 043's executable final
mapping check; test both a valid pin fixture and one mismatch per receipt block.

Add a separate pure projection command:

`bun run pipeline -- render-closure-downstream-pin --producer-receipt <absolute-wiki-producer-receipt> --consumer-receipt docs/research/reviews/closure-plan-042/downstream-pin-receipt.json --output <absolute-wiki-downstream-pin>`.

It strict-decodes and re-verifies both receipts, generates `pinned_at` once at
write time, projects every required block without accepting manual field
overrides, refuses a dirty tracker checkout or non-HEAD receipt, and writes
stable JSON atomically. Its output must pass `verify-closure-receipt
--downstream-pin` field-for-field. Tests cover exact projection, atomic failure,
and refusal of any mismatched receipt pair.

**Verify**: the receipt verifier and `bun run check` are green; `git diff` on
the 074/075 gate files and Plan-083 artifacts is empty; receipt committed in the
second commit and names the first commit as `consumer_commit`.

## Test plan

- Verdict decoder: fixture handshake + each strict-decode failure class.
- Member-grain decoder: complete denominator, member-extent projection pin,
  service-scope discriminants, lineage invariants, and excess-property failure.
- Candidate build: one test per verdict class incl. registry-provenance
  preservation and the missing-verdict fail-closed case.
- Segment binding: the four fail-closed classes + a successful bind fixture +
  determinism; model on `test/lib/mta-wiki-member-extents.test.ts` and
  `test/lib/study-member-scope.test.ts`.
- Registry: consistency + the redesign comparability frame (Q61-shaped
  fixture with synthetic old/new segment series).
- Matrix: denominator completeness + deterministic repeat.
- Machine receipt: strict shape, exact-commit byte/hash/count/histogram
  verification, authority-false invariants, protected-surface pins, and the
  optional completed-downstream-pin projection check.
- Pin renderer: exact receipt projection, one generated timestamp, atomic
  output, mismatch/dirty-checkout refusal, and validator round-trip.

## Done criteria

- [x] Every bus-lane candidate carries exactly one identity verdict; refuted
  candidates are terminal-with-reason, not deleted
- [x] Candidate set v5 contains exactly 555 visible candidates: 168
  occurrence×route candidates covering all 308 producer rows plus 387
  no-member candidates
- [x] Every positive bounded extent has a segment-binding receipt or a named
  fail-closed reason; Q45/Q86/Q87/Q63/Q80 accounted individually
- [x] Relevance registry covers every treatment kind with an explicit
  disposition; stop-set decision recorded with operator authorization
- [x] Q61 has a recorded common-segment analysis frame or a named
  incomparability verdict
- [x] Grain-verdict matrix is complete-denominator, deterministic, and receipted
- [x] Focused tests/typecheck/replay pass and the full phase matrix has zero
  additional failures versus the pinned baseline; 074/075/083 byte-unchanged; import receipt
  delivered to the wiki side; tracker plans/README row added
- [x] Fixed-path machine receipt is committed after its named consumer commit,
  and `verify-closure-receipt` passes against that exact commit

Post-publication transport evidence is recorded in
`docs/research/reviews/closure-plan-042/public-release-attestation.md`. The
attested GitHub assets preserve the exact producer manifest and all five source
inputs recorded by the committed Plan 042 producer import.

## STOP conditions

- Producer companions missing, hash-mismatched, or emitting undeclared
  roles/enums (the rc22 class) → quarantine per the existing pattern and
  report; never broaden a decoder to admit them.
- Completing a step would require touching 074/075 gate files, reopening Plan
  083, or serving stop-grain data publicly.
- If the originating 2026-07-22 authorization recorded in this plan cannot be
  accepted under tracker process → implement the `blocked` conservative row,
  mark IN PROGRESS, and report; do not silently widen admission.
- A later package attempts to turn the observed `<50%` exact binding result
  into positive segment matches without authoritative endpoint stop-ID
  equivalence → STOP. The current plan may ship only the amended
  candidate-specific authority-false blocked receipts.
- Any candidate ends unclassified in the matrix.

## Maintenance notes

- New wiki releases re-run Steps 1–4 mechanically; the matrix is the standing
  treatment↔outcome bridge surface. Spine rebuilds (a future Plan-083
  successor) re-run Step 2 only.
- When a stop-grain public product ships someday, the stop_set registry row
  flips by ONE entry change — the extents and bindings are already in place.
- Reviewer: verify the 074/075 byte-diff claim, re-run one segment binding by
  hand from its extent stop ids, and check one refuted candidate renders its
  verdict (not a silent disappearance) in the study worksheet surface.

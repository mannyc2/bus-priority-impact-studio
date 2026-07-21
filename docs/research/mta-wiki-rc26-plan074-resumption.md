# MTA Wiki rc26 / Plan 074 Flatbush resumption record

Date: 2026-07-21

This record closes the MTA Wiki release dependency that prevented the reviewed Flatbush Phase 1
event-route onset from entering Plan 074. It pins the rc26 import, proves the narrow candidate-set
transition, records the complete candidate decision receipt, and summarizes the resulting seven-study
run. At creation it did not authorize Plan 075 activation or publication; the operator's binding
2026-07-21 approval recorded below now closes that gate for this exact rc26 cut.

## Pinned producer release

The source is MTA Wiki `v1-rc26`, merged on producer main at `832242c`:

- manifest SHA-256:
  `c1792d1cbfdf498ea0481fa2374202b634dc2deea532f87a600390c6da382dc0`
- operational-occurrence SHA-256:
  `6cb8654efee370d7444405ce3a0cdb8ce6fa394e6ada2347982cbec49df701ef`
- Tracker strict-import SHA-256:
  `b9c41aafb499b3cf3c8b5e74192be64b1615393d50c5d2cf4edc66260857d6cd`
- candidate artifact SHA-256:
  `fe4d3ce9fa9f73f660256034afa497a8a8935f3471c083358a171f5f719e5363`
- candidate set:
  `candidate-set-v3:80050ed598f3b2ab0d0a1e99`

Two strict imports and two candidate builds were byte-identical. The import contains 131 source
occurrences, 130 eligible occurrences, 167 route projections, and one retained rejection. The
candidate set contains 484 candidates, 382 source rejections, zero conflicts, and 14 exact
deduplications.

The strict importer needed two consumer-side compatibility repairs, both covered by regression
tests. A reviewed phase relation may carry several evidence bindings, so identity comparison now
deduplicates their repeated relation record ID. The producer phase audit counts unique phase event
records plus event-event candidate relation records, so Tracker now decodes the manifest-pinned
candidate inventory and reconciles that exact count instead of assuming it equals occurrence count.
Both checks remain fail closed.

## Stable occurrence and corrected operational onset

The release preserves Flatbush Phase 1 occurrence
`occurrence:8c987704152b459014217d44`, its B41/B67 projections, treatment, and bounded
`corridor_flatbush-phase1-livingston-state` scope. It adds the reviewed chronology:

- installation phase: `event_flatbush-phase1-installation-start-sep2025`
- operational phase: `event_flatbush-phase1-operational-opening-2025-10-02`
- relation: `relation_flatbush-phase1-installation-precedes-opening-2025-10-02`
- disposition: `related_phases`

The estimator onset is therefore 2025-10-02 with day precision. September remains installation,
not a duplicate treated event. The matching B41 and B67 NYC DOT registry rows now exact-deduplicate
into the stable Wiki candidates, removing the two registry-only candidate IDs and leaving no added
candidate IDs.

## Complete decision transfer and Flatbush adjudication

The reconciliation script pins both candidate artifacts and proves that all 482 non-Flatbush
survivors retain exactly the admission semantics reviewed in rc25. It carries those decisions only
after that comparison. It then applies fresh decisions to the changed Flatbush records:

- B41 remains rejected because its current spine is `needs_pattern_review`; the corrected onset and
  exact physical scope do not override that independent gate.
- B67 is approved for estimator admission only because phase identity and deduplication are now
  clean, the existing exact scope binding remains valid, its spine is `series_ready_with_gaps`, and
  its nominal calendar has six pre and five post months.

The rc26 receipt is complete: 484 decisions, seven approvals, and 477 rejections. The strict merge
accepted it and produced an approved event set with SHA-256
`7923d0ea4e86a07d70a354f22ae8d732ee8cc198612dffe25bdae6bdaf30c18f`.

The exact Flatbush scope is unchanged. The candidate-set-bound binding retains five pinned NYC DOT
geometry IDs and two source-segment→stable-spine mappings per route. Its source snapshots and both
route spine hashes are unchanged from the reviewed rc25 cut; the production overlap resolver checks
them again during every run.

## Study outcome

A focused B67 run succeeded before the complete run. The complete run produced one study for every
approved event-route pair: seven studies and seven route rollups, with two gated estimates, five
descriptive comparisons, four `no_detectable_change` results, zero ineligible studies, and zero
lane/scope fallbacks. A same-root repeat reproduced all 15 generated JSON files byte-for-byte.

B67 uses the two exact bounded spine segments and reports an all-day +0.139 mph estimate with a
95% bootstrap interval of [+0.121, +0.156]. It remains descriptive: the two-segment sample fails the
five-segment minimum, and the placebo gate fails. The result is not promoted to a causal or route-wide
claim.

No effect exceeded 0.34 mph in absolute value, so Plan 074's implausibility STOP did not fire. The
fresh operator sanity check in `docs/research/reviews/rc26/anchors-report.md` was approved on
2026-07-21. Plan 074 is DONE. Plan 075 subsequently published and publicly verified the exact
17-object rc26 cut; its completion receipt is
`docs/research/reviews/rc26/publication-report.md`.

Plan 076 cannot start from this cut. Only BX38 and BX9 are `gated_estimate` studies, both in the
automated-bus-lane-enforcement family, so no treatment family reaches its required minimum of three.
The Plan 076 STOP remains binding; revisit opportunity ranking only after another qualifying gated
study lands.

## Operator approval and downstream boundary

The operator issued this exact token on 2026-07-21:

> approve Plan 074 rc26 anchors; accept the six historical published-claim TBD cells and the completed B67 negative finding; keep B67 descriptive; approve Plan 075 activation and authorize publication of the rc26 study artifacts.

The six historical published-claim cells therefore remain accepted `TBD` values, the completed B67
negative finding is accepted, and B67 remains descriptive. A second explicit operator instruction
authorized the concrete GitHub and Cloudflare operation. PR #88 merged and all 17 exact objects were
then written to `bus-priority-artifacts` and verified through production. No D1 seed, Worker
deployment, or coordinated-release pointer change was needed for the scoped R2 promotion. See
`docs/research/reviews/rc26/publication-report.md`.

## Tracked artifacts

- `docs/research/artifacts/mta-wiki-v1-rc26.operational-occurrences-import.json`
- `docs/research/artifacts/candidate-set-v3-80050ed598f3b2ab0d0a1e99.study-events.json`
- `data/study-event-approvals/reviews/candidate-set-v3-80050ed598f3b2ab0d0a1e99.review-worksheet.json`
- `data/study-event-approvals/receipts/candidate-set-v3-80050ed598f3b2ab0d0a1e99.approval.json`
- `data/study-event-approvals/scope-bindings/candidate-set-v3-80050ed598f3b2ab0d0a1e99.scope-bindings.json`
- `docs/research/reviews/rc26/rc26-review-reconciliation.json`
- `docs/research/reviews/rc26/publication-report.md`

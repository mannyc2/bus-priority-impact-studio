# Plan 074 rc26 Flatbush resumption

Status: **Plan 074 review approved and complete; Plan 075 activated and publication-authorized,
with serving regeneration, remote publication, and public verification still pending**.

MTA Wiki `v1-rc26` resolves the Flatbush Phase 1 chronology while preserving occurrence
`occurrence:8c987704152b459014217d44`: installation began in September 2025 and the bounded
Livingston Street-to-State Street treatment opened on 2025-10-02. The Tracker strict importer
accepted that release, and the candidate builder exact-deduplicated the matching B41 and B67 NYC DOT
registry rows into the stable Wiki projections.

The deterministic reconciler proved that the rc26 candidate set is the rc25 set minus exactly those
two registry-only duplicates. It replayed the 482 surviving decisions whose admission semantics did
not change and re-adjudicated both Flatbush projections against the corrected evidence. B41 remains
rejected because its current spine is `needs_pattern_review`; B67 is approved for estimator admission
only. The resulting complete receipt contains seven approvals and 477 rejections.

Authoritative records:

- [Migration and readiness record](../../mta-wiki-rc26-plan074-resumption.md)
- [Deterministic reconciliation](./rc26-review-reconciliation.json)
- [Fresh anchor report](./anchors-report.md)
- [Candidate-set-bound receipt](../../../../data/study-event-approvals/receipts/candidate-set-v3-80050ed598f3b2ab0d0a1e99.approval.json)
- [Candidate-set-bound scope mapping](../../../../data/study-event-approvals/scope-bindings/candidate-set-v3-80050ed598f3b2ab0d0a1e99.scope-bindings.json)

The strict production merge accepted the receipt. Every approved event-route pair produced a study:
the six prior ACE studies plus the new B67 Flatbush study.

On 2026-07-21 the operator closed the review with this exact token:

> approve Plan 074 rc26 anchors; accept the six historical published-claim TBD cells and the completed B67 negative finding; keep B67 descriptive; approve Plan 075 activation and authorize publication of the rc26 study artifacts.

Plan 074 is therefore DONE. Plan 075 is activated and authorized to publish this exact rc26 cut,
but no serving regeneration, remote write, deployment, or public verification is claimed by this
review record. B67 remains descriptive and the six historical published-claim cells remain explicit
operator-accepted `TBD` values.

# Plan 074 rc26 Flatbush resumption

Status: **complete review and estimator execution; stopped for fresh operator anchor review**.

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
the six prior ACE studies plus the new B67 Flatbush study. Nothing in this directory authorizes
publication. Plan 075 remains inactive until the operator records `approve`, `revise`, or `defer`
against the fresh anchor report.

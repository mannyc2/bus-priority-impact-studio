# Corrected rc19 Codex review

This directory contains the final non-authorizing review of
`candidate-set-v2:24080902f508b55a0033df32`, bound to candidate artifact SHA-256
`42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba`.

The deterministic reconciliation covers exactly 489 candidates: 16 `recommend_approve`, 473
`recommend_reject`, and zero `needs_followup`. Eleven approval recommendations are new Queens
route-redesign identities; the other five are unchanged identities that match the historical
receipt's approved identity set. This comparison does not transfer the old receipt to the new set.
The reconciliation SHA-256 is
`8b5f77c9391970223aaa1fee8c3833a2d00c90e1755b80267c76ffbfb95c522c`; the deterministic audit
JSON SHA-256 is `7b0241a4a9e9de27eb3dcf1b71ead532718e9f05be357af91212351120d6fe00`.

Of the 12 rc19 additions that pass the mechanical calendar-plus-spine prefilter, 11 receive
non-authorizing approval recommendations. `B67|bus_lane|2025-09|month` remains rejected because
the frozen review lacks an exact lane-overlap spine, treats September as installation commencement
rather than a clean operational completion date, and contains a competing same-route lane
candidate dated 2025-10-02. The other 75 additions fail the mechanical prefilter.

Authoritative review artifacts:

- [Review rubric](./00-review-rubric.md)
- [489-row reconciliation](./rc19-review-reconciliation.json)
- [Transfer proof](./review-transfer-summary.json)
- [Deterministic Tracker audit](../../../artifacts/mta-wiki-rc19-study-candidate-audit.md)

The discovery-set files in the parent directory bind the superseded 501-row set and remain audit
evidence only. Neither discovery nor corrected files are approval receipts. They authorize no
study run, publication, D1/R2 write, or rc19 promotion.

The operator must explicitly authorize a new receipt bound to the exact candidate-set ID,
candidate artifact hash, and input hashes that approves exactly the 16 recommended identities and
rejects the remaining 473, or provide candidate-level overrides with rationale. Until then, the
approved count is zero and no new study may run. Estimator, sensitivity, claim-tier, run, and
publication gates remain separate.

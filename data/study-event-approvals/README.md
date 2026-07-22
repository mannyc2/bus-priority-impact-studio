# Study-event operator approval receipts

This is the tracked, append-only handoff location for Plan 074 study-event
approval receipts. Candidate set `candidate-set:49af8c8721457fa7532a7345`
has a validated immutable receipt at
`receipts/candidate-set-49af8c8721457fa7532a7345.approval.json`: all 403
candidates have explicit decisions, with 5 approved and 398 rejected. The
strict merge resolves to `approvalState: "approved"` and exposes only those
five events through `approvedEvents`.

## Authority and validation

The runtime contracts are
`packages/domain/src/studio/study.ts` (`StudyEventApprovalArtifactSchema`,
`StudyEventApprovalArtifactV2Schema`, and
`StudyEventApprovalArtifactV3Schema`, and `StudyEventApprovalArtifactV4Schema`).
The versioned JSON Schemas mirror those
wire shapes for operator tools: `study-event-approval.schema.json` is the
immutable historical v1 shape, and `study-event-approval-v2.schema.json` plus
`study-event-approval-v3.schema.json` cover occurrence-v1 and occurrence-v2
candidate sets respectively. `study-event-approval-v4.schema.json` adds the
exact `reviewCutId` binding.
The stricter semantic checks live in `study merge-events`: a receipt must bind
to the current `candidateSetId`, contain exactly one decision for every
candidate, have non-blank reviewer and rationale values, contain no duplicate
candidate decisions, and approve at most one candidate in each same-month
conflict.

`NON_APPROVAL_TEMPLATE.example.json` is intentionally invalid. Its artifact
kind, schema version, identifiers, decision value, and blank review fields
cannot pass either the JSON schema or the pipeline command. Never place a copy
of that file in `receipts/` until a human has completed every decision and the
pipeline command validates the resulting artifact.

## Operator workflow

The workflow below applies only to a **new, authorizable** candidate-set id.
Do not reopen or overwrite the completed receipt above.

The rc22 set `candidate-set-v3:9761a5648df08fbdf6c38bb4` is contract-blocked,
and rc23 set `candidate-set-v3:aba25fe4209247be31d43b66` is permanently
quarantined by the later exact-route audit. Neither can accept a receipt. The
rc19 v2 set remains unapproved, and its Codex recommendations are not a
receipt.

The current completed set is
`candidate-set-v3:80050ed598f3b2ab0d0a1e99`, built from exact-route MTA Wiki
`v1-rc26`. Its tracked pre-approval candidate artifact has SHA-256
`fe4d3ce9fa9f73f660256034afa497a8a8935f3471c083358a171f5f719e5363`
and contains 484 candidates. The validated complete receipt under `receipts/`
has seven approvals and 477 rejections. Deterministic reconciliation proved
that 482 rc25 decisions retained identical admission semantics before replay;
B41 and B67 were freshly adjudicated against the corrected Flatbush chronology.
The worksheet under `reviews/` remains the immutable non-authorizing starting
point. Estimator gates, anchor review, and publication remain independent.

## Exact physical-scope bindings

`scope-bindings/` contains reviewed occurrence→source geometry→current
segment→stable spine mappings used by `study run`. These files are not
approval receipts and do not authorize a candidate. The runner validates the
candidate-set, analysis month, pinned Wiki release, raw source snapshots,
route speed-spine hashes, and exact segment mapping before admitting a bounded
treatment. A missing, stale, incomplete, or drifted binding fails admission;
it never widens to all route segments.

1. Use a clean, immutable MTA Wiki release and rebuild
   `data/artifacts/studio/v2/studies/study-events.json` without an approval.
2. Generate and review a new `reviews/candidate-set-NEW_ID.review-worksheet.json`.
   It must contain every candidate and its provenance, with informational
   analysis-window hints only. Replace every `REVIEW_REQUIRED` value with
   `approved` or `rejected`, and fill every `reviewer` and `rationale`. The
   worksheet is deliberately not a valid receipt while any sentinel or blank
   human field remains.
3. Project the completed worksheet to the matching strict receipt wire shape
   at a scratch path. Choose the artifact/schema version that exactly matches
   the candidate artifact; never translate or reuse an older receipt:

   ```sh
   jq '{artifactKind:"bp.studio.study_event_approvals.v3",schemaVersion:3,candidateSetId,decisions:[.decisions[]|{candidateId,decision,reviewer,rationale}]}' \
     data/study-event-approvals/reviews/candidate-set-NEW_ID.review-worksheet.json \
     > /tmp/candidate-set-NEW_ID.approval.json
   ```

4. Validate the scratch receipt with the matching JSON Schema, then run
   `study merge-events` with `--wiki-import <artifact>`,
   `--approval <scratch-receipt>`, and `--output <scratch-output>`. Do not
   proceed unless the command succeeds and the output is bound to the expected
   candidate set with `approvalState: "approved"`.
5. Store the validated receipt as
   `receipts/candidate-set-<24-lowercase-hex>.approval.json`. Commit it together
   with the matching immutable input references and audit update.

Receipts are immutable. Never overwrite or repurpose a receipt after its
candidate set changes; rebuild and review a new candidate set under a new
filename. A receipt records completion of the operator decision boundary, not
a causal claim or permission to publish.

## Versioned outcome review cuts

Schema v4 separates two immutable identities that v3 combined incompletely:

- `candidateSetId` identifies the source candidate universe and remains the
  deterministic v3 candidate identity for this compatibility cycle;
- `reviewCutId` identifies one analysis review cut and binds the candidate
  universe receipt, analysis month, verified outcome snapshot, complete speed
  spine manifest and route-artifact receipts, physical-scope binding, study
  engine, and admission policy.

Adding a later complete outcome month therefore creates a new `reviewCutId`
without rewriting either the source candidate universe or an earlier receipt.
The v4 receipt binds both identifiers and must contain exactly one strict,
non-duplicate decision for every candidate. A v3 receipt cannot authorize a
v4 cut. `study run` also regenerates the review-input snapshot from the actual
database and artifact paths before estimation; month, outcome, spine, scope,
engine, candidate-universe, or receipt drift fails closed.

After explicit operator approval, project the complete v4 worksheet without
changing its decisions:

```sh
jq '{artifactKind:"bp.studio.study_event_approvals.v4",schemaVersion:4,candidateSetId,reviewCutId,decisions:[.decisions[]|{candidateId,decision,reviewer,rationale}]}' \
  study-review-cut-v1-NEW_ID.review-worksheet.json \
  > /tmp/study-review-cut-v1-NEW_ID.approval.json
```

Focused estimator iterations must provide a separate
`--focused-artifact-root`; they never replace the complete cut index with a
subset. Approval remains estimator admission only. Study gates, anchor review,
and publication authorization are separate boundaries.

The candidate-universe receipt reserves a nullable, hashed
`memberExtentLineage` at occurrence + route + treatment-member grain. It is
null for the rc26-pinned May 2026 outcome cycle. A later producer-member-extent
consumer migration must preserve those member IDs, populate that lineage,
generalize physical-scope bindings, and issue a fresh candidate universe and
complete receipt; it must not replay rc26 authorization.

The completed May 2026 cycle is bound to
`study-review-cut-v1:5298f37aac8780666c742f7d`. Its immutable v4 receipt is
`receipts/study-review-cut-v1-5298f37aac8780666c742f7d.approval.json` and has 484 complete
decisions: 9 approved and 475 rejected. The matching complete worksheet and scope bindings use the
same review-cut filename under `reviews/` and `scope-bindings/`. The source candidate universe is
still the immutable rc26 `candidate-set-v3:80050ed598f3b2ab0d0a1e99`; this new receipt neither
overwrites nor reauthorizes the historical v3 receipt.

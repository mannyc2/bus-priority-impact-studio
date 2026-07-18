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
`StudyEventApprovalArtifactV3Schema`). The versioned JSON Schemas mirror those
wire shapes for operator tools: `study-event-approval.schema.json` is the
immutable historical v1 shape, and `study-event-approval-v2.schema.json` plus
`study-event-approval-v3.schema.json` cover occurrence-v1 and occurrence-v2
candidate sets respectively.
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

The pinned rc22 set `candidate-set-v3:9761a5648df08fbdf6c38bb4` is not
authorizable: its merge state is `blocked_contract_incompatible`, its approval
must be null, and supplying any receipt is rejected. Do not prepare a worksheet
or receipt for it. Wait for a corrected named Wiki release to pass the normal
strict-compatible import, rebuild the v3 set, and use the new exact ID and
hash.

The corrected rc23 release produced authorizable set
`candidate-set-v3:aba25fe4209247be31d43b66`, artifact SHA-256
`60422e951226b97abe40ae3705469084c5134488e666084284771e1b60ab22b5`.
It is still `awaiting_approval`, has a null receipt, and contains zero
approved events. Any operator review must cover all 489 candidates and bind
the exact candidate-set ID plus recorded inputs; no rc19/rc22 or historical
403-row receipt applies. The rc19 v2 set remains unapproved and its
non-authorizing Codex review is not a receipt.

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

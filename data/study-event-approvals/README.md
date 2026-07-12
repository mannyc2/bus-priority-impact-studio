# Study-event operator approval receipts

This is the tracked, append-only handoff location for Plan 074 study-event
approval receipts. There is currently **no approval receipt** for
`candidate-set:49af8c8721457fa7532a7345`; the corresponding merge artifact is
still `awaiting_approval` with `approvedEvents: []`.

## Authority and validation

The runtime contract is
`packages/domain/src/studio/study.ts` (`StudyEventApprovalArtifactSchema`).
`study-event-approval.schema.json` mirrors that wire shape for operator tools.
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

1. Use the clean, immutable MTA Wiki release `v2-operational-anchors-1` and the
   rebuilt `data/artifacts/studio/v2/studies/study-events.json`.
2. Review
   `reviews/candidate-set-49af8c8721457fa7532a7345.review-worksheet.json`.
   It contains all 403 candidates and their provenance, with informational
   analysis-window hints only. Replace every `REVIEW_REQUIRED` value with
   `approved` or `rejected`, and fill every `reviewer` and `rationale`. The
   worksheet is deliberately not a valid receipt while any sentinel or blank
   human field remains.
3. Project the completed worksheet to the strict receipt wire shape at a
   scratch path:

   ```sh
   jq '{artifactKind:"bp.studio.study_event_approvals.v1",schemaVersion:1,candidateSetId,decisions:[.decisions[]|{candidateId,decision,reviewer,rationale}]}' \
     data/study-event-approvals/reviews/candidate-set-49af8c8721457fa7532a7345.review-worksheet.json \
     > /tmp/candidate-set-49af8c8721457fa7532a7345.approval.json
   ```

4. Run `study merge-events` with `--wiki-import <artifact>`,
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

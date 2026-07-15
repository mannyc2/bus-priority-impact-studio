# Study-event operator approval receipts

This is the tracked, append-only handoff location for Plan 074 study-event
approval receipts. Candidate set `candidate-set:49af8c8721457fa7532a7345`
has a validated immutable receipt at
`receipts/candidate-set-49af8c8721457fa7532a7345.approval.json`: all 403
candidates have explicit decisions, with 5 approved and 398 rejected. The
strict merge resolves to `approvalState: "approved"` and exposes only those
five events through `approvedEvents`.

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

The workflow below applies to a **new** candidate-set id. Do not reopen or
overwrite the completed receipt above.

1. Use a clean, immutable MTA Wiki release and rebuild
   `data/artifacts/studio/v2/studies/study-events.json` without an approval.
2. Generate and review a new `reviews/candidate-set-NEW_ID.review-worksheet.json`.
   It must contain every candidate and its provenance, with informational
   analysis-window hints only. Replace every `REVIEW_REQUIRED` value with
   `approved` or `rejected`, and fill every `reviewer` and `rationale`. The
   worksheet is deliberately not a valid receipt while any sentinel or blank
   human field remains.
3. Project the completed worksheet to the strict receipt wire shape at a
   scratch path:

   ```sh
   jq '{artifactKind:"bp.studio.study_event_approvals.v1",schemaVersion:1,candidateSetId,decisions:[.decisions[]|{candidateId,decision,reviewer,rationale}]}' \
     data/study-event-approvals/reviews/candidate-set-NEW_ID.review-worksheet.json \
     > /tmp/candidate-set-NEW_ID.approval.json
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

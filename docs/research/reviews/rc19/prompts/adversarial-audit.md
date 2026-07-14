Adversarially audit the rc19 review preparation without editing files.

Read docs/research/reviews/rc19/inputs/manifest.json,
docs/research/reviews/rc19/hard-gate-triage.json,
docs/research/reviews/rc19/deep-review-input.json, the candidate set, Plan
074, and the merge implementation in /tmp/bus-reliability-tracker-rc19-audit.
Check that all 501 unique candidates are covered, calendar windows are
intersected with 2023-04 through 2026-03, and the 446 hard rejects genuinely
fail spine and/or four-month-per-side admission.

Investigate all 12 cross-source conflict groups. Determine whether they are
actually identical route/family/precision/date pairs that Plan 074 says
should exact-deduplicate while retaining provenance. In reviewNotes, report
any consumer/merge defect and whether it changes candidate-set identity or
requires rebuilding before an approval receipt can be valid.

Return zero candidate decisions with batchId adversarial-audit. Put findings
only in reviewNotes. Do not edit files or create a receipt.

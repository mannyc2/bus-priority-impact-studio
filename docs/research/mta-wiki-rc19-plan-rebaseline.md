# MTA Wiki rc19 plan rebaseline

Date: 2026-07-14

This is the Tracker-side amendment record for Plans 074, 075, and 083 after assessing the
pinned MTA Wiki v1-rc19 corpus release candidate. It does not promote the release, mutate the
prior approval receipt, run a study, or publish an artifact.

No new numbered plan is created. The live plan index already assigns Plan 084 to the de-month
doctrine, so this record amends only the existing 074/075/083 assumptions.

## Plan 074

The segment-spine admission rule remains binding: series_ready and series_ready_with_gaps are
the only route-readiness states that can proceed to study review. Evidence, route/treatment
identity, exact-or-conservative date handling, outcome-window, overlap/confounder, and
candidate-set-bound approval gates remain unchanged.

The corrected rc19 candidate set is `candidate-set-v2:24080902f508b55a0033df32`. It contains
489 candidate rows, has approval state `awaiting_approval`, and has zero approved rows. Its 87
identity additions include 11 exact-day rows with a ready spine and one month-precision row with
a with-gaps spine. The other 75 additions are still blocked by `needs_pattern_review`. The full
set has 274 rows with at least four calendar months per side and 215 calendar-ineligible rows;
calendar admission does not override evidence, spine, overlap, or estimator gates.

## Plan 075

The public-study and publication boundary remains unchanged. No public artifacts, D1/R2 data,
or studies were regenerated. Even candidates that pass the structural review prefilter require
a new human receipt and a separate decision to run or publish.

## Plan 083

The prior statement that 39 ACE candidates were blocked **solely** by
`needs_pattern_review` overstates the current unlock cohort. The historical review report called
this a mutually exclusive *primary* rejection category while retaining additional defects in the
receipt rationales. Its 39 identities cover 37 routes. The receipt-derived partition is 20 with no
additional phase/overlap defect named, 14 that also fail clean-onset identity because an earlier
ABLE/ACE phase exists under the collapsed treatment family, and 5 that also have an inseparable
same-route lane onset inside the study window. The 20 are a technical diagnostic cohort, not 20
pre-approved studies and not proof that no other estimator or publication gate will fail.

The corrected full rc19 set has 40 calendar-eligible ACE identities across 38 routes that fail the
mechanical spine gate: the historical cohort plus Q6 on 2025-09-15. Q6 also overlaps its
2025-08-31 Queens redesign onset, so it does not enlarge the 20-row no-other-named-defect cohort.

The new identity delta separately has 75 spine-blocked additions across 74 routes: 73
`route_redesign`, one `automated_bus_lane_enforcement`, and one `bus_lane`. The historical 39-row
cohort and its candidate-set-bound receipt remain immutable; they are not reinterpreted as rc19
approvals.

The broader "5 of 403" premise remains a historical baseline fact only: the old receipt has 5
approved rows out of 403. It is not a current rc19 coverage claim. The corrected rc19 set has 489
unapproved rows, 12 exact cross-source deduplications, zero conflict groups, and 84 rows in the
`queens_bus_network_redesign_2025` treatment group.

The spine spike remains independently necessary because the pinned route manifest still contains
267 `needs_pattern_review`, 93 `series_ready`, and 25 `series_ready_with_gaps` routes. Its impact
measurement should report route-level flips for all 267 routes, diagnostic flips for the 39
historical identities/37 routes, and candidates advanced to full review among the 75 rc19
additions and 40 current ACE structural-gate identities. It must not call those flips approvals or
unlocked studies. Rebuilding or relaxing the spine is not part of this audit; any future rebuild
creates a new input/candidate-set hash boundary and requires a complete new receipt. Previously
rejected rows may be prioritized for review but cannot be silently readmitted.

## Consumer compatibility

The v3 occurrence importer consumed the pinned rc19 release. Review then exposed a narrow v2
merge defect: occurrence-backed candidates were keyed by occurrence identity while registry
candidates used the Plan 074 exact event key, so 12 identical route/family/precision/date pairs
could not deduplicate and appeared as false conflicts. The consumer fix folds a registry draft
into the unique exact-matching occurrence group, retains both provenances and occurrence-backed
scope metadata, and fails closed if more than one occurrence identity matches. The rebuilt set
has 489 candidates, 12 exact deduplications, and zero conflicts; two independent runs were
byte-identical.

The frozen logical merge-input snapshot is a hash witness, not a replay input: the current merger
still reads SQLite directly. Reproduction therefore requires a fresh snapshot to compare
byte-for-byte with the frozen snapshot before the database-backed runs, with the database left
unchanged through both runs. The audit does not overclaim direct replay from the snapshot.

The legacy v2 operational-anchor importer still correctly rejects a v3 manifest by schema; rc19
is consumed through the versioned occurrence path, not by weakening or bypassing the old
contract. One occurrence was rejected for `unsupported_bundle_analysis_family`, and the removed
old identity is `M86+|off_board_fare_collection|2015-07-13|day`.

## Operator boundary

The completed Codex/subagent reconciliation binds exactly 489 recommendations to
`candidate-set-v2:24080902f508b55a0033df32` and candidate artifact SHA-256
`42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba`: 16
`recommend_approve`, 473 `recommend_reject`, and zero `needs_followup`. The 16 comprise the five
historically approved identities plus 11 new Queens route-redesign identities. Of the 12 rc19
additions that pass the mechanical calendar-plus-spine prefilter, the remaining
`B67|bus_lane|2025-09|month` row stays rejected because the frozen review lacks an exact
lane-overlap spine, treats September as installation commencement rather than a clean operational
completion date, and contains a competing same-route lane candidate dated 2025-10-02. The other
75 additions fail the mechanical prefilter.

The reconciliation is not an approval receipt and authorizes neither a study run nor publication.
Its audit hash chain covers the corrected rubric, 477-row transfer proof, explicit 12-row recheck,
batch manifest, and all batch inputs/outputs in addition to the final 489-row reconciliation.
The precise operator decision is to explicitly authorize a new receipt bound to the exact set ID,
candidate artifact hash, and input hashes that approves exactly the 16 listed recommendations and
rejects the remaining 473, or to provide explicit candidate-level overrides with rationale. Until
that exact set-bound decision is made, the current approved count remains zero and no new study may
run. Receipt approval only admits a candidate to the estimator; sample/control, pre-trend, placebo,
sensitivity, claim-tier, separate run, and publication gates remain independently binding.

The reproducible audit and all consumed hashes are in
[mta-wiki-rc19-study-candidate-audit.md](./artifacts/mta-wiki-rc19-study-candidate-audit.md) and
[mta-wiki-rc19-study-candidate-audit.json](./artifacts/mta-wiki-rc19-study-candidate-audit.json).
The unapproved candidate set is [candidate-set-v2 study-events](./artifacts/candidate-set-v2-24080902f508b55a0033df32.study-events.json);
the [Codex review reconciliation](./reviews/rc19/corrected/rc19-review-reconciliation.json) and
[review worksheet](./artifacts/candidate-set-v2-24080902f508b55a0033df32.review-worksheet.json)
are explicitly non-authorizing and are not approval receipts.

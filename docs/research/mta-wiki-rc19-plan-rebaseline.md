# MTA Wiki rc19 plan rebaseline

Date: 2026-07-13

This is the Tracker-side amendment record for Plans 074, 075, and 083 after assessing the
pinned MTA Wiki v1-rc19 corpus release candidate. It does not promote the release, mutate the
prior approval receipt, run a study, or publish an artifact.

## Plan 074

The segment-spine admission rule remains binding: series_ready and series_ready_with_gaps are
the only route-readiness states that can proceed to study review. Evidence, route/treatment
identity, exact-or-conservative date handling, outcome-window, overlap/confounder, and
candidate-set-bound approval gates remain unchanged.

The new rc19 candidate set is candidate-set-v2:1810cf792be7e2346b335fb5. It contains 501
candidate rows, has approval state awaiting_approval, and has zero approved rows. Its 87
identity additions include 11 exact-day rows with a ready spine and one month-precision row with
a with-gaps spine. The other 75 additions are still blocked by needs_pattern_review.

## Plan 075

The public-study and publication boundary remains unchanged. No public artifacts, D1/R2 data,
or studies were regenerated. Even candidates that pass the structural review prefilter require
a new human receipt and a separate decision to run or publish.

## Plan 083

The prior statement that 39 ACE candidates were blocked solely by needs_pattern_review is stale
for the rc19 candidate set. The new identity delta has 75 spine-blocked additions: 73
route_redesign, one automated_bus_lane_enforcement, and one bus_lane. The historical 39-row
cohort and its candidate-set-bound receipt remain immutable; they are not reinterpreted as rc19
approvals.

The broader "5 of 403" premise remains a historical baseline fact only: the old receipt has 5
approved rows out of 403. It is not a current rc19 coverage claim. rc19 has 501 unapproved rows,
12 conflict groups / 24 conflict-marked rows, and 84 rows in the
queens_bus_network_redesign_2025 confounder group.

The spine spike remains independently necessary. Rebuilding or relaxing it is not part of this
audit.

## Consumer compatibility

The v3 occurrence importer consumed the pinned rc19 release and the v2 study merge accepted its
supported projections without a Tracker consumer-contract failure. The legacy v2 operational-
anchor importer correctly rejects a v3 manifest by schema; rc19 is therefore consumed through
the versioned occurrence path, not by weakening or bypassing the old contract. One occurrence
was rejected for unsupported_bundle_analysis_family, and the removed old identity is
M86+|off_board_fare_collection|2015-07-13|day.

## Operator boundary

The operator must review candidate-set-v2:1810cf792be7e2346b335fb5 and issue a new approval
receipt bound to the exact candidate-set and input hashes. The precise decision is per candidate:
approve or reject only after checking evidence/authority/truth, route and treatment scope, exact
or month date precision, spine readiness, outcome-window coverage, overlap/confounders, and
independent-estimate feasibility. No new study may run and no publication may occur before that
receipt and the separate run/publication gates.

The reproducible audit and all consumed hashes are in
[mta-wiki-rc19-study-candidate-audit.md](./artifacts/mta-wiki-rc19-study-candidate-audit.md) and
[mta-wiki-rc19-study-candidate-audit.json](./artifacts/mta-wiki-rc19-study-candidate-audit.json).
The unapproved candidate set is [candidate-set-v2 study-events](./artifacts/candidate-set-v2-1810cf792be7e2346b335fb5.study-events.json);
the worksheet is explicitly incomplete and not an approval receipt:
[review worksheet](./artifacts/candidate-set-v2-1810cf792be7e2346b335fb5.review-worksheet.json).

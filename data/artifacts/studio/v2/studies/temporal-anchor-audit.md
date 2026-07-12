# Temporal anchor audit — 2026-07-11

This report follows the evidence-safe date funnel from the MTA Wiki release to
the Bus Priority Impact Studio study-event approval boundary. Counts are from
the deterministic artifacts named below; no documentation-corpus date is used
as a treatment onset.

## Pinned inputs

- MTA Wiki release: `v2-operational-anchors-1`
- Generator commit: `d28b64c80d52c35fd2e5d9a8f4b93fe7cbce3376`
- Manifest SHA-256: `b69bd9458a92a817c329cfaa2741ef93dece4d2bbdb4695ea775b09622f5c56c`
- Operational-anchor artifact SHA-256: `7ddeeea6e36a377c14559af67f9ed378bc54d9a233d6e969f875743ab06291cc`
- Accepted-review snapshot SHA-256: `07ac7fac34534a35977cff04d8d4f4b3bf175c2575d75f5b85b3d871722a9dfd`
- Imported assertion artifact SHA-256: `e3254889b9a5f0a47c52f336c86167e3ae3fae2eda2269104b5d9303b073ef0f`
- Combined study-event artifact SHA-256: `940240da559c17395596c87322be0222f55fe745e6b96c82269e1a5af02ab414`
- Candidate-set id: `candidate-set:49af8c8721457fa7532a7345`

Release status: the scoped generator changes were committed before this
immutable cut. A detached clean worktree at the manifest's `generator_commit`
independently produced the same manifest bytes and SHA-256 as the durable
producer checkout.

## Existing-ontology baseline and remediation delta

With the accepted review-decision directory disabled, the existing ontology
produces 630 operational-family rows and zero study-eligible anchors. The
baseline reaches 15 route-resolved rows but zero treatment-resolved rows;
missing treatment scope/evidence affects 599 rows and missing route
scope/evidence affects 582. This measurement preceded the ontology extension
and targeted review pass.

The scoped remediation added direct treatment-to-event support plus three
append-only, exact-evidence reviewed tuples. It did not mutate canonical JSONL:
630 → 633 rows, 0 → 3 resolved treatments, and 0 → 3 eligible anchors.

## Bounded missing-date remediation queue

The current release has 127 rows excluded for `missing_operational_date`.
This audit bounds follow-up to the 35 whose assertion status is `delivered` or
`in_progress`; the other 92 are planned, proposed, or unknown and are not in
the realized-onset queue. All 35 queued rows are still classified
`status_as_of`, so a status/report date cannot be substituted for onset.

| Queue outcome | Count |
|---|---:|
| Delivered/in-progress rows inspected | 35 |
| Resolved to an evidence-safe onset in this pass | 0 |
| Explicitly unresolved | 35 |

The targeted bus-priority lane below remains unresolved in the current
evidence projection. These are queue identities, not inferred dates:

| Anchor | Current blockers beyond the missing date | Outcome |
|---|---|---|
| `operational:event_m86-sbs-step4-implementation` | lifecycle and treatment scope are ambiguous; route scope is partially unmatched; status-as-of only | unresolved |
| `operational:event_q44-sbs-launch` | route scope is missing; treatment scope is ambiguous; status-as-of only | unresolved |
| `operational:event_fulton-st-launch` | route and treatment scope/evidence are missing; status-as-of only | unresolved |
| `operational:event_39th-ave-two-way-conversion` | lifecycle and treatment scope are ambiguous; route scope is missing; status-as-of only | unresolved |
| `operational:event_sbto-start` | lifecycle and treatment scope are ambiguous; route scope is missing; status-as-of only | unresolved |

The narrow, exact-evidence M86 fare-collection tuple was accepted separately;
that does not justify assigning its date to the broader M86 Step 4 bundle.
No date is imputed from publication, season, plan, or status-as-of evidence.

## MTA Wiki evidence funnel

| Gate | Count |
|---|---:|
| Canonical events inspected | 7,945 |
| Timeline-linked operational-family rows | 633 |
| Candidate operational date present | 506 |
| Realized operational | 153 |
| Realized day/month precision | 131 |
| Exactly one resolved GTFS route | 18 |
| Exactly one resolved treatment | 3 |
| Complete event/timeline/route/treatment evidence | 3 |
| Conflict-free | 3 |
| Producer study-eligible | 3 |

The three evidence-safe rows are M15 off-board fare collection on 2010-10-10,
M86 off-board fare collection on 2015-07-13, and M86 launch-time real-time
information on 2015-07-13. The study-family boundary supports the two explicit
off-board-fare rows; real-time information remains documented but is rejected
as an unsupported causal treatment family.

Largest producer exclusion counts (reasons overlap):

| Reason | Count |
|---|---:|
| Missing treatment scope/evidence | 599 |
| Missing route scope/evidence | 582 |
| Ambiguous/non-realized lifecycle phase | 304 |
| Planned, not realized | 305 |
| Imprecise date | 208 |
| Status-as-of only | 175 |
| Missing usable operational date | 127 |
| Untrusted/unknown source authority | 88 |
| Unsupported subject scope | 37 |
| Ambiguous treatment scope | 21 |
| Future date paired with delivered status | 19 |

## Strict tracker import

| Result | Count |
|---|---:|
| Source rows | 633 |
| Assertions after exact semantic deduplication | 619 |
| Exact duplicate rows removed | 14 |
| Cross-date conflict groups quarantined | 20 |
| Locally eligible assertions | 3 |
| Rejected assertions retained with reason codes | 616 |

The importer independently rechecks producer eligibility, manifest and file
hashes, date precision/coherence, event family and lifecycle phase,
route/treatment cardinality, evidence coverage, review and truth states, and
official-source authority. It also verifies the manifest-addressed accepted
review snapshot and binds every reviewed-inherited row to exactly one decision.
It never upgrades a producer-ineligible row.

## Combined study-event gate

| Result | Count |
|---|---:|
| Local registry rows inspected | 741 |
| Trusted registry candidates after exact deduplication | 401 |
| Wiki assertions inspected | 619 |
| Wiki candidates admitted | 2 |
| Combined candidates | 403 |
| Source rows/assertions rejected | 957 |
| Remaining reported conflicts | 3 |
| Operator-approved events | 0 |

Registry rejections include 168 rows from the retired
`tier2_document_operational_date_assertions` source and 172 non-implemented
NYC DOT source-gap rows. The full rejection ledger is in `study-events.json`.
The candidate set contains 323 bus-lane events, 78 automated-enforcement
events, and 2 Wiki-backed off-board-fare events. All 403 candidates currently
have `conflictState: none`; the three reported conflicts belong to Wiki
assertions that were quarantined before candidacy.

## Approval boundary

State: `awaiting_approval`.

No study event is approved automatically. A valid approval artifact must bind
to `candidate-set:49af8c8721457fa7532a7345`, contain exactly one reviewed
decision for every combined candidate, include reviewer and rationale, and may
approve at most one date from each same-month conflict. Any candidate,
provenance, conflict, or pinned Wiki-release change invalidates that approval
identity.

Durable operator receipts belong in
`data/study-event-approvals/receipts/`. No receipt exists for this candidate
set, and the intentionally invalid example in the parent directory is not an
approval.

## Determinism

Independent reruns produced byte-identical assertion and study-event artifacts:

- assertion artifact: `e3254889b9a5f0a47c52f336c86167e3ae3fae2eda2269104b5d9303b073ef0f`
- study-event artifact: `940240da559c17395596c87322be0222f55fe745e6b96c82269e1a5af02ab414`

Machine-readable sources:

- `data/artifacts/studio/v2/wiki/document-operational-date-assertions-v2.json`
- `data/artifacts/studio/v2/studies/study-events.json`
- `/mnt/models/dev/mta-wiki/data/exports/releases/v2-operational-anchors-1/operational_anchors_summary.json`
- `/mnt/models/dev/mta-wiki/data/exports/releases/v2-operational-anchors-1/operational_anchor_review_decisions.json`

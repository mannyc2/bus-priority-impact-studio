# MTA Wiki rc19 study-candidate audit

This deterministic audit compares the pinned baseline candidate set with the separately generated rc19 set using the identity key `routeId|treatmentFamily|implementationDate|datePrecision`. Rejection reason counts are non-exclusive when one rejected row carries multiple reasons. MTA evidence establishes event context and scope; it never substitutes for an independent outcome estimate.

## Release and approval boundary

- Wiki release: v1-rc19, manifest v3, generator commit 35984e9d75ee00849ee5a580a45064976122e4bb.
- Verified manifest SHA-256: c5d4563d37815d330b37898774a027fb07563335163fcfccbaeebfc3da81720f.
- All 20 files declared by the rc19 manifest were rehashed before comparison; the supplied 64-character digest matches exactly.
- The release was selected by its explicit manifest path, never through `LATEST`. `LATEST` was observed as v1-rc5, so rc19 remains a pinned candidate input and is not described as promoted or production.
- Completion checks: 47 acquisition targets; 148/148 terminal operational diagnostics; 489/489 terminal priority-queue dispositions; zero open priority rows.
- rc19 occurrence import: 135 occurrences (50 atomic, 85 bundle, 10 multi-route), 134 study-eligible, 172 route projections, 1 rejected.
- Baseline: candidate-set:49af8c8721457fa7532a7345, 403 candidates, 5 approved.
- New set: candidate-set-v2:24080902f508b55a0033df32, 489 candidates, approval state awaiting_approval, zero approved.
- The corrected v2 merge exact-deduplicated 12 registry/Wiki pairs while retaining both provenances; 0 cross-source same-month conflict groups remain.
- Candidate generation used consumer commit `6dd3219869ba694483a6dbd5a8b31c79e6f7de04` and a read-only logical database input of 741 registry rows plus 385 available analysis routes. Three independent outputs were byte-identical at SHA-256 42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba.
- The logical database snapshot is a hash witness and reproducibility preflight, not a replay input: the current merge CLI still reads SQLite directly. A rebuild is comparable only when a fresh snapshot matches the frozen bytes and the database remains unchanged through both merge runs.
- The baseline receipt is not reused; the new set requires a new explicit approval receipt.
- The final Codex/subagent review hash chain rehashed 18 files, including the corrected rubric, transfer proof, 12-row recheck, manifest, and every batch input/output. The reconciliation covers all 489 corrected candidate rows at reconciliation SHA-256 8b5f77c9391970223aaa1fee8c3833a2d00c90e1755b80267c76ffbfb95c522c. It is explicitly non-authorizing.

## Operational-evidence funnel

The producer contract changed from individual assertions to reviewed occurrences, so the accepted/rejected rows below are deliberately not presented as a like-for-like numerical delta.

| Evidence view | Total | Accepted / study-eligible | Rejected / non-eligible | Candidate-pipeline input? |
| --- | ---: | ---: | ---: | --- |
| Baseline legacy assertion import | 619 assertions | 3 | 616 | Yes, historical |
| rc19 legacy anchor export | 760 rows | 9 | 751 | No |
| rc19 occurrence import | 135 occurrences | 134 | 1 | Yes, current |

The baseline assertion import also records 630 rejected source-anchor rows, 7 exact-duplicate groups / 14 rows, and 20 cross-date conflict groups. The rc19 legacy anchor export contains 9 reviewed rows and 9 reviewed eligible rows, but the v3 candidate path consumes occurrences, not that legacy export.

## Funnel delta

| Measure | Baseline | rc19 | Delta |
| --- | ---: | ---: | ---: |
| Candidate rows | 403 | 489 | 86 gross |
| Identity additions | — | — | 87 |
| Identity removals | — | — | 1 |
| Source-rejected rows | 957 | 384 | -573 |
| Conflict groups | 3 | 0 | -3 |
| Operator-approved rows | 5 | 0 | -5 |

The 87 identity additions are 84 route_redesign, 2 bus_lane, and 1 automated_bus_lane_enforcement; they cover 86 distinct routes. The one removed identity is M86+|off_board_fare_collection|2015-07-13|day, rejected by rc19's unsupported bundle-analysis family gate.

Treatment-family counts changed as follows:

| Family | Baseline | rc19 | Delta |
| --- | ---: | ---: | ---: |
| automated_bus_lane_enforcement | 78 | 79 | 1 |
| bus_lane | 323 | 325 | 2 |
| off_board_fare_collection | 2 | 1 | -1 |
| route_redesign | 0 | 84 | 84 |

## Dates and outcome windows

- Full rc19 set: 487 exact-day rows and 2 month-precision rows. No day was fabricated for a month-only event.
- Calendar intersected with 2023-04 through 2026-03, excluding the implementation month: 272 day rows and 2 month rows have at least four months per side; 215 rows are calendar-ineligible.
- Exact outcome statuses: {"calendar_ineligible":215,"eligible_day_4plus":31,"eligible_day_6x6":241,"eligible_month_precision":2}.

## Candidate gates and review funnel

- 85 additions have exact day dates with full six-month calendar windows; 2 have month precision and remain date-conservative.
- 75 additions are blocked by needs_pattern_review; 11 are series_ready and 1 is series_ready_with_gaps.
- Of the 87 additions, 12 advance through the mechanical calendar-plus-spine prefilter to full review: 11 exact-day and 1 month-precision. Advancement is not approval.
- Full set mechanical disposition: 434 hard rejects and 55 candidates requiring deep evidence/phase/geometry/confounder review. Exact combinations: {"blocked_by_calendar_only_among_mechanical_gates":63,"blocked_by_spine_and_calendar":152,"blocked_by_spine_only_among_mechanical_gates":219,"deep_review_required":55}.
- All 87 additions are conflict-free. The full corrected rc19 set has 0 conflict groups / 0 conflict-marked rows.
- 84 rows carry queens_bus_network_redesign_2025 grouping metadata. The tested redesign self-group exemption prevents treating the intervention as its own confounder; genuinely separate same-route interventions still require review.
- The v3 occurrence importer and corrected v2 study merge are compatible. The consumer fix restores Plan 074 exact cross-source deduplication without weakening evidence, route, treatment, date, spine, overlap, or approval gates. One occurrence was correctly source-rejected for unsupported_bundle_analysis_family.
- The legacy v2 operational-anchor importer rejects a v3 manifest by schema; rc19 is intentionally consumed through the versioned occurrence importer, with no fallback or gate relaxation.

## Non-authorizing Codex review

The completed recommendation ledger is bound to candidate set `candidate-set-v2:24080902f508b55a0033df32` and artifact SHA-256 `42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba`. It contains 16 `recommend_approve`, 473 `recommend_reject`, and 0 `needs_followup` decisions. These are recommendations only: the ledger authorizes neither a study run nor publication and is not an approval receipt.

The 16 recommended approvals are:

- `B82+|automated_bus_lane_enforcement|2024-09-30|day`
- `BX28|automated_bus_lane_enforcement|2024-09-16|day`
- `BX38|automated_bus_lane_enforcement|2024-09-16|day`
- `BX9|automated_bus_lane_enforcement|2025-11-10|day`
- `M79+|automated_bus_lane_enforcement|2024-09-30|day`
- `Q45|route_redesign|2025-06-29|day`
- `Q61|route_redesign|2025-06-29|day`
- `Q63|route_redesign|2025-06-29|day`
- `Q80|route_redesign|2025-08-31|day`
- `Q86|route_redesign|2025-06-29|day`
- `Q87|route_redesign|2025-06-30|day`
- `Q89|route_redesign|2025-06-29|day`
- `QM34|route_redesign|2025-09-02|day`
- `QM44|route_redesign|2025-06-30|day`
- `QM64|route_redesign|2025-06-30|day`
- `QM68|route_redesign|2025-06-30|day`

Of the 12 rc19 additions that passed the mechanical calendar-plus-spine prefilter, 11 receive non-authorizing approval recommendations. The remaining row, `B67|bus_lane|2025-09|month`, remains rejected because the frozen review lacks an exact lane-overlap spine, treats the month as installation commencement rather than a clean operational completion date, and records a competing same-route lane candidate. The other 75 additions fail the mechanical spine/calendar prefilter.

The 5 approval recommendations among unchanged identities exactly match the historical receipt's approved identity set: true. That comparison does not carry the old authorization into the new set.

### Rejection buckets

Counts are reason occurrences for source rejections and candidate rows for downstream structural/reviewer gates; they are not mutually exclusive unless explicitly called a disposition. Reviewer hard-failure counts use only explicit `fail` prefixes. `needs_followup` and `unresolved` are reported separately and are never mislabeled as hard failures. Every one of the 473 reject recommendations has at least one fail-prefixed hard gate.

| Bucket | rc19 finding |
| --- | --- |
| Route scope | 0 candidate-merge source-reason occurrences; 896 legacy producer-anchor exclusion-reason occurrences; 323 rejected candidate rows with explicit route/proximity hard failures; 1 with route/proximity follow-up or unresolved flags |
| Treatment scope | 57 candidate-merge source-reason occurrences; 730 legacy producer-anchor exclusion-reason occurrences; 343 rejected candidate rows with explicit treatment/phase/onset/lane hard failures; 1 with treatment-scope follow-up or unresolved flags |
| Evidence / authority / truth | 341 candidate-merge source-reason occurrences; 1205 legacy producer-anchor exclusion-reason occurrences; 343 rejected candidate rows with evidence-scope or date hard failures; 7 with evidence/date follow-up or unresolved flags |
| Outcome coverage | 215 calendar-ineligible candidate rows; 2 eligible month-precision rows remain conservative; 215 rejected candidate rows with outcome-window hard failures; 0 with outcome follow-up or unresolved flags |
| Segment spine | 371 needs_pattern_review rows; 458 rejected candidate rows with a spine hard failure (including missing exact lane-overlap spines); 0 with spine follow-up or unresolved flags |
| Overlap / confounders | 0 conflict groups; 84 treatment-group-tagged rows; 46 rejected candidate rows with a hard overlap/confounder failure; 42 with overlap/confounder follow-up or unresolved flags (107 including prespecified sensitivities/flags) |
| Consumer contract | 0 candidate-merge source-reason occurrences; 0 review-rejected candidate rows with an explicit contract/schema/incompatibility hard failure after the exact-dedup fix |
| Unclassified producer reasons | 0 candidate-merge source-reason occurrences; 3 legacy producer-anchor reason occurrences retained without inferring a gate bucket |

## Plan rebaseline

Plan 083's old 39 ACE candidates blocked solely by needs_pattern_review statement is not supported by the historical receipt. Its primary spine bucket contains 39 identities across 37 routes: 20 have no additional phase/overlap defect named, 14 also have an earlier ABLE/ACE phase, and 5 also have a same-route lane overlap.

The current full set has 40 calendar-eligible ACE identities across 38 routes that fail the mechanical spine gate. The rc19 identity delta has 75 spine-blocked additions across 74 routes ({"automated_bus_lane_enforcement":1,"bus_lane":1,"route_redesign":73}). These are candidates advanced or blocked for further review, never automatically unlocked studies.

The broader 5 of 403 premise remains a historical receipt fact only. rc19 has 489 unapproved rows. The independent spine spike remains justified by the unchanged route-manifest population: 267 needs_pattern_review, 93 series_ready, and 25 series_ready_with_gaps. Any spine rebuild creates a new input/candidate-set boundary and requires a complete new receipt.

Plan 074's spine admission rule, evidence requirements, confounder handling, and candidate-set-bound approval remain unchanged. Plan 075's public-study publication boundary remains unchanged: no public artifacts or studies are regenerated by this audit.

The live plan index confirms Plan 084 is already occupied by the de-month doctrine. This rc19 work creates no Plan 084; it rebaselines existing Plans 074, 075, and 083 through the Tracker-side amendment record.

## Reproduce the candidate build

Run the import and merge commands from a checkout containing consumer commit `6dd3219869ba694483a6dbd5a8b31c79e6f7de04`. All output paths are explicit; the source database and MTA Wiki checkout are read-only inputs. The merger does not replay the snapshot directly, so stop if the snapshot comparison fails and do not mutate the database between the preflight and either merge run.

```sh
bun tools/pipeline-v2/scripts/snapshot-rc19-study-merge-inputs.ts \
  --db /mnt/models/dev/bus-reliability-tracker/data/local/pipeline.sqlite \
  --output /tmp/rc19-study-merge-logical-inputs.json
cmp /tmp/rc19-study-merge-logical-inputs.json docs/research/artifacts/mta-wiki-rc19-study-merge-logical-inputs.json

bun --filter @bp/pipeline-v2 cli -- studio import-mta-wiki-operational-occurrences \
  --mta-wiki-root /mnt/models/dev/mta-wiki-corpus-completion \
  --wiki-release v1-rc19 \
  --wiki-manifest-sha256 c5d4563d37815d330b37898774a027fb07563335163fcfccbaeebfc3da81720f \
  --output /tmp/rc19-operational-occurrences.json

bun --filter @bp/pipeline-v2 cli -- study merge-events \
  --db /mnt/models/dev/bus-reliability-tracker/data/local/pipeline.sqlite \
  --wiki-import /tmp/rc19-operational-occurrences.json \
  --output /tmp/rc19-study-events-a.json
bun --filter @bp/pipeline-v2 cli -- study merge-events \
  --db /mnt/models/dev/bus-reliability-tracker/data/local/pipeline.sqlite \
  --wiki-import /tmp/rc19-operational-occurrences.json \
  --output /tmp/rc19-study-events-b.json
cmp /tmp/rc19-study-events-a.json /tmp/rc19-study-events-b.json
sha256sum /tmp/rc19-study-events-a.json /tmp/rc19-study-events-b.json
```

## Reproduce this audit

Run from the Tracker worktree after regenerating or restoring the two frozen rc19 artifacts at the committed paths:

```sh
bun tools/pipeline-v2/scripts/audit-mta-wiki-candidate-set.ts \
  --baseline /mnt/models/dev/bus-reliability-tracker/data/artifacts/studio/v2/studies/study-events.json \
  --baseline-wiki-import /mnt/models/dev/bus-reliability-tracker/data/artifacts/studio/v2/wiki/document-operational-date-assertions-v2.json \
  --baseline-receipt /mnt/models/dev/bus-reliability-tracker/data/study-event-approvals/receipts/candidate-set-49af8c8721457fa7532a7345.approval.json \
  --baseline-review-report /mnt/models/dev/bus-reliability-tracker/data/study-event-approvals/reviews/candidate-set-49af8c8721457fa7532a7345.review-report.md \
  --build-record docs/research/artifacts/mta-wiki-rc19-candidate-build-record.json \
  --logical-merge-inputs docs/research/artifacts/mta-wiki-rc19-study-merge-logical-inputs.json \
  --review-reconciliation docs/research/reviews/rc19/corrected/rc19-review-reconciliation.json \
  --consumer-commit 6dd3219869ba694483a6dbd5a8b31c79e6f7de04 \
  --candidate docs/research/artifacts/candidate-set-v2-24080902f508b55a0033df32.study-events.json \
  --occurrences docs/research/artifacts/mta-wiki-v1-rc19.operational-occurrences-import.json \
  --spine /mnt/models/dev/bus-reliability-tracker/data/artifacts/studio/v2/speed-spines/2023-04_to_2026-03/manifest.json \
  --wiki-manifest /mnt/models/dev/mta-wiki-corpus-completion/data/exports/releases/v1-rc19/manifest.json \
  --mta-wiki-root /mnt/models/dev/mta-wiki-corpus-completion \
  --acquisition-frontier /mnt/models/dev/mta-wiki-corpus-completion/data/quality/acquisition/target-list.md \
  --coverage-manifest /mnt/models/dev/mta-wiki-corpus-completion/data/quality/operational-coverage/manifest.json \
  --priority-queue /mnt/models/dev/mta-wiki-corpus-completion/data/quality/operational-coverage/priority-queue.jsonl \
  --plan-index /mnt/models/dev/bus-reliability-tracker/plans/README.md \
  --plan-074 /mnt/models/dev/bus-reliability-tracker/plans/074-segment-study-engine.md \
  --plan-075 /mnt/models/dev/bus-reliability-tracker/plans/075-studies-surface.md \
  --plan-083 /mnt/models/dev/bus-reliability-tracker/plans/083-spine-pattern-grouping-spike.md \
  --wiki-manifest-sha256 c5d4563d37815d330b37898774a027fb07563335163fcfccbaeebfc3da81720f \
  --analysis-month 2026-03 \
  --output docs/research/artifacts/mta-wiki-rc19-study-candidate-audit.json
```

A second run must reproduce the JSON and Markdown byte-for-byte. The JSON records every consumed artifact hash, all verified release-file hashes, and the live plan/receipt hashes.

## Operator decision required

For the Tracker to admit any rc19 candidate, the operator must explicitly authorize a new receipt for candidate-set-v2:24080902f508b55a0033df32 bound to candidate artifact SHA-256 42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba. The concrete proposed decision is to approve exactly the 16 identities listed above and reject the other 473, or to provide explicit candidate-level overrides with rationale. Codex recommendations are non-authorizing and do not replace that receipt. Until the operator makes that exact set-bound decision, the approved count remains zero and no new study may run. Receipt approval only admits candidates to the estimator; sample/control, pre-trend, placebo, sensitivity, claim-tier, separate run, and publication gates remain independently binding.

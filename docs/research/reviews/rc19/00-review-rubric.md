# rc19 study-candidate recommendation rubric

> Historical discovery rubric only. It binds the superseded 501-row set whose false conflicts
> exposed the consumer deduplication defect. Use `corrected/00-review-rubric.md` for the final
> 489-row review; nothing in this file authorizes a receipt or study.

Date: 2026-07-14

This rubric governs non-authorizing review recommendations for
`candidate-set-v2:1810cf792be7e2346b335fb5`. It does not approve a candidate, create or
amend a receipt, authorize `study run`, or authorize publication. Reviewers must write
`recommend_approve`, `recommend_reject`, or `needs_followup`; they must never write an
approval artifact or reinterpret a historical decision as current authority.

## Frozen review universe

Review exactly the 501 candidates in the supplied v2 artifact, not only the 87 identity
additions and not only candidates that look structurally promising. The supplied worksheet has
501 unique `REVIEW_REQUIRED` rows, blank reviewer/rationale fields, no approval, and the same
candidate identities as the candidate artifact.

The following SHA-256 values were rechecked while preparing this rubric:

| Input | SHA-256 |
| --- | --- |
| rc19 candidate artifact | `8bf554a8a9c0f6d90d81b910094710e46d3bc779d5373b982f412b1b04348dbb` |
| incomplete review worksheet | `f00d374a9ebe4ddaf68f0ebdf35ebb9fe3b96188da2ae1c0d45476c4e6ab4217` |
| deterministic rc19 audit | `81af314874abd9208a35b5fa3775310e28e5566a70f019f37cee4b378dff1ae5` |
| historical v1 candidate set | `63da356a9ace61e2755b41540567b4a79a6d8c4a4b5c045df85f79b7b687bb84` |
| historical v1 receipt | `6c17f106dd394b70848bd401283ee1fb7d5b1b8123c4cb2ea8dd8c36a959b6a2` |
| 2023-04 through 2026-03 spine manifest | `aa342bc154340a1da7209225eb0e32e0bb3df0321b84e3ebb432cb2dffe2b7a7` |
| MTA Wiki `v1-rc19` manifest | `c5d4563d37815d330b37898774a027fb07563335163fcfccbaeebfc3da81720f` |
| `v1-rc19/operational_occurrences.jsonl` | `424ee1ceed24bc8c8af77d49e328c0f6bb7859e88a619bbb79a0c13ac7ed5399` |
| `v1-rc19/operational_occurrence_review_decisions.json` | `8e0c60c0cc581a184bcf74d45240f2ecffc6c5e2f38eb34c6da86cb9f37cb629` |

The worksheet's `generatedFromSha256` equals the candidate-artifact digest. All 20 files
declared by the immutable `v1-rc19` manifest were also rehashed successfully. The audit records
the occurrence-import wrapper digest as
`47371908c45642aeec58bec3d7f450290e761bafe572afedf993fc11d065022e`;
do not substitute a differently hashed wrapper for the immutable release files.

Before using a recommendation, reconciliation must recheck these hashes. A mismatch, missing
candidate, duplicate candidate, changed identity field, changed spine manifest, or changed MTA
release is `needs_followup` and a batch-level stop. The v2 candidate-set digest binds candidates,
conflicts, and Wiki input, but not the spine manifest; Plan 083 nevertheless requires a new set
and a new review after any spine rebuild. A reviewer may not silently apply a newer spine to this
set.

## Identity rule

For every row, copy `candidateId`, `routeId`, `treatmentFamily`, and `implementationDate`
verbatim from the frozen candidate artifact. Also verify, even though it is not a required
top-level output field, the candidate's `datePrecision`, `implementationMonth`, occurrence or
registry source identity, treatment-scope kind, component families, and confounder group.

Use `routeId|treatmentFamily|implementationDate|datePrecision` as the human comparison key used
by the rc19 audit. Do not treat that key alone as authority:

- Registry v2 IDs are derived from route, family, precision, and date.
- MTA Wiki v2 IDs are derived from occurrence, route, treatment scope/family, component families,
  and confounder group; the implementation date is not part of that candidate-ID digest.
- Therefore an unchanged MTA Wiki `candidateId` does not prove an unchanged date. The complete
  row and frozen candidate-artifact hash must match.
- `+` is an SBS route identity. Local and SBS routes do not inherit evidence from one another.
  The only special Queens zero-padding aliases admitted by current merge code are the explicit
  `Q01` through `Q09` mappings to `Q1` through `Q9`; do not invent a generic alias rule.

The historical set `candidate-set:49af8c8721457fa7532a7345` and its 403 decisions are context
only. Matching suffixes, routes, dates, or old rationales do not carry a decision into rc19.

## Required reviewer output

Each batch output must be a JSON array, sorted by `candidateId`, containing exactly one object
for every assigned candidate and no unassigned candidates. Use exactly these top-level fields:

```json
{
  "candidateId": "study-event-v2:...",
  "routeId": "B67",
  "treatmentFamily": "bus_lane",
  "implementationDate": "2025-09",
  "recommendation": "recommend_approve|recommend_reject|needs_followup",
  "rationale": "Concise evidence-backed reason.",
  "gates": {
    "evidenceScope": { "status": "pass|fail|flagged|unresolved", "evidence": "..." },
    "date": { "status": "pass|fail|flagged|unresolved", "evidence": "..." },
    "spine": { "status": "pass|fail|flagged|unresolved", "evidence": "..." },
    "outcome": { "status": "pass|fail|flagged|unresolved", "evidence": "..." },
    "conflict": { "status": "pass|fail|flagged|unresolved", "evidence": "..." },
    "confounder": { "status": "pass|fail|flagged|unresolved", "evidence": "..." }
  }
}
```

Every gate needs a non-blank evidence string naming the decisive record, evidence block, manifest
route entry, month counts, candidate IDs, or competing event. Do not use bare conclusions such as
`looks valid`. Preserve a month-precision `implementationDate` as `YYYY-MM`; never synthesize a
day.

Gate statuses mean:

- `pass`: the frozen evidence positively satisfies the gate.
- `fail`: a verified, current-input defect makes this candidate ineligible under Plan 074.
- `flagged`: the fact is established and is a prespecified non-authorizing caveat or sensitivity,
  not by itself a candidate-admission failure. Use this chiefly for handled confounders.
- `unresolved`: available evidence cannot decide a material question. State the exact follow-up
  needed; do not guess.

## Recommendation decision rule

Apply these rules in order:

1. `recommend_reject` is allowed when at least one gate has a verified hard `fail` that is
   independently dispositive on the frozen inputs. Examples are wrong route/treatment scope,
   non-realized or false onset, an ineligible spine, fewer than four possible months on either
   side, a non-selected duplicate after conflict resolution, or an inseparable competing
   treatment. Rejection means ineligible for this set and manifest, not invalid forever.
2. If there is no independently dispositive hard failure and any material gate is `unresolved`,
   use `needs_followup`. It is neither a soft approval nor a place to hide a likely rejection.
3. `recommend_approve` is allowed only when `evidenceScope`, `date`, `spine`, `outcome`, and
   `conflict` all pass, `confounder` is either `pass` or an explicitly allowed `flagged` case,
   no material ambiguity remains, and an exact segment-level study is feasible in principle.
4. A known hard failure may support `recommend_reject` even when a secondary question remains
   unresolved; name both. For example, a verified `needs_pattern_review` spine remains
   dispositive even if a later cohort design also needs work.

The rationale should usually be one or two sentences. Name the decisive gate and any allowed
flag; do not repeat all six evidence strings.

## Gate 1: `evidenceScope`

This gate combines evidence quality, authority/truth, exact route identity, treatment identity,
phase identity, and treatment geometry.

It passes only when authoritative evidence establishes all of the following:

- a realized operational change, not an announcement, proposal, construction start without
  operation, future commitment, publication date, retrieval date, status-as-of statement, or
  performance claim;
- the exact analysis route, including local versus SBS identity;
- the candidate treatment family and, for a bundle, an explicit supported bundle analysis family
  plus the exact source-stated members;
- a clean estimand: first onset or a separately identified incremental phase, not an unlabelled
  expansion, rebrand, duplicate phase, or project-wide scope inherited by a route row; and
- for lane/busway studies, exact treated geometry that can map through the current-to-spine
  crosswalk. Street proximity, route-stop proximity, fuzzy similarity, array position, or a
  corridor served by the route does not establish route-specific treatment onset or segment
  identity.

Source-specific rules:

- `mta_ace_routes` is route/program-granular and its implementation date can establish an exact
  ACE onset, but reviewers must still distinguish local/SBS and check for an earlier ABLE/ACE
  phase collapsed into `automated_bus_lane_enforcement`.
- A `nyc_dot_bus_lanes` registry candidate is produced from segment openings plus a proximity or
  same-street route association. That proves nearby infrastructure, not an authoritative
  route-specific onset. It fails unless current, cited evidence independently binds the exact
  route, treatment phase, date, and usable lane geometry. Do not copy the historical blanket
  result without rechecking the row; equally, do not upgrade proximity to authority.
- An MTA Wiki candidate's upstream `review_state=approved` and
  `study_projection_eligible=true` are necessary, not sufficient. Locate its occurrence and
  accepted decision in the immutable `v1-rc19` release, then open every decisive
  `<source_id>#<evidence_block>` under
  `/mnt/models/dev/mta-wiki-corpus-completion/wiki/sources/`. Verify that the blocks actually bind
  event date, route identity/scope, treatment definition/scope, and (for bundles)
  `bundle_analysis_family`. Missing bindings are not reconstructed from the decision rationale.

Use `fail` for a source that positively shows the wrong route, wrong treatment, non-realized
status, or inseparable phase. Use `unresolved` when a cited block is absent/unreadable,
authorities contradict one another, route or bundle scope remains genuinely ambiguous, or a
needed current source has not been checked.

## Gate 2: `date`

The date must be an operational onset for the exact route/treatment/phase that passed
`evidenceScope`.

- For `datePrecision=day`, verify the exact `YYYY-MM-DD` against authoritative event-date or
  timeline evidence. The monthly engine still excludes the whole implementation month.
- For `datePrecision=month`, a recommendation may pass only when authoritative evidence says the
  realized onset occurred within that `YYYY-MM` and there is no competing day/month or phased
  rollout that changes the estimand. Exclude the entire implementation month. Never coerce the
  value to the first, middle, or last day.
- A month-precision row is not automatically rejected, but `month precision` plus an unresolved
  within-month phase is `unresolved` and therefore `needs_followup` unless another gate already
  hard-fails.
- Publication, retrieval, board-approval, planning, status-as-of, and completion-report dates do
  not become onset dates merely because they are precise.
- A contradictory or demonstrably wrong candidate date is `fail`; an unresolved competing date
  is `unresolved`.

## Gate 3: `spine`

Use only the frozen manifest with SHA-256
`aa342bc154340a1da7209225eb0e32e0bb3df0321b84e3ebb432cb2dffe2b7a7`.
Its route totals are 93 `series_ready`, 25 `series_ready_with_gaps`, 267
`needs_pattern_review`, and 0 `failed`. Candidate-row totals differ because routes recur: the
audit reports 88, 32, and 381 candidate rows respectively.

- `series_ready` passes.
- `series_ready_with_gaps` passes the spine-admission gate, but the `outcome` gate must separately
  prove the candidate-specific window has enough non-null observations.
- `needs_pattern_review`, `failed`, or a route absent from a correctly hashed manifest is a hard
  `fail` for this set. Plan 074 admits only the two ready states.
- Do not override readiness from reason strings, recalculate with looser thresholds, or assume raw
  keys are stable. Current classification uses exact identity, rejects ambiguity, and permits
  `series_ready_with_gaps` only with minimum monthly coverage at least 0.75 and partial months at
  most 25% of the route's source months.
- Plan 083 is a future grouping/rebuild path, not permission to reinterpret a current
  `needs_pattern_review` route. Any future reclassification requires a rebuilt manifest, new set,
  and new review.

If the manifest itself cannot be hash-verified, use `unresolved` and stop the batch rather than
turning every missing lookup into a candidate rejection.

## Gate 4: `outcome`

The fixed analysis corpus is `2023-04` through `2026-03`. For implementation month `I`:

- nominal pre window = `I-6` through `I-1`;
- nominal post window = `I+1` through `I+6`, capped at `2026-03`;
- the implementation month is always excluded; and
- each surviving treated or control segment must have at least four distinct non-null months on
  each side, with positive trip weight.

The admission minimum is four usable months, not six. Therefore `2023-08` is the earliest and
`2025-11` the latest calendar-eligible implementation month under the fixed corpus. A
`2025-12` onset has only January through March 2026 (three post months) and hard-fails. The
audit's `full_6_post` label is a structural convenience, not the admission threshold; four- or
five-post-month rows can pass.

Calendar eligibility alone is insufficient. Cite actual route/segment history and report usable
pre/post counts. At least one exact treated segment must survive the four-month rule for a study
to be estimable at all; segments that do not survive are dropped and counted. For
`series_ready_with_gaps`, lack of a candidate-window check is `unresolved`. For lane/busway rows,
the counts must apply to exact lane-overlap spine segments, not all nearby route segments.

The post-admission `minSample` gate (at least five matched treated segments) and
`controlEligibility` gate (at least 20 eligible control segments, with at least two matches per
treated segment) may cap a result at descriptive and do not by themselves falsify the event.
This follows the old B82+ rationale. However, zero usable treated segments, no exact treatment
geometry, or a known impossibility of any independent comparison is not a harmless small-sample
flag: mark the relevant admission gate `fail` or `unresolved`.

## Gate 5: `conflict`

Consult both the candidate row and the artifact's complete `conflicts` array.

- `conflictState=none` passes only after checking that no unflagged same-route/date/phase duplicate
  or competing candidate remains.
- `same_month_review_required` never passes in isolation. Review the entire conflict group
  together. Current validation allows at most one approved **candidate** in a group, even when
  both candidates carry the same exact day.
- If authoritative evidence selects one representation/date, that candidate may pass and each
  non-selected duplicate/alternative fails with the selected candidate ID named in evidence.
- If the assigned reviewer cannot inspect the partner row or the group has no recorded joint
  resolution, use `unresolved`/`needs_followup`; do not race another batch reviewer.

The current 12 groups are same-day registry/Wiki duplicate representations for B60, B68, BX20,
BX3, BX36, BX5, BX7, M100, M2, M4, M42, and M57. A one-value `dates` array therefore does not
mean the conflict has disappeared. Some of these rows independently fail the spine or outcome
gate, but their duplicate status must still be reported.

## Gate 6: `confounder`

Check more than `confounderGroupId`. Search the full candidate/event set for same-route or
same-corridor interventions in the six-month pre/implementation/post study window, earlier phases
of the same collapsed family, and program-wide changes. Also remember that the current control
screen excludes routes with an approved event of any family within plus or minus nine months of
the candidate onset, so final control feasibility can depend on batch-wide recommendations.

- A distinct same-route treatment inside the study window is `fail` when its effect cannot be
  separated under the current estimand. The historical M96 ACE/bus-lane case is the governing
  example.
- A prior lane or other treatment outside the study window does not contaminate the onset by
  itself; cite its date. The historical M79+, B82+, and BX38 rationales use this rule.
- For a Manhattan-serving route whose post window includes `2025-01` or later, congestion pricing
  is an established Plan 074 flag with a prespecified sensitivity excluding months from
  `2025-01` onward. Mark `flagged`, not automatic rejection, when treatment identity otherwise
  remains clean.
- For a Q route whose study window touches `2025-06` through `2025-12`, the Queens redesign is an
  established flag with a sensitivity excluding those months when it is external to the studied
  treatment.
- For `treatmentFamily=route_redesign` plus
  `confounderGroupId=queens_bus_network_redesign_2025`, current gate code intends the reviewed
  redesign occurrence to be the treatment itself rather than an external confounder. Do not
  auto-reject it merely for carrying that group. Still verify exact route/bundle scope, concurrent
  non-redesign treatments, stable pre/post identity, usable outcomes, and a credible control
  pool.

There is a current execution ambiguity specific to that last exception: the estimator accepts
`treatmentFamily` and `treatmentConfounderGroupId`, but `study run` strict-decodes only the v1 event
artifact and does not pass those v2 fields into the estimator. Thus a ready Queens-redesign row
that relies on the exception must be `needs_followup` (confounder `unresolved`) unless a separate,
documented v2 execution path and control design is supplied; a separate hard failure may still
support `recommend_reject`.

## Independent-estimate boundary and post-run gates

`recommend_approve` means only that a candidate is suitable for admission to a newly authorized,
candidate-set-bound run. It does not promise a publishable or non-null effect.

Plan 074 still requires, after admission:

- exact current-to-spine mapping; no fuzzy or positional join;
- lane/busway treated segments from exact lane overlap, with any all-route fallback governed by
  the Plan 074 cohort-level STOP policy rather than invented by a reviewer;
- same-borough controls with no approved event of any family within plus or minus nine months;
- at least two matched controls per treated segment, at least five matched treated segments for
  the minimum-sample gate, and at least 20 eligible control segments;
- pre-trend, placebo-in-time, congestion-pricing, and redesign gates/sensitivities; and
- an honest `no_detectable_change`, descriptive, or `not_estimable` result when warranted.

The current command-level `study run`/v2 contract gap is a batch execution blocker and must be
resolved before any run. It does not, by itself, turn every ordinary candidate-truth
recommendation into `needs_followup`; it does prevent reviewers from claiming that any
recommendation is currently runnable. Candidate types that depend on unwired v2-only semantics,
including the Queens-redesign exception above, do require per-row follow-up.

No recommendation clears the separate human receipt, run, anchor-review, public-study, D1/R2,
or publication gates.

## Mandatory `needs_followup` cases

Absent an independently dispositive hard failure, use `needs_followup` for any of these:

- candidate/worksheet/hash/manifest identity mismatch;
- a cited evidence block or accepted occurrence decision that cannot be resolved in the pinned
  release;
- contradictory authority, route identity, treatment scope, bundle family, phase, or onset date;
- month precision that cannot rule out a materially phased or competing within-month onset;
- a same-month conflict that has not been adjudicated as a whole;
- `series_ready_with_gaps` without candidate-window segment coverage evidence;
- plausible but unverified lane-overlap geometry or any proposed fuzzy/proximity segment join;
- a competing same-route event whose separability is unknown;
- batch-dependent control depletion or a dense simultaneous-treatment cohort without a documented
  independent-estimate design; or
- a ready Queens-redesign treatment row relying on the currently unwired v2 confounder exception.

Do not use `needs_followup` for a known current-manifest `needs_pattern_review` route merely because
a future spine project might repair it; that is a current hard rejection gate.

## Historical rationale lessons, not decisions

The old receipt's five approvals demonstrate the still-binding logic: authoritative exact-route
ACE onset, local/SBS identity resolved, ready or with-gaps spine, at least four actual months per
side, and no inseparable same-route onset. M79+'s congestion-pricing exposure remained a flagged
sensitivity; B82+'s small segment count remained a post-run descriptive-tier question; BX9 passed
with exactly four post months.

Its conservative rejections likewise remain useful doctrine: 163 rows too early for four pre
months, 53 too late for four post months, DOT proximity rows without exact-route onset authority,
39 then-current `needs_pattern_review` ACE rows, six later ACE phases after existing ABLE, and one
same-route overlap. Those counts describe only the historical set. Plan 083's old 39-row cohort
and the broader 5-of-403 result are not rc19 coverage claims; rc19 has 501 unapproved rows, 12
conflict groups/24 marked rows, and 84 Queens-redesign confounder-group rows.

## Governing sources

- `docs/research/mta-wiki-rc19-plan-rebaseline.md`
- `docs/research/artifacts/mta-wiki-rc19-study-candidate-audit.json`
- `/mnt/models/dev/bus-reliability-tracker/plans/074-segment-study-engine.md`
- `/mnt/models/dev/bus-reliability-tracker/plans/083-spine-pattern-grouping-spike.md`
- `/mnt/models/dev/bus-reliability-tracker/tools/pipeline-v2/src/lib/study-engine/study-events.ts`
- `/mnt/models/dev/bus-reliability-tracker/tools/pipeline-v2/src/lib/study-engine/{panel,gates,estimator}.ts`
- `/mnt/models/dev/bus-reliability-tracker/tools/pipeline-v2/src/commands/study/{merge-events,prepare-review-worksheet,run}.ts`
- `/mnt/models/dev/bus-reliability-tracker/data/study-event-approvals/receipts/candidate-set-49af8c8721457fa7532a7345.approval.json`
- `/mnt/models/dev/bus-reliability-tracker/data/study-event-approvals/reviews/candidate-set-49af8c8721457fa7532a7345.review-report.md`

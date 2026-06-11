# Intervention Gap Calibration Inventory

Generated: 2026-06-10 (calibration loop completed 2026-06-11)

## Scope

ADR-0018 slice for `intervention_gap` (Wave 3 #11 in
`docs/research/backend-goal-finish-detectors.md`). Adds deterministic, fixture-tested review-queue,
reviewed-gold, evaluation, and readiness-projection machinery for the **route** grain (single
`intervention_gap` reason, standard 5-bucket vocabulary). It does not claim public readiness and does
not promote any finding. No detector thresholds or caps were changed.

The detector flags high-pain routes (max of speed/reliability pain ≥ 85) whose local intervention
evidence is `absent` or `thin_source_gap`, emitting the top `candidateLimit` (default 100) by pain
score (85–100).

## No-Write Run (default cap) + High-Limit Probe

| Metric | Default cap (100) | Candidate limit 20,000 |
| --- | ---: | ---: |
| Feature routes | 381 | 381 |
| Emitted candidates | 8 | 8 |
| Coverage rows (hit / clean_no_hit / skipped) | 8 / 342 / 31 | 8 / 342 / 31 |

**No cap suppression** (8 = 8 at the high limit). Emitted set spans boroughs (sample: B=4, BX=2,
Q=1, S=1). 31 routes skipped (no pain signal).

## Dominant risk: treatment-inventory completeness + pain-threshold fairness

The claim is a **scope-review candidate** ("high pain, no strong dated treatment evidence"), only as
honest as the treatment inventory. The queue:
- forces the weaker **`thin_source_gap`** evidence class into review (vs the stronger `absent` class)
  and records the emitted evidence-status mix (`emittedByEvidenceStatus`);
- samples **borough-spread** controls as the pain-threshold fairness lens (the plan flags fairness
  across boroughs).
Calibration tags make the honesty explicit: `not_proof_of_absence`,
`future_or_undated_treatment_possible`, `treatment_inventory_incomplete` — absent/thin local evidence
is not proof no treatment exists.

## Initial Calibration Slice (package-owned, deterministic)

Added under `packages/applied-research/src/evaluation/`:
`intervention-gap-review-queue.ts` (strata: top_score, near_threshold, thin_source_gap,
borough_spread, cap_suppressed_control rank-based, clean/skipped controls; uses the S2.2 cap-policy
helper; `emittedByEvidenceStatus` summary) and `intervention-gap-reviewed-gold.ts` (standard 5-bucket
reviewed-gold + eval + readiness projection). Fixture-tested in
`packages/applied-research/test/intervention-gap-{review-queue,reviewed-gold}.test.ts`.

## Full-Output Run + Review Queue (2026-06-11)

Queue built from the persisted full rows with `buildInterventionGapReviewQueue()`:

```bash
bun run pipeline findings run-detector --detector-id intervention_gap \
  --year 2026 --month 3 --write-db false \
  --output data/artifacts/detector-calibration-intervention-gap/no-write-run-rows-pass.json \
  --rows-output data/artifacts/detector-calibration-intervention-gap/run-rows.json
bun --conditions=source <build review-queue.json from run-rows.json>
```

Run: 381 feature routes, 8 candidates, 381 coverage rows (8 hit / 342 clean_no_hit / 31 skipped,
all `missing_pain_signal`). Cap suppression 0, matching the 2026-06-10 high-limit probe, so the
production cap (100) is not a calibration risk this month.

24 rows selected for review: all 8 emitted candidates (every one is `thin_source_gap` — the weaker
evidence class — with `interventionEvidenceCount=1` and detector confidence `low`; the stronger
`absent` class emitted zero), 8 borough-spread `clean_control` rows, 8 `skipped_control` rows.
Emitted borough mix: B=4, BX=2, Q=1, S=1, M=0.

## Reviewed Gold (batch `2026-06-11-march-initial-24`)

All 24 selected rows labeled (adversarial depth on the 8 emitted, light on controls); decisions in
`reviewed-decisions.json`, gold in `reviewed-gold.json`.

| Label | Count | Routes |
| --- | ---: | --- |
| `primary_finding` | 0 | — (inventory-completeness cap; see below) |
| `route_context` | 5 | B84, B32, B70, B74, BX33 |
| `needs_more_evidence` | 3 | BX46, Q74 (single-signal pain), S40 (score 85 exactly at threshold) |
| `suppress` | 16 | 8 clean controls + 8 skipped controls |

The honesty constraint binds hard this month: every emitted candidate rests on a 1-row
`thin_source_gap` record, so "missing date ≠ no intervention" caps the whole emitted set at
`route_context`/`needs_more_evidence` — zero `primary_finding` labels by design, not by detector
failure. Public language must stay "treatment evidence is thin or missing", never "the MTA/DOT did
nothing".

Review findings worth keeping:

- **Evidence gate works on treated corridors**: M14D+ (14th St busway, reliability pain 100, 5
  dated evidence rows) and other pain-100 clean controls (B39, BX29, J90, Q51) are all held back by
  `dated_or_evaluated` evidence, not by the pain threshold — the strongest available proof the
  detector does not accuse treated corridors.
- **Gates are conjunctive**: L90 has `thin_source_gap` evidence but pain max 41, and is correctly
  clean; B102/Q108 have thin evidence but no pain signal at all and are correctly skipped.
- **Single-signal admissions**: BX46 (speed 20 / reliability 100), Q74 (40/90), and S40 (40/85)
  enter on reliability alone via the `max()` rule; held at `needs_more_evidence`.
- **Near-threshold**: S40 scores exactly 85, the pain floor, and sits on a corridor (Richmond
  Terrace / North Shore) with bus-priority proposal history — the clearest
  `future_or_undated_treatment_possible` case.

### Borough-fairness readout (emitted set)

The pain threshold (max of speed/reliability ≥ 85) is one formula applied fleet-wide; no
borough-specific parameter exists. Observed asymmetries are compositional, not threshold-driven:
Manhattan emits zero because its high-pain routes (e.g. M14D+) carry dated treatment evidence, and
Bronx/Staten Island admissions (BX46, S40) ride single-signal reliability pain at or near the
floor while Brooklyn admissions (B32, B70, BX33-equivalent profiles) enter on two signals. Worth
re-checking in later months whether SI/Bronx routes systematically enter near-threshold on one
signal; for March 2026 the selected clean controls (BX29, J90, Q51, M14D+ all pain 100, suppressed
by evidence) show no borough being held to a different pain bar.

## Evaluation + Readiness (`evaluation.json`, `readiness-projection.json`, asOfMonth 2026-06)

| Metric | Value |
| --- | ---: |
| Reviewed-primary survival | **0/0** (no primary labels possible at current inventory depth) |
| Suppress leakage | **0/16** |
| Context/reviewer expected still emitted | 8/8 |
| Unreviewed emitted candidates | 0 |
| Readiness buckets | 0 `public_finding_candidate`, 5 `route_context`, 3 `review_queue`, 16 `suppressed` |
| Coverage skipped (readiness-only accounting) | 31 (23 unreviewed) |

No detector thresholds or caps were changed; all gates were already label-consistent (zero
suppress leakage, zero label moved to make an eval pass).

## Recommendation

`intervention_gap` is calibrated at the ADR-0018 floor for March 2026 with an explicit ceiling:
combined gold shows zero suppress leakage and zero unreviewed emissions, but treatment-inventory
completeness (every emitted candidate is a 1-row `thin_source_gap`) caps the detector at
`route_context` — it has no public-finding candidates and should not be promoted as findings until
the treatment inventory can distinguish "verified no treatment" from "source gap". The 5
route_context routes are honest scope-review pointers; the 3 review_queue routes need a second pain
signal or an inventory check. Raising readiness requires deepening the inventory (mta-wiki Track D
snapshots are the obvious source), never relaxing the pain threshold or evidence gate.

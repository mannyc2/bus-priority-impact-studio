# Permit-Correlated Slowdown Calibration Inventory

Generated: 2026-06-10

## Scope

ADR-0018 slice for `permit_correlated_slowdown` (Wave 4 #13 in
`docs/research/backend-goal-finish-detectors.md`). Adds deterministic, fixture-tested review-queue,
reviewed-gold, evaluation, and readiness-projection machinery for the **route** grain (single
`permit_correlated_slowdown` reason, category `context`, standard 5-bucket vocabulary). It does not
claim public readiness and does not promote any finding. No detector thresholds or caps were changed.

## No-Write Run (default cap) + High-Limit Probe

| Metric | Default cap (100) | Candidate limit 20,000 |
| --- | ---: | ---: |
| Feature routes | 380 | 380 |
| Emitted candidates | 28 | 28 |
| Coverage rows (hit / clean_no_hit / skipped) | 28 / 322 / 30 | 28 / 322 / 30 |

**No cap suppression** (28 = 28 at the high limit). Manhattan-heavy emitted set (sample: M=13, Q=7,
BX=6, B=2) — slow Manhattan routes coincide with dense permit activity, which is plausible but exactly
why the association must be reviewed, not asserted.

## Family adaptation: associational context (primary rare by design)

Permit touches are **broad street-work context, not causal evidence by themselves**, so the expected
label mass is `route_context`/`suppress` and `primary_finding` is rare by design. The evaluation's
lens is therefore **leakage INTO findings** (`findingsLeakageCount` = how many were labeled
`primary_finding`; it should stay near zero), not primary survival. The queue surfaces the association
risks the plan flags:
- `high_route_fanout` — a permit touching many routes (route-LION fanout) is a weak, non-specific
  coincidence (read from the counter-evidence `permitContext.maxRouteFanout`);
- `low_match_weight` — weak permit-to-route join (`permitContext.averageMatchWeight`).
Calibration tags also cover temporal misalignment, unrelated work type, and the explicit
`not_a_causal_attribution` caveat.

## Initial Calibration Slice (package-owned, deterministic)

Added under `packages/applied-research/src/evaluation/`:
`permit-correlated-slowdown-review-queue.ts` (strata: top_score, near_threshold, high_route_fanout,
low_match_weight, borough_spread, cap_suppressed_control rank-based, clean/skipped controls; reads
speed/hotspot/permit-touch from the primary feature evidence and fanout/match-weight from the
counter-evidence permit-context; uses the S2.2 cap-policy helper) and
`permit-correlated-slowdown-reviewed-gold.ts` (standard 5-bucket reviewed-gold + eval with the
`findingsLeakageCount` lens + readiness projection). Fixture-tested in
`packages/applied-research/test/permit-correlated-slowdown-{review-queue,reviewed-gold}.test.ts`.

## Full-Output Run + Review Queue (2026-06-11)

```bash
bun run pipeline findings run-detector --detector-id permit_correlated_slowdown \
  --year 2026 --month 3 --write-db false \
  --output data/artifacts/detector-calibration-permit-correlated-slowdown/no-write-run-rows-pass.json \
  --rows-output data/artifacts/detector-calibration-permit-correlated-slowdown/run-rows.json
bun --conditions=source <build review-queue.json from run-rows.json>
```

Same shape as the inventory: 28 emitted, 380 coverage (28 hit / 322 clean / 30 skipped, all
`missing_speed`), **cap suppression 0** (rank-based check against the production cap of 100, matching
the high-limit probe). The default `low_match_weight` quota (12) would have left 2 of the 28 emitted
unselected, so the queue was built with `quota: { low_match_weight: 14 }` for the full-census review
the inventory recommended. 44 rows selected: all 28 emitted (4 `top_score`, 10 `high_route_fanout`,
14 `low_match_weight`; `near_threshold`/`borough_spread` empty — every emitted row scored above 66
and tripped a risk flag first), 8 borough-spread `clean_control`, 8 `skipped_control`.

## Reviewed Gold (batch `2026-06-11-march-initial-44`)

All 44 selected rows labeled (adversarial on the 28 emitted, light on controls); decisions in
`reviewed-decisions.json`, gold in `reviewed-gold.json`. As expected for the associational-context
family, **zero `primary_finding` labels** — no candidate had event-level temporal alignment or
causal support that would justify one.

| Label | Count | Routes |
| --- | ---: | --- |
| `route_context` | 7 | BX35, Q23, B60, Q12, B11, BX11, BX32 |
| `needs_more_evidence` | 8 | Q17, BX38, Q65, BX28, BX2, M125, M66, M22 |
| `suppress` (emitted) | 13 | M57, M31, M4, M42, M23+, M34+, M34A+, M50, Q85, Q31, Q27, M96, M106 |
| `suppress` (controls) | 16 | 8 clean + 8 skipped (`missing_speed`) |

Review findings worth keeping:

- **Route-LION fanout is the dominant failure mode.** The 8 fanout-suppressed rows are all Manhattan
  routes sharing wide-area permit clusters: M57/M31/M4 all read `maxRouteFanout` 54, M34+ and M34A+
  both read 49 (the same permits counted against both branches), M50 reads 45. M4's 1,429 permit
  touches are geometric over-join volume, not concentrated street work. M42 is the limit case: 0
  high-confidence touches out of 184 at weight 0.097.
- **Average match weight can be diluted by fringe matches.** BX11 (0.413) and BX32 (0.403) trip the
  low-weight flag but have low fanout (8 and 5) plus a real high-confidence core (61 and 49 touches),
  so they were labeled `route_context` despite the flag. The flag is a review trigger, not a verdict.
- **Hotspot-driven emissions with fast route-level speed** (Q17 at 8.5 mph/hotspot 97, Q12 at 9.6
  mph, Q85 at 10.6 mph, Q27 at 9.8 mph) overstate the "slow route" half of the claim text; Q85/Q31/
  Q27 were suppressed on combined weak-join + weak-slowness grounds.
- **Temporal alignment is unverifiable from the queue metrics.** The review rows carry month-level
  aggregates only (no permit window dates), so per-candidate month/daypart alignment could not be
  checked; `temporal_misalignment` was therefore never asserted, and the gap is absorbed into the
  blanket `not_a_causal_attribution` caveat plus the `needs_more_evidence` labels. Event-level permit
  windows are the next evidence upgrade for this detector.

## Evaluation + Readiness (`evaluation.json`, `readiness-projection.json`, asOfMonth 2026-06)

Context-family framing: the headline metric is **leakage INTO findings** (emitted rows a reviewer
would surface as `primary_finding`), not primary survival, plus the standard suppress-leakage lens.

| Metric | Value |
| --- | ---: |
| Findings leakage (`findingsLeakageCount`) | **0/28** emitted reviewed |
| Suppress leakage (reviewer-suppress labels still emitted) | **13/29** (`suppressStillEmittedCount`) |
| Context/reviewer-tier still emitted | 15/15 |
| Unreviewed emitted candidates | 0 |
| Readiness buckets | 0 `public_finding_candidate`, 7 `route_context`, 8 `review_queue`, 29 `suppressed` |
| Coverage skipped (readiness-only accounting) | 30 (22 unreviewed) |

The 13/29 suppress leakage is the honest calibration readout, not a relabeling target: the detector
currently emits 13 route-months (mostly the Manhattan fanout cluster) that an adversarial reviewer
would suppress. No thresholds or caps were changed; the labels exist precisely to motivate a fanout/
match-weight gate as a future, separately-reviewed change.

## Recommendation

`permit_correlated_slowdown` has its ADR-0018 labeled floor for March 2026: zero findings leakage
(the context-family invariant holds — nothing reviewed merits `primary_finding`), but 13/29 suppress
leakage concentrated in the route-LION fanout cluster. The detector stays **context-tier**: 7 routes
project to `route_context`, none to `public_finding_candidate`. Before any serving use, the fanout/
match-weight failure mode needs a deterministic gate (candidate-side fanout cap or high-confidence-
touch floor) evaluated against this gold set, and the temporal-alignment gap needs event-level permit
windows in the evidence payload. Neither change is made here.

# Plan 042 execution receipt

Plan 042 was executed in accelerated checkpoint mode against producer release
`v1-rc28` and consumer commit
`583c3538ad07c85b8e1d828f5bafa37570af8aa5`.

## Frozen denominator and package schedule

- Candidate set: `candidate-set-v5:1fadedfcb292deda5179bdf3`
- Review cut: `study-review-cut-v2:1ae9e99a8b4c32793b5dbc86`
- Candidate count: 555 (168 occurrence-route candidates and 387 no-member
  candidates)
- Grain matrix: 695 rows (308 member rows and 387 no-member rows)
- Accelerated review packages: 25 disjoint packages covering all 695 rows
- Risky review packages: 8 packages / 122 rows, each approved by two
  independent reviewers
- Routine review packages: 17 packages / 573 rows, each approved by one
  independent reviewer

The detailed frozen acceptance manifest is
`docs/research/reviews/closure-plan-042/acceptance-manifest.json`, SHA-256
`05e4f6f00dea8688acbe07c613930541714d7335a3bb6375680fe5cbad09454f`.
The finalized review handoff is
`docs/research/reviews/closure-plan-042/artifacts/review-handoff.json`,
SHA-256
`45946d1a0e515c38c3c481a199428750b9b9c4aca6975c4efd1c7d1c5ac04033`.

## Verdict distribution

| Verdict | Rows |
| --- | ---: |
| `blocked:binding_absent_after_search` | 321 |
| `blocked:member_grain_absent_in_source` | 165 |
| `blocked:member_grain_blocked_upstream` | 51 |
| `blocked:missing_endpoint_stop_id_equivalence` | 5 |
| `blocked:missing_pinned_service_pattern_product_coverage` | 5 |
| `blocked:missing_pinned_stop_grain_coverage` | 6 |
| `blocked:preserved_prior_rejection` | 60 |
| `blocked:route_lineage_incomparable` | 22 |
| `blocked:spine_not_ready` | 33 |
| `grain_context_only` | 19 |
| `grain_matched_primary` | 8 |

The eight exact prior ACE positives are preserved. No unsupported positive,
occurrence, segment, route-lineage, endpoint-equivalence, stop-set, or
service-pattern inference was created.

## Review and verification

Independent reviewer A approved all eight risky packages with no findings.
Independent reviewer B approved all 25 packages with no findings. The final
handoff applies one receipt to each routine package and two distinct receipts
to each risky package.

Focused tests passed 22/22. Typecheck, validation, deterministic replay,
architecture tests (42/42), unit tests (1,076/1,076), and web tests (342/342)
passed. The final style phase retained the pinned baseline signature of 6
errors and 39 warnings. The worker phase retained only the byte-identical
baseline sandbox failure `listen EPERM 127.0.0.1`. There were zero additional
failures.

The machine closure receipt is
`docs/research/reviews/closure-plan-042/downstream-pin-receipt.json`, SHA-256
`20a25d4f28851b31e8782e928521cabcf2dcf47ffc74c73ecddbe47476c4afee`.
It pins all addressed artifacts to the consumer commit, verifies the 18
protected surfaces against baseline commit
`b25542b0a735636e7051be8fb70893499671366f`, and records the per-phase
baseline/final comparison.

## Authorization

All Plan 042 outputs remain authority-false. This closure does not authorize a
study, publication, D1/R2 mutation, deployment, occurrence creation, or any
inferred outcome-grain match.

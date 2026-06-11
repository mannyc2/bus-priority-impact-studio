# Multi-Month Speed Peer Calibration Inventory

Generated: 2026-06-10 (labels added 2026-06-11)

## Scope

ADR-0018 slice for `multi_month_speed_peer` (Wave 2 #6 in
`docs/research/backend-goal-finish-detectors.md`). Records a no-write inventory and adds
deterministic, fixture-tested review-queue, reviewed-gold, evaluation, and readiness-projection
machinery for the **route** grain (single `multi_month_peer_speed_deficit` reason, standard 5-bucket
frontend-use vocabulary). It does not claim public readiness and does not promote any finding. No
detector thresholds or caps were changed.

The detector flags routes whose multi-month average speed sits a deficit below their matched peer
median (peers selected by route family / type / geography, with per-month fallback groups), emitting
the top `candidateLimit` (default 100) by score (55–100).

## No-Write Run (default cap) + High-Limit Probe

```bash
bun run pipeline findings run-detector --detector-id multi_month_speed_peer \
  --year 2026 --month 3 --write-db false \
  --output data/artifacts/detector-calibration-multi-month-speed-peer/no-write-run.json
bun run pipeline findings run-detector --detector-id multi_month_speed_peer \
  --year 2026 --month 3 --write-db false --candidate-limit 20000 \
  --output data/artifacts/detector-calibration-multi-month-speed-peer/no-write-run-limit20000.json
```

| Metric | Default cap (100) | Candidate limit 20,000 |
| --- | ---: | ---: |
| Feature routes | 367 | 367 |
| Emitted candidates | 8 | 8 |
| Coverage rows (hit / clean_no_hit / skipped) | 8 / 337 / 22 | 8 / 337 / 22 |

**No cap suppression** (8 = 8 at the high limit). The detector is conservative (max-average-speed ≤ 6
mph + peer-deficit ≥ 1 mph over ≥ 3 supported months). The emitted set is Manhattan-heavy (sample:
M=7, BX=1) — slow crosstown/local Manhattan routes below their matched peer median, which is plausible
but is exactly why **peer-group construction** must be reviewed before any public ranking. A single
batch can census all 8.

## Dominant risk: peer transparency (rankings invite methodology attacks)

Per the plan (§6 rankings framing), the review focus is peer-group transparency, not the cap:
- `fallback_peers` stratum — months where the peer group is not the strong
  `route_family_type[_spatial]` method (the detector records fallback methods per month).
- `thin_months` — fewer than 6 supported observed months (the detector's medium-confidence floor).
- Calibration tags also cover the reciprocal-metric (mph vs pace) artifact, seasonal/service-pattern
  confounds, and the "matched peers are a descriptive comparison, **not a causal control**" caveat.

## Initial Calibration Slice (package-owned, deterministic)

Added under `packages/applied-research/src/evaluation/`:

- `multi-month-speed-peer-review-queue.ts` — `buildMultiMonthSpeedPeerReviewQueue()`. Strata:
  `top_score`, `near_threshold`, `fallback_peers`, `thin_months`, `borough_spread`,
  `cap_suppressed_control` (rank-based, empty this month), `clean_control`, `skipped_control`. Uses
  the shared S2.2 `cap-policy` helpers; `hasStrongPeerGroup` is derived from the emitted peer-group
  methods.
- `multi-month-speed-peer-reviewed-gold.ts` — standard 5-bucket reviewed-gold, suppress-leakage +
  reviewed-primary survival evaluation, and readiness projection.

Both are pure applied-research code, fixture-tested in
`packages/applied-research/test/multi-month-speed-peer-{review-queue,reviewed-gold}.test.ts`.

## Full-Output Run + Review Queue (2026-06-11)

```bash
bun run pipeline findings run-detector --detector-id multi_month_speed_peer \
  --year 2026 --month 3 --write-db false \
  --output data/artifacts/detector-calibration-multi-month-speed-peer/no-write-run-rows-pass.json \
  --rows-output data/artifacts/detector-calibration-multi-month-speed-peer/run-rows.json
bun --conditions=source <build review-queue.json from run-rows.json>
```

Rows pass: 8 candidates / 16 evidence / 367 coverage (8 hit, 337 clean_no_hit, 22 skipped);
`capAccounting.status = below_production_cap` (8 of 8 within the cap-100 production set), matching
the 2026-06-10 high-limit probe, so the default-cap rows are the production set and no
`--candidate-limit 20000` rerun was needed — the queue's rank-based `capSuppressed` evaluates
against `productionCandidateLimit = 100` with only 8 ranked candidates. `run-rows.json` is 42 MB
(under the 50 MB cleanup line) and was kept.

24 rows selected for review: all 8 emitted candidates (all in the `fallback_peers` stratum — see
below), 8 borough-spread `clean_control` rows, 8 `skipped_control` rows (15
`insufficient_trend_months` + 7 `missing_current_trend_month` fleet-wide). Cap suppression 0.

## Peer-group finding (the headline)

Every emitted candidate's peer group was the **system-wide fallback for all 36 observed months**:
`peerGroupMethods = ["system"]`, ~327 peer routes ("System routes"), and a shared 8.83 mph peer
median across the whole batch. The candidate `claimText` says "below its matched peer median", but
no route-family/type[-spatial] matching actually occurred this run. Two consequences:

- The system median is inflated by express (BM/BX M/QM) routes, so the deficit overstates a
  like-for-like gap for crosstown locals — and is least defensible for the two SBS routes (M34+,
  M34A+) ranked against a pool of locals and express.
- The "matched peer" wording must not surface publicly while the strong peer-group methods produce
  zero coverage; this is exactly the methodology attack the plan's rankings framing warns about.

Reciprocal-metric check: all evidence is in mph with `median − route speed = recorded deficit`
(e.g. BX2: 8.83 − 5.97 = 2.87 ≈ 2.87); no mph/pace inversion artifacts found.

## Reviewed Gold (batch `2026-06-11-march-initial-24`)

All 24 selected rows labeled (adversarial depth on the 8 emitted, light on controls); decisions in
`reviewed-decisions.json`, gold in `reviewed-gold.json`.

| Label | Count | Routes |
| --- | ---: | --- |
| `primary_finding` | 0 | — |
| `route_context` | 6 | M57, M31, M42, M50, BX2, M8 (true persistent deficits, 2.85–3.60 mph over 36 months, but fallback-only peer group caps them at context) |
| `needs_more_evidence` | 2 | M34+, M34A+ (SBS routes vs a system pool — sharpest peer mismatch) |
| `suppress` | 16 | 8 clean controls + 8 skipped controls |

Zero `primary_finding` labels is the honest outcome, not a detector failure: the slow-speed
patterns themselves are credible (Manhattan crosstown locals at 5.2–6.0 mph), but a ranking that
claims a "matched peer median" cannot promote while every month fell back to the fleet-wide group.

## Evaluation + Readiness (`evaluation.json`, `readiness-projection.json`)

| Metric | Value |
| --- | ---: |
| Reviewed-primary survival | **0/0** (vacuous — no primary labels) |
| Suppress leakage | **0/16** |
| Context/reviewer expected vs still emitted | 8/8 |
| Unreviewed emitted candidates | 0 |
| Readiness buckets | 0 `public_finding_candidate`, 6 `route_context`, 2 `review_queue`, 16 `suppressed` |
| Coverage skipped (readiness-only accounting) | 22 (14 unreviewed) |

No detector thresholds or caps were changed.

## Recommendation

`multi_month_speed_peer` completes the ADR-0018 calibration floor for March 2026 with zero suppress
leakage and a full census of the emitted set, but it is **not promotable**: the blocking issue is
peer-group construction, not thresholds. Before any public ranking, either (a) the peer-group
builder must produce strong `route_family_type[_spatial]` groups with real coverage, or (b) the
claim wording must be changed to an honest citywide-median comparison. Until then the 6
`route_context` routes are the ceiling, and the readiness projection (not threshold relaxation)
stays the gate. The full-output review-queue writer gap is now closed for this slice via
`--rows-output`.

## Peer-group fix (2026-06-11)

Root cause of the zero strong-method coverage: `buildMultiMonthSpeedPeerRoutesFromHistory` in
`packages/applied-research/src/local-db/detector-study-rows.ts` hardcoded
`peerGroupMethod: "system"` for every month — no matched-peer construction had ever been
implemented. The detector's method vocabulary was wired but the input builder never used it.

Fix: service-class-aware peer selection in `@bp/analytics`
(`classifyMultiMonthSpeedPeerRoute` + `selectMultiMonthSpeedPeerGroup` in
`packages/analytics/src/findings/multi-month-speed-peer.ts`), wired into the input builder.
Service class is derived from the route id (SBS = trailing `+`; express = `BM`/`BXM`/`QM`/`SIM`/`X`
prefix; local otherwise) and borough from the alpha prefix. Fallback chain with a minimum
peer-group size (the detector's `minPeerRouteCount`, 10): borough + class
(`route_family_type`) → class only (`route_type`) → system pool (`system`), with the method
actually used recorded per month. `claimText` now matches the method per candidate
("below the median of NN same-class peer routes" / mixed wording / explicit citywide framing when
every month fell back to the system pool). No emission thresholds were changed.

Re-run: `no-write-run-peerfix.json` + `run-rows-peerfix.json`; re-evaluation against the
unchanged gold: `evaluation-peerfix.json` + `readiness-projection-peerfix.json`.

| Metric | Before (2026-06-11 gold pass) | After peer fix |
| --- | --- | --- |
| Emitted candidates | 8 | 6 |
| peerGroupMethods | `system` ×8 (all 36 months each) | `route_family_type` ×4 (M-local ×3, BX-local ×1), `route_type` ×2 (SBS) — zero `system` months |
| Peer-group sizes | ~327 system pool | 32–33 (M local), 42–43 (BX local), 19 (SBS class-wide) |
| M34+ / M34A+ | vs 8.83 mph mixed pool, deficits 3.08/2.89 | still emit vs the 19-route SBS pool (median 8.77), deficits 3.02/2.83 |
| Dropped | — | M50, M8 (deficit vs honest M-local median 6.66 falls below the 1 mph floor) |
| Suppress leakage | 0/16 | 0/16 |
| Context/needs-more-evidence still emitted | 8/8 | 6/8 (M50, M8 no longer emit) |
| Unreviewed emitted | 0 | 0 |

Re-review recommendation: the six surviving routes (M57, M31, M42, BX2 route_context with matched
borough-class peers; M34+, M34A+ needs_more_evidence now ranked against an SBS-only pool) are
candidates for label **upgrade** in a future review batch — the fallback-peer-group blocker that
capped them is resolved. Labels in `reviewed-gold.json` were not changed here; a new review batch
must make that call. M50/M8 no longer emit and need no relabel to stay honest.

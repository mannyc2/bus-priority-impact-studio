# Detector Calibration Results: June 2026

Status: synthesis of the 2026-06-11 full calibration sweep. This is the "what did the detectors
get us" record — the publishable core, the rejected analyses and why, and the guarantees that make
both trustworthy. Per-detector detail lives in each
`data/artifacts/detector-calibration-<name>/NOTE.md`; the queryable record is
`data/artifacts/detector-calibration-register.json` (860 reviewed labels across 18 detectors).
Read with `detector_catalog.md` (the map) and ADR-0018 (the loop every result below went through).

## Headline

All 21 registry detectors are dispositioned. Every product-facing detector has reviewed gold on
the March 2026 inventory: a stratified review queue, human/LLM-assisted adversarial labels, a
suppress-leakage evaluation, and a readiness projection. Serving is structurally gated — a
detector id can reach a public surface only through a readiness manifest's
`public_finding_candidate` / `route_context` buckets, and four never-public detectors are
blocklisted in `@bp/domain` with a register-consistency test.

The sweep produced two kinds of value, and the second is larger than it looks:

1. **~70 label-backed public finding candidates** across six detector families.
2. **Four flashy analyses killed before publication**, each with a documented root cause and a
   gold set waiting to re-evaluate the fix.

## What is publishable now

Label-backed `public_finding_candidate` buckets, March 2026:

| Family | Count | The claim | Reviewed survival / leakage |
| --- | ---: | --- | --- |
| `observed_reliability` | 22 | Routes with corroborated long-gap / wait reliability risk (GTFS-RT + BWA agreement) | 22/22, 0/15 |
| `customer_journey_shortfall` | 33 | Routes with poor journey-time performance, wait-side vs in-vehicle attributed | 33/33, 2/19 documented near-floor |
| `treatment_scope_gap` / `mismatch` | 12 | Slow segments outside or underperforming inside confirmed bus-lane coverage | 12/12, 0/23 |
| `speed_pace_hotspot` | 26 reviewed segs | Segment-dayparts far below free-flow pace, terminal-gated | 26/27, 0 |
| `delay_concentration` | 4 | B6, Q17, Q27, B17: 6 segments carry 73–88% of avoidable delay | 4/4, 0/16 |
| `intervention_underperformance` | 4 | M57, M42, M34+, M104: dated treatments, still underperforming peers (associational wording) | 4/4, 0/16 |
| `degradation_trend` | 1 | Q103: the only genuine multi-year gradual decline | 1/1, 0/16 |
| `bunching_hotspots` | 1 | S54 northbound stop pocket (51 pairs, bunching 0.647) — now rank 1 after the sufficiency fix | 1/1 |
| `headway_reliability_ewt` | 3 | Q13/QM11/SIM1 well-sampled excess-wait pockets (outside production top-100; see residuals) | 3 labeled, 0/23 leakage post-fix |

Context tier (`route_context`, soft placement only): 17 entries from the permit/311 context family
plus intervention_gap's 5 thin-inventory routes and the peer detector's 6 (below).

**The product story these support:** route pages with reviewed insights ("is my route one of the
bad ones"), a "where the delay actually sits" segment story (delay concentration + speed-pace),
and a methodology-disciplined treatment-underperformance piece. Rankings/superlatives become
defensible once the peer-fix routes are re-reviewed (next section).

## What calibration killed, and what the fix bought back

The sweep's most important outputs are the analyses that did **not** ship. None were fixed by
moving thresholds; each is recorded as a feature/readiness fix with labels that re-evaluate it.

1. **Stop-hour wait/bunching top-lists were feed artifacts.** 650k stop-direction-hour cells
   score-saturated (every qualifier in [80,100]), so the production top-100 was an arbitrary
   thin-sample slice; cells with 10–25 observed headways in a month (vs ~100–200 schedule-implied)
   were fractional GTFS-RT coverage where each missing arrival fabricates a "gap" or hour-scale
   EWT. *Fix shipped 2026-06-11:* `observationSufficiencySignal()` blends sample count × coverage
   share into the score. Saturation is gone; bunching's labeled primary ranks 1 and its leakage
   fell 14→5 (rest is the still-open stop-pocket dedupe); headway leakage fell 2→0. Honest
   residual: headway's three labeled primaries improved to ranks ~200–250 but remain outside the
   top-100 because the cells above them are *unreviewed well-observed* LoS-F cells — the next
   review batch should label the new top-100, which likely contains many real pockets.
2. **"Matched peer" rankings used the citywide pool.** `multi_month_speed_peer` claimed "below its
   matched peer median" while a wiring gap hardcoded the system-wide ~327-route pool (express
   routes inflating the median; SBS routes ranked against locals). *Fix shipped 2026-06-11:*
   class-based peers (SBS/express/local × borough, min size 10, honest fallback chain) and claim
   text that names the method used. The signal survived the fix nearly unchanged (M34+ deficit
   3.08→3.02 mph against a 19-route SBS-only pool) — the framing was the problem, not the math.
   Six routes (M57, M31, M42, BX2, M34+, M34A+) are flagged for label upgrade.
3. **`travel_time_variability` measures its own aggregation.** Percentiles are computed over 3–10
   hourly sums of a *varying* number of segment rows; row-count mix explains 16 of 18 emitted
   cells, and claim text published impossible magnitudes ("P50 503.9 min"). 16/44 suppress leakage
   recorded. Blocked until a trip-level (or composition-normalized) runtime feature exists.
4. **`schedule_mismatch` has no verifiable schedule baseline.** "Too tight" cells compare 15–151
   scheduled minutes to 175–650 observed — physically impossible; `servicePatternVersion` names a
   derivation method, not an in-effect schedule. All 24 reviewed emitted capped at
   `needs_more_evidence`, below even the plan's expected `route_context` ceiling. Bonus finding:
   the observed-runtime aggregation itself needs an audit.

Smaller recorded failure modes: `degradation_trend`'s candidates are mostly step breaks scored as
trends (route-version provenance missing from the history grain); the permit/311 context family
shares a route-LION fanout failure (one Manhattan grid permit cluster counted against many routes;
suppress leakage 13/29 and 12/28) while holding the family invariant of zero leakage into
findings; `observed_reliability`'s production cap hides 120 qualifiers with a Queens/express skew
(S2.2 follow-up).

## System guarantees (why the numbers above can be trusted)

- **Readiness-gated serving (S4.1).** Route insights are built only from manifest refs in public
  buckets; unknown ids are filtered; `SERVING_BLOCKED_DETECTOR_IDS` (persistent_speed_hotspot —
  superseded; intervention_event_study — candidate-causal; positive_deviance,
  rider_weighted_excess_wait — internal/experimental) can never serve, and a test asserts the
  blocklist mirrors the register's dispositions.
- **Labels never move to pass evaluations.** Every leakage number above (bunching 14/46, ttv
  16/44, permit 13/29…) was reported, not relabeled. Thresholds and `.max()` caps were never
  relaxed; both shipped fixes changed *ranking/wiring*, not admission.
- **Coverage and silence are auditable.** source_gap's agreement audit against the S2.4
  materialization artifact found zero overclaims (its failure mode is under-reporting: silent on
  14 route holes in 2 grains — wiring its states into other detectors' readiness is the named next
  step). Internal detectors confirmed structurally incapable of public buckets;
  intervention_event_study's internal bar (6/19 gate-failed panels still emitting) is explicitly
  not yet met.
- **Evidence packets are complete.** `evidence-packet-completeness-2026-03.json`: every
  candidate-bearing family carries primary + counter-evidence on 100% of candidates (source_gap's
  0 is its data-quality waiver).

## Named next steps (in value order)

1. Review batch over the new post-fix stop-hour top-100s (unlocks the excess-wait story) and the
   six peer-fix routes (unlocks rankings).
2. Stop-pocket dedupe gate for cross-route/adjacent-cell duplicates (bunching's remaining 5 leaks,
   headway rollups, event-study panel duplication).
3. Trip-level runtime feature (unblocks travel_time_variability); schedule provenance + observed
   runtime aggregation audit (unblocks schedule_mismatch).
4. Route-version provenance in the history grain (turns degradation_trend's step breaks into
   labeled break events); per-route permit/311 dedupe keyed on geometry clusters.
5. S2.2 cap-policy completion for observed_reliability's 120 hidden qualifiers.

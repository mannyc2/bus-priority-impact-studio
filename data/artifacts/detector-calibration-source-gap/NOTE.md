# Source Gap Calibration Disposition (coverage authority — no gold-precision frame)

Generated: 2026-06-10

## Scope

ADR-0018 disposition for `source_gap` (Wave 4 #15 in
`docs/research/backend-goal-finish-detectors.md`). Records the no-write inventory and the **family
adaptation**: `source_gap` is a **coverage-authority / data-quality detector**, not a problem-finding
detector. Per the plan, its calibration is *"an agreement audit between its emitted states and the
S2.4 materialization artifact, then wiring its states as admission inputs to other detectors'
readiness — no gold-set precision frame."* Accordingly **no standard review-queue / reviewed-gold
machinery was built** (it would misrepresent deterministic coverage states as a precision-reviewable
finding population, like the `rider_weighted_excess_wait` disposition). No thresholds were changed.

## No-Write Run (default cap) + High-Limit Probe

```bash
bun run pipeline findings run-detector --detector-id source_gap --year 2026 --month 3 \
  --write-db false --output data/artifacts/detector-calibration-source-gap/no-write-run.json
bun run pipeline findings run-detector --detector-id source_gap --year 2026 --month 3 \
  --write-db false --candidate-limit 20000 \
  --output data/artifacts/detector-calibration-source-gap/no-write-run-limit20000.json
```

| Metric | Default cap (100) | Candidate limit 20,000 |
| --- | ---: | ---: |
| Emitted candidates | 381 | 381 |
| Coverage rows (hit / clean_no_hit / skipped) | 381 / 0 / 0 | 381 / 0 / 0 |

**No cap suppression** (381 = 381). The detector is exhaustive by design: it emits a deterministic
data-quality state per scope rather than a top-N ranked finding. For March 2026 **all 381 emitted
candidates are `tsp_current_inventory_missing`** — every route carries the systemic
transit-signal-priority inventory absence. That is a *true, documented structural gap* (see the
catalog Missing-Spaces decision: "TSP inventory & effectiveness — defer; no intersection-level
treatment source exists; `source_gap` states the absence honestly — that *is* the current product
answer"), not a false positive. There is therefore no precision/false-positive population to
gold-label this month.

## Emitted states (deterministic coverage checks, category `data_quality`)

Each is an admission gate on *other* detectors' claims, not a standalone finding:

| reasonCode | severity | blocks |
| --- | --- | --- |
| `missing_speed` | high | all speed/ranking claims for the route |
| `missing_geometry` | high | map rendering for the route |
| `insufficient_gtfs_rt_samples` | medium | observed-reliability claims |
| `missing_scheduled_baseline` | medium | scheduled-headway baseline comparisons |
| `failed_context_join` | medium | context-source (permit/311) joins, system scope |
| `bus_lane_date_gap` | medium | dated-intervention claims (placeholder date) |
| `source_lag` | low | freshness-gated context claims, system scope |
| `tsp_current_inventory_missing` / `treatment_source_gap` | medium | TSP / treatment coverage language |

## Calibration path (coverage authority)

1. **Agreement audit vs the S2.4 materialization-coverage artifact** — assert that `source_gap`'s
   per-grain emitted states agree with the materialized scopes / fleet universe recorded by S2.4.
   **Done 2026-06-11** — see "Agreement Audit" below; this replaces the gold-precision loop used by
   the other detectors.
2. **Wire `source_gap` states as admission inputs to other detectors' readiness** (ideal-doc family-1
   next step): e.g. `insufficient_gtfs_rt_samples` admits/blocks `observed_reliability`/EWT readiness;
   `missing_speed`/`missing_geometry` block speed and treatment detectors. This makes the coverage
   authority load-bearing rather than a parallel data-quality feed.

## Agreement Audit vs S2.4 (2026-06-11, `agreement-audit.json`)

Coverage-authority frame, **no gold-precision frame**: the question is not "are these candidates
true findings" but "do `source_gap`'s emitted states and the S2.4 materialization-coverage artifact
tell the same coverage story for March 2026".

```bash
bun run pipeline findings run-detector --detector-id source_gap --year 2026 --month 3 \
  --write-db false \
  --output data/artifacts/detector-calibration-source-gap/no-write-run-rows-pass.json \
  --rows-output data/artifacts/detector-calibration-source-gap/run-rows.json
# then a temp script over run-rows.json + feature-grain-materialization-coverage-2026-03.json
```

Full-rows pass reproduces the inventory: 381 emitted candidates, all
`tsp_current_inventory_missing`, 381/0/0 coverage (hit / clean / skipped), 381-route fleet.

Per S2.4 grain (8 grains) the audit assigns one category:

| Category | Grains | Detail |
| --- | ---: | --- |
| `agree_no_gap` | 1 | `route_reliability_month` complete (381/381); source_gap emits no state about it — agreement |
| `source_gap_silent_on_hole` | 2 | `route_month` + `route_metric_history` are 367/381; source_gap has a `missing_speed` vocabulary entry for this grain but emitted **zero** states — silent about a real 14-route materialization hole |
| `source_gap_claims_contradicted` | 0 | no emitted state claims a gap S2.4 records as complete |
| `agree_gap` | 0 | no emitted state lines up with a known-universe hole |
| `indeterminate_unknown_universe` | 5 | grains with unenumerated fleet universes (segments, dayparts, panels, deviance, stop-direction-hour); S2.4 caps them at `partial`, so per-scope agreement is not assessable yet |

The 14 silent-hole routes (same DB the S2.4 counts came from, `local_route_month_trend` 2026-03):
B116, CPAS, ECAS, T117, T127, T232, T260, T320, T323, T354, T403, T430, T464, YOAS — mostly
temporary/shuttle (`T###`) and access-a-ride-style (`*AS`) route ids, i.e. fleet-catalog members
without speed/trend materialization.

Out-of-scope state: all 381 emitted `tsp_current_inventory_missing` rows speak about a
**treatment-source grain that S2.4 does not represent**, so they can be neither confirmed nor
contradicted by the materialization artifact. They remain a true documented structural gap per the
catalog Missing-Spaces decision (not a false-positive population).

**Audit reading:** zero contradictions — `source_gap` never overclaims against S2.4. Its weakness is
the inverse: it under-reports (silent on the 14-route `route_month`/`route_metric_history` hole and
on the five unknown-universe grains). That is a recall gap in a coverage authority, which matters
precisely because downstream readiness would admit claims for scopes the grain never materialized.

## Recommendation / named next step

Treat `source_gap` as **calibrated-by-agreement-audit**: zero contradictions with S2.4, with a known
under-reporting gap on `route_month`-grain holes and unknown-universe grains. The named next step is
unchanged and now unblocked: **wire `source_gap` states as admission inputs to other detectors'
readiness** (e.g. `insufficient_gtfs_rt_samples` gates `observed_reliability`/EWT readiness,
`missing_speed`/`missing_geometry` gate speed and treatment detectors), and have that wiring consume
the S2.4 holes the detector is currently silent about. Do not build a precision review-queue /
reviewed-gold for this detector — the "no gold-set precision frame" adaptation is intentional. No
thresholds, caps, or production code were changed.

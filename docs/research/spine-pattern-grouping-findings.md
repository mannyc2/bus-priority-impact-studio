# Spine pattern-grouping findings

Date: 2026-07-19

> **Outcome: negative spike; binding STOP fired.** In the required five-route taxonomy, the unresolved artifact gap residual, conservatively treated as class D/true-gap for the STOP, is the largest class. The artifact cannot distinguish undocumented service patterns from data loss within that residual, so the spike closes without a production spine change, candidate rebuild, review receipt, study run, or publication action.

## Input boundary and reproducibility

The run read the frozen manifest and every per-route artifact through each manifest entry's `artifactPath`. The plan's old statement that artifacts sit beside the manifest was incorrect; all 385 recorded paths exist under `data/artifacts/studio/v2/routes/`, total about 99 MiB. No scratch rebuild was needed and no file under `data/` was changed.

| Input | SHA-256 |
| --- | --- |
| Route-spine manifest | `aa342bc154340a1da7209225eb0e32e0bb3df0321b84e3ebb432cb2dffe2b7a7` |
| Historical review report | `91c6975d955ee61b094007ecf7179cfe9d3a503b7c3382b141e4419b31e0c268` |
| Historical worksheet | `1f4b360c78be934840898c8e58751722ec13dc223cf3884634217cff4a3c111f` |
| Historical candidate artifact | `63da356a9ace61e2755b41540567b4a79a6d8c4a4b5c045df85f79b7b687bb84` |
| Current checked-in candidate identity artifact | `2676d7b4f41ce4196ecea0b68d5f1da47e5a641d131f2f5acf5f6ed793614f24` |
| rc19 review reconciliation | `8b5f77c9391970223aaa1fee8c3833a2d00c90e1755b80267c76ffbfb95c522c` |

The current candidate artifact preserves the audited 489-row identity set but has later checked-in bytes than the rc19 build hash recorded by the reconciliation. This spike uses the reconciliation for defect reasoning and the checked-in artifact only to reproduce the unchanged identity delta; neither source is an approval receipt.

The deterministic all-route runner was executed twice against the same paths and returned the same cardinalities and flip sets. The ad hoc runner remained under `/tmp`; only the pure prototype is checked in.

## Cohort cardinalities

| Cohort | Identities | Routes | Required partition | Observed partition |
| --- | ---: | ---: | --- | --- |
| Historical primary-spine bucket | 39 | 37 | 20 no other named defect / 14 earlier phase / 5 overlap | 20 / 14 / 5 |
| Current calendar-eligible ACE spine failures | 40 | 38 | 40 / 38 | 20 no other named defect / 14 earlier phase / 6 overlap (the added sixth is Q6) |
| rc19-added spine failures | 75 | 74 | 73 redesign / 1 ACE / 1 bus lane | 73 / 1 / 1 |

A readiness flip below means only that the route would pass the mechanical spine classifier. It never means approved, study-ready, publishable, or free of the independent defect shown in the tables.

## Network and cohort distributions

The manifest remains exactly 267 `needs_pattern_review`, 93 `series_ready`, and 25 `series_ready_with_gaps` routes. Near miss means an absolute distance of at most 0.10 from the 0.25 partial-month-share threshold.

| Cohort | Identities | Routes | Near-miss identities/routes | High-drift identities/routes |
| --- | ---: | ---: | ---: | ---: |
| Network population | 267 | 267 | 11 / 11 | 1 / 1 |
| Historical primary-spine cohort | 39 | 37 | 0 / 0 | 0 / 0 |
| Current calendar-eligible ACE cohort | 40 | 38 | 0 / 0 | 0 / 0 |
| rc19-added spine-blocked cohort | 75 | 74 | 2 / 2 | 0 / 0 |

### Full 267-route blocked-population distribution

| Dimension | Count |
| --- | ---: |
| Reasons: `low_monthly_spine_coverage` | 8 |
| Reasons: `low_monthly_spine_coverage+partial_months_require_pattern_grouping` | 164 |
| Reasons: `partial_months_require_pattern_grouping` | 94 |
| Reasons: `partial_months_require_pattern_grouping+high_raw_key_drift_collapsed_by_spine` | 1 |
| Partial-share bin: 0.00 to 0.25 | 8 |
| Partial-share bin: 0.25 to 0.35 near miss | 5 |
| Partial-share bin: 0.35 to 0.75 | 2 |
| Partial-share bin: over 0.75 | 252 |
| Minimum-coverage bin: 0.50 to 0.75 | 96 |
| Minimum-coverage bin: 0.75 to 0.90 | 84 |
| Minimum-coverage bin: 0.90 to 1.00 | 11 |
| Minimum-coverage bin: under 0.50 | 76 |

Only B1 carries `high_raw_key_drift_collapsed_by_spine` in the blocked network population. The 11 near-miss routes are B100, B90, M90, Q20, Q82, Q96, S42, S55, S56, SIM26, and T426. The historical 39 and current ACE 40 contain no near misses and no high-drift rows; the rc19-added cohort has two near misses (Q20 and Q82) and no high-drift rows.

## Candidate audit tables

### Historical 39 identities / 37 routes

| Candidate identity | Route | Readiness | Min coverage | Partial months | Partial share | Raw-key drift share | Reasons | Independent phase/overlap defect | Strategy A | Strategy B |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| `B11\|automated_bus_lane_enforcement\|2025-11-10\|day` | `B11` | `needs_pattern_review` | 0.6471 | 36 | 1 | 0.25 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `B25\|automated_bus_lane_enforcement\|2024-09-30\|day` | `B25` | `needs_pattern_review` | 0.6316 | 36 | 1 | 0.1667 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `needs_pattern_review` |
| `B26\|automated_bus_lane_enforcement\|2023-09-25\|day` | `B26` | `needs_pattern_review` | 0.75 | 36 | 1 | 0.0556 | `partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready_with_gaps` |
| `B26\|automated_bus_lane_enforcement\|2024-09-30\|day` | `B26` | `needs_pattern_review` | 0.75 | 36 | 1 | 0.0556 | `partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `series_ready_with_gaps` |
| `B35\|automated_bus_lane_enforcement\|2024-09-16\|day` | `B35` | `needs_pattern_review` | 0.8462 | 35 | 0.9722 | 0.0556 | `partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `B41\|automated_bus_lane_enforcement\|2024-09-16\|day` | `B41` | `needs_pattern_review` | 0.7778 | 35 | 0.9722 | 0.1944 | `partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `B44+\|automated_bus_lane_enforcement\|2024-06-20\|day` | `B44+` | `needs_pattern_review` | 0.6154 | 36 | 1 | 0 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `series_ready` |
| `B62\|automated_bus_lane_enforcement\|2024-06-20\|day` | `B62` | `needs_pattern_review` | 0.5 | 36 | 1 | 0.0556 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `needs_pattern_review` |
| `B63\|automated_bus_lane_enforcement\|2025-11-10\|day` | `B63` | `needs_pattern_review` | 0.6667 | 36 | 1 | 0.2222 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | same route lane overlap | `needs_pattern_review` | `series_ready` |
| `BX12+\|automated_bus_lane_enforcement\|2024-06-20\|day` | `BX12+` | `needs_pattern_review` | 0.8333 | 35 | 0.9722 | 0 | `partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `needs_pattern_review` |
| `BX15\|automated_bus_lane_enforcement\|2025-11-10\|day` | `BX15` | `needs_pattern_review` | 0.8 | 36 | 1 | 0 | `partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready_with_gaps` |
| `BX2\|automated_bus_lane_enforcement\|2025-10-13\|day` | `BX2` | `needs_pattern_review` | 0.8571 | 36 | 1 | 0.0556 | `partial_months_require_pattern_grouping` | none named | `series_ready` | `needs_pattern_review` |
| `BX20\|automated_bus_lane_enforcement\|2025-09-15\|day` | `BX20` | `needs_pattern_review` | 0.6667 | 36 | 1 | 0.1667 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `BX22\|automated_bus_lane_enforcement\|2025-10-13\|day` | `BX22` | `needs_pattern_review` | 0.8696 | 36 | 1 | 0.0278 | `partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready_with_gaps` |
| `BX3\|automated_bus_lane_enforcement\|2025-09-15\|day` | `BX3` | `needs_pattern_review` | 0.7692 | 36 | 1 | 0 | `partial_months_require_pattern_grouping` | none named | `series_ready_with_gaps` | `series_ready` |
| `BX36\|automated_bus_lane_enforcement\|2024-06-20\|day` | `BX36` | `needs_pattern_review` | 0.7273 | 36 | 1 | 0.0278 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | earlier able or ace phase | `series_ready_with_gaps` | `series_ready` |
| `BX41+\|automated_bus_lane_enforcement\|2024-06-20\|day` | `BX41+` | `needs_pattern_review` | 0.6667 | 35 | 0.9722 | 0 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `series_ready` |
| `BX5\|automated_bus_lane_enforcement\|2025-05-27\|day` | `BX5` | `needs_pattern_review` | 0.7692 | 36 | 1 | 0.0833 | `partial_months_require_pattern_grouping` | same route lane overlap | `needs_pattern_review` | `needs_pattern_review` |
| `BX6+\|automated_bus_lane_enforcement\|2024-09-30\|day` | `BX6+` | `needs_pattern_review` | 0.4 | 36 | 1 | 0 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `BX7\|automated_bus_lane_enforcement\|2025-09-15\|day` | `BX7` | `needs_pattern_review` | 0.875 | 35 | 0.9722 | 0.0278 | `partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready` |
| `M100\|automated_bus_lane_enforcement\|2025-05-27\|day` | `M100` | `needs_pattern_review` | 0.8333 | 35 | 0.9722 | 0.0278 | `partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `M101\|automated_bus_lane_enforcement\|2024-09-16\|day` | `M101` | `needs_pattern_review` | 0.6333 | 36 | 1 | 0.0556 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `M116\|automated_bus_lane_enforcement\|2025-10-13\|day` | `M116` | `needs_pattern_review` | 0.8571 | 36 | 1 | 0 | `partial_months_require_pattern_grouping` | same route lane overlap | `needs_pattern_review` | `series_ready_with_gaps` |
| `M15+\|automated_bus_lane_enforcement\|2024-06-20\|day` | `M15+` | `needs_pattern_review` | 0.4706 | 36 | 1 | 0.0278 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `needs_pattern_review` |
| `M2\|automated_bus_lane_enforcement\|2025-05-19\|day` | `M2` | `needs_pattern_review` | 0.5 | 36 | 1 | 0.0278 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | same route lane overlap | `needs_pattern_review` | `needs_pattern_review` |
| `M34+\|automated_bus_lane_enforcement\|2024-06-20\|day` | `M34+` | `needs_pattern_review` | 0.5714 | 36 | 1 | 0 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `needs_pattern_review` |
| `M4\|automated_bus_lane_enforcement\|2025-05-19\|day` | `M4` | `needs_pattern_review` | 0.4167 | 36 | 1 | 0.1111 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | same route lane overlap | `needs_pattern_review` | `needs_pattern_review` |
| `M42\|automated_bus_lane_enforcement\|2025-05-27\|day` | `M42` | `needs_pattern_review` | 0.4211 | 36 | 1 | 0.0278 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `M60+\|automated_bus_lane_enforcement\|2024-09-30\|day` | `M60+` | `needs_pattern_review` | 0.5 | 36 | 1 | 0 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready_with_gaps` |
| `Q43\|automated_bus_lane_enforcement\|2024-09-16\|day` | `Q43` | `needs_pattern_review` | 0.2963 | 36 | 1 | 0.1944 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `needs_pattern_review` |
| `Q44+\|automated_bus_lane_enforcement\|2024-06-20\|day` | `Q44+` | `needs_pattern_review` | 0.3333 | 36 | 1 | 0 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `needs_pattern_review` |
| `Q5\|automated_bus_lane_enforcement\|2024-09-30\|day` | `Q5` | `needs_pattern_review` | 0.5116 | 36 | 1 | 0.0833 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q53+\|automated_bus_lane_enforcement\|2024-09-30\|day` | `Q53+` | `needs_pattern_review` | 0.4615 | 36 | 1 | 0 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q54\|automated_bus_lane_enforcement\|2023-11-08\|day` | `Q54` | `needs_pattern_review` | 0.6 | 36 | 1 | 0.25 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q54\|automated_bus_lane_enforcement\|2024-06-20\|day` | `Q54` | `needs_pattern_review` | 0.6 | 36 | 1 | 0.25 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `needs_pattern_review` |
| `Q58\|automated_bus_lane_enforcement\|2024-06-20\|day` | `Q58` | `needs_pattern_review` | 0.4706 | 36 | 1 | 0.2778 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `needs_pattern_review` |
| `Q69\|automated_bus_lane_enforcement\|2024-09-30\|day` | `Q69` | `needs_pattern_review` | 0.4444 | 36 | 1 | 0.0556 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `S46\|automated_bus_lane_enforcement\|2024-09-16\|day` | `S46` | `needs_pattern_review` | 0.7 | 36 | 1 | 0.1944 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `series_ready_with_gaps` | `series_ready_with_gaps` |
| `S79+\|automated_bus_lane_enforcement\|2024-09-16\|day` | `S79+` | `needs_pattern_review` | 0.3846 | 36 | 1 | 0.1667 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `series_ready_with_gaps` |

### Current 40 ACE identities / 38 routes

| Candidate identity | Route | Readiness | Min coverage | Partial months | Partial share | Raw-key drift share | Reasons | Independent phase/overlap defect | Strategy A | Strategy B |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| `B11\|automated_bus_lane_enforcement\|2025-11-10\|day` | `B11` | `needs_pattern_review` | 0.6471 | 36 | 1 | 0.25 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `B25\|automated_bus_lane_enforcement\|2024-09-30\|day` | `B25` | `needs_pattern_review` | 0.6316 | 36 | 1 | 0.1667 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `needs_pattern_review` |
| `B26\|automated_bus_lane_enforcement\|2023-09-25\|day` | `B26` | `needs_pattern_review` | 0.75 | 36 | 1 | 0.0556 | `partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready_with_gaps` |
| `B26\|automated_bus_lane_enforcement\|2024-09-30\|day` | `B26` | `needs_pattern_review` | 0.75 | 36 | 1 | 0.0556 | `partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `series_ready_with_gaps` |
| `B35\|automated_bus_lane_enforcement\|2024-09-16\|day` | `B35` | `needs_pattern_review` | 0.8462 | 35 | 0.9722 | 0.0556 | `partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `B41\|automated_bus_lane_enforcement\|2024-09-16\|day` | `B41` | `needs_pattern_review` | 0.7778 | 35 | 0.9722 | 0.1944 | `partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `B44+\|automated_bus_lane_enforcement\|2024-06-20\|day` | `B44+` | `needs_pattern_review` | 0.6154 | 36 | 1 | 0 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `series_ready` |
| `B62\|automated_bus_lane_enforcement\|2024-06-20\|day` | `B62` | `needs_pattern_review` | 0.5 | 36 | 1 | 0.0556 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `needs_pattern_review` |
| `B63\|automated_bus_lane_enforcement\|2025-11-10\|day` | `B63` | `needs_pattern_review` | 0.6667 | 36 | 1 | 0.2222 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | same route lane overlap | `needs_pattern_review` | `series_ready` |
| `BX12+\|automated_bus_lane_enforcement\|2024-06-20\|day` | `BX12+` | `needs_pattern_review` | 0.8333 | 35 | 0.9722 | 0 | `partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `needs_pattern_review` |
| `BX15\|automated_bus_lane_enforcement\|2025-11-10\|day` | `BX15` | `needs_pattern_review` | 0.8 | 36 | 1 | 0 | `partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready_with_gaps` |
| `BX2\|automated_bus_lane_enforcement\|2025-10-13\|day` | `BX2` | `needs_pattern_review` | 0.8571 | 36 | 1 | 0.0556 | `partial_months_require_pattern_grouping` | none named | `series_ready` | `needs_pattern_review` |
| `BX20\|automated_bus_lane_enforcement\|2025-09-15\|day` | `BX20` | `needs_pattern_review` | 0.6667 | 36 | 1 | 0.1667 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `BX22\|automated_bus_lane_enforcement\|2025-10-13\|day` | `BX22` | `needs_pattern_review` | 0.8696 | 36 | 1 | 0.0278 | `partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready_with_gaps` |
| `BX3\|automated_bus_lane_enforcement\|2025-09-15\|day` | `BX3` | `needs_pattern_review` | 0.7692 | 36 | 1 | 0 | `partial_months_require_pattern_grouping` | none named | `series_ready_with_gaps` | `series_ready` |
| `BX36\|automated_bus_lane_enforcement\|2024-06-20\|day` | `BX36` | `needs_pattern_review` | 0.7273 | 36 | 1 | 0.0278 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | earlier able or ace phase | `series_ready_with_gaps` | `series_ready` |
| `BX41+\|automated_bus_lane_enforcement\|2024-06-20\|day` | `BX41+` | `needs_pattern_review` | 0.6667 | 35 | 0.9722 | 0 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `series_ready` |
| `BX5\|automated_bus_lane_enforcement\|2025-05-27\|day` | `BX5` | `needs_pattern_review` | 0.7692 | 36 | 1 | 0.0833 | `partial_months_require_pattern_grouping` | same route lane overlap | `needs_pattern_review` | `needs_pattern_review` |
| `BX6+\|automated_bus_lane_enforcement\|2024-09-30\|day` | `BX6+` | `needs_pattern_review` | 0.4 | 36 | 1 | 0 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `BX7\|automated_bus_lane_enforcement\|2025-09-15\|day` | `BX7` | `needs_pattern_review` | 0.875 | 35 | 0.9722 | 0.0278 | `partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready` |
| `M100\|automated_bus_lane_enforcement\|2025-05-27\|day` | `M100` | `needs_pattern_review` | 0.8333 | 35 | 0.9722 | 0.0278 | `partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `M101\|automated_bus_lane_enforcement\|2024-09-16\|day` | `M101` | `needs_pattern_review` | 0.6333 | 36 | 1 | 0.0556 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `M116\|automated_bus_lane_enforcement\|2025-10-13\|day` | `M116` | `needs_pattern_review` | 0.8571 | 36 | 1 | 0 | `partial_months_require_pattern_grouping` | same route lane overlap | `needs_pattern_review` | `series_ready_with_gaps` |
| `M15+\|automated_bus_lane_enforcement\|2024-06-20\|day` | `M15+` | `needs_pattern_review` | 0.4706 | 36 | 1 | 0.0278 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `needs_pattern_review` |
| `M2\|automated_bus_lane_enforcement\|2025-05-19\|day` | `M2` | `needs_pattern_review` | 0.5 | 36 | 1 | 0.0278 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | same route lane overlap | `needs_pattern_review` | `needs_pattern_review` |
| `M34+\|automated_bus_lane_enforcement\|2024-06-20\|day` | `M34+` | `needs_pattern_review` | 0.5714 | 36 | 1 | 0 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `needs_pattern_review` |
| `M4\|automated_bus_lane_enforcement\|2025-05-19\|day` | `M4` | `needs_pattern_review` | 0.4167 | 36 | 1 | 0.1111 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | same route lane overlap | `needs_pattern_review` | `needs_pattern_review` |
| `M42\|automated_bus_lane_enforcement\|2025-05-27\|day` | `M42` | `needs_pattern_review` | 0.4211 | 36 | 1 | 0.0278 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `M60+\|automated_bus_lane_enforcement\|2024-09-30\|day` | `M60+` | `needs_pattern_review` | 0.5 | 36 | 1 | 0 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready_with_gaps` |
| `Q43\|automated_bus_lane_enforcement\|2024-09-16\|day` | `Q43` | `needs_pattern_review` | 0.2963 | 36 | 1 | 0.1944 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `needs_pattern_review` |
| `Q44+\|automated_bus_lane_enforcement\|2024-06-20\|day` | `Q44+` | `needs_pattern_review` | 0.3333 | 36 | 1 | 0 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `needs_pattern_review` |
| `Q5\|automated_bus_lane_enforcement\|2024-09-30\|day` | `Q5` | `needs_pattern_review` | 0.5116 | 36 | 1 | 0.0833 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q53+\|automated_bus_lane_enforcement\|2024-09-30\|day` | `Q53+` | `needs_pattern_review` | 0.4615 | 36 | 1 | 0 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q54\|automated_bus_lane_enforcement\|2023-11-08\|day` | `Q54` | `needs_pattern_review` | 0.6 | 36 | 1 | 0.25 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q54\|automated_bus_lane_enforcement\|2024-06-20\|day` | `Q54` | `needs_pattern_review` | 0.6 | 36 | 1 | 0.25 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `needs_pattern_review` |
| `Q58\|automated_bus_lane_enforcement\|2024-06-20\|day` | `Q58` | `needs_pattern_review` | 0.4706 | 36 | 1 | 0.2778 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `needs_pattern_review` |
| `Q6\|automated_bus_lane_enforcement\|2025-09-15\|day` | `Q6` | `needs_pattern_review` | 0.4706 | 36 | 1 | 0.1111 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | same route intervention overlap | `needs_pattern_review` | `needs_pattern_review` |
| `Q69\|automated_bus_lane_enforcement\|2024-09-30\|day` | `Q69` | `needs_pattern_review` | 0.4444 | 36 | 1 | 0.0556 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `S46\|automated_bus_lane_enforcement\|2024-09-16\|day` | `S46` | `needs_pattern_review` | 0.7 | 36 | 1 | 0.1944 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `series_ready_with_gaps` | `series_ready_with_gaps` |
| `S79+\|automated_bus_lane_enforcement\|2024-09-16\|day` | `S79+` | `needs_pattern_review` | 0.3846 | 36 | 1 | 0.1667 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | earlier able or ace phase | `needs_pattern_review` | `series_ready_with_gaps` |

### rc19-added 75 identities / 74 routes

| Candidate identity | Route | Readiness | Min coverage | Partial months | Partial share | Raw-key drift share | Reasons | Independent phase/overlap defect | Strategy A | Strategy B |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| `B41\|bus_lane\|2025-09\|month` | `B41` | `needs_pattern_review` | 0.7778 | 35 | 0.9722 | 0.1944 | `partial_months_require_pattern_grouping` | same route intervention overlap | `needs_pattern_review` | `needs_pattern_review` |
| `B62\|route_redesign\|2025-08-31\|day` | `B62` | `needs_pattern_review` | 0.5 | 36 | 1 | 0.0556 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q1\|route_redesign\|2025-06-29\|day` | `Q1` | `needs_pattern_review` | 0.36 | 36 | 1 | 0.2778 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q10\|route_redesign\|2025-08-31\|day` | `Q10` | `needs_pattern_review` | 0.5263 | 36 | 1 | 0.0278 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q101\|route_redesign\|2025-08-31\|day` | `Q101` | `needs_pattern_review` | 0.4286 | 35 | 0.9722 | 0.0556 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready` |
| `Q102\|route_redesign\|2025-08-31\|day` | `Q102` | `needs_pattern_review` | 0.375 | 36 | 1 | 0.0278 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q103\|route_redesign\|2025-08-31\|day` | `Q103` | `needs_pattern_review` | 0.3333 | 36 | 1 | 0.0278 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q11\|route_redesign\|2025-08-31\|day` | `Q11` | `needs_pattern_review` | 0.3333 | 36 | 1 | 0.1944 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q110\|route_redesign\|2025-06-29\|day` | `Q110` | `needs_pattern_review` | 0.3333 | 35 | 0.9722 | 0 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready` |
| `Q111\|route_redesign\|2025-06-29\|day` | `Q111` | `needs_pattern_review` | 0.4545 | 36 | 1 | 0.0833 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q112\|route_redesign\|2025-06-29\|day` | `Q112` | `needs_pattern_review` | 0.4706 | 35 | 0.9722 | 0.0278 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready` |
| `Q113\|route_redesign\|2025-06-29\|day` | `Q113` | `needs_pattern_review` | 0.6316 | 36 | 1 | 0 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready_with_gaps` |
| `Q114\|route_redesign\|2025-06-29\|day` | `Q114` | `needs_pattern_review` | 0.4138 | 36 | 1 | 0.0556 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q12\|route_redesign\|2025-06-29\|day` | `Q12` | `needs_pattern_review` | 0.4762 | 36 | 1 | 0.0833 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q13\|route_redesign\|2025-06-29\|day` | `Q13` | `needs_pattern_review` | 0.4444 | 36 | 1 | 0 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q15\|route_redesign\|2025-06-29\|day` | `Q15` | `needs_pattern_review` | 0.5 | 36 | 1 | 0.0278 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q16\|route_redesign\|2025-06-29\|day` | `Q16` | `needs_pattern_review` | 0.375 | 35 | 0.9722 | 0.0278 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready` |
| `Q17\|route_redesign\|2025-06-29\|day` | `Q17` | `needs_pattern_review` | 0.35 | 36 | 1 | 0.25 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q18\|route_redesign\|2025-08-31\|day` | `Q18` | `needs_pattern_review` | 0.4286 | 35 | 0.9722 | 0.0556 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready` |
| `Q2\|route_redesign\|2025-06-29\|day` | `Q2` | `needs_pattern_review` | 0.2222 | 36 | 1 | 0.1111 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q20\|route_redesign\|2025-06-29\|day` | `Q20` | `needs_pattern_review` | 0.75 | 3 | 0.3 | 0 | `partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready` |
| `Q22\|route_redesign\|2025-08-31\|day` | `Q22` | `needs_pattern_review` | 0.3793 | 36 | 1 | 0.4444 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q23\|route_redesign\|2025-06-29\|day` | `Q23` | `needs_pattern_review` | 0.3333 | 36 | 1 | 0.0278 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q24\|route_redesign\|2025-08-31\|day` | `Q24` | `needs_pattern_review` | 0.5385 | 36 | 1 | 0.0556 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q25\|route_redesign\|2025-06-29\|day` | `Q25` | `needs_pattern_review` | 0.8333 | 35 | 0.9722 | 0.0556 | `partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready` |
| `Q26\|route_redesign\|2025-06-29\|day` | `Q26` | `needs_pattern_review` | 0.3478 | 36 | 1 | 0 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q27\|route_redesign\|2025-06-29\|day` | `Q27` | `needs_pattern_review` | 0.34 | 36 | 1 | 0.1944 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q30\|route_redesign\|2025-06-29\|day` | `Q30` | `needs_pattern_review` | 0.4138 | 36 | 1 | 0.1944 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q31\|route_redesign\|2025-06-29\|day` | `Q31` | `needs_pattern_review` | 0.4 | 36 | 1 | 0.1944 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q32\|route_redesign\|2025-08-31\|day` | `Q32` | `needs_pattern_review` | 0.3333 | 36 | 1 | 0.1389 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q33\|route_redesign\|2025-08-31\|day` | `Q33` | `needs_pattern_review` | 0.3846 | 36 | 1 | 0 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q35\|route_redesign\|2025-08-31\|day` | `Q35` | `needs_pattern_review` | 0.381 | 36 | 1 | 0.1944 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q36\|route_redesign\|2025-06-29\|day` | `Q36` | `needs_pattern_review` | 0.26 | 36 | 1 | 0.1667 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q37\|route_redesign\|2025-08-31\|day` | `Q37` | `needs_pattern_review` | 0.9091 | 35 | 0.9722 | 0.0833 | `partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready` |
| `Q38\|route_redesign\|2025-06-29\|day` | `Q38` | `needs_pattern_review` | 0.4 | 35 | 0.9722 | 0.0278 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready` |
| `Q39\|route_redesign\|2025-06-29\|day` | `Q39` | `needs_pattern_review` | 0.4375 | 35 | 0.9722 | 0.0278 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready` |
| `Q4\|route_redesign\|2025-06-29\|day` | `Q4` | `needs_pattern_review` | 0.44 | 36 | 1 | 0.4722 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q41\|route_redesign\|2025-08-31\|day` | `Q41` | `needs_pattern_review` | 0.4333 | 36 | 1 | 0.1944 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q43\|route_redesign\|2025-06-29\|day` | `Q43` | `needs_pattern_review` | 0.2963 | 36 | 1 | 0.1944 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q46\|route_redesign\|2025-06-29\|day` | `Q46` | `needs_pattern_review` | 0.5294 | 35 | 0.9722 | 0.1944 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q47\|route_redesign\|2025-08-31\|day` | `Q47` | `needs_pattern_review` | 0.2903 | 36 | 1 | 0.0833 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q48\|route_redesign\|2025-06-30\|day` | `Q48` | `needs_pattern_review` | 0.3 | 36 | 1 | 0.0556 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q5\|route_redesign\|2025-06-29\|day` | `Q5` | `needs_pattern_review` | 0.5116 | 36 | 1 | 0.0833 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q52+\|route_redesign\|2025-08-31\|day` | `Q52+` | `needs_pattern_review` | 0.3846 | 36 | 1 | 0.0278 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q58\|route_redesign\|2025-06-29\|day` | `Q58` | `needs_pattern_review` | 0.4706 | 36 | 1 | 0.2778 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q6\|automated_bus_lane_enforcement\|2025-09-15\|day` | `Q6` | `needs_pattern_review` | 0.4706 | 36 | 1 | 0.1111 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | same route intervention overlap | `needs_pattern_review` | `needs_pattern_review` |
| `Q6\|route_redesign\|2025-08-31\|day` | `Q6` | `needs_pattern_review` | 0.4706 | 36 | 1 | 0.1111 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q60\|route_redesign\|2025-08-31\|day` | `Q60` | `needs_pattern_review` | 0.7778 | 35 | 0.9722 | 0.1389 | `partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready` |
| `Q65\|route_redesign\|2025-06-29\|day` | `Q65` | `needs_pattern_review` | 0.4348 | 36 | 1 | 0.0833 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q67\|route_redesign\|2025-06-29\|day` | `Q67` | `needs_pattern_review` | 0.3529 | 36 | 1 | 0.0556 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q69\|route_redesign\|2025-08-31\|day` | `Q69` | `needs_pattern_review` | 0.4444 | 36 | 1 | 0.0556 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q7\|route_redesign\|2025-08-31\|day` | `Q7` | `needs_pattern_review` | 0.4545 | 36 | 1 | 0.0833 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready_with_gaps` |
| `Q75\|route_redesign\|2025-06-30\|day` | `Q75` | `needs_pattern_review` | 0.75 | 8 | 0.8 | 0 | `partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready` |
| `Q76\|route_redesign\|2025-06-29\|day` | `Q76` | `needs_pattern_review` | 0.4063 | 36 | 1 | 0.1389 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q77\|route_redesign\|2025-06-29\|day` | `Q77` | `needs_pattern_review` | 0.3704 | 36 | 1 | 0.1944 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q82\|route_redesign\|2025-06-29\|day` | `Q82` | `needs_pattern_review` | 0.8889 | 3 | 0.3 | 0.3 | `partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready` |
| `Q83\|route_redesign\|2025-06-29\|day` | `Q83` | `needs_pattern_review` | 0.3704 | 36 | 1 | 0.1944 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q85\|route_redesign\|2025-06-29\|day` | `Q85` | `needs_pattern_review` | 0.375 | 36 | 1 | 0.4167 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `Q88\|route_redesign\|2025-06-29\|day` | `Q88` | `needs_pattern_review` | 0.1622 | 36 | 1 | 0.1944 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `QM10\|route_redesign\|2025-06-30\|day` | `QM10` | `needs_pattern_review` | 0.5 | 36 | 1 | 0.0278 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `QM11\|route_redesign\|2025-06-30\|day` | `QM11` | `needs_pattern_review` | 0.4444 | 36 | 1 | 0.0556 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `QM12\|route_redesign\|2025-06-30\|day` | `QM12` | `needs_pattern_review` | 0.4286 | 36 | 1 | 0.0278 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `QM15\|route_redesign\|2025-09-02\|day` | `QM15` | `needs_pattern_review` | 0.75 | 36 | 1 | 0.0278 | `partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `QM2\|route_redesign\|2025-06-29\|day` | `QM2` | `needs_pattern_review` | 0.7273 | 35 | 0.9722 | 0.0833 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `QM20\|route_redesign\|2025-06-30\|day` | `QM20` | `needs_pattern_review` | 0.75 | 35 | 0.9722 | 0.0833 | `partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `QM21\|route_redesign\|2025-06-30\|day` | `QM21` | `needs_pattern_review` | 0.5 | 36 | 1 | 0 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `QM24\|route_redesign\|2025-09-02\|day` | `QM24` | `needs_pattern_review` | 0.8889 | 32 | 0.8889 | 0 | `partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready` |
| `QM25\|route_redesign\|2025-09-02\|day` | `QM25` | `needs_pattern_review` | 0.6667 | 36 | 1 | 0 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready` |
| `QM32\|route_redesign\|2025-06-30\|day` | `QM32` | `needs_pattern_review` | 0.6364 | 35 | 0.9722 | 0 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `QM36\|route_redesign\|2025-06-30\|day` | `QM36` | `needs_pattern_review` | 0.4444 | 36 | 1 | 0.0556 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `QM4\|route_redesign\|2025-06-29\|day` | `QM4` | `needs_pattern_review` | 0.5833 | 35 | 0.9722 | 0.0278 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `QM42\|route_redesign\|2025-06-30\|day` | `QM42` | `needs_pattern_review` | 0.5455 | 35 | 0.9722 | 0.0278 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready` |
| `QM6\|route_redesign\|2025-06-29\|day` | `QM6` | `needs_pattern_review` | 0.4545 | 36 | 1 | 0.1111 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |
| `QM63\|route_redesign\|2025-06-30\|day` | `QM63` | `needs_pattern_review` | 0.9231 | 8 | 0.8 | 0 | `partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `series_ready_with_gaps` |
| `QM8\|route_redesign\|2025-06-30\|day` | `QM8` | `needs_pattern_review` | 0.2927 | 36 | 1 | 0.0833 | `low_monthly_spine_coverage`<br>`partial_months_require_pattern_grouping` | none named | `needs_pattern_review` | `needs_pattern_review` |

## Five-route missing-month taxonomy

Classification is per missing segment, not merely per month, with conservative precedence: (A) an accepted globally unique exact endpoint alias has its counterpart present; (C) a segment is observed only on the opposite side of the known redesign month; (B) the month exactly matches one of at least two recurring artifact-derived segment sets whose union covers the spine; otherwise (D) the segment is an unresolved gap residual, conservatively treated as class D/true-gap for the STOP. The artifact cannot distinguish an undocumented service pattern from data loss, and the recurring profiles are candidates rather than official service-pattern documentation.

| Class | Missing-segment instances |
| --- | ---: |
| A — exact-alias raw-key drift | 145 |
| B — recurring exact pattern variance | 180 |
| C — redesign/renaming boundary | 140 |
| D — unresolved gap residual (conservatively treated as true-gap for the STOP) | 466 |

Class D is largest (466), so the plan's Step 2 STOP condition fires. This does not prove that all 466 instances are upstream data gaps; it records that grouping alone cannot honestly classify or repair them. Every partial month for each selected route is enumerated below. Columns A-D are missing-segment counts, not booleans.

### BX2 — historical no other named defect

Baseline `needs_pattern_review`; reasons `partial_months_require_pattern_grouping`. Dominant class: **exact alias raw key drift**. All 36 partial months were classified.

Missing-segment instances: exact alias raw key drift 72.

| Month | Coverage | Missing segments | A | B | C | D | Exact profile |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2023-04 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2023-05 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2023-06 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2023-07 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2023-08 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2023-09 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2023-10 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2023-11 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2023-12 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2024-01 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2024-02 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2024-03 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2024-04 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2024-05 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2024-06 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2024-07 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2024-08 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2024-09 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2024-10 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2024-11 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2024-12 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2025-01 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2025-02 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2025-03 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2025-04 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2025-05 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2025-06 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2025-07 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2025-08 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2025-09 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2025-10 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2025-11 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2025-12 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2026-01 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2026-02 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |
| 2026-03 | 0.8571 | 2 | 2 | 0 | 0 | 0 | — |

### B63 — historical same route overlap

Baseline `needs_pattern_review`; reasons `low_monthly_spine_coverage`, `partial_months_require_pattern_grouping`. Dominant class: **recurring pattern variance**. All 36 partial months were classified.

Missing-segment instances: recurring pattern variance 112.

| Month | Coverage | Missing segments | A | B | C | D | Exact profile |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2023-04 | 0.9048 | 2 | 0 | 2 | 0 | 0 | `pattern-01` |
| 2023-05 | 0.9048 | 2 | 0 | 2 | 0 | 0 | `pattern-01` |
| 2023-06 | 0.9048 | 2 | 0 | 2 | 0 | 0 | `pattern-01` |
| 2023-07 | 0.6667 | 7 | 0 | 7 | 0 | 0 | `pattern-04` |
| 2023-08 | 0.6667 | 7 | 0 | 7 | 0 | 0 | `pattern-04` |
| 2023-09 | 0.9048 | 2 | 0 | 2 | 0 | 0 | `pattern-02` |
| 2023-10 | 0.9048 | 2 | 0 | 2 | 0 | 0 | `pattern-02` |
| 2023-11 | 0.9048 | 2 | 0 | 2 | 0 | 0 | `pattern-02` |
| 2023-12 | 0.9048 | 2 | 0 | 2 | 0 | 0 | `pattern-02` |
| 2024-01 | 0.9048 | 2 | 0 | 2 | 0 | 0 | `pattern-02` |
| 2024-02 | 0.9048 | 2 | 0 | 2 | 0 | 0 | `pattern-02` |
| 2024-03 | 0.9048 | 2 | 0 | 2 | 0 | 0 | `pattern-02` |
| 2024-04 | 0.9048 | 2 | 0 | 2 | 0 | 0 | `pattern-02` |
| 2024-05 | 0.9048 | 2 | 0 | 2 | 0 | 0 | `pattern-02` |
| 2024-06 | 0.9048 | 2 | 0 | 2 | 0 | 0 | `pattern-02` |
| 2024-07 | 0.6667 | 7 | 0 | 7 | 0 | 0 | `pattern-04` |
| 2024-08 | 0.6667 | 7 | 0 | 7 | 0 | 0 | `pattern-04` |
| 2024-09 | 0.9048 | 2 | 0 | 2 | 0 | 0 | `pattern-02` |
| 2024-10 | 0.9048 | 2 | 0 | 2 | 0 | 0 | `pattern-02` |
| 2024-11 | 0.9048 | 2 | 0 | 2 | 0 | 0 | `pattern-02` |
| 2024-12 | 0.9048 | 2 | 0 | 2 | 0 | 0 | `pattern-02` |
| 2025-01 | 0.9048 | 2 | 0 | 2 | 0 | 0 | `pattern-02` |
| 2025-02 | 0.9048 | 2 | 0 | 2 | 0 | 0 | `pattern-02` |
| 2025-03 | 0.9048 | 2 | 0 | 2 | 0 | 0 | `pattern-02` |
| 2025-04 | 0.8571 | 3 | 0 | 3 | 0 | 0 | `pattern-03` |
| 2025-05 | 0.8571 | 3 | 0 | 3 | 0 | 0 | `pattern-03` |
| 2025-06 | 0.8571 | 3 | 0 | 3 | 0 | 0 | `pattern-03` |
| 2025-07 | 0.6667 | 7 | 0 | 7 | 0 | 0 | `pattern-04` |
| 2025-08 | 0.6667 | 7 | 0 | 7 | 0 | 0 | `pattern-04` |
| 2025-09 | 0.8571 | 3 | 0 | 3 | 0 | 0 | `pattern-03` |
| 2025-10 | 0.8571 | 3 | 0 | 3 | 0 | 0 | `pattern-03` |
| 2025-11 | 0.8571 | 3 | 0 | 3 | 0 | 0 | `pattern-03` |
| 2025-12 | 0.8571 | 3 | 0 | 3 | 0 | 0 | `pattern-03` |
| 2026-01 | 0.8571 | 3 | 0 | 3 | 0 | 0 | `pattern-03` |
| 2026-02 | 0.8571 | 3 | 0 | 3 | 0 | 0 | `pattern-03` |
| 2026-03 | 0.8571 | 3 | 0 | 3 | 0 | 0 | `pattern-03` |

### Q101 — rc19 route redesign addition

Baseline `needs_pattern_review`; reasons `low_monthly_spine_coverage`, `partial_months_require_pattern_grouping`. Dominant class: **redesign or renaming event**. All 35 partial months were classified.

Missing-segment instances: redesign or renaming event 140; recurring pattern variance 56.

| Month | Coverage | Missing segments | A | B | C | D | Exact profile |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2023-04 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2023-05 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2023-06 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2023-07 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2023-08 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2023-09 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2023-10 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2023-11 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2023-12 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2024-01 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2024-02 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2024-03 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2024-04 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2024-05 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2024-06 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2024-07 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2024-08 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2024-09 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2024-10 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2024-11 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2024-12 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2025-01 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2025-02 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2025-03 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2025-04 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2025-05 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2025-06 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2025-07 | 0.6429 | 5 | 0 | 0 | 5 | 0 | `pattern-02` |
| 2025-09 | 0.4286 | 8 | 0 | 8 | 0 | 0 | `pattern-01` |
| 2025-10 | 0.4286 | 8 | 0 | 8 | 0 | 0 | `pattern-01` |
| 2025-11 | 0.4286 | 8 | 0 | 8 | 0 | 0 | `pattern-01` |
| 2025-12 | 0.4286 | 8 | 0 | 8 | 0 | 0 | `pattern-01` |
| 2026-01 | 0.4286 | 8 | 0 | 8 | 0 | 0 | `pattern-01` |
| 2026-02 | 0.4286 | 8 | 0 | 8 | 0 | 0 | `pattern-01` |
| 2026-03 | 0.4286 | 8 | 0 | 8 | 0 | 0 | `pattern-01` |

### Q20 — near miss route redesign

Baseline `needs_pattern_review`; reasons `partial_months_require_pattern_grouping`. Dominant class: **recurring pattern variance**. All 3 partial months were classified.

Missing-segment instances: recurring pattern variance 12.

| Month | Coverage | Missing segments | A | B | C | D | Exact profile |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2025-06 | 0.75 | 4 | 0 | 4 | 0 | 0 | `pattern-02` |
| 2025-07 | 0.75 | 4 | 0 | 4 | 0 | 0 | `pattern-02` |
| 2025-08 | 0.75 | 4 | 0 | 4 | 0 | 0 | `pattern-02` |

### Q43 — deep low coverage phase case

Baseline `needs_pattern_review`; reasons `low_monthly_spine_coverage`, `partial_months_require_pattern_grouping`. Dominant class: **unresolved gap residual, conservatively treated as class D/true-gap for the STOP**. All 36 partial months were classified.

Missing-segment instances: unresolved gap residual 466; exact alias raw key drift 73. The artifact cannot separate undocumented patterns from data loss within that residual.

| Month | Coverage | Missing segments | A | B | C | D | Exact profile |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2023-04 | 0.4815 | 14 | 2 | 0 | 0 | 12 | — |
| 2023-05 | 0.4815 | 14 | 2 | 0 | 0 | 12 | — |
| 2023-06 | 0.4444 | 15 | 2 | 0 | 0 | 13 | — |
| 2023-07 | 0.3704 | 17 | 2 | 0 | 0 | 15 | — |
| 2023-08 | 0.3704 | 17 | 2 | 0 | 0 | 15 | — |
| 2023-09 | 0.4815 | 14 | 2 | 0 | 0 | 12 | — |
| 2023-10 | 0.4815 | 14 | 2 | 0 | 0 | 12 | — |
| 2023-11 | 0.4815 | 14 | 2 | 0 | 0 | 12 | — |
| 2023-12 | 0.4815 | 14 | 2 | 0 | 0 | 12 | — |
| 2024-01 | 0.4815 | 14 | 2 | 0 | 0 | 12 | — |
| 2024-02 | 0.4444 | 15 | 2 | 0 | 0 | 13 | — |
| 2024-03 | 0.4815 | 14 | 2 | 0 | 0 | 12 | — |
| 2024-04 | 0.4444 | 15 | 2 | 0 | 0 | 13 | — |
| 2024-05 | 0.4815 | 14 | 2 | 0 | 0 | 12 | — |
| 2024-06 | 0.4444 | 15 | 2 | 0 | 0 | 13 | — |
| 2024-07 | 0.3704 | 17 | 2 | 0 | 0 | 15 | — |
| 2024-08 | 0.3704 | 17 | 2 | 0 | 0 | 15 | — |
| 2024-09 | 0.4815 | 14 | 2 | 0 | 0 | 12 | — |
| 2024-10 | 0.4444 | 15 | 2 | 0 | 0 | 13 | — |
| 2024-11 | 0.4815 | 14 | 2 | 0 | 0 | 12 | — |
| 2024-12 | 0.4815 | 14 | 2 | 0 | 0 | 12 | — |
| 2025-01 | 0.5556 | 12 | 2 | 0 | 0 | 10 | — |
| 2025-02 | 0.4815 | 14 | 2 | 0 | 0 | 12 | — |
| 2025-03 | 0.4815 | 14 | 2 | 0 | 0 | 12 | — |
| 2025-04 | 0.4444 | 15 | 2 | 0 | 0 | 13 | — |
| 2025-05 | 0.4444 | 15 | 2 | 0 | 0 | 13 | — |
| 2025-06 | 0.7037 | 8 | 3 | 0 | 0 | 5 | — |
| 2025-07 | 0.2963 | 19 | 2 | 0 | 0 | 17 | — |
| 2025-08 | 0.2963 | 19 | 2 | 0 | 0 | 17 | — |
| 2025-09 | 0.4074 | 16 | 2 | 0 | 0 | 14 | — |
| 2025-10 | 0.4074 | 16 | 2 | 0 | 0 | 14 | — |
| 2025-11 | 0.4074 | 16 | 2 | 0 | 0 | 14 | — |
| 2025-12 | 0.4074 | 16 | 2 | 0 | 0 | 14 | — |
| 2026-01 | 0.4074 | 16 | 2 | 0 | 0 | 14 | — |
| 2026-02 | 0.4074 | 16 | 2 | 0 | 0 | 14 | — |
| 2026-03 | 0.4074 | 16 | 2 | 0 | 0 | 14 | — |

## Prototype measurements

Strategy A accepts a pair only when the exact direction/from-stop/to-stop signature is globally unique to two segments, their months are disjoint, neither participates in a concurrent same-signature pair, and neither has another candidate. Strategy B never merges identities, but treats repeated exact segment sets as candidate expected profiles only when at least two recur and their union covers the full spine.

| Strategy | Network route flips | Cohort | Advanced identities | Advanced routes | Advanced with another named defect |
| --- | ---: | --- | ---: | ---: | ---: |
| A — exact alias canonicalization | 21 | Historical 39 | 4 | 4 | 1 |
|  |  | Current ACE 40 | 4 | 4 | 1 |
|  |  | rc19-added 75 | 0 | 0 | 0 |
| B — recurring exact profiles | 100 | Historical 39 | 14 | 13 | 7 |
|  |  | Current ACE 40 | 14 | 13 | 7 |
|  |  | rc19-added 75 | 19 | 19 | 0 |

Strategy A found 305 accepted alias pairs across the 267 blocked routes and flipped 21 routes. Strategy B formed profiles on 110 blocked routes and flipped 100, but that larger number is an optimistic sensitivity bound: the artifacts do not prove that repetition is scheduled service rather than repeated missing data.

### Worked examples

| Strategy | Route | Readiness before → after | Minimum coverage before → after | Partial-month share before → after | Exact groups/profiles |
| --- | --- | --- | ---: | ---: | ---: |
| A | `BX2` | `needs_pattern_review` → `series_ready` | 0.8571 → 1 | 1 → 0 | 2 |
| A | `BX3` | `needs_pattern_review` → `series_ready_with_gaps` | 0.7692 → 0.9091 | 1 → 0.1667 | 2 |
| B | `B1` | `needs_pattern_review` → `series_ready_with_gaps` | 0.8462 → 0.8462 | 1 → 0.0556 | 3 |
| B | `B103` | `needs_pattern_review` → `series_ready_with_gaps` | 0.7692 → 0.8462 | 1 → 0.0556 | 3 |

The exact candidate advancements are recorded in the cohort tables. Strategy A advances BX2, BX3, BX36, and S46 in both ACE cohorts; BX36 retains the earlier-phase defect. Strategy B advances 14 ACE identities (seven retain another named phase/overlap defect) and 19 rc19-added redesign identities, but none of those are authorized because profile authority is absent and the unresolved-residual STOP fired.

## Conclusion

The spike found a bounded exact-alias signal, but not a production-safe network unlock. The representative taxonomy is dominated by an unresolved artifact residual that grouping cannot honestly classify or repair, and the high-yield profile strategy cannot distinguish undocumented recurring service from recurring data loss using the artifact alone. Close Plan 083 as a negative result and do not commission a spine rebuild or batch-2 review from these measurements.

# Corrected rc19 Codex review rubric

Date: 2026-07-14

This rubric governs non-authorizing recommendations for
`candidate-set-v2:24080902f508b55a0033df32`. It never creates or amends an approval receipt.
No recommendation authorizes a study run, publication, D1/R2 write, or promotion of MTA Wiki
`v1-rc19`.

## Frozen inputs

| Input | SHA-256 |
| --- | --- |
| corrected candidate artifact | `42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba` |
| incomplete review worksheet | `700befcd4c95a789d314188496eb320bedce4dd81cddfbfe8d0f338586c75f92` |
| deterministic audit report | generated output; not a frozen review input |
| logical merge-input snapshot | `17530e0bc5a857463249d32a882ae7027a77ea44041babe00c5d761662363104` |
| candidate-build record | `9957e8b5af30b76d1157924ddb3829c90694dc70c0faa7be2f1f6c621008283d` |
| 12-row corrected recheck | `3ead9d3217e99f07c6a9bbe3c053101d946a09da6a000b99ea0302ad688f27e6` |
| 489-row review reconciliation | `8b5f77c9391970223aaa1fee8c3833a2d00c90e1755b80267c76ffbfb95c522c` |
| historical candidate artifact | `63da356a9ace61e2755b41540567b4a79a6d8c4a4b5c045df85f79b7b687bb84` |
| historical approval receipt | `6c17f106dd394b70848bd401283ee1fb7d5b1b8123c4cb2ea8dd8c36a959b6a2` |
| 2023-04 through 2026-03 spine manifest | `aa342bc154340a1da7209225eb0e32e0bb3df0321b84e3ebb432cb2dffe2b7a7` |
| MTA Wiki `v1-rc19` manifest | `c5d4563d37815d330b37898774a027fb07563335163fcfccbaeebfc3da81720f` |
| `v1-rc19/operational_occurrences.jsonl` | `424ee1ceed24bc8c8af77d49e328c0f6bb7859e88a619bbb79a0c13ac7ed5399` |

Review exactly 489 candidates. The corrected set has 12 candidates with both `registry` and
`mta_wiki` provenance, 12 exact deduplications, and zero conflict groups. The discovery set
`candidate-set-v2:1810cf792be7e2346b335fb5` and its reviews are historical evidence only.
Recommendations may transfer only when the complete candidate row is unchanged. The 12 rows
whose provenance changed require explicit re-review against this corrected set.

The final reconciliation contains 16 `recommend_approve`, 473 `recommend_reject`, and zero
`needs_followup` decisions. These counts describe the completed recommendation ledger, not an
approval state: the candidate artifact still has zero approved rows.

## Recommendation rule

- `recommend_approve`: evidence/scope, date, spine, outcome, and conflict gates pass; any
  confounder is handled by a prespecified Plan 074 flag/sensitivity; no material ambiguity remains.
- `recommend_reject`: at least one current, independently dispositive hard gate fails. Name it.
- `needs_followup`: no hard failure is established, but a material scope, phase, date, overlap,
  or confounder question cannot be resolved from the frozen inputs.

Historical decisions and Codex recommendations are context, never authorization. A valid receipt
must bind this exact candidate-set ID and contain one human-authorized decision for every candidate.

## Admission gates

1. Evidence must establish a realized operational change, exact route, exact treatment scope,
   and clean phase identity. MTA claims establish evidence/context, not outcome estimates.
2. Day precision requires an authoritative exact day. Month precision stays `YYYY-MM`; no day may
   be invented, and unresolved within-month phasing requires follow-up or rejection.
3. Only `series_ready` and `series_ready_with_gaps` pass the frozen spine gate.
   `needs_pattern_review`, `failed`, and missing spines fail. No threshold is relaxed.
4. The calendar is intersected with 2023-04 through 2026-03, the implementation month is excluded,
   and at least four usable months per side are required per surviving segment.
5. Exact registry/Wiki representations share one candidate and retain both provenances. Only
   non-identical cross-source dates in the same month are conflicts. This corrected set has none.
6. Same-route interventions and earlier phases of the collapsed family must be checked. Proximity-
   derived lane candidates do not become exact route-onset evidence or exact confounders merely by
   sharing a street or nearby stop.
7. Congestion pricing remains a Plan 074 flag/sensitivity when applicable. For a reviewed
   `route_redesign` candidate in `queens_bus_network_redesign_2025`, that group is the treatment
   itself, not an external confounder; genuinely separate interventions still require review.
8. Lane studies require exact lane-overlap spines. Fuzzy, positional, street-proximity, and
   route-stop-proximity fallbacks cannot establish treatment geometry or segment identity.

Approval only admits an event to the estimator. Sample, control, pre-trend, placebo, sensitivity,
claim-tier, and publication gates remain independently binding, and an honest null remains valid.

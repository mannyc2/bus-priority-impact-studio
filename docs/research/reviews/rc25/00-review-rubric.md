# Plan 074 rc25 delegated review rubric

Date: 2026-07-21

This rubric governs the owner's explicit delegation of all 486 candidate decisions for
`candidate-set-v3:575ee30a44f2e141e97f6a77` to independent Codex review shards. Each shard owns a
disjoint candidate list. A decision is authority only after deterministic reconciliation validates
complete, unique coverage and writes the exact v3 receipt. It authorizes candidate admission to the
Plan 074 estimator only; it does not authorize publication or relax any downstream estimator gate.

## Frozen inputs

| Input | SHA-256 |
| --- | --- |
| rc25 candidate artifact | `b66c0cd70afdf99a0fa2779d9b0574ba328bcc5f49c7d0177eaa029b0bb2c195` |
| rc25 strict import | `bdf844fca656f98ddd57f544a49677b528ff9b49e875e0119d1d5dc268d5bb34` |
| exact physical-scope bindings | `824918ed0a8fdd230951d3f09db3317c1ea0e3b1b738f5f2e51ce7dda55e9dd0` |
| blank rc25 worksheet | `f50c8f0f71489347986d8e4401b8dd6724448f8ff8bd88aeab3fae33a8314dfb` |
| superseded rc19 review context | `8b5f77c9391970223aaa1fee8c3833a2d00c90e1755b80267c76ffbfb95c522c` |

The generated input manifest additionally pins the current per-route speed-spine artifacts and all
three shard hashes. Historical rc19 recommendations are context only. They may guide attention but
must not be copied blindly because rc25 has new exact-route lineage and the production treatment-
scope gate is stricter.

## Decision rule

- `approved`: every pre-estimator admission gate below passes and no material ambiguity remains.
- `rejected`: at least one independently dispositive hard gate fails. Name the failure precisely.

There is no follow-up state in the receipt contract. When frozen evidence does not establish a
required fact, reject rather than infer it. Approval means only that the candidate may enter the
estimator; sample, controls, pre-trend, placebo, sensitivity, tiering, anchor review, and publication
remain independently binding.

## Admission gates

1. Evidence must establish a realized operational change, exact route, exact treatment scope, and
   clean phase identity. Source claims provide treatment evidence, never outcome estimates.
2. Production scope admission is binding. Route-wide scope passes only for an ACE candidate with
   affirmative `mta_ace_routes` registry provenance. A bounded treatment passes only with the exact
   candidate-bound physical-scope mapping in the frozen binding artifact. Every other scope is a
   hard rejection; empty physical-scope arrays never imply route-wide treatment.
3. Day precision requires an authoritative exact day. Month precision stays `YYYY-MM`; no day may
   be invented. Installation commencement is not a clean operational onset when completion/opening
   evidence or a competing same-route onset makes the treatment month ambiguous.
4. Only current `series_ready` and `series_ready_with_gaps` spine classifications pass. Missing,
   `needs_pattern_review`, and `failed` spines fail. Exact physical scope does not override this.
5. The calendar is intersected with 2023-04 through 2026-03, excludes the implementation month, and
   requires at least four nominal months per side. Per-segment non-null coverage is checked again by
   the estimator.
6. Conflict state must be clean. Exact registry/Wiki deduplication is acceptable when both sources
   agree. Differing candidate dates or unresolved phase identities are not silently collapsed.
7. Review every other same-route candidate inside the displayed inclusive nine-month neighborhood.
   A genuinely separate intervention in the six-month study window is a treatment-confounder hard
   failure unless Plan 074 has an explicit sensitivity for it. Proximity-only lane rows do not become
   exact confounders without route/scope evidence.
8. Congestion pricing is an explicit Plan 074 flag/sensitivity where applicable. A Queens redesign
   group is the treatment itself for its redesign candidate, not an external confounder. Neither
   exception supplies missing treatment-scope evidence.

## Shard output contract

Each output must retain the input `candidateSetId`, candidate artifact hash, batch ID, and input
hash; contain exactly one decision for every assigned candidate and none outside the shard; use only
`approved` or `rejected`; and provide a non-empty reviewer, rationale, and six gate explanations.
The reconciler rejects duplicates, omissions, identity drift, count drift, hash drift, or approvals
whose recorded hard gates do not all pass.

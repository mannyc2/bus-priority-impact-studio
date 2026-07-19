# Spine pattern-grouping decision

Date: 2026-07-19

## Decision

**Close the spike with no productionization.** Do not modify `route-speed-spine.ts`, the batch command, thresholds, artifacts, candidate sets, receipts, studies, map readiness claims, or publication state. The required taxonomy's unresolved artifact residual triggered the binding class-D/true-gap STOP, and neither prototype supports an honest network-wide unlock.

This is a completed negative investigation, not an implementation failure. The prototypes and measurements remain useful evidence about what a future data-completeness project would need to prove.

## Evidence

The frozen manifest (`aa342bc154340a1da7209225eb0e32e0bb3df0321b84e3ebb432cb2dffe2b7a7`) remains 267 / 93 / 25. The five-route taxonomy classified 466 missing-segment instances as an unresolved gap residual, conservatively treated as class D/true-gap for the STOP, versus 180 recurring-pattern, 145 exact-alias, and 140 redesign/renaming instances. The artifact cannot distinguish undocumented service patterns from data loss within that residual. Class D is the largest and invokes Plan 083's explicit STOP because grouping cannot honestly classify or repair it, not because every instance has been independently proven to be an upstream data gap.

| Strategy | Network route flips | Cohort | Advanced identities | Advanced routes | Advanced with another named defect |
| --- | ---: | --- | ---: | ---: | ---: |
| A — exact alias canonicalization | 21 | Historical 39 | 4 | 4 | 1 |
|  |  | Current ACE 40 | 4 | 4 | 1 |
|  |  | rc19-added 75 | 0 | 0 | 0 |
| B — recurring exact profiles | 100 | Historical 39 | 14 | 13 | 7 |
|  |  | Current ACE 40 | 14 | 13 | 7 |
|  |  | rc19-added 75 | 19 | 19 | 0 |

### Strategy A — exact alias-set canonicalization

A preserves the strongest identity guarantee tested here: exact ordered endpoints and direction, disjoint observed months, global two-identity uniqueness, no concurrent same-signature participant, and no multi-target candidate. It uses no similarity, position, or proximity. The synthetic suite proves rename-only promotion, concurrent rejection, global third-identity rejection, and no repair of a genuinely missing distinct segment.

A flips 21 of 267 blocked routes and advances four ACE identities, one of which retains an independent earlier-phase defect; it advances none of the 75 rc19 additions. This bounded gain does not address the dominant unresolved residual, so productionizing it would add an engine/version/rebuild obligation without solving the stated network problem. Recommendation: retain only as a prototype.

### Strategy B — recurring exact pattern profiles

B keeps segment identities intact and matches only exact observed segment sets. It requires at least two recurring profiles and requires their union to cover the full spine; unique gaps and a lone persistent subset are rejected in tests. It flips 100 routes, advances 14 ACE identities and 19 rc19-added identities.

That apparent gain is non-authorizing and optimistic. The artifact contains observations, not an authoritative service-pattern registry. A repeated exact subset can be a real short-turn pattern or the same data failure repeated. B therefore risks turning missingness into expected service. Recommendation: reject productionization unless a future source supplies documented pattern identity and explicit effective windows.

### Worked examples

| Strategy | Route | Readiness before → after | Minimum coverage before → after | Partial-month share before → after | Exact groups/profiles |
| --- | --- | --- | ---: | ---: | ---: |
| A | `BX2` | `needs_pattern_review` → `series_ready` | 0.8571 → 1 | 1 → 0 | 2 |
| A | `BX3` | `needs_pattern_review` → `series_ready_with_gaps` | 0.7692 → 0.9091 | 1 → 0.1667 | 2 |
| B | `B1` | `needs_pattern_review` → `series_ready_with_gaps` | 0.8462 → 0.8462 | 1 → 0.0556 | 3 |
| B | `B103` | `needs_pattern_review` → `series_ready_with_gaps` | 0.7692 → 0.8462 | 1 → 0.0556 | 3 |

## Identity and gate guarantees

| Guarantee | Strategy A | Strategy B | Decision impact |
| --- | --- | --- | --- |
| Exact source identity | Preserved by ordered endpoint signatures and global uniqueness | Segment IDs never merge | Necessary but not sufficient |
| Ambiguity rejection | Third identities, concurrent aliases, and multi-target candidates reject the group | Month must exactly equal one profile set | Preserved in prototype |
| Missing-data honesty | Does not repair unrelated missing segments | Cannot distinguish repeated gaps from scheduled patterns | B is not production-safe |
| Phase/overlap gates | Unchanged | Unchanged | Flips only advance to review |
| Approval/publication | Creates none | Creates none | No candidate is admitted or published |

## Production effort if the decision is revisited

No work is commissioned. A future operator-directed proposal would be at least medium effort: define an authoritative service-pattern input (or a separately justified exact-alias-only scope), version the spine artifact and engine, update `packages/analytics/src/feature-history/route-speed-spine.ts`, update `tools/pipeline-v2/src/commands/studio/route-speed-spines.ts`, add deterministic migration/compatibility tests, rebuild all route spines into a new artifact boundary, and audit map plus study consumers. Strategy B additionally needs a source-backed pattern registry and effective-date contract; artifact recurrence alone is insufficient.

## Follow-up chain

This decision commissions **no** production follow-up, spine rebuild, candidate rebuild, batch-2 review, study run, or publication. If a future data-completeness plan closes the gap and the operator explicitly reopens grouping, the mandatory chain remains:

1. Approve a new production plan and identity/pattern authority.
2. Version and implement the spine engine; rebuild artifacts without mutating the frozen manifest.
3. Re-audit map readiness claims because Plan 079 consumers share the spine manifest.
4. Build a new candidate-set ID bound to the new spine inputs.
5. Obtain a complete exact-set operator receipt; old rejections are never silently readmitted.
6. Separately authorize any study run, review its estimator gates, and separately authorize publication.

## Open questions

- Is there an authoritative source that enumerates route-pattern identities and effective windows at the segment level?
- Which unresolved Q43-style gaps are upstream absences versus pipeline coverage losses?
- Would an exact-alias-only maintenance plan be worthwhile for 21 routes after the unresolved gaps are investigated, or should alias repair stay coupled to source ingestion?
- How should a future version expose map readiness so a reclassified study spine cannot overstate public map completeness?

Until those questions have source-backed answers, the current classifier and all downstream gates remain binding.

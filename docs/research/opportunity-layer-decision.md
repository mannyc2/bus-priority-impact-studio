# Plan 076 opportunity-layer decision

Date: 2026-07-22

Status: **spike delivered; do not ship a public opportunity ranking**.

Plan 074's May review cut clears the written evidence-count prerequisite, but the conservative
prototype finds zero segments that can honestly be described as untreated. This is a source-state
limitation, not a reason to relax the gate or infer treatment absence from missing documentation.

## Bound inputs

The non-public run is pinned to analysis month `2026-05`, candidate universe
`candidate-set-v3:80050ed598f3b2ab0d0a1e99`, and review cut
`study-review-cut-v1:5298f37aac8780666c742f7d`.

| Input | Bytes | SHA-256 |
|---|---:|---|
| Complete nine-study index | 5,302 | `4e27d6effb4c0bf72093780de660f5b9c9eb5e9b2fee9d871bf491d52d574903` |
| Immutable review inputs | 125,041 | `13fc63b4b5a3ba378a79b7f2b58963c7700282a999cebeb9d5cd6bb808a75b6e` |
| Full 393-route speed-spine manifest | 360,880 | `4ff10b34dfea4c32ac7638799271c430ec0935f464182ce781153fb50439f1b7` |
| May route-treatment summary | 9,586,945 | `feccc21afe7ecea907aefa445737dea09b65d007e4983ffa06e00815705c00ca` |
| Reviewed intervention corpus | 287,596 | `35c4209ea4719ec457a1f6b9d84c90d3c3d8ca6fdea8ae771e6267e3e1176d8e` |

The reviewed corpus remains the Plan 073 projection of source corpus SHA-256
`593cb776ffdfb4c95526772757c54ac6bfb60ba2dbe1443f013445e251132d04`; it is used only to add
documented treatment presence. Its silence never establishes absence. The compact scratch database
adds only the slices needed for this spike:

- May hourly ridership: 60,984 rows, 363 routes, 26,446,707 riders, and 7,005,619 transfers;
  ordered logical SHA-256
  `127186eaeaab8c2b156d9a4c13218d0a6b1d30ec402868ee8701b36078b6c37c`;
- ACE evidence: 81 rows across 60 routes; ordered logical SHA-256
  `6fcccdf0278a93d9ab2265b1075f73976a35d08fd6ce7b3f6fbfa903078d7fa4`;
- May speed observations and all route spines are inherited from the immutable Plan 074 review
  inputs. The original 181.8 GB database remained read-only.

## Method

For each treatment family, the prototype admits only `gated_estimate` studies and requires at
least three distinct event-route studies. Descriptive studies are listed but never enter the
transfer. The ACE family qualifies through BX38, BX9, and B60. Their signed all-day relative
effects are -0.0300%, +2.1014%, and -0.5024%, producing the prescribed signed median of
**-0.030008758194421996%**. B68 is explicitly excluded as descriptive even though it shares the
B60 occurrence.

For a segment that passes all evidence gates, the prototype would compute:

`route riders apportioned by observed segment trip-time share × nonnegative minutes behind the
borough/fixed-length-band p75 speed × signed family median effect`.

The p75 uses deterministic nearest rank. A treatment-summary positive status or a documented
corpus treatment excludes the segment as treated. `source_gap`, `not_found`, a missing row, or
corpus silence is unknown—not untreated. Every score must be finite.

## Result

The repeated real run produced byte-identical outputs:

| Output | Bytes | SHA-256 |
|---|---:|---|
| `opportunities.json` | 5,876 | `5b9c11080973443deb2ed7ad5610130e21af9e259e2f976f7738007931da5612` |
| `report.md` | 1,101 | `7c520cc8c9ab4cdfd64793231d2f60087381610945654127c14647dbaa8c386a` |

The prototype starts from 4,153 May source segments and scores **zero**:

| Exclusion | Count |
|---|---:|
| Spine not ready | 3,190 |
| Spine unmatched | 0 |
| Invalid segment values | 0 |
| Missing route ridership | 10 |
| Documented as already treated | 135 |
| Treatment state unknown | 818 |
| Not applicable | 0 |
| Insufficient-family segment pairs | 963 |

There is no top 20 to review. No segment passes the evidence, treatment-state, spine, and
ridership gates, and the prototype does not turn the 818 unknowns into opportunities. The ACE
count floor is satisfied; the concrete blocker is the lack of an audited, current segment-level
inventory that can affirm treatment absence. The signed median is also slightly negative and
spans strongly mixed study results, so it does not support a positive expected rider-minutes-saved
claim even if absence were known.

## Known weaknesses

- Ridership is route-grain and apportioned by observed trip time, not stop-level boardings or
  onboard load. Transfers are reported separately upstream but cannot repair the missing
  segment-level exposure grain.
- Effect transfer assumes three ACE event-route estimates apply to other corridors. The estimates
  are mixed in sign, the median is near zero and negative, and none establishes a universal causal
  effect.
- The borough × fixed segment-length p75 is transparent and deterministic but sensitive to the
  chosen length bands and monthly route mix.
- Only 116 of 393 spines are ready or ready-with-gaps. The 3,190 non-ready source rows make network
  coverage incomplete rather than evidence of low opportunity.
- Existing treatment sources document presence and gaps; they are not a complete negative
  inventory. Neither corpus absence nor `not_found` is a safe untreated label.

## Surface options if the evidence changes

The accompanying non-binding comp is
`plans/mockups/076-opportunity-layer/comp.html`. It keeps the current Speed and Rider delay lenses
and the separate DOT lane context rather than presenting a composite score as observed fact.

1. **Map lens on `/map`** — best for spatial scanning and fits the existing lens toggle, but only
   after every rendered segment has affirmative untreated evidence and the score has a defensible
   positive interpretation. DOT lane geometry should remain a separate context layer.
2. **Ranked block on `/interventions`** — gives the method and exclusions room beside evaluated
   treatments, but ranking language risks looking like an agency recommendation and needs strong
   uncertainty disclosure.
3. **Per-route module** — easiest place to explain route-grain ridership and missingness, but it
   hides the network comparison and could imply precision the exposure data does not have.

## Recommendation

Do **not** ship any opportunity lens, ranked block, route module, public artifact, or mutable
serving pointer from this spike. Preserve the zero-candidate result as the decision evidence.
Revisit only after an audited current ACE absence inventory exists at segment grain and the same
treatment family has stronger, directionally coherent gated estimates. Do not tune thresholds,
reinterpret unknowns, add special-case exclusions, or select a favorable transfer statistic.

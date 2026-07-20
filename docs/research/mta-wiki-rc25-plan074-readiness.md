# MTA Wiki rc25 / Plan 074 readiness record

Date: 2026-07-20

This record closes the Tracker-side engine defects that blocked a new Plan 074
run and freezes the next exact-route review package. It does not approve a
candidate, run an estimate, replace the immutable historical five-study
output, or authorize publication.

## Pinned release and deterministic cut

The source is MTA Wiki `v1-rc25`:

- manifest SHA-256:
  `77e518a5de39e9fc982d09b7677d44059d26de69b04d9fe10841d6c478516f0f`
- operational-occurrence SHA-256:
  `1650ca9ef02e723c694baaf4685596a36ed0eb9e1447b46313397d92adcd8bcc`
- strict import SHA-256:
  `bdf844fca656f98ddd57f544a49677b528ff9b49e875e0119d1d5dc268d5bb34`
- candidate artifact SHA-256:
  `b66c0cd70afdf99a0fa2779d9b0574ba328bcc5f49c7d0177eaa029b0bb2c195`
- candidate set:
  `candidate-set-v3:575ee30a44f2e141e97f6a77`

Two strict imports were byte-identical. Two candidate builds against the same
unchanged local database were also byte-identical. The tracked third cut
matches both pairs byte-for-byte.

The import contains 131 source occurrences, 130 eligible occurrences, 167
route projections, and one retained rejected occurrence. The candidate set
contains 486 rows: 78 automated bus-lane enforcement, 325 bus-lane, 82 route
redesign, and one off-board fare collection. It has zero approved events, 382
source rejections, zero conflicts, and 12 exact deduplications.

## Engine-boundary closure

Control eligibility now screens the complete candidate list, not only
approved treated events. A candidate route is excluded from the control pool
when any real candidate lies within the inclusive nine-month window around the
treated onset. Approval controls which events can be estimated; it does not
make rejected or still-unreviewed interventions safe controls.

Treatment scope now fails closed:

- affirmative `mta_ace_routes` provenance is the only v1 proof accepted for
  all-route scope;
- bounded treatments require an exact physical-scope binding tied to the
  current candidate set, source release, analysis month, source snapshots,
  geometry IDs, and route spine;
- the production overlap helper filters to only those geometry IDs and must
  reproduce the complete reviewed source-segment→spine mapping;
- missing, ambiguous, stale, or drifted evidence is counted as ineligible;
- the former automatic all-route lane fallback cannot execute.

The command consumes only an approved v3 event artifact. V1/v2 event sets and
awaiting-approval v3 sets cannot enter the estimator.

## Flatbush exact physical scope

The sole rc25 occurrence with bounded physical scope is
`occurrence:8c987704152b459014217d44`, corridor
`corridor_flatbush-phase1-livingston-state`, projected to B41 and B67.

The pinned NYC DOT source subset is Flatbush Avenue, Brooklyn, center-running,
opened 2025-10-02, chronology `BK2025`. Its nine directional rows reduce to
five unique geometry IDs:

- `0022938`
- `0022942`
- `0028973`
- `0118635`
- `0118636`

The canonical selected-row SHA-256 is
`fb619e9df5c491de524b9dc2335452d6285be00f593fe8799dc7a951b3992c4e`.
The production overlap resolver, run against the live local DB and the pinned
route/stop snapshots, returned exactly these bindings and no others:

| Route | Current source segment | Stable spine segment |
|---|---|---|
| B41 | `B41:2026-03:N:48:303254:901007` | `b41-n-node-012-node-013` |
| B41 | `B41:2026-03:S:1:307403:303295` | `b41-s-node-013-node-012` |
| B67 | `B67:2026-03:N:26:308641:303259` | `b67-n-node-009-node-010` |
| B67 | `B67:2026-03:S:14:303290:303296` | `b67-s-node-010-node-009` |

The binding pins these input hashes:

| Input | SHA-256 |
|---|---|
| NYC DOT bus lanes | `12748ed365ec3eaa064fd579c05cfe434c219f1523869668b3e3858d8b7fcef7` |
| Current route shapes | `47653a0f54a33c0d6647294e82b2dd1c05e77a482c56a29bdc6466fafe495779` |
| Current stops | `403ac2333d17c96bea39a84c770737c994ec12d3effb818b7147554587143ce7` |
| B41 speed spine | `9ee61505691d1f052e8a3c8e53ce7c08b109087b9984f8412d90921e002e2dbf` |
| B67 speed spine | `1698311cbc30ef9e5759431a4430763c7f61df0bfde091a300916ef3f51df7a8` |

B67 is `series_ready_with_gaps`; B41 remains `needs_pattern_review`. Exact
scope proof does not override that independent spine gate.

## Remaining operator gate

The non-authorizing worksheet contains all 486 candidates with
`REVIEW_REQUIRED`, blank reviewer, and blank rationale fields. The operator
must issue exactly one explicit approved/rejected decision for every row and
validate a v3 receipt against the exact candidate set and artifact hash.

There are 12 ACE candidates that currently pass only the calendar-plus-spine
structural prefilter, all with affirmative registry route-wide provenance.
B67 adds one calendar-eligible, spine-ready bounded candidate with the exact
binding above. These rows demonstrate that ten studies are structurally
possible; they do not guarantee ten outputs. Operator decisions, exact scope,
panel/sample coverage, control eligibility, pre-trend, placebo, confounder,
and claim-tier gates remain independent.

After receipt validation, run Plan 074 once with focused diagnostics, then one
comprehensive verification pass. Any resulting studies require a fresh
anchors report and operator sanity check before Plan 075 activation or any
publication.

## Tracked artifacts

- `docs/research/artifacts/mta-wiki-v1-rc25.operational-occurrences-import.json`
- `docs/research/artifacts/candidate-set-v3-575ee30a44f2e141e97f6a77.study-events.json`
- `data/study-event-approvals/reviews/candidate-set-v3-575ee30a44f2e141e97f6a77.review-worksheet.json`
- `data/study-event-approvals/scope-bindings/candidate-set-v3-575ee30a44f2e141e97f6a77.scope-bindings.json`

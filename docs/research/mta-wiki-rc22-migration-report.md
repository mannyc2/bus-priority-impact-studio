# MTA Wiki v1-rc22 Tracker migration and promotion report

Date: 2026-07-17
Tracker baseline: `5e656c2450792a23e36b4afc9ca29bdda97a1b5e` (merged PR #60)
MTA Wiki merged main: `c8177e56e5852e2516b6b597ecf922d642ed421f`
MTA Wiki campaign final branch: `82a34667041119333ea07d397e15f14eff4b7652`
Release: explicit `v1-rc22`; `LATEST` was observed as `v1-rc5` and was not used or changed

The read-only Wiki worktree is at campaign commit `82a3466`; its tree
`7ccb412c27ae04b83c47d7fd7fdb6aee1ff0dbf5` is identical to merged-main
commit `c8177e5`, which reproduces the pinned release hashes below.

## Recommendation

**HOLD: Tracker is not ready for an operator to promote rc22.**

Tracker can now verify and inspect the exact pinned rc22 release without
discarding occurrence-v2 phase or physical-scope lineage. The release is
nevertheless quarantined because its declared occurrence-review-decisions-v1
payload contains one occurrence-v2-only `physical_scope` evidence role. The
producer's own strict review-v1 contract therefore rejects the release. The
Tracker exception is fingerprinted to the exact manifest, review file,
decision, occurrence, relation, source, and evidence block; it produces a
non-promotable inspection artifact and cannot authorize approval, studies,
publication, D1/R2 mutation, or a `LATEST` change.

The producer should publish a new named release whose declared review
contract admits every emitted role. Tracker should then rerun this migration
through the ordinary strict-compatible path. Do not broaden review-v1 or
reuse the rc22 fingerprint for any other release.

## Verified release boundary

- Manifest v4: 50,741 bytes, SHA-256
  `249ef6be1d927e44d405c11bcff643d18b2133e5407be37dc7612f935a1b53e4`;
  generator commit `a874d93a3b0b328d6047c325657b7111704fa263`.
- Operational occurrences v2: 866,164 bytes, SHA-256
  `d2fff454cc82c9a74f9f4ea9bb0b0334a12af385f53d0e7fbde126ea9e33f98f`.
- Occurrence summary v2: 244 bytes, SHA-256
  `60e987a9e5624bf1c8d9465df609424ed16de4f2dcaab1f84e2d728a162cf01c`.
- Occurrence review decisions v1: 712,308 bytes, SHA-256
  `f18dda5c0c758d4193cb1dfdf69e296da79814ebcb39cdefb4e7dc9bec963bed`.
- Relationship bundle v1: 99,060 bytes, SHA-256
  `2a4fa7fd0e3b2345b236c06a4e0fc7640db106c959ab65ef6110d30ed6a0641f`.
  All 225 declared artifacts, their safe canonical paths, byte counts, and
  hashes were verified; every JSON/JSONL artifact was also parsed with fatal
  UTF-8 and no blank JSONL rows, and every Markdown artifact was fatal-UTF-8
  decoded. The reconstructed descriptor is 68,953 bytes with
  SHA-256 `c7e3f88f42af5270d7cdb3bf5a6e3219e545067d4b6249a2d05ff82021e305ff`.
- Enforcement proof: raw SHA-256
  `47abb7e6602083ef94ca7863c512635ad0ca2332d5bca8ed3483cb175928ef54`;
  canonical SHA-256
  `2bcdc8859c23baecfb0a463e32a2485eab267d3de5ad6ac9cf3c69c14e270536`.
  Its seven required gates are ready with zero violations. The previous proof,
  previous gates, transition receipt, archived source commitments, final
  endpoint matrix, and current proof pointers reconcile to unique bundled
  artifacts. Tracker also enforces the exact relationship-v1 identity,
  evidence, finding-code, completeness, and migration policies; all 704 final
  endpoint rules and 1,008 reviewed family/shape tuples reconcile to 21,422
  relations. The transition receipt has exactly four invariant roles and six
  refresh roles; every non-database refresh fingerprint matches both active
  and archived bytes, and every current/archived gate source resolves to its
  exact bundled path and hash.
- Canonical graph: 85,392 records and 21,422 relations, zero enforceable
  violations, three reviewed non-enforceable shape advisories, and 45,983
  informational orphan records. Finding code/severity sums, primary
  dispositions, orphan-kind totals, contract-covered relations, and manifest
  record/relation counts reconcile. The graph manifest's five artifacts also
  reconcile by hash, including exactly 3 findings, 45,983 orphan rows, and
  21,422 relation-audit rows. These graph facts do not establish treated
  segment coverage.

Three transition pins are intentionally not release-bundled as their original
repository paths: `data/canonical.db`, `data/canonical/relations.jsonl`, and
the reviewed `v1-rc21` release manifest. Tracker requires those role/path/hash
pins inside the canonically committed transition receipt but does not claim to
have independently verified the absent raw files. The bundled determinism
summary and final endpoint matrix are independently verified. This limitation
does not weaken any admission gate and remains part of the operator handoff.

Pinned Tracker-side migration inputs are the rc19 import (SHA-256
`47371908c45642aeec58bec3d7f450290e761bafe572afedf993fc11d065022e`),
rc19 candidate artifact
`42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba`,
logical merge snapshot
`17530e0bc5a857463249d32a882ae7027a77ea44041babe00c5d761662363104`,
speed-spine manifest
`aa342bc154340a1da7209225eb0e32e0bb3df0321b84e3ebb432cb2dffe2b7a7`,
acquisition summary (7,097 bytes,
`30c84f4f3e19755459fe600768a540814a9a7fadfd9cb7d7b0d0ff48c8134bdb`),
and acquisition campaign (1,253,355 bytes,
`8f1ed51bbc2ee890f1111445b9d0655fdc4c639a29cab1324694ae7e1f063915`).

The incompatibility is decision
`flatbush-phase1-center-running-bus-lanes-2025-09`, occurrence
`occurrence:8c987704152b459014217d44`, relation
`relation_flatbush-phase1-treatment-on-bounded-corridor-livingston-state-20260715`,
source `flatbush_ave_bus_priority_mtp_briefing_apr2026`, evidence block
`#p004_c0002`.

## rc19 to rc22 funnel

| Measure | rc19 | rc22 | Result |
|---|---:|---:|---|
| Source occurrences | 135 | 135 | no delta |
| Source route projections | 173 | 173 | no delta |
| Eligible occurrences | 134 | 134 | no delta |
| Rejected occurrences | 1 | 1 | same unsupported bundle |
| Eligible route projections | 172 | 172 | no delta |
| Rejected route projections | 1 | 1 | no delta |
| Atomic / bundle occurrences | 50 / 85 | 50 / 85 | no delta |
| Multi-route occurrences | 10 | 10 | no delta |
| Study candidates | 489 | 489 | no identity delta |
| Approved candidates | 0 | 0 | rc22 is contract-blocked |

Those rows describe the producer contract funnel. Tracker's candidate-family
admission is a separate, stricter stage:

| Tracker stage for rc22 Wiki input | Occurrences | Route projections |
|---|---:|---:|
| Admitted to the candidate path | 91 | 100 |
| Rejected by Tracker | 44 | 73 |
| Producer-eligible but locally unsupported | 43 | 72 |

The 43/72 locally unsupported rows comprise 28 `bus_stop_or_boarding`
occurrences/projections, 13 `service_pattern` occurrences over 30 projections,
and two unsupported `fare_collection` occurrences over 14 projections. The
remaining Tracker rejection is the producer-ineligible M86 bundle.

The one producer source rejection remains
`occurrence:025c872102a446492605b997` with
`unsupported_bundle_analysis_family`. Candidate merge retains 44 Wiki and 340
registry rejection rows (384 total), 12 exact cross-source deduplications, and
zero same-month conflict groups.

All 489 candidate IDs and their route, treatment-family, date, and precision
identity are unchanged: zero additions, removals, or identity mutations.
There are 487 day-precision and two month-precision candidates. Treatment
families are 79 automated bus-lane enforcement, 325 bus lane, one off-board
fare collection, and 84 route redesign. Provenance is 88 Wiki-only, 12
Wiki-plus-registry, and 389 registry-only.

The candidate set must still change. The 100 Wiki-bound candidates now bind
rc22's manifest, occurrence bytes, relationship bundle/proof, reviewed phase,
physical-scope arrays, and route-record identity. The new set is
`candidate-set-v3:9761a5648df08fbdf6c38bb4`, artifact SHA-256
`25d1fa96f8796f053c538631fbce19aa3b77fb1435e5b357c50eec2f94bf6129`.
Its state is `blocked_contract_incompatible`, its approval is null, and its
approved-event list is empty.

The historical 403-candidate receipt (5 approved, 398 rejected) remains
immutable and applies only to its historical set. The rc19 489-candidate set
has no receipt. Its 16-approve/473-reject Codex review is explicitly
non-authorizing and does not bind the rc22 provenance. No receipt may be
created for quarantined rc22; after a compatible producer release, a fresh
complete candidate-set-v3 receipt would be required.

## Field-level lineage and canonical links

The machine audit contains one row for each of 173 source occurrence × route
projections, including the ineligible projection.

| Dimension | Category and count | Interpretation |
|---|---|---|
| Route identity | `wiki_primary_structured_validated`: 173 | Exact normalized Wiki route IDs resolve to Tracker analysis routes |
| Historical route version | `historical_version_missing`: 173 | Tracker has current canonical analysis routes, not historical route-version rows |
| Occurrence/date | `wiki_only`: 173 | Reviewed MTA occurrence evidence supplies onset; performance is never used to infer it |
| Treatment family | `wiki_only`: 173 | Reviewed Wiki treatment graph supplies family/bundle identity |
| Route scope | `wiki_only`: 173 | MTA evidence establishes affected routes, not outcomes or segment exposure |
| Physical/treated segment | `wiki_only`: 171; `unresolved_physical_link`: 2 | Only the Flatbush phase has exact source scope; neither projection has a Tracker segment crosswalk |
| Phase identity | `wiki_only`: 173 | All 135 occurrences are single-phase under v2 |
| Outcome data | `structured_primary`: 173 | Tracker speed/ridership/reliability remain the outcome authority; no estimate was run |
| Causal interpretation | `structured_primary`: 173 | Only a separately authorized gated Tracker study may make an estimate; none was run |

The exact physical scope is Flatbush phase 1 corridor
`corridor_flatbush-phase1-livingston-state`, projected to B41 and B67. It has
source relation/evidence lineage but zero Tracker segment IDs, so it is
explicitly unresolved. The other 171 route projections do not claim exact
physical scope. `physical_scope_not_applicable` or an empty source array is
not reinterpreted as route-wide treatment.

This audit is warning-first and artifact-local. It does not ingest the Wiki
graph into public D1 and adds no SQL foreign key: the route denominator is
complete for the current analysis route set, but the historical route-version
and treated-segment denominators are not. A future constraint migration must
first materialize complete version/segment crosswalk tables and prove zero
unresolved rows; until then every missing link carries an explicit disposition
and source evidence.

## Outcome, spine, overlap, and publication gates

- Candidate outcome windows: 215 calendar-ineligible and 274 with at least
  four pre/post months. Of the eligible rows, 243 have full six-by-six
  calendar windows (241 day-precision plus two month-precision) and 31 have a
  shorter four-plus day window.
- Candidate spine readiness: 371 `needs_pattern_review`, 87 `series_ready`,
  and 31 `series_ready_with_gaps`. Readiness is only a mechanical prefilter.
- Eighty-four candidates carry the prespecified Queens Bus Network Redesign
  confounder group. A zero conflict-group count is not evidence that
  confounding is absent.
- rc22 occurrences contain 132 day and three month onsets; their 172 eligible
  route projections contain 161 day and 11 month projections.
- The completed 321-candidate bus-lane queue has zero canonical Wiki-occurrence
  projections, zero Wiki bindings, and zero approvals. All 321 rows remain
  present in Tracker's candidate artifact as unchanged registry-only
  candidates, not admitted occurrences. Fifty-four have only generic
  authoritative route-treatment linkage, one has exact candidate-segment
  proof, none has an evidence-backed exact candidate date and phase, none
  produced a new or updated occurrence, 267 are
  `completed_search_route_linkage_unresolved`, and 54 are
  `linkage_supported_phase_unresolved`. Their registry day values remain
  unproved intervention dates under the campaign contract.

The audit retains each campaign receipt/exclusion pointer and row hash. The
shard receipt and exclusion files are release-bundled; the referenced rc19
reconciliation ledger itself is not. Its pinned commit identity is recorded,
but Tracker does not claim release-contained verification of those external
ledger rows.

Independent adversarial review also found two pre-existing Plan 074 study
boundaries that must be corrected before any new run, independently of the
rc22 producer fix:

1. Control eligibility currently screens only approved events; real rejected
   or unreviewed interventions can contaminate the no-event ±9-month control
   rule.
2. When more than half of treatment geometry is unmapped, the runner can fall
   back to all route spines without an explicit physical-scope/claim-tier
   admission. That fallback is not valid for bounded treatments such as the
   Flatbush corridor.

Plan 074 therefore remains in progress and blocked from another run. Plan 075
remains complete only for already published artifacts and receives no rc22
data. Plan 083's independent spine-pattern grouping spike remains useful, but
a readiness flip means only “advance to review,” never approval. No new plan
number was allocated; 084–088 are already occupied and updating the existing
plans is the truthful record.

## Reproduction

Run from the Tracker repository root. All outputs shown below are research or
scratch outputs, never production serving paths.

```sh
bun --filter @bp/pipeline-v2 cli -- studio import-mta-wiki-operational-occurrences \
  --mta-wiki-root /home/cjpher/.codex/worktrees/5346/mta-wiki \
  --wiki-release v1-rc22 \
  --wiki-manifest-sha256 249ef6be1d927e44d405c11bcff643d18b2133e5407be37dc7612f935a1b53e4 \
  --output /tmp/mta-wiki-v1-rc22.operational-occurrences-import.json

bun tools/pipeline-v2/scripts/replay-mta-wiki-rc22-candidates.ts \
  --wiki-import /tmp/mta-wiki-v1-rc22.operational-occurrences-import.json \
  --logical-inputs docs/research/artifacts/mta-wiki-rc19-study-merge-logical-inputs.json \
  --output /tmp/candidate-set-v3-rc22.study-events.json

bun tools/pipeline-v2/scripts/audit-mta-wiki-rc22-lineage.ts \
  --tracker-baseline-commit 5e656c2450792a23e36b4afc9ca29bdda97a1b5e \
  --rc19-import docs/research/artifacts/mta-wiki-v1-rc19.operational-occurrences-import.json \
  --rc19-candidates docs/research/artifacts/candidate-set-v2-24080902f508b55a0033df32.study-events.json \
  --rc22-import /tmp/mta-wiki-v1-rc22.operational-occurrences-import.json \
  --rc22-candidates /tmp/candidate-set-v3-rc22.study-events.json \
  --wiki-manifest /home/cjpher/.codex/worktrees/5346/mta-wiki/data/exports/releases/v1-rc22/manifest.json \
  --logical-inputs docs/research/artifacts/mta-wiki-rc19-study-merge-logical-inputs.json \
  --spine /mnt/models/dev/bus-reliability-tracker/data/artifacts/studio/v2/speed-spines/2023-04_to_2026-03/manifest.json \
  --acquisition-summary /home/cjpher/.codex/worktrees/5346/mta-wiki/data/exports/releases/v1-rc22/relationship-integrity/data/quality/relationship-integrity/bus-lane-acquisition/summary.json \
  --acquisition-campaign /home/cjpher/.codex/worktrees/5346/mta-wiki/data/exports/releases/v1-rc22/relationship-integrity/data/quality/relationship-integrity/bus-lane-acquisition/campaign.jsonl \
  --latest /home/cjpher/.codex/worktrees/5346/mta-wiki/data/exports/releases/LATEST \
  --analysis-month 2026-03 \
  --output /tmp/mta-wiki-rc22-lineage-audit.json
```

Two post-change runs were byte-identical for each output:

- import: `fa7f6ca25b4ba2ec435e3ca4397a579ff89f7b97b20c0adb956263129bf857f9`
- candidate set: `25d1fa96f8796f053c538631fbce19aa3b77fb1435e5b357c50eec2f94bf6129`
- lineage audit: `042bd160b6c57f490547f9808b2683a0a7d2a26ccd8f494d74e61c84d873dfa7`

The checked-in machine-readable audit is
`docs/research/artifacts/mta-wiki-rc22-lineage-audit.json`. It records every
input byte count/hash, all lineage rows, the candidate comparison, the 321-row
queue disposition, and the non-authorization boundary.

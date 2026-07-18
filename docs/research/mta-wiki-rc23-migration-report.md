# MTA Wiki v1-rc23 Tracker migration and promotion report

- Date: 2026-07-18
- Tracker baseline: `5e656c2450792a23e36b4afc9ca29bdda97a1b5e` (merged PR #60)
- Tracker review-v1 projection: `7b5c988b69af17769256332414b798e0d35246d6`
- Tracker canonical audit binding: `745f098e1b62c89bf7bc2341818eaaacdba926f8`
- MTA Wiki merged repair: PR #2, merge commit `299752f2e9c7696296b29b1bcefbb5f454cb1699`
- Release: explicit `v1-rc23`; `LATEST` remains `v1-rc5` and was neither selected nor changed

## Recommendation

**READY FOR OPERATOR RELEASE-POINTER REVIEW, SCOPED TO PINNED v1-rc23 ONLY.**

Tracker now fail-closed verifies the corrected manifest-v4 / operational-
occurrence-v2 / occurrence-review-v1 / relationship-integrity-v1 boundary,
including the producer phase and physical audit manifests bound to the exact
occurrence bytes and current treatment, relation, and corridor roots. Two
independent imports, candidate merges, and lineage audits are byte-identical.

An operator may separately choose to promote MTA Wiki `LATEST` from `v1-rc5`
to `v1-rc23`. This report does not perform or authorize that action. Tracker
continues to require an explicit release ID and manifest SHA-256; it never
follows `LATEST` implicitly.

This recommendation does **not** approve the new candidate set, authorize a
study run or publication, deploy code, write D1/R2 data, or change `LATEST`.
The candidate set remains `awaiting_approval`, with a null receipt and zero
approved events. rc22 remains quarantined and unchanged.

No additional MTA Wiki producer repair is presently required. The former
blocker was corrected in rc23. The remaining study, geometry, confounder,
approval, and publication work belongs to Tracker/operator workflows.

## Corrected producer boundary

rc22 declared review-v1 but included one unsupported top-level
`physical_scope` evidence binding in decision
`flatbush-phase1-center-running-bus-lanes-2025-09`. rc23 removes that binding
from the review-v1 snapshot while preserving it in the occurrence-v2
physical-scope ledger.

Tracker verified every manifest-addressed file in both releases. The path sets
contain 246 artifacts each: 245 are byte-identical and exactly one changed.

| Artifact | rc22 | rc23 |
|---|---|---|
| Manifest SHA-256 | `249ef6be1d927e44d405c11bcff643d18b2133e5407be37dc7612f935a1b53e4` | `e412b0b7a3e98e87e43c8b59375f335c1c0bd84ab4024171ec6c45203f1da83b` |
| Review-v1 bytes | 712,308 | 712,052 |
| Review-v1 SHA-256 | `f18dda5c0c758d4193cb1dfdf69e296da79814ebcb39cdefb4e7dc9bec963bed` | `69eec1a5fd919eab4ac5743e492a036f0aae05349121195e68630f2fff54032c` |
| Occurrence-v2 bytes | 866,164 | 866,164 |
| Occurrence-v2 SHA-256 | `d2fff454cc82c9a74f9f4ea9bb0b0334a12af385f53d0e7fbde126ea9e33f98f` | same |
| Relationship bundle SHA-256 | `2a4fa7fd0e3b2345b236c06a4e0fc7640db106c959ab65ef6110d30ed6a0641f` | same |

Filtering only the review-v2-only `phase_relation` and `physical_scope` roles
from rc22's top-level review ledger produces rc23 exactly: zero phase bindings
and one physical binding are removed, with zero residual differences. Nested
review-v1 evidence remains exact and is never filtered.

## Tracker fail-closed verification

The v4 importer retains legacy manifest-v3/occurrence-v1 support through a
separate strict schema. Unknown versions and excess fields fail. The v4 path
also rejects unsafe/symlinked paths, missing pointers, duplicate identities,
invalid UTF-8/JSON/JSONL, blank JSONL rows, and byte/hash/row/summary drift.

Before review-v1 projection, Tracker now independently verifies:

- all 225 relationship-bundle artifacts and the reconstructed descriptor;
- the enforced relationship-v1 policy, seven zero-violation gates, transition
  receipt, active/archive fingerprints, final endpoint matrix, and graph
  audit;
- raw enforcement proof SHA-256
  `47abb7e6602083ef94ca7863c512635ad0ca2332d5bca8ed3483cb175928ef54`
  and canonical SHA-256
  `2bcdc8859c23baecfb0a463e32a2485eab267d3de5ad6ac9cf3c69c14e270536`;
- graph manifest `6631fd19b4520be5553420eb4ae347d2ab9fd39762c10a3ece9ab90b0313ac63`
  and summary `7b77d742fc5cac8e3b3497d254591db0a3381bd694195b013f09252d70672e91`;
- phase audit manifest `67c79704cf0d3c25634249d32a266d5952c1d82da747ce561fb82fb41e2f9340`
  and summary `ba37da3aa10ec9bfd6945506711defe10aa80a1e1367eae263262cb42a0f8da1`;
- physical audit manifest `476640f7de4bd06ce22bf5dd94dd4335e217698e972d95bb3f661767435792b6`
  and summary `02926881a698f6825b5aa638e347208ea6b8597c04032dd86a37c11ef0a19dc2`;
- both audits' occurrence pins against the imported 866,164 bytes, SHA, and
  135 rows; physical treatment-component, relation, and corridor pins against
  manifest-v4 metadata and record counts; and bundled completeness, policy,
  ledger, and contract inputs;
- hard-mode, complete-review, exact-evidence, and zero-finding/violation
  semantics, reconciled to the imported occurrence and treatment denominators.

The canonical graph remains 85,392 records and 21,422 relations with zero
enforceable violations and three reviewed non-enforceable shape advisories.
Graph integrity proves relationship consistency, not universal exact treated
segment coverage.

## Deterministic import and candidate funnel

| Output | Runs | Bytes | SHA-256 |
|---|---:|---:|---|
| rc23 operational-occurrence import | 2 | 1,229,311 | `27049c650366c91453f39919d574456eb28d5fab9cb8dce43afc5ceccdf99232` |
| rc23 candidate set | 2 | 1,132,675 | `60422e951226b97abe40ae3705469084c5134488e666084284771e1b60ab22b5` |
| rc23 lineage delta audit | 2 | 13,904 | `39472a8fec7aaa88dc02c1ceae66f98281688aae1586ccb8092cf2ff5f6f04d7` |

The producer funnel is unchanged from rc19/rc22:

| Measure | rc19 | rc22 | rc23 |
|---|---:|---:|---:|
| Source occurrences | 135 | 135 | 135 |
| Eligible / rejected occurrences | 134 / 1 | 134 / 1 | 134 / 1 |
| Source route projections | 173 | 173 | 173 |
| Eligible / rejected route projections | 172 / 1 | 172 / 1 | 172 / 1 |
| Multi-route occurrences | 10 | 10 | 10 |
| Single / related phase occurrences | n/a | 135 / 0 | 135 / 0 |
| Exact physical-scope occurrences | n/a | 1 | 1 |
| Tracker candidates | 489 | 489 | 489 |
| Approved candidates | 0 | 0 | 0 |

Tracker candidate-family admission remains stricter than producer eligibility:
91 Wiki occurrences / 100 route projections enter the candidate path; 44 / 73
are rejected. The rejected rows comprise the one producer-ineligible M86
bundle plus 43 producer-eligible occurrences in locally unsupported families
(28 bus-stop/boarding, 13 service-pattern, and 2 fare-collection occurrences).
The merge retains 384 source rejections, 12 exact cross-source
deduplications, and zero conflicts.

rc22→rc23 has zero candidate additions/removals and zero non-provenance row
changes. The 100 Wiki-bound rows change only their `releaseId`, manifest hash,
and producer-review compatibility; 389 registry-only rows are byte-semantically
unchanged. Removing exactly those three release-binding fields leaves zero
residual differences.

The new approval-relevant provenance therefore creates
`candidate-set-v3:aba25fe4209247be31d43b66`. It cannot reuse the rc22 set or
any earlier receipt. Its state is `awaiting_approval`, approval is null, and
approved events are empty.

Candidate facts remain 487 day-precision and two month-precision rows; 79
automated bus-lane enforcement, 325 bus lane, one off-board fare collection,
and 84 route redesign; 88 Wiki-only, 12 Wiki+registry, and 389 registry-only.
Outcome windows remain 215 calendar-ineligible, 241 full 6×6 day windows, 2
full month-precision windows, and 31 shorter 4+ day windows. Spine readiness
remains 371 `needs_pattern_review`, 87 `series_ready`, and 31
`series_ready_with_gaps`. Eighty-four rows retain the Queens redesign
confounder group.

## Field-level evidence lineage

The content-addressed rc22 audit remains the full 173-row field-level base;
its SHA-256 is
`042bd160b6c57f490547f9808b2683a0a7d2a26ccd8f494d74e61c84d873dfa7`.
Because occurrence-v2 bytes, route projections, phase/physical ledgers, and
all relationship artifacts are unchanged, rc23 carries the same denominators:

| Dimension | Category and count |
|---|---|
| Route identity | `wiki_primary_structured_validated`: 173 |
| Route-version identity | `historical_version_missing`: 173 |
| Treatment occurrence/date | `wiki_only`: 173 |
| Treatment family | `wiki_only`: 173 |
| Route scope | `wiki_only`: 173 |
| Physical/treated segment | `wiki_only`: 171; `unresolved_physical_link`: 2 |
| Phase identity | `wiki_only`: 173 |
| Outcome data | `structured_primary`: 173 |
| Causal interpretation | `structured_primary`: 173 |

All 173 current route identities resolve to Tracker analysis routes, but
Tracker still has zero historical route-version rows for those projections.
The only exact source physical scope is Flatbush phase 1, projected to B41 and
B67; neither projection has a Tracker segment crosswalk. Empty physical scope
is never interpreted as route-wide. No SQL foreign key is added until the
historical-version and segment denominators are complete.

MTA evidence supplies intervention identity, date, phase, family, route scope,
and the one exact source corridor. It does not supply Tracker geometry,
spines, speed, ridership, reliability, outcome estimates, or causal claims.
No performance discontinuity is used to infer intervention facts.

## The 321 excluded bus-lane candidates

All 321 rows remain present, unchanged, registry-only, unapproved, and
unresolved. There are 267 `completed_search_route_linkage_unresolved` and 54
`linkage_supported_phase_unresolved` rows. Fifty-four have generic
authoritative route-treatment linkage; one has exact segment proof; zero have
an evidence-backed exact candidate date and phase; zero produced a new or
updated occurrence; and zero have a canonical Wiki occurrence projection.
The acquisition receipts and exclusions remain evidence, not authorization.

## Plans and immutable gates

- Plan 074 remains in progress. Before another run, control eligibility must
  exclude evidence-backed rejected/unreviewed interventions, and bounded
  treatments must require exact occurrence→geometry→spine binding. Empty or
  unresolved scope cannot fall back to all-route spines.
- Plan 075 receives no rc23 public input. Compatibility and release promotion
  do not create an approved study or authorize serving regeneration.
- Plan 083 remains independently necessary on its existing route denominator.
  A readiness flip advances only to review and changes no candidate approval.

The historical 403-row receipt stays immutable (5 approved, 398 rejected).
The rc19 489-row set has no receipt; its 16/473 recommendations are
non-authorizing. rc22 is quarantined. rc23 requires a fresh complete receipt
bound to its exact set and input hashes. Study execution and publication each
remain separate operator gates.

## Reproduction

Run from the Tracker root with isolated outputs:

```sh
bun --filter @bp/pipeline-v2 cli -- studio import-mta-wiki-operational-occurrences \
  --mta-wiki-root /home/cjpher/.codex/worktrees/615d/mta-wiki \
  --wiki-release v1-rc23 \
  --wiki-manifest-sha256 e412b0b7a3e98e87e43c8b59375f335c1c0bd84ab4024171ec6c45203f1da83b \
  --output /tmp/mta-wiki-v1-rc23.operational-occurrences.json --json

bun tools/pipeline-v2/scripts/replay-mta-wiki-rc22-candidates.ts \
  --wiki-import /tmp/mta-wiki-v1-rc23.operational-occurrences.json \
  --logical-inputs docs/research/artifacts/mta-wiki-rc19-study-merge-logical-inputs.json \
  --output /tmp/candidate-set-v3-rc23.study-events.json

bun tools/pipeline-v2/scripts/audit-mta-wiki-rc23-delta.ts \
  --tracker-baseline-commit 5e656c2450792a23e36b4afc9ca29bdda97a1b5e \
  --rc22-release-dir /home/cjpher/.codex/worktrees/5346/mta-wiki/data/exports/releases/v1-rc22 \
  --rc23-release-dir /home/cjpher/.codex/worktrees/615d/mta-wiki/data/exports/releases/v1-rc23 \
  --rc22-audit docs/research/artifacts/mta-wiki-rc22-lineage-audit.json \
  --rc22-import docs/research/artifacts/mta-wiki-v1-rc22.operational-occurrences-import.json \
  --rc23-import /tmp/mta-wiki-v1-rc23.operational-occurrences.json \
  --rc22-candidates docs/research/artifacts/candidate-set-v3-9761a5648df08fbdf6c38bb4.study-events.json \
  --rc23-candidates /tmp/candidate-set-v3-rc23.study-events.json \
  --latest /home/cjpher/.codex/worktrees/615d/mta-wiki/data/exports/releases/LATEST \
  --output /tmp/mta-wiki-rc23-lineage-audit.json
```

Checked-in evidence:

- `docs/research/artifacts/mta-wiki-v1-rc23.operational-occurrences-import.json`
- `docs/research/artifacts/candidate-set-v3-aba25fe4209247be31d43b66.study-events.json`
- `docs/research/artifacts/mta-wiki-rc23-lineage-audit.json`
- `docs/research/artifacts/mta-wiki-rc23-replay-record.json`

No deploy, publication, study run, approval, D1/R2 write, `LATEST` change, or
MTA Wiki mutation was performed.

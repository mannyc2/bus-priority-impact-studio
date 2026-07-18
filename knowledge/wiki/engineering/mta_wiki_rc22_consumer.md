# MTA Wiki manifest-v4 / occurrence-v2 consumer boundary

Tracker consumes MTA Wiki operational evidence only through an explicit named
release plus an operator-supplied manifest SHA-256. It never follows `LATEST`
implicitly. The legacy profile is manifest v3 / operational occurrences v1;
the current profile is manifest v4 / operational occurrences v2 plus the
relationship-integrity-v1 bundle. Unknown versions, excess fields, unsafe or
symlinked paths, invalid UTF-8/JSON, duplicate identities, missing pointers,
and byte/hash/summary drift fail closed. Every bundled JSON/JSONL artifact is
syntax-validated after its bytes are verified. The exact relationship-v1
policy, final endpoint rules/tuples, invariant and refresh role sets,
transition fingerprints, current and archived gate sources, and graph-manifest
artifact hashes/row counts are reconciled, not merely trusted.

Before projecting occurrence-v2 into review-v1 parity, Tracker strictly
decodes the phase and physical audit manifests/summaries. Their occurrence
pins must equal the exact imported bytes, SHA, and row count. Physical
treatment-component, relation, and corridor pins must equal manifest-v4 root
metadata and counts; bundled completeness, policy, ledger, and contract inputs
must also reconcile. Hard-mode, complete-review, and exact-evidence semantics are mandatory, with
zero phase/physical-audit findings and zero enforceable relationship
violations while preserving the graph's reviewed and informational findings. Only then may top-level
`phase_relation` and `physical_scope` bindings be omitted from the review-v1
comparison, and only when the dedicated v2 ledgers match them exactly. Nested
or rogue omissions still fail.

Repository-path pins for the unbundled canonical DB, canonical relations, and
reviewed rc21 manifest remain explicit receipt commitments; Tracker does not
claim to have verified absent raw bytes.

Occurrence v2 adds reviewed phase and physical-scope identities, relations,
and evidence bindings. Tracker preserves those fields in the import and
candidate provenance. A deterministic local lineage audit then maps each
occurrence × route projection to the current Tracker analysis route and
records historical route-version and treated-segment links as explicit
unresolved dispositions where Tracker lacks a complete denominator. Graph
integrity never substitutes for physical-scope proof. Wiki evidence establishes
intervention identity, date, phase, family, and source scope; structured
Tracker geometry, speed, ridership, reliability, estimates, and causal gates
remain independently authoritative.

## rc22 quarantine

The exact `v1-rc22` release remains inspection-only. Its manifest declares
occurrence-review-decisions v1, but one Flatbush decision contains the v2-only
`physical_scope` evidence role. Tracker recognizes only the complete pinned
fingerprint and forces `promotionEligible: false` plus
`blocked_contract_incompatible`. This permits migration diagnosis without
loosening review-v1 or authorizing candidates, studies, publication, serving
data changes, or release promotion. rc22's directory and evidence remain
immutable.

## rc23 corrected release

`v1-rc23` changes only the review-v1 snapshot: 245 of 246 manifest-addressed
artifacts are byte-identical to rc22, the occurrence-v2 file and relationship
bundle are unchanged, and exactly one unsupported Flatbush top-level binding
is removed. The same binding remains in the dedicated occurrence-v2 physical
ledger. Tracker accepts rc23 through the ordinary compatible path with no
fingerprint exception.

The deterministic rc23 import SHA-256 is
`27049c650366c91453f39919d574456eb28d5fab9cb8dce43afc5ceccdf99232`.
Its new candidate set is `candidate-set-v3:aba25fe4209247be31d43b66`, SHA-256
`60422e951226b97abe40ae3705469084c5134488e666084284771e1b60ab22b5`.
All 489 candidate identities are unchanged, but 100 Wiki-bound provenance
bindings change, so no old receipt applies. The set is `awaiting_approval`,
with null approval and zero approved events.

Authoritative local handoff:

- `docs/research/mta-wiki-rc23-migration-report.md`
- `docs/research/artifacts/mta-wiki-v1-rc23.operational-occurrences-import.json`
- `docs/research/artifacts/candidate-set-v3-aba25fe4209247be31d43b66.study-events.json`
- `docs/research/artifacts/mta-wiki-rc23-lineage-audit.json`
- `docs/research/artifacts/mta-wiki-rc23-replay-record.json`

Historical quarantine record:

- `docs/research/mta-wiki-rc22-migration-report.md`
- `docs/research/artifacts/mta-wiki-v1-rc22.operational-occurrences-import.json`
- `docs/research/artifacts/candidate-set-v3-9761a5648df08fbdf6c38bb4.study-events.json`
- `docs/research/artifacts/mta-wiki-rc22-lineage-audit.json`
- `docs/research/artifacts/mta-wiki-rc22-replay-record.json`

The 321-candidate bus-lane acquisition queue remains excluded from canonical
Wiki-occurrence projection. All 321 are still present as unchanged
registry-only Tracker candidates, with zero Wiki bindings and zero approvals.
Generic route linkage, or even one exact segment receipt, cannot supply the
missing evidence-backed candidate date, phase, or canonical occurrence
identity. Receipts remain immutable and candidate-set-bound; publication
authorization remains separate from evidence review and study execution.

Merging Tracker PR #61 triggered the repository's ordinary main-push CI and
successfully deployed the Worker (workflow run `29625533041`, deploy job
`88029151351`). This was a code-deployment side effect of the merge, not a
candidate approval, study run, study publication, D1/R2 data promotion, or
MTA Wiki pointer mutation.

An operator may review promotion of `LATEST` from `v1-rc5` to `v1-rc23`, but
Tracker itself continues to consume only explicit release/hash pins. Release
promotion authorizes no candidate, study, publication, deployment, or D1/R2
write.

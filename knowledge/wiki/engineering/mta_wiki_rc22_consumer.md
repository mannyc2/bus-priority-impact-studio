# MTA Wiki rc22 consumer boundary

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
artifact hashes/row counts are reconciled, not merely trusted. Repository-path
pins for the unbundled canonical DB, canonical relations, and reviewed rc21
manifest remain explicit receipt commitments; Tracker does not claim to have
verified absent raw bytes.

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

The exact `v1-rc22` release is inspection-only. Its manifest declares
occurrence-review-decisions v1, but one Flatbush decision contains the v2-only
`physical_scope` evidence role. Tracker recognizes only the complete pinned
fingerprint and forces `promotionEligible: false` plus
`blocked_contract_incompatible`. This permits migration diagnosis without
loosening review-v1 or authorizing candidates, studies, publication, serving
data changes, or release promotion. A corrected named producer release must
pass the ordinary strict-compatible path.

Authoritative local handoff:

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
identity.
Receipts remain immutable and candidate-set-bound; publication authorization
remains separate from evidence review and study execution.

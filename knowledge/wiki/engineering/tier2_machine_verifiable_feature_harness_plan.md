---
title: Tier 2 machine-verifiable feature harness plan
type: engineering
status: proposed
last_updated: 2026-06-07
owner: codex
tags: [tier2, extraction, feature-proof, vocabulary, validation, promotion]
---

# Tier 2 Machine-Verifiable Feature Harness Plan

## Thesis

Tier 2 corpus completion must not depend on manual review of tens of thousands of extracted rows.
The target system is a compiler-style harness:

```text
LLM proposes broad source-grounded surfaces
  -> vocab/projection normalizes source-observed fields
  -> deterministic feature validators prove or reject each useful field
  -> promotion compiler emits detector/brief/timeline/causal features only from proven fields
  -> aggregate audit reports what was verified, downgraded, quarantined, or source-gapped
```

Human work is policy and fixture work: decide vocab rules, alias tables, promotion thresholds, and a
small gold/adversarial set. Human work is not row-by-row corpus verification.

The concrete product-facing extraction target lives in
[[wiki/engineering/tier2_extraction_target_spec|Tier 2 Extraction Target Spec]]. This page defines
the proof harness and promotion compiler; the target spec defines the fields the harness must ask
for, including the newer cost/value, service-delivery, ridership-demand, geographic/equity, and TSP
source-gap fields.

## Non-negotiable constraints

- No manual inspection path is allowed as the normal route to corpus completion.
- No public, detector, causal, or brief feature may consume an LLM field unless code can prove the
  field from source-local evidence and deterministic normalization.
- No raw-text/display-label fallback may create publishable canonical values unless a documented
  resolver policy explicitly allows it and emits a lower confidence/provenance code.
- No absence or missing-data claim may promote without a source-scoped search/shell transcript.
- No document-stated metric may become a Studio-computed metric. It remains a source-stated claim
  until deterministic analytics or a later method gate owns the value.
- Unknown or quarantined is a successful machine outcome. It is better than pretending a weak field
  is verified.
- The proof layer must be an extraction-time gate, not merely a post-hoc audit after a full corpus
  run. Window outputs that cannot pass shape/evidence/resolver validation must retry, downgrade, or
  quarantine before they become canonical inputs.
- Every queue must declare its role (`full_corpus`, `repair_subset`, `targeted_backfill`, or
  `validation_canary`), and full-corpus commands must reject repair-tail inputs by default.
- The next extraction contract must use strict feature-family schemas. Unknown category keys either
  parse into explicit raw/notes fields or quarantine; they must not silently become new taxonomy
  fields.

## Current foundation

The plan builds on what already exists:

- qv1-qv10 full-authority canonical merge: 6,713 canonical windows and 78,605 accepted surfaces.
- Vocab application over qv1-qv10: 13 graduation keys, 93,893 mapped fields, 21,474 `preserve_raw`
  fields, 672 unresolved fields, 0 missing projection rows after overlays, and 0 target conflicts.
- Vocab support gap: 16,895 field-support hits versus 99,144 missing field-support instances. This
  is the key signal that normalized taxonomy is not the same as publication-grade proof.
- Agentic harness mechanics: source-window requests, evidence handles, route lookup constraints,
  provider/retry audits, self-heal lanes, and deterministic source-authority repairs.
- Operational-date proof harness: exact quote checks, planned-vs-launched rejection, route scope
  confirmation, and treatment-family support checks. This is the model for feature-family proof.
- Structured extraction validator: quote containment, source/page checks, unsupported metric-value
  rejection, public-timeline date requirement, and project-metric authority rejection.

## Core artifact model

Add a machine proof layer that sits after canonical merge and vocab application.

### `tier2_feature_candidate_v1`

One candidate feature field derived from an accepted surface.

```ts
type Tier2FeatureCandidateV1 = {
  featureCandidateId: string;
  sourceId: string;
  documentId: string;
  windowId: string;
  surfaceId: string;
  surfaceKind: string;
  featureFamily:
    | "route_scope"
    | "operational_date_status"
    | "treatment"
    | "metric_claim"
    | "table_cell"
    | "source_statement"
    | "claim"
    | "source_gap"
    | "event_identity"
    | "causal_eligibility";
  rawFieldPath: string;
  rawValue: unknown;
  vocabKey: string | null;
  vocabMappedValue: string | null;
  canonicalTargetPath: string | null;
  evidenceFieldSupportIds: string[];
};
```

### `tier2_feature_field_proof_v1`

One deterministic validation result for one field.

```ts
type Tier2FeatureFieldProofV1 = {
  featureCandidateId: string;
  proofState: "verified" | "downgraded" | "ambiguous" | "quarantined" | "not_applicable";
  verifierId: string;
  verifierVersion: string;
  normalizedValue: unknown;
  evidencePointers: string[];
  counterEvidencePointers: string[];
  proofCodes: string[];
  supportCompleteness: "exact" | "partial" | "context_only" | "absent";
  promotionEligibility: {
    detectorEvidence: boolean;
    briefEvidence: boolean;
    publicTimeline: boolean;
    causalTreatmentInventory: boolean;
    sourceGapFinding: boolean;
  };
};
```

### `tier2_feature_proof_ledger_v1`

The full-corpus ledger and summary.

```ts
type Tier2FeatureProofLedgerV1 = {
  artifactKind: "bp.tier2_feature_proof_ledger.v1";
  schemaVersion: 1;
  generatedAt: string;
  sourceCanonicalMergePath: string;
  sourceVocabApplicationPath: string;
  sourceCrosswalkPath: string | null;
  summary: {
    sourceCount: number;
    windowCount: number;
    surfaceCount: number;
    featureCandidateCount: number;
    verifiedFieldCount: number;
    downgradedFieldCount: number;
    ambiguousFieldCount: number;
    quarantinedFieldCount: number;
    publishableFieldWithoutProofCount: 0;
  };
  summariesByFeatureFamily: Record<string, unknown>;
  candidates: Tier2FeatureCandidateV1[];
  proofs: Tier2FeatureFieldProofV1[];
};
```

The invariant is deliberate: `publishableFieldWithoutProofCount` must be zero.

## Extraction contract vNext

The next extraction contract is the place to prevent the old failure mode. It should be a
versioned, strict schema that models feature families directly instead of letting arbitrary
taxonomy-like values accumulate under broad `rawPayload` keys.

Required contract fields:

- `contractVersion`: exact extraction contract version.
- `queueRole`: one of `full_corpus`, `repair_subset`, `targeted_backfill`, `validation_canary`.
- `promptVersion` and `toolSchemaVersion`: recorded on every attempt.
- `sourcePacketHash`: hash over source context, evidence handles, resolver handles, and prior hints.
- `featureFamilies`: explicit sections for route scope, date/status, treatment, metric claim, table,
  source statement, source gap, and review question candidates.
- `fieldPathScheme`: versioned path scheme for evidence support.
- `unknownCategoryPolicy`: `reject`, `raw_label_only`, or `quarantine`.

Required behavior:

- A full-corpus merge refuses a queue whose `queueRole` is not `full_corpus` unless it is explicitly
  listed as a superseding repair input.
- A repair queue can supersede only matching document/page/window identities.
- New category-like keys are not allowed outside approved feature-family fields. Unknown labels go
  into `rawLabel`, `rawText`, `notes`, or quarantine.
- The contract carries a required/optional field matrix by feature family. For example, a
  `metricClaimCandidate` with `valueRaw` must cite value evidence, while a `reviewQuestion` can be
  evidence-light but cannot promote.

## Validation feedback loop

The harness should keep the current agentic repair idea, but make it feature-family aware. The LLM
does not get one vague "try again" message. It gets structured validation feedback and a bounded
retry budget.

### Validation stages

Validation runs in stages. Each stage emits machine-readable issues with `code`, `severity`,
`path`, `message`, `recoverability`, and `suggestedActions`.

| Stage | Validator | Example error codes | LLM retry? |
| --- | --- | --- | --- |
| Tool shape | Zod/JSON Schema parse of the tool call | `tool_response_schema_error`, `unknown_surface_kind`, `bad_field_path` | Yes, if parseable enough to repair. |
| Evidence path | Draft field paths and evidence handles resolve | `evidence_field_path_not_found`, `unknown_evidence_handle` | Yes. |
| Source support | Cited quote/cell/search transcript supports the field value | `quote_not_found`, `metric_value_text_not_supported`, `route_text_not_supported_by_evidence` | Yes for tighter support; no for impossible claims. |
| Canonical resolver | Route/date/treatment/metric/status/source-gap resolver accepts normalized value | `selected_route_not_in_lookup_result`, `planned_language_for_realized_launch`, `treatment_family_not_supported` | Yes when another supported value exists. |
| Promotion gate | Field is eligible for detector/brief/public/causal use | `publishable_field_without_proof`, `causal_candidate_missing_operational_date`, `source_gap_missing_search_transcript` | No for promotion; row is downgraded or quarantined. |
| Corpus invariant | Aggregate product rules pass | `unverified_field_used_by_projection`, `source_without_receipt`, `qv_tail_input_used_for_full_corpus` | No LLM retry; fix code/config/input. |

### Feedback artifact

Each failed or partial attempt writes a feedback packet that can be passed to the next LLM call:

```ts
type Tier2FeatureValidationFeedbackV1 = {
  artifactKind: "bp.tier2_feature_validation_feedback.v1";
  schemaVersion: 1;
  sourceId: string;
  documentId: string;
  windowId: string;
  repairRound: number;
  issues: Array<{
    draftIndex: number | null;
    surfaceId: string | null;
    featureFamily: string | null;
    path: string;
    code: string;
    message: string;
    recoverability: "repairable" | "downgrade" | "quarantine" | "hard";
    allowedValues?: string[];
    evidenceHandles?: string[];
    suggestedActions: string[];
  }>;
};
```

The next prompt includes only repairable/downgrade issues. Quarantine and hard failures are not
asking the model to persuade the system; they are asking the runner to preserve the failure class.

### Retry policy

- Shape and evidence-path errors get at most two repair rounds.
- Provider and missing-tool-call failures go through self-heal lanes, not feature validation.
- Resolver failures get one retry only when the feedback packet can name allowed IDs, accepted
  aliases, or missing field paths.
- Promotion failures do not retry the model. The field becomes research-only, source-gap-only,
  ambiguous, or quarantined.
- A retry must cite the same source-local evidence universe or new runner-provided source-tool
  evidence. It cannot rely on prior context as proof.

## LLM versus runner responsibilities

The future harness should make the LLM submit the smallest useful source-grounded payload and make
the runner fill everything deterministic.

| Responsibility | LLM submits | Runner fills or validates deterministically |
| --- | --- | --- |
| Source identity | Nothing beyond accepting the packet context. | `sourceId`, `documentId`, `windowId`, hashes, page/window refs. |
| Evidence | Field-to-evidence handle references and exact raw field text where useful. | Evidence pointer IDs, block/page/line/hash refs, quote hashes, table-cell refs, source-search transcript refs. |
| Raw observations | Raw text, display label, raw payload values, candidate surface kind, intended use hints. | Stable IDs, lifecycle state, source scope, artifact refs, accepted/rejected state. |
| Routes | Raw route wording and selected route lookup handle/candidate if supplied. | Route lookup generation, allowed route IDs, route resolution tier, service variant separation, current/historical state. |
| Dates/status | Raw date/status wording and source-stated context. | Date parsing, precision, effective range, status enum, operational/planned/process classification. |
| Treatments | Source wording for treatment/design/service components. | Treatment family aliases, family-specific support checks, custom/quarantine policy. |
| Metrics | Metric value text, subject/geography/period/comparison wording, source authority wording. | Numeric parsing, unit normalization, source-statement authority, publication wording gate, project-metric rejection. |
| Tables | Table title/row/cell text if visible in the evidence universe. | Cell coordinates, header/footnote linkage, completeness class, table-derived feature eligibility. |
| Source gaps | Candidate gap question and the query/source family the agent inspected. | Whether the transcript proves absence, public source-gap wording, blocked claims. |
| Promotion | Requested use as a hint. | Detector/brief/public/causal eligibility, proof state, downgrade/quarantine state. |

The key rule is: the model supplies source-observed semantics; the runner supplies identity,
normalization authority, proof state, and promotion rights.

## Avoiding post-processing debt

The current qv/vocab work taught us that broad `rawPayload` plus later projection can recover a lot,
but it creates expensive post-processing when field names drift. The next harness should reduce that
debt before the LLM output lands.

### Generate the tool schema from feature families

Instead of asking for one open-ended `rawPayload`, generate a tool schema with feature-family
sections:

- `routeScopeCandidates[]`;
- `dateStatusCandidates[]`;
- `treatmentCandidates[]`;
- `metricClaimCandidates[]`;
- `tableObservations[]`;
- `sourceStatementClaims[]`;
- `sourceGapCandidates[]`;
- `reviewQuestions[]`.

Each section keeps raw text, exact evidence support, and a small set of stable raw fields. Unknown
or extra labels still fit, but they go into explicit `rawLabel` or `notes` fields rather than new
ad hoc keys.

### Provide resolver handles before extraction

The request packet should include precomputed resolver context:

- route lookup handles generated from source blocks;
- date/status vocabulary and examples;
- allowed treatment vocabulary plus `custom_treatment` escape hatch;
- metric family/unit aliases from the approved vocab map;
- table slice handles when table OCR exists;
- source authority derived from source metadata;
- source-tool handles for absence claims when available.

That lets the model select from runner-owned handles rather than inventing normalized values.

### Validate during extraction, not after a full corpus run

Every source/window attempt should produce:

- `artifact.json` with raw submitted surfaces;
- `validation-feedback.json` when repairable issues exist;
- `audit.json` with final blockers;
- `proof-preview.json` with feature-family proof counts for the window.

The full-corpus proof ledger should mostly aggregate already-validated window outputs. It should not
discover basic field-name drift for the first time after 76k rows have landed.

### Prefer deterministic fill-ins over LLM resubmission

If a field is mechanically derivable from validated evidence, the runner fills it:

- missing `rawPayload.routeTextRaw` from evidence-backed route lookup text;
- source authority from official DOT/MTA source metadata;
- date precision from parsed date text;
- canonical treatment family from an approved alias table;
- table cell pointer from table slice coordinates;
- source disposition from proof ledger outcomes.

LLM retry is reserved for cases where the model cited the wrong field, omitted a supported raw
observation, or selected the wrong allowed resolver candidate.

## Implementation substrate: pi-agent-core / pi-ai

The existing pipeline already depends on `@earendil-works/pi-agent-core` and
`@earendil-works/pi-ai`, and `tools/pipeline-v2` already uses `AgentHarness` in the codemode/tool
loop path. The feature harness can reuse that substrate for orchestration while keeping all Tier 2
validation as pure domain/pipeline code.

Recommended mapping:

| Harness need | pi substrate |
| --- | --- |
| One bounded run per source/window attempt | One `AgentHarness` with an in-memory session per window. |
| Strict feature-family tool schema | `AgentTool` with `Type` schemas from `@earendil-works/pi-ai`; mirror or generate from the domain contract and test for drift. |
| Tool-shape validation | pi-ai tool argument validation before `AgentTool.execute`. |
| Extraction-time validation gate | `tool_call` hook for evidence/path/hard-block checks before execution. |
| Resolver and promotion proof attachment | `tool_result` hook to replace details with proof states, audit issues, and `terminate` when the submit tool has completed. |
| Bounded repair feedback | Follow-up/steering messages carrying `Tier2FeatureValidationFeedbackV1`; stop after the configured repair budget. |
| Replay E2E | Faux provider / captured tool-call responses where available, or a fake harness factory like the existing codemode tests use. |
| Provider/runtime failures | Catch `AgentHarnessError` and provider stop reasons separately from feature-validation failures, then route to self-heal lanes. |
| Per-window artifact writes | `save_point` or explicit command-side artifact writes after each turn/window. |

Implementation cautions:

- Do not put domain validation inside hooks as anonymous inline logic. Hooks should call named pure
  validators such as `validateMetricClaimCandidate()` or `proveTreatmentFamily()`.
- Do not make TypeBox schemas the only source of truth unless the domain contract also lives there.
  The rest of the repo is Zod-heavy; either derive one from the other or add schema parity tests.
- Do not enable generic filesystem/sandbox tools for the production extraction harness by default.
  The submit-style extraction harness should get only runner-owned source/evidence/resolver handles.
- Direct `AgentHarness` use may be cleaner than the generic codemode `makeToolLoopRunner()` wrapper
  because this harness needs custom feedback rounds, proof previews, and per-window artifacts.

## Feature-family validators

### Route scope

Reuse and harden the current route lookup validator:

- selected IDs must be returned by the route resolver;
- selected IDs must be bare route IDs, not service-variant prose;
- source evidence must contain the raw route wording or accepted alias;
- branch/family collapse requires a resolver tier that explicitly allows it;
- current/historical/proposed route state must be preserved.

Outputs: `routeIds`, `routeResolutionTier`, `routeTextRaw`, `serviceVariants`, `requiresReview`.
Rows with ambiguous route scope can remain detector context but cannot become route-level treatment
or causal inventory rows.

### Operational date and status

Lift the operational-date proof harness into a reusable validator:

- exact date/status quote must resolve to source context;
- planned/future/process language vetoes realized launch proof;
- date precision must be parsed into day/month/year/range/unknown;
- `sourceStatedStatus` must distinguish done, committed future, proposed, existing, and unknown;
- implementation date, report date, proposal date, and outreach date must not collapse.

Outputs: `effectiveDateStart`, `effectiveDateEnd`, `datePrecision`, `dateRole`,
`sourceStatedStatus`, `operationalDateValidationState`, `causalAnchorEligible`.

### Treatment family

Use the vocab overlays as the proposed taxonomy, then prove the treatment claim:

- source text must support the treatment family with family-specific terms;
- ACE/ABLE/camera, TSP/signal priority, stop changes, busways, bus lanes, SBS/BRT, queue jumps, and
  curb/boarding/fare components get separate pattern/resolver policies;
- treatment family may not be inferred only from route name, project title, or generic "bus
  improvement" wording unless policy classifies it as context-only;
- unsupported treatment labels downgrade to `custom_treatment` or quarantine.

Outputs: `treatmentFamily`, `treatmentSubtype`, `treatmentComponentType`, `treatmentStatus`,
`treatmentProofTier`.

### Metric claims

Metric extraction must be value-level, not row-level:

- `valueRaw` or equivalent numeric field must appear in the cited evidence span;
- unit and comparator must either appear in the same span or be explicitly context-only;
- `metricAuthority` must be source-stated, official source statement, third-party estimate, or
  deterministic Studio metric; the LLM cannot assign deterministic Studio metric authority;
- metric family, subject family, unit, geography, period, and comparison are independently
  normalized and proofed;
- official agency metrics can be quoted as source statements but must not drive computed findings
  without detector/method gates.

Outputs: `metricFamily`, `metricSubjectFamily`, `valueNumeric`, `unit`, `direction`,
`baselinePeriod`, `comparisonPeriod`, `sourceClaimAuthority`, `publicationWordingGate`.

### Table cells

Tables need cell-level proof, not table summaries:

- table ID, header, row index, column index, and page/block refs must be preserved;
- each extracted table-derived feature must point to a cell or contiguous row slice;
- footnotes and header context must attach as separate evidence pointers;
- summarized large tables can remain research context but not publish exact feature values.

Outputs: `tableKind`, `tableCellRef`, `headerContext`, `rowContext`, `footnoteRefs`,
`tableCompleteness`.

### Source statements and claims

Claims are source statements, not project facts:

- source authority is inferred or validated from source metadata and payload authority fields;
- causal language triggers `needs_causal_review` unless a causal validator later accepts it;
- counter-evidence and caveats are first-class support roles;
- official source statements can feed briefs and review packets as quoted evidence.

Outputs: `sourceClaimAuthority`, `truthStatus`, `publicationWordingGate`, `claimKind`,
`claimBasis`, `caveatCodes`.

### Source gaps and missing data

Absence is a feature only when the harness proves the search:

- source-scoped query/transcript evidence is required;
- missing-data support from ordinary OCR spans is rejected;
- source-gap rows state what source family was checked and what claim is blocked;
- source gaps can feed source-gap findings but never imply treatment absence unless the checked
  source family is authoritative for that treatment.

Outputs: `gapKind`, `checkedSourceFamily`, `searchTranscriptRefs`, `blocksClaims`,
`publicStatement`.

### Event identity and dedupe

Record construction should be deterministic by default:

- identity key uses document ID, route set, corridor/location, treatment family, status/date window,
  and source family;
- cross-page clusters are merged only when deterministic keys agree or a cited-LLM identity helper
  emits evidence-backed merge reasons that code validates;
- duplicate/corroborating sources are preserved as support, not collapsed away.

Outputs: `interventionIdentityKey`, `duplicateFingerprint`, `clusterId`, `mergeProofState`.

### Causal eligibility

Causal eligibility is a strict downstream gate:

- needs realized operational date, route/corridor scope, treatment family, source-state confidence,
  and non-process event classification;
- planned/proposed/source-only/context rows cannot enter causal treatment inventory;
- source-stated agency effect claims are evidence/caveats, not causal estimates.

Outputs: `causalAnchorEligible`, `causalBlockers`, `eventStudyWindowEligibility`.

## Vocab integration rules

The vocab layer remains additive:

1. Raw payloads are immutable.
2. Vocab maps project observed source labels to canonical keys.
3. `missing_projection = 0` means taxonomy coverage, not proof coverage.
4. `fieldSupportFound` must become a promotion gate for the field families that can publish or feed
   detectors.
5. `preserve_raw` and `unresolved` are valid machine outcomes.
6. Fallback suggestions from `rawText`/`displayLabel` stay diagnostic unless a resolver accepts them
   with explicit proof codes.

The first implementation should consume:

- `canonical-merge-full-authority-qv1-qv10-v1.json`;
- `vocab-surface-application-full-authority-qv1-qv10-manual-vocab-v1`;
- `vocab-final-inventory-qv1-qv10-manual-vocab-v1`;
- source crosswalk once implemented.

Do not start from qv8-qv10 materialized defaults.

## Promotion states

Feature promotion is separate from surface acceptance.

| State | Meaning | Allowed consumers |
| --- | --- | --- |
| `accepted_surface` | LLM output parsed and passed draft validation. | Research corpus only. |
| `normalized_candidate` | Vocab/projection produced canonical labels. | Diagnostics, review packets, resolver input. |
| `verified_feature` | Field-family validator proved source support. | Detector/brief evidence where eligibility allows. |
| `publishable_evidence` | Public wording and source authority gates pass. | Public timelines, route evidence cards. |
| `causal_eligible` | Date/status/route/treatment gates pass. | Causal treatment inventory candidates. |
| `source_gap_feature` | Absence/search proof passes. | Source-gap findings and Data Notes. |
| `quarantined` | Machine could not prove or safely downgrade. | No downstream consumers except diagnostics. |

## Implementation phases

### Phase 0: Canonical input closure

- Set qv1-qv10 full-authority merge as the only supported input for this proof layer.
- Refuse qv8-qv10-only materialized defaults except in explicitly named tail audits.
- Add a queue manifest gate before any merge/proof/projection command. The gate reads `queueRole`,
  source/window inventory, contract version, and supersession policy, then rejects repair subsets
  that are passed as if they were full-corpus inputs.
- Add or require source/document crosswalk before source-level receipts are computed.

Verification:

- canonical merge reports 6,713 clean canonical windows and 35 unresolved windows;
- source coverage audit can fold extracted/reviewed/promoted rows to `documentId`;
- proof builder refuses a qv8-tail input unless `--allow-tail-input` is set.
- fixture manifests prove a `repair_subset` queue cannot masquerade as `full_corpus`.

### Phase 1: Candidate extraction from accepted surfaces

- Build `tier2_feature_candidate_v1` rows from accepted surfaces and vocab projection rows.
- Preserve surface kind, raw field path, mapped vocab key, field support IDs, and target path.
- Emit candidates even when no proof exists, so gaps are measurable.

Verification:

- candidate count reconciles to vocab `fieldInstanceCount`;
- every candidate points to a canonical surface;
- every missing field-support case is counted by feature family and source path.

### Phase 2: Resolver modules

Implement small deterministic validators for each feature family listed above. Start with the
highest-value lanes:

1. route scope;
2. operational date/status;
3. treatment family;
4. metric claims;
5. source authority/publication wording;
6. source gaps;
7. table cells;
8. event identity/causal eligibility.

Verification:

- each resolver has fixtures for true positive, false positive, ambiguous, and downgrade cases;
- operational-date proof fixtures are reused as regression tests for the generic date/status
  resolver;
- metric validator rejects unsupported numeric values and project-metric authority;
- treatment validator rejects ACE/ABLE/TSP/stop-change family mismatches.

### Phase 3: Full-corpus proof ledger

- Run all resolvers against qv1-qv10 feature candidates.
- Emit `tier2_feature_proof_ledger_v1`.
- Produce machine-readable and Markdown reports split by source, surface kind, feature family,
  proof state, proof code, and downstream eligibility.

Verification:

- `publishableFieldWithoutProofCount = 0`;
- no detector/public/causal projection reads directly from `accepted_surface` rows;
- every quarantined field has a proof code, not just a null.

### Phase 4: Promotion compiler

- Build full-corpus reviewed records and source dispositions from verified features.
- A source receipt is either a promoted/verified record, source-gap feature, supporting-context-only
  disposition, or no-actionable-intervention disposition.
- Route treatment summaries and route timelines consume verified features, not curated subset
  defaults.

Verification:

- every extracted source has a machine receipt;
- every v2 intervention record has route/date/status/treatment/evidence proof refs where those
  fields exist;
- route treatment summary defaults move off the curated `gap-roadmap-docs` path only after the
  proof ledger passes.

### Phase 5: Data-product gates

- Register the proof ledger, full-corpus reviewed records, publishable interventions, and route
  treatment summary as tracked data products.
- Make product completeness distinguish `accepted`, `normalized`, `verified`, and `publishable`.
- Fail publication when a downstream product uses an unverified field family.

Verification:

- `audit data-product-completeness` no longer reports
  `tier2_structured_intervention_extraction_full_corpus` as partial;
- source coverage shows extracted → verified → receipt → publishable funnel with document-aware
  reconciliation;
- D1 verify passes after serving projection uses proof-backed rows.

### Phase 6: Gold and adversarial harness

Keep gold small and policy-oriented, not corpus-scale:

- one fixture pack per feature family;
- each fixture has source text, expected candidates, expected proof states, and expected blockers;
- include adversarial examples for planned language, process meetings, rail-only pages, route family
  ambiguity, unsupported metric values, ACE/ABLE token ambiguity, TSP source gaps, and table
  footnotes.
- include regression fixtures for the exact known bad taxonomy/data collapses:
  - generic `lane_width` or street-design dimensions must not become bus-speed or bus-priority
    treatment metrics;
  - taxi speed, all-vehicle speed, and generic average speed must not become bus speed unless the
    subject evidence says bus;
  - all-vehicle travel time and generic travel-time percent changes must not become bus travel time;
  - parking/loading/curb criticality must not become route treatment state without treatment
    evidence;
  - route title, project title, rawText, or displayLabel must not create a publishable kind/family
    by fallback;
  - source-stated performance effects must remain source claims unless a detector/method gate owns
    the metric.

Verification:

- proof ledger build cannot pass if fixture precision regressions occur;
- fixture recall is reported separately from full-corpus proof coverage;
- adding a policy/vocab rule requires a fixture before it can promote fields.

## End-to-end testing plan

The E2E plan should prove the harness is usable for detectors and production without asking anyone
to inspect the full corpus. It has three modes.

### Mode A: replay E2E

Replay captured source/window packets and captured tool responses through the new validator stack.
This is the default CI-safe path.

The replay sample should be stratified, not random-only:

| Slice | Why it exists |
| --- | --- |
| Clean intervention pages | Confirms common route/date/treatment extraction still promotes. |
| Metric-heavy pages | Confirms source-stated metrics stay quote-backed and do not become Studio metrics. |
| Table-heavy pages | Confirms table cells and footnotes are preserved or downgraded. |
| Route redesign pages | Confirms service changes do not become bus-priority treatment events by default. |
| Process/meeting/planning pages | Confirms non-operational milestones are downgraded. |
| Rail-only or non-bus pages | Confirms bus feature validators reject out-of-scope context. |
| ACE/ABLE/camera pages | Confirms camera enforcement is not confused with generic SBS. |
| TSP/source-gap pages | Confirms missing inventory evidence becomes source-gap, not negative proof. |
| Ambiguous route-family pages | Confirms branch/family ambiguity is not collapsed to one route. |
| No-actionable-intervention pages | Confirms source receipts can be machine dispositions, not records. |

Minimum replay set: 60 windows. Preferred set before full-corpus promotion: 120 windows. Keep the
fixture pack small enough to run in ordinary Bun tests, but broad enough to hit every feature family
and every downgrade/quarantine class.

Replay acceptance gates:

- 0 `publishableFieldWithoutProof`;
- 0 detector/public/causal rows sourced from `accepted_surface` without `verified_feature`;
- 100% of expected adversarial blockers fire;
- 100% of expected clean fixtures produce source receipts;
- every fixture has a proof summary by feature family;
- every downgrade/quarantine has a stable proof code.

### Mode B: live canary E2E

Run a bounded live canary with current model/provider settings after replay passes.

Live sample:

- 20 intervention/treatment windows;
- 10 metric/table windows;
- 10 negative/process/non-bus windows;
- 10 source-gap/TSP/ambiguous windows.

The live canary should exercise the validation-feedback loop:

1. build source/window requests with resolver handles;
2. run the LLM forced tool call;
3. parse and validate;
4. return repairable feedback for one or two rounds;
5. write final artifact, audit, feedback, and proof-preview artifacts;
6. compile the sample proof ledger;
7. build sample reviewed records and source receipts.

Live acceptance gates:

- provider/tool failures are recorded in self-heal lanes, not hidden;
- repairable validation issues decrease after feedback rounds;
- final promoted sample rows pass the same proof gates as replay;
- final unpromoted rows are downgraded/quarantined with proof codes;
- no manual row inspection is needed to understand why rows did or did not promote.

### Mode C: detector and production projection E2E

Use the replay or live sample ledger to drive downstream consumers.

Detector-readiness test:

- build detector evidence packets from only `verified_feature` rows;
- assert every evidence ref resolves to source/page/block/line/hash or table cell;
- assert metric rows with source-stated values carry `publicationWordingGate`;
- assert source-gap findings require `source_gap_feature`, not missing rows.

Route-treatment test:

- compile sample route treatment summaries from proof-backed treatments;
- assert route/date/status/treatment proof refs exist for every current/planned/implemented row;
- assert ambiguous or context-only rows do not produce `current_confirmed` treatment state;
- assert TSP source gaps do not become `not_found` or `implemented`.

Serving projection test:

- build sample public timeline/evidence-card rows;
- assert every public row has `publishable_evidence` or stricter state;
- assert every source link resolves to an artifact ref;
- assert D1/R2 projection schemas parse without local path leakage.

### Full-corpus dry proof

After the sample E2E passes, run a full-corpus dry proof ledger over qv1-qv10 with no LLM calls. This
answers:

- how many fields are already verified by existing support;
- how many need deterministic resolver implementation;
- how many should be permanently downgraded or quarantined;
- which source families produce machine receipts without records;
- which downstream products remain blocked.

This is the bridge from "the sample works" to "the full corpus can be completed by code."

## Human-input model

The user should decide policy, not inspect rows.

Useful human inputs:

- approve canonical treatment vocabulary and aliases;
- decide whether a class is publishable, detector-only, or research-only;
- approve gold/adversarial examples for each feature family;
- decide fallback policies for rawText/displayLabel suggestions;
- decide public wording for official source statements and source gaps.

Not useful human inputs:

- checking thousands of extracted rows;
- deciding individual route/date/treatment normalizations already handled by resolver rules;
- resolving repeated ambiguity one row at a time.

If the same manual question appears more than a handful of times, it should become a resolver rule,
vocab rule, downgrade rule, or permanent quarantine class.

## Definition of done

- qv1-qv10 is the canonical input; qv8-tail defaults are removed or explicitly guarded.
- Every feature field has a proof state and proof code.
- No public, detector, causal, or brief projection consumes unverified LLM fields.
- Full-corpus reviewed records and publishable intervention artifacts exist.
- Every extracted source has a machine receipt.
- Source-gap and absence claims require source-tool/search proof.
- Aggregate reports make all downgrades and quarantines visible without asking for row review.
- The smallest gold/adversarial suite runs in Bun and blocks known bad promotions.

## Smallest first slice

Implement a read-only proof-ledger prototype over existing artifacts:

1. Load qv1-qv10 full-authority canonical merge.
2. Load qv1-qv10 manual-vocab application.
3. Build feature candidates for route, date/status, treatment, metric, source statement, and source
   gap fields.
4. Attach existing field-support IDs where present.
5. Emit a proof summary that shows, by feature family, which fields are `verified`,
   `support_missing`, `resolver_missing`, `ambiguous`, or `quarantined`.

This does not need new extraction. It gives us the exact worklist for deterministic validators and
proves the corpus can be completed by code rather than manual review.

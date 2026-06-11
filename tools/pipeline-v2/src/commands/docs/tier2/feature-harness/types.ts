export const FEATURE_PROOF_LEDGER_ARTIFACT_KIND = "bp.tier2_feature_proof_ledger.v1" as const;
export const FEATURE_PROOF_LEDGER_SUMMARY_KIND = "bp.tier2_feature_proof_ledger_summary.v1" as const;

export type JsonRecord = Record<string, unknown>;

export type FeatureFamily =
  | "route_scope"
  | "operational_date_status"
  | "treatment"
  | "metric_claim"
  | "table_cell"
  | "source_statement"
  | "claim"
  | "source_gap"
  | "event_identity"
  | "timeline_event"
  | "cost_value"
  | "service_delivery_claim"
  | "ridership_demand_claim"
  | "geographic_context_claim"
  | "relation"
  | "causal_eligibility"
  | "taxonomy";

export type FeatureCandidateRole = "canonical_field" | "unresolved_field";

export type ProofState =
  | "verified"
  | "support_missing"
  | "resolver_missing"
  | "ambiguous"
  | "quarantined";

export type ValidationSeverity = "blocking" | "warning";

export type ValidationRetryOwner = "llm" | "runner" | "vocab_runner";

export type FeatureValidationErrorCode =
  | "canonical_resolver_unsafe_mapping"
  | "canonical_resolver_missing"
  | "cost_multiple_amounts"
  | "cost_not_monetary"
  | "evidence_field_path_invalid"
  | "evidence_handle_unknown"
  | "evidence_pointer_missing"
  | "evidence_quote_not_source_local"
  | "extraction_limit_exceeded"
  | "field_support_missing"
  | "metric_authority_missing"
  | "metric_authority_support_missing"
  | "metric_publication_gate_missing"
  | "metric_publication_gate_support_missing"
  | "metric_subject_missing"
  | "metric_unit_missing"
  | "metric_value_missing"
  | "metric_value_support_missing"
  | "preserve_raw_quarantined"
  | "relation_target_unknown"
  | "service_delivery_scope_unsupported"
  | "source_verifier_not_verified"
  | "source_gap_transcript_missing"
  | "tool_shape_invalid"
  | "unknown_category_key";

export type Tier2FeatureProofLedgerInputMode =
  | "strict_final_accepted"
  | "salvage_accepted_candidates";

export type FieldEvidence = {
  fieldSupportFound: boolean;
  supportIds: string[];
  evidencePointerIds: string[];
  verifierStates: string[];
  supportCompleteness: string[];
};

export type FeatureValidationError = {
  code: FeatureValidationErrorCode;
  severity: ValidationSeverity;
  retryOwner: ValidationRetryOwner;
  message: string;
  llmRetryInstruction: string;
  deterministicRunnerFields: string[];
};

export type MetricFeatureCompletenessSlot = {
  path: string | null;
  value: string | null;
  evidence: FieldEvidence;
  proofState: ProofState;
};

export type MetricFeatureCompleteness = {
  value: MetricFeatureCompletenessSlot;
  authority: MetricFeatureCompletenessSlot;
  publicationGate: MetricFeatureCompletenessSlot;
};

export type FeaturePromotionEligibility = {
  publicFeature: boolean;
  detectorFeature: boolean;
  causalFeature: boolean;
  briefFeature: boolean;
  blockedReasons: FeatureValidationErrorCode[];
};

export type FeatureProofCandidate = {
  candidateId: string;
  role: FeatureCandidateRole;
  featureFamily: FeatureFamily;
  proofState: ProofState;
  keyId: string;
  sourceFieldPath: string;
  targetPayloadPath: string;
  rawValue: string;
  canonicalLeafId: string | null;
  canonicalLeafLabel: string | null;
  coarseFamily: string | null;
  modifiers: Record<string, string[]>;
  decision: "mapped" | "preserve_raw" | "unresolved" | "missing_projection";
  source: {
    artifactPath: string;
    auditPath: string | null;
    windowId: string | null;
    runId: string | null;
    shardId: string | null;
    sourceId: string | null;
    pageNumbers: number[];
    surfaceId: string | null;
    surfaceKind: string;
    displayLabel: string | null;
    rawTextPreview: string | null;
  };
  evidence: FieldEvidence;
  metricCompleteness: MetricFeatureCompleteness | null;
  validationErrors: FeatureValidationError[];
  promotionEligibility: FeaturePromotionEligibility;
};

export type FeatureValidationRetryBatch = {
  code: FeatureValidationErrorCode;
  featureFamily: FeatureFamily;
  retryOwner: ValidationRetryOwner;
  count: number;
  exampleCandidateIds: string[];
  llmRetryInstruction: string;
};

export type FeatureProofLedgerSummary = {
  normalizedSurfaceCount: number;
  fieldCandidateCount: number;
  canonicalFieldCandidateCount: number;
  unresolvedFieldCandidateCount: number;
  verifiedFieldCount: number;
  blockedFieldCount: number;
  publishableFieldCount: number;
  publishableFieldWithoutProofCount: number;
  validationErrorCount: number;
  byFeatureFamily: Record<string, number>;
  byProofState: Record<string, number>;
  byKeyId: Record<string, number>;
  bySurfaceKind: Record<string, number>;
  validationErrorsByCode: Record<string, number>;
  blockedByFeatureFamily: Record<string, number>;
  publishableByFeatureFamily: Record<string, number>;
  sourcesWithBlockingErrors: number;
};

export type Tier2FeatureProofLedgerArtifact = {
  artifactKind: typeof FEATURE_PROOF_LEDGER_ARTIFACT_KIND;
  schemaVersion: 1;
  generatedAt: string;
  sourceCanonicalMergePath: string | null;
  sourceVocabApplicationPath: string;
  sourceFeatureExtractionPaths?: string[];
  sourceFeatureExtractionInputMode?: Tier2FeatureProofLedgerInputMode;
  sourceProofLedgerPath?: string;
  safetyPolicy: {
    llmRuntimeUse: "none";
    runnerOwnsVocabulary: true;
    runnerOwnsPromotionState: true;
    publishableRequiresSourceLocalProof: true;
    rawPayloadMutationAllowed: false;
  };
  validationPolicy: {
    publishableFieldWithoutProofAllowed: false;
    unresolvedCanonicalFieldAllowedInPublicFeatures: false;
    metricPublicationRequiresValueLevelProof: true;
    validationErrorsReturnedToLlmForRetry: true;
  };
  fieldOwnership: {
    llmMustSubmit: string[];
    deterministicRunnerFields: string[];
    vocabRunnerFields: string[];
  };
  summary: FeatureProofLedgerSummary;
  validationRetryBatches: FeatureValidationRetryBatch[];
  candidates: FeatureProofCandidate[];
};

export type BuildTier2FeatureProofLedgerArgs = {
  vocabApplicationPath: string;
  canonicalMergePath?: string;
  outputPath?: string;
  markdownPath?: string;
  summaryPath?: string;
  generatedAt?: string;
  maxSurfaces?: number;
};

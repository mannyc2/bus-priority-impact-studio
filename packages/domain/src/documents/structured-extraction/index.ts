import * as z from "zod";
import { registerProjectSchema } from "../../schema-registry.js";

export const DocumentSourceDateStateSchema = z.enum([
  "known",
  "unknown",
  "inferred_from_source_metadata",
]);
export type DocumentSourceDateState = z.output<typeof DocumentSourceDateStateSchema>;

export const DocumentModeSchema = z.enum([
  "implementation_report",
  "project_brochure",
  "board_metrics",
  "route_redesign_plan",
  "methodology",
  "press_release",
  "community_presentation",
  "source_dictionary",
  "other",
]);
export type DocumentMode = z.output<typeof DocumentModeSchema>;

export const DocumentPageRoleSchema = z.enum([
  "substantive",
  "table",
  "map",
  "methodology",
  "appendix",
  "title_or_boilerplate",
  "unclear",
]);
export type DocumentPageRole = z.output<typeof DocumentPageRoleSchema>;

export const StructuredEvidenceSpanRoleSchema = z.enum([
  "claim_support",
  "date_support",
  "route_support",
  "location_support",
  "treatment_support",
  "metric_support",
  "methodology_support",
  "caveat_support",
  "table_support",
]);
export type StructuredEvidenceSpanRole = z.output<typeof StructuredEvidenceSpanRoleSchema>;

export const StructuredEntityKindSchema = z.enum([
  "route",
  "street",
  "corridor",
  "borough",
  "stop",
  "program",
  "agency",
  "date",
]);
export type StructuredEntityKind = z.output<typeof StructuredEntityKindSchema>;

export const StructuredEntityRoleSchema = z.enum([
  "affected",
  "comparison",
  "context",
  "location",
  "unclear",
]);
export type StructuredEntityRole = z.output<typeof StructuredEntityRoleSchema>;

export const StructuredEntityRefTypeSchema = z.enum([
  "route_id",
  "street_id",
  "corridor_id",
  "program_id",
  "date",
]);
export type StructuredEntityRefType = z.output<typeof StructuredEntityRefTypeSchema>;

export const StructuredEntityMatchMethodSchema = z.enum([
  "exact_catalog",
  "alias_catalog",
  "spatial_join",
  "model_suggested",
]);
export type StructuredEntityMatchMethod = z.output<typeof StructuredEntityMatchMethodSchema>;

export const StructuredValidationStateSchema = z.enum([
  "unvalidated",
  "validated",
  "ambiguous",
  "rejected",
]);
export type StructuredValidationState = z.output<typeof StructuredValidationStateSchema>;

export const StructuredClaimKindSchema = z.enum([
  "official_fact",
  "official_metric_claim",
  "third_party_evaluation",
  "methodology",
  "caveat",
  "source_quality",
  "project_status",
  "recommendation",
  "review_question_seed",
]);
export type StructuredClaimKind = z.output<typeof StructuredClaimKindSchema>;

export const StructuredFactAuthoritySchema = z.enum([
  "agency_official",
  "agency_self_reported_metric",
  "independent_audit",
  "consultant_or_advocacy",
  "unknown",
]);
export type StructuredFactAuthority = z.output<typeof StructuredFactAuthoritySchema>;

export const StructuredMetricNameSchema = z.enum([
  "bus_speed",
  "travel_time",
  "ridership",
  "headway",
  "excess_wait",
  "collisions",
  "blocked_stop",
  "on_time_performance",
  "custom",
]);
export type StructuredMetricName = z.output<typeof StructuredMetricNameSchema>;

export const StructuredMetricDirectionSchema = z.enum([
  "increase",
  "decrease",
  "no_change",
  "mixed",
  "unclear",
]);
export type StructuredMetricDirection = z.output<typeof StructuredMetricDirectionSchema>;

export const StructuredMetricAuthoritySchema = z.enum([
  "document_claim_only",
  "official_customer_metric",
  "deterministic_project_metric",
  "third_party_estimate",
]);
export type StructuredMetricAuthority = z.output<typeof StructuredMetricAuthoritySchema>;

export const StructuredTableKindSchema = z.enum([
  "route_profile",
  "metric_summary",
  "implementation_schedule",
  "stop_change",
  "treatment_inventory",
  "methodology",
  "other",
]);
export type StructuredTableKind = z.output<typeof StructuredTableKindSchema>;

export const StructuredTableCompletenessSchema = z.enum([
  "complete_small_table",
  "contiguous_slice",
  "too_large_summarized",
]);
export type StructuredTableCompleteness = z.output<typeof StructuredTableCompletenessSchema>;

export const StructuredEventFamilySchema = z.enum([
  "busway",
  "bus_lane",
  "transit_signal_priority",
  "camera_enforcement",
  "select_bus_service",
  "stop_consolidation",
  "route_redesign",
  "service_change",
  "curb_management",
  "other",
]);
export type StructuredEventFamily = z.output<typeof StructuredEventFamilySchema>;

export const StructuredEventStatusSchema = z.enum([
  "proposed",
  "planned",
  "approved",
  "implemented",
  "historical_context",
  "unclear",
]);
export type StructuredEventStatus = z.output<typeof StructuredEventStatusSchema>;

export const StructuredQualityTierSchema = z.enum([
  "canonical_milestone_candidate",
  "implemented_treatment_component_candidate",
  "planned_or_proposed_candidate",
  "context_only",
  "needs_review",
]);
export type StructuredQualityTier = z.output<typeof StructuredQualityTierSchema>;

export const StructuredDatePrecisionSchema = z.enum(["day", "month", "year"]);
export type StructuredDatePrecision = z.output<typeof StructuredDatePrecisionSchema>;

export const StructuredDateRoleSchema = z.enum([
  "launch",
  "service_start",
  "implemented",
  "approved",
  "proposal_date",
  "report_date",
  "warning_period_start",
  "unknown",
]);
export type StructuredDateRole = z.output<typeof StructuredDateRoleSchema>;

export const StructuredRouteRoleSchema = z.enum(["affected", "comparison", "context", "unknown"]);
export type StructuredRouteRole = z.output<typeof StructuredRouteRoleSchema>;

export const StructuredTreatmentComponentTypeSchema = z.enum([
  "red_bus_lane",
  "busway_restriction",
  "tsp",
  "queue_jump",
  "all_door_boarding",
  "off_board_fare_collection",
  "camera_enforcement",
  "stop_change",
  "curb_rule_change",
  "signal_retiming",
  "other",
]);
export type StructuredTreatmentComponentType = z.output<
  typeof StructuredTreatmentComponentTypeSchema
>;

export const StructuredServiceChangeTypeSchema = z.enum([
  "route_added",
  "route_removed",
  "route_modified",
  "stop_added",
  "stop_removed",
  "frequency_change",
  "headway_change",
  "span_change",
  "terminus_change",
  "branch_change",
]);
export type StructuredServiceChangeType = z.output<typeof StructuredServiceChangeTypeSchema>;

export const StructuredContextSignalKindSchema = z.enum([
  "curb_friction",
  "enforcement_rule",
  "traffic_access_rule",
  "construction_or_permit",
  "street_design_constraint",
  "terminal_or_stop_constraint",
  "schedule_or_service_context",
  "data_quality_caveat",
  "methodology_caveat",
]);
export type StructuredContextSignalKind = z.output<typeof StructuredContextSignalKindSchema>;

export const StructuredReviewQuestionKindSchema = z.enum([
  "needs_route_validation",
  "needs_corridor_validation",
  "needs_implementation_date",
  "needs_metric_crosscheck",
  "needs_duplicate_resolution",
  "needs_followup_source",
  "possible_source_gap",
  "possible_detector_gold_label",
]);
export type StructuredReviewQuestionKind = z.output<typeof StructuredReviewQuestionKindSchema>;

export const StructuredPrioritySchema = z.enum(["high", "medium", "low"]);
export type StructuredPriority = z.output<typeof StructuredPrioritySchema>;

export const StructuredResearchUseTagSchema = z.enum([
  "detector_evidence",
  "detector_counter_evidence",
  "source_gap_seed",
  "causal_treatment_inventory",
  "event_study_window",
  "natural_experiment_context",
  "forecasting_context_feature",
  "event_family_response_drift",
  "public_timeline_candidate",
  "review_packet_context",
  "gold_label_seed",
]);
export type StructuredResearchUseTag = z.output<typeof StructuredResearchUseTagSchema>;

export const StructuredDocumentSourcePageRefSchema = z
  .object({
    sourceId: z.string().min(1),
    sourceTitle: z.string().min(1),
    publisher: z.string().min(1),
    sourceGroup: z.string().min(1),
    finalUrl: z.string().url().optional(),
    documentDate: z.string().min(1).optional(),
    documentDateState: DocumentSourceDateStateSchema,
    pageNumbers: z.array(z.number().int().positive()).min(1),
    pageArtifactKeys: z.array(z.string().min(1)).default([]),
    markdownHash: z.string().min(1),
    sourceContentHash: z.string().min(1).optional(),
  })
  .strict();
export type StructuredDocumentSourcePageRef = z.output<
  typeof StructuredDocumentSourcePageRefSchema
>;

export const StructuredDocumentPageProfileSchema = z
  .object({
    documentMode: DocumentModeSchema,
    pageRole: DocumentPageRoleSchema,
    containsInterventionEvidence: z.boolean(),
    containsMetricClaim: z.boolean(),
    containsTable: z.boolean(),
    containsMapOrFigure: z.boolean(),
    extractionShouldProceed: z.boolean(),
    skipReason: z.string().min(1).optional(),
  })
  .strict();
export type StructuredDocumentPageProfile = z.output<typeof StructuredDocumentPageProfileSchema>;

export const StructuredEvidenceSpanSchema = z
  .object({
    spanId: z.string().min(1),
    pageRefs: z.array(z.number().int().positive()).min(1),
    quote: z.string().min(1),
    quoteHash: z.string().min(1),
    spanRole: StructuredEvidenceSpanRoleSchema,
  })
  .strict();
export type StructuredEvidenceSpan = z.output<typeof StructuredEvidenceSpanSchema>;

export const StructuredEntityMentionSchema = z
  .object({
    mentionId: z.string().min(1),
    evidenceSpanIds: z.array(z.string().min(1)).default([]),
    rawText: z.string().min(1),
    entityKind: StructuredEntityKindSchema,
    rawRole: StructuredEntityRoleSchema,
    normalizedRef: z
      .object({
        refType: StructuredEntityRefTypeSchema,
        refId: z.string().min(1),
        matchMethod: StructuredEntityMatchMethodSchema,
        matchConfidence: z.enum(["high", "medium", "low"]),
      })
      .strict()
      .optional(),
    validationState: StructuredValidationStateSchema.default("unvalidated"),
  })
  .strict();
export type StructuredEntityMention = z.output<typeof StructuredEntityMentionSchema>;

export const StructuredMetricClaimSchema = z
  .object({
    metricName: StructuredMetricNameSchema,
    customMetricName: z.string().min(1).optional(),
    valueText: z.string().min(1),
    valueNumeric: z.number().optional(),
    unit: z.string().min(1).optional(),
    direction: StructuredMetricDirectionSchema.optional(),
    comparatorText: z.string().min(1).optional(),
    baselinePeriodText: z.string().min(1).optional(),
    comparisonPeriodText: z.string().min(1).optional(),
    metricAuthority: StructuredMetricAuthoritySchema,
  })
  .strict();
export type StructuredMetricClaim = z.output<typeof StructuredMetricClaimSchema>;

export const StructuredExtractedClaimSchema = z
  .object({
    claimId: z.string().min(1),
    evidenceSpanIds: z.array(z.string().min(1)).min(1),
    claimKind: StructuredClaimKindSchema,
    claimText: z.string().min(1),
    factAuthority: StructuredFactAuthoritySchema,
    metric: StructuredMetricClaimSchema.optional(),
    dateMentions: z.array(z.string().min(1)).default([]),
    entityMentionIds: z.array(z.string().min(1)).default([]),
    researchUseTags: z.array(StructuredResearchUseTagSchema).default([]),
    needsDeterministicMetric: z.boolean().default(false),
    caveatCodes: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type StructuredExtractedClaim = z.output<typeof StructuredExtractedClaimSchema>;

export const StructuredExtractedTableSchema = z
  .object({
    tableId: z.string().min(1),
    evidenceSpanIds: z.array(z.string().min(1)).min(1),
    title: z.string().min(1).optional(),
    tableKind: StructuredTableKindSchema,
    headers: z.array(z.string()).default([]),
    rows: z
      .array(
        z
          .object({
            rowIndex: z.number().int().nonnegative(),
            cells: z.array(z.string()),
            entityMentionIds: z.array(z.string().min(1)).default([]),
            extractedClaimIds: z.array(z.string().min(1)).default([]),
          })
          .strict(),
      )
      .default([]),
    footnotes: z.array(z.string()).default([]),
    tableCompleteness: StructuredTableCompletenessSchema,
  })
  .strict();
export type StructuredExtractedTable = z.output<typeof StructuredExtractedTableSchema>;

export const StructuredTreatmentComponentSchema = z
  .object({
    componentType: StructuredTreatmentComponentTypeSchema,
    status: StructuredEventStatusSchema,
    description: z.string().min(1),
    extentRaw: z.string().min(1).optional(),
    evidenceSpanIds: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type StructuredTreatmentComponent = z.output<typeof StructuredTreatmentComponentSchema>;

const StructuredRouteRoleRefSchema = z
  .object({
    mentionId: z.string().min(1),
    routeId: z.string().min(1).optional(),
    role: StructuredRouteRoleSchema,
  })
  .strict();

export const StructuredInterventionEventCandidateSchema = z
  .object({
    eventId: z.string().min(1),
    canonicalName: z.string().min(1).optional(),
    eventFamily: StructuredEventFamilySchema,
    eventSubtype: z.string().min(1).optional(),
    status: StructuredEventStatusSchema,
    qualityTier: StructuredQualityTierSchema,
    date: z.string().min(1).optional(),
    datePrecision: StructuredDatePrecisionSchema.optional(),
    dateRole: StructuredDateRoleSchema,
    routeRoles: z.array(StructuredRouteRoleRefSchema).default([]),
    location: z
      .object({
        corridorRaw: z.string().min(1).optional(),
        fromRaw: z.string().min(1).optional(),
        toRaw: z.string().min(1).optional(),
        boroughRaw: z.string().min(1).optional(),
        normalizedCorridorRef: z.string().min(1).optional(),
      })
      .strict(),
    components: z.array(StructuredTreatmentComponentSchema).default([]),
    evidenceSpanIds: z.array(z.string().min(1)).min(1),
    claimIds: z.array(z.string().min(1)).default([]),
    researchUseTags: z.array(StructuredResearchUseTagSchema).default([]),
    duplicateFingerprint: z.string().min(1),
  })
  .strict();
export type StructuredInterventionEventCandidate = z.output<
  typeof StructuredInterventionEventCandidateSchema
>;

export const StructuredServiceChangeCandidateSchema = z
  .object({
    serviceChangeId: z.string().min(1),
    changeType: StructuredServiceChangeTypeSchema,
    status: StructuredEventStatusSchema,
    routeRoles: z.array(StructuredRouteRoleRefSchema).default([]),
    date: z.string().min(1).optional(),
    datePrecision: StructuredDatePrecisionSchema.optional(),
    evidenceSpanIds: z.array(z.string().min(1)).min(1),
    sourceDocumentMode: DocumentModeSchema,
  })
  .strict();
export type StructuredServiceChangeCandidate = z.output<
  typeof StructuredServiceChangeCandidateSchema
>;

export const StructuredContextSignalCandidateSchema = z
  .object({
    signalId: z.string().min(1),
    signalKind: StructuredContextSignalKindSchema,
    regimeLabels: z.array(z.string().min(1)).default([]),
    locationMentionIds: z.array(z.string().min(1)).default([]),
    evidenceSpanIds: z.array(z.string().min(1)).min(1),
    researchUseTags: z.array(StructuredResearchUseTagSchema).default([]),
  })
  .strict();
export type StructuredContextSignalCandidate = z.output<
  typeof StructuredContextSignalCandidateSchema
>;

export const StructuredReviewQuestionCandidateSchema = z
  .object({
    questionId: z.string().min(1),
    questionKind: StructuredReviewQuestionKindSchema,
    question: z.string().min(1),
    evidenceSpanIds: z.array(z.string().min(1)).default([]),
    priority: StructuredPrioritySchema,
  })
  .strict();
export type StructuredReviewQuestionCandidate = z.output<
  typeof StructuredReviewQuestionCandidateSchema
>;

export const StructuredExtractionAuditSchema = z
  .object({
    promptVersion: z.string().min(1),
    modelId: z.string().min(1),
    toolSchemaVersion: z.string().min(1),
    extractedAt: z.string().min(1),
    pageWindowId: z.string().min(1),
    candidateCounts: z.record(z.string(), z.number().int().nonnegative()).default({}),
    skippedReasons: z.array(z.string().min(1)).default([]),
    modelNotes: z.string().default(""),
  })
  .strict();
export type StructuredExtractionAudit = z.output<typeof StructuredExtractionAuditSchema>;

export const StructuredDocumentExtractionToolResponseSchema = registerProjectSchema(
  z
    .object({
      source: StructuredDocumentSourcePageRefSchema,
      pageProfile: StructuredDocumentPageProfileSchema,
      evidenceSpans: z.array(StructuredEvidenceSpanSchema).default([]),
      entityMentions: z.array(StructuredEntityMentionSchema).default([]),
      claims: z.array(StructuredExtractedClaimSchema).default([]),
      tables: z.array(StructuredExtractedTableSchema).default([]),
      interventionEvents: z.array(StructuredInterventionEventCandidateSchema).default([]),
      serviceChanges: z.array(StructuredServiceChangeCandidateSchema).default([]),
      contextSignals: z.array(StructuredContextSignalCandidateSchema).default([]),
      reviewQuestions: z.array(StructuredReviewQuestionCandidateSchema).default([]),
      extractionAudit: StructuredExtractionAuditSchema,
    })
    .strict()
    .readonly(),
  {
    id: "bp.structured_document_extraction_tool_response.v1",
    title: "Structured Document Extraction Tool Response",
    description:
      "Forced-tool output for one OCR Markdown page or page window before deterministic validation and synthesis.",
    stability: "draft",
  },
);
export type StructuredDocumentExtractionToolResponse = z.output<
  typeof StructuredDocumentExtractionToolResponseSchema
>;

export const StructuredExtractionValidationIssueSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    path: z.string().min(1),
    severity: z.enum(["error", "warning"]),
  })
  .strict();
export type StructuredExtractionValidationIssue = z.output<
  typeof StructuredExtractionValidationIssueSchema
>;

export const StructuredDocumentExtractionSchema = registerProjectSchema(
  StructuredDocumentExtractionToolResponseSchema.unwrap()
    .extend({
      extractionId: z.string().min(1),
      validationState: z.enum(["planned", "extracted", "failed", "reused"]),
      validationIssues: z.array(StructuredExtractionValidationIssueSchema).default([]),
    })
    .strict()
    .readonly(),
  {
    id: "bp.structured_document_extraction.v1",
    title: "Structured Document Extraction",
    description:
      "Persisted page/window structured document extraction with deterministic validation state.",
    stability: "draft",
  },
);
export type StructuredDocumentExtraction = z.output<typeof StructuredDocumentExtractionSchema>;

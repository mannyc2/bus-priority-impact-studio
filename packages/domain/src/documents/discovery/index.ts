import * as z from "zod";
import { registerProjectSchema } from "../../schema-registry.js";

export const DocumentDiscoveryValidationStateSchema = z.enum([
  "unvalidated",
  "validated",
  "needs_review",
  "rejected",
]);
export type DocumentDiscoveryValidationState = z.output<
  typeof DocumentDiscoveryValidationStateSchema
>;

export const DocumentDiscoveryExtractionStateSchema = z.enum(["extracted", "reused"]);
export type DocumentDiscoveryExtractionState = z.output<
  typeof DocumentDiscoveryExtractionStateSchema
>;

export const DocumentDiscoveryConfidenceSchema = z.enum(["high", "medium", "low", "unknown"]);
export type DocumentDiscoveryConfidence = z.output<typeof DocumentDiscoveryConfidenceSchema>;

export const DocumentDiscoveryEntityKindHintSchema = z.enum([
  "bus_route",
  "transit_line",
  "rail_service",
  "street",
  "corridor",
  "intersection",
  "stop",
  "station",
  "borough",
  "neighborhood",
  "community_board",
  "agency",
  "program",
  "date",
  "time_period",
  "vehicle_class",
  "road_user_group",
  "design_element",
  "treatment",
  "metric_subject",
  "other",
  "unknown",
]);
export type DocumentDiscoveryEntityKindHint = z.output<
  typeof DocumentDiscoveryEntityKindHintSchema
>;

export const DocumentDiscoveryMetricValueKindSchema = z.enum([
  "absolute",
  "percent",
  "rate",
  "rank",
  "range",
  "index",
  "duration",
  "currency",
  "textual",
  "unknown",
]);
export type DocumentDiscoveryMetricValueKind = z.output<
  typeof DocumentDiscoveryMetricValueKindSchema
>;

export const DocumentDiscoverySourceRefSchema = z
  .object({
    sourceId: z.string().min(1),
    sourceTitle: z.string().min(1),
    publisher: z.string().min(1),
    sourceGroup: z.string().min(1),
    finalUrl: z.string().url().optional(),
    documentDate: z.string().min(1).optional(),
    documentDateState: z
      .enum(["known", "unknown", "inferred_from_source_metadata"])
      .default("unknown"),
    pageNumbers: z.array(z.number().int().positive()).min(1),
    pageArtifactKeys: z.array(z.string().min(1)).default([]),
    markdownHash: z.string().min(1),
    blockIndexHash: z.string().min(1),
    sourceContentHash: z.string().min(1).optional(),
  })
  .strict();
export type DocumentDiscoverySourceRef = z.output<typeof DocumentDiscoverySourceRefSchema>;

export const DocumentDiscoveryEvidenceRefSchema = z
  .object({
    blockId: z.string().regex(/^B\d{4}$/),
    pageNumber: z.number().int().positive(),
    lineStart: z.number().int().positive(),
    lineEnd: z.number().int().positive(),
    blockHash: z.string().min(1).optional(),
    roleRaw: z.string().min(1).optional(),
    snippet: z.string().min(1).max(400).optional(),
  })
  .strict();
export type DocumentDiscoveryEvidenceRef = z.output<typeof DocumentDiscoveryEvidenceRefSchema>;

export const DocumentDiscoveryPageProfileSchema = z
  .object({
    documentModeRaw: z.string().min(1).optional(),
    pageRolesRaw: z.array(z.string().min(1)).default([]),
    contentTypesRaw: z.array(z.string().min(1)).default([]),
    discoveryShouldProceed: z.boolean(),
    skipReason: z.string().min(1).optional(),
    summary: z.string().min(1).optional(),
  })
  .strict();
export type DocumentDiscoveryPageProfile = z.output<typeof DocumentDiscoveryPageProfileSchema>;

const attributesSchema = z.record(z.string(), z.unknown()).default({});
const evidenceRefsSchema = z.array(DocumentDiscoveryEvidenceRefSchema).min(1);

export const DocumentDiscoveryEntityCandidateSchema = z
  .object({
    entityId: z.string().min(1),
    rawText: z.string().min(1),
    rawKind: z.string().min(1),
    kindHint: DocumentDiscoveryEntityKindHintSchema.optional(),
    modeHintRaw: z.string().min(1).optional(),
    roleRaw: z.string().min(1).optional(),
    normalizedRefHint: z
      .object({
        refTypeRaw: z.string().min(1),
        refIdRaw: z.string().min(1),
        confidence: DocumentDiscoveryConfidenceSchema.default("unknown"),
      })
      .strict()
      .optional(),
    evidenceRefs: evidenceRefsSchema,
    attributes: attributesSchema,
  })
  .strict();
export type DocumentDiscoveryEntityCandidate = z.output<
  typeof DocumentDiscoveryEntityCandidateSchema
>;

export const DocumentDiscoveryMetricCandidateSchema = z
  .object({
    metricId: z.string().min(1),
    labelRaw: z.string().min(1),
    valueRaw: z.string().min(1).optional(),
    valueNumeric: z.number().optional(),
    unitRaw: z.string().min(1).optional(),
    valueKind: DocumentDiscoveryMetricValueKindSchema.default("unknown"),
    directionRaw: z.string().min(1).optional(),
    subjectRaw: z.string().min(1).optional(),
    geographyRaw: z.string().min(1).optional(),
    periodRaw: z.string().min(1).optional(),
    comparisonRaw: z.string().min(1).optional(),
    authorityRaw: z.string().min(1).optional(),
    evidenceRefs: evidenceRefsSchema,
    attributes: attributesSchema,
  })
  .strict();
export type DocumentDiscoveryMetricCandidate = z.output<
  typeof DocumentDiscoveryMetricCandidateSchema
>;

export const DocumentDiscoveryEventCandidateSchema = z
  .object({
    eventId: z.string().min(1),
    nameRaw: z.string().min(1).optional(),
    familyRaw: z.string().min(1),
    subtypeRaw: z.string().min(1).optional(),
    statusRaw: z.string().min(1).optional(),
    dateRaw: z.string().min(1).optional(),
    locationRaw: z.string().min(1).optional(),
    treatmentRaw: z.string().min(1).optional(),
    affectedEntitiesRaw: z.array(z.string().min(1)).default([]),
    entityCandidateIds: z.array(z.string().min(1)).default([]),
    evidenceRefs: evidenceRefsSchema,
    attributes: attributesSchema,
  })
  .strict();
export type DocumentDiscoveryEventCandidate = z.output<
  typeof DocumentDiscoveryEventCandidateSchema
>;

export const DocumentDiscoveryTableCandidateSchema = z
  .object({
    tableId: z.string().min(1),
    titleRaw: z.string().min(1).optional(),
    tableKindRaw: z.string().min(1),
    headerTextsRaw: z.array(z.string()).default([]),
    rowCount: z.number().int().nonnegative().optional(),
    columnCount: z.number().int().nonnegative().optional(),
    semanticNotes: z.string().min(1).optional(),
    importantEntityCandidateIds: z.array(z.string().min(1)).default([]),
    importantMetricCandidateIds: z.array(z.string().min(1)).default([]),
    evidenceRefs: evidenceRefsSchema,
    attributes: attributesSchema,
  })
  .strict();
export type DocumentDiscoveryTableCandidate = z.output<
  typeof DocumentDiscoveryTableCandidateSchema
>;

export const DocumentDiscoveryClaimCandidateSchema = z
  .object({
    claimId: z.string().min(1),
    claimText: z.string().min(1),
    claimKindRaw: z.string().min(1),
    authorityRaw: z.string().min(1).optional(),
    entityCandidateIds: z.array(z.string().min(1)).default([]),
    metricCandidateIds: z.array(z.string().min(1)).default([]),
    eventCandidateIds: z.array(z.string().min(1)).default([]),
    researchUseTagsRaw: z.array(z.string().min(1)).default([]),
    evidenceRefs: evidenceRefsSchema,
    attributes: attributesSchema,
  })
  .strict();
export type DocumentDiscoveryClaimCandidate = z.output<
  typeof DocumentDiscoveryClaimCandidateSchema
>;

export const DocumentDiscoveryContextSignalCandidateSchema = z
  .object({
    contextId: z.string().min(1),
    signalText: z.string().min(1),
    contextKindRaw: z.string().min(1),
    geographyRaw: z.string().min(1).optional(),
    periodRaw: z.string().min(1).optional(),
    evidenceRefs: evidenceRefsSchema,
    attributes: attributesSchema,
  })
  .strict();
export type DocumentDiscoveryContextSignalCandidate = z.output<
  typeof DocumentDiscoveryContextSignalCandidateSchema
>;

export const DocumentDiscoveryReviewQuestionCandidateSchema = z
  .object({
    questionId: z.string().min(1),
    question: z.string().min(1),
    questionKindRaw: z.string().min(1),
    priorityRaw: z.string().min(1).optional(),
    evidenceRefs: z.array(DocumentDiscoveryEvidenceRefSchema).default([]),
    attributes: attributesSchema,
  })
  .strict();
export type DocumentDiscoveryReviewQuestionCandidate = z.output<
  typeof DocumentDiscoveryReviewQuestionCandidateSchema
>;

export const DocumentDiscoveryExtractionAuditSchema = z
  .object({
    promptVersion: z.string().min(1),
    toolSchemaVersion: z.string().min(1),
    modelId: z.string().min(1).optional(),
    extractedAt: z.string().min(1),
    pageWindowId: z.string().min(1),
    candidateCounts: z.record(z.string(), z.number().int().nonnegative()).default({}),
    modelNotes: z.string().optional(),
  })
  .strict();
export type DocumentDiscoveryExtractionAudit = z.output<
  typeof DocumentDiscoveryExtractionAuditSchema
>;

export const DocumentDiscoveryValidationIssueSchema = z
  .object({
    severity: z.enum(["error", "warning"]),
    code: z.string().min(1),
    path: z.string().min(1),
    message: z.string().min(1),
  })
  .strict();
export type DocumentDiscoveryValidationIssue = z.output<
  typeof DocumentDiscoveryValidationIssueSchema
>;

const DocumentDiscoveryExtractionToolResponseObjectSchema = z
  .object({
    source: DocumentDiscoverySourceRefSchema,
    pageProfile: DocumentDiscoveryPageProfileSchema,
    entities: z.array(DocumentDiscoveryEntityCandidateSchema).default([]),
    metrics: z.array(DocumentDiscoveryMetricCandidateSchema).default([]),
    events: z.array(DocumentDiscoveryEventCandidateSchema).default([]),
    tables: z.array(DocumentDiscoveryTableCandidateSchema).default([]),
    claims: z.array(DocumentDiscoveryClaimCandidateSchema).default([]),
    contextSignals: z.array(DocumentDiscoveryContextSignalCandidateSchema).default([]),
    reviewQuestions: z.array(DocumentDiscoveryReviewQuestionCandidateSchema).default([]),
    extractionAudit: DocumentDiscoveryExtractionAuditSchema,
  })
  .strict();

export const DocumentDiscoveryExtractionToolResponseSchema = registerProjectSchema(
  DocumentDiscoveryExtractionToolResponseObjectSchema.readonly(),
  {
    id: "bp.document_discovery_extraction_tool_response.v1",
    title: "Document Discovery Extraction Tool Response",
    description:
      "Raw, block-ref-grounded Tier 2 document discovery candidates before ontology normalization.",
    stability: "draft",
  },
);
export type DocumentDiscoveryExtractionToolResponse = z.output<
  typeof DocumentDiscoveryExtractionToolResponseSchema
>;

export const DocumentDiscoveryExtractionSchema = registerProjectSchema(
  DocumentDiscoveryExtractionToolResponseObjectSchema.extend({
    extractionId: z.string().min(1),
    validationState: DocumentDiscoveryExtractionStateSchema,
    validationIssues: z.array(DocumentDiscoveryValidationIssueSchema).default([]),
  })
    .strict()
    .readonly(),
  {
    id: "bp.document_discovery_extraction.v1",
    title: "Document Discovery Extraction",
    description:
      "Persisted Tier 2 document discovery candidates with deterministic validation issues.",
    stability: "draft",
  },
);
export type DocumentDiscoveryExtraction = z.output<typeof DocumentDiscoveryExtractionSchema>;

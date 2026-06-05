import * as z from "zod";
import { registerProjectSchema } from "./schema-registry.js";

export const DocumentDerivedSurfaceKindSchema = z.enum([
  "entity",
  "metric_claim",
  "event",
  "table",
  "claim",
  "context_signal",
  "review_question",
  "relation",
]);
export type DocumentDerivedSurfaceKind = z.output<
  typeof DocumentDerivedSurfaceKindSchema
>;

export const DocumentDerivedLifecycleStateSchema = z.enum([
  "candidate",
  "normalized",
  "reviewed",
  "promoted",
  "rejected",
  "suppressed",
  "needs_review",
]);
export type DocumentDerivedLifecycleState = z.output<
  typeof DocumentDerivedLifecycleStateSchema
>;

export const DocumentDerivedValidationStateSchema = z.enum([
  "unvalidated",
  "valid",
  "needs_review",
  "rejected",
]);
export type DocumentDerivedValidationState = z.output<
  typeof DocumentDerivedValidationStateSchema
>;

export const DocumentDerivedPromotionStateSchema = z.enum([
  "research_only",
  "eligible_for_review_packet",
  "eligible_for_public_projection",
  "public_projection",
  "suppressed",
]);
export type DocumentDerivedPromotionState = z.output<
  typeof DocumentDerivedPromotionStateSchema
>;

export const DocumentDerivedReviewStateSchema = z.enum([
  "unreviewed",
  "needs_human_review",
  "reviewed_confirmed",
  "reviewed_rejected",
  "waived",
]);
export type DocumentDerivedReviewState = z.output<
  typeof DocumentDerivedReviewStateSchema
>;

export const DocumentDerivedTruthStatusSchema = z.enum([
  "document_claim_only",
  "official_source_claim",
  "source_metadata",
  "deterministic_project_metric",
  "reviewer_confirmed",
  "disputed",
  "unknown",
]);
export type DocumentDerivedTruthStatus = z.output<
  typeof DocumentDerivedTruthStatusSchema
>;

export const DocumentDerivedMetricAuthoritySchema = z.enum([
  "document_claim_only",
  "official_customer_metric",
  "official_agency_metric",
  "independent_audit",
  "consultant_or_advocacy",
  "deterministic_project_metric",
  "unknown",
]);
export type DocumentDerivedMetricAuthority = z.output<
  typeof DocumentDerivedMetricAuthoritySchema
>;

export const DocumentDerivedEntityModeSchema = z.enum([
  "bus_route",
  "bus_stop",
  "subway_line",
  "path_line",
  "lirr_line",
  "nj_transit_line",
  "amtrak_service",
  "rail_station",
  "street",
  "corridor",
  "intersection",
  "borough",
  "neighborhood",
  "community_board",
  "agency",
  "program",
  "treatment",
  "metric_subject",
  "date_or_period",
  "other",
  "unknown",
]);
export type DocumentDerivedEntityMode = z.output<
  typeof DocumentDerivedEntityModeSchema
>;

export const DocumentDerivedEventStatusSchema = z.enum([
  "proposed",
  "planned",
  "approved",
  "implemented",
  "historical_context",
  "unclear",
]);
export type DocumentDerivedEventStatus = z.output<
  typeof DocumentDerivedEventStatusSchema
>;

export const DocumentDerivedDatePrecisionSchema = z.enum([
  "day",
  "month",
  "year",
  "range",
  "unknown",
]);
export type DocumentDerivedDatePrecision = z.output<
  typeof DocumentDerivedDatePrecisionSchema
>;

export const DocumentDerivedPrioritySchema = z.enum(["high", "medium", "low", "unknown"]);
export type DocumentDerivedPriority = z.output<typeof DocumentDerivedPrioritySchema>;

export const DocumentDerivedEvidenceRefSchema = z
  .object({
    sourceId: z.string().min(1),
    pageNumber: z.number().int().positive(),
    blockId: z.string().regex(/^B\d{4}$/),
    lineStart: z.number().int().positive(),
    lineEnd: z.number().int().positive(),
    blockHash: z.string().min(1).optional(),
    roleRaw: z.string().min(1).optional(),
    snippet: z.string().min(1).max(400).optional(),
  })
  .strict();
export type DocumentDerivedEvidenceRef = z.output<
  typeof DocumentDerivedEvidenceRefSchema
>;

export const DocumentDerivedSourceCandidateRefSchema = z
  .object({
    rowId: z.string().min(1),
    candidateType: z.string().min(1),
    candidateId: z.string().min(1),
    extractionId: z.string().min(1).optional(),
    inputLabel: z.string().min(1).optional(),
  })
  .strict();
export type DocumentDerivedSourceCandidateRef = z.output<
  typeof DocumentDerivedSourceCandidateRefSchema
>;

const rawCandidateSchema = z.record(z.string(), z.unknown()).default({});
const attributesSchema = z.record(z.string(), z.unknown()).default({});

const DocumentDerivedSurfaceBaseSchema = z
  .object({
    schemaVersion: z.literal(1),
    surfaceId: z.string().min(1),
    surfaceKind: DocumentDerivedSurfaceKindSchema,
    sourceId: z.string().min(1),
    sourceTitle: z.string().min(1),
    sourceGroup: z.string().min(1),
    publisher: z.string().min(1).optional(),
    pageNumbers: z.array(z.number().int().positive()).min(1),
    evidenceRefs: z.array(DocumentDerivedEvidenceRefSchema).default([]),
    displayLabel: z.string().min(1),
    canonicalFamily: z.string().min(1),
    rawFamily: z.string().min(1),
    clusterKey: z.string().min(1).optional(),
    lifecycleState: DocumentDerivedLifecycleStateSchema,
    validationState: DocumentDerivedValidationStateSchema,
    promotionState: DocumentDerivedPromotionStateSchema,
    reviewState: DocumentDerivedReviewStateSchema,
    truthStatus: DocumentDerivedTruthStatusSchema,
    sourceCandidate: DocumentDerivedSourceCandidateRefSchema,
    inputSnapshotHash: z.string().min(1),
    extractionVersion: z.string().min(1),
    normalizationVersion: z.string().min(1),
    rawCandidate: rawCandidateSchema,
    attributes: attributesSchema,
  })
  .strict();

export const DocumentDerivedEntitySurfaceSchema = DocumentDerivedSurfaceBaseSchema.extend({
  surfaceKind: z.literal("entity"),
  rawText: z.string().min(1),
  rawKind: z.string().min(1).optional(),
  entityMode: DocumentDerivedEntityModeSchema,
  roleRaw: z.string().min(1).optional(),
  normalizedRef: z
    .object({
      refType: z.string().min(1),
      refId: z.string().min(1),
      confidence: z.enum(["high", "medium", "low", "unknown"]).default("unknown"),
    })
    .strict()
    .optional(),
}).strict();
export type DocumentDerivedEntitySurface = z.output<
  typeof DocumentDerivedEntitySurfaceSchema
>;

export const DocumentDerivedMetricClaimSurfaceSchema = DocumentDerivedSurfaceBaseSchema.extend({
  surfaceKind: z.literal("metric_claim"),
  metricLabel: z.string().min(1),
  metricAuthority: DocumentDerivedMetricAuthoritySchema,
  valueText: z.string().min(1).optional(),
  valueNumeric: z.number().optional(),
  unit: z.string().min(1).optional(),
  valueKind: z.string().min(1).optional(),
  directionText: z.string().min(1).optional(),
  subjectText: z.string().min(1).optional(),
  geographyText: z.string().min(1).optional(),
  periodText: z.string().min(1).optional(),
  comparisonText: z.string().min(1).optional(),
  needsDeterministicMetric: z.boolean().default(true),
}).strict();
export type DocumentDerivedMetricClaimSurface = z.output<
  typeof DocumentDerivedMetricClaimSurfaceSchema
>;

export const DocumentDerivedEventSurfaceSchema = DocumentDerivedSurfaceBaseSchema.extend({
  surfaceKind: z.literal("event"),
  eventName: z.string().min(1).optional(),
  eventFamily: z.string().min(1),
  eventSubtype: z.string().min(1).optional(),
  eventStatus: DocumentDerivedEventStatusSchema,
  dateText: z.string().min(1).optional(),
  datePrecision: DocumentDerivedDatePrecisionSchema,
  locationText: z.string().min(1).optional(),
  treatmentText: z.string().min(1).optional(),
  affectedEntitiesRaw: z.array(z.string().min(1)).default([]),
  linkedEntityCandidateIds: z.array(z.string().min(1)).default([]),
}).strict();
export type DocumentDerivedEventSurface = z.output<
  typeof DocumentDerivedEventSurfaceSchema
>;

export const DocumentDerivedTableSurfaceSchema = DocumentDerivedSurfaceBaseSchema.extend({
  surfaceKind: z.literal("table"),
  tableTitle: z.string().min(1).optional(),
  tableKind: z.string().min(1),
  headers: z.array(z.string()).default([]),
  rowCount: z.number().int().nonnegative().optional(),
  columnCount: z.number().int().nonnegative().optional(),
  semanticNotes: z.string().min(1).optional(),
  importantEntityCandidateIds: z.array(z.string().min(1)).default([]),
  importantMetricCandidateIds: z.array(z.string().min(1)).default([]),
}).strict();
export type DocumentDerivedTableSurface = z.output<
  typeof DocumentDerivedTableSurfaceSchema
>;

export const DocumentDerivedClaimSurfaceSchema = DocumentDerivedSurfaceBaseSchema.extend({
  surfaceKind: z.literal("claim"),
  claimText: z.string().min(1),
  claimKind: z.string().min(1),
  authorityText: z.string().min(1).optional(),
  causalClaimFlag: z.boolean(),
  linkedEntityCandidateIds: z.array(z.string().min(1)).default([]),
  linkedMetricCandidateIds: z.array(z.string().min(1)).default([]),
  linkedEventCandidateIds: z.array(z.string().min(1)).default([]),
  researchUseTagsRaw: z.array(z.string().min(1)).default([]),
}).strict();
export type DocumentDerivedClaimSurface = z.output<
  typeof DocumentDerivedClaimSurfaceSchema
>;

export const DocumentDerivedContextSignalSurfaceSchema = DocumentDerivedSurfaceBaseSchema.extend({
  surfaceKind: z.literal("context_signal"),
  signalText: z.string().min(1),
  contextKind: z.string().min(1),
  geographyText: z.string().min(1).optional(),
  periodText: z.string().min(1).optional(),
}).strict();
export type DocumentDerivedContextSignalSurface = z.output<
  typeof DocumentDerivedContextSignalSurfaceSchema
>;

export const DocumentDerivedReviewQuestionSurfaceSchema =
  DocumentDerivedSurfaceBaseSchema.extend({
    surfaceKind: z.literal("review_question"),
    question: z.string().min(1),
    questionKind: z.string().min(1),
    priority: DocumentDerivedPrioritySchema,
  }).strict();
export type DocumentDerivedReviewQuestionSurface = z.output<
  typeof DocumentDerivedReviewQuestionSurfaceSchema
>;

export const DocumentDerivedRelationSurfaceSchema = DocumentDerivedSurfaceBaseSchema.extend({
  surfaceKind: z.literal("relation"),
  relationKind: z.string().min(1),
  fromSurfaceId: z.string().min(1),
  toSurfaceId: z.string().min(1),
  confidence: z.enum(["high", "medium", "low", "unknown"]).default("unknown"),
}).strict();
export type DocumentDerivedRelationSurface = z.output<
  typeof DocumentDerivedRelationSurfaceSchema
>;

export const DocumentDerivedSurfaceRowSchema = z.discriminatedUnion("surfaceKind", [
  DocumentDerivedEntitySurfaceSchema,
  DocumentDerivedMetricClaimSurfaceSchema,
  DocumentDerivedEventSurfaceSchema,
  DocumentDerivedTableSurfaceSchema,
  DocumentDerivedClaimSurfaceSchema,
  DocumentDerivedContextSignalSurfaceSchema,
  DocumentDerivedReviewQuestionSurfaceSchema,
  DocumentDerivedRelationSurfaceSchema,
]);
export type DocumentDerivedSurfaceRow = z.output<
  typeof DocumentDerivedSurfaceRowSchema
>;

export const DocumentDerivedSurfaceFileSchema = z
  .object({
    surfaceKind: DocumentDerivedSurfaceKindSchema,
    path: z.string().min(1),
    rowCount: z.number().int().nonnegative(),
    schemaId: z.string().min(1),
  })
  .strict();
export type DocumentDerivedSurfaceFile = z.output<
  typeof DocumentDerivedSurfaceFileSchema
>;

export const DocumentDerivedSurfacesManifestSchema = registerProjectSchema(
  z
    .object({
      schemaVersion: z.literal(1),
      artifactKind: z.literal("bp.document_derived_surfaces.v1"),
      generatedAt: z.string().min(1),
      runId: z.string().min(1).optional(),
      sourceNormalizedCandidatesPath: z.string().min(1),
      sourceWorkbenchPath: z.string().min(1).optional(),
      outputDir: z.string().min(1),
      summary: z
        .object({
          inputRows: z.number().int().nonnegative(),
          sourceCount: z.number().int().nonnegative(),
          evidenceRefCount: z.number().int().nonnegative(),
          surfaceCounts: z.record(z.string(), z.number().int().nonnegative()).default({}),
          candidateTypeCounts: z.record(z.string(), z.number().int().nonnegative()).default({}),
          lifecycleCounts: z.record(z.string(), z.number().int().nonnegative()).default({}),
        })
        .strict(),
      surfaceFiles: z.array(DocumentDerivedSurfaceFileSchema).default([]),
      notes: z.array(z.string().min(1)).default([]),
      nextActions: z.array(z.string().min(1)).default([]),
    })
    .strict()
    .readonly(),
  {
    id: "bp.document_derived_surfaces_manifest.v1",
    title: "Document Derived Surfaces Manifest",
    description:
      "Manifest for normalized, source-grounded document surfaces derived from Tier 2 OCR Markdown and discovery candidates.",
    stability: "draft",
  },
);
export type DocumentDerivedSurfacesManifest = z.output<
  typeof DocumentDerivedSurfacesManifestSchema
>;

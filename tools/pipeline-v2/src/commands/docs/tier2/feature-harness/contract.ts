import { toProjectJsonSchema } from "@bp/domain/json-schema";
import * as z from "zod";
import type { FeatureFamily } from "./types.ts";

export const TIER2_FEATURE_EXTRACTION_ARTIFACT_KIND =
  "bp.tier2_feature_extraction_vnext_harness.v1" as const;
export const TIER2_FEATURE_EXTRACTION_TOOL_NAME = "submit_tier2_feature_extraction_vnext" as const;
export const TIER2_FEATURE_EXTRACTION_PROMPT_VERSION = "tier2-feature-extraction-vnext-v1" as const;
export const DEFAULT_TIER2_FEATURE_SMOKE_PROVIDER = "pioneer" as const;
export const DEFAULT_TIER2_FEATURE_SMOKE_MODEL = "deepseek-ai/DeepSeek-V4-Flash" as const;
export const DEFAULT_TIER2_FEATURE_SMOKE_MAX_TOKENS = 8_000;
export const DEFAULT_TIER2_FEATURE_SMOKE_MAX_REPAIR_ROUNDS = 1;
export const DEFAULT_TIER2_FEATURE_SMOKE_TIMEOUT_MS = 120_000;

export const DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS = {
  routeScopeCandidates: 2,
  dateStatusCandidates: 1,
  interventionTreatmentCandidates: 2,
  timelineEventCandidates: 1,
  metricClaimCandidates: 2,
  treatmentCandidates: 2,
  eventIdentityCandidates: 0,
  tableObservations: 1,
  claimCandidates: 0,
  sourceStatementCandidates: 1,
  sourceStatementClaims: 1,
  sourceGapCandidates: 0,
  costValueCandidates: 1,
  serviceDeliveryClaims: 1,
  ridershipDemandClaims: 1,
  geographicContextClaims: 1,
  relationCandidates: 3,
  totalCandidates: 20,
  fieldSupportRowsPerCandidate: 8,
  notesChars: 600,
} as const;

export const MAX_TIER2_FEATURE_EXTRACTION_LIMITS = {
  ...DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS,
  sourceGapCandidates: 2,
  totalCandidates: 20,
  notesChars: 4_000,
} as const;

const EvidenceHandleSchema = z
  .object({
    evidenceHandle: z.string().min(1),
    sourceId: z.string().min(1),
    pageNumber: z.number().int().positive().optional(),
    blockId: z.string().min(1).optional(),
    quoteText: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
  })
  .strict();

const SourceContextSchema = z
  .object({
    sourceId: z.string().min(1),
    sourceTitle: z.string().min(1),
    sourceGroup: z.string().min(1).optional(),
    pageNumbers: z.array(z.number().int().positive()).min(1),
  })
  .strict();

const RouteLookupRequestSchema = z
  .object({
    lookupHandle: z.string().min(1).optional(),
    text: z.string().min(1),
  })
  .strict();

const SourceSearchTranscriptHandleSchema = z
  .object({
    searchTranscriptHandle: z.string().min(1),
    checkedSourceFamilyRaw: z.string().min(1).optional(),
    queryRaw: z.string().min(1).optional(),
    quoteText: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
  })
  .strict();

const FieldSupportSubmissionSchema = z
  .object({
    fieldPath: z.string().min(1),
    evidenceHandle: z.string().min(1),
    quoteText: z.string().min(1),
    supportCompleteness: z.enum(["exact", "partial", "inferred", "absent"]).default("exact"),
    supportRole: z.string().min(1).optional(),
  })
  .strict();

const EvidenceByFieldSchema = z
  .record(z.string().min(1), z.array(z.string().min(1)).min(1))
  .default({});

const RequestedUseSchema = z.enum([
  "detector_context",
  "brief_evidence",
  "public_timeline",
  "treatment_inventory",
  "source_gap_finding",
  "cost_value_packet",
  "service_delivery_packet",
  "route_diagnosis_packet",
]);

const BaseCandidateSchema = z
  .object({
    candidateLocalId: z.string().min(1).optional(),
    localObservationId: z.string().min(1).optional(),
    rawText: z.string().min(1),
    rawLabel: z.string().min(1).optional(),
    displayLabel: z.string().min(1).optional(),
    sourceStatedContext: z.string().min(1).optional(),
    evidenceByField: EvidenceByFieldSchema,
    requestedUses: z.array(RequestedUseSchema).optional(),
    relatedLocalObservationIds: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const RouteScopeCandidateSchema = BaseCandidateSchema.extend({
  routeTextRaw: z.string().min(1),
  routeLookupHandle: z.string().min(1).optional(),
  geographyRaw: z.string().min(1).optional(),
  corridorTextRaw: z.string().min(1).optional(),
  locationTextRaw: z.string().min(1).optional(),
  directionRaw: z.string().min(1).optional(),
  terminalRaw: z.string().min(1).optional(),
  branchRaw: z.string().min(1).optional(),
  serviceVariantRaw: z.string().min(1).optional(),
  areaTextRaw: z.string().min(1).optional(),
}).strict();

export const DateStatusCandidateSchema = BaseCandidateSchema.extend({
  rawDateText: z.string().min(1),
  rawStatusText: z.string().min(1).optional(),
  dateRole: z
    .enum([
      "implementation",
      "launch",
      "activation",
      "enforcement",
      "proposal",
      "plan",
      "board_action",
      "outreach",
      "construction",
      "evaluation",
      "report_publication",
      "deadline",
      "unknown",
    ])
    .optional(),
  sourceLanguageStateRaw: z.string().min(1).optional(),
  belongsToLocalObservationId: z.string().min(1).optional(),
}).strict();

export const InterventionTreatmentCandidateSchema = BaseCandidateSchema.extend({
  projectNameRaw: z.string().min(1).optional(),
  treatmentTextRaw: z.string().min(1),
  sourceScopeRaw: z.string().min(1).optional(),
  routeTextRaw: z.string().min(1).optional(),
  corridorTextRaw: z.string().min(1).optional(),
  locationTextRaw: z.string().min(1).optional(),
  statusRaw: z.string().min(1).optional(),
  dateLocalObservationId: z.string().min(1).optional(),
  treatmentPostureRaw: z.string().min(1).optional(),
}).strict();

export const TimelineEventCandidateSchema = BaseCandidateSchema.extend({
  eventTitleRaw: z.string().min(1),
  eventKindRaw: z.string().min(1).optional(),
  eventSubtypeRaw: z.string().min(1).optional(),
  routeLocalObservationId: z.string().min(1).optional(),
  treatmentLocalObservationId: z.string().min(1).optional(),
  dateLocalObservationId: z.string().min(1).optional(),
  statusLocalObservationId: z.string().min(1).optional(),
  timelineRelevanceRaw: z.string().min(1).optional(),
  processEvaluationContextFlagRaw: z.string().min(1).optional(),
}).strict();

export const MetricClaimCandidateSchema = BaseCandidateSchema.extend({
  metricLabelRaw: z.string().min(1),
  valueRaw: z.string().min(1).optional(),
  valueNumeric: z.number().finite().optional(),
  unitRaw: z.string().min(1).optional(),
  subjectRaw: z.string().min(1).optional(),
  periodRaw: z.string().min(1).optional(),
  baselinePeriodRaw: z.string().min(1).optional(),
  comparisonPeriodRaw: z.string().min(1).optional(),
  geographyRaw: z.string().min(1).optional(),
  comparatorRaw: z.string().min(1).optional(),
  directionRaw: z.string().min(1).optional(),
  sourceClaimAuthority: z.string().min(1).optional(),
  publicationWordingGate: z.string().min(1).optional(),
  caveatRaw: z.string().min(1).optional(),
  denominatorRaw: z.string().min(1).optional(),
  truthStatus: z.string().min(1).optional(),
}).strict();

export const TreatmentCandidateSchema = BaseCandidateSchema.extend({
  treatmentTextRaw: z.string().min(1),
  treatmentFamilyRaw: z.string().min(1).optional(),
  routeTextRaw: z.string().min(1).optional(),
  statusRaw: z.string().min(1).optional(),
}).strict();

export const EventIdentityCandidateSchema = BaseCandidateSchema.extend({
  eventFamilyRaw: z.string().min(1),
  eventSubtypeRaw: z.string().min(1).optional(),
  dateRaw: z.string().min(1).optional(),
  routeTextRaw: z.string().min(1).optional(),
  treatmentTextRaw: z.string().min(1).optional(),
}).strict();

export const TableObservationCandidateSchema = BaseCandidateSchema.extend({
  tableTitleRaw: z.string().min(1),
  rowLabelRaw: z.string().min(1).optional(),
  columnLabelRaw: z.string().min(1).optional(),
  valueRaw: z.string().min(1).optional(),
  unitRaw: z.string().min(1).optional(),
}).strict();

export const ClaimCandidateSchema = BaseCandidateSchema.extend({
  claimTextRaw: z.string().min(1),
  claimKindRaw: z.string().min(1).optional(),
  researchUseTagsRaw: z.array(z.string().min(1)).optional(),
  sourceClaimAuthority: z.string().min(1).optional(),
  publicationWordingGate: z.string().min(1).optional(),
}).strict();

export const SourceStatementCandidateSchema = BaseCandidateSchema.extend({
  statementTextRaw: z.string().min(1),
  statementKindRaw: z.string().min(1).optional(),
  sourceClaimAuthority: z.string().min(1).optional(),
  publicationWordingGate: z.string().min(1).optional(),
}).strict();

export const SourceGapCandidateSchema = BaseCandidateSchema.extend({
  gapTextRaw: z.string().min(1),
  checkedSourceFamilyRaw: z.string().min(1).optional(),
  searchTranscriptHandle: z.string().min(1).optional(),
  missingEvidenceWouldSupportRaw: z.string().min(1).optional(),
  publicSafeAbsenceWordingRaw: z.string().min(1).optional(),
  questionKindRaw: z.string().min(1).optional(),
}).strict();

export const CostValueCandidateSchema = BaseCandidateSchema.extend({
  amountRaw: z.string().min(1),
  currencyRaw: z.string().min(1).optional(),
  unitRaw: z.string().min(1).optional(),
  costTypeRaw: z.string().min(1).optional(),
  projectScopeRaw: z.string().min(1).optional(),
  routeTextRaw: z.string().min(1).optional(),
  corridorTextRaw: z.string().min(1).optional(),
  timeHorizonRaw: z.string().min(1).optional(),
  fundingSourceRaw: z.string().min(1).optional(),
  procurementReferenceRaw: z.string().min(1).optional(),
  benefitDenominatorRaw: z.string().min(1).optional(),
  uncertaintyCaveatRaw: z.string().min(1).optional(),
}).strict();

export const ServiceDeliveryClaimSchema = BaseCandidateSchema.extend({
  serviceDeliveryClaimTextRaw: z.string().min(1),
  metricDefinitionRaw: z.string().min(1).optional(),
  routeTextRaw: z.string().min(1).optional(),
  geographyRaw: z.string().min(1).optional(),
  periodRaw: z.string().min(1).optional(),
  cancellationWordingRaw: z.string().min(1).optional(),
  noOperatorWordingRaw: z.string().min(1).optional(),
  noVehicleWordingRaw: z.string().min(1).optional(),
  serviceDeliveredWordingRaw: z.string().min(1).optional(),
  cjtpComponentRaw: z.string().min(1).optional(),
  attributionCauseRaw: z.string().min(1).optional(),
  caveatRaw: z.string().min(1).optional(),
}).strict();

export const RidershipDemandClaimSchema = BaseCandidateSchema.extend({
  ridershipDemandClaimTextRaw: z.string().min(1),
  routeTextRaw: z.string().min(1).optional(),
  geographyRaw: z.string().min(1).optional(),
  periodRaw: z.string().min(1).optional(),
  comparisonPeriodRaw: z.string().min(1).optional(),
  valueRaw: z.string().min(1).optional(),
  unitRaw: z.string().min(1).optional(),
  trendLanguageRaw: z.string().min(1).optional(),
  sourceCaveatRaw: z.string().min(1).optional(),
  denominatorDefinitionRaw: z.string().min(1).optional(),
}).strict();

export const GeographicContextClaimSchema = BaseCandidateSchema.extend({
  areaTextRaw: z.string().min(1),
  areaKindRaw: z.string().min(1).optional(),
  equityContextTextRaw: z.string().min(1).optional(),
  affectedPopulationRaw: z.string().min(1).optional(),
  routeTextRaw: z.string().min(1).optional(),
  corridorTextRaw: z.string().min(1).optional(),
  allocationCaveatRaw: z.string().min(1).optional(),
  publicationWordingGate: z.string().min(1).optional(),
}).strict();

export const RelationCandidateSchema = BaseCandidateSchema.extend({
  fromLocalObservationId: z.string().min(1),
  toLocalObservationId: z.string().min(1),
  relationKindRaw: z.string().min(1),
  relationTextRaw: z.string().min(1),
}).strict();

const ExtractionLimitsSchema = z
  .object({
    routeScopeCandidates: z.number().int().min(0).max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.routeScopeCandidates).default(DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS.routeScopeCandidates),
    dateStatusCandidates: z.number().int().min(0).max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.dateStatusCandidates).default(DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS.dateStatusCandidates),
    interventionTreatmentCandidates: z.number().int().min(0).max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.interventionTreatmentCandidates).default(DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS.interventionTreatmentCandidates),
    timelineEventCandidates: z.number().int().min(0).max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.timelineEventCandidates).default(DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS.timelineEventCandidates),
    metricClaimCandidates: z.number().int().min(0).max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.metricClaimCandidates).default(DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS.metricClaimCandidates),
    treatmentCandidates: z.number().int().min(0).max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.treatmentCandidates).default(DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS.treatmentCandidates),
    eventIdentityCandidates: z.number().int().min(0).max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.eventIdentityCandidates).default(DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS.eventIdentityCandidates),
    tableObservations: z.number().int().min(0).max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.tableObservations).default(DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS.tableObservations),
    claimCandidates: z.number().int().min(0).max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.claimCandidates).default(DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS.claimCandidates),
    sourceStatementCandidates: z.number().int().min(0).max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.sourceStatementCandidates).default(DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS.sourceStatementCandidates),
    sourceStatementClaims: z.number().int().min(0).max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.sourceStatementClaims).default(DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS.sourceStatementClaims),
    sourceGapCandidates: z.number().int().min(0).max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.sourceGapCandidates).default(DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS.sourceGapCandidates),
    costValueCandidates: z.number().int().min(0).max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.costValueCandidates).default(DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS.costValueCandidates),
    serviceDeliveryClaims: z.number().int().min(0).max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.serviceDeliveryClaims).default(DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS.serviceDeliveryClaims),
    ridershipDemandClaims: z.number().int().min(0).max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.ridershipDemandClaims).default(DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS.ridershipDemandClaims),
    geographicContextClaims: z.number().int().min(0).max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.geographicContextClaims).default(DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS.geographicContextClaims),
    relationCandidates: z.number().int().min(0).max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.relationCandidates).default(DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS.relationCandidates),
    totalCandidates: z.number().int().min(0).max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.totalCandidates).default(DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS.totalCandidates),
    fieldSupportRowsPerCandidate: z
      .number()
      .int()
      .min(1)
      .max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.fieldSupportRowsPerCandidate)
      .default(DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS.fieldSupportRowsPerCandidate),
    notesChars: z.number().int().min(0).max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.notesChars).default(DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS.notesChars),
  })
  .strict()
  .default(DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS);

export const Tier2FeatureExtractionRequestSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    runId: z.string().min(1).optional(),
    generatedAt: z.string().min(1).optional(),
    source: SourceContextSchema,
    sourcePacketHash: z.string().min(1).optional(),
    evidenceHandles: z.array(EvidenceHandleSchema).min(1),
    lookupResults: z.array(z.unknown()).default([]),
    routeLookupRequests: z.array(RouteLookupRequestSchema).default([]),
    routeUniverse: z.array(z.string().min(1)).default([]),
    sourceSearchTranscriptHandles: z.array(SourceSearchTranscriptHandleSchema).default([]),
    priorContext: z.array(z.unknown()).default([]),
    extractionLimits: ExtractionLimitsSchema,
    instructions: z.string().min(1).optional(),
  })
  .strict();

export const Tier2FeatureExtractionToolResponseSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    routeScopeCandidates: z
      .array(RouteScopeCandidateSchema)
      .max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.routeScopeCandidates)
      .default([]),
    dateStatusCandidates: z
      .array(DateStatusCandidateSchema)
      .max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.dateStatusCandidates)
      .default([]),
    interventionTreatmentCandidates: z
      .array(InterventionTreatmentCandidateSchema)
      .max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.interventionTreatmentCandidates)
      .default([]),
    timelineEventCandidates: z
      .array(TimelineEventCandidateSchema)
      .max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.timelineEventCandidates)
      .default([]),
    metricClaimCandidates: z
      .array(MetricClaimCandidateSchema)
      .max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.metricClaimCandidates)
      .default([]),
    treatmentCandidates: z
      .array(TreatmentCandidateSchema)
      .max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.treatmentCandidates)
      .default([]),
    eventIdentityCandidates: z
      .array(EventIdentityCandidateSchema)
      .max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.eventIdentityCandidates)
      .default([]),
    tableObservations: z
      .array(TableObservationCandidateSchema)
      .max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.tableObservations)
      .default([]),
    claimCandidates: z
      .array(ClaimCandidateSchema)
      .max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.claimCandidates)
      .default([]),
    sourceStatementCandidates: z
      .array(SourceStatementCandidateSchema)
      .max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.sourceStatementCandidates)
      .default([]),
    sourceStatementClaims: z
      .array(SourceStatementCandidateSchema)
      .max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.sourceStatementClaims)
      .default([]),
    sourceGapCandidates: z
      .array(SourceGapCandidateSchema)
      .max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.sourceGapCandidates)
      .default([]),
    costValueCandidates: z
      .array(CostValueCandidateSchema)
      .max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.costValueCandidates)
      .default([]),
    serviceDeliveryClaims: z
      .array(ServiceDeliveryClaimSchema)
      .max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.serviceDeliveryClaims)
      .default([]),
    ridershipDemandClaims: z
      .array(RidershipDemandClaimSchema)
      .max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.ridershipDemandClaims)
      .default([]),
    geographicContextClaims: z
      .array(GeographicContextClaimSchema)
      .max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.geographicContextClaims)
      .default([]),
    relationCandidates: z
      .array(RelationCandidateSchema)
      .max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.relationCandidates)
      .default([]),
    notes: z.string().min(1).max(MAX_TIER2_FEATURE_EXTRACTION_LIMITS.notesChars).optional(),
  })
  .strict();

export type Tier2FeatureExtractionRequest = z.output<typeof Tier2FeatureExtractionRequestSchema>;
export type Tier2FeatureExtractionToolResponse = z.output<typeof Tier2FeatureExtractionToolResponseSchema>;
export type FieldSupportSubmission = z.output<typeof FieldSupportSubmissionSchema>;

export type FeatureFamilySection =
  | "routeScopeCandidates"
  | "dateStatusCandidates"
  | "interventionTreatmentCandidates"
  | "timelineEventCandidates"
  | "metricClaimCandidates"
  | "treatmentCandidates"
  | "eventIdentityCandidates"
  | "tableObservations"
  | "claimCandidates"
  | "sourceStatementCandidates"
  | "sourceStatementClaims"
  | "sourceGapCandidates"
  | "costValueCandidates"
  | "serviceDeliveryClaims"
  | "ridershipDemandClaims"
  | "geographicContextClaims"
  | "relationCandidates";

export const FEATURE_FAMILY_SECTIONS: Array<{
  section: FeatureFamilySection;
  featureFamily: FeatureFamily;
}> = [
  { section: "routeScopeCandidates", featureFamily: "route_scope" },
  { section: "dateStatusCandidates", featureFamily: "operational_date_status" },
  { section: "interventionTreatmentCandidates", featureFamily: "treatment" },
  { section: "timelineEventCandidates", featureFamily: "timeline_event" },
  { section: "metricClaimCandidates", featureFamily: "metric_claim" },
  { section: "treatmentCandidates", featureFamily: "treatment" },
  { section: "eventIdentityCandidates", featureFamily: "event_identity" },
  { section: "tableObservations", featureFamily: "table_cell" },
  { section: "claimCandidates", featureFamily: "claim" },
  { section: "sourceStatementCandidates", featureFamily: "source_statement" },
  { section: "sourceStatementClaims", featureFamily: "source_statement" },
  { section: "sourceGapCandidates", featureFamily: "source_gap" },
  { section: "costValueCandidates", featureFamily: "cost_value" },
  { section: "serviceDeliveryClaims", featureFamily: "service_delivery_claim" },
  { section: "ridershipDemandClaims", featureFamily: "ridership_demand_claim" },
  { section: "geographicContextClaims", featureFamily: "geographic_context_claim" },
  { section: "relationCandidates", featureFamily: "relation" },
];

export const LLM_SUBMITTED_FIELD_SETS: Record<FeatureFamilySection, string[]> = {
  routeScopeCandidates: [
    "rawText",
    "routeTextRaw",
    "routeLookupHandle",
    "geographyRaw",
    "corridorTextRaw",
    "locationTextRaw",
    "directionRaw",
    "terminalRaw",
    "branchRaw",
    "serviceVariantRaw",
    "areaTextRaw",
    "evidenceByField",
  ],
  dateStatusCandidates: [
    "rawText",
    "rawDateText",
    "rawStatusText",
    "dateRole",
    "sourceLanguageStateRaw",
    "belongsToLocalObservationId",
    "evidenceByField",
  ],
  interventionTreatmentCandidates: [
    "rawText",
    "projectNameRaw",
    "treatmentTextRaw",
    "sourceScopeRaw",
    "routeTextRaw",
    "corridorTextRaw",
    "locationTextRaw",
    "statusRaw",
    "dateLocalObservationId",
    "treatmentPostureRaw",
    "evidenceByField",
  ],
  timelineEventCandidates: [
    "rawText",
    "eventTitleRaw",
    "eventKindRaw",
    "eventSubtypeRaw",
    "routeLocalObservationId",
    "treatmentLocalObservationId",
    "dateLocalObservationId",
    "statusLocalObservationId",
    "timelineRelevanceRaw",
    "processEvaluationContextFlagRaw",
    "evidenceByField",
  ],
  metricClaimCandidates: [
    "rawText",
    "metricLabelRaw",
    "valueRaw",
    "unitRaw",
    "subjectRaw",
    "periodRaw",
    "baselinePeriodRaw",
    "comparisonPeriodRaw",
    "geographyRaw",
    "comparatorRaw",
    "directionRaw",
    "sourceClaimAuthority",
    "publicationWordingGate",
    "caveatRaw",
    "denominatorRaw",
    "truthStatus",
    "evidenceByField",
  ],
  treatmentCandidates: [
    "rawText",
    "treatmentTextRaw",
    "treatmentFamilyRaw",
    "routeTextRaw",
    "statusRaw",
    "evidenceByField",
  ],
  eventIdentityCandidates: [
    "rawText",
    "eventFamilyRaw",
    "eventSubtypeRaw",
    "dateRaw",
    "routeTextRaw",
    "treatmentTextRaw",
    "evidenceByField",
  ],
  tableObservations: [
    "rawText",
    "tableTitleRaw",
    "rowLabelRaw",
    "columnLabelRaw",
    "valueRaw",
    "unitRaw",
    "evidenceByField",
  ],
  claimCandidates: [
    "rawText",
    "claimTextRaw",
    "claimKindRaw",
    "researchUseTagsRaw",
    "sourceClaimAuthority",
    "publicationWordingGate",
    "evidenceByField",
  ],
  sourceStatementCandidates: [
    "rawText",
    "statementTextRaw",
    "statementKindRaw",
    "sourceClaimAuthority",
    "publicationWordingGate",
    "evidenceByField",
  ],
  sourceStatementClaims: [
    "rawText",
    "statementTextRaw",
    "statementKindRaw",
    "sourceClaimAuthority",
    "publicationWordingGate",
    "evidenceByField",
  ],
  sourceGapCandidates: [
    "rawText",
    "gapTextRaw",
    "checkedSourceFamilyRaw",
    "searchTranscriptHandle",
    "missingEvidenceWouldSupportRaw",
    "publicSafeAbsenceWordingRaw",
    "questionKindRaw",
    "evidenceByField",
  ],
  costValueCandidates: [
    "rawText",
    "amountRaw",
    "currencyRaw",
    "unitRaw",
    "costTypeRaw",
    "projectScopeRaw",
    "routeTextRaw",
    "corridorTextRaw",
    "timeHorizonRaw",
    "fundingSourceRaw",
    "procurementReferenceRaw",
    "benefitDenominatorRaw",
    "uncertaintyCaveatRaw",
    "evidenceByField",
  ],
  serviceDeliveryClaims: [
    "rawText",
    "serviceDeliveryClaimTextRaw",
    "metricDefinitionRaw",
    "routeTextRaw",
    "geographyRaw",
    "periodRaw",
    "cancellationWordingRaw",
    "noOperatorWordingRaw",
    "noVehicleWordingRaw",
    "serviceDeliveredWordingRaw",
    "cjtpComponentRaw",
    "attributionCauseRaw",
    "caveatRaw",
    "evidenceByField",
  ],
  ridershipDemandClaims: [
    "rawText",
    "ridershipDemandClaimTextRaw",
    "routeTextRaw",
    "geographyRaw",
    "periodRaw",
    "comparisonPeriodRaw",
    "valueRaw",
    "unitRaw",
    "trendLanguageRaw",
    "sourceCaveatRaw",
    "denominatorDefinitionRaw",
    "evidenceByField",
  ],
  geographicContextClaims: [
    "rawText",
    "areaTextRaw",
    "areaKindRaw",
    "equityContextTextRaw",
    "affectedPopulationRaw",
    "routeTextRaw",
    "corridorTextRaw",
    "allocationCaveatRaw",
    "publicationWordingGate",
    "evidenceByField",
  ],
  relationCandidates: [
    "rawText",
    "fromLocalObservationId",
    "toLocalObservationId",
    "relationKindRaw",
    "relationTextRaw",
    "evidenceByField",
  ],
};

export const DETERMINISTIC_RUNNER_FIELDS = [
  "candidateId",
  "source lineage",
  "featureFamily",
  "proofState",
  "promotionEligibility",
  "validationErrors",
  "validationRetryBatches",
  "queue role gates",
];

export const VOCAB_RUNNER_FIELDS = [
  "canonicalLeafId",
  "canonicalLeafLabel",
  "coarseFamily",
  "modifiers",
  "targetPayloadPath",
];

function fallbackToolParameterSchema(): Record<string, unknown> {
  const candidateArray = (section: FeatureFamilySection) => ({
    type: "array",
    maxItems: MAX_TIER2_FEATURE_EXTRACTION_LIMITS[section],
    items: { type: "object" },
  });
  return {
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion"],
    properties: {
      schemaVersion: { const: 1 },
      routeScopeCandidates: candidateArray("routeScopeCandidates"),
      dateStatusCandidates: candidateArray("dateStatusCandidates"),
      interventionTreatmentCandidates: candidateArray("interventionTreatmentCandidates"),
      timelineEventCandidates: candidateArray("timelineEventCandidates"),
      metricClaimCandidates: candidateArray("metricClaimCandidates"),
      treatmentCandidates: candidateArray("treatmentCandidates"),
      eventIdentityCandidates: candidateArray("eventIdentityCandidates"),
      tableObservations: candidateArray("tableObservations"),
      claimCandidates: candidateArray("claimCandidates"),
      sourceStatementCandidates: candidateArray("sourceStatementCandidates"),
      sourceStatementClaims: candidateArray("sourceStatementClaims"),
      sourceGapCandidates: candidateArray("sourceGapCandidates"),
      costValueCandidates: candidateArray("costValueCandidates"),
      serviceDeliveryClaims: candidateArray("serviceDeliveryClaims"),
      ridershipDemandClaims: candidateArray("ridershipDemandClaims"),
      geographicContextClaims: candidateArray("geographicContextClaims"),
      relationCandidates: candidateArray("relationCandidates"),
      notes: { type: "string", maxLength: MAX_TIER2_FEATURE_EXTRACTION_LIMITS.notesChars },
    },
  };
}

export function tier2FeatureExtractionTool(): {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
} {
  let parameters: Record<string, unknown>;
  try {
    const schema = toProjectJsonSchema(Tier2FeatureExtractionToolResponseSchema);
    parameters =
      schema !== null && typeof schema === "object" && !Array.isArray(schema)
        ? (schema as Record<string, unknown>)
        : fallbackToolParameterSchema();
  } catch {
    parameters = fallbackToolParameterSchema();
  }
  return {
    name: TIER2_FEATURE_EXTRACTION_TOOL_NAME,
    description:
      "Submit strict Tier 2 feature candidates in family-specific arrays. Include evidenceByField handle refs for every source-observed field.",
    parameters,
  };
}

export function defaultTier2FeatureSmokeRequest(input: {
  runId?: string;
  generatedAt?: string;
} = {}): Tier2FeatureExtractionRequest {
  return {
    schemaVersion: 1,
    runId: input.runId ?? "tier2-feature-vnext-smoke",
    ...(input.generatedAt === undefined ? {} : { generatedAt: input.generatedAt }),
    source: {
      sourceId: "tier2_vnext_smoke_m15",
      sourceTitle: "Tier 2 vNext smoke fixture",
      sourceGroup: "validation_canary",
      pageNumbers: [1],
    },
    sourcePacketHash: "sha256:tier2-vnext-smoke-m15",
    evidenceHandles: [
      {
        evidenceHandle: "ev-smoke-metric",
        sourceId: "tier2_vnext_smoke_m15",
        pageNumber: 1,
        blockId: "B0001",
        quoteText:
          "The M15 Select Bus Service corridor carried 42,000 weekday riders and NYC DOT described the figure as source-stated for publication.",
      },
      {
        evidenceHandle: "ev-smoke-treatment",
        sourceId: "tier2_vnext_smoke_m15",
        pageNumber: 1,
        blockId: "B0002",
        quoteText: "The project added offset bus lanes and transit signal priority on the M15 corridor.",
      },
    ],
    lookupResults: [],
    routeLookupRequests: [
      {
        lookupHandle: "lookup-smoke-m15",
        text: "M15 Select Bus Service corridor",
      },
    ],
    routeUniverse: ["M15"],
    sourceSearchTranscriptHandles: [],
    priorContext: [],
    extractionLimits: DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS,
    instructions:
      "This is a one-window validation canary. Extract only facts stated in the evidence handles.",
  };
}

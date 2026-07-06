import * as z from "../../schema-compat.js";
import { registerProjectSchema } from "../../schema-registry.js";

export const DocumentCandidateValidationStateSchema = z.enum([
  "unvalidated",
  "validated",
  "needs_review",
  "rejected",
]);

export type DocumentCandidateValidationState = z.output<
  typeof DocumentCandidateValidationStateSchema
>;

export const DocumentFactClassificationSchema = z.enum([
  "official_fact",
  "official_claim",
  "third_party_evaluation",
  "context",
  "caveat",
  "methodology",
  "source_gap",
]);

export type DocumentFactClassification = z.output<typeof DocumentFactClassificationSchema>;

export const DocumentNegativeEvidenceFlagSchema = z.enum([
  "proposed_only",
  "outreach_not_implementation",
  "ocr_cannot_read_map",
  "no_stop_table",
  "claim_without_row_data",
  "presentation_date_not_implementation",
  "superseded_source",
  "official_linked_not_mta_dot",
  "mention_too_thin_for_intervention",
  "none",
]);

export type DocumentNegativeEvidenceFlag = z.output<typeof DocumentNegativeEvidenceFlagSchema>;

export const DocumentEvidenceCandidateTypeSchema = z.enum([
  "document_claim_candidate",
  "document_metric_claim_candidate",
  "document_table_candidate",
  "document_figure_candidate",
  "document_map_extent_candidate",
  "document_methodology_candidate",
  "document_caveat_candidate",
  "document_project_status_candidate",
  "document_treatment_component_candidate",
  "document_service_change_candidate",
  "document_stop_or_intersection_candidate",
  "document_supersession_candidate",
  "document_source_gap_candidate",
  "document_evidence_link_candidate",
  "review_question_candidate",
]);

export type DocumentEvidenceCandidateType = z.output<typeof DocumentEvidenceCandidateTypeSchema>;

export const DocumentCandidatePayloadSchema = z.record(z.string(), z.unknown());

export type DocumentCandidatePayload = z.output<typeof DocumentCandidatePayloadSchema>;

const DocumentEvidenceCandidateDraftObjectSchema = z
  .object({
    candidateType: DocumentEvidenceCandidateTypeSchema,
    factClassification: DocumentFactClassificationSchema,
    negativeEvidenceFlag: DocumentNegativeEvidenceFlagSchema.default("none"),
    routeMentions: z.array(z.string().min(1)).default([]),
    corridorMentions: z.array(z.string().min(1)).default([]),
    evidencePageRefs: z.array(z.number().int().positive()).default([]),
    evidenceQuote: z.string().min(1),
    summary: z.string().min(1),
    fields: DocumentCandidatePayloadSchema.default({}),
  })
  .strict();

export const DocumentEvidenceCandidateDraftSchema = registerProjectSchema(
  DocumentEvidenceCandidateDraftObjectSchema.readonly(),
  {
    id: "bp.document_evidence_candidate_draft.v1",
    title: "Document Evidence Candidate Draft",
    description:
      "Source-grounded draft candidate emitted by OCR or review tooling before deterministic validation.",
    stability: "draft",
  },
);

export type DocumentEvidenceCandidateDraft = z.output<typeof DocumentEvidenceCandidateDraftSchema>;

export const DocumentEvidenceCandidateSchema = registerProjectSchema(
  DocumentEvidenceCandidateDraftObjectSchema.extend({
    candidateId: z.string().min(1),
    sourceId: z.string().min(1),
    validationState: DocumentCandidateValidationStateSchema,
    reviewReason: z.string().min(1),
  })
    .strict()
    .readonly(),
  {
    id: "bp.document_evidence_candidate.v1",
    title: "Document Evidence Candidate",
    description:
      "Persisted, unvalidated evidence candidate extracted from official or third-party bus documents.",
    stability: "draft",
  },
);

export type DocumentEvidenceCandidate = z.output<typeof DocumentEvidenceCandidateSchema>;

// ---------------------------------------------------------------------------
// Tier 2 OCR-markdown evidence-candidate extraction shape
//
// Richer, extraction-time superset of `DocumentEvidenceCandidate` emitted by
// the Tier 2 OCR pipeline (`tools/pipeline-v2` docs tier2 steps) and consumed
// by the deterministic intervention-records policy in
// `@bp/analytics/interventions`. It carries an object `sourceRef`
// (vs the persisted candidate's `sourceId`) plus an `extraction` provenance
// block. Promoted out of the pipeline `_shared.ts` monolith so the policy can
// live in a package without depending on the tool.
//
// FOLLOW-UP: formalize as a registered schema and reconcile with
// `DocumentEvidenceCandidate` once the upstream candidate-extraction steps are
// themselves cut over.
// ---------------------------------------------------------------------------

export type Tier2CandidateValidationState = DocumentCandidateValidationState;

export type Tier2CandidateSourceRef = {
  sourceId: string;
  sourceUrl: string;
  title: string;
  publisher: string;
  documentDate: string | null;
  sourceGroup: string;
  artifactKeys: {
    raw: string | null;
    text: string | null;
    ocrText: string | null;
    ocrJson: string | null;
    ocrAnnotations: string | null;
  };
  pages: number[];
};

export type Tier2OcrMarkdownCandidateQualityIssueCode =
  | "evidence_quote_not_exact"
  | "evidence_quote_spans_page_boundary"
  | "evidence_quote_uses_ellipsis"
  | "evidence_quote_flattened_table"
  | "metric_value_numeric_not_supported_by_quote"
  | "treatment_type_not_supported_by_quote"
  | "treatment_candidate_without_supported_type"
  | "service_change_candidate_without_change_type"
  | "project_status_is_document_milestone"
  | "project_status_spans_multiple_projects"
  | "project_status_spans_multiple_statuses";

export type Tier2OcrMarkdownCandidateQualityRepairCode =
  | "evidence_quote_repaired_to_source_substring"
  | "evidence_page_refs_trimmed_to_quote_pages"
  | "evidence_page_refs_repaired_to_window_quote_pages"
  | "metric_value_numeric_removed_as_derived"
  | "negative_evidence_flag_set_proposed_only"
  | "negative_evidence_flag_set_presentation_date_not_implementation"
  | "fact_classification_set_third_party_evaluation"
  | "unsupported_treatment_types_removed"
  | "unsupported_service_change_types_removed"
  | "route_mentions_normalized";

export type Tier2DocumentEvidenceCandidate = {
  candidateType: DocumentEvidenceCandidateType;
  candidateId: string;
  sourceRef: Tier2CandidateSourceRef;
  factClassification: DocumentFactClassification;
  negativeEvidenceFlag: DocumentNegativeEvidenceFlag;
  routeMentions: string[];
  corridorMentions: string[];
  evidencePageRefs: number[];
  evidenceQuote: string;
  summary: string;
  fields: Record<string, unknown>;
  extraction: {
    pageMarkdownRootName: string;
    candidateRootName: string;
    windowPages: number[];
    qualityIssues?: Tier2OcrMarkdownCandidateQualityIssueCode[];
    qualityRepairs?: Tier2OcrMarkdownCandidateQualityRepairCode[];
  };
  validationState: Tier2CandidateValidationState;
  reviewReason: string;
};

// ---------------------------------------------------------------------------
// Tool-facing draft schema
//
// `DocumentEvidenceCandidateDraftToolSchema` is a discriminated union over
// `candidateType` used to generate JSON Schema for LLM tool calls. Each
// variant pins the candidateType literal and declares its expected `fields`
// keys with descriptions. Runtime parsing still uses the flat
// `DocumentEvidenceCandidateDraftSchema` above; this union exists to give
// the model per-type guidance through schema descriptions.
// ---------------------------------------------------------------------------

const sharedDraftFields = {
  factClassification: DocumentFactClassificationSchema.describe(
    "How this fact relates to its source: official_fact and official_claim come from the publishing agency; third_party_evaluation is an outside assessment; context and caveat narrate; methodology describes how a metric was computed; source_gap is an explicit absence.",
  ),
  negativeEvidenceFlag: DocumentNegativeEvidenceFlagSchema.default("none").describe(
    'Reason this candidate is negative or weak evidence, when applicable. Use "none" otherwise.',
  ),
  routeMentions: z
    .array(z.string().min(1))
    .default([])
    .describe(
      'Bare MTA route IDs as they appear in the route catalog, e.g. ["B44", "M15"]. Do not append service-mode suffixes like SBS, Limited, or Local; those go on per-type fields when relevant. Use the empty array when no route is named.',
    ),
  corridorMentions: z
    .array(z.string().min(1))
    .default([])
    .describe(
      'Street or avenue names mentioned in the supporting quote, e.g. ["Nostrand Avenue", "14th Street"]. Use the empty array when no corridor is named.',
    ),
  evidencePageRefs: z
    .array(z.number().int().positive())
    .default([])
    .describe("PDF page numbers (1-indexed) that contain the supporting quote."),
  evidenceQuote: z
    .string()
    .min(1)
    .describe(
      "A short verbatim excerpt from the provided OCR Markdown that supports this candidate.",
    ),
  summary: z
    .string()
    .min(1)
    .describe("One- or two-sentence summary of the candidate, in your own words."),
} as const;

const OPTIONAL_PERIOD_DESCRIPTION =
  "ISO date or YYYY-MM. Omit this key entirely when the period is not given in the source; do not emit an empty string.";

// Canonical metric names common in NYC bus-priority documents. Extracted from
// reading the prompt's prior free-text vocabulary; not exhaustive. Use the
// `customMetricName` escape hatch for anything not in the list.
export const DocumentMetricNameSchema = z.enum([
  "bus_travel_time",
  "bus_running_time",
  "bus_average_speed",
  "ridership",
  "ridership_growth",
  "on_time_performance",
  "schedule_adherence",
  "headway_regularity",
  "stop_dwell_time",
  "customer_satisfaction",
  "general_traffic_speed",
  "general_traffic_travel_time",
  "general_traffic_volume",
  "pedestrian_injuries",
  "vehicle_injuries",
  "traffic_injuries",
  "fare_collection_time",
  "boarding_time",
]);
export type DocumentMetricName = z.output<typeof DocumentMetricNameSchema>;

// Canonical treatment families. The same caveat applies: prefer one of these,
// fall back to `customTreatmentType` for anything else.
export const DocumentTreatmentTypeSchema = z.enum([
  "bus_lane",
  "busway",
  "transit_signal_priority",
  "queue_jump",
  "stop_consolidation",
  "stop_relocation",
  "bus_bulb",
  "neckdown",
  "red_paint",
  "off_board_fare_collection",
  "all_door_boarding",
  "ace",
  "able",
  "reroute",
  "pedestrian_improvement",
  "signal_retiming",
]);
export type DocumentTreatmentType = z.output<typeof DocumentTreatmentTypeSchema>;

export const DocumentServiceChangeKindSchema = z.enum([
  "route_added",
  "route_discontinued",
  "route_modified",
  "stop_added",
  "stop_removed",
  "frequency_change",
  "headway_change",
  "terminus_change",
  "branch_added",
  "branch_discontinued",
]);
export type DocumentServiceChangeKind = z.output<typeof DocumentServiceChangeKindSchema>;

function draftVariant<TType extends DocumentEvidenceCandidateType>(
  candidateType: TType,
  description: string,
  fields: z.ZodType,
) {
  return z
    .object({
      candidateType: z.literal(candidateType),
      ...sharedDraftFields,
      fields,
    })
    .strict()
    .describe(description);
}

const claimFields = z
  .object({
    claimSubject: z.string().optional().describe("The subject or entity the claim is about."),
  })
  .passthrough();

const metricClaimFields = z
  .object({
    metricName: DocumentMetricNameSchema.optional().describe(
      "Canonical metric name. Pick one of the enum values when it fits; otherwise leave this unset and use customMetricName.",
    ),
    customMetricName: z
      .string()
      .optional()
      .describe(
        "Free-text metric name when no enum value fits. Use only when metricName is unset.",
      ),
    valueNumeric: z.number().optional().describe("Primary numeric value of the metric."),
    valueQualifier: z
      .string()
      .optional()
      .describe(
        'Qualifier such as "approximately", "up to", or a range like "15-31%" when the source gives a range rather than a single number.',
      ),
    unit: z.string().optional().describe('Unit such as "percent", "minutes", "mph", "riders/day".'),
    baselinePeriodStart: z.string().optional().describe(OPTIONAL_PERIOD_DESCRIPTION),
    baselinePeriodEnd: z.string().optional().describe(OPTIONAL_PERIOD_DESCRIPTION),
    comparisonPeriodStart: z.string().optional().describe(OPTIONAL_PERIOD_DESCRIPTION),
    comparisonPeriodEnd: z.string().optional().describe(OPTIONAL_PERIOD_DESCRIPTION),
    geographyScope: z
      .string()
      .optional()
      .describe('Scope of the metric, e.g. "B44 corridor", "Brooklyn", "system-wide".'),
    methodology: z
      .string()
      .optional()
      .describe("Brief description of how the metric was computed if the source explains it."),
  })
  .passthrough();

const tableFields = z
  .object({
    tableCaption: z.string().optional(),
    headers: z.array(z.string()).optional(),
    rows: z.array(z.array(z.string())).optional(),
  })
  .passthrough();

const figureFields = z
  .object({
    figureCaption: z.string().optional(),
    figureType: z.string().optional().describe("E.g. bar_chart, map, photo, diagram."),
  })
  .passthrough();

const mapExtentFields = z
  .object({
    extentIntersections: z
      .array(z.string())
      .optional()
      .describe("Named intersections or limits bounding the treatment extent."),
  })
  .passthrough();

const methodologyFields = z
  .object({
    methodology: z.string().optional(),
  })
  .passthrough();

const caveatFields = z.object({}).passthrough();

const projectStatusFields = z
  .object({
    status: z
      .enum([
        "proposed",
        "planning",
        "implementing",
        "monitoring",
        "complete",
        "canceled",
        "superseded",
      ])
      .optional()
      .describe("Lifecycle stage of the project as described in the source."),
    statusAsOfDate: z
      .string()
      .optional()
      .describe("Date the status was reported. ISO date or YYYY-MM. Omit when no date is given."),
    phase: z
      .string()
      .optional()
      .describe("Free-text phase label when the source uses a project-specific phase name."),
  })
  .passthrough();

const treatmentComponentFields = z
  .object({
    treatmentTypes: z
      .array(DocumentTreatmentTypeSchema)
      .optional()
      .describe(
        "Treatment families this candidate describes. Use one or more of the enum values; emit one candidate per discrete claim, but list multiple types when the source bundles them together. Use customTreatmentType for anything not in the enum.",
      ),
    customTreatmentType: z
      .string()
      .optional()
      .describe("Free-text treatment label when no enum value applies."),
    implementationStatus: z
      .enum(["proposed", "planned", "implemented", "removed"])
      .optional()
      .describe("Lifecycle stage of the treatment as described in the source."),
    serviceMode: z
      .enum(["sbs", "local", "limited", "express", "lcl"])
      .optional()
      .describe(
        "Bus service mode the treatment applies to, when the source distinguishes. SBS = Select Bus Service.",
      ),
  })
  .passthrough();

const serviceChangeFields = z
  .object({
    changeTypes: z
      .array(DocumentServiceChangeKindSchema)
      .optional()
      .describe(
        "Kinds of service change described. List all that apply, but emit one candidate per discrete change span.",
      ),
    effectiveDate: z
      .string()
      .optional()
      .describe(
        "Date the change took effect. ISO date or YYYY-MM. Omit this key entirely when no date is given.",
      ),
  })
  .passthrough();

const stopOrIntersectionFields = z
  .object({
    stopIdIfKnown: z.string().optional(),
    intersectionName: z.string().optional(),
  })
  .passthrough();

const supersessionFields = z
  .object({
    supersedes: z.string().optional().describe("Identifier or title of the source being replaced."),
    supersededBy: z.string().optional().describe("Identifier or title of the replacing source."),
    supersessionType: z
      .string()
      .optional()
      .describe("replaces, amends, cancels, or status_update."),
  })
  .passthrough();

const sourceGapFields = z
  .object({
    sourceGapSubject: z
      .string()
      .optional()
      .describe('What is missing, e.g. "no stop-level table" or "no TSP inventory".'),
  })
  .passthrough();

const evidenceLinkFields = z
  .object({
    linkedDatasetId: z
      .string()
      .optional()
      .describe("Identifier of the underlying dataset or table."),
  })
  .passthrough();

const reviewQuestionFields = z
  .object({
    reviewQuestion: z.string().optional(),
    proposedAnswer: z.string().optional(),
    requiredSource: z
      .string()
      .optional()
      .describe("What kind of follow-up source would resolve the question."),
  })
  .passthrough();

export const DocumentEvidenceCandidateDraftToolSchema = z.discriminatedUnion("candidateType", [
  draftVariant("document_claim_candidate", "A single source-backed non-metric claim.", claimFields),
  draftVariant(
    "document_metric_claim_candidate",
    "A metric value with unit, baseline/comparison windows, scope, and methodology or caveats when present.",
    metricClaimFields,
  ),
  draftVariant(
    "document_table_candidate",
    "An extracted table with caption, headers, and rows where the Markdown preserves enough structure.",
    tableFields,
  ),
  draftVariant(
    "document_figure_candidate",
    "A chart, map, photo, or diagram with caption and extractable data notes.",
    figureFields,
  ),
  draftVariant(
    "document_map_extent_candidate",
    "Corridor limits, map bounds, intersections, or treatment extents visible in OCR text.",
    mapExtentFields,
  ),
  draftVariant(
    "document_methodology_candidate",
    "Dataset definitions, aggregation units, comparison basis, or caveats about how a metric is computed.",
    methodologyFields,
  ),
  draftVariant(
    "document_caveat_candidate",
    "A limitation, confound, data gap, or source-use warning.",
    caveatFields,
  ),
  draftVariant(
    "document_project_status_candidate",
    "Project status: proposed, planning, implementing, monitoring, complete, canceled, or superseded.",
    projectStatusFields,
  ),
  draftVariant(
    "document_treatment_component_candidate",
    "A bus-priority treatment: bus lane, busway, TSP, queue jump, stop consolidation, ACE, red paint, bus bulb, or related.",
    treatmentComponentFields,
  ),
  draftVariant(
    "document_service_change_candidate",
    "A service change: route added/discontinued/modified, stop added/removed, or frequency/headway/terminus change.",
    serviceChangeFields,
  ),
  draftVariant(
    "document_stop_or_intersection_candidate",
    "A stop- or intersection-specific treatment, metric, or named location.",
    stopOrIntersectionFields,
  ),
  draftVariant(
    "document_supersession_candidate",
    "One source, plan, addendum, pilot, or status update replacing, amending, or canceling another.",
    supersessionFields,
  ),
  draftVariant(
    "document_source_gap_candidate",
    "Explicit absence or negative evidence: no stop table, no TSP inventory, proposed-only status, etc.",
    sourceGapFields,
  ),
  draftVariant(
    "document_evidence_link_candidate",
    "A link between a claim and its underlying dataset or table.",
    evidenceLinkFields,
  ),
  draftVariant(
    "review_question_candidate",
    "A concrete open question that needs a follow-up source or human review.",
    reviewQuestionFields,
  ),
]);

export type DocumentEvidenceCandidateDraftTool = z.output<
  typeof DocumentEvidenceCandidateDraftToolSchema
>;

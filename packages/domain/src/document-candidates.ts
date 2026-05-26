import * as z from "zod";
import { registerProjectSchema } from "./schema-registry.js";

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

export type DocumentEvidenceCandidateDraft = z.output<
  typeof DocumentEvidenceCandidateDraftSchema
>;

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
    "Reason this candidate is negative or weak evidence, when applicable. Use proposed_only, outreach_not_implementation, ocr_cannot_read_map, no_stop_table, claim_without_row_data, presentation_date_not_implementation, superseded_source, official_linked_not_mta_dot, or mention_too_thin_for_intervention. Use \"none\" otherwise.",
  ),
  routeMentions: z
    .array(z.string().min(1))
    .default([])
    .describe("Route IDs or names mentioned in the supporting quote, e.g. B1, M15-SBS."),
  corridorMentions: z
    .array(z.string().min(1))
    .default([])
    .describe("Corridor or street names mentioned in the supporting quote."),
  evidencePageRefs: z
    .array(z.number().int().positive())
    .default([])
    .describe("PDF page numbers (1-indexed) that contain the supporting quote."),
  evidenceQuote: z
    .string()
    .min(1)
    .describe("A short verbatim excerpt from the provided OCR Markdown that supports this candidate."),
  summary: z.string().min(1).describe("One- or two-sentence summary of the candidate, in your own words."),
} as const;

function draftVariant<TType extends DocumentEvidenceCandidateType>(
  candidateType: TType,
  description: string,
  fields: z.ZodObject,
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
    metricName: z.string().optional(),
    valueNumeric: z.number().optional(),
    valueQualifier: z.string().optional().describe("Qualifier such as \"approximately\" or \"up to\"."),
    unit: z.string().optional(),
    baselinePeriodStart: z.string().optional().describe("ISO date or YYYY-MM."),
    baselinePeriodEnd: z.string().optional().describe("ISO date or YYYY-MM."),
    comparisonPeriodStart: z.string().optional().describe("ISO date or YYYY-MM."),
    comparisonPeriodEnd: z.string().optional().describe("ISO date or YYYY-MM."),
    geographyScope: z.string().optional(),
    methodology: z.string().optional(),
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
      .string()
      .optional()
      .describe(
        "proposed, planning, implementing, monitoring, complete, canceled, or superseded.",
      ),
    statusAsOfDate: z.string().optional().describe("ISO date or YYYY-MM."),
    phase: z.string().optional(),
  })
  .passthrough();

const treatmentComponentFields = z
  .object({
    treatmentType: z
      .string()
      .optional()
      .describe(
        "Treatment family: bus_lane, busway, transit_signal_priority, queue_jump, stop_consolidation, ace, red_paint, bus_bulb, etc.",
      ),
    implementationStatus: z
      .string()
      .optional()
      .describe("proposed, planned, implemented, or removed."),
  })
  .passthrough();

const serviceChangeFields = z
  .object({
    changeType: z
      .string()
      .optional()
      .describe(
        "route_added, route_discontinued, route_modified, stop_added, stop_removed, frequency_change, headway_change, terminus_change.",
      ),
    effectiveDate: z.string().optional().describe("ISO date or YYYY-MM."),
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
      .describe("What is missing, e.g. \"no stop-level table\" or \"no TSP inventory\"."),
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
  draftVariant(
    "document_claim_candidate",
    "A single source-backed non-metric claim.",
    claimFields,
  ),
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

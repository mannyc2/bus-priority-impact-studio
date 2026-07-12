import { Effect, Schema } from "effect";
import { registerProjectSchema } from "../../schema-registry.js";

export const DocumentCandidateValidationStateSchema = Schema.Literals([
  "unvalidated",
  "validated",
  "needs_review",
  "rejected",
]);

export type DocumentCandidateValidationState = typeof DocumentCandidateValidationStateSchema.Type;

export const DocumentFactClassificationSchema = Schema.Literals([
  "official_fact",
  "official_claim",
  "third_party_evaluation",
  "context",
  "caveat",
  "methodology",
  "source_gap",
]);

export type DocumentFactClassification = typeof DocumentFactClassificationSchema.Type;

export const DocumentNegativeEvidenceFlagSchema = Schema.Literals([
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

export type DocumentNegativeEvidenceFlag = typeof DocumentNegativeEvidenceFlagSchema.Type;

export const DocumentEvidenceCandidateTypeSchema = Schema.Literals([
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

export type DocumentEvidenceCandidateType = typeof DocumentEvidenceCandidateTypeSchema.Type;

export const DocumentCandidatePayloadSchema = Schema.Record(Schema.String, Schema.Unknown);

export type DocumentCandidatePayload = typeof DocumentCandidatePayloadSchema.Type;

const DocumentEvidenceCandidateDraftObjectSchema = Schema.Struct({
  candidateType: DocumentEvidenceCandidateTypeSchema,
  factClassification: DocumentFactClassificationSchema,
  negativeEvidenceFlag: DocumentNegativeEvidenceFlagSchema.pipe(
    Schema.withDecodingDefaultType(Effect.succeed("none")),
  ),
  routeMentions: Schema.Array(Schema.String.check(Schema.isMinLength(1))).pipe(
    Schema.withDecodingDefaultType(Effect.succeed([])),
  ),
  corridorMentions: Schema.Array(Schema.String.check(Schema.isMinLength(1))).pipe(
    Schema.withDecodingDefaultType(Effect.succeed([])),
  ),
  evidencePageRefs: Schema.Array(
    Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
  ).pipe(Schema.withDecodingDefaultType(Effect.succeed([]))),
  evidenceQuote: Schema.String.check(Schema.isMinLength(1)),
  summary: Schema.String.check(Schema.isMinLength(1)),
  fields: DocumentCandidatePayloadSchema.pipe(Schema.withDecodingDefaultType(Effect.succeed({}))),
});

export const DocumentEvidenceCandidateDraftSchema = registerProjectSchema(
  DocumentEvidenceCandidateDraftObjectSchema,
  {
    id: "bp.document_evidence_candidate_draft.v1",
    title: "Document Evidence Candidate Draft",
    description:
      "Source-grounded draft candidate emitted by OCR or review tooling before deterministic validation.",
    stability: "draft",
  },
);

export type DocumentEvidenceCandidateDraft = typeof DocumentEvidenceCandidateDraftSchema.Type;

export const DocumentEvidenceCandidateSchema = registerProjectSchema(
  Schema.Struct({
    ...DocumentEvidenceCandidateDraftObjectSchema.fields,
    ...{
      candidateId: Schema.String.check(Schema.isMinLength(1)),
      sourceId: Schema.String.check(Schema.isMinLength(1)),
      validationState: DocumentCandidateValidationStateSchema,
      reviewReason: Schema.String.check(Schema.isMinLength(1)),
    },
  }),
  {
    id: "bp.document_evidence_candidate.v1",
    title: "Document Evidence Candidate",
    description:
      "Persisted, unvalidated evidence candidate extracted from official or third-party bus documents.",
    stability: "draft",
  },
);

export type DocumentEvidenceCandidate = typeof DocumentEvidenceCandidateSchema.Type;

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
  factClassification: DocumentFactClassificationSchema.annotate({
    description:
      "How this fact relates to its source: official_fact and official_claim come from the publishing agency; third_party_evaluation is an outside assessment; context and caveat narrate; methodology describes how a metric was computed; source_gap is an explicit absence.",
  }),
  negativeEvidenceFlag: DocumentNegativeEvidenceFlagSchema.pipe(
    Schema.withDecodingDefaultType(Effect.succeed("none")),
  ).annotate({
    description:
      'Reason this candidate is negative or weak evidence, when applicable. Use "none" otherwise.',
  }),
  routeMentions: Schema.Array(Schema.String.check(Schema.isMinLength(1)))
    .pipe(Schema.withDecodingDefaultType(Effect.succeed([])))
    .annotate({
      description:
        'Bare MTA route IDs as they appear in the route catalog, e.g. ["B44", "M15"]. Do not append service-mode suffixes like SBS, Limited, or Local; those go on per-type fields when relevant. Use the empty array when no route is named.',
    }),
  corridorMentions: Schema.Array(Schema.String.check(Schema.isMinLength(1)))
    .pipe(Schema.withDecodingDefaultType(Effect.succeed([])))
    .annotate({
      description:
        'Street or avenue names mentioned in the supporting quote, e.g. ["Nostrand Avenue", "14th Street"]. Use the empty array when no corridor is named.',
    }),
  evidencePageRefs: Schema.Array(Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)))
    .pipe(Schema.withDecodingDefaultType(Effect.succeed([])))
    .annotate({
      description: "PDF page numbers (1-indexed) that contain the supporting quote.",
    }),
  evidenceQuote: Schema.String.check(Schema.isMinLength(1)).annotate({
    description:
      "A short verbatim excerpt from the provided OCR Markdown that supports this candidate.",
  }),
  summary: Schema.String.check(Schema.isMinLength(1)).annotate({
    description: "One- or two-sentence summary of the candidate, in your own words.",
  }),
} as const;

const OPTIONAL_PERIOD_DESCRIPTION =
  "ISO date or YYYY-MM. Omit this key entirely when the period is not given in the source; do not emit an empty string.";

// Canonical metric names common in NYC bus-priority documents. Extracted from
// reading the prompt's prior free-text vocabulary; not exhaustive. Use the
// `customMetricName` escape hatch for anything not in the list.
const documentMetricNames = [
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
] as const;
export const DocumentMetricNameSchema = Object.assign(Schema.Literals(documentMetricNames), {
  options: documentMetricNames,
});
export type DocumentMetricName = typeof DocumentMetricNameSchema.Type;

// Canonical treatment families. The same caveat applies: prefer one of these,
// fall back to `customTreatmentType` for anything else.
const documentTreatmentTypes = [
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
] as const;
export const DocumentTreatmentTypeSchema = Object.assign(Schema.Literals(documentTreatmentTypes), {
  options: documentTreatmentTypes,
});
export type DocumentTreatmentType = typeof DocumentTreatmentTypeSchema.Type;

export const DocumentServiceChangeKindSchema = Schema.Literals([
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
export type DocumentServiceChangeKind = typeof DocumentServiceChangeKindSchema.Type;

function draftVariant<
  TType extends DocumentEvidenceCandidateType,
  TFields extends Schema.ConstraintDecoder<unknown, never>,
>(candidateType: TType, description: string, fields: TFields) {
  return Schema.Struct({
    candidateType: Schema.Literal(candidateType),
    ...sharedDraftFields,
    fields,
  }).annotate({ description: description });
}

const claimFields = Schema.Struct({
  claimSubject: Schema.optional(Schema.String).annotate({
    description: "The subject or entity the claim is about.",
  }),
});

const metricClaimFields = Schema.Struct({
  metricName: Schema.optional(DocumentMetricNameSchema).annotate({
    description:
      "Canonical metric name. Pick one of the enum values when it fits; otherwise leave this unset and use customMetricName.",
  }),
  customMetricName: Schema.optional(Schema.String).annotate({
    description:
      "Free-text metric name when no enum value fits. Use only when metricName is unset.",
  }),
  valueNumeric: Schema.optional(Schema.Number).annotate({
    description: "Primary numeric value of the metric.",
  }),
  valueQualifier: Schema.optional(Schema.String).annotate({
    description:
      'Qualifier such as "approximately", "up to", or a range like "15-31%" when the source gives a range rather than a single number.',
  }),
  unit: Schema.optional(Schema.String).annotate({
    description: 'Unit such as "percent", "minutes", "mph", "riders/day".',
  }),
  baselinePeriodStart: Schema.optional(Schema.String).annotate({
    description: OPTIONAL_PERIOD_DESCRIPTION,
  }),
  baselinePeriodEnd: Schema.optional(Schema.String).annotate({
    description: OPTIONAL_PERIOD_DESCRIPTION,
  }),
  comparisonPeriodStart: Schema.optional(Schema.String).annotate({
    description: OPTIONAL_PERIOD_DESCRIPTION,
  }),
  comparisonPeriodEnd: Schema.optional(Schema.String).annotate({
    description: OPTIONAL_PERIOD_DESCRIPTION,
  }),
  geographyScope: Schema.optional(Schema.String).annotate({
    description: 'Scope of the metric, e.g. "B44 corridor", "Brooklyn", "system-wide".',
  }),
  methodology: Schema.optional(Schema.String).annotate({
    description: "Brief description of how the metric was computed if the source explains it.",
  }),
});

const tableFields = Schema.Struct({
  tableCaption: Schema.optional(Schema.String),
  headers: Schema.optional(Schema.Array(Schema.String)),
  rows: Schema.optional(Schema.Array(Schema.Array(Schema.String))),
});

const figureFields = Schema.Struct({
  figureCaption: Schema.optional(Schema.String),
  figureType: Schema.optional(Schema.String).annotate({
    description: "E.g. bar_chart, map, photo, diagram.",
  }),
});

const mapExtentFields = Schema.Struct({
  extentIntersections: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "Named intersections or limits bounding the treatment extent.",
  }),
});

const methodologyFields = Schema.Struct({
  methodology: Schema.optional(Schema.String),
});

const caveatFields = Schema.Struct({});

const projectStatusFields = Schema.Struct({
  status: Schema.optional(
    Schema.Literals([
      "proposed",
      "planning",
      "implementing",
      "monitoring",
      "complete",
      "canceled",
      "superseded",
    ]),
  ).annotate({
    description: "Lifecycle stage of the project as described in the source.",
  }),
  statusAsOfDate: Schema.optional(Schema.String).annotate({
    description: "Date the status was reported. ISO date or YYYY-MM. Omit when no date is given.",
  }),
  phase: Schema.optional(Schema.String).annotate({
    description: "Free-text phase label when the source uses a project-specific phase name.",
  }),
});

const treatmentComponentFields = Schema.Struct({
  treatmentTypes: Schema.optional(Schema.Array(DocumentTreatmentTypeSchema)).annotate({
    description:
      "Treatment families this candidate describes. Use one or more of the enum values; emit one candidate per discrete claim, but list multiple types when the source bundles them together. Use customTreatmentType for anything not in the enum.",
  }),
  customTreatmentType: Schema.optional(Schema.String).annotate({
    description: "Free-text treatment label when no enum value applies.",
  }),
  implementationStatus: Schema.optional(
    Schema.Literals(["proposed", "planned", "implemented", "removed"]),
  ).annotate({
    description: "Lifecycle stage of the treatment as described in the source.",
  }),
  serviceMode: Schema.optional(
    Schema.Literals(["sbs", "local", "limited", "express", "lcl"]),
  ).annotate({
    description:
      "Bus service mode the treatment applies to, when the source distinguishes. SBS = Select Bus Service.",
  }),
});

const serviceChangeFields = Schema.Struct({
  changeTypes: Schema.optional(Schema.Array(DocumentServiceChangeKindSchema)).annotate({
    description:
      "Kinds of service change described. List all that apply, but emit one candidate per discrete change span.",
  }),
  effectiveDate: Schema.optional(Schema.String).annotate({
    description:
      "Date the change took effect. ISO date or YYYY-MM. Omit this key entirely when no date is given.",
  }),
});

const stopOrIntersectionFields = Schema.Struct({
  stopIdIfKnown: Schema.optional(Schema.String),
  intersectionName: Schema.optional(Schema.String),
});

const supersessionFields = Schema.Struct({
  supersedes: Schema.optional(Schema.String).annotate({
    description: "Identifier or title of the source being replaced.",
  }),
  supersededBy: Schema.optional(Schema.String).annotate({
    description: "Identifier or title of the replacing source.",
  }),
  supersessionType: Schema.optional(Schema.String).annotate({
    description: "replaces, amends, cancels, or status_update.",
  }),
});

const sourceGapFields = Schema.Struct({
  sourceGapSubject: Schema.optional(Schema.String).annotate({
    description: 'What is missing, e.g. "no stop-level table" or "no TSP inventory".',
  }),
});

const evidenceLinkFields = Schema.Struct({
  linkedDatasetId: Schema.optional(Schema.String).annotate({
    description: "Identifier of the underlying dataset or table.",
  }),
});

const reviewQuestionFields = Schema.Struct({
  reviewQuestion: Schema.optional(Schema.String),
  proposedAnswer: Schema.optional(Schema.String),
  requiredSource: Schema.optional(Schema.String).annotate({
    description: "What kind of follow-up source would resolve the question.",
  }),
});

export const DocumentEvidenceCandidateDraftToolSchema = Schema.Union([
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

export type DocumentEvidenceCandidateDraftTool =
  typeof DocumentEvidenceCandidateDraftToolSchema.Type;

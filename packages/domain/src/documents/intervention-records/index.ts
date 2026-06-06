import * as z from "zod";
import { registerProjectSchema } from "../../schema-registry.js";
import { DocumentMetricNameSchema, DocumentTreatmentTypeSchema } from "../candidates/index.js";

// ---------------------------------------------------------------------------
// Tier 2 document intervention records (Phase 3 output)
//
// Per-source synthesis of evidence candidates into one or more discrete
// intervention records. Each record carries its supporting candidateIds in
// `evidenceRefs` fields, so downstream consumers can trace any claim back to
// a verbatim source quote.
//
// Two parallel schemas:
//   - `*DraftSchema`: what the model emits via the LLM tool. No recordId,
//     no extraction metadata. Used to generate the tool's JSON Schema.
//   - `*Schema`: the persisted shape, after the pipeline assigns recordIds
//     and attaches extraction provenance.
// ---------------------------------------------------------------------------

export const DocumentInterventionStatusSchema = z.enum([
  "proposed",
  "planning",
  "implementing",
  "monitoring",
  "complete",
  "canceled",
  "superseded",
]);
export type DocumentInterventionStatus = z.output<typeof DocumentInterventionStatusSchema>;

export const DocumentInterventionServiceModeSchema = z.enum(["sbs", "local", "limited", "express"]);
export type DocumentInterventionServiceMode = z.output<
  typeof DocumentInterventionServiceModeSchema
>;

export const DocumentInterventionDatePrecisionSchema = z.enum(["day", "month", "year"]);
export type DocumentInterventionDatePrecision = z.output<
  typeof DocumentInterventionDatePrecisionSchema
>;

// Pipeline-computed discriminator. `proposed` means every supporting candidate
// is flagged proposed-only; `implemented` means at least one candidate reports
// the intervention as in service or complete; `in_progress` is the middle
// ground (planning, designing, monitoring). The model does not assign this
// directly — Phase 3 post-processing derives it from candidate fields.
export const DocumentInterventionRecordKindSchema = z.enum([
  "implemented",
  "in_progress",
  "proposed",
]);
export type DocumentInterventionRecordKind = z.output<typeof DocumentInterventionRecordKindSchema>;

// ---------------------------------------------------------------------------
// Intervention-record quality vocabulary
//
// Closed sets of issue/repair codes emitted by the deterministic
// intervention-records policy (`@bp/applied-research/intervention-records`)
// and consumed by the pipeline's artifact-summary counters. Promoted here so
// the policy and the counters share a single source of truth.
// ---------------------------------------------------------------------------

export type Tier2InterventionRecordQualityIssueCode =
  | "metric_value_numeric_not_supported_by_evidence_refs"
  | "corridor_extent_endpoints_not_supported_by_evidence"
  // Source-level signal: a model-emitted record was dropped before
  // persistence because its supporting candidates were context-only
  // (methodology, claims, fare policy, etc.). Surfaced via the source's
  // droppedNoInterventionEvidenceCount summary, not on any persisted record.
  | "phase3_record_dropped_no_intervention_evidence";

export type Tier2InterventionRecordQualityRepairCode =
  | "status_history_coerced_to_proposed_only"
  | "phase3_record_schema_alias_repaired"
  | "phase3_record_invalid_enum_stripped"
  | "phase3_record_label_conflict_repaired"
  | "phase3_record_merged_from_route_buckets";

export const INTERVENTION_RECORD_QUALITY_ISSUE_CODES: readonly Tier2InterventionRecordQualityIssueCode[] =
  [
    "metric_value_numeric_not_supported_by_evidence_refs",
    "corridor_extent_endpoints_not_supported_by_evidence",
    "phase3_record_dropped_no_intervention_evidence",
  ];

export const INTERVENTION_RECORD_QUALITY_REPAIR_CODES: readonly Tier2InterventionRecordQualityRepairCode[] =
  [
    "status_history_coerced_to_proposed_only",
    "phase3_record_schema_alias_repaired",
    "phase3_record_invalid_enum_stripped",
    "phase3_record_label_conflict_repaired",
    "phase3_record_merged_from_route_buckets",
  ];

export function isInterventionRecordQualityIssueCode(
  value: string,
): value is Tier2InterventionRecordQualityIssueCode {
  return (INTERVENTION_RECORD_QUALITY_ISSUE_CODES as readonly string[]).includes(value);
}

export function isInterventionRecordQualityRepairCode(
  value: string,
): value is Tier2InterventionRecordQualityRepairCode {
  return (INTERVENTION_RECORD_QUALITY_REPAIR_CODES as readonly string[]).includes(value);
}

const evidenceRefList = z
  .array(z.string().min(1))
  .describe(
    "Candidate IDs that back this entry. Every ID must be one of the candidateIds supplied in the request; do not invent IDs.",
  );

const StatusObservationDraftSchema = z
  .object({
    status: DocumentInterventionStatusSchema.describe(
      "Lifecycle stage observed in a particular candidate or candidate cluster.",
    ),
    asOfDate: z
      .string()
      .optional()
      .describe(
        "When the source observed this status. ISO date or YYYY-MM. Omit if no date is given.",
      ),
    evidenceRefs: evidenceRefList,
  })
  .strict();

const TreatmentComponentDraftSchema = z
  .object({
    treatmentType: DocumentTreatmentTypeSchema.optional().describe(
      "Canonical treatment family for this component. Pick one of the enum values when it fits; otherwise leave unset and use customTreatmentType.",
    ),
    customTreatmentType: z
      .string()
      .optional()
      .describe("Free-text treatment label when no enum value fits."),
    description: z
      .string()
      .min(1)
      .describe(
        "One short sentence describing this treatment component as the source presents it. Stay close to the source's wording.",
      ),
    evidenceRefs: evidenceRefList,
  })
  .strict()
  .describe(
    "A single treatment component. Emit one entry per distinct treatment, even when multiple are bundled in one source sentence.",
  );

const PeriodDraftSchema = z
  .object({
    start: z
      .string()
      .optional()
      .describe("ISO date or YYYY-MM. Omit if the source gives no start."),
    end: z.string().optional().describe("ISO date or YYYY-MM. Omit if the source gives no end."),
  })
  .strict();

const MetricDraftSchema = z
  .object({
    metricName: DocumentMetricNameSchema.optional().describe(
      "Canonical metric name. Pick from the enum when it fits; otherwise leave unset and use customMetricName.",
    ),
    customMetricName: z
      .string()
      .optional()
      .describe("Free-text metric name when no enum value fits."),
    valueNumeric: z
      .number()
      .optional()
      .describe("Primary numeric value. Omit if the source gives only a qualitative claim."),
    valueQualifier: z
      .string()
      .optional()
      .describe(
        'Range or qualifier such as "15-31%" or "up to 10 minutes". Use when valueNumeric alone loses meaning.',
      ),
    unit: z.string().optional().describe('Unit such as "percent", "minutes", "mph".'),
    baselinePeriod: PeriodDraftSchema.optional().describe(
      "Pre-intervention period for the comparison. Omit the whole object if the source gives no baseline period.",
    ),
    comparisonPeriod: PeriodDraftSchema.optional().describe(
      "Post-intervention period for the comparison. Omit if not given.",
    ),
    geographyScope: z
      .string()
      .optional()
      .describe('Scope of the metric, e.g. "B44 corridor" or "Brooklyn-wide".'),
    methodology: z
      .string()
      .optional()
      .describe("Brief description of how the metric was computed, when the source explains it."),
    evidenceRefs: evidenceRefList,
  })
  .strict();

const CaveatDraftSchema = z
  .object({
    description: z.string().min(1).describe("One short sentence stating the caveat or limitation."),
    evidenceRefs: evidenceRefList,
  })
  .strict();

const CorridorDraftSchema = z
  .object({
    streets: z
      .array(z.string().min(1))
      .describe("Street or avenue names the intervention runs along."),
    extentEndpoints: z
      .object({
        start: z.string().min(1).describe("Named start of the extent."),
        end: z.string().min(1).describe("Named end of the extent."),
      })
      .strict()
      .optional()
      .describe(
        'Named start/end of the corridor when the source gives one. E.g. start "Avenue U", end "Williamsburg Bridge Plaza".',
      ),
    intersections: z
      .array(z.string().min(1))
      .optional()
      .describe("Specific intersections called out in the source."),
  })
  .strict();

export const DocumentInterventionRecordDraftSchema = z
  .object({
    routes: z
      .array(z.string().min(1))
      .describe(
        'Bare MTA route IDs this intervention touches, e.g. ["B44"] or ["M15", "M14A"]. Do not append SBS, Limited, or Local.',
      ),
    serviceMode: DocumentInterventionServiceModeSchema.optional().describe(
      "Bus service mode this intervention applies to, when the source distinguishes.",
    ),
    primaryTreatments: z
      .array(DocumentTreatmentTypeSchema)
      .describe(
        'The headline treatments that define this intervention. Typically 1-3 entries; this is the coarse "what kind of intervention is this" tag.',
      ),
    customTreatments: z
      .array(z.string().min(1))
      .optional()
      .describe("Free-text headline treatments for anything not in the enum. Use sparingly."),
    corridor: CorridorDraftSchema.optional().describe(
      "Where the intervention is. Omit if the source genuinely has no geographic scope (rare).",
    ),
    effectiveDate: z
      .string()
      .optional()
      .describe(
        "When the intervention took effect. ISO date or YYYY-MM. Omit if the source does not give one.",
      ),
    datePrecision: DocumentInterventionDatePrecisionSchema.optional().describe(
      "Precision of effectiveDate. Omit when effectiveDate is omitted.",
    ),
    statusHistory: z
      .array(StatusObservationDraftSchema)
      .default([])
      .describe(
        "Status observations across the source's narrative. Each entry pairs a status with the date the source observed it and the supporting candidate(s). Order earliest-to-latest when datable.",
      ),
    treatmentComponents: z
      .array(TreatmentComponentDraftSchema)
      .default([])
      .describe(
        "Finer-grained treatment components beyond the primaryTreatments tag. One entry per distinct treatment described in the source.",
      ),
    metrics: z
      .array(MetricDraftSchema)
      .default([])
      .describe(
        "Quantitative impacts reported for this intervention. One entry per discrete metric claim.",
      ),
    caveats: z
      .array(CaveatDraftSchema)
      .default([])
      .describe(
        "Source-stated limitations, confounds, or scoping notes that qualify the intervention or its metrics.",
      ),
    notes: z
      .string()
      .optional()
      .describe(
        "Optional aggregator notes about ambiguities or contradictions across candidates. Empty if nothing to flag.",
      ),
  })
  .strict()
  .describe(
    "A single discrete intervention as one source describes it. One source can produce multiple records when it covers separate changes (e.g. an SBS launch and a later RTPI install).",
  );

export type DocumentInterventionRecordDraft = z.output<
  typeof DocumentInterventionRecordDraftSchema
>;

export const DocumentInterventionRecordsToolResponseSchema = z
  .object({
    sourceId: z
      .string()
      .min(1)
      .describe(
        "Echo back the sourceId supplied in the request. Used to verify the model is operating on the intended source.",
      ),
    interventionRecords: z
      .array(DocumentInterventionRecordDraftSchema)
      .max(20)
      .describe(
        "One record per discrete intervention the source describes. Most sources produce 1-3 records; a long planning document might produce more. Return an empty array if the source describes no actionable interventions.",
      ),
    unattachedCandidateIds: z
      .array(z.string().min(1))
      .default([])
      .describe(
        "Candidate IDs that did not belong to any record. Tables, figures, methodology, source_gap, and review_question candidates that no record references go here. This is for transparency; we use it to spot under-extraction.",
      ),
  })
  .strict();

export type DocumentInterventionRecordsToolResponse = z.output<
  typeof DocumentInterventionRecordsToolResponseSchema
>;

// Persisted shape: adds recordId, recordKind, extraction provenance, and
// any deterministic back-fill of statusHistory or routes that the pipeline
// applied after the model returned.
const DocumentInterventionRecordObjectSchema = DocumentInterventionRecordDraftSchema.extend({
  recordId: z.string().min(1),
  sourceId: z.string().min(1),
  recordKind: DocumentInterventionRecordKindSchema,
  evidenceCandidateIds: z
    .array(z.string().min(1))
    .describe("Every candidateId referenced anywhere in this record."),
  extraction: z
    .object({
      candidateExtractionRootName: z.string().min(1),
      candidateRootName: z.string().min(1),
      synthesisRootName: z.string().min(1),
      qualityIssues: z.array(z.string().min(1)).optional(),
      qualityRepairs: z.array(z.string().min(1)).optional(),
      bucketId: z.string().min(1).optional(),
      bucketKind: z.string().min(1).optional(),
    })
    .strict(),
}).strict();

export const DocumentInterventionRecordSchema = registerProjectSchema(
  DocumentInterventionRecordObjectSchema.readonly(),
  {
    id: "bp.document_intervention_record.v1",
    title: "Document Intervention Record",
    description:
      "Per-source synthesis of evidence candidates into a single discrete intervention, with provenance back to the supporting candidateIds.",
    stability: "draft",
  },
);

export type DocumentInterventionRecord = z.output<typeof DocumentInterventionRecordSchema>;

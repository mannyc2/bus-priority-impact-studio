import { Effect, Schema } from "effect";
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

const documentInterventionStatuses = [
  "proposed",
  "planning",
  "implementing",
  "monitoring",
  "complete",
  "canceled",
  "superseded",
] as const;
export const DocumentInterventionStatusSchema = Object.assign(
  Schema.Literals(documentInterventionStatuses),
  { options: documentInterventionStatuses },
);
export type DocumentInterventionStatus = typeof DocumentInterventionStatusSchema.Type;

const documentInterventionServiceModes = ["sbs", "local", "limited", "express"] as const;
export const DocumentInterventionServiceModeSchema = Object.assign(
  Schema.Literals(documentInterventionServiceModes),
  { options: documentInterventionServiceModes },
);
export type DocumentInterventionServiceMode = typeof DocumentInterventionServiceModeSchema.Type;

const documentInterventionDatePrecisions = ["day", "month", "year"] as const;
export const DocumentInterventionDatePrecisionSchema = Object.assign(
  Schema.Literals(documentInterventionDatePrecisions),
  { options: documentInterventionDatePrecisions },
);
export type DocumentInterventionDatePrecision = typeof DocumentInterventionDatePrecisionSchema.Type;

// Pipeline-computed discriminator. `proposed` means every supporting candidate
// is flagged proposed-only; `implemented` means at least one candidate reports
// the intervention as in service or complete; `in_progress` is the middle
// ground (planning, designing, monitoring). The model does not assign this
// directly — Phase 3 post-processing derives it from candidate fields.
export const DocumentInterventionRecordKindSchema = Schema.Literals([
  "implemented",
  "in_progress",
  "proposed",
]);
export type DocumentInterventionRecordKind = typeof DocumentInterventionRecordKindSchema.Type;

// ---------------------------------------------------------------------------
// Intervention-record quality vocabulary
//
// Closed sets of issue/repair codes emitted by the deterministic
// intervention-records policy (`@bp/analytics/interventions`)
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

const evidenceRefList = Schema.Array(Schema.String.check(Schema.isMinLength(1))).annotate({
  description:
    "Candidate IDs that back this entry. Every ID must be one of the candidateIds supplied in the request; do not invent IDs.",
});

const StatusObservationDraftSchema = Schema.Struct({
  status: DocumentInterventionStatusSchema.annotate({
    description: "Lifecycle stage observed in a particular candidate or candidate cluster.",
  }),
  asOfDate: Schema.optional(Schema.String).annotate({
    description:
      "When the source observed this status. ISO date or YYYY-MM. Omit if no date is given.",
  }),
  evidenceRefs: evidenceRefList,
});

const TreatmentComponentDraftSchema = Schema.Struct({
  treatmentType: Schema.optional(DocumentTreatmentTypeSchema).annotate({
    description:
      "Canonical treatment family for this component. Pick one of the enum values when it fits; otherwise leave unset and use customTreatmentType.",
  }),
  customTreatmentType: Schema.optional(Schema.String).annotate({
    description: "Free-text treatment label when no enum value fits.",
  }),
  description: Schema.String.check(Schema.isMinLength(1)).annotate({
    description:
      "One short sentence describing this treatment component as the source presents it. Stay close to the source's wording.",
  }),
  evidenceRefs: evidenceRefList,
}).annotate({
  description:
    "A single treatment component. Emit one entry per distinct treatment, even when multiple are bundled in one source sentence.",
});

const PeriodDraftSchema = Schema.Struct({
  start: Schema.optional(Schema.String).annotate({
    description: "ISO date or YYYY-MM. Omit if the source gives no start.",
  }),
  end: Schema.optional(Schema.String).annotate({
    description: "ISO date or YYYY-MM. Omit if the source gives no end.",
  }),
});

const MetricDraftSchema = Schema.Struct({
  metricName: Schema.optional(DocumentMetricNameSchema).annotate({
    description:
      "Canonical metric name. Pick from the enum when it fits; otherwise leave unset and use customMetricName.",
  }),
  customMetricName: Schema.optional(Schema.String).annotate({
    description: "Free-text metric name when no enum value fits.",
  }),
  valueNumeric: Schema.optional(Schema.Number).annotate({
    description: "Primary numeric value. Omit if the source gives only a qualitative claim.",
  }),
  valueQualifier: Schema.optional(Schema.String).annotate({
    description:
      'Range or qualifier such as "15-31%" or "up to 10 minutes". Use when valueNumeric alone loses meaning.',
  }),
  unit: Schema.optional(Schema.String).annotate({
    description: 'Unit such as "percent", "minutes", "mph".',
  }),
  baselinePeriod: Schema.optional(PeriodDraftSchema).annotate({
    description:
      "Pre-intervention period for the comparison. Omit the whole object if the source gives no baseline period.",
  }),
  comparisonPeriod: Schema.optional(PeriodDraftSchema).annotate({
    description: "Post-intervention period for the comparison. Omit if not given.",
  }),
  geographyScope: Schema.optional(Schema.String).annotate({
    description: 'Scope of the metric, e.g. "B44 corridor" or "Brooklyn-wide".',
  }),
  methodology: Schema.optional(Schema.String).annotate({
    description: "Brief description of how the metric was computed, when the source explains it.",
  }),
  evidenceRefs: evidenceRefList,
});

const CaveatDraftSchema = Schema.Struct({
  description: Schema.String.check(Schema.isMinLength(1)).annotate({
    description: "One short sentence stating the caveat or limitation.",
  }),
  evidenceRefs: evidenceRefList,
});

const CorridorDraftSchema = Schema.Struct({
  streets: Schema.Array(Schema.String.check(Schema.isMinLength(1))).annotate({
    description: "Street or avenue names the intervention runs along.",
  }),
  extentEndpoints: Schema.optional(
    Schema.Struct({
      start: Schema.String.check(Schema.isMinLength(1)).annotate({
        description: "Named start of the extent.",
      }),
      end: Schema.String.check(Schema.isMinLength(1)).annotate({
        description: "Named end of the extent.",
      }),
    }),
  ).annotate({
    description:
      'Named start/end of the corridor when the source gives one. E.g. start "Avenue U", end "Williamsburg Bridge Plaza".',
  }),
  intersections: Schema.optional(Schema.Array(Schema.String.check(Schema.isMinLength(1)))).annotate(
    {
      description: "Specific intersections called out in the source.",
    },
  ),
});

export const DocumentInterventionRecordDraftSchema = Schema.Struct({
  routes: Schema.Array(Schema.String.check(Schema.isMinLength(1))).annotate({
    description:
      'Bare MTA route IDs this intervention touches, e.g. ["B44"] or ["M15", "M14A"]. Do not append SBS, Limited, or Local.',
  }),
  serviceMode: Schema.optional(DocumentInterventionServiceModeSchema).annotate({
    description: "Bus service mode this intervention applies to, when the source distinguishes.",
  }),
  primaryTreatments: Schema.Array(DocumentTreatmentTypeSchema).annotate({
    description:
      'The headline treatments that define this intervention. Typically 1-3 entries; this is the coarse "what kind of intervention is this" tag.',
  }),
  customTreatments: Schema.optional(
    Schema.Array(Schema.String.check(Schema.isMinLength(1))),
  ).annotate({
    description: "Free-text headline treatments for anything not in the enum. Use sparingly.",
  }),
  corridor: Schema.optional(CorridorDraftSchema).annotate({
    description:
      "Where the intervention is. Omit if the source genuinely has no geographic scope (rare).",
  }),
  effectiveDate: Schema.optional(Schema.String).annotate({
    description:
      "When the intervention took effect. ISO date or YYYY-MM. Omit if the source does not give one.",
  }),
  datePrecision: Schema.optional(DocumentInterventionDatePrecisionSchema).annotate({
    description: "Precision of effectiveDate. Omit when effectiveDate is omitted.",
  }),
  statusHistory: Schema.mutable(Schema.Array(StatusObservationDraftSchema))
    .pipe(Schema.withDecodingDefaultType(Effect.succeed([])))
    .annotate({
      description:
        "Status observations across the source's narrative. Each entry pairs a status with the date the source observed it and the supporting candidate(s). Order earliest-to-latest when datable.",
    }),
  treatmentComponents: Schema.Array(TreatmentComponentDraftSchema)
    .pipe(Schema.withDecodingDefaultType(Effect.succeed([])))
    .annotate({
      description:
        "Finer-grained treatment components beyond the primaryTreatments tag. One entry per distinct treatment described in the source.",
    }),
  metrics: Schema.Array(MetricDraftSchema)
    .pipe(Schema.withDecodingDefaultType(Effect.succeed([])))
    .annotate({
      description:
        "Quantitative impacts reported for this intervention. One entry per discrete metric claim.",
    }),
  caveats: Schema.Array(CaveatDraftSchema)
    .pipe(Schema.withDecodingDefaultType(Effect.succeed([])))
    .annotate({
      description:
        "Source-stated limitations, confounds, or scoping notes that qualify the intervention or its metrics.",
    }),
  notes: Schema.optional(Schema.String).annotate({
    description:
      "Optional aggregator notes about ambiguities or contradictions across candidates. Empty if nothing to flag.",
  }),
}).annotate({
  description:
    "A single discrete intervention as one source describes it. One source can produce multiple records when it covers separate changes (e.g. an SBS launch and a later RTPI install).",
});

export type DocumentInterventionRecordDraft = typeof DocumentInterventionRecordDraftSchema.Type;

export const DocumentInterventionRecordsToolResponseSchema = Schema.Struct({
  sourceId: Schema.String.check(Schema.isMinLength(1)).annotate({
    description:
      "Echo back the sourceId supplied in the request. Used to verify the model is operating on the intended source.",
  }),
  interventionRecords: Schema.Array(DocumentInterventionRecordDraftSchema)
    .check(Schema.isMaxLength(20))
    .annotate({
      description:
        "One record per discrete intervention the source describes. Most sources produce 1-3 records; a long planning document might produce more. Return an empty array if the source describes no actionable interventions.",
    }),
  unattachedCandidateIds: Schema.mutable(Schema.Array(Schema.String.check(Schema.isMinLength(1))))
    .pipe(Schema.withDecodingDefaultType(Effect.succeed([])))
    .annotate({
      description:
        "Candidate IDs that did not belong to any record. Tables, figures, methodology, source_gap, and review_question candidates that no record references go here. This is for transparency; we use it to spot under-extraction.",
    }),
});

export type DocumentInterventionRecordsToolResponse =
  typeof DocumentInterventionRecordsToolResponseSchema.Type;

// Persisted shape: adds recordId, recordKind, extraction provenance, and
// any deterministic back-fill of statusHistory or routes that the pipeline
// applied after the model returned.
const DocumentInterventionRecordObjectSchema = Schema.Struct({
  ...DocumentInterventionRecordDraftSchema.fields,
  ...{
    recordId: Schema.String.check(Schema.isMinLength(1)),
    sourceId: Schema.String.check(Schema.isMinLength(1)),
    recordKind: DocumentInterventionRecordKindSchema,
    evidenceCandidateIds: Schema.Array(Schema.String.check(Schema.isMinLength(1))).annotate({
      description: "Every candidateId referenced anywhere in this record.",
    }),
    extraction: Schema.Struct({
      candidateExtractionRootName: Schema.String.check(Schema.isMinLength(1)),
      candidateRootName: Schema.String.check(Schema.isMinLength(1)),
      synthesisRootName: Schema.String.check(Schema.isMinLength(1)),
      qualityIssues: Schema.optional(Schema.Array(Schema.String.check(Schema.isMinLength(1)))),
      qualityRepairs: Schema.optional(Schema.Array(Schema.String.check(Schema.isMinLength(1)))),
      bucketId: Schema.optional(Schema.String.check(Schema.isMinLength(1))),
      bucketKind: Schema.optional(Schema.String.check(Schema.isMinLength(1))),
    }),
  },
});

export const DocumentInterventionRecordSchema = registerProjectSchema(
  DocumentInterventionRecordObjectSchema,
  {
    id: "bp.document_intervention_record.v1",
    title: "Document Intervention Record",
    description:
      "Per-source synthesis of evidence candidates into a single discrete intervention, with provenance back to the supporting candidateIds.",
    stability: "draft",
  },
);

export type DocumentInterventionRecord = typeof DocumentInterventionRecordSchema.Type;

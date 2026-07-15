import { Schema } from "effect";
import { DocumentTreatmentTypeSchema } from "../documents/candidates/index.js";
import {
  DocumentInterventionDatePrecisionSchema,
  DocumentInterventionRecordKindSchema,
  DocumentInterventionStatusSchema,
} from "../documents/intervention-records/index.js";

const NonEmptyStringSchema = Schema.String.check(Schema.isMinLength(1));
const Sha256Schema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
const NonNegativeIntegerSchema = Schema.Number.check(Schema.isInt()).check(
  Schema.isGreaterThanOrEqualTo(0),
);

export const StudioInterventionCorpusSourceSchema = Schema.Struct({
  path: NonEmptyStringSchema,
  version: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
  generatedAt: NonEmptyStringSchema,
  recordCount: NonNegativeIntegerSchema,
  sha256: Sha256Schema,
});
export type StudioInterventionCorpusSource = typeof StudioInterventionCorpusSourceSchema.Type;

export const StudioInterventionCorpusRecordSchema = Schema.Struct({
  recordId: NonEmptyStringSchema,
  routes: Schema.Array(NonEmptyStringSchema),
  primaryTreatments: Schema.Array(DocumentTreatmentTypeSchema),
  customTreatments: Schema.Array(NonEmptyStringSchema),
  title: NonEmptyStringSchema,
  effectiveDate: Schema.NullOr(NonEmptyStringSchema),
  datePrecision: Schema.NullOr(DocumentInterventionDatePrecisionSchema),
  recordKind: DocumentInterventionRecordKindSchema,
  statusLatest: Schema.NullOr(DocumentInterventionStatusSchema),
  corridorStreets: Schema.Array(NonEmptyStringSchema),
  /** Outcome-window display hint; never sufficient for causal study admission. */
  evaluableInWindow: Schema.Boolean,
  sourceId: NonEmptyStringSchema,
  sourceLabel: NonEmptyStringSchema,
  sourceUrl: Schema.NullOr(NonEmptyStringSchema),
  caveatCount: NonNegativeIntegerSchema,
  matchedRegistryEventIds: Schema.Array(NonEmptyStringSchema),
});
export type StudioInterventionCorpusRecord = typeof StudioInterventionCorpusRecordSchema.Type;

export const StudioInterventionCorpusSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  generatedAt: NonEmptyStringSchema,
  sourceCorpus: StudioInterventionCorpusSourceSchema,
  records: Schema.Array(StudioInterventionCorpusRecordSchema).check(Schema.isMaxLength(400)),
});
export type StudioInterventionCorpus = typeof StudioInterventionCorpusSchema.Type;

export const StudioInterventionCorpusRegistryEventSchema = Schema.Struct({
  eventId: NonEmptyStringSchema,
  routeId: NonEmptyStringSchema,
  treatmentFamily: NonEmptyStringSchema,
  implementationMonth: NonEmptyStringSchema,
  sourceId: NonEmptyStringSchema,
  program: NonEmptyStringSchema,
});
export type StudioInterventionCorpusRegistryEvent =
  typeof StudioInterventionCorpusRegistryEventSchema.Type;

export const StudioInterventionCorpusReconciliationRecordSchema = Schema.Struct({
  recordId: NonEmptyStringSchema,
  routes: Schema.Array(NonEmptyStringSchema),
  treatmentFamilies: Schema.Array(NonEmptyStringSchema),
  effectiveDate: NonEmptyStringSchema,
  implementationMonth: NonEmptyStringSchema,
  sourceId: NonEmptyStringSchema,
  sourceLabel: NonEmptyStringSchema,
  title: NonEmptyStringSchema,
  matchedRegistryEventIds: Schema.Array(NonEmptyStringSchema),
  conflictingRegistryEventIds: Schema.Array(NonEmptyStringSchema),
  studyReadinessIssues: Schema.Array(NonEmptyStringSchema),
});
export type StudioInterventionCorpusReconciliationRecord =
  typeof StudioInterventionCorpusReconciliationRecordSchema.Type;

export const StudioInterventionCorpusReconciliationSummarySchema = Schema.Struct({
  corpusRecordCount: NonNegativeIntegerSchema,
  datedCorpusRecordCount: NonNegativeIntegerSchema,
  undatedCorpusRecordCount: NonNegativeIntegerSchema,
  monthReadyCorpusRecordCount: NonNegativeIntegerSchema,
  datePrecisionInsufficientCount: NonNegativeIntegerSchema,
  registryEventCount: NonNegativeIntegerSchema,
  matchedCorpusRecordCount: NonNegativeIntegerSchema,
  corpusOnlyEvaluableCount: NonNegativeIntegerSchema,
  corpusOnlyPreWindowCount: NonNegativeIntegerSchema,
  corpusOnlyPostWindowCount: NonNegativeIntegerSchema,
  notStudyReadyCount: NonNegativeIntegerSchema,
  registryOnlyCount: NonNegativeIntegerSchema,
  dateConflictCount: NonNegativeIntegerSchema,
});

export const StudioInterventionCorpusReconciliationSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  generatedAt: NonEmptyStringSchema,
  analysisWindow: Schema.Struct({
    startMonth: NonEmptyStringSchema,
    endMonth: NonEmptyStringSchema,
  }),
  summary: StudioInterventionCorpusReconciliationSummarySchema,
  matched: Schema.Array(StudioInterventionCorpusReconciliationRecordSchema).check(
    Schema.isMaxLength(400),
  ),
  corpusOnlyEvaluable: Schema.Array(StudioInterventionCorpusReconciliationRecordSchema).check(
    Schema.isMaxLength(400),
  ),
  corpusOnlyPreWindow: Schema.Array(StudioInterventionCorpusReconciliationRecordSchema).check(
    Schema.isMaxLength(400),
  ),
  corpusOnlyPostWindow: Schema.Array(StudioInterventionCorpusReconciliationRecordSchema).check(
    Schema.isMaxLength(400),
  ),
  notStudyReady: Schema.Array(StudioInterventionCorpusReconciliationRecordSchema).check(
    Schema.isMaxLength(400),
  ),
  dateConflicts: Schema.Array(StudioInterventionCorpusReconciliationRecordSchema).check(
    Schema.isMaxLength(400),
  ),
  registryOnly: Schema.Array(StudioInterventionCorpusRegistryEventSchema).check(
    Schema.isMaxLength(1_000),
  ),
});
export type StudioInterventionCorpusReconciliation =
  typeof StudioInterventionCorpusReconciliationSchema.Type;

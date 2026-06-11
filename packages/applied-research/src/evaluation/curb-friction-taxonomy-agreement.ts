import { z } from "zod";

export const CurbFrictionTaxonomyAgreementCategorySchema = z.enum([
  "double_parking",
  "blocked_lane",
  "blocked_driveway",
  "blocked_hydrant",
  "blocked_bus_stop",
]);
export const CurbFrictionTaxonomyAgreementJoinConfidenceSchema = z.enum([
  "high",
  "medium",
  "low",
  "not_evaluable",
]);

const nullableCategory = CurbFrictionTaxonomyAgreementCategorySchema.nullable();
const nullableJoinConfidence = CurbFrictionTaxonomyAgreementJoinConfidenceSchema.nullable();
const nullableNumber = z.number().nullable();
const nullableString = z.string().nullable();

export const CurbFrictionTaxonomyAgreementInputRowSchema = z
  .object({
    uniqueKey: z.string().min(1),
    createdDate: nullableString.optional(),
    complaintType: nullableString,
    descriptor: nullableString,
    incidentAddress: nullableString.optional(),
    streetName: nullableString.optional(),
    geocodeConfidence: nullableString.optional(),
    expectedCategory: nullableCategory,
    actualCategory: nullableCategory,
    physicalId: nullableString.optional(),
    routeIds: z.array(z.string().min(1)).optional(),
    routeFanout: z.number().int().nonnegative().nullable().optional(),
    maxOverlapMeters: nullableNumber.optional(),
    segmentBorough: nullableString.optional(),
    expectedJoinConfidence: nullableJoinConfidence.optional(),
    actualJoinConfidence: nullableJoinConfidence.optional(),
    joinReviewNote: nullableString.optional(),
    reviewer: nullableString.optional(),
    reviewedAt: nullableString.optional(),
  })
  .strict();

export const CurbFrictionTaxonomyAgreementAuditRowSchema =
  CurbFrictionTaxonomyAgreementInputRowSchema.extend({
    createdDate: nullableString,
    incidentAddress: nullableString,
    streetName: nullableString,
    geocodeConfidence: nullableString,
    physicalId: nullableString,
    routeIds: z.array(z.string().min(1)),
    routeFanout: z.number().int().nonnegative().nullable(),
    maxOverlapMeters: nullableNumber,
    segmentBorough: nullableString,
    expectedJoinConfidence: nullableJoinConfidence,
    actualJoinConfidence: nullableJoinConfidence,
    joinReviewNote: nullableString,
    reviewer: nullableString,
    reviewedAt: nullableString,
    categoryAgrees: z.boolean(),
    joinAgrees: z.boolean().nullable(),
    agrees: z.boolean(),
  }).strict();

export const CurbFrictionTaxonomyAgreementAuditSchema = z
  .object({
    artifactKind: z.literal("311_curb_friction_taxonomy_agreement_audit"),
    schemaVersion: z.literal(1),
    generatedAt: z.string().min(1),
    minimumSampleSize: z.number().int().positive(),
    sampleSize: z.number().int().nonnegative(),
    agreementCount: z.number().int().nonnegative(),
    agreementRate: z.number().min(0).max(1),
    categoryAgreementCount: z.number().int().nonnegative(),
    categoryAgreementRate: z.number().min(0).max(1),
    joinEvaluableCount: z.number().int().nonnegative(),
    joinAgreementCount: z.number().int().nonnegative(),
    joinAgreementRate: z.number().min(0).max(1).nullable(),
    rows: z.array(CurbFrictionTaxonomyAgreementAuditRowSchema),
  })
  .strict();

export type CurbFrictionTaxonomyAgreementCategory = z.output<
  typeof CurbFrictionTaxonomyAgreementCategorySchema
>;
export type CurbFrictionTaxonomyAgreementJoinConfidence = z.output<
  typeof CurbFrictionTaxonomyAgreementJoinConfidenceSchema
>;
export type CurbFrictionTaxonomyAgreementInputRow = z.input<
  typeof CurbFrictionTaxonomyAgreementInputRowSchema
>;
export type CurbFrictionTaxonomyAgreementAuditRow = z.output<
  typeof CurbFrictionTaxonomyAgreementAuditRowSchema
>;
export type CurbFrictionTaxonomyAgreementAudit = z.output<
  typeof CurbFrictionTaxonomyAgreementAuditSchema
>;

export type BuildCurbFrictionTaxonomyAgreementAuditInput = {
  readonly rows: readonly CurbFrictionTaxonomyAgreementInputRow[];
  readonly generatedAt?: string | undefined;
  readonly minimumSampleSize?: number | undefined;
};

export function buildCurbFrictionTaxonomyAgreementAudit(
  input: BuildCurbFrictionTaxonomyAgreementAuditInput,
): CurbFrictionTaxonomyAgreementAudit {
  const minimumSampleSize = input.minimumSampleSize ?? 50;
  if (input.rows.length < minimumSampleSize) {
    throw new Error(
      `311 curb-friction taxonomy agreement audit requires at least ${minimumSampleSize} hand-checked rows; got ${input.rows.length}.`,
    );
  }

  const rows = input.rows.map((row) => {
    const parsed = CurbFrictionTaxonomyAgreementInputRowSchema.parse(row);
    const expectedJoinConfidence = parsed.expectedJoinConfidence ?? null;
    const actualJoinConfidence = parsed.actualJoinConfidence ?? null;
    const joinIsEvaluable =
      expectedJoinConfidence !== null &&
      actualJoinConfidence !== null &&
      expectedJoinConfidence !== "not_evaluable" &&
      actualJoinConfidence !== "not_evaluable";
    const joinAgrees = joinIsEvaluable ? expectedJoinConfidence === actualJoinConfidence : null;
    const categoryAgrees = parsed.expectedCategory === parsed.actualCategory;
    return {
      ...parsed,
      createdDate: parsed.createdDate ?? null,
      incidentAddress: parsed.incidentAddress ?? null,
      streetName: parsed.streetName ?? null,
      geocodeConfidence: parsed.geocodeConfidence ?? null,
      physicalId: parsed.physicalId ?? null,
      routeIds: parsed.routeIds ?? [],
      routeFanout: parsed.routeFanout ?? null,
      maxOverlapMeters: parsed.maxOverlapMeters ?? null,
      segmentBorough: parsed.segmentBorough ?? null,
      expectedJoinConfidence,
      actualJoinConfidence,
      joinReviewNote: parsed.joinReviewNote ?? null,
      reviewer: parsed.reviewer ?? null,
      reviewedAt: parsed.reviewedAt ?? null,
      categoryAgrees,
      joinAgrees,
      agrees: categoryAgrees,
    };
  });
  const categoryAgreementCount = rows.filter((row) => row.categoryAgrees).length;
  const joinEvaluableRows = rows.filter((row) => row.joinAgrees !== null);
  const joinAgreementCount = joinEvaluableRows.filter((row) => row.joinAgrees).length;

  return CurbFrictionTaxonomyAgreementAuditSchema.parse({
    artifactKind: "311_curb_friction_taxonomy_agreement_audit",
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    minimumSampleSize,
    sampleSize: rows.length,
    agreementCount: categoryAgreementCount,
    agreementRate: categoryAgreementCount / rows.length,
    categoryAgreementCount,
    categoryAgreementRate: categoryAgreementCount / rows.length,
    joinEvaluableCount: joinEvaluableRows.length,
    joinAgreementCount,
    joinAgreementRate:
      joinEvaluableRows.length === 0 ? null : joinAgreementCount / joinEvaluableRows.length,
    rows,
  });
}

import { z } from "zod";

export const CurbFrictionTaxonomyAgreementCategorySchema = z.enum([
  "double_parking",
  "blocked_lane",
  "blocked_driveway",
  "blocked_hydrant",
  "blocked_bus_stop",
]);

const nullableCategory = CurbFrictionTaxonomyAgreementCategorySchema.nullable();
const nullableString = z.string().nullable();

export const CurbFrictionTaxonomyAgreementInputRowSchema = z
  .object({
    uniqueKey: z.string().min(1),
    complaintType: nullableString,
    descriptor: nullableString,
    expectedCategory: nullableCategory,
    actualCategory: nullableCategory,
    reviewer: nullableString.optional(),
    reviewedAt: nullableString.optional(),
  })
  .strict();

export const CurbFrictionTaxonomyAgreementAuditRowSchema =
  CurbFrictionTaxonomyAgreementInputRowSchema.extend({
    reviewer: nullableString,
    reviewedAt: nullableString,
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
    rows: z.array(CurbFrictionTaxonomyAgreementAuditRowSchema),
  })
  .strict();

export type CurbFrictionTaxonomyAgreementCategory = z.output<
  typeof CurbFrictionTaxonomyAgreementCategorySchema
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
    return {
      ...parsed,
      reviewer: parsed.reviewer ?? null,
      reviewedAt: parsed.reviewedAt ?? null,
      agrees: parsed.expectedCategory === parsed.actualCategory,
    };
  });
  const agreementCount = rows.filter((row) => row.agrees).length;

  return CurbFrictionTaxonomyAgreementAuditSchema.parse({
    artifactKind: "311_curb_friction_taxonomy_agreement_audit",
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    minimumSampleSize,
    sampleSize: rows.length,
    agreementCount,
    agreementRate: agreementCount / rows.length,
    rows,
  });
}

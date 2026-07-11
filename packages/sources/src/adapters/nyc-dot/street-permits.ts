import { decodePreserve } from "@bp/domain/decode";
import { Schema, SchemaGetter } from "effect";
import type { SocrataRow } from "../../core/index.js";
import { schemaVersion } from "../../core/index.js";

export const PermitKindSchema = Schema.Literals(["construction", "opening"]);
export type PermitKind = typeof PermitKindSchema.Type;

/**
 * The NYC Socrata datasets `tqtj-sjs8` ("Street Construction") and `9jic-byiu`
 * ("Street Opening") are *aliases of the same underlying table* — both serve
 * identical rows. The real construction-vs-opening distinction lives in the
 * row's `permit_type_desc`. Keyword match: utility / repair work classifies
 * as "opening" (excavation to access subsurface infrastructure); everything
 * else is "construction".
 */
const OPENING_KEYWORDS =
  /\b(REPAIR|UTILITY|GAS|WATER|SEWER|MANHOLE|CABLE|STEAM|TELEPHONE|ELECTRIC|CONDUIT|MAIN)\b/;

export function classifyPermitKind(permitTypeDesc: string | null | undefined): PermitKind {
  if (permitTypeDesc && OPENING_KEYWORDS.test(permitTypeDesc.toUpperCase())) {
    return "opening";
  }
  return "construction";
}

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const Integer = Schema.Number.check(Schema.isInt());
const NullableString = Schema.NullOr(Schema.String);
const numericNullable = Schema.Unknown.pipe(
  Schema.decodeTo(Schema.NullOr(Schema.Number), {
    decode: SchemaGetter.transform((value) =>
      value === null || value === undefined ? null : Number(value),
    ),
    encode: SchemaGetter.passthrough(),
  }),
);

export const NormalizedDotStreetPermitSchema = Schema.Struct({
  schemaVersion: Schema.Literal(schemaVersion),
  permitNumber: NonEmptyString,
  permitKind: PermitKindSchema,
  applicationTrackingId: NullableString,
  permitTypeId: NullableString,
  permitTypeDesc: NullableString,
  permitStatusId: NullableString,
  permitStatusDesc: NullableString,
  permitSeriesId: NullableString,
  permitSeriesDesc: NullableString,
  applicationTypeShortDesc: NullableString,
  equipmentTypeDesc: NullableString,
  numberOfZones: Schema.NullOr(Integer),
  linearFeet: Schema.NullOr(Schema.Number),
  totalSqFeet: Schema.NullOr(Schema.Number),
  estimatedNumberOfCuts: Schema.NullOr(Integer),
  permitIssueDate: NullableString,
  emergencyIssueDate: NullableString,
  issuedWorkStartDate: NullableString,
  issuedWorkEndDate: NullableString,
  boroughName: NullableString,
  houseNumber: NullableString,
  onStreetName: NullableString,
  fromStreetName: NullableString,
  toStreetName: NullableString,
  purposeComments: NullableString,
});

export type NormalizedDotStreetPermit = typeof NormalizedDotStreetPermitSchema.Type;

const RawPermitRowSchema = Schema.Struct({
  permitnumber: NonEmptyString,
  applicationtrackingid: Schema.optionalKey(NullableString),
  permittypeid: Schema.optionalKey(NullableString),
  permittypedesc: Schema.optionalKey(NullableString),
  permitstatusid: Schema.optionalKey(NullableString),
  permitstatusshortdesc: Schema.optionalKey(NullableString),
  permitseriesid: Schema.optionalKey(NullableString),
  permitseriesshortdesc: Schema.optionalKey(NullableString),
  applicationtypeshortdesc: Schema.optionalKey(NullableString),
  equipmenttypedesc: Schema.optionalKey(NullableString),
  permitnumberofzones: Schema.optionalKey(numericNullable),
  permitlinearfeet: Schema.optionalKey(numericNullable),
  permittotalsqfeet: Schema.optionalKey(numericNullable),
  permitestimatednumberofcuts: Schema.optionalKey(numericNullable),
  permitissuedate: Schema.optionalKey(NullableString),
  emergencyissuedate: Schema.optionalKey(NullableString),
  issuedworkstartdate: Schema.optionalKey(NullableString),
  issuedworkenddate: Schema.optionalKey(NullableString),
  boroughname: Schema.optionalKey(NullableString),
  permithousenumber: Schema.optionalKey(NullableString),
  onstreetname: Schema.optionalKey(NullableString),
  fromstreetname: Schema.optionalKey(NullableString),
  tostreetname: Schema.optionalKey(NullableString),
  permitpurposecomments: Schema.optionalKey(NullableString),
});

export function normalizeDotStreetPermitRows(
  rows: SocrataRow[],
  // Retained for back-compat; ignored. permit_kind is now derived per row
  // from permit_type_desc (see classifyPermitKind) because the two source
  // endpoints are aliases of the same table.
  _permitKind: PermitKind,
): NormalizedDotStreetPermit[] {
  return rows
    .map((row) => {
      const parsed = decodePreserve(RawPermitRowSchema)(row);
      return {
        schemaVersion,
        permitNumber: parsed.permitnumber,
        permitKind: classifyPermitKind(parsed.permittypedesc),
        applicationTrackingId: parsed.applicationtrackingid ?? null,
        permitTypeId: parsed.permittypeid ?? null,
        permitTypeDesc: parsed.permittypedesc ?? null,
        permitStatusId: parsed.permitstatusid ?? null,
        permitStatusDesc: parsed.permitstatusshortdesc ?? null,
        permitSeriesId: parsed.permitseriesid ?? null,
        permitSeriesDesc: parsed.permitseriesshortdesc ?? null,
        applicationTypeShortDesc: parsed.applicationtypeshortdesc ?? null,
        equipmentTypeDesc: parsed.equipmenttypedesc ?? null,
        numberOfZones:
          parsed.permitnumberofzones == null ? null : Math.round(parsed.permitnumberofzones),
        linearFeet: parsed.permitlinearfeet ?? null,
        totalSqFeet: parsed.permittotalsqfeet ?? null,
        estimatedNumberOfCuts:
          parsed.permitestimatednumberofcuts == null
            ? null
            : Math.round(parsed.permitestimatednumberofcuts),
        permitIssueDate: parsed.permitissuedate ?? null,
        emergencyIssueDate: parsed.emergencyissuedate ?? null,
        issuedWorkStartDate: parsed.issuedworkstartdate ?? null,
        issuedWorkEndDate: parsed.issuedworkenddate ?? null,
        boroughName: parsed.boroughname ?? null,
        houseNumber: parsed.permithousenumber ?? null,
        onStreetName: parsed.onstreetname ?? null,
        fromStreetName: parsed.fromstreetname ?? null,
        toStreetName: parsed.tostreetname ?? null,
        purposeComments: parsed.permitpurposecomments ?? null,
      } satisfies NormalizedDotStreetPermit;
    })
    .sort((a, b) => a.permitNumber.localeCompare(b.permitNumber));
}

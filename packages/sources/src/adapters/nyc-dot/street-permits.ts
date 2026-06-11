import * as z from "zod";
import type { SocrataRow } from "../../clients/socrata/index.js";
import { schemaVersion } from "../../core/index.js";

export const PermitKindSchema = z.enum(["construction", "opening"]);
export type PermitKind = z.output<typeof PermitKindSchema>;

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

export const NormalizedDotStreetPermitSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    permitNumber: z.string().min(1),
    permitKind: PermitKindSchema,
    applicationTrackingId: z.string().nullable(),
    permitTypeId: z.string().nullable(),
    permitTypeDesc: z.string().nullable(),
    permitStatusId: z.string().nullable(),
    permitStatusDesc: z.string().nullable(),
    permitSeriesId: z.string().nullable(),
    permitSeriesDesc: z.string().nullable(),
    applicationTypeShortDesc: z.string().nullable(),
    equipmentTypeDesc: z.string().nullable(),
    numberOfZones: z.number().int().nullable(),
    linearFeet: z.number().nullable(),
    totalSqFeet: z.number().nullable(),
    estimatedNumberOfCuts: z.number().int().nullable(),
    permitIssueDate: z.string().nullable(),
    emergencyIssueDate: z.string().nullable(),
    issuedWorkStartDate: z.string().nullable(),
    issuedWorkEndDate: z.string().nullable(),
    boroughName: z.string().nullable(),
    houseNumber: z.string().nullable(),
    onStreetName: z.string().nullable(),
    fromStreetName: z.string().nullable(),
    toStreetName: z.string().nullable(),
    purposeComments: z.string().nullable(),
  })
  .strict();

export type NormalizedDotStreetPermit = z.output<typeof NormalizedDotStreetPermitSchema>;

const numericNullable = z
  .union([z.null(), z.undefined(), z.coerce.number()])
  .transform((value) => (value === undefined ? null : value));
const stringNullable = z
  .union([z.null(), z.undefined(), z.string()])
  .transform((value) => (value === undefined ? null : value));

const RawPermitRowSchema = z
  .object({
    permitnumber: z.string().min(1),
    applicationtrackingid: stringNullable,
    permittypeid: stringNullable,
    permittypedesc: stringNullable,
    permitstatusid: stringNullable,
    permitstatusshortdesc: stringNullable,
    permitseriesid: stringNullable,
    permitseriesshortdesc: stringNullable,
    applicationtypeshortdesc: stringNullable,
    equipmenttypedesc: stringNullable,
    permitnumberofzones: numericNullable,
    permitlinearfeet: numericNullable,
    permittotalsqfeet: numericNullable,
    permitestimatednumberofcuts: numericNullable,
    permitissuedate: stringNullable,
    emergencyissuedate: stringNullable,
    issuedworkstartdate: stringNullable,
    issuedworkenddate: stringNullable,
    boroughname: stringNullable,
    permithousenumber: stringNullable,
    onstreetname: stringNullable,
    fromstreetname: stringNullable,
    tostreetname: stringNullable,
    permitpurposecomments: stringNullable,
  })
  .passthrough();

export function normalizeDotStreetPermitRows(
  rows: SocrataRow[],
  // Retained for back-compat; ignored. permit_kind is now derived per row
  // from permit_type_desc (see classifyPermitKind) because the two source
  // endpoints are aliases of the same table.
  _permitKind: PermitKind,
): NormalizedDotStreetPermit[] {
  return rows
    .map((row) => {
      const parsed = RawPermitRowSchema.parse(row);
      return {
        schemaVersion,
        permitNumber: parsed.permitnumber,
        permitKind: classifyPermitKind(parsed.permittypedesc),
        applicationTrackingId: parsed.applicationtrackingid,
        permitTypeId: parsed.permittypeid,
        permitTypeDesc: parsed.permittypedesc,
        permitStatusId: parsed.permitstatusid,
        permitStatusDesc: parsed.permitstatusshortdesc,
        permitSeriesId: parsed.permitseriesid,
        permitSeriesDesc: parsed.permitseriesshortdesc,
        applicationTypeShortDesc: parsed.applicationtypeshortdesc,
        equipmentTypeDesc: parsed.equipmenttypedesc,
        numberOfZones:
          parsed.permitnumberofzones === null ? null : Math.round(parsed.permitnumberofzones),
        linearFeet: parsed.permitlinearfeet,
        totalSqFeet: parsed.permittotalsqfeet,
        estimatedNumberOfCuts:
          parsed.permitestimatednumberofcuts === null
            ? null
            : Math.round(parsed.permitestimatednumberofcuts),
        permitIssueDate: parsed.permitissuedate,
        emergencyIssueDate: parsed.emergencyissuedate,
        issuedWorkStartDate: parsed.issuedworkstartdate,
        issuedWorkEndDate: parsed.issuedworkenddate,
        boroughName: parsed.boroughname,
        houseNumber: parsed.permithousenumber,
        onStreetName: parsed.onstreetname,
        fromStreetName: parsed.fromstreetname,
        toStreetName: parsed.tostreetname,
        purposeComments: parsed.permitpurposecomments,
      } satisfies NormalizedDotStreetPermit;
    })
    .sort((a, b) => a.permitNumber.localeCompare(b.permitNumber));
}

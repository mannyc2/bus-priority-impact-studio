import * as z from "zod";
import type { SocrataRow } from "../socrata/client.js";
import { schemaVersion } from "../mta/parse-helpers.js";

export const PermitKindSchema = z.enum(["construction", "opening"]);
export type PermitKind = z.output<typeof PermitKindSchema>;

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
  })
  .strict();

export type NormalizedDotStreetPermit = z.output<typeof NormalizedDotStreetPermitSchema>;

const numericNullable = z.union([z.null(), z.undefined(), z.coerce.number()]).transform((value) =>
  value === undefined ? null : value,
);
const stringNullable = z.union([z.null(), z.undefined(), z.string()]).transform((value) =>
  value === undefined ? null : value,
);

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
  })
  .passthrough();

export function normalizeDotStreetPermitRows(
  rows: SocrataRow[],
  permitKind: PermitKind,
): NormalizedDotStreetPermit[] {
  return rows
    .map((row) => {
      const parsed = RawPermitRowSchema.parse(row);
      return {
        schemaVersion,
        permitNumber: parsed.permitnumber,
        permitKind,
        applicationTrackingId: parsed.applicationtrackingid,
        permitTypeId: parsed.permittypeid,
        permitTypeDesc: parsed.permittypedesc,
        permitStatusId: parsed.permitstatusid,
        permitStatusDesc: parsed.permitstatusshortdesc,
        permitSeriesId: parsed.permitseriesid,
        permitSeriesDesc: parsed.permitseriesshortdesc,
        applicationTypeShortDesc: parsed.applicationtypeshortdesc,
        equipmentTypeDesc: parsed.equipmenttypedesc,
        numberOfZones: parsed.permitnumberofzones === null ? null : Math.round(parsed.permitnumberofzones),
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
      } satisfies NormalizedDotStreetPermit;
    })
    .sort((a, b) => a.permitNumber.localeCompare(b.permitNumber));
}

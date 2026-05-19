import * as z from "zod";
import type { SocrataRow } from "../socrata/client.js";
import { schemaVersion } from "../mta/parse-helpers.js";

// Bus-relevant NYC parking violation codes (default filter for ingest).
// 5 = Bus Lane Violation; 14 = No Standing Bus Stop; 31 = Stand or Park in
// Bus Stop; 67 = Pedestrian Ramp; 71 = Insp. Sticker Required; 78 = Stand or
// Park within 50 ft of fire hydrant... We default to the explicitly bus-
// related codes; callers can pass a different list via --codes.
export const BUS_RELEVANT_PARKING_CODES = [5, 14, 31, 67] as const;

export const NormalizedParkingViolationSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    summonsNumber: z.string().min(1),
    issueDate: z.string().min(1),
    violationCode: z.number().int(),
    violationDescription: z.string().nullable(),
    plateId: z.string().nullable(),
    registrationState: z.string().nullable(),
    plateType: z.string().nullable(),
    vehicleBodyType: z.string().nullable(),
    vehicleMake: z.string().nullable(),
    issuingAgency: z.string().nullable(),
    violationLocation: z.string().nullable(),
    violationPrecinct: z.number().int().nullable(),
    violationCounty: z.string().nullable(),
    houseNumber: z.string().nullable(),
    streetName: z.string().nullable(),
    violationTime: z.string().nullable(),
  })
  .strict();

export type NormalizedParkingViolation = z.output<typeof NormalizedParkingViolationSchema>;

const strN = z.union([z.null(), z.undefined(), z.string()]).transform((v) => (v === undefined ? null : v));
const intN = z.union([z.null(), z.undefined(), z.coerce.number()]).transform((v) =>
  v === undefined ? null : v === null ? null : Math.round(v),
);

const RawParkingRowSchema = z
  .object({
    summons_number: z.coerce.string(),
    issue_date: z.string().min(1),
    violation_code: z.coerce.number().int(),
    plate_id: strN,
    registration_state: strN,
    plate_type: strN,
    vehicle_body_type: strN,
    vehicle_make: strN,
    issuing_agency: strN,
    violation_location: strN,
    violation_precinct: intN,
    violation_county: strN,
    house_number: strN,
    street_name: strN,
    violation_time: strN,
    violation_description: strN,
  })
  .passthrough();

export function normalizeParkingViolationRows(rows: SocrataRow[]): NormalizedParkingViolation[] {
  return rows
    .map((row) => {
      const p = RawParkingRowSchema.parse(row);
      return {
        schemaVersion,
        summonsNumber: p.summons_number,
        issueDate: p.issue_date.slice(0, 10),
        violationCode: p.violation_code,
        violationDescription: p.violation_description,
        plateId: p.plate_id,
        registrationState: p.registration_state,
        plateType: p.plate_type,
        vehicleBodyType: p.vehicle_body_type,
        vehicleMake: p.vehicle_make,
        issuingAgency: p.issuing_agency,
        violationLocation: p.violation_location,
        violationPrecinct: p.violation_precinct,
        violationCounty: p.violation_county,
        houseNumber: p.house_number,
        streetName: p.street_name,
        violationTime: p.violation_time,
      } satisfies NormalizedParkingViolation;
    })
    .sort((a, b) => a.summonsNumber.localeCompare(b.summonsNumber));
}

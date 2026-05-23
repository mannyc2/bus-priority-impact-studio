import * as z from "zod";
import { schemaVersion } from "../mta/parse-helpers.js";
import type { SocrataRow } from "../socrata/client.js";

// Bus-relevant NYC parking violation codes (default filter for ingest).
//   5  = BUS LANE VIOLATION
//  14  = NO STANDING-DAY/TIME LIMITS (commonly includes peak-hour bus lanes)
//  31  = NO STAND-COMM METER ZONE   (commercial loading near stops)
//  50  = CROSSHATCHED LINES         (intersection blocking — buses can't turn)
//  51  = NO PARKING-STREET CLEANING (alternate-side; affects curb access)
//  67  = NO STND FOR HIRE VEH STOP  (taxi stand interferes with bus stops)
// Callers can override via --codes; 38 (muni-meter receipt) is deliberately
// excluded because it's parking-meter compliance noise, not bus impact.
export const BUS_RELEVANT_PARKING_CODES = [5, 14, 31, 50, 51, 67] as const;

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
    streetCode1: z.string().nullable(),
    streetCode2: z.string().nullable(),
    streetCode3: z.string().nullable(),
    violationLocation: z.string().nullable(),
    violationPrecinct: z.number().int().nullable(),
    violationCounty: z.string().nullable(),
    houseNumber: z.string().nullable(),
    streetName: z.string().nullable(),
    intersectingStreet: z.string().nullable(),
    violationTime: z.string().nullable(),
  })
  .strict();

export type NormalizedParkingViolation = z.output<typeof NormalizedParkingViolationSchema>;

const strN = z
  .union([z.null(), z.undefined(), z.string()])
  .transform((v) => (v === undefined ? null : v));
const intN = z
  .union([z.null(), z.undefined(), z.coerce.number()])
  .transform((v) => (v === undefined ? null : v === null ? null : Math.round(v)));

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
    street_code1: strN,
    street_code2: strN,
    street_code3: strN,
    violation_location: strN,
    violation_precinct: intN,
    violation_county: strN,
    house_number: strN,
    street_name: strN,
    intersecting_street: strN,
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
        streetCode1: p.street_code1,
        streetCode2: p.street_code2,
        streetCode3: p.street_code3,
        violationLocation: p.violation_location,
        violationPrecinct: p.violation_precinct,
        violationCounty: p.violation_county,
        houseNumber: p.house_number,
        streetName: p.street_name,
        intersectingStreet: p.intersecting_street,
        violationTime: p.violation_time,
      } satisfies NormalizedParkingViolation;
    })
    .sort((a, b) => a.summonsNumber.localeCompare(b.summonsNumber));
}

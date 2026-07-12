import { decodePreserve } from "@bp/domain/decode";
import { Schema, SchemaGetter } from "effect";
import type { SocrataRow } from "../../core/index.js";
import { schemaVersion } from "../../core/index.js";

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

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const Integer = Schema.Number.check(Schema.isInt());
const NullableString = Schema.NullOr(Schema.String);
const CoercedString = Schema.Unknown.pipe(
  Schema.decodeTo(Schema.String, {
    decode: SchemaGetter.transform((value) => String(value)),
    encode: SchemaGetter.passthrough(),
  }),
);
const CoercedInteger = Schema.Unknown.pipe(
  Schema.decodeTo(Integer, {
    decode: SchemaGetter.transform((value) => Number(value)),
    encode: SchemaGetter.passthrough(),
  }),
);
const NullableInteger = Schema.Unknown.pipe(
  Schema.decodeTo(Schema.NullOr(Integer), {
    decode: SchemaGetter.transform((value) =>
      value === null || value === undefined ? null : Math.round(Number(value)),
    ),
    encode: SchemaGetter.passthrough(),
  }),
);

export const NormalizedParkingViolationSchema = Schema.Struct({
  schemaVersion: Schema.Literal(schemaVersion),
  summonsNumber: NonEmptyString,
  issueDate: NonEmptyString,
  violationCode: Integer,
  violationDescription: NullableString,
  plateId: NullableString,
  registrationState: NullableString,
  plateType: NullableString,
  vehicleBodyType: NullableString,
  vehicleMake: NullableString,
  issuingAgency: NullableString,
  streetCode1: NullableString,
  streetCode2: NullableString,
  streetCode3: NullableString,
  violationLocation: NullableString,
  violationPrecinct: Schema.NullOr(Integer),
  violationCounty: NullableString,
  houseNumber: NullableString,
  streetName: NullableString,
  intersectingStreet: NullableString,
  violationTime: NullableString,
});

export type NormalizedParkingViolation = typeof NormalizedParkingViolationSchema.Type;

const RawParkingRowSchema = Schema.Struct({
  summons_number: CoercedString,
  issue_date: NonEmptyString,
  violation_code: CoercedInteger,
  plate_id: Schema.optionalKey(NullableString),
  registration_state: Schema.optionalKey(NullableString),
  plate_type: Schema.optionalKey(NullableString),
  vehicle_body_type: Schema.optionalKey(NullableString),
  vehicle_make: Schema.optionalKey(NullableString),
  issuing_agency: Schema.optionalKey(NullableString),
  street_code1: Schema.optionalKey(NullableString),
  street_code2: Schema.optionalKey(NullableString),
  street_code3: Schema.optionalKey(NullableString),
  violation_location: Schema.optionalKey(NullableString),
  violation_precinct: Schema.optionalKey(NullableInteger),
  violation_county: Schema.optionalKey(NullableString),
  house_number: Schema.optionalKey(NullableString),
  street_name: Schema.optionalKey(NullableString),
  intersecting_street: Schema.optionalKey(NullableString),
  violation_time: Schema.optionalKey(NullableString),
  violation_description: Schema.optionalKey(NullableString),
});

export function normalizeParkingViolationRows(rows: SocrataRow[]): NormalizedParkingViolation[] {
  return rows
    .map((row) => {
      const p = decodePreserve(RawParkingRowSchema)(row);
      return {
        schemaVersion,
        summonsNumber: p.summons_number,
        issueDate: p.issue_date.slice(0, 10),
        violationCode: p.violation_code,
        violationDescription: p.violation_description ?? null,
        plateId: p.plate_id ?? null,
        registrationState: p.registration_state ?? null,
        plateType: p.plate_type ?? null,
        vehicleBodyType: p.vehicle_body_type ?? null,
        vehicleMake: p.vehicle_make ?? null,
        issuingAgency: p.issuing_agency ?? null,
        streetCode1: p.street_code1 ?? null,
        streetCode2: p.street_code2 ?? null,
        streetCode3: p.street_code3 ?? null,
        violationLocation: p.violation_location ?? null,
        violationPrecinct: p.violation_precinct ?? null,
        violationCounty: p.violation_county ?? null,
        houseNumber: p.house_number ?? null,
        streetName: p.street_name ?? null,
        intersectingStreet: p.intersecting_street ?? null,
        violationTime: p.violation_time ?? null,
      } satisfies NormalizedParkingViolation;
    })
    .sort((a, b) => a.summonsNumber.localeCompare(b.summonsNumber));
}

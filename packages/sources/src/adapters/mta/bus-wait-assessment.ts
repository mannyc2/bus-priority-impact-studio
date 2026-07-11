import { decodePreserve } from "@bp/domain/decode";
import { RouteIdCodec } from "@bp/domain/primitives";
import { Schema, SchemaGetter } from "effect";
import type { SocrataRow } from "../../core/index.js";
import { IsoMonthStringSchema, schemaVersion } from "../../core/index.js";

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const Integer = Schema.Number.check(Schema.isInt());
const NonNegativeInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
const CoercedInteger = Schema.Unknown.pipe(
  Schema.decodeTo(Integer, {
    decode: SchemaGetter.transform((value) => Number(value)),
    encode: SchemaGetter.passthrough(),
  }),
);
const CoercedNonNegativeInteger = Schema.Unknown.pipe(
  Schema.decodeTo(NonNegativeInteger, {
    decode: SchemaGetter.transform((value) => Number(value)),
    encode: SchemaGetter.passthrough(),
  }),
);
const CoercedNumber = Schema.Unknown.pipe(
  Schema.decodeTo(Schema.Number, {
    decode: SchemaGetter.transform((value) => Number(value)),
    encode: SchemaGetter.passthrough(),
  }),
);

export const NormalizedBusWaitAssessmentSchema = Schema.Struct({
  schemaVersion: Schema.Literal(schemaVersion),
  month: IsoMonthStringSchema,
  routeId: NonEmptyString,
  borough: NonEmptyString,
  dayType: Integer,
  tripType: NonEmptyString,
  period: NonEmptyString,
  tripsPassingWait: NonNegativeInteger,
  scheduledTrips: NonNegativeInteger,
  waitAssessment: Schema.NullOr(Schema.Number),
});

export type NormalizedBusWaitAssessment = typeof NormalizedBusWaitAssessmentSchema.Type;

const RawBusWaitAssessmentRowSchema = Schema.Struct({
  month: NonEmptyString,
  borough: NonEmptyString,
  day_type: CoercedInteger,
  trip_type: NonEmptyString,
  route_id: NonEmptyString,
  period: NonEmptyString,
  number_of_trips_passing_wait: CoercedNonNegativeInteger,
  number_of_scheduled_trips: CoercedNonNegativeInteger,
  wait_assessment: Schema.optionalKey(Schema.NullOr(CoercedNumber)),
});

function toIsoMonth(value: string): string {
  // Socrata calendar_date arrives as "2026-03-01T00:00:00.000" or "2026-03-01T00:00:00".
  const match = value.match(/^(\d{4})-(\d{2})/);
  if (!match) {
    throw new Error(`Unrecognized month value from Socrata: ${value}`);
  }
  return `${match[1]}-${match[2]}`;
}

export function normalizeBusWaitAssessmentRows(rows: SocrataRow[]): NormalizedBusWaitAssessment[] {
  return rows
    .map((row) => {
      const parsed = decodePreserve(RawBusWaitAssessmentRowSchema)(row);
      return {
        schemaVersion,
        month: toIsoMonth(parsed.month),
        routeId: RouteIdCodec.parse(parsed.route_id),
        borough: parsed.borough,
        dayType: parsed.day_type,
        tripType: parsed.trip_type,
        period: parsed.period,
        tripsPassingWait: parsed.number_of_trips_passing_wait,
        scheduledTrips: parsed.number_of_scheduled_trips,
        waitAssessment: parsed.wait_assessment ?? null,
      } satisfies NormalizedBusWaitAssessment;
    })
    .sort((a, b) => {
      const m = a.month.localeCompare(b.month);
      if (m !== 0) return m;
      const r = a.routeId.localeCompare(b.routeId);
      if (r !== 0) return r;
      const d = a.dayType - b.dayType;
      if (d !== 0) return d;
      const t = a.tripType.localeCompare(b.tripType);
      if (t !== 0) return t;
      return a.period.localeCompare(b.period);
    });
}

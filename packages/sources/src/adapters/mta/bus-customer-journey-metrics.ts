import { decodePreserve } from "@bp/domain/decode";
import { RouteIdCodec } from "@bp/domain/primitives";
import { Schema, SchemaGetter } from "effect";
import type { SocrataRow } from "../../core/index.js";
import { IsoMonthStringSchema, schemaVersion } from "../../core/index.js";

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const NonNegativeNumber = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0));
const CoercedNonNegativeNumber = Schema.Unknown.pipe(
  Schema.decodeTo(NonNegativeNumber, {
    decode: SchemaGetter.transform((value) => Number(value)),
    encode: SchemaGetter.passthrough(),
  }),
);
const NullableNumberSchema = Schema.Unknown.pipe(
  Schema.decodeTo(Schema.NullOr(Schema.Number), {
    decode: SchemaGetter.transform((value) =>
      value === null || value === undefined || value === "" ? null : Number(value),
    ),
    encode: SchemaGetter.passthrough(),
  }),
);

export const NormalizedBusCustomerJourneyMetricSchema = Schema.Struct({
  schemaVersion: Schema.Literal(schemaVersion),
  month: IsoMonthStringSchema,
  routeId: NonEmptyString,
  borough: NonEmptyString,
  tripType: NonEmptyString,
  period: NonEmptyString,
  customers: NonNegativeNumber,
  additionalBusStopTimeMinutes: Schema.NullOr(Schema.Number),
  additionalTravelTimeMinutes: Schema.NullOr(Schema.Number),
  customerJourneyTimeMinutes: Schema.NullOr(Schema.Number),
});

export type NormalizedBusCustomerJourneyMetric =
  typeof NormalizedBusCustomerJourneyMetricSchema.Type;

const RawBusCustomerJourneyMetricRowSchema = Schema.Struct({
  month: NonEmptyString,
  borough: NonEmptyString,
  trip_type: NonEmptyString,
  route_id: NonEmptyString,
  period: NonEmptyString,
  number_of_customers: CoercedNonNegativeNumber,
  additional_bus_stop_time: NullableNumberSchema,
  additional_travel_time: NullableNumberSchema,
  customer_journey_time: NullableNumberSchema,
});

function toIsoMonth(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})/);
  if (!match) {
    throw new Error(`Unrecognized month value from Socrata: ${value}`);
  }
  return `${match[1]}-${match[2]}`;
}

export function normalizeBusCustomerJourneyMetricRows(
  rows: SocrataRow[],
): NormalizedBusCustomerJourneyMetric[] {
  return rows
    .flatMap((row): NormalizedBusCustomerJourneyMetric[] => {
      const parsed = decodePreserve(RawBusCustomerJourneyMetricRowSchema)(row);
      if (parsed.route_id.trim().toUpperCase() === "ALL") return [];
      return [
        {
          schemaVersion,
          month: toIsoMonth(parsed.month),
          routeId: decodePreserve(RouteIdCodec)(parsed.route_id),
          borough: parsed.borough,
          tripType: parsed.trip_type,
          period: parsed.period,
          customers: parsed.number_of_customers,
          additionalBusStopTimeMinutes: parsed.additional_bus_stop_time,
          additionalTravelTimeMinutes: parsed.additional_travel_time,
          customerJourneyTimeMinutes: parsed.customer_journey_time,
        },
      ];
    })
    .sort((a, b) => {
      const m = a.month.localeCompare(b.month);
      if (m !== 0) return m;
      const r = a.routeId.localeCompare(b.routeId);
      if (r !== 0) return r;
      const t = a.tripType.localeCompare(b.tripType);
      if (t !== 0) return t;
      return a.period.localeCompare(b.period);
    });
}

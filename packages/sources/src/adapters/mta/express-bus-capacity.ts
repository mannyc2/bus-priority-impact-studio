import { decodePreserve } from "@bp/domain/decode";
import { RouteIdCodec } from "@bp/domain/primitives";
import { Schema, SchemaGetter } from "effect";
import type { SocrataRow } from "../../core/index.js";
import { schemaVersion } from "../../core/index.js";

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const HourOfDay = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(23),
);
const LoadPercentage = Schema.Number.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(1),
);
const NonNegativeInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
const coerceNumberTo = <S extends Schema.Top>(schema: S) =>
  Schema.Unknown.pipe(
    Schema.decodeTo(schema, {
      decode: SchemaGetter.transform((value) => Number(value)),
      encode: SchemaGetter.passthrough(),
    }),
  );

const ExpressBusDayTypeSchema = Schema.Literals(["Weekday", "Weekend"]);
const ExpressBusDirectionSchema = Schema.Literals(["NB", "SB", "EB", "WB"]);

export const NormalizedExpressBusCapacitySchema = Schema.Struct({
  schemaVersion: Schema.Literal(schemaVersion),
  weekStartDate: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
  dayType: ExpressBusDayTypeSchema,
  borough: NonEmptyString,
  routeId: NonEmptyString,
  direction: ExpressBusDirectionSchema,
  hourOfDay: HourOfDay,
  loadPercentage: LoadPercentage,
  tripsWithApc: NonNegativeInteger,
});

export type NormalizedExpressBusCapacity = typeof NormalizedExpressBusCapacitySchema.Type;

const RawExpressBusCapacityRowSchema = Schema.Struct({
  week: NonEmptyString,
  day_type: ExpressBusDayTypeSchema,
  borough: NonEmptyString,
  route: NonEmptyString,
  direction: ExpressBusDirectionSchema,
  hour: coerceNumberTo(HourOfDay),
  load_percentage: coerceNumberTo(LoadPercentage),
  trips_with_apc: coerceNumberTo(NonNegativeInteger),
});

function weekStartDate(value: string): string {
  const [date] = value.split("T");
  if (date === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid express bus capacity week value: ${value}`);
  }

  return date;
}

export function normalizeExpressBusCapacityRows(
  rows: SocrataRow[],
): NormalizedExpressBusCapacity[] {
  return rows.map((row) => {
    const parsed = decodePreserve(RawExpressBusCapacityRowSchema)(row);

    return {
      schemaVersion,
      weekStartDate: weekStartDate(parsed.week),
      dayType: parsed.day_type,
      borough: parsed.borough,
      routeId: decodePreserve(RouteIdCodec)(parsed.route),
      direction: parsed.direction,
      hourOfDay: parsed.hour,
      loadPercentage: parsed.load_percentage,
      tripsWithApc: parsed.trips_with_apc,
    };
  });
}

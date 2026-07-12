import { decodePreserve } from "@bp/domain/decode";
import { RouteIdCodec } from "@bp/domain/primitives";
import { Schema, SchemaGetter } from "effect";
import type { SocrataRow } from "../../core/index.js";
import { IsoMonthStringSchema, isoMonth, schemaVersion } from "../../core/index.js";

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const numberFromUnknown = Schema.Unknown.pipe(
  Schema.decodeTo(Schema.Number, {
    decode: SchemaGetter.transform((value) => Number(value)),
    encode: SchemaGetter.passthrough(),
  }),
);
const integerInRange = (minimum: number, maximum: number) =>
  numberFromUnknown.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(minimum),
    Schema.isLessThanOrEqualTo(maximum),
  );
const nonNegativeNumber = numberFromUnknown.check(Schema.isGreaterThanOrEqualTo(0));

export const NormalizedHourlyRidershipSchema = Schema.Struct({
  schemaVersion: Schema.Literal(schemaVersion),
  routeId: NonEmptyString,
  isoMonth: IsoMonthStringSchema,
  dayOfWeek: NonEmptyString,
  hourOfDay: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(0),
    Schema.isLessThanOrEqualTo(23),
  ),
  ridership: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
  transfers: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
});

export type NormalizedHourlyRidership = typeof NormalizedHourlyRidershipSchema.Type;

const RawHourlyRidershipRowSchema = Schema.Struct({
  day_of_week_index: integerInRange(0, 6),
  hour_of_day: integerInRange(0, 23),
  ridership: nonNegativeNumber,
  transfers: nonNegativeNumber,
});

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function normalizeHourlyRidershipRows(
  rows: SocrataRow[],
  args: { routeId: string; year: number; month: number },
): NormalizedHourlyRidership[] {
  return rows.map((row) => {
    const parsed = decodePreserve(RawHourlyRidershipRowSchema)(row);
    const dayOfWeek = dayNames[parsed.day_of_week_index];
    if (dayOfWeek === undefined) {
      throw new Error(`Unsupported day-of-week index: ${parsed.day_of_week_index}`);
    }

    return {
      schemaVersion,
      routeId: decodePreserve(RouteIdCodec)(args.routeId),
      isoMonth: isoMonth(args.year, args.month),
      dayOfWeek,
      hourOfDay: parsed.hour_of_day,
      ridership: parsed.ridership,
      transfers: parsed.transfers,
    };
  });
}

import { decodePreserve } from "@bp/domain/decode";
import { RouteIdCodec } from "@bp/domain/primitives";
import { Schema, SchemaGetter } from "effect";
import type { SocrataRow } from "../../core/index.js";
import { isoCalendarDateTime, schemaVersion } from "../../core/index.js";

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const NonNegativeInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
const NonNegativeNumber = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0));
const IsoDateTime = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/),
);
const coerceNumberTo = <S extends Schema.Top>(schema: S) =>
  Schema.Unknown.pipe(
    Schema.decodeTo(schema, {
      decode: SchemaGetter.transform((value) => Number(value)),
      encode: SchemaGetter.passthrough(),
    }),
  );

export const NormalizedScheduleTimepointSchema = Schema.Struct({
  schemaVersion: Schema.Literal(schemaVersion),
  routeId: NonEmptyString,
  scheduleDate: IsoDateTime,
  dayType: NonEmptyString,
  direction: NonEmptyString,
  shapeId: NonEmptyString,
  stopSequence: NonNegativeInteger,
  stopId: NonEmptyString,
  stopName: Schema.optionalKey(NonEmptyString),
  scheduleTime: IsoDateTime,
  distanceFromStart: Schema.optionalKey(NonNegativeNumber),
  tripHeadsign: Schema.optionalKey(NonEmptyString),
  blockId: NonEmptyString,
  bundle: Schema.optionalKey(NonEmptyString),
});

export type NormalizedScheduleTimepoint = typeof NormalizedScheduleTimepointSchema.Type;

const RawScheduleTimepointRowSchema = Schema.Struct({
  schedule_date: NonEmptyString,
  day_type: NonEmptyString,
  direction: NonEmptyString,
  shape_id: NonEmptyString,
  route_id: NonEmptyString,
  stop_sequence: coerceNumberTo(NonNegativeInteger),
  stop_id: NonEmptyString,
  stop_name: Schema.optionalKey(NonEmptyString),
  schedule_time: NonEmptyString,
  distance_from_start: Schema.optionalKey(coerceNumberTo(NonNegativeNumber)),
  trip_headsign: Schema.optionalKey(NonEmptyString),
  block_id: NonEmptyString,
  bundle: Schema.optionalKey(NonEmptyString),
});

export function normalizeScheduleTimepointRows(rows: SocrataRow[]): NormalizedScheduleTimepoint[] {
  return rows.map((row) => {
    const parsed = decodePreserve(RawScheduleTimepointRowSchema)(row);
    return {
      schemaVersion,
      routeId: RouteIdCodec.parse(parsed.route_id),
      scheduleDate: isoCalendarDateTime(parsed.schedule_date),
      dayType: parsed.day_type,
      direction: parsed.direction,
      shapeId: parsed.shape_id,
      stopSequence: parsed.stop_sequence,
      stopId: parsed.stop_id,
      scheduleTime: isoCalendarDateTime(parsed.schedule_time),
      blockId: parsed.block_id,
      ...(parsed.stop_name === undefined ? {} : { stopName: parsed.stop_name }),
      ...(parsed.distance_from_start === undefined
        ? {}
        : { distanceFromStart: parsed.distance_from_start }),
      ...(parsed.trip_headsign === undefined ? {} : { tripHeadsign: parsed.trip_headsign }),
      ...(parsed.bundle === undefined ? {} : { bundle: parsed.bundle }),
    } satisfies NormalizedScheduleTimepoint;
  });
}

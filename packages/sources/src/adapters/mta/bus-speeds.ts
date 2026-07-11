import { decodePreserve } from "@bp/domain/decode";
import { RouteIdCodec } from "@bp/domain/primitives";
import { Schema, SchemaGetter } from "effect";
import type { SocrataRow } from "../../core/index.js";
import { IsoMonthStringSchema, isoMonth, schemaVersion } from "../../core/index.js";

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const Integer = Schema.Number.check(Schema.isInt());
const CoercedNumber = Schema.Unknown.pipe(
  Schema.decodeTo(Schema.Number, {
    decode: SchemaGetter.transform((value) => Number(value)),
    encode: SchemaGetter.passthrough(),
  }),
);
const CoercedInteger = Schema.Unknown.pipe(
  Schema.decodeTo(Integer, {
    decode: SchemaGetter.transform((value) => Number(value)),
    encode: SchemaGetter.passthrough(),
  }),
);
const CoercedString = Schema.Unknown.pipe(
  Schema.decodeTo(Schema.String, {
    decode: SchemaGetter.transform((value) => String(value)),
    encode: SchemaGetter.passthrough(),
  }),
);

export const NormalizedSegmentSpeedSchema = Schema.Struct({
  schemaVersion: Schema.Literal(schemaVersion),
  routeId: NonEmptyString,
  isoMonth: IsoMonthStringSchema,
  timestamp: NonEmptyString,
  dayOfWeek: NonEmptyString,
  hourOfDay: Integer,
  direction: NonEmptyString,
  borough: NonEmptyString,
  routeType: NonEmptyString,
  stopOrder: Integer,
  timepointStopId: NonEmptyString,
  timepointStopName: NonEmptyString,
  timepointStopLatitude: Schema.Number,
  timepointStopLongitude: Schema.Number,
  nextTimepointStopId: NonEmptyString,
  nextTimepointStopName: NonEmptyString,
  nextTimepointStopLatitude: Schema.Number,
  nextTimepointStopLongitude: Schema.Number,
  roadDistanceMiles: Schema.Number,
  averageTravelTimeMinutes: Schema.Number,
  averageRoadSpeedMph: Schema.Number,
  busTripCount: Integer,
});

export type NormalizedSegmentSpeed = typeof NormalizedSegmentSpeedSchema.Type;

export const NormalizedSegmentSpeedCellSchema = Schema.Struct({
  schemaVersion: Schema.Literal(schemaVersion),
  routeId: NonEmptyString,
  isoMonth: IsoMonthStringSchema,
  timestamp: NonEmptyString,
  dayOfWeek: NonEmptyString,
  hourOfDay: Integer,
  direction: NonEmptyString,
  borough: NonEmptyString,
  routeType: NonEmptyString,
  stopOrder: Integer,
  timepointStopId: Schema.NullOr(Schema.String),
  timepointStopName: Schema.NullOr(Schema.String),
  timepointStopLatitude: Schema.NullOr(Schema.Number),
  timepointStopLongitude: Schema.NullOr(Schema.Number),
  nextTimepointStopId: Schema.NullOr(Schema.String),
  nextTimepointStopName: Schema.NullOr(Schema.String),
  nextTimepointStopLatitude: Schema.NullOr(Schema.Number),
  nextTimepointStopLongitude: Schema.NullOr(Schema.Number),
  roadDistanceMiles: Schema.NullOr(Schema.Number),
  averageTravelTimeMinutes: Schema.NullOr(Schema.Number),
  averageRoadSpeedMph: Schema.NullOr(Schema.Number),
  busTripCount: Schema.NullOr(Integer),
});

export type NormalizedSegmentSpeedCell = typeof NormalizedSegmentSpeedCellSchema.Type;

const RawSegmentSpeedRowSchema = Schema.Struct({
  year: CoercedInteger,
  month: CoercedInteger,
  timestamp: NonEmptyString,
  day_of_week: NonEmptyString,
  hour_of_day: CoercedInteger,
  route_id: NonEmptyString,
  direction: NonEmptyString,
  borough: NonEmptyString,
  route_type: NonEmptyString,
  stop_order: CoercedInteger,
  timepoint_stop_id: CoercedString.check(Schema.isMinLength(1)),
  timepoint_stop_name: NonEmptyString,
  timepoint_stop_latitude: CoercedNumber,
  timepoint_stop_longitude: CoercedNumber,
  next_timepoint_stop_id: CoercedString.check(Schema.isMinLength(1)),
  next_timepoint_stop_name: NonEmptyString,
  next_timepoint_stop_latitude: CoercedNumber,
  next_timepoint_stop_longitude: CoercedNumber,
  road_distance: CoercedNumber,
  average_travel_time: CoercedNumber,
  average_road_speed: CoercedNumber,
  bus_trip_count: CoercedInteger,
});

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function hasUsableTimepointSegment(row: SocrataRow): boolean {
  const {
    timepoint_stop_id: timepointStopId,
    timepoint_stop_name: timepointStopName,
    timepoint_stop_latitude: timepointStopLatitude,
    timepoint_stop_longitude: timepointStopLongitude,
    next_timepoint_stop_id: nextTimepointStopId,
    next_timepoint_stop_name: nextTimepointStopName,
    next_timepoint_stop_latitude: nextTimepointStopLatitude,
    next_timepoint_stop_longitude: nextTimepointStopLongitude,
  } = row;

  return (
    hasValue(timepointStopId) &&
    hasText(timepointStopName) &&
    hasValue(timepointStopLatitude) &&
    hasValue(timepointStopLongitude) &&
    hasValue(nextTimepointStopId) &&
    hasText(nextTimepointStopName) &&
    hasValue(nextTimepointStopLatitude) &&
    hasValue(nextTimepointStopLongitude)
  );
}

const RawSegmentSpeedCellRowSchema = Schema.Struct({
  year: CoercedInteger,
  month: CoercedInteger,
  timestamp: NonEmptyString,
  day_of_week: NonEmptyString,
  hour_of_day: CoercedInteger,
  route_id: NonEmptyString,
  direction: NonEmptyString,
  borough: NonEmptyString,
  route_type: NonEmptyString,
  stop_order: CoercedInteger,
  timepoint_stop_id: Schema.optionalKey(CoercedString),
  timepoint_stop_name: Schema.optionalKey(Schema.String),
  timepoint_stop_latitude: Schema.optionalKey(CoercedNumber),
  timepoint_stop_longitude: Schema.optionalKey(CoercedNumber),
  next_timepoint_stop_id: Schema.optionalKey(CoercedString),
  next_timepoint_stop_name: Schema.optionalKey(Schema.String),
  next_timepoint_stop_latitude: Schema.optionalKey(CoercedNumber),
  next_timepoint_stop_longitude: Schema.optionalKey(CoercedNumber),
  road_distance: Schema.optionalKey(CoercedNumber),
  average_travel_time: Schema.optionalKey(CoercedNumber),
  average_road_speed: Schema.optionalKey(CoercedNumber),
  bus_trip_count: Schema.optionalKey(CoercedInteger),
});

function nullable<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

export function normalizeSegmentSpeedCellRows(rows: SocrataRow[]): NormalizedSegmentSpeedCell[] {
  return rows.map((row) => {
    const parsed = decodePreserve(RawSegmentSpeedCellRowSchema)(row);

    return {
      schemaVersion,
      routeId: RouteIdCodec.parse(parsed.route_id),
      isoMonth: isoMonth(parsed.year, parsed.month),
      timestamp: parsed.timestamp,
      dayOfWeek: parsed.day_of_week,
      hourOfDay: parsed.hour_of_day,
      direction: parsed.direction,
      borough: parsed.borough,
      routeType: parsed.route_type,
      stopOrder: parsed.stop_order,
      timepointStopId: nullable(parsed.timepoint_stop_id),
      timepointStopName: nullable(parsed.timepoint_stop_name),
      timepointStopLatitude: nullable(parsed.timepoint_stop_latitude),
      timepointStopLongitude: nullable(parsed.timepoint_stop_longitude),
      nextTimepointStopId: nullable(parsed.next_timepoint_stop_id),
      nextTimepointStopName: nullable(parsed.next_timepoint_stop_name),
      nextTimepointStopLatitude: nullable(parsed.next_timepoint_stop_latitude),
      nextTimepointStopLongitude: nullable(parsed.next_timepoint_stop_longitude),
      roadDistanceMiles: nullable(parsed.road_distance),
      averageTravelTimeMinutes: nullable(parsed.average_travel_time),
      averageRoadSpeedMph: nullable(parsed.average_road_speed),
      busTripCount: nullable(parsed.bus_trip_count),
    };
  });
}

export function normalizeSegmentSpeedRows(rows: SocrataRow[]): NormalizedSegmentSpeed[] {
  return rows.filter(hasUsableTimepointSegment).map((row) => {
    const parsed = decodePreserve(RawSegmentSpeedRowSchema)(row);

    return {
      schemaVersion,
      routeId: RouteIdCodec.parse(parsed.route_id),
      isoMonth: isoMonth(parsed.year, parsed.month),
      timestamp: parsed.timestamp,
      dayOfWeek: parsed.day_of_week,
      hourOfDay: parsed.hour_of_day,
      direction: parsed.direction,
      borough: parsed.borough,
      routeType: parsed.route_type,
      stopOrder: parsed.stop_order,
      timepointStopId: parsed.timepoint_stop_id,
      timepointStopName: parsed.timepoint_stop_name,
      timepointStopLatitude: parsed.timepoint_stop_latitude,
      timepointStopLongitude: parsed.timepoint_stop_longitude,
      nextTimepointStopId: parsed.next_timepoint_stop_id,
      nextTimepointStopName: parsed.next_timepoint_stop_name,
      nextTimepointStopLatitude: parsed.next_timepoint_stop_latitude,
      nextTimepointStopLongitude: parsed.next_timepoint_stop_longitude,
      roadDistanceMiles: parsed.road_distance,
      averageTravelTimeMinutes: parsed.average_travel_time,
      averageRoadSpeedMph: parsed.average_road_speed,
      busTripCount: parsed.bus_trip_count,
    };
  });
}

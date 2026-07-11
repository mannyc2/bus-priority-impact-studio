import { decodePreserve } from "@bp/domain/decode";
import { RouteIdCodec } from "@bp/domain/primitives";
import { Schema, SchemaGetter } from "effect";
import type { SocrataRow } from "../../core/index.js";
import { schemaVersion } from "../../core/index.js";

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const CoercedNumber = Schema.Unknown.pipe(
  Schema.decodeTo(Schema.Number, {
    decode: SchemaGetter.transform((value) => Number(value)),
    encode: SchemaGetter.passthrough(),
  }),
);

export const NormalizedRouteShapeSchema = Schema.Struct({
  schemaVersion: Schema.Literal(schemaVersion),
  routeId: NonEmptyString,
  routeShortName: NonEmptyString,
  routeLongName: Schema.optionalKey(NonEmptyString),
  inEffect: Schema.Boolean,
  directionId: NonEmptyString,
  direction: NonEmptyString,
  shapeId: NonEmptyString,
  routeType: Schema.optionalKey(Schema.String),
  tripType: Schema.optionalKey(Schema.String),
  bundle: Schema.optionalKey(Schema.String),
  shapeLength: Schema.optionalKey(Schema.Number),
  geometry: Schema.optionalKey(Schema.Unknown),
});

export const NormalizedStopSchema = Schema.Struct({
  schemaVersion: Schema.Literal(schemaVersion),
  routeId: NonEmptyString,
  routeShortName: NonEmptyString,
  stopId: NonEmptyString,
  stopName: NonEmptyString,
  inEffect: Schema.Boolean,
  directionId: NonEmptyString,
  direction: NonEmptyString,
  timepoint: Schema.Boolean,
  latitude: Schema.Number,
  longitude: Schema.Number,
  georeference: Schema.optionalKey(Schema.Unknown),
});

export type NormalizedRouteShape = typeof NormalizedRouteShapeSchema.Type;
export type NormalizedStop = typeof NormalizedStopSchema.Type;

const RawRouteShapeRowSchema = Schema.Struct({
  route_id: NonEmptyString,
  route_short_name: Schema.optionalKey(NonEmptyString),
  route_long_name: Schema.optionalKey(NonEmptyString),
  in_effect: Schema.Union([Schema.Boolean, Schema.String]),
  direction_id: NonEmptyString,
  direction: NonEmptyString,
  shape_id: NonEmptyString,
  route_type: Schema.optionalKey(Schema.String),
  trip_type: Schema.optionalKey(Schema.String),
  bundle: Schema.optionalKey(Schema.String),
  shape_length: Schema.optionalKey(CoercedNumber),
  geometry: Schema.optionalKey(Schema.Unknown),
});

const RawStopRowSchema = Schema.Struct({
  route_id: NonEmptyString,
  route_short_name: Schema.optionalKey(NonEmptyString),
  stop_id: NonEmptyString,
  stop_name: NonEmptyString,
  in_effect: Schema.Union([Schema.Boolean, Schema.String]),
  direction_id: NonEmptyString,
  direction: NonEmptyString,
  timepoint: Schema.Union([Schema.Boolean, Schema.String, Schema.Number]),
  latitude: CoercedNumber,
  longitude: CoercedNumber,
  georeference: Schema.optionalKey(Schema.Unknown),
});

function parseBoolean(value: boolean | number | string): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function normalizeRouteShapeRows(rows: SocrataRow[]): NormalizedRouteShape[] {
  return rows.map((row) => {
    const parsed = decodePreserve(RawRouteShapeRowSchema)(row);
    return {
      schemaVersion,
      routeId: RouteIdCodec.parse(parsed.route_id),
      routeShortName: parsed.route_short_name ?? parsed.route_id,
      inEffect: parseBoolean(parsed.in_effect),
      directionId: parsed.direction_id,
      direction: parsed.direction,
      shapeId: parsed.shape_id,
      ...(parsed.route_long_name === undefined ? {} : { routeLongName: parsed.route_long_name }),
      ...(parsed.route_type === undefined ? {} : { routeType: parsed.route_type }),
      ...(parsed.trip_type === undefined ? {} : { tripType: parsed.trip_type }),
      ...(parsed.bundle === undefined ? {} : { bundle: parsed.bundle }),
      ...(parsed.shape_length === undefined ? {} : { shapeLength: parsed.shape_length }),
      ...(parsed.geometry === undefined ? {} : { geometry: parsed.geometry }),
    } satisfies NormalizedRouteShape;
  });
}

export function normalizeStopRows(rows: SocrataRow[]): NormalizedStop[] {
  return rows.map((row) => {
    const parsed = decodePreserve(RawStopRowSchema)(row);
    return {
      schemaVersion,
      routeId: RouteIdCodec.parse(parsed.route_id),
      routeShortName: parsed.route_short_name ?? parsed.route_id,
      stopId: parsed.stop_id,
      stopName: parsed.stop_name,
      inEffect: parseBoolean(parsed.in_effect),
      directionId: parsed.direction_id,
      direction: parsed.direction,
      timepoint: parseBoolean(parsed.timepoint),
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      ...(parsed.georeference === undefined ? {} : { georeference: parsed.georeference }),
    } satisfies NormalizedStop;
  });
}

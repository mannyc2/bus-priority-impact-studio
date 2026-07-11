import { decodePreserve } from "@bp/domain/decode";
import { Schema, SchemaGetter } from "effect";
import type { SocrataRow } from "../../core/index.js";

const schemaVersion = 1;
const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const NonNegativeNumber = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0));
const CoercedNonNegativeNumber = Schema.Unknown.pipe(
  Schema.decodeTo(NonNegativeNumber, {
    decode: SchemaGetter.transform((value) => Number(value)),
    encode: SchemaGetter.passthrough(),
  }),
);

export const NormalizedBusLaneSchema = Schema.Struct({
  schemaVersion: Schema.Literal(schemaVersion),
  segmentId: NonEmptyString,
  street: NonEmptyString,
  borough: NonEmptyString,
  facility: NonEmptyString,
  direction: Schema.optionalKey(NonEmptyString),
  trafficDirection: Schema.optionalKey(NonEmptyString),
  hours: Schema.optionalKey(NonEmptyString),
  days: Schema.optionalKey(NonEmptyString),
  laneType: Schema.optionalKey(NonEmptyString),
  laneSubtype: Schema.optionalKey(NonEmptyString),
  laneWidth: Schema.optionalKey(NonEmptyString),
  openDate: Schema.optionalKey(NonEmptyString),
  shapeLength: Schema.optionalKey(NonNegativeNumber),
  geometry: Schema.optionalKey(Schema.Unknown),
});

export type NormalizedBusLane = typeof NormalizedBusLaneSchema.Type;

const RawBusLaneRowSchema = Schema.Struct({
  the_geom: Schema.optionalKey(Schema.Unknown),
  street: NonEmptyString,
  bltrafdir: Schema.optionalKey(NonEmptyString),
  segmentid: NonEmptyString,
  boro: NonEmptyString,
  facility: NonEmptyString,
  direction: Schema.optionalKey(NonEmptyString),
  hours: Schema.optionalKey(NonEmptyString),
  days: Schema.optionalKey(NonEmptyString),
  lane_width: Schema.optionalKey(NonEmptyString),
  lane_type1: Schema.optionalKey(NonEmptyString),
  lane_type: Schema.optionalKey(NonEmptyString),
  open_dates: Schema.optionalKey(NonEmptyString),
  shape_leng: Schema.optionalKey(CoercedNonNegativeNumber),
});

export function normalizeBusLaneRows(rows: SocrataRow[]): NormalizedBusLane[] {
  return rows.map((row) => {
    const parsed = decodePreserve(RawBusLaneRowSchema)(row);
    return {
      schemaVersion,
      segmentId: parsed.segmentid,
      street: parsed.street,
      borough: parsed.boro,
      facility: parsed.facility,
      ...(parsed.direction === undefined ? {} : { direction: parsed.direction }),
      ...(parsed.bltrafdir === undefined ? {} : { trafficDirection: parsed.bltrafdir }),
      ...(parsed.hours === undefined ? {} : { hours: parsed.hours }),
      ...(parsed.days === undefined ? {} : { days: parsed.days }),
      ...(parsed.lane_type === undefined ? {} : { laneType: parsed.lane_type }),
      ...(parsed.lane_type1 === undefined ? {} : { laneSubtype: parsed.lane_type1 }),
      ...(parsed.lane_width === undefined ? {} : { laneWidth: parsed.lane_width }),
      ...(parsed.open_dates === undefined ? {} : { openDate: parsed.open_dates }),
      ...(parsed.shape_leng === undefined ? {} : { shapeLength: parsed.shape_leng }),
      ...(parsed.the_geom === undefined ? {} : { geometry: parsed.the_geom }),
    } satisfies NormalizedBusLane;
  });
}

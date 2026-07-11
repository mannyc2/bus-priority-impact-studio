import { decodePreserve } from "@bp/domain/decode";
import { Schema, SchemaGetter } from "effect";
import type { SocrataRow } from "../../core/index.js";
import { schemaVersion } from "../../core/index.js";

// NYC Centerline / LION (inkn-q76z) — stable street-segment ID + geometry +
// metadata used by other context sources for street joins.

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const NullableString = Schema.NullOr(Schema.String);
const CoercedString = Schema.Unknown.pipe(
  Schema.decodeTo(Schema.String, {
    decode: SchemaGetter.transform((value) => String(value)),
    encode: SchemaGetter.passthrough(),
  }),
);
const NullableNumber = Schema.Unknown.pipe(
  Schema.decodeTo(Schema.NullOr(Schema.Number), {
    decode: SchemaGetter.transform((value) =>
      value === null || value === undefined ? null : Number(value),
    ),
    encode: SchemaGetter.passthrough(),
  }),
);
const SerializedGeometry = Schema.Union([
  Schema.String,
  Schema.Record(Schema.String, Schema.Unknown),
  Schema.Null,
]).pipe(
  Schema.decodeTo(NullableString, {
    decode: SchemaGetter.transform((value) => {
      if (value === null || typeof value === "string") return value;
      return JSON.stringify(value);
    }),
    encode: SchemaGetter.passthrough(),
  }),
);

export const NormalizedLionSegmentSchema = Schema.Struct({
  schemaVersion: Schema.Literal(schemaVersion),
  physicalId: NonEmptyString,
  streetCodeMaster: NullableString,
  streetName: NullableString,
  borough: NullableString,
  boroughCode: NullableString,
  leftLowHouseNumber: NullableString,
  leftHighHouseNumber: NullableString,
  rightLowHouseNumber: NullableString,
  rightHighHouseNumber: NullableString,
  l_zip: NullableString,
  r_zip: NullableString,
  rwTypeCode: NullableString,
  rwTypeDesc: NullableString,
  trafficDir: NullableString,
  shapeLength: Schema.NullOr(Schema.Number),
  wktGeom: NullableString,
});

export type NormalizedLionSegment = typeof NormalizedLionSegmentSchema.Type;

const RawCenterlineRowSchema = Schema.Struct({
  physicalid: CoercedString,
  b5sc: Schema.optionalKey(NullableString),
  full_street_name: Schema.optionalKey(NullableString),
  street_name: Schema.optionalKey(NullableString),
  borough_indicator: Schema.optionalKey(NullableString),
  boroughcode: Schema.optionalKey(NullableString),
  l_low_hn: Schema.optionalKey(NullableString),
  l_high_hn: Schema.optionalKey(NullableString),
  r_low_hn: Schema.optionalKey(NullableString),
  r_high_hn: Schema.optionalKey(NullableString),
  l_zip: Schema.optionalKey(NullableString),
  r_zip: Schema.optionalKey(NullableString),
  rw_type: Schema.optionalKey(NullableString),
  trafdir: Schema.optionalKey(NullableString),
  segmentlength: Schema.optionalKey(NullableNumber),
  the_geom: Schema.optionalKey(SerializedGeometry),
});

export function normalizeLionSegmentRows(rows: SocrataRow[]): NormalizedLionSegment[] {
  return rows
    .map((row) => {
      const p = decodePreserve(RawCenterlineRowSchema)(row);
      const streetName = p.full_street_name ?? p.street_name ?? null;
      const borough = p.borough_indicator ?? p.boroughcode ?? null;
      return {
        schemaVersion,
        physicalId: p.physicalid,
        streetCodeMaster: p.b5sc ?? null,
        streetName,
        borough,
        boroughCode: p.boroughcode ?? null,
        leftLowHouseNumber: p.l_low_hn ?? null,
        leftHighHouseNumber: p.l_high_hn ?? null,
        rightLowHouseNumber: p.r_low_hn ?? null,
        rightHighHouseNumber: p.r_high_hn ?? null,
        l_zip: p.l_zip ?? null,
        r_zip: p.r_zip ?? null,
        rwTypeCode: p.rw_type === undefined ? null : p.rw_type,
        rwTypeDesc: null,
        trafficDir: p.trafdir ?? null,
        shapeLength: p.segmentlength ?? null,
        wktGeom: p.the_geom ?? null,
      } satisfies NormalizedLionSegment;
    })
    .sort((a, b) => a.physicalId.localeCompare(b.physicalId));
}

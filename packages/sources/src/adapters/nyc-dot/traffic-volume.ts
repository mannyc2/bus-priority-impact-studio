import { decodePreserve } from "@bp/domain/decode";
import { Schema, SchemaGetter } from "effect";
import type { SocrataRow } from "../../core/index.js";
import { schemaVersion } from "../../core/index.js";

const Integer = Schema.Number.check(Schema.isInt());
const NonNegativeInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
const NullableString = Schema.NullOr(Schema.String);
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

export const NormalizedDotTrafficVolumeSchema = Schema.Struct({
  schemaVersion: Schema.Literal(schemaVersion),
  requestId: Integer,
  segmentId: Integer,
  sampledAt: IsoDateTime,
  borough: NullableString,
  street: NullableString,
  fromStreet: NullableString,
  toStreet: NullableString,
  direction: NullableString,
  volume: NonNegativeInteger,
  wktGeom: NullableString,
});

export type NormalizedDotTrafficVolume = typeof NormalizedDotTrafficVolumeSchema.Type;

const RawVolumeRowSchema = Schema.Struct({
  requestid: coerceNumberTo(Integer),
  boro: Schema.optionalKey(Schema.String),
  yr: coerceNumberTo(Integer),
  m: coerceNumberTo(Integer),
  d: coerceNumberTo(Integer),
  hh: coerceNumberTo(Integer),
  mm: coerceNumberTo(Integer),
  vol: coerceNumberTo(NonNegativeInteger),
  segmentid: coerceNumberTo(Integer),
  wktgeom: Schema.optionalKey(Schema.String),
  street: Schema.optionalKey(Schema.String),
  fromst: Schema.optionalKey(Schema.String),
  tost: Schema.optionalKey(Schema.String),
  direction: Schema.optionalKey(Schema.String),
});

function pad(n: number, width = 2): string {
  return n.toString().padStart(width, "0");
}

export function normalizeDotTrafficVolumeRows(rows: SocrataRow[]): NormalizedDotTrafficVolume[] {
  return rows
    .map((row) => {
      const parsed = decodePreserve(RawVolumeRowSchema)(row);
      const sampledAt = `${parsed.yr}-${pad(parsed.m)}-${pad(parsed.d)}T${pad(parsed.hh)}:${pad(parsed.mm)}:00Z`;
      return {
        schemaVersion,
        requestId: parsed.requestid,
        segmentId: parsed.segmentid,
        sampledAt,
        borough: parsed.boro ?? null,
        street: parsed.street ?? null,
        fromStreet: parsed.fromst ?? null,
        toStreet: parsed.tost ?? null,
        direction: parsed.direction ?? null,
        volume: parsed.vol,
        wktGeom: parsed.wktgeom ?? null,
      } satisfies NormalizedDotTrafficVolume;
    })
    .sort((a, b) => {
      if (a.segmentId !== b.segmentId) return a.segmentId - b.segmentId;
      return a.sampledAt.localeCompare(b.sampledAt);
    });
}

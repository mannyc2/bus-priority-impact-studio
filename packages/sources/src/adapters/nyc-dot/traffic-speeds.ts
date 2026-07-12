import { decodePreserve } from "@bp/domain/decode";
import { Schema, SchemaGetter } from "effect";
import type { SocrataRow } from "../../core/index.js";
import { schemaVersion } from "../../core/index.js";

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const NullableString = Schema.NullOr(Schema.String);
const CoercedNumber = Schema.Unknown.pipe(
  Schema.decodeTo(Schema.Number, {
    decode: SchemaGetter.transform((value) => Number(value)),
    encode: SchemaGetter.passthrough(),
  }),
);
const IsoDateTime = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/),
);

export const NormalizedDotTrafficSpeedSchema = Schema.Struct({
  schemaVersion: Schema.Literal(schemaVersion),
  linkId: NonEmptyString,
  sampledAt: IsoDateTime,
  speed: Schema.NullOr(Schema.Number),
  travelTime: Schema.NullOr(Schema.Number),
  statusCode: NonEmptyString,
  owner: NullableString,
  borough: NullableString,
  linkName: NullableString,
  linkPoints: NullableString,
  transcomId: NullableString,
});

export type NormalizedDotTrafficSpeed = typeof NormalizedDotTrafficSpeedSchema.Type;

const RawDotTrafficSpeedRowSchema = Schema.Struct({
  link_id: NonEmptyString,
  data_as_of: NonEmptyString,
  speed: Schema.optionalKey(CoercedNumber),
  travel_time: Schema.optionalKey(CoercedNumber),
  status: Schema.optionalKey(Schema.String),
  owner: Schema.optionalKey(Schema.String),
  borough: Schema.optionalKey(Schema.String),
  link_name: Schema.optionalKey(Schema.String),
  link_points: Schema.optionalKey(Schema.String),
  transcom_id: Schema.optionalKey(Schema.String),
});

function toIsoDatetime(value: string): string {
  // Socrata calendar_date arrives as "2026-05-18T21:29:07.000". Some endpoints
  // omit the milliseconds. Normalize to a full ISO Z-suffixed timestamp.
  if (/Z$/.test(value)) return value;
  const trimmed = value.endsWith(".000") ? value.slice(0, -4) : value;
  return `${trimmed}Z`;
}

export function normalizeDotTrafficSpeedRows(rows: SocrataRow[]): NormalizedDotTrafficSpeed[] {
  return rows
    .map((row) => {
      const parsed = decodePreserve(RawDotTrafficSpeedRowSchema)(row);
      return {
        schemaVersion,
        linkId: parsed.link_id,
        sampledAt: toIsoDatetime(parsed.data_as_of),
        speed:
          parsed.speed === undefined ? null : Number.isFinite(parsed.speed) ? parsed.speed : null,
        travelTime:
          parsed.travel_time === undefined
            ? null
            : Number.isFinite(parsed.travel_time)
              ? parsed.travel_time
              : null,
        statusCode: parsed.status ?? "",
        owner: parsed.owner ?? null,
        borough: parsed.borough ?? null,
        linkName: parsed.link_name ?? null,
        linkPoints: parsed.link_points ?? null,
        transcomId: parsed.transcom_id ?? null,
      } satisfies NormalizedDotTrafficSpeed;
    })
    .sort((a, b) => a.linkId.localeCompare(b.linkId));
}

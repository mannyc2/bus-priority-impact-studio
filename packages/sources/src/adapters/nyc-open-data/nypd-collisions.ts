import { decodePreserve } from "@bp/domain/decode";
import { Schema, SchemaGetter } from "effect";
import type { SocrataRow } from "../../core/index.js";
import { schemaVersion } from "../../core/index.js";

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const NullableString = Schema.NullOr(Schema.String);
const Integer = Schema.Number.check(Schema.isInt());
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
const NullableInteger = Schema.Unknown.pipe(
  Schema.decodeTo(Schema.NullOr(Integer), {
    decode: SchemaGetter.transform((value) =>
      value === null || value === undefined ? null : Math.round(Number(value)),
    ),
    encode: SchemaGetter.passthrough(),
  }),
);

export const NormalizedNypdCollisionSchema = Schema.Struct({
  schemaVersion: Schema.Literal(schemaVersion),
  collisionId: NonEmptyString,
  crashDate: NonEmptyString,
  crashTime: NullableString,
  borough: NullableString,
  zipCode: NullableString,
  latitude: Schema.NullOr(Schema.Number),
  longitude: Schema.NullOr(Schema.Number),
  onStreetName: NullableString,
  offStreetName: NullableString,
  crossStreetName: NullableString,
  personsInjured: Schema.NullOr(Integer),
  personsKilled: Schema.NullOr(Integer),
  pedestriansInjured: Schema.NullOr(Integer),
  pedestriansKilled: Schema.NullOr(Integer),
  cyclistInjured: Schema.NullOr(Integer),
  cyclistKilled: Schema.NullOr(Integer),
  motoristInjured: Schema.NullOr(Integer),
  motoristKilled: Schema.NullOr(Integer),
  contributingFactorVehicle1: NullableString,
  contributingFactorVehicle2: NullableString,
});

export type NormalizedNypdCollision = typeof NormalizedNypdCollisionSchema.Type;

const RawCollisionRowSchema = Schema.Struct({
  collision_id: CoercedString,
  crash_date: NonEmptyString,
  crash_time: Schema.optionalKey(NullableString),
  borough: Schema.optionalKey(NullableString),
  zip_code: Schema.optionalKey(NullableString),
  latitude: Schema.optionalKey(NullableNumber),
  longitude: Schema.optionalKey(NullableNumber),
  on_street_name: Schema.optionalKey(NullableString),
  off_street_name: Schema.optionalKey(NullableString),
  cross_street_name: Schema.optionalKey(NullableString),
  number_of_persons_injured: Schema.optionalKey(NullableInteger),
  number_of_persons_killed: Schema.optionalKey(NullableInteger),
  number_of_pedestrians_injured: Schema.optionalKey(NullableInteger),
  number_of_pedestrians_killed: Schema.optionalKey(NullableInteger),
  number_of_cyclist_injured: Schema.optionalKey(NullableInteger),
  number_of_cyclist_killed: Schema.optionalKey(NullableInteger),
  number_of_motorist_injured: Schema.optionalKey(NullableInteger),
  number_of_motorist_killed: Schema.optionalKey(NullableInteger),
  contributing_factor_vehicle_1: Schema.optionalKey(NullableString),
  contributing_factor_vehicle_2: Schema.optionalKey(NullableString),
});

export function normalizeNypdCollisionRows(rows: SocrataRow[]): NormalizedNypdCollision[] {
  return rows
    .map((row) => {
      const p = decodePreserve(RawCollisionRowSchema)(row);
      return {
        schemaVersion,
        collisionId: p.collision_id,
        crashDate: p.crash_date.slice(0, 10),
        crashTime: p.crash_time ?? null,
        borough: p.borough ?? null,
        zipCode: p.zip_code ?? null,
        latitude: p.latitude ?? null,
        longitude: p.longitude ?? null,
        onStreetName: p.on_street_name ?? null,
        offStreetName: p.off_street_name ?? null,
        crossStreetName: p.cross_street_name ?? null,
        personsInjured: p.number_of_persons_injured ?? null,
        personsKilled: p.number_of_persons_killed ?? null,
        pedestriansInjured: p.number_of_pedestrians_injured ?? null,
        pedestriansKilled: p.number_of_pedestrians_killed ?? null,
        cyclistInjured: p.number_of_cyclist_injured ?? null,
        cyclistKilled: p.number_of_cyclist_killed ?? null,
        motoristInjured: p.number_of_motorist_injured ?? null,
        motoristKilled: p.number_of_motorist_killed ?? null,
        contributingFactorVehicle1: p.contributing_factor_vehicle_1 ?? null,
        contributingFactorVehicle2: p.contributing_factor_vehicle_2 ?? null,
      } satisfies NormalizedNypdCollision;
    })
    .sort((a, b) => a.collisionId.localeCompare(b.collisionId));
}

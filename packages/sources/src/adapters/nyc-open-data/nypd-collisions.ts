import * as z from "zod";
import type { SocrataRow } from "../../core/index.js";
import { schemaVersion } from "../../core/index.js";

export const NormalizedNypdCollisionSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    collisionId: z.string().min(1),
    crashDate: z.string().min(1),
    crashTime: z.string().nullable(),
    borough: z.string().nullable(),
    zipCode: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    onStreetName: z.string().nullable(),
    offStreetName: z.string().nullable(),
    crossStreetName: z.string().nullable(),
    personsInjured: z.number().int().nullable(),
    personsKilled: z.number().int().nullable(),
    pedestriansInjured: z.number().int().nullable(),
    pedestriansKilled: z.number().int().nullable(),
    cyclistInjured: z.number().int().nullable(),
    cyclistKilled: z.number().int().nullable(),
    motoristInjured: z.number().int().nullable(),
    motoristKilled: z.number().int().nullable(),
    contributingFactorVehicle1: z.string().nullable(),
    contributingFactorVehicle2: z.string().nullable(),
  })
  .strict();

export type NormalizedNypdCollision = z.output<typeof NormalizedNypdCollisionSchema>;

const strN = z
  .union([z.null(), z.undefined(), z.string()])
  .transform((v) => (v === undefined ? null : v));
const intN = z
  .union([z.null(), z.undefined(), z.coerce.number()])
  .transform((v) => (v === undefined ? null : v === null ? null : Math.round(v)));
const numN = z
  .union([z.null(), z.undefined(), z.coerce.number()])
  .transform((v) => (v === undefined ? null : v));

const RawCollisionRowSchema = z
  .object({
    collision_id: z.coerce.string(),
    crash_date: z.string().min(1),
    crash_time: strN,
    borough: strN,
    zip_code: strN,
    latitude: numN,
    longitude: numN,
    on_street_name: strN,
    off_street_name: strN,
    cross_street_name: strN,
    number_of_persons_injured: intN,
    number_of_persons_killed: intN,
    number_of_pedestrians_injured: intN,
    number_of_pedestrians_killed: intN,
    number_of_cyclist_injured: intN,
    number_of_cyclist_killed: intN,
    number_of_motorist_injured: intN,
    number_of_motorist_killed: intN,
    contributing_factor_vehicle_1: strN,
    contributing_factor_vehicle_2: strN,
  })
  .passthrough();

export function normalizeNypdCollisionRows(rows: SocrataRow[]): NormalizedNypdCollision[] {
  return rows
    .map((row) => {
      const p = RawCollisionRowSchema.parse(row);
      return {
        schemaVersion,
        collisionId: p.collision_id,
        crashDate: p.crash_date.slice(0, 10),
        crashTime: p.crash_time,
        borough: p.borough,
        zipCode: p.zip_code,
        latitude: p.latitude,
        longitude: p.longitude,
        onStreetName: p.on_street_name,
        offStreetName: p.off_street_name,
        crossStreetName: p.cross_street_name,
        personsInjured: p.number_of_persons_injured,
        personsKilled: p.number_of_persons_killed,
        pedestriansInjured: p.number_of_pedestrians_injured,
        pedestriansKilled: p.number_of_pedestrians_killed,
        cyclistInjured: p.number_of_cyclist_injured,
        cyclistKilled: p.number_of_cyclist_killed,
        motoristInjured: p.number_of_motorist_injured,
        motoristKilled: p.number_of_motorist_killed,
        contributingFactorVehicle1: p.contributing_factor_vehicle_1,
        contributingFactorVehicle2: p.contributing_factor_vehicle_2,
      } satisfies NormalizedNypdCollision;
    })
    .sort((a, b) => a.collisionId.localeCompare(b.collisionId));
}

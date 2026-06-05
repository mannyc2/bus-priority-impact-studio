import { updateNypdCollisionGeocode } from "@bp/db/local";
import { parseHouseAddress } from "@bp/sources/clients/geoclient";
import { arg, defineCommand, z } from "@liche/core";
import {
  createGeoclientFromEnv,
  type GeocodeInput,
  type GeocodeOutcome,
  Geocoder,
} from "../../lib/geocoder.ts";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";

const MISS_OUTCOME: GeocodeOutcome = {
  physicalId: null,
  lat: null,
  lng: null,
  confidence: "no_inputs",
  cached: false,
};

function hasUsableLatLng(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

export type GeocodeNypdInputs = {
  local: OpenLocalPipelineDb;
  batchSize?: number | undefined;
  maxRows?: number | undefined;
};

export type GeocodeResult = {
  scanned: number;
  hits: number;
  misses: number;
  cached: number;
};

export async function runGeocodeNypdCollisions(inputs: GeocodeNypdInputs): Promise<GeocodeResult> {
  const batchSize = inputs.batchSize ?? 500;
  const maxRows = inputs.maxRows ?? Number.POSITIVE_INFINITY;
  const geoclient = createGeoclientFromEnv();
  const { local } = inputs;

  const geocoder = new Geocoder({
    db: local.db,
    sqlite: local.sqlite,
    sourceLabel: "nypd_motor_vehicle_collisions",
    geoclient,
  });

  let scanned = 0;
  let hits = 0;
  let misses = 0;
  let cached = 0;

  while (scanned < maxRows) {
    const remaining = Math.min(batchSize, maxRows - scanned);
    if (remaining <= 0) break;
    const rows = local.sqlite
      .query<
        {
          collision_id: string;
          latitude: number | null;
          longitude: number | null;
          borough: string | null;
          on_street_name: string | null;
          cross_street_name: string | null;
          off_street_name: string | null;
        },
        [number]
      >(
        `SELECT collision_id, latitude, longitude, borough,
                on_street_name, cross_street_name, off_street_name
           FROM local_nypd_collision
          WHERE physical_id IS NULL AND geocode_confidence IS NULL
          LIMIT ?`,
      )
      .all(remaining);

    if (rows.length === 0) break;
    for (const row of rows) {
      scanned += 1;
      const attempts: GeocodeInput[] = [];
      if (hasUsableLatLng(row.latitude, row.longitude)) {
        attempts.push({
          kind: "latlng",
          lat: row.latitude as number,
          lng: row.longitude as number,
          hintStreet: row.on_street_name,
          hintBorough: row.borough,
        });
      }
      if (row.on_street_name && row.cross_street_name) {
        attempts.push({
          kind: "intersection",
          crossStreetOne: row.on_street_name,
          crossStreetTwo: row.cross_street_name,
          borough: row.borough ?? "",
        });
      }
      if (
        row.on_street_name &&
        row.off_street_name &&
        row.off_street_name !== row.cross_street_name
      ) {
        attempts.push({
          kind: "intersection",
          crossStreetOne: row.on_street_name,
          crossStreetTwo: row.off_street_name,
          borough: row.borough ?? "",
        });
      }
      const parsedCross = parseHouseAddress(row.cross_street_name);
      if (parsedCross) {
        attempts.push({
          kind: "address",
          houseNumber: parsedCross.houseNumber,
          street: parsedCross.street,
          borough: row.borough ?? "",
        });
      }
      const parsedOff = parseHouseAddress(row.off_street_name);
      if (parsedOff) {
        attempts.push({
          kind: "address",
          houseNumber: parsedOff.houseNumber,
          street: parsedOff.street,
          borough: row.borough ?? "",
        });
      }

      let outcome: GeocodeOutcome = MISS_OUTCOME;
      for (const attempt of attempts) {
        outcome = await geocoder.resolve(attempt);
        if (outcome.physicalId) break;
      }
      await updateNypdCollisionGeocode(local.db, row.collision_id, {
        physicalId: outcome.physicalId,
        confidence: outcome.confidence,
      });
      if (outcome.cached) cached += 1;
      if (outcome.physicalId) hits += 1;
      else misses += 1;
    }
  }
  return { scanned, hits, misses, cached };
}

export default defineCommand({
  path: ["geocode", "nypd-collisions"],
  summary: "Geocode local_nypd_collision rows via Geoclient + LION snap.",
  input: {
    options: dbOptions.extend({
      batchSize: arg.positiveInt().default(500).describe("Rows per batch"),
      maxRows: arg.positiveInt().optional().describe("Cap total rows scanned"),
    }),
  },
  middleware: [withLocalDb({ spatial: true })],
  output: z.object({
    scanned: z.number(),
    hits: z.number(),
    misses: z.number(),
    cached: z.number(),
  }),
  async run({ ctx, input }) {
    return runGeocodeNypdCollisions({
      local: localDbFromCtx(ctx),
      batchSize: input.options.batchSize,
      maxRows: input.options.maxRows,
    });
  },
});

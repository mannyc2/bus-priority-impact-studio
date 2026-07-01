import { updateDotStreetPermitGeocode } from "@bp/db/local";
import { arg, defineCommand, z } from "@liche/core";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import {
  createGeoclientFromEnv,
  type GeocodeInput,
  type GeocodeOutcome,
  Geocoder,
} from "../../lib/geocoder.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";

const MISS_OUTCOME: GeocodeOutcome = {
  physicalId: null,
  lat: null,
  lng: null,
  confidence: "no_inputs",
  cached: false,
};

export type GeocodePermitsInputs = {
  local: OpenLocalPipelineDb;
  batchSize?: number | undefined;
  maxRows?: number | undefined;
};

export type GeocodePermitsResult = {
  scanned: number;
  hits: number;
  misses: number;
  cached: number;
};

export async function runGeocodePermits(
  inputs: GeocodePermitsInputs,
): Promise<GeocodePermitsResult> {
  const batchSize = inputs.batchSize ?? 500;
  const maxRows = inputs.maxRows ?? Number.POSITIVE_INFINITY;
  const geoclient = createGeoclientFromEnv();
  const { local } = inputs;

  const geocoder = new Geocoder({
    db: local.db,
    sqlite: local.sqlite,
    sourceLabel: "nyc_dot_street_permit",
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
          permit_number: string;
          house_number: string | null;
          on_street_name: string | null;
          from_street_name: string | null;
          to_street_name: string | null;
          borough_name: string | null;
        },
        [number]
      >(
        `SELECT permit_number, house_number, on_street_name,
                from_street_name, to_street_name, borough_name
           FROM local_dot_street_permit
          WHERE physical_id IS NULL AND geocode_confidence IS NULL
          LIMIT ?`,
      )
      .all(remaining);

    if (rows.length === 0) break;
    for (const row of rows) {
      scanned += 1;
      const borough = row.borough_name ?? "";

      const attempts: GeocodeInput[] = [];
      if (row.house_number && row.on_street_name) {
        attempts.push({
          kind: "address",
          houseNumber: row.house_number,
          street: row.on_street_name,
          borough,
        });
      }
      if (row.on_street_name && row.from_street_name) {
        attempts.push({
          kind: "intersection",
          crossStreetOne: row.on_street_name,
          crossStreetTwo: row.from_street_name,
          borough,
        });
      }
      if (row.on_street_name && row.to_street_name && row.to_street_name !== row.from_street_name) {
        attempts.push({
          kind: "intersection",
          crossStreetOne: row.on_street_name,
          crossStreetTwo: row.to_street_name,
          borough,
        });
      }

      let outcome: GeocodeOutcome = MISS_OUTCOME;
      for (const attempt of attempts) {
        outcome = await geocoder.resolve(attempt);
        if (outcome.physicalId) break;
      }
      await updateDotStreetPermitGeocode(local.db, row.permit_number, {
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
  path: ["geocode", "permits"],
  summary: "Geocode local_dot_street_permit rows via Geoclient.",
  input: {
    options: dbOptions.extend({
      batchSize: arg.positiveInt().default(500).describe("Rows per batch"),
      maxRows: arg.positiveInt().optional().describe("Cap total rows scanned"),
    }),
  },
  output: z.object({
    scanned: z.number(),
    hits: z.number(),
    misses: z.number(),
    cached: z.number(),
  }),
  async run({ input }) {
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      localDbOptions: { spatial: true },
      command: "geocode.permits",
      operation: "runGeocodePermits",
      spanAttributes: {
        batchSize: input.options.batchSize,
        maxRows: input.options.maxRows ?? null,
      },
      run: (local) =>
        runGeocodePermits({
          local,
          batchSize: input.options.batchSize,
          maxRows: input.options.maxRows,
        }),
    });
  },
});

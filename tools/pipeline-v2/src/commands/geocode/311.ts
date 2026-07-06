import { update311ServiceRequestGeocode } from "@bp/db/local";
import { arg, defineCommand, z } from "@bp/pipeline-v2/cli/compat";
import { parseHouseAddress } from "@bp/sources/clients/geoclient";
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

function hasUsableLatLng(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

export type Geocode311Inputs = {
  local: OpenLocalPipelineDb;
  batchSize?: number | undefined;
  maxRows?: number | undefined;
  since?: string | undefined;
  until?: string | undefined;
};

export type Geocode311Result = {
  scanned: number;
  hits: number;
  misses: number;
  cached: number;
};

export async function runGeocode311(inputs: Geocode311Inputs): Promise<Geocode311Result> {
  const batchSize = inputs.batchSize ?? 500;
  const maxRows = inputs.maxRows ?? Number.POSITIVE_INFINITY;
  const geoclient = createGeoclientFromEnv();
  const { local } = inputs;

  const geocoder = new Geocoder({
    db: local.db,
    sqlite: local.sqlite,
    sourceLabel: "nyc_311_service_request",
    geoclient,
  });

  let scanned = 0;
  let hits = 0;
  let misses = 0;
  let cached = 0;

  const datePredicates: string[] = [];
  const dateParams: string[] = [];
  if (inputs.since) {
    datePredicates.push("created_date >= ?");
    dateParams.push(inputs.since);
  }
  if (inputs.until) {
    datePredicates.push("created_date < ?");
    dateParams.push(inputs.until);
  }
  const dateWhere = datePredicates.length > 0 ? ` AND ${datePredicates.join(" AND ")}` : "";

  while (scanned < maxRows) {
    const remaining = Math.min(batchSize, maxRows - scanned);
    if (remaining <= 0) break;
    const rows = local.sqlite
      .query<
        {
          unique_key: string;
          latitude: number | null;
          longitude: number | null;
          street_name: string | null;
          cross_street_1: string | null;
          cross_street_2: string | null;
          city: string | null;
          incident_zip: string | null;
          community_board: string | null;
          incident_address: string | null;
        },
        [...string[], number]
      >(
        `SELECT unique_key, latitude, longitude, street_name,
                cross_street_1, cross_street_2, city, incident_zip, community_board,
                incident_address
           FROM local_311_service_request
          WHERE physical_id IS NULL AND geocode_confidence IS NULL
                ${dateWhere}
          ORDER BY created_date DESC, unique_key DESC
          LIMIT ?`,
      )
      .all(...dateParams, remaining);

    if (rows.length === 0) break;
    for (const row of rows) {
      scanned += 1;
      const borough = row.city ?? row.community_board ?? "";

      const attempts: GeocodeInput[] = [];
      if (hasUsableLatLng(row.latitude, row.longitude)) {
        attempts.push({
          kind: "latlng",
          lat: row.latitude as number,
          lng: row.longitude as number,
          hintStreet: row.street_name,
          hintBorough: borough,
        });
      }
      if (row.street_name && row.cross_street_1) {
        attempts.push({
          kind: "intersection",
          crossStreetOne: row.street_name,
          crossStreetTwo: row.cross_street_1,
          borough,
        });
      }
      if (row.street_name && row.cross_street_2 && row.cross_street_2 !== row.cross_street_1) {
        attempts.push({
          kind: "intersection",
          crossStreetOne: row.street_name,
          crossStreetTwo: row.cross_street_2,
          borough,
        });
      }
      const parsedAddr = parseHouseAddress(row.incident_address);
      if (parsedAddr) {
        attempts.push({
          kind: "address",
          houseNumber: parsedAddr.houseNumber,
          street: parsedAddr.street,
          borough,
        });
      }

      let outcome: GeocodeOutcome = MISS_OUTCOME;
      for (const attempt of attempts) {
        outcome = await geocoder.resolve(attempt);
        if (outcome.physicalId) break;
      }
      await update311ServiceRequestGeocode(local.db, row.unique_key, {
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
  path: ["geocode", "311"],
  summary: "Geocode local_311_service_request rows via Geoclient + LION snap.",
  input: {
    options: dbOptions.extend({
      batchSize: arg.positiveInt().default(500).describe("Rows per batch"),
      maxRows: arg.positiveInt().optional().describe("Cap total rows scanned"),
      since: z.string().optional().describe("Inclusive lower bound on created_date"),
      until: z.string().optional().describe("Exclusive upper bound on created_date"),
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
      command: "geocode.311",
      operation: "runGeocode311",
      spanAttributes: {
        batchSize: input.options.batchSize,
        maxRows: input.options.maxRows ?? null,
        since: input.options.since ?? null,
        until: input.options.until ?? null,
      },
      run: (local) =>
        runGeocode311({
          local,
          batchSize: input.options.batchSize,
          maxRows: input.options.maxRows,
          since: input.options.since,
          until: input.options.until,
        }),
    });
  },
});

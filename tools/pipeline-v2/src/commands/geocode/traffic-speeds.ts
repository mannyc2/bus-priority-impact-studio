import { updateTrafficSpeedGeocode } from "@bp/db/local";
import { arg, defineCommand, z } from "@bp/pipeline-v2/cli/compat";
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

function midpointFromLinkPoints(raw: string | null): { lat: number; lng: number } | null {
  if (!raw) return null;
  const pairs = raw
    .trim()
    .split(/\s+/)
    .map((p) => p.split(","))
    .filter((p): p is [string, string] => p.length === 2)
    .map(([latStr, lngStr]) => ({ lat: Number(latStr), lng: Number(lngStr) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (pairs.length === 0) return null;
  const mid = pairs[Math.floor(pairs.length / 2)];
  return mid ?? null;
}

export type GeocodeTrafficSpeedsInputs = {
  local: OpenLocalPipelineDb;
  batchSize?: number | undefined;
  maxRows?: number | undefined;
};

export type GeocodeTrafficSpeedsResult = {
  scanned: number;
  hits: number;
  misses: number;
  cached: number;
};

export async function runGeocodeTrafficSpeeds(
  inputs: GeocodeTrafficSpeedsInputs,
): Promise<GeocodeTrafficSpeedsResult> {
  const batchSize = inputs.batchSize ?? 500;
  const maxRows = inputs.maxRows ?? Number.POSITIVE_INFINITY;
  const geoclient = createGeoclientFromEnv();
  const { local } = inputs;

  const geocoder = new Geocoder({
    db: local.db,
    sqlite: local.sqlite,
    sourceLabel: "nyc_dot_traffic_speed",
    geoclient,
    snapMaxMeters: 150,
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
          link_id: string;
          sampled_at: string;
          borough: string | null;
          link_name: string | null;
          link_points: string | null;
        },
        [number]
      >(
        `SELECT link_id, sampled_at, borough, link_name, link_points
           FROM local_dot_traffic_speed
          WHERE physical_id IS NULL AND geocode_confidence IS NULL
          LIMIT ?`,
      )
      .all(remaining);

    if (rows.length === 0) break;
    for (const row of rows) {
      scanned += 1;
      const mid = midpointFromLinkPoints(row.link_points);
      let outcome: GeocodeOutcome = MISS_OUTCOME;
      if (mid) {
        const input: GeocodeInput = {
          kind: "latlng",
          lat: mid.lat,
          lng: mid.lng,
          hintStreet: row.link_name,
          hintBorough: row.borough,
        };
        outcome = await geocoder.resolve(input);
      }
      await updateTrafficSpeedGeocode(
        local.db,
        { linkId: row.link_id, sampledAt: row.sampled_at },
        { physicalId: outcome.physicalId, confidence: outcome.confidence },
      );
      if (outcome.cached) cached += 1;
      if (outcome.physicalId) hits += 1;
      else misses += 1;
    }
  }
  return { scanned, hits, misses, cached };
}

export default defineCommand({
  path: ["geocode", "traffic-speeds"],
  summary: "Geocode local_dot_traffic_speed link rows by polyline midpoint snap.",
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
      command: "geocode.traffic-speeds",
      operation: "runGeocodeTrafficSpeeds",
      spanAttributes: {
        batchSize: input.options.batchSize,
        maxRows: input.options.maxRows ?? null,
      },
      run: (local) =>
        runGeocodeTrafficSpeeds({
          local,
          batchSize: input.options.batchSize,
          maxRows: input.options.maxRows,
        }),
    });
  },
});

import { updateTrafficVolumeGeocode } from "@bp/db/local";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { Effect } from "effect";
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

export type GeocodeTrafficVolumesInputs = {
  local: OpenLocalPipelineDb;
  batchSize?: number | undefined;
  maxRows?: number | undefined;
};

export type GeocodeTrafficVolumesResult = {
  scanned: number;
  hits: number;
  misses: number;
  cached: number;
};

export async function runGeocodeTrafficVolumes(
  inputs: GeocodeTrafficVolumesInputs,
): Promise<GeocodeTrafficVolumesResult> {
  const batchSize = inputs.batchSize ?? 500;
  const maxRows = inputs.maxRows ?? Number.POSITIVE_INFINITY;
  const geoclient = createGeoclientFromEnv();
  const { local } = inputs;

  const geocoder = new Geocoder({
    db: local.db,
    sqlite: local.sqlite,
    sourceLabel: "nyc_dot_traffic_volume_count",
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
          request_id: number;
          segment_id: number;
          sampled_at: string;
          borough: string | null;
          street: string | null;
          from_street: string | null;
          to_street: string | null;
        },
        [number]
      >(
        `SELECT request_id, segment_id, sampled_at, borough,
                street, from_street, to_street
           FROM local_dot_traffic_volume_count
          WHERE physical_id IS NULL AND geocode_confidence IS NULL
          LIMIT ?`,
      )
      .all(remaining);

    if (rows.length === 0) break;
    for (const row of rows) {
      scanned += 1;
      const borough = row.borough ?? "";

      const attempts: GeocodeInput[] = [];
      if (row.street && row.from_street) {
        attempts.push({
          kind: "intersection",
          crossStreetOne: row.street,
          crossStreetTwo: row.from_street,
          borough,
        });
      }
      if (row.street && row.to_street && row.to_street !== row.from_street) {
        attempts.push({
          kind: "intersection",
          crossStreetOne: row.street,
          crossStreetTwo: row.to_street,
          borough,
        });
      }

      let outcome: GeocodeOutcome = MISS_OUTCOME;
      for (const attempt of attempts) {
        outcome = await geocoder.resolve(attempt);
        if (outcome.physicalId) break;
      }
      await updateTrafficVolumeGeocode(
        local.db,
        {
          requestId: row.request_id,
          segmentId: row.segment_id,
          sampledAt: row.sampled_at,
        },
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
  path: ["geocode", "traffic-volumes"],
  summary: "Geocode local_dot_traffic_volume_count rows via Geoclient intersections.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        batchSize: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(500)))
          .annotate({ description: "Rows per batch" }),
        maxRows: Schema.optionalKey(arg.positiveInt()).annotate({
          description: "Cap total rows scanned",
        }),
      },
    }),
  },
  output: Schema.Struct({
    scanned: Schema.Number,
    hits: Schema.Number,
    misses: Schema.Number,
    cached: Schema.Number,
  }),
  async run({ input }) {
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      localDbOptions: { spatial: true },
      command: "geocode.traffic-volumes",
      operation: "runGeocodeTrafficVolumes",
      spanAttributes: {
        batchSize: input.options.batchSize,
        maxRows: input.options.maxRows ?? null,
      },
      run: (local) =>
        runGeocodeTrafficVolumes({
          local,
          batchSize: input.options.batchSize,
          maxRows: input.options.maxRows,
        }),
    });
  },
});

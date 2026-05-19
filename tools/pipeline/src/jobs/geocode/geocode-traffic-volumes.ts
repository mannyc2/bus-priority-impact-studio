import { withLocalPipelineDb } from "../../lib/local-db.js";
import {
  createGeoclientFromEnv,
  Geocoder,
  type GeocodeInput,
  type GeocodeOutcome,
} from "../../lib/geocoder.js";

type Args = {
  dbPath?: string;
  batchSize?: number;
  maxRows?: number;
};

type Result = {
  scanned: number;
  hits: number;
  misses: number;
  cached: number;
};

const MISS_OUTCOME: GeocodeOutcome = {
  physicalId: null,
  lat: null,
  lng: null,
  confidence: "no_inputs",
  cached: false,
};

function parseCliArgs(args: string[]): Args {
  const out: Args = {};
  const dbi = args.indexOf("--db-path");
  const dbPath = dbi !== -1 ? args[dbi + 1] : undefined;
  if (dbPath !== undefined) out.dbPath = dbPath;
  const bi = args.indexOf("--batch-size");
  if (bi !== -1) {
    const n = Number(args[bi + 1]);
    if (Number.isFinite(n)) out.batchSize = n;
  }
  const mi = args.indexOf("--max-rows");
  if (mi !== -1) {
    const n = Number(args[mi + 1]);
    if (Number.isFinite(n)) out.maxRows = n;
  }
  return out;
}

/**
 * Geocode DOT traffic-volume rows by their (street, from_street, to_street,
 * borough) tuple. The published wkt_geom is NYC State Plane (EPSG:2263), not
 * 4326, so we don't try to intersect it directly — the Geoclient intersection
 * path produces a LION physical_id we can join against the corridor table.
 *
 * Adjacent rows in the dataset share the same segment id sampled at different
 * 15-minute windows, so the local_address_geocode cache absorbs ~95% of the
 * work after the first pass over distinct (street, from, to) tuples.
 */
export async function geocodeTrafficVolumes(args: Args = {}): Promise<Result> {
  const batchSize = args.batchSize ?? 500;
  const maxRows = args.maxRows ?? Number.POSITIVE_INFINITY;
  const geoclient = createGeoclientFromEnv();

  return withLocalPipelineDb(
    args.dbPath,
    async (local) => {
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

      const update = local.sqlite.prepare(
        `UPDATE local_dot_traffic_volume_count
            SET physical_id = ?, geocode_confidence = ?
          WHERE request_id = ? AND segment_id = ? AND sampled_at = ?`,
      );

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
          update.run(
            outcome.physicalId,
            outcome.confidence,
            row.request_id,
            row.segment_id,
            row.sampled_at,
          );
          if (outcome.cached) cached += 1;
          if (outcome.physicalId) hits += 1;
          else misses += 1;
        }
      }
      return { scanned, hits, misses, cached };
    },
    { spatial: true },
  );
}

export async function geocodeTrafficVolumesFromCli(args: string[]): Promise<Result> {
  const result = await geocodeTrafficVolumes(parseCliArgs(args));
  console.log(
    `geocode traffic-volumes: scanned=${result.scanned} hits=${result.hits} misses=${result.misses} cached=${result.cached}`,
  );
  return result;
}

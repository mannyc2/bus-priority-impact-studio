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
 * Parse `link_points = "lat,lng lat,lng ..."` into a [lat, lng] pair from the
 * polyline midpoint. Returns null when parsing fails or the points are
 * malformed.
 */
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
  // Midpoint of the polyline is closer to the segment center than the first
  // vertex and gives the snap path a better chance of picking the canonical
  // LION segment for the link.
  const mid = pairs[Math.floor(pairs.length / 2)];
  return mid ?? null;
}

/**
 * Geocode DOT traffic-speed link snapshots by snapping `link_points` (a
 * decimal-degree polyline) to the nearest LION centerline segment.
 *
 * Uses lat/lng snap only — no Geoclient calls. The `link_points` field is
 * already WGS84 so the spatialite snap is direct.
 */
export async function geocodeTrafficSpeeds(args: Args = {}): Promise<Result> {
  const batchSize = args.batchSize ?? 500;
  const maxRows = args.maxRows ?? Number.POSITIVE_INFINITY;
  // Geoclient isn't reachable from the snap path but the Geocoder constructor
  // accepts null; we still use it for the cache layer.
  const geoclient = createGeoclientFromEnv();

  return withLocalPipelineDb(
    args.dbPath,
    async (local) => {
      const geocoder = new Geocoder({
        db: local.db,
        sqlite: local.sqlite,
        sourceLabel: "nyc_dot_traffic_speed",
        geoclient,
        // DOT speed links can span entire bridges; widen the snap radius so
        // the midpoint reliably resolves to the right corridor.
        snapMaxMeters: 150,
      });

      let scanned = 0;
      let hits = 0;
      let misses = 0;
      let cached = 0;

      const update = local.sqlite.prepare(
        `UPDATE local_dot_traffic_speed
            SET physical_id = ?, geocode_confidence = ?
          WHERE link_id = ? AND sampled_at = ?`,
      );

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
          update.run(outcome.physicalId, outcome.confidence, row.link_id, row.sampled_at);
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

export async function geocodeTrafficSpeedsFromCli(args: string[]): Promise<Result> {
  const result = await geocodeTrafficSpeeds(parseCliArgs(args));
  console.log(
    `geocode traffic-speeds: scanned=${result.scanned} hits=${result.hits} misses=${result.misses} cached=${result.cached}`,
  );
  return result;
}

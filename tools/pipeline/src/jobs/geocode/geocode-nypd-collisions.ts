import { parseHouseAddress } from "@bp/sources/nyc-geoclient";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import {
  createGeoclientFromEnv,
  Geocoder,
  type GeocodeInput,
  type GeocodeOutcome,
} from "../../lib/geocoder.js";

const MISS_OUTCOME: GeocodeOutcome = {
  physicalId: null,
  lat: null,
  lng: null,
  confidence: "no_inputs",
  cached: false,
};

/**
 * Many NYPD rows carry "(0.0, 0.0)" as a sentinel for "address known but
 * coordinates withheld". Treating that as a real coordinate sends the snap
 * path into the Gulf of Guinea and wastes the row.
 */
function hasUsableLatLng(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

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

export async function geocodeNypdCollisions(args: Args = {}): Promise<Result> {
  const batchSize = args.batchSize ?? 500;
  const maxRows = args.maxRows ?? Number.POSITIVE_INFINITY;
  const geoclient = createGeoclientFromEnv();

  return withLocalPipelineDb(
    args.dbPath,
    async (local) => {
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

      const update = local.sqlite.prepare(
        `UPDATE local_nypd_collision
            SET physical_id = ?, geocode_confidence = ?
          WHERE collision_id = ?`,
      );

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
          // Build a prioritized list of attempts. The geocoder caches each
          // attempt independently, so a row that hits on attempt 2 still
          // benefits from caching the negative attempt 1 result.
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
          // NYPD has two intersection fields that vary by row: the canonical
          // schema is (on_street_name, cross_street_name), but rows that came
          // through the geocoded ingest path frequently ship (on_street_name,
          // off_street_name) as the real intersection pair. Try both shapes
          // before falling through to single-field parses.
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
          // When the (0,0) sentinel hides the real coordinates, NYPD ships
          // the address in a single field. Empirically that field is usually
          // cross_street_name ("203       E 197 ST"), occasionally
          // off_street_name. Try both.
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
          update.run(outcome.physicalId, outcome.confidence, row.collision_id);
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

export async function geocodeNypdCollisionsFromCli(args: string[]): Promise<Result> {
  const result = await geocodeNypdCollisions(parseCliArgs(args));
  console.log(
    `geocode NYPD: scanned=${result.scanned} hits=${result.hits} misses=${result.misses} cached=${result.cached}`,
  );
  return result;
}

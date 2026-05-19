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
 * Geocode DOT street permits. Each permit covers a corridor between
 * (on_street, from_street) and (on_street, to_street). We anchor the permit
 * to a single physical_id derived from the best-effort attempt:
 *
 *   1. address: house_number + on_street_name + borough  (point-style permits)
 *   2. intersection: on_street + from_street             (corridor start)
 *   3. intersection: on_street + to_street               (corridor end)
 *
 * The detector later joins through local_route_lion_link to find which
 * routes pass through the segment; the single anchor is sufficient because
 * the route<->LION corridor link table provides the full corridor context.
 */
export async function geocodePermits(args: Args = {}): Promise<Result> {
  const batchSize = args.batchSize ?? 500;
  const maxRows = args.maxRows ?? Number.POSITIVE_INFINITY;
  const geoclient = createGeoclientFromEnv();

  return withLocalPipelineDb(
    args.dbPath,
    async (local) => {
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

      const update = local.sqlite.prepare(
        `UPDATE local_dot_street_permit
            SET physical_id = ?, geocode_confidence = ?
          WHERE permit_number = ?`,
      );

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
          // 1. Address (only when the permit names a specific house).
          if (row.house_number && row.on_street_name) {
            attempts.push({
              kind: "address",
              houseNumber: row.house_number,
              street: row.on_street_name,
              borough,
            });
          }
          // 2. Intersection at the corridor start.
          if (row.on_street_name && row.from_street_name) {
            attempts.push({
              kind: "intersection",
              crossStreetOne: row.on_street_name,
              crossStreetTwo: row.from_street_name,
              borough,
            });
          }
          // 3. Intersection at the corridor end (skip if same as start).
          if (
            row.on_street_name &&
            row.to_street_name &&
            row.to_street_name !== row.from_street_name
          ) {
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
          update.run(outcome.physicalId, outcome.confidence, row.permit_number);
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

export async function geocodePermitsFromCli(args: string[]): Promise<Result> {
  const result = await geocodePermits(parseCliArgs(args));
  console.log(
    `geocode permits: scanned=${result.scanned} hits=${result.hits} misses=${result.misses} cached=${result.cached}`,
  );
  return result;
}

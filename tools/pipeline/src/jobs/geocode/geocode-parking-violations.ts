import { withLocalPipelineDb } from "../../lib/local-db.js";
import { createGeoclientFromEnv, Geocoder } from "../../lib/geocoder.js";

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

export async function geocodeParkingViolations(args: Args = {}): Promise<Result> {
  const batchSize = args.batchSize ?? 500;
  const maxRows = args.maxRows ?? Number.POSITIVE_INFINITY;
  const geoclient = createGeoclientFromEnv();

  return withLocalPipelineDb(
    args.dbPath,
    async (local) => {
      const geocoder = new Geocoder({
        db: local.db,
        sqlite: local.sqlite,
        sourceLabel: "nyc_parking_violation",
        geoclient,
      });

      let scanned = 0;
      let hits = 0;
      let misses = 0;
      let cached = 0;

      const update = local.sqlite.prepare(
        `UPDATE local_parking_violation
            SET physical_id = ?, geocode_confidence = ?
          WHERE summons_number = ?`,
      );

      while (scanned < maxRows) {
        const remaining = Math.min(batchSize, maxRows - scanned);
        if (remaining <= 0) break;
        const rows = local.sqlite
          .query<
            {
              summons_number: string;
              house_number: string | null;
              street_name: string | null;
              violation_county: string | null;
            },
            [number]
          >(
            `SELECT summons_number, house_number, street_name, violation_county
               FROM local_parking_violation
              WHERE physical_id IS NULL AND geocode_confidence IS NULL
              LIMIT ?`,
          )
          .all(remaining);

        if (rows.length === 0) break;
        for (const row of rows) {
          scanned += 1;
          let outcome;
          if (row.house_number && row.street_name) {
            outcome = await geocoder.resolve({
              kind: "address",
              houseNumber: row.house_number,
              street: row.street_name,
              borough: row.violation_county ?? "",
            });
          } else {
            outcome = { physicalId: null, lat: null, lng: null, confidence: "no_inputs", cached: false };
          }
          update.run(outcome.physicalId, outcome.confidence, row.summons_number);
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

export async function geocodeParkingViolationsFromCli(args: string[]): Promise<Result> {
  const result = await geocodeParkingViolations(parseCliArgs(args));
  console.log(
    `geocode parking: scanned=${result.scanned} hits=${result.hits} misses=${result.misses} cached=${result.cached}`,
  );
  return result;
}

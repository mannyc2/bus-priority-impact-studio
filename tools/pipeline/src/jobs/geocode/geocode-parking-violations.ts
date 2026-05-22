import { withLocalPipelineDb } from "../../lib/local-db.js";
import { createGeoclientFromEnv, Geocoder } from "../../lib/geocoder.js";
import { canonicalBoroughCode, normalizeStreetName } from "@bp/sources/nyc-geoclient";

type Args = {
  dbPath?: string;
  batchSize?: number;
  maxRows?: number;
  since?: string;
  until?: string;
  streetOnly?: boolean;
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
  const si = args.indexOf("--since");
  const since = si !== -1 ? args[si + 1] : undefined;
  if (since) out.since = since;
  const ui = args.indexOf("--until");
  const until = ui !== -1 ? args[ui + 1] : undefined;
  if (until) out.until = until;
  if (args.includes("--street-only")) out.streetOnly = true;
  return out;
}

function boroughLetterFromCode(code: string | null): string | null {
  if (code === "1") return "M";
  if (code === "2") return "X";
  if (code === "3") return "K";
  if (code === "4") return "Q";
  if (code === "5") return "R";
  return null;
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
        geoclient: args.streetOnly === true ? null : geoclient,
      });
      const streetOnlyQuery = local.sqlite.prepare(
        `SELECT physical_id FROM local_lion_segment
          WHERE UPPER(street_name) = ?
            AND (? IS NULL OR UPPER(borough) = ? OR borough = ?)
          ORDER BY physical_id
          LIMIT 1`,
      );

      let scanned = 0;
      let hits = 0;
      let misses = 0;
      let cached = 0;

      const updateAddressGroup = local.sqlite.prepare(
        `UPDATE local_parking_violation
            SET physical_id = ?, geocode_confidence = ?
          WHERE physical_id IS NULL
            AND geocode_confidence IS NULL
            AND house_number IS ?
            AND street_name IS ?
            AND violation_county IS ?
            AND (? IS NULL OR issue_date >= ?)
            AND (? IS NULL OR issue_date < ?)`,
      );

      const datePredicates: string[] = [];
      const dateParams: string[] = [];
      if (args.since) {
        datePredicates.push("issue_date >= ?");
        dateParams.push(args.since);
      }
      if (args.until) {
        datePredicates.push("issue_date < ?");
        dateParams.push(args.until);
      }
      const dateWhere =
        datePredicates.length > 0 ? ` AND ${datePredicates.join(" AND ")}` : "";

      while (scanned < maxRows) {
        if (batchSize <= 0) break;
        const rows = local.sqlite
          .query<
            {
              house_number: string | null;
              street_name: string | null;
              violation_county: string | null;
              row_count: number;
            },
            [...string[], number]
          >(
            `SELECT house_number,
                    street_name,
                    violation_county,
                    count(*) AS row_count
               FROM local_parking_violation
              WHERE physical_id IS NULL AND geocode_confidence IS NULL
                    ${dateWhere}
              GROUP BY house_number, street_name, violation_county
              ORDER BY
                    CASE WHEN house_number IS NOT NULL AND street_name IS NOT NULL THEN 0 ELSE 1 END,
                    row_count DESC
              LIMIT ?`,
          )
          .all(...dateParams, batchSize);

        if (rows.length === 0) break;
        for (const row of rows) {
          scanned += row.row_count;
          let outcome;
          if (args.streetOnly === true && row.street_name) {
            const street = normalizeStreetName(row.street_name);
            const borough = canonicalBoroughCode(row.violation_county);
            const boroughLetter = boroughLetterFromCode(borough);
            const streetRow = street
              ? (streetOnlyQuery.get(street, borough, boroughLetter, borough) as
                  | { physical_id: string }
                  | undefined)
              : undefined;
            outcome = streetRow
              ? {
                  physicalId: streetRow.physical_id,
                  lat: null,
                  lng: null,
                  confidence: "street_only",
                  cached: true,
                }
              : {
                  physicalId: null,
                  lat: null,
                  lng: null,
                  confidence: street ? "street_only_miss" : "no_inputs",
                  cached: false,
                };
          } else if (row.house_number && row.street_name) {
            outcome = await geocoder.resolve({
              kind: "address",
              houseNumber: row.house_number,
              street: row.street_name,
              borough: row.violation_county ?? "",
            });
          } else {
            outcome = { physicalId: null, lat: null, lng: null, confidence: "no_inputs", cached: false };
          }
          const result = updateAddressGroup.run(
            outcome.physicalId,
            outcome.confidence,
            row.house_number,
            row.street_name,
            row.violation_county,
            args.since ?? null,
            args.since ?? null,
            args.until ?? null,
            args.until ?? null,
          );
          const changed = result.changes;
          if (outcome.cached) cached += changed;
          if (outcome.physicalId) hits += changed;
          else misses += changed;
          if (scanned >= maxRows) break;
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

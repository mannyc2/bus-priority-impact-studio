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
  since?: string;
  until?: string;
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
  if (since) {
    out.since = since;
  }
  const ui = args.indexOf("--until");
  const until = ui !== -1 ? args[ui + 1] : undefined;
  if (until) {
    out.until = until;
  }
  return out;
}

export async function geocode311(args: Args = {}): Promise<Result> {
  const batchSize = args.batchSize ?? 500;
  const maxRows = args.maxRows ?? Number.POSITIVE_INFINITY;
  const geoclient = createGeoclientFromEnv();

  return withLocalPipelineDb(
    args.dbPath,
    async (local) => {
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

      const update = local.sqlite.prepare(
        `UPDATE local_311_service_request
            SET physical_id = ?, geocode_confidence = ?
          WHERE unique_key = ?`,
      );

      const datePredicates: string[] = [];
      const dateParams: string[] = [];
      if (args.since) {
        datePredicates.push("created_date >= ?");
        dateParams.push(args.since);
      }
      if (args.until) {
        datePredicates.push("created_date < ?");
        dateParams.push(args.until);
      }
      const dateWhere =
        datePredicates.length > 0 ? ` AND ${datePredicates.join(" AND ")}` : "";

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
          // city is usually "BROOKLYN" / "Bronx"; community_board is
          // "01 BROOKLYN" / "Unspecified BRONX" (both handled by the
          // borough normalizer downstream).
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
          // 311 ships TWO cross streets; the first is often a non-existent
          // descriptive name (e.g. "NYPD SCG LORRAINE P ELLIOTT WAY"). Try
          // both before giving up.
          if (row.street_name && row.cross_street_1) {
            attempts.push({
              kind: "intersection",
              crossStreetOne: row.street_name,
              crossStreetTwo: row.cross_street_1,
              borough,
            });
          }
          if (
            row.street_name &&
            row.cross_street_2 &&
            row.cross_street_2 !== row.cross_street_1
          ) {
            attempts.push({
              kind: "intersection",
              crossStreetOne: row.street_name,
              crossStreetTwo: row.cross_street_2,
              borough,
            });
          }
          // Some rows ship a single combined address in `incident_address`.
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
          update.run(outcome.physicalId, outcome.confidence, row.unique_key);
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

export async function geocode311FromCli(args: string[]): Promise<Result> {
  const result = await geocode311(parseCliArgs(args));
  console.log(
    `geocode 311: scanned=${result.scanned} hits=${result.hits} misses=${result.misses} cached=${result.cached}`,
  );
  return result;
}

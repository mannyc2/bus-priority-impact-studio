import { arg, defineCommand, z } from "@bp/pipeline-v2/cli/compat";
import { canonicalBoroughCode, normalizeStreetName } from "@bp/sources/clients/geoclient";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { createGeoclientFromEnv, type GeocodeOutcome, Geocoder } from "../../lib/geocoder.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";

export type GeocodeParkingInputs = {
  local: OpenLocalPipelineDb;
  batchSize?: number | undefined;
  maxRows?: number | undefined;
  since?: string | undefined;
  until?: string | undefined;
  streetOnly?: boolean | undefined;
};

export type GeocodeParkingResult = {
  scanned: number;
  hits: number;
  misses: number;
  cached: number;
};

function boroughLetterFromCode(code: string | null): string | null {
  if (code === "1") return "M";
  if (code === "2") return "X";
  if (code === "3") return "K";
  if (code === "4") return "Q";
  if (code === "5") return "R";
  return null;
}

export async function runGeocodeParkingViolations(
  inputs: GeocodeParkingInputs,
): Promise<GeocodeParkingResult> {
  const batchSize = inputs.batchSize ?? 500;
  const maxRows = inputs.maxRows ?? Number.POSITIVE_INFINITY;
  const geoclient = createGeoclientFromEnv();
  const { local } = inputs;

  const geocoder = new Geocoder({
    db: local.db,
    sqlite: local.sqlite,
    sourceLabel: "nyc_parking_violation",
    geoclient: inputs.streetOnly === true ? null : geoclient,
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
  if (inputs.since) {
    datePredicates.push("issue_date >= ?");
    dateParams.push(inputs.since);
  }
  if (inputs.until) {
    datePredicates.push("issue_date < ?");
    dateParams.push(inputs.until);
  }
  const dateWhere = datePredicates.length > 0 ? ` AND ${datePredicates.join(" AND ")}` : "";

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
      let outcome: GeocodeOutcome;
      if (inputs.streetOnly === true && row.street_name) {
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
        outcome = {
          physicalId: null,
          lat: null,
          lng: null,
          confidence: "no_inputs",
          cached: false,
        };
      }
      const result = updateAddressGroup.run(
        outcome.physicalId,
        outcome.confidence,
        row.house_number,
        row.street_name,
        row.violation_county,
        inputs.since ?? null,
        inputs.since ?? null,
        inputs.until ?? null,
        inputs.until ?? null,
      );
      const changed = result.changes;
      if (outcome.cached) cached += changed;
      if (outcome.physicalId) hits += changed;
      else misses += changed;
      if (scanned >= maxRows) break;
    }
  }
  return { scanned, hits, misses, cached };
}

export default defineCommand({
  path: ["geocode", "parking-violations"],
  summary: "Geocode local_parking_violation address groups via Geoclient.",
  input: {
    options: dbOptions.extend({
      batchSize: arg.positiveInt().default(500).describe("Address groups per batch"),
      maxRows: arg.positiveInt().optional().describe("Cap total rows scanned"),
      since: z.string().optional().describe("Inclusive lower bound on issue_date"),
      until: z.string().optional().describe("Exclusive upper bound on issue_date"),
      streetOnly: arg
        .boolean()
        .default(false)
        .describe("Use LION street-only fallback; skip Geoclient"),
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
      command: "geocode.parking-violations",
      operation: "runGeocodeParkingViolations",
      spanAttributes: {
        batchSize: input.options.batchSize,
        maxRows: input.options.maxRows ?? null,
        since: input.options.since ?? null,
        until: input.options.until ?? null,
        streetOnly: input.options.streetOnly,
      },
      run: (local) =>
        runGeocodeParkingViolations({
          local,
          batchSize: input.options.batchSize,
          maxRows: input.options.maxRows,
          since: input.options.since,
          until: input.options.until,
          streetOnly: input.options.streetOnly,
        }),
    });
  },
});

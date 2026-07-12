import { upsertParkingViolations } from "@bp/db/local";
import { arg, Schema } from "@bp/pipeline-v2/cli/compat";
import {
  BUS_RELEVANT_PARKING_CODES,
  normalizeParkingViolationRows,
} from "@bp/sources/adapters/nyc-open-data/parking-violations";
import { getSocrataSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { Effect } from "effect";
import { isoMonth, isoMonthStart, nextIsoMonthStart } from "../../lib/dates.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { parkingLocationKey } from "../../lib/parking-location.ts";
import { fromRepoRoot } from "../../lib/paths.ts";
import {
  fetchSoda3RowsForSource,
  type SocrataFetch,
  type SocrataRow,
  type Soda3SoqlQuery,
} from "../../lib/soda3.ts";
import { defineIngestCommand } from "./_define-ingest-command.ts";

const parkingFiscalYearSources = [
  { start: "2022-07", end: "2023-06", sourceId: "nyc_parking_violations_fy2023" },
  { start: "2023-07", end: "2024-06", sourceId: "nyc_parking_violations_fy2024" },
  { start: "2024-07", end: "2025-06", sourceId: "nyc_parking_violations_fy2025" },
  { start: "2025-07", end: "2026-06", sourceId: "nyc_parking_violations_current" },
] as const;

export type ParkingViolationsRunInputs = {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  codes?: readonly number[] | undefined;
  fetcher?: SocrataFetch | undefined;
  manifestText?: string | undefined;
};

export type ParkingViolationsIngestResult = {
  isoMonth: string;
  sourceId: string;
  rowCount: number;
  codeBreakdown: { code: number; count: number }[];
};

function parkingSourceIdForMonth(year: number, month: number): string {
  const monthKey = isoMonth(year, month);
  const source = parkingFiscalYearSources.find(
    (candidate) => monthKey >= candidate.start && monthKey <= candidate.end,
  );
  if (source === undefined) {
    throw new Error(`No parking violations fiscal-year source configured for ${monthKey}.`);
  }
  return source.sourceId;
}

export async function runParkingViolationsIngest(
  inputs: ParkingViolationsRunInputs,
): Promise<ParkingViolationsIngestResult> {
  const codes = inputs.codes && inputs.codes.length > 0 ? inputs.codes : BUS_RELEVANT_PARKING_CODES;
  const monthKey = isoMonth(inputs.year, inputs.month);
  const manifestText =
    inputs.manifestText ??
    (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  const sourceId = parkingSourceIdForMonth(inputs.year, inputs.month);
  const source = getSocrataSource(loadSourceManifestYaml(manifestText), sourceId);

  const codeList = codes.join(",");
  const query: Soda3SoqlQuery = {
    where: [
      `issue_date >= '${isoMonthStart(inputs.year, inputs.month)}'`,
      `issue_date < '${nextIsoMonthStart(inputs.year, inputs.month)}'`,
      `violation_code IN (${codeList})`,
    ].join(" AND "),
  };
  const rawRows: SocrataRow[] = [
    ...(await fetchSoda3RowsForSource(source, query, {
      fetcher: inputs.fetcher,
      pageSize: 50_000,
    })),
  ];
  const rows = normalizeParkingViolationRows(rawRows).map((r) => ({
    ...r,
    // Geocode columns set by geocode job; preserved on re-ingest.
    physicalId: null,
    geocodeConfidence: null,
    matchLocationKey: parkingLocationKey({
      violationCode: r.violationCode,
      violationCounty: r.violationCounty,
      streetCode1: r.streetCode1,
      houseNumber: r.houseNumber,
      streetName: r.streetName,
      intersectingStreet: r.intersectingStreet,
    }),
  }));

  await upsertParkingViolations(inputs.local.db, rows);

  const codeBreakdown = [...codes].map((code) => ({
    code,
    count: rows.filter((r) => r.violationCode === code).length,
  }));
  return { isoMonth: monthKey, sourceId, rowCount: rows.length, codeBreakdown };
}

export default defineIngestCommand({
  path: ["ingest", "parking-violations"],
  summary: "Fetch monthly bus-relevant parking violations across fiscal-year datasets.",
  options: Schema.Struct({
    ...dbOptions.fields,
    ...{
      year: arg
        .positiveInt()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(2026)))
        .annotate({ description: "Calendar year" }),
      month: arg
        .positiveInt()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(3)))
        .annotate({ description: "Calendar month, 1-12" }),
      codes: Schema.Array(arg.int())
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed([])))
        .annotate({
          description: "Override violation codes (default: BUS_RELEVANT_PARKING_CODES)",
        }),
    },
  }),
  output: Schema.Struct({
    isoMonth: Schema.String,
    sourceId: Schema.String,
    rowCount: Schema.Number,
    codeBreakdown: Schema.Array(Schema.Struct({ code: Schema.Number, count: Schema.Number })),
  }),
  operation: "runParkingViolationsIngest",
  spanAttributes: ({ year, month, codes }) => ({ year, month, codeCount: codes.length }),
  runner: (local, { year, month, codes }) =>
    runParkingViolationsIngest({
      local,
      year,
      month,
      codes: codes.length > 0 ? codes : undefined,
    }),
});

import { upsert311ServiceRequests } from "@bp/db/local";
import { arg, Schema } from "@bp/pipeline-v2/cli/compat";
import {
  CURB_FRICTION_311_COMPLAINT_TYPES,
  normalize311ServiceRequestRows,
  type ServiceRequestEra,
} from "@bp/sources/adapters/nyc-open-data/service-requests-311";
import { Effect } from "effect";
import { isoMonthStart, nextIsoMonthStart } from "../../lib/dates.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { defineSocrataMonthlyIngest } from "../../lib/socrata-monthly-ingest.ts";
import type { SocrataFetch } from "../../lib/soda3.ts";
import { defineIngestCommand } from "./_define-ingest-command.ts";

const sourceIdForEra: Record<ServiceRequestEra, string> = {
  current: "nyc_311_service_requests_current",
  historical: "nyc_311_service_requests_historical",
};

export type Nyc311IngestRunInputs = {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  era?: ServiceRequestEra | undefined;
  complaintTypes?: readonly string[] | undefined;
  fetchedAt?: Date | undefined;
  fetcher?: SocrataFetch | undefined;
  manifestText?: string | undefined;
  snapshotPath?: string | undefined;
};

export type Nyc311IngestResult = {
  rawPath: string;
  isoMonth: string;
  rowCount: number;
  era: ServiceRequestEra;
};

function complaintTypesClause(types: readonly string[]): string {
  return `complaint_type IN (${types.map((type) => `'${type.replace(/'/g, "''")}'`).join(",")})`;
}

export async function runNyc311Ingest(inputs: Nyc311IngestRunInputs): Promise<Nyc311IngestResult> {
  const era = inputs.era ?? "current";
  const complaintTypes =
    inputs.complaintTypes && inputs.complaintTypes.length > 0
      ? inputs.complaintTypes
      : CURB_FRICTION_311_COMPLAINT_TYPES;
  const run = defineSocrataMonthlyIngest({
    sourceId: sourceIdForEra[era],
    rawDir: "data/raw/311",
    rawFilePrefix: `311-${era}`,
    queryGrain: "unique_key",
    pageSize: 50_000,
    snapshotExtra: () => ({ era, complaintTypes: [...complaintTypes] }),
    snapshotQuery: ({ isoMonth }) => ({
      grain: "unique_key",
      month: isoMonth,
      complaintFilter: complaintTypes.length,
    }),
    query: ({ year, month }) => ({
      where: [
        `created_date >= '${isoMonthStart(year, month)}'`,
        `created_date < '${nextIsoMonthStart(year, month)}'`,
        complaintTypesClause(complaintTypes),
      ].join(" AND "),
      order: "unique_key",
    }),
    normalize: ({ rawRows }) =>
      normalize311ServiceRequestRows([...rawRows], era).map((row) => ({
        ...row,
        physicalId: null,
        geocodeConfidence: null,
      })),
    replaceRows: ({ local, rows }) => upsert311ServiceRequests(local.db, [...rows]),
    summarize: () => ({ era }),
  });
  return run(inputs);
}

export default defineIngestCommand({
  path: ["ingest", "311-service-requests"],
  summary: "Fetch monthly curb-friction 311 service requests.",
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
      era: Schema.Literals(["current", "historical"])
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed("current")))
        .annotate({ description: "311 dataset era" }),
      complaintTypes: Schema.Array(Schema.String)
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed([])))
        .annotate({ description: "Override complaint type filter" }),
    },
  }),
  output: Schema.Struct({
    rawPath: Schema.String,
    isoMonth: Schema.String,
    rowCount: Schema.Number,
    era: Schema.Literals(["current", "historical"]),
  }),
  operation: "runNyc311Ingest",
  spanAttributes: ({ year, month, era, complaintTypes }) => ({
    year,
    month,
    era,
    complaintTypeCount: complaintTypes.length,
  }),
  runner: (local, { year, month, era, complaintTypes }) =>
    runNyc311Ingest({
      local,
      year,
      month,
      era,
      complaintTypes: complaintTypes.length > 0 ? complaintTypes : undefined,
    }),
});

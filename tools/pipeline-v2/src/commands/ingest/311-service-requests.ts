import { join } from "node:path";
import { arg, defineCommand, z } from "@liche/core";
import { upsert311ServiceRequests } from "@bp/db/local";
import {
  BUS_RELEVANT_311_COMPLAINTS,
  getSocrataSource,
  normalize311ServiceRequestRows,
  parseSourceManifest,
  type ServiceRequestEra,
  type SocrataFetch,
  type SocrataRow,
  type SocrataRowsQuery,
  SocrataClient,
} from "@bp/sources";
import { isoMonth, isoMonthStart, nextIsoMonthStart } from "../../lib/dates.ts";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";
import { fromRepoRoot } from "../../lib/paths.ts";
import { writeRawSourceSnapshot } from "../../lib/source-snapshots.ts";

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
  const list = types.map((t) => `'${t.replace(/'/g, "''")}'`).join(",");
  return `complaint_type IN (${list})`;
}

export async function runNyc311Ingest(inputs: Nyc311IngestRunInputs): Promise<Nyc311IngestResult> {
  const era: ServiceRequestEra = inputs.era ?? "current";
  const complaintTypes =
    inputs.complaintTypes && inputs.complaintTypes.length > 0
      ? inputs.complaintTypes
      : BUS_RELEVANT_311_COMPLAINTS;
  const sourceId = sourceIdForEra[era];
  const monthKey = isoMonth(inputs.year, inputs.month);
  const manifestText =
    inputs.manifestText ??
    (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  const source = getSocrataSource(parseSourceManifest(manifestText), sourceId);
  const fetchedAt = (inputs.fetchedAt ?? new Date()).toISOString();
  const rawPath =
    inputs.snapshotPath ?? fromRepoRoot(join("data/raw/311", `311-${era}-${monthKey}.json`));

  const query: SocrataRowsQuery = {
    where: [
      `created_date >= '${isoMonthStart(inputs.year, inputs.month)}'`,
      `created_date < '${nextIsoMonthStart(inputs.year, inputs.month)}'`,
      complaintTypesClause(complaintTypes),
    ].join(" AND "),
    order: "unique_key",
  };
  const rawRows: SocrataRow[] = await SocrataClient.fromSource(source, {
    fetcher: inputs.fetcher,
    pageSize: 50_000,
  }).rows(query);
  const rows = normalize311ServiceRequestRows(rawRows, era).map((r) => ({
    ...r,
    // Geocode columns set by geocode job; preserved on re-ingest.
    physicalId: null,
    geocodeConfidence: null,
  }));

  await upsert311ServiceRequests(inputs.local.db, rows);

  await writeRawSourceSnapshot({
    path: rawPath,
    sourceId,
    extra: { isoMonth: monthKey, era, complaintTypes: [...complaintTypes] },
    fetchedAt,
    query: { grain: "unique_key", month: monthKey, complaintFilter: complaintTypes.length },
    rows: rawRows,
  });

  return { rawPath, isoMonth: monthKey, rowCount: rows.length, era };
}

export default defineCommand({
  path: ["ingest", "311-service-requests"],
  summary: "Fetch monthly bus-relevant 311 service requests.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      era: z.enum(["current", "historical"]).default("current").describe("311 dataset era"),
      complaintTypes: z
        .array(z.string())
        .default([])
        .describe("Override complaint type filter (default: BUS_RELEVANT_311_COMPLAINTS)"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    rawPath: z.string(),
    isoMonth: z.string(),
    rowCount: z.number(),
    era: z.enum(["current", "historical"]),
  }),
  async run({ ctx, input }) {
    return runNyc311Ingest({
      local: localDbFromCtx(ctx),
      year: input.options.year,
      month: input.options.month,
      era: input.options.era,
      complaintTypes:
        input.options.complaintTypes.length > 0 ? input.options.complaintTypes : undefined,
    });
  },
});

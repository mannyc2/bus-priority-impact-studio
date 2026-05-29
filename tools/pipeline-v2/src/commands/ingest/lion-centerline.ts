import { join } from "node:path";
import { defineCommand, z } from "@liche/core";
import { upsertLionSegments } from "@bp/db/local";
import {
  getSocrataSource,
  normalizeLionSegmentRows,
  parseSourceManifest,
  type SocrataFetch,
  type SocrataRow,
  type SocrataRowsQuery,
  SocrataClient,
} from "@bp/sources";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";
import { fromRepoRoot } from "../../lib/paths.ts";
import { writeRawSourceSnapshot } from "../../lib/source-snapshots.ts";

const sourceId = "nyc_lion_street_centerline";

export type LionCenterlineRunInputs = {
  local: OpenLocalPipelineDb;
  borough?: string | undefined;
  status?: string | undefined;
  fetchedAt?: Date | undefined;
  fetcher?: SocrataFetch | undefined;
  manifestText?: string | undefined;
  snapshotPath?: string | undefined;
};

export type LionCenterlineIngestResult = {
  rawPath: string;
  rowCount: number;
};

export async function runLionCenterlineIngest(
  inputs: LionCenterlineRunInputs,
): Promise<LionCenterlineIngestResult> {
  const manifestText =
    inputs.manifestText ??
    (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  const source = getSocrataSource(parseSourceManifest(manifestText), sourceId);
  const fetchedAt = (inputs.fetchedAt ?? new Date()).toISOString();
  const stamp = fetchedAt.slice(0, 10);
  const rawPath =
    inputs.snapshotPath ??
    fromRepoRoot(join("data/raw/lion-centerline", `lion-centerline-${stamp}.json`));

  const whereClauses: string[] = ["physicalid IS NOT NULL"];
  if (inputs.borough !== undefined) {
    whereClauses.push(`borough_indicator = '${inputs.borough.replace(/'/g, "''")}'`);
  }
  // Default to currently-active segments only; status "2" historically means
  // "in service". Callers can override.
  whereClauses.push(`status = '${(inputs.status ?? "2").replace(/'/g, "''")}'`);
  const query: SocrataRowsQuery = {
    where: whereClauses.join(" AND "),
    order: "physicalid",
  };
  const rawRows: SocrataRow[] = await SocrataClient.fromSource(source, {
    fetcher: inputs.fetcher,
  }).rows(query);
  const normalized = normalizeLionSegmentRows(rawRows);
  const rows = normalized.map((n) => ({
    physicalId: n.physicalId,
    streetCodeMaster: n.streetCodeMaster,
    streetName: n.streetName,
    borough: n.borough,
    boroughCode: n.boroughCode,
    leftLowHouseNumber: n.leftLowHouseNumber,
    leftHighHouseNumber: n.leftHighHouseNumber,
    rightLowHouseNumber: n.rightLowHouseNumber,
    rightHighHouseNumber: n.rightHighHouseNumber,
    l_zip: n.l_zip,
    r_zip: n.r_zip,
    segmentTypeCode: null,
    segmentTypeDesc: null,
    rwTypeCode: n.rwTypeCode,
    rwTypeDesc: n.rwTypeDesc,
    fromNodeId: null,
    toNodeId: null,
    trafficDir: n.trafficDir,
    fromLevelCode: null,
    toLevelCode: null,
    shapeLength: n.shapeLength,
    wktGeom: n.wktGeom,
  }));

  await upsertLionSegments(inputs.local.db, rows);

  await writeRawSourceSnapshot({
    path: rawPath,
    sourceId,
    extra: { borough: inputs.borough ?? null, status: inputs.status ?? "2" },
    fetchedAt,
    query: { grain: "physicalid" },
    rows: rawRows,
  });

  return { rawPath, rowCount: rows.length };
}

export default defineCommand({
  path: ["ingest", "lion-centerline"],
  summary: "Fetch LION street centerline segments from Socrata.",
  input: {
    options: dbOptions.extend({
      borough: z.string().optional().describe("Filter by borough indicator"),
      status: z.string().optional().describe("LION status code (default: 2 = in service)"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    rawPath: z.string(),
    rowCount: z.number(),
  }),
  async run({ ctx, input }) {
    return runLionCenterlineIngest({
      local: localDbFromCtx(ctx),
      borough: input.options.borough,
      status: input.options.status,
    });
  },
});

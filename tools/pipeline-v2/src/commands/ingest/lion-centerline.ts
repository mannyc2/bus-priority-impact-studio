import { join } from "node:path";
import { upsertLionSegments } from "@bp/db/local";
import { z } from "@bp/pipeline-v2/cli/compat";
import { normalizeLionSegmentRows } from "@bp/sources/adapters/nyc-open-data/lion-centerline";
import { getSocrataSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { fromRepoRoot } from "../../lib/paths.ts";
import {
  fetchSoda3RowsForSource,
  type SocrataFetch,
  type SocrataRow,
  type Soda3SoqlQuery,
} from "../../lib/soda3.ts";
import { writeRawSourceSnapshot } from "../../lib/source-snapshots.ts";
import { defineIngestCommand } from "./_define-ingest-command.ts";

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
  const source = getSocrataSource(loadSourceManifestYaml(manifestText), sourceId);
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
  const query: Soda3SoqlQuery = {
    where: whereClauses.join(" AND "),
    order: "physicalid",
  };
  const rawRows: SocrataRow[] = [
    ...(await fetchSoda3RowsForSource(source, query, {
      fetcher: inputs.fetcher,
    })),
  ];
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

export default defineIngestCommand({
  path: ["ingest", "lion-centerline"],
  summary: "Fetch LION street centerline segments from Socrata.",
  options: dbOptions.extend({
    borough: z.string().optional().describe("Filter by borough indicator"),
    status: z.string().optional().describe("LION status code (default: 2 = in service)"),
  }),
  output: z.object({
    rawPath: z.string(),
    rowCount: z.number(),
  }),
  operation: "runLionCenterlineIngest",
  spanAttributes: ({ borough, status }) => ({ borough: borough ?? null, status: status ?? null }),
  runner: (local, { borough, status }) => runLionCenterlineIngest({ local, borough, status }),
});

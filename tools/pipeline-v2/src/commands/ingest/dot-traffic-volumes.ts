import { join } from "node:path";
import { arg, defineCommand, z } from "@liche/core";
import { insertDotTrafficVolumeCounts } from "@bp/db/local";
import {
  getSocrataSource,
  normalizeDotTrafficVolumeRows,
  parseSourceManifest,
  type SocrataFetch,
  type SocrataRow,
  type SocrataRowsQuery,
  SocrataClient,
} from "@bp/sources";
import { isoMonth } from "../../lib/dates.ts";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";
import { fromRepoRoot } from "../../lib/paths.ts";
import { writeRawSourceSnapshot } from "../../lib/source-snapshots.ts";

const sourceId = "nyc_dot_traffic_volume_counts";

export type DotTrafficVolumesRunInputs = {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  fetchedAt?: Date | undefined;
  fetcher?: SocrataFetch | undefined;
  manifestText?: string | undefined;
  snapshotPath?: string | undefined;
};

export type DotTrafficVolumesIngestResult = {
  rawPath: string;
  isoMonth: string;
  rowCount: number;
  segmentCount: number;
};

export async function runDotTrafficVolumesIngest(
  inputs: DotTrafficVolumesRunInputs,
): Promise<DotTrafficVolumesIngestResult> {
  const monthKey = isoMonth(inputs.year, inputs.month);
  const manifestText =
    inputs.manifestText ??
    (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  const source = getSocrataSource(parseSourceManifest(manifestText), sourceId);
  const fetchedAt = (inputs.fetchedAt ?? new Date()).toISOString();
  const rawPath =
    inputs.snapshotPath ??
    fromRepoRoot(join("data/raw/dot-traffic-volumes", `dot-traffic-volumes-${monthKey}.json`));

  const query: SocrataRowsQuery = {
    where: `yr = ${inputs.year} AND m = ${inputs.month}`,
    order: "segmentid,d,hh,mm",
  };
  const rawRows: SocrataRow[] = await SocrataClient.fromSource(source, {
    fetcher: inputs.fetcher,
    pageSize: 50_000,
  }).rows(query);
  const rows = normalizeDotTrafficVolumeRows(rawRows).map((r) => ({
    ...r,
    // Set by geocode:traffic-volumes; preserved on re-ingest via ON CONFLICT.
    physicalId: null,
    geocodeConfidence: null,
  }));

  await insertDotTrafficVolumeCounts(inputs.local.db, rows);

  await writeRawSourceSnapshot({
    path: rawPath,
    sourceId,
    extra: { isoMonth: monthKey },
    fetchedAt,
    query: { grain: "segment × 15min", month: monthKey },
    rows: rawRows,
  });

  const segments = new Set(rows.map((r) => r.segmentId));
  return { rawPath, isoMonth: monthKey, rowCount: rows.length, segmentCount: segments.size };
}

export default defineCommand({
  path: ["ingest", "dot-traffic-volumes"],
  summary: "Fetch monthly DOT traffic volume counts.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    rawPath: z.string(),
    isoMonth: z.string(),
    rowCount: z.number(),
    segmentCount: z.number(),
  }),
  async run({ ctx, input }) {
    return runDotTrafficVolumesIngest({
      local: localDbFromCtx(ctx),
      year: input.options.year,
      month: input.options.month,
    });
  },
});

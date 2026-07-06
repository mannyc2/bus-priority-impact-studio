import { join } from "node:path";
import { insertDotTrafficSpeedSnapshot } from "@bp/db/local";
import { arg, defineCommand, z } from "@bp/pipeline-v2/cli/compat";
import { normalizeDotTrafficSpeedRows } from "@bp/sources/adapters/nyc-dot/traffic-speeds";
import { getSocrataSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { fromRepoRoot } from "../../lib/paths.ts";
import {
  fetchSoda3RowsForSource,
  type SocrataFetch,
  type SocrataRow,
  type Soda3SoqlQuery,
} from "../../lib/soda3.ts";
import { writeRawSourceSnapshot } from "../../lib/source-snapshots.ts";

const sourceId = "nyc_dot_traffic_speeds";

export type DotTrafficSpeedsRunInputs = {
  local: OpenLocalPipelineDb;
  sinceHours?: number | undefined;
  maxRows?: number | undefined;
  fetchedAt?: Date | undefined;
  fetcher?: SocrataFetch | undefined;
  manifestText?: string | undefined;
  snapshotPath?: string | undefined;
};

export type DotTrafficSpeedsIngestResult = {
  rawPath: string;
  sampledAt: string;
  linkCount: number;
  rowCount: number;
};

function toSocrataTimestamp(date: Date): string {
  // Socrata floating timestamps expect "YYYY-MM-DDTHH:MM:SS" (no millis, no Z).
  return date.toISOString().slice(0, 19);
}

export async function runDotTrafficSpeedsIngest(
  inputs: DotTrafficSpeedsRunInputs,
): Promise<DotTrafficSpeedsIngestResult> {
  const manifestText =
    inputs.manifestText ??
    (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  const source = getSocrataSource(loadSourceManifestYaml(manifestText), sourceId);
  const fetchedAtDate = inputs.fetchedAt ?? new Date();
  const fetchedAt = fetchedAtDate.toISOString();
  const fetchedDayStamp = fetchedAt.slice(0, 19).replace(/[:T]/g, "-");
  const rawPath =
    inputs.snapshotPath ??
    fromRepoRoot(join("data/raw/dot-traffic-speeds", `dot-traffic-speeds-${fetchedDayStamp}.json`));

  const sinceHours = inputs.sinceHours ?? 1;
  const maxRows = inputs.maxRows ?? 10_000;
  const lowerBound = toSocrataTimestamp(new Date(fetchedAtDate.getTime() - sinceHours * 3_600_000));
  const query: Soda3SoqlQuery = {
    select:
      "link_id,data_as_of,speed,travel_time,status,owner,borough,link_name,link_points,transcom_id",
    where: `data_as_of > '${lowerBound}' AND link_id IS NOT NULL`,
    order: "data_as_of DESC",
    limit: maxRows,
  };
  const rawRows: SocrataRow[] = [
    ...(await fetchSoda3RowsForSource(source, query, {
      fetcher: inputs.fetcher,
    })),
  ];
  const allRows = normalizeDotTrafficSpeedRows(rawRows);

  // Latest snapshot only: keep the most recent sampledAt per linkId. Drop
  // older revisions in the window to avoid the multi-snapshot accumulation
  // problem on a real-time-archive dataset.
  const latestByLink = new Map<string, (typeof allRows)[number]>();
  for (const row of allRows) {
    const existing = latestByLink.get(row.linkId);
    if (existing === undefined || existing.sampledAt < row.sampledAt) {
      latestByLink.set(row.linkId, row);
    }
  }
  const rows = [...latestByLink.values()]
    .sort((a, b) => a.linkId.localeCompare(b.linkId))
    .map((r) => ({
      ...r,
      // Set by geocode:traffic-speeds; preserved on re-ingest via ON CONFLICT.
      physicalId: null,
      geocodeConfidence: null,
    }));

  const sampledAtCandidates = rows.map((r) => r.sampledAt).sort();
  const sampledAt = sampledAtCandidates.at(-1) ?? fetchedAt;

  await insertDotTrafficSpeedSnapshot(inputs.local.db, rows);

  await writeRawSourceSnapshot({
    path: rawPath,
    sourceId,
    extra: { sampledAt },
    fetchedAt,
    query: { grain: "link_id @ snapshot" },
    rows: rawRows,
  });

  const linkIds = new Set(rows.map((row) => row.linkId));
  return { rawPath, sampledAt, linkCount: linkIds.size, rowCount: rows.length };
}

export default defineCommand({
  path: ["ingest", "dot-traffic-speeds"],
  summary: "Fetch the latest DOT real-time traffic-speed snapshot.",
  input: {
    options: dbOptions.extend({
      sinceHours: arg.positiveInt().default(1).describe("Lookback window in hours"),
      maxRows: arg.positiveInt().default(10_000).describe("Max rows to fetch"),
    }),
  },
  output: z.object({
    rawPath: z.string(),
    sampledAt: z.string(),
    linkCount: z.number(),
    rowCount: z.number(),
  }),
  async run({ input }) {
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "ingest.dot-traffic-speeds",
      operation: "runDotTrafficSpeedsIngest",
      spanAttributes: {
        sinceHours: input.options.sinceHours,
        maxRows: input.options.maxRows,
      },
      run: (local) =>
        runDotTrafficSpeedsIngest({
          local,
          sinceHours: input.options.sinceHours,
          maxRows: input.options.maxRows,
        }),
    });
  },
});

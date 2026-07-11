import { Effect } from "effect";
import { insertDotTrafficSpeedSnapshot } from "@bp/db/local";
import { arg, Schema } from "@bp/pipeline-v2/cli/compat";
import { normalizeDotTrafficSpeedRows } from "@bp/sources/adapters/nyc-dot/traffic-speeds";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { defineSocrataReplaceIngest } from "../../lib/socrata-replace-ingest.ts";
import type { SocrataFetch, SocrataRow } from "../../lib/soda3.ts";
import { defineIngestCommand } from "./_define-ingest-command.ts";

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
  return date.toISOString().slice(0, 19);
}

function latestLinkRows(rawRows: readonly SocrataRow[]) {
  const latestByLink = new Map<string, ReturnType<typeof normalizeDotTrafficSpeedRows>[number]>();
  for (const row of normalizeDotTrafficSpeedRows([...rawRows])) {
    const existing = latestByLink.get(row.linkId);
    if (existing === undefined || existing.sampledAt < row.sampledAt) {
      latestByLink.set(row.linkId, row);
    }
  }
  return [...latestByLink.values()]
    .sort((left, right) => left.linkId.localeCompare(right.linkId))
    .map((row) => ({ ...row, physicalId: null, geocodeConfidence: null }));
}

export async function runDotTrafficSpeedsIngest(
  inputs: DotTrafficSpeedsRunInputs,
): Promise<DotTrafficSpeedsIngestResult> {
  const fetchedAtDate = inputs.fetchedAt ?? new Date();
  const fetchedAt = fetchedAtDate.toISOString();
  const fileStamp = fetchedAt.slice(0, 19).replace(/[:T]/g, "-");
  const sinceHours = inputs.sinceHours ?? 1;
  const maxRows = inputs.maxRows ?? 10_000;
  const lowerBound = toSocrataTimestamp(new Date(fetchedAtDate.getTime() - sinceHours * 3_600_000));
  const sampledAt = (rows: readonly { sampledAt: string }[]) =>
    rows
      .map((row) => row.sampledAt)
      .sort()
      .at(-1) ?? fetchedAt;
  const run = defineSocrataReplaceIngest({
    sourceId: "nyc_dot_traffic_speeds",
    rawDir: "data/raw/dot-traffic-speeds",
    rawFileName: `dot-traffic-speeds-${fileStamp}.json`,
    query: {
      select:
        "link_id,data_as_of,speed,travel_time,status,owner,borough,link_name,link_points,transcom_id",
      where: `data_as_of > '${lowerBound}' AND link_id IS NOT NULL`,
      order: "data_as_of DESC",
      limit: maxRows,
    },
    snapshotQuery: { grain: "link_id @ snapshot" },
    normalize: latestLinkRows,
    replaceRows: ({ local, rows }) => insertDotTrafficSpeedSnapshot(local.db, [...rows]),
    snapshotExtra: ({ rows }) => ({ sampledAt: sampledAt(rows) }),
    summarize: ({ rows }) => ({
      sampledAt: sampledAt(rows),
      linkCount: new Set(rows.map((row) => row.linkId)).size,
      rowCount: rows.length,
    }),
  });
  return run({ ...inputs, fetchedAt: fetchedAtDate });
}

export default defineIngestCommand({
  path: ["ingest", "dot-traffic-speeds"],
  summary: "Fetch the latest DOT real-time traffic-speed snapshot.",
  options: Schema.Struct({
    ...dbOptions.fields,
    ...{
      sinceHours: arg
        .positiveInt()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(1)))
        .annotate({ description: "Lookback window in hours" }),
      maxRows: arg
        .positiveInt()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(10_000)))
        .annotate({ description: "Max rows to fetch" }),
    },
  }),
  output: Schema.Struct({
    rawPath: Schema.String,
    sampledAt: Schema.String,
    linkCount: Schema.Number,
    rowCount: Schema.Number,
  }),
  operation: "runDotTrafficSpeedsIngest",
  spanAttributes: ({ sinceHours, maxRows }) => ({ sinceHours, maxRows }),
  runner: (local, { sinceHours, maxRows }) =>
    runDotTrafficSpeedsIngest({ local, sinceHours, maxRows }),
});

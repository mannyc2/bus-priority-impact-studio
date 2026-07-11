import { Effect } from "effect";
import { insertDotTrafficVolumeCounts } from "@bp/db/local";
import { arg, Schema } from "@bp/pipeline-v2/cli/compat";
import { normalizeDotTrafficVolumeRows } from "@bp/sources/adapters/nyc-dot/traffic-volume";
import { dbOptions } from "../../lib/local-db.ts";
import {
  defineSocrataMonthlyIngest,
  type SocrataMonthlyIngestInputs,
} from "../../lib/socrata-monthly-ingest.ts";
import { defineIngestCommand } from "./_define-ingest-command.ts";

export type DotTrafficVolumesRunInputs = SocrataMonthlyIngestInputs;
export type DotTrafficVolumesIngestResult = {
  rawPath: string;
  isoMonth: string;
  rowCount: number;
  segmentCount: number;
};

export const runDotTrafficVolumesIngest = defineSocrataMonthlyIngest({
  sourceId: "nyc_dot_traffic_volume_counts",
  rawDir: "data/raw/dot-traffic-volumes",
  rawFilePrefix: "dot-traffic-volumes",
  queryGrain: "segment × 15min",
  pageSize: 50_000,
  query: ({ year, month }) => ({
    where: `yr = ${year} AND m = ${month}`,
    order: "segmentid,d,hh,mm",
  }),
  normalize: ({ rawRows }) =>
    normalizeDotTrafficVolumeRows([...rawRows]).map((row) => ({
      ...row,
      physicalId: null,
      geocodeConfidence: null,
    })),
  replaceRows: ({ local, rows }) => insertDotTrafficVolumeCounts(local.db, [...rows]),
  summarize: ({ rows }) => ({ segmentCount: new Set(rows.map((row) => row.segmentId)).size }),
});

export default defineIngestCommand({
  path: ["ingest", "dot-traffic-volumes"],
  summary: "Fetch monthly DOT traffic volume counts.",
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
    },
  }),
  output: Schema.Struct({
    rawPath: Schema.String,
    isoMonth: Schema.String,
    rowCount: Schema.Number,
    segmentCount: Schema.Number,
  }),
  operation: "runDotTrafficVolumesIngest",
  spanAttributes: ({ year, month }) => ({ year, month }),
  runner: (local, { year, month }) => runDotTrafficVolumesIngest({ local, year, month }),
});

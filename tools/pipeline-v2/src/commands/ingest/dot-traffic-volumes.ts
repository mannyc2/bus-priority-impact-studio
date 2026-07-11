import { insertDotTrafficVolumeCounts } from "@bp/db/local";
import { arg, z } from "@bp/pipeline-v2/cli/compat";
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
  options: dbOptions.extend({
    year: arg.positiveInt().default(2026).describe("Calendar year"),
    month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
  }),
  output: z.object({
    rawPath: z.string(),
    isoMonth: z.string(),
    rowCount: z.number(),
    segmentCount: z.number(),
  }),
  operation: "runDotTrafficVolumesIngest",
  spanAttributes: ({ year, month }) => ({ year, month }),
  runner: (local, { year, month }) => runDotTrafficVolumesIngest({ local, year, month }),
});

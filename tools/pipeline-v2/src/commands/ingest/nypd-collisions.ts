import { upsertNypdCollisions } from "@bp/db/local";
import { arg, z } from "@bp/pipeline-v2/cli/compat";
import { normalizeNypdCollisionRows } from "@bp/sources/adapters/nyc-open-data/nypd-collisions";
import { isoMonthStart, nextIsoMonthStart } from "../../lib/dates.ts";
import { dbOptions } from "../../lib/local-db.ts";
import {
  defineSocrataMonthlyIngest,
  type SocrataMonthlyIngestInputs,
} from "../../lib/socrata-monthly-ingest.ts";
import { defineIngestCommand } from "./_define-ingest-command.ts";

export type NypdCollisionsRunInputs = SocrataMonthlyIngestInputs;
export type NypdCollisionsIngestResult = {
  rawPath: string;
  isoMonth: string;
  rowCount: number;
};

export const runNypdCollisionsIngest = defineSocrataMonthlyIngest({
  sourceId: "nypd_motor_vehicle_collisions",
  rawDir: "data/raw/nypd-collisions",
  rawFilePrefix: "nypd-collisions",
  queryGrain: "collision_id",
  query: ({ year, month }) => ({
    where: [
      `crash_date >= '${isoMonthStart(year, month)}'`,
      `crash_date < '${nextIsoMonthStart(year, month)}'`,
    ].join(" AND "),
    order: "collision_id",
  }),
  normalize: ({ rawRows }) =>
    normalizeNypdCollisionRows([...rawRows]).map((row) => ({
      ...row,
      physicalId: null,
      geocodeConfidence: null,
    })),
  replaceRows: ({ local, rows }) => upsertNypdCollisions(local.db, [...rows]),
  summarize: () => ({}),
});

export default defineIngestCommand({
  path: ["ingest", "nypd-collisions"],
  summary: "Fetch monthly NYPD motor vehicle collisions.",
  options: dbOptions.extend({
    year: arg.positiveInt().default(2026).describe("Calendar year"),
    month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
  }),
  output: z.object({ rawPath: z.string(), isoMonth: z.string(), rowCount: z.number() }),
  operation: "runNypdCollisionsIngest",
  spanAttributes: ({ year, month }) => ({ year, month }),
  runner: (local, { year, month }) => runNypdCollisionsIngest({ local, year, month }),
});

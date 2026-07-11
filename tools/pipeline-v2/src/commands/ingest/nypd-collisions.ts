import { Effect } from "effect";
import { upsertNypdCollisions } from "@bp/db/local";
import { arg, Schema } from "@bp/pipeline-v2/cli/compat";
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
  }),
  operation: "runNypdCollisionsIngest",
  spanAttributes: ({ year, month }) => ({ year, month }),
  runner: (local, { year, month }) => runNypdCollisionsIngest({ local, year, month }),
});

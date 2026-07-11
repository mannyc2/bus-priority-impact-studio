import { replaceAceRoutes } from "@bp/db/local";
import { Schema } from "@bp/pipeline-v2/cli/compat";
import { normalizeAceRouteRows } from "@bp/sources/adapters/mta/ace";
import { dbOptions } from "../../lib/local-db.ts";
import {
  defineSocrataReplaceIngest,
  type SocrataReplaceIngestInputs,
} from "../../lib/socrata-replace-ingest.ts";
import { defineIngestCommand } from "./_define-ingest-command.ts";

export type AceRoutesRunInputs = SocrataReplaceIngestInputs;

export type AceRoutesIngestResult = {
  rawPath: string;
  routeCount: number;
  aceCount: number;
  ableCount: number;
};

export const runAceRoutesIngest = defineSocrataReplaceIngest({
  sourceId: "ace_routes",
  rawDir: "data/raw/interventions",
  rawFileName: "ace-routes.json",
  query: { order: "route, implementation_date" },
  normalize: normalizeAceRouteRows,
  replaceRows: ({ local, rows }) => replaceAceRoutes(local.db, [...rows]),
  summarize: ({ rows }) => ({
    routeCount: rows.length,
    aceCount: rows.filter((row) => row.program === "ACE").length,
    ableCount: rows.filter((row) => row.program === "ABLE").length,
  }),
});

export default defineIngestCommand({
  path: ["ingest", "ace-routes"],
  summary: "Fetch ACE/ABLE route implementation rows and replace the local table.",
  options: dbOptions,
  output: Schema.Struct({
    rawPath: Schema.String,
    routeCount: Schema.Number,
    aceCount: Schema.Number,
    ableCount: Schema.Number,
  }),
  operation: "runAceRoutesIngest",
  runner: (local) => runAceRoutesIngest({ local }),
});

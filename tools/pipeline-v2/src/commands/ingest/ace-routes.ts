import { join } from "node:path";
import { defineCommand, z } from "@liche/core";
import { replaceAceRoutes } from "@bp/db/local";
import {
  getSocrataSource,
  normalizeAceRouteRows,
  parseSourceManifest,
  type SocrataFetch,
  type SocrataRow,
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

const sourceId = "ace_routes";
const query = { order: "route, implementation_date" } as const;

export type AceRoutesRunInputs = {
  local: OpenLocalPipelineDb;
  fetchedAt?: Date | undefined;
  fetcher?: SocrataFetch | undefined;
  manifestText?: string | undefined;
  snapshotPath?: string | undefined;
};

export type AceRoutesIngestResult = {
  rawPath: string;
  routeCount: number;
  aceCount: number;
  ableCount: number;
};

export async function runAceRoutesIngest(
  inputs: AceRoutesRunInputs,
): Promise<AceRoutesIngestResult> {
  const manifestText =
    inputs.manifestText ??
    (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  const source = getSocrataSource(parseSourceManifest(manifestText), sourceId);
  const fetchedAt = (inputs.fetchedAt ?? new Date()).toISOString();
  const rawPath =
    inputs.snapshotPath ?? fromRepoRoot(join("data/raw/interventions/ace-routes.json"));

  const rawRows: SocrataRow[] = await SocrataClient.fromSource(source, {
    fetcher: inputs.fetcher,
  }).rows(query);
  const normalizedRows = normalizeAceRouteRows(rawRows);

  await replaceAceRoutes(inputs.local.db, normalizedRows);

  await writeRawSourceSnapshot({
    path: rawPath,
    sourceId,
    fetchedAt,
    query,
    rows: rawRows,
  });

  return {
    rawPath,
    routeCount: normalizedRows.length,
    aceCount: normalizedRows.filter((r) => r.program === "ACE").length,
    ableCount: normalizedRows.filter((r) => r.program === "ABLE").length,
  };
}

export default defineCommand({
  path: ["ingest", "ace-routes"],
  summary: "Fetch ACE/ABLE route implementation rows and replace the local table.",
  input: { options: dbOptions },
  middleware: [withLocalDb()],
  output: z.object({
    rawPath: z.string(),
    routeCount: z.number(),
    aceCount: z.number(),
    ableCount: z.number(),
  }),
  async run({ ctx }) {
    return runAceRoutesIngest({ local: localDbFromCtx(ctx) });
  },
});

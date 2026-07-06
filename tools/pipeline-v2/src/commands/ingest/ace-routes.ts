import { join } from "node:path";
import { replaceAceRoutes } from "@bp/db/local";
import { defineCommand, z } from "@bp/pipeline-v2/cli/compat";
import { normalizeAceRouteRows } from "@bp/sources/adapters/mta/ace";
import { getSocrataSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { fromRepoRoot } from "../../lib/paths.ts";
import { fetchSoda3RowsForSource, type SocrataFetch, type SocrataRow } from "../../lib/soda3.ts";
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
  const source = getSocrataSource(loadSourceManifestYaml(manifestText), sourceId);
  const fetchedAt = (inputs.fetchedAt ?? new Date()).toISOString();
  const rawPath =
    inputs.snapshotPath ?? fromRepoRoot(join("data/raw/interventions/ace-routes.json"));

  const rawRows: SocrataRow[] = [
    ...(await fetchSoda3RowsForSource(source, query, {
      fetcher: inputs.fetcher,
    })),
  ];
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
  output: z.object({
    rawPath: z.string(),
    routeCount: z.number(),
    aceCount: z.number(),
    ableCount: z.number(),
  }),
  async run({ input }) {
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "ingest.ace-routes",
      operation: "runAceRoutesIngest",
      run: (local) => runAceRoutesIngest({ local }),
    });
  },
});

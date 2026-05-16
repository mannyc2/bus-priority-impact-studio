import { join } from "node:path";
import { replaceAceRoutes } from "@bp/db/local";
import type { SocrataFetch, SocrataRow } from "@bp/sources";
import { getSocrataSource, normalizeAceRouteRows, SocrataClient } from "@bp/sources";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { createDbContext, parseDbCliArgs } from "../../lib/route-job.js";
import { writeRawSourceSnapshot } from "../../lib/source-snapshots.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { fromRepoRoot, readSourceManifest } from "../../source-manifest.js";

const sourceId = "ace_routes";

type AceRoutesIngestArgs = {
  fetchedAt?: Date;
  fetcher?: SocrataFetch;
  dbPath?: string;
};

type AceRoutesIngestResult = {
  rawPath: string;
  routeCount: number;
  aceCount: number;
  ableCount: number;
};

async function fetchAceRouteRows(
  source: SocrataManifestSource,
  fetcher: SocrataFetch | undefined,
): Promise<SocrataRow[]> {
  return SocrataClient.fromSource(source, { fetcher }).rows({
    order: "route, implementation_date",
  });
}

export async function ingestAceRoutes(
  args: AceRoutesIngestArgs = {},
): Promise<AceRoutesIngestResult> {
  const options = createDbContext(args);
  const manifest = await readSourceManifest();
  const source = getSocrataSource(manifest, sourceId);
  const fetchedAt = (args.fetchedAt ?? new Date()).toISOString();
  const rawDir = fromRepoRoot(join("data/raw/interventions"));
  const rawPath = join(rawDir, "ace-routes.json");
  const rawRows = await fetchAceRouteRows(source, args.fetcher);
  const normalizedRows = normalizeAceRouteRows(rawRows);
  const aceCount = normalizedRows.filter((row) => row.program === "ACE").length;
  const ableCount = normalizedRows.filter((row) => row.program === "ABLE").length;
  await withLocalPipelineDb(options.dbPath, (local) => replaceAceRoutes(local.db, normalizedRows));

  await writeRawSourceSnapshot({
    path: rawPath,
    sourceId,
    fetchedAt,
    query: { order: "route, implementation_date" },
    rows: rawRows,
  });

  return {
    rawPath,
    routeCount: normalizedRows.length,
    aceCount,
    ableCount,
  };
}

function parseCliArgs(args: string[]): AceRoutesIngestArgs {
  return parseDbCliArgs(args, {} as AceRoutesIngestArgs);
}

export async function ingestAceRoutesFromCli(args: string[]): Promise<AceRoutesIngestResult> {
  return ingestAceRoutes(parseCliArgs(args));
}

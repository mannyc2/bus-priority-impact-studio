import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { replaceAceRoutes } from "@bp/db/local";
import type { SocrataFetch, SocrataRow } from "@bp/sources";
import { getSocrataSource, normalizeAceRouteRows, SocrataClient } from "@bp/sources";
import { writeJson } from "../../lib/json.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { fromRepoRoot, readSourceManifest } from "../../source-manifest.js";

const schemaVersion = 1;
const sourceId = "ace_routes";

type AceRoutesIngestArgs = {
  fetchedAt?: Date;
  fetcher?: SocrataFetch;
  dbPath?: string;
};

type AceRoutesIngestResult = {
  rawPath: string;
  summaryPath: string;
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
  const manifest = await readSourceManifest();
  const source = getSocrataSource(manifest, sourceId);
  const dbPath = args.dbPath ?? defaultLocalPipelineDbPath();
  const fetchedAt = (args.fetchedAt ?? new Date()).toISOString();
  const rawDir = fromRepoRoot(join("data/raw/interventions"));
  const workingDir = fromRepoRoot(join("data/working/interventions"));
  const rawPath = join(rawDir, "ace-routes.json");
  const summaryPath = join(workingDir, "ace-routes-summary.json");
  const rawRows = await fetchAceRouteRows(source, args.fetcher);
  const normalizedRows = normalizeAceRouteRows(rawRows);
  const aceCount = normalizedRows.filter((row) => row.program === "ACE").length;
  const ableCount = normalizedRows.filter((row) => row.program === "ABLE").length;
  const implementationDates = normalizedRows.map((row) => row.implementationDate).sort();
  const summary = {
    schemaVersion,
    sourceId,
    fetchedAt,
    rowCount: rawRows.length,
    routeCount: normalizedRows.length,
    aceCount,
    ableCount,
    earliestImplementationDate: implementationDates[0] ?? null,
    latestImplementationDate: implementationDates.at(-1) ?? null,
  };
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceAceRoutes(local.db, normalizedRows);
  } finally {
    local.sqlite.close();
  }

  await mkdir(rawDir, { recursive: true });
  await mkdir(workingDir, { recursive: true });
  await Promise.all([
    writeJson(rawPath, {
      schemaVersion,
      sourceId,
      fetchedAt,
      query: { order: "route, implementation_date" },
      rows: rawRows,
    }),
    writeJson(summaryPath, summary),
  ]);

  return {
    rawPath,
    summaryPath,
    routeCount: normalizedRows.length,
    aceCount,
    ableCount,
  };
}

function parseCliArgs(args: string[]): AceRoutesIngestArgs {
  const output: AceRoutesIngestArgs = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--db" && value !== undefined) {
      output.dbPath = fromCliPath(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg ?? ""}`);
  }

  return output;
}

export async function ingestAceRoutesFromCli(args: string[]): Promise<AceRoutesIngestResult> {
  return ingestAceRoutes(parseCliArgs(args));
}

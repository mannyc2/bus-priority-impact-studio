import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { SocrataFetch, SocrataRow } from "@bp/sources";
import { getSocrataSource, normalizeAceRouteRows, SocrataClient } from "@bp/sources";
import { writeJson } from "../../lib/json.js";
import type { SocrataManifestSource } from "../../source-manifest.js";
import { fromRepoRoot, readSourceManifest } from "../../source-manifest.js";

const schemaVersion = 1;
const sourceId = "ace_routes";

type AceRoutesIngestArgs = {
  fetchedAt?: Date;
  fetcher?: SocrataFetch;
};

type AceRoutesIngestResult = {
  rawPath: string;
  workingPath: string;
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
  const fetchedAt = (args.fetchedAt ?? new Date()).toISOString();
  const rawDir = fromRepoRoot(join("data/raw/interventions"));
  const workingDir = fromRepoRoot(join("data/working/interventions"));
  const rawPath = join(rawDir, "ace-routes.json");
  const workingPath = join(workingDir, "ace-routes.json");
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
    writeJson(workingPath, {
      schemaVersion,
      sourceId,
      fetchedAt,
      rows: normalizedRows,
    }),
    writeJson(summaryPath, summary),
  ]);

  return {
    rawPath,
    workingPath,
    summaryPath,
    routeCount: normalizedRows.length,
    aceCount,
    ableCount,
  };
}

import { mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  listRouteBriefSummaries,
  listRouteCatalog,
  listRouteObservedReliabilitySummaries,
} from "@bp/db/local";
import { writeJson } from "../../lib/json.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { defaultArtifactRootPath, fromCliPath, fromRepoRoot } from "../../lib/paths.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";

type StudioCoverageAuditArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
  artifactRoot?: string;
  output?: string;
};

type ObservedReliabilityByMonth = {
  month: string;
  runIds: string[];
  routeCount: number;
  observedRouteCount: number;
  insufficientRouteCount: number;
  sampleCount: number;
};

export type StudioCoverageAuditResult = {
  schemaVersion: 1;
  generatedAt: string;
  isoMonth: string;
  status: "pass" | "warn" | "fail";
  d1: {
    routeCatalogCount: number;
    routeBriefSummaryCount: number;
    publicRouteBriefSummaryCount: number;
    observedReliability: ObservedReliabilityByMonth[];
  };
  projection: {
    routesListCount: number;
    routeDetailCount: number;
    briefsListCount: number;
    briefDetailCount: number;
    findingsListCount: number;
    findingDetailCount: number;
  };
  gaps: {
    routesMissingFromProjection: string[];
    studioRouteCoverageShare: number;
    note: string;
  };
  outputPath: string;
};

function parseCliArgs(args: string[]): StudioCoverageAuditArgs {
  return parseMonthDbCliArgs(args, {} as StudioCoverageAuditArgs, [
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.artifactRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.output = fromCliPath(value);
        }
      },
    },
  ]);
}

async function listDirectoryEntries(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function readJsonArray(path: string, key: string): Promise<unknown[]> {
  try {
    const body = JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
    const value = body[key];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function pickField(entry: unknown, ...keys: string[]): string | null {
  if (typeof entry !== "object" || entry === null) return null;
  const record = entry as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  return null;
}

function aggregateObserved(
  rows: readonly {
    month: string;
    runId: string;
    reliabilityStatus: "observed" | "insufficient_gtfs_rt_samples";
    sampleCount: number;
  }[],
): ObservedReliabilityByMonth[] {
  const byMonth = new Map<string, ObservedReliabilityByMonth>();
  for (const row of rows) {
    const entry = byMonth.get(row.month) ?? {
      month: row.month,
      runIds: [] as string[],
      routeCount: 0,
      observedRouteCount: 0,
      insufficientRouteCount: 0,
      sampleCount: 0,
    };
    if (!entry.runIds.includes(row.runId)) {
      entry.runIds.push(row.runId);
    }
    entry.routeCount += 1;
    if (row.reliabilityStatus === "observed") {
      entry.observedRouteCount += 1;
    } else {
      entry.insufficientRouteCount += 1;
    }
    entry.sampleCount += row.sampleCount;
    byMonth.set(row.month, entry);
  }
  return [...byMonth.values()]
    .map((entry) => ({ ...entry, runIds: entry.runIds.slice().sort() }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export async function auditStudioCoverage(
  args: StudioCoverageAuditArgs = {},
): Promise<StudioCoverageAuditResult> {
  const { isoMonth } = createMonthContext(args);
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const studioRoot = join(artifactRoot, "studio", "v1");
  const outputPath =
    args.output ??
    fromRepoRoot(join("data", "artifacts", "audits", `studio-coverage-${isoMonth}.json`));

  return withLocalPipelineDb(args.dbPath, async (local) => {
    const [catalog, briefSummaries, observedRows] = await Promise.all([
      listRouteCatalog(local.db),
      listRouteBriefSummaries(local.db, isoMonth),
      listRouteObservedReliabilitySummaries(local.db, isoMonth),
    ]);
    const publicRouteIds = new Set(
      briefSummaries.filter((entry) => entry.publicVisible).map((entry) => entry.routeId),
    );

    const [routesList, briefsList, findingsList, routeDirs, briefDirs, findingDirs] =
      await Promise.all([
        readJsonArray(join(studioRoot, "routes.json"), "routes"),
        readJsonArray(join(studioRoot, "briefs.json"), "briefs"),
        readJsonArray(join(studioRoot, "findings.json"), "findings"),
        listDirectoryEntries(join(studioRoot, "routes")),
        listDirectoryEntries(join(studioRoot, "briefs")),
        listDirectoryEntries(join(studioRoot, "findings")),
      ]);

    const projectionRouteIds = new Set(
      routesList
        .map((entry) => pickField(entry, "routeId"))
        .filter((id): id is string => id !== null),
    );

    const routesMissingFromProjection = [...publicRouteIds]
      .filter((routeId) => !projectionRouteIds.has(routeId))
      .sort();
    const coveredPublicRouteCount = [...publicRouteIds].filter((routeId) =>
      projectionRouteIds.has(routeId),
    ).length;

    const studioRouteCoverageShare =
      publicRouteIds.size === 0
        ? 1
        : Number((coveredPublicRouteCount / publicRouteIds.size).toFixed(4));

    const status: StudioCoverageAuditResult["status"] =
      routesMissingFromProjection.length === 0
        ? "pass"
        : studioRouteCoverageShare < 0.5
          ? "fail"
          : "warn";

    const result: StudioCoverageAuditResult = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      isoMonth,
      status,
      d1: {
        routeCatalogCount: catalog.length,
        routeBriefSummaryCount: briefSummaries.length,
        publicRouteBriefSummaryCount: publicRouteIds.size,
        observedReliability: aggregateObserved(observedRows),
      },
      projection: {
        routesListCount: routesList.length,
        routeDetailCount: routeDirs.length,
        briefsListCount: briefsList.length,
        briefDetailCount: briefDirs.length,
        findingsListCount: findingsList.length,
        findingDetailCount: findingDirs.length,
      },
      gaps: {
        routesMissingFromProjection,
        studioRouteCoverageShare,
        note: "Studio route coverage is measured against public-visible route_brief_summary rows, not every route_catalog row. The Studio brief and finding galleries are separately curated artifact sets; their coverage is reported as counts in `projection.briefsListCount`, `projection.briefDetailCount`, `projection.findingsListCount`, and `projection.findingDetailCount`.",
      },
      outputPath,
    };

    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, result);
    return result;
  });
}

export async function auditStudioCoverageFromCli(
  args: string[],
): Promise<StudioCoverageAuditResult> {
  return auditStudioCoverage(parseCliArgs(args));
}

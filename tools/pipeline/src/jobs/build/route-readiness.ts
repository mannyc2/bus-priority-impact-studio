import { join } from "node:path";
import {
  type LocalRouteCatalogEntry,
  type LocalRouteMonthCoverage,
  type LocalRouteReadiness,
  listRouteCatalog,
  listRouteMonthCoverage,
  replaceRouteReadiness,
} from "@bp/db/local";
import { writeArtifact } from "../../lib/artifact-store.js";
import { isoMonth } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { fromRepoRoot } from "../../source-manifest.js";

const schemaVersion = 1;

type RouteReadinessArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
};

type RouteReadinessArtifactRow = LocalRouteReadiness & {
  schemaVersion: typeof schemaVersion;
};

type RouteReadinessResult = {
  isoMonth: string;
  readinessPath: string;
  summaryPath: string;
  routeCount: number;
  buildEligibleRouteCount: number;
  dbPath: string;
};

function parseBuildArgs(args: RouteReadinessArgs = {}): Required<RouteReadinessArgs> {
  return {
    year: args.year ?? 2026,
    month: args.month ?? 3,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseCliArgs(args: string[]): RouteReadinessArgs {
  const output: RouteReadinessArgs = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--year" && value !== undefined) {
      output.year = Number(value);
      index += 1;
      continue;
    }

    if (arg === "--month" && value !== undefined) {
      output.month = Number(value);
      index += 1;
      continue;
    }

    if (arg === "--db" && value !== undefined) {
      output.dbPath = fromCliPath(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg ?? ""}`);
  }

  return output;
}

function scoreReadiness(input: {
  coverage: LocalRouteMonthCoverage | undefined;
  route: LocalRouteCatalogEntry;
}): number {
  let score = 0;

  if ((input.coverage?.speedObservationCount ?? 0) > 0) {
    score += 35;
  }
  if ((input.coverage?.speedBusTripCount ?? 0) > 0) {
    score += 5;
  }
  if ((input.coverage?.scheduleTimepointCount ?? 0) > 0) {
    score += 25;
  }
  if (input.route.shapeCount > 0 && input.route.stopCount > 0) {
    score += 20;
  }
  if (input.route.timepointStopCount > 0) {
    score += 15;
  }

  return score;
}

function missingInputs(input: {
  coverage: LocalRouteMonthCoverage | undefined;
  route: LocalRouteCatalogEntry;
}): string[] {
  const missing: string[] = [];

  if ((input.coverage?.speedObservationCount ?? 0) === 0) {
    missing.push("segment_speeds");
  }
  if ((input.coverage?.speedBusTripCount ?? 0) === 0) {
    missing.push("speed_bus_trips");
  }
  if ((input.coverage?.scheduleTimepointCount ?? 0) === 0) {
    missing.push("schedules");
  }
  if (input.route.shapeCount === 0) {
    missing.push("route_shapes");
  }
  if (input.route.stopCount === 0) {
    missing.push("stops");
  }
  if (input.route.timepointStopCount === 0) {
    missing.push("timepoint_stops");
  }

  return missing;
}

function readinessStatus(missing: readonly string[]): LocalRouteReadiness["readinessStatus"] {
  if (missing.length === 0) {
    return "ready";
  }
  if (missing.includes("route_shapes") || missing.includes("stops")) {
    return "missing_geometry";
  }
  if (missing.includes("segment_speeds") || missing.includes("speed_bus_trips")) {
    return "missing_speed";
  }
  if (missing.includes("schedules")) {
    return "missing_schedule";
  }

  return "partial";
}

function isBuildEligible(missing: readonly string[]): boolean {
  void missing;
  return true;
}

function buildReadinessRows(
  catalog: readonly LocalRouteCatalogEntry[],
  coverage: readonly LocalRouteMonthCoverage[],
  month: string,
): RouteReadinessArtifactRow[] {
  const coverageByRoute = new Map(coverage.map((row) => [row.routeId, row]));

  return catalog
    .map((route) => {
      const routeCoverage = coverageByRoute.get(route.routeId);
      const missing = missingInputs({ coverage: routeCoverage, route });
      const status = readinessStatus(missing);

      return {
        schemaVersion,
        routeId: route.routeId,
        routeShortName: route.routeShortName,
        routeLongName: route.routeLongName,
        isoMonth: month,
        readinessStatus: status,
        buildEligible: isBuildEligible(missing),
        readinessScore: scoreReadiness({ coverage: routeCoverage, route }),
        missingInputs: missing,
        speedObservationCount: routeCoverage?.speedObservationCount ?? 0,
        speedBusTripCount: routeCoverage?.speedBusTripCount ?? 0,
        averageSpeedMph: routeCoverage?.averageSpeedMph ?? null,
        scheduleTimepointCount: routeCoverage?.scheduleTimepointCount ?? 0,
        shapeCount: route.shapeCount,
        stopCount: route.stopCount,
        timepointStopCount: route.timepointStopCount,
      } satisfies RouteReadinessArtifactRow;
    })
    .sort((left, right) => {
      if (left.buildEligible !== right.buildEligible) {
        return left.buildEligible ? -1 : 1;
      }
      if (statusPriority(left.readinessStatus) !== statusPriority(right.readinessStatus)) {
        return statusPriority(left.readinessStatus) - statusPriority(right.readinessStatus);
      }
      if (left.readinessScore !== right.readinessScore) {
        return right.readinessScore - left.readinessScore;
      }
      if (left.averageSpeedMph !== null && right.averageSpeedMph !== null) {
        return left.averageSpeedMph - right.averageSpeedMph;
      }

      return left.routeId.localeCompare(right.routeId);
    });
}

function statusPriority(status: LocalRouteReadiness["readinessStatus"]): number {
  switch (status) {
    case "ready":
      return 0;
    case "partial":
      return 1;
    case "missing_schedule":
      return 2;
    case "missing_speed":
      return 3;
    case "missing_geometry":
      return 4;
  }
}

function summarizeStatusCounts(
  rows: readonly RouteReadinessArtifactRow[],
): Record<LocalRouteReadiness["readinessStatus"], number> {
  return {
    ready: rows.filter((row) => row.readinessStatus === "ready").length,
    partial: rows.filter((row) => row.readinessStatus === "partial").length,
    missing_geometry: rows.filter((row) => row.readinessStatus === "missing_geometry").length,
    missing_schedule: rows.filter((row) => row.readinessStatus === "missing_schedule").length,
    missing_speed: rows.filter((row) => row.readinessStatus === "missing_speed").length,
  };
}

export async function buildRouteReadiness(
  args: RouteReadinessArgs = {},
): Promise<RouteReadinessResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const batchDir = fromRepoRoot(join("data/artifacts/route-batches", month));
  const readinessPath = join(batchDir, "route-readiness.json");
  const summaryPath = join(batchDir, "route-readiness-summary.json");
  const local = await openLocalPipelineDb(options.dbPath);

  try {
    const [catalog, coverage] = await Promise.all([
      listRouteCatalog(local.db),
      listRouteMonthCoverage(local.db, month),
    ]);
    const rows = buildReadinessRows(catalog, coverage, month);
    const buildEligibleRoutes = rows.filter((row) => row.buildEligible);
    const summary = {
      schemaVersion,
      analysisPeriod: month,
      generatedAt: new Date().toISOString(),
      routeCount: rows.length,
      buildEligibleRouteCount: buildEligibleRoutes.length,
      statusCounts: summarizeStatusCounts(rows),
      topBuildCandidates: buildEligibleRoutes.slice(0, 20).map((row) => ({
        routeId: row.routeId,
        averageSpeedMph: row.averageSpeedMph,
        speedObservationCount: row.speedObservationCount,
        scheduleTimepointCount: row.scheduleTimepointCount,
        readinessScore: row.readinessScore,
      })),
      caveats: [
        "Route readiness is a batch-planning gate, not a public performance score.",
        "Build eligibility now reflects whether the route can move through artifact generation, not whether every upstream source is complete.",
        "Missing speed, schedule, or geometry coverage is surfaced as a readiness gap and should be treated as a data-quality limitation on the resulting artifacts.",
        "All-route ridership remains route-slice scoped until a reliable all-route ridership aggregate is added.",
      ],
    };

    await replaceRouteReadiness(local.db, month, rows);
    await Promise.all([
      writeArtifact(batchDir, readinessPath, {
        schemaVersion,
        analysisPeriod: month,
        generatedAt: summary.generatedAt,
        rows,
      }),
      writeArtifact(batchDir, summaryPath, summary),
    ]);

    return {
      isoMonth: month,
      readinessPath,
      summaryPath,
      routeCount: rows.length,
      buildEligibleRouteCount: buildEligibleRoutes.length,
      dbPath: local.path,
    };
  } finally {
    local.sqlite.close();
  }
}

export async function buildRouteReadinessFromCli(args: string[]): Promise<RouteReadinessResult> {
  return buildRouteReadiness(parseCliArgs(args));
}

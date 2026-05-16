import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  getPersistedRouteBatchProgress,
  listBuildEligibleRouteIds,
  replaceRouteBatch,
} from "@bp/db/local";
import { falseOption, numberOption } from "../../lib/cli-args.js";
import { writeJson } from "../../lib/json.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";
import { fromRepoRoot } from "../../source-manifest.js";
import type { RouteBuildPlanResult } from "./route-build-plan.js";
import {
  defaultRoutePostBuildDeps,
  type RoutePostBuildDeps,
  type RoutePostBuildResult,
  runRoutePostBuild,
} from "./route-post-build.js";
import { buildRouteReadiness, type RouteReadinessResult } from "./route-readiness.js";
import {
  defaultRouteSharedRefreshDeps,
  type RouteSharedRefreshDeps,
  refreshRouteSharedSources,
} from "./route-shared-refresh.js";
import { buildRouteSliceArtifacts, type RouteBuildResult } from "./route-slice-pipeline.js";

type RouteNetworkBuildArgs = {
  year?: number;
  month?: number;
  limit?: number;
  refreshSharedSources?: boolean;
  refreshPlan?: boolean;
  exportD1?: boolean;
  resume?: boolean;
  dbPath?: string;
};

type RouteNetworkBuildFailure = {
  routeId: string;
  error: string;
};

type RouteNetworkBuildSummary = {
  status: "running" | "completed";
  isoMonth: string;
  generatedAt: string;
  requestedRouteCount: number;
  skippedBuiltRouteCount: number;
  attemptedRouteCount: number;
  builtRouteCount: number;
  failedRouteCount: number;
  remainingRouteCount: number;
  resumedRouteIds: string[];
  builtRouteIds: string[];
  failedRoutes: RouteNetworkBuildFailure[];
  readiness: RouteReadinessResult;
  plan: RouteBuildPlanResult;
  d1SeedPath: string | null;
  refreshedPlanDbPath: string | null;
};

export type RouteNetworkBuildResult = RouteNetworkBuildSummary & {
  reportPath: string;
  routes: RouteBuildResult[];
};

type RouteNetworkBuildOptions = Required<RouteNetworkBuildArgs> & {
  isoMonth: string;
};

type RouteNetworkBuildDeps = {
  buildRouteReadiness: typeof buildRouteReadiness;
  listBuildEligibleRoutes: typeof listBuildEligibleRoutes;
  listPersistedProgress: typeof listPersistedProgress;
  buildRouteSliceArtifacts: typeof buildRouteSliceArtifacts;
  runRoutePostBuild: typeof runRoutePostBuild;
  persistBatchProgress: typeof persistBatchProgress;
  writeReport: typeof writeNetworkBuildReport;
} & RouteSharedRefreshDeps &
  RoutePostBuildDeps;

const defaultRouteNetworkBuildDeps: RouteNetworkBuildDeps = {
  buildRouteReadiness,
  listBuildEligibleRoutes,
  listPersistedProgress,
  buildRouteSliceArtifacts,
  runRoutePostBuild,
  persistBatchProgress,
  writeReport: writeNetworkBuildReport,
  ...defaultRoutePostBuildDeps,
  ...defaultRouteSharedRefreshDeps,
};

function parseNetworkBuildArgs(args: RouteNetworkBuildArgs = {}): RouteNetworkBuildOptions {
  return {
    ...createMonthContext(args),
    limit: args.limit ?? Number.POSITIVE_INFINITY,
    refreshSharedSources: args.refreshSharedSources ?? true,
    refreshPlan: args.refreshPlan ?? true,
    exportD1: args.exportD1 ?? true,
    resume: args.resume ?? true,
  };
}

function parseNetworkBuildCliArgs(args: string[]): RouteNetworkBuildArgs {
  return parseMonthDbCliArgs(args, {} as RouteNetworkBuildArgs, [
    numberOption(["--limit"], (output, value) => {
      output.limit = value;
    }),
    falseOption(["--no-refresh-shared"], (output) => {
      output.refreshSharedSources = false;
    }),
    falseOption(["--no-refresh-plan"], (output) => {
      output.refreshPlan = false;
    }),
    falseOption(["--no-d1-export"], (output) => {
      output.exportD1 = false;
    }),
    falseOption(["--no-resume"], (output) => {
      output.resume = false;
    }),
  ]);
}

async function listBuildEligibleRoutes(args: {
  dbPath: string;
  isoMonth: string;
  limit: number;
}): Promise<string[]> {
  return withLocalPipelineDb(args.dbPath, async (local) => {
    return listBuildEligibleRouteIds(local.db, args.isoMonth, args.limit);
  });
}

async function listPersistedProgress(args: { dbPath: string; isoMonth: string }): Promise<{
  status: "running" | "pass" | "fail" | null;
  builtRouteIds: string[];
  failedRoutes: RouteNetworkBuildFailure[];
}> {
  return withLocalPipelineDb(args.dbPath, async (local) => {
    const progress = await getPersistedRouteBatchProgress(local.db, args.isoMonth);

    return {
      status: progress.status?.status ?? null,
      builtRouteIds: progress.builtRoutes
        .filter((row) => row.status === "built")
        .map((row) => row.routeId),
      failedRoutes: progress.issues
        .filter((row): row is typeof row & { routeId: string } => row.routeId !== null)
        .map((row) => ({
          routeId: row.routeId,
          error: row.message,
        })),
    };
  });
}

async function persistBatchProgress(args: {
  dbPath: string;
  isoMonth: string;
  status: "running" | "pass" | "fail";
  builtRouteIds: string[];
  failedRoutes: RouteNetworkBuildFailure[];
}): Promise<void> {
  return withLocalPipelineDb(args.dbPath, async (local) => {
    await replaceRouteBatch(local.db, {
      status: {
        month: args.isoMonth,
        generatedAt: new Date().toISOString(),
        status: args.status,
        routeCount: args.builtRouteIds.length + args.failedRoutes.length,
        artifactCount: 0,
        missingArtifactCount: 0,
        hashMismatchCount: 0,
        byteLengthMismatchCount: 0,
        totalByteLength: 0,
        issueCount: args.failedRoutes.length,
      },
      builtRoutes: args.builtRouteIds.map((routeId, index) => ({
        month: args.isoMonth,
        routeRank: index + 1,
        routeId,
        artifactCount: null,
        status: "built",
      })),
      issues: args.failedRoutes.map((failure, index) => ({
        month: args.isoMonth,
        issueRank: index + 1,
        routeId: failure.routeId,
        severity: "error",
        issueCode: "route_build_failed",
        message: failure.error,
      })),
    });
  });
}

function reportPath(isoMonth: string): string {
  return fromRepoRoot(join("data/artifacts/network-builds", isoMonth, "summary.json"));
}

async function writeNetworkBuildReport(summary: RouteNetworkBuildSummary): Promise<string> {
  const path = reportPath(summary.isoMonth);
  await mkdir(dirname(path), { recursive: true });
  await writeJson(path, summary);

  return path;
}

function failureMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function buildRouteNetwork(
  args: RouteNetworkBuildArgs = {},
  deps: RouteNetworkBuildDeps = defaultRouteNetworkBuildDeps,
): Promise<RouteNetworkBuildResult> {
  const options = parseNetworkBuildArgs(args);
  const readiness = await deps.buildRouteReadiness(options);
  const planArgs = Number.isFinite(options.limit)
    ? {
        year: options.year,
        month: options.month,
        dbPath: options.dbPath,
        limit: options.limit,
      }
    : {
        year: options.year,
        month: options.month,
        dbPath: options.dbPath,
      };
  const plan = await deps.buildRouteBuildPlan(planArgs);
  const routeIds = await deps.listBuildEligibleRoutes({
    dbPath: options.dbPath,
    isoMonth: options.isoMonth,
    limit: options.limit,
  });
  const persistedProgress = options.resume
    ? await deps.listPersistedProgress({
        dbPath: options.dbPath,
        isoMonth: options.isoMonth,
      })
    : { status: null, builtRouteIds: [], failedRoutes: [] };
  const resumedRouteIds = options.resume ? persistedProgress.builtRouteIds : [];
  const resumedRouteIdSet = new Set(resumedRouteIds);
  const resumedFailureMap = new Map(
    (options.resume ? persistedProgress.failedRoutes : []).map((failure) => [
      failure.routeId,
      failure,
    ]),
  );
  const routeIdsToBuild = routeIds.filter((routeId) => !resumedRouteIdSet.has(routeId));
  const writeProgress = async (input: {
    status: RouteNetworkBuildSummary["status"];
    routes: RouteBuildResult[];
    failedRoutes: RouteNetworkBuildFailure[];
    d1SeedPath: string | null;
    refreshedPlanDbPath: string | null;
  }): Promise<string> => {
    const summary: RouteNetworkBuildSummary = {
      status: input.status,
      isoMonth: options.isoMonth,
      generatedAt: new Date().toISOString(),
      requestedRouteCount: routeIds.length,
      skippedBuiltRouteCount: resumedRouteIds.length,
      attemptedRouteCount: input.routes.length + input.failedRoutes.length,
      builtRouteCount: input.routes.length,
      failedRouteCount: input.failedRoutes.length,
      remainingRouteCount:
        routeIdsToBuild.length - (input.routes.length + input.failedRoutes.length),
      resumedRouteIds,
      builtRouteIds: [...resumedRouteIds, ...input.routes.map((route) => route.routeId)],
      failedRoutes: input.failedRoutes,
      readiness,
      plan,
      d1SeedPath: input.d1SeedPath,
      refreshedPlanDbPath: input.refreshedPlanDbPath,
    };

    return deps.writeReport(summary);
  };

  const routes: RouteBuildResult[] = [];
  const failedRoutes: RouteNetworkBuildFailure[] = [...resumedFailureMap.values()];
  let report = await writeProgress({
    status: "running",
    routes,
    failedRoutes,
    d1SeedPath: null,
    refreshedPlanDbPath: null,
  });
  await deps.persistBatchProgress({
    dbPath: options.dbPath,
    isoMonth: options.isoMonth,
    status: "running",
    builtRouteIds: resumedRouteIds,
    failedRoutes,
  });

  if (routeIdsToBuild.length > 0) {
    await refreshRouteSharedSources(options, deps);
  }

  for (const routeId of routeIdsToBuild) {
    if (resumedFailureMap.has(routeId)) {
      report = await writeProgress({
        status: "running",
        routes,
        failedRoutes,
        d1SeedPath: null,
        refreshedPlanDbPath: null,
      });
      continue;
    }
    try {
      routes.push(
        await deps.buildRouteSliceArtifacts({
          routeId,
          year: options.year,
          month: options.month,
          dbPath: options.dbPath,
        }),
      );
    } catch (error) {
      failedRoutes.push({
        routeId,
        error: failureMessage(error),
      });
    }
    report = await writeProgress({
      status: "running",
      routes,
      failedRoutes,
      d1SeedPath: null,
      refreshedPlanDbPath: null,
    });
    await deps.persistBatchProgress({
      dbPath: options.dbPath,
      isoMonth: options.isoMonth,
      status: "running",
      builtRouteIds: [...resumedRouteIds, ...routes.map((route) => route.routeId)],
      failedRoutes,
    });
  }

  let postBuild: RoutePostBuildResult = {
    d1SeedPath: null,
    refreshedPlanDbPath: null,
  };

  if (routes.length > 0 || resumedRouteIds.length > 0) {
    postBuild = await deps.runRoutePostBuild(
      {
        year: options.year,
        month: options.month,
        dbPath: options.dbPath,
        routeCount: routes.length + resumedRouteIds.length,
        refreshPlan: options.refreshPlan,
        exportD1: options.exportD1,
      },
      deps,
    );
  }

  report = await writeProgress({
    status: "completed",
    routes,
    failedRoutes,
    d1SeedPath: postBuild.d1SeedPath,
    refreshedPlanDbPath: postBuild.refreshedPlanDbPath,
  });
  await deps.persistBatchProgress({
    dbPath: options.dbPath,
    isoMonth: options.isoMonth,
    status: failedRoutes.length === 0 ? "pass" : "fail",
    builtRouteIds: [...resumedRouteIds, ...routes.map((route) => route.routeId)],
    failedRoutes,
  });

  return {
    status: "completed",
    isoMonth: options.isoMonth,
    generatedAt: new Date().toISOString(),
    requestedRouteCount: routeIds.length,
    skippedBuiltRouteCount: resumedRouteIds.length,
    attemptedRouteCount: routes.length + failedRoutes.length,
    builtRouteCount: routes.length,
    failedRouteCount: failedRoutes.length,
    remainingRouteCount: 0,
    resumedRouteIds,
    builtRouteIds: [...resumedRouteIds, ...routes.map((route) => route.routeId)],
    failedRoutes,
    readiness,
    plan,
    d1SeedPath: postBuild.d1SeedPath,
    refreshedPlanDbPath: postBuild.refreshedPlanDbPath,
    reportPath: report,
    routes,
  };
}

export async function buildRouteNetworkFromCli(args: string[]): Promise<RouteNetworkBuildResult> {
  return buildRouteNetwork(parseNetworkBuildCliArgs(args));
}

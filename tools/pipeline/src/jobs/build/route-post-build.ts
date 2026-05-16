import { exportD1Seed } from "../export/export-d1.js";
import { buildRouteBatchAudit } from "./route-batch-audit.js";
import { buildRouteBuildPlan } from "./route-build-plan.js";
import { buildRouteComparison } from "./route-comparison.js";
import { buildRouteReliabilityBaseline } from "./route-reliability-baseline.js";

export type RoutePostBuildArgs = {
  year: number;
  month: number;
  dbPath: string;
  routeCount: number;
  refreshPlan: boolean;
  exportD1: boolean;
};

export type RoutePostBuildResult = {
  d1SeedPath: string | null;
  refreshedPlanDbPath: string | null;
};

export type RoutePostBuildDeps = {
  buildRouteBatchAudit: typeof buildRouteBatchAudit;
  buildRouteBuildPlan: typeof buildRouteBuildPlan;
  buildRouteComparison: typeof buildRouteComparison;
  buildRouteReliabilityBaseline: typeof buildRouteReliabilityBaseline;
  exportD1Seed: typeof exportD1Seed;
};

export const defaultRoutePostBuildDeps: RoutePostBuildDeps = {
  buildRouteBatchAudit,
  buildRouteBuildPlan,
  buildRouteComparison,
  buildRouteReliabilityBaseline,
  exportD1Seed,
};

function monthBuildArgs(
  args: Pick<RoutePostBuildArgs, "year" | "month" | "dbPath">,
): Pick<RoutePostBuildArgs, "year" | "month" | "dbPath"> {
  return {
    year: args.year,
    month: args.month,
    dbPath: args.dbPath,
  };
}

export async function runRoutePostBuild(
  args: RoutePostBuildArgs,
  deps: RoutePostBuildDeps = defaultRoutePostBuildDeps,
): Promise<RoutePostBuildResult> {
  const buildArgs = monthBuildArgs(args);
  const [refreshedPlan] = await Promise.all([
    args.refreshPlan
      ? deps.buildRouteBuildPlan({
          ...buildArgs,
          limit: 20,
        })
      : Promise.resolve(null),
    deps.buildRouteComparison({
      ...buildArgs,
      limit: args.routeCount,
    }),
    deps.buildRouteReliabilityBaseline(buildArgs),
    deps.buildRouteBatchAudit(buildArgs),
  ]);

  if (!args.exportD1) {
    return { d1SeedPath: null, refreshedPlanDbPath: refreshedPlan?.dbPath ?? null };
  }

  const d1Export = await deps.exportD1Seed({
    ...buildArgs,
    runAudit: false,
  });

  return {
    d1SeedPath: d1Export.seedPath,
    refreshedPlanDbPath: refreshedPlan?.dbPath ?? null,
  };
}

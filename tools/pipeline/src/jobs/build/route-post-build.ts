import { exportD1Seed } from "../export/export-d1.js";
import { buildBriefArtifacts } from "./brief-artifacts.js";
import { buildCorridorModel } from "./corridor-model.js";
import { buildCorridorShapeReview } from "./corridor-shape-review.js";
import { buildRouteBatchAudit } from "./route-batch-audit.js";
import { buildRouteBuildPlan } from "./route-build-plan.js";
import { buildRouteComparison } from "./route-comparison.js";
import { buildRouteInterventionEvaluation } from "./route-intervention-evaluation.js";
import { buildRouteReliabilityBaseline } from "./route-reliability-baseline.js";

export type RoutePostBuildArgs = {
  year: number;
  month: number;
  dbPath: string;
  routeCount: number;
  refreshPlan: boolean;
  exportD1: boolean;
  artifactRoot?: string;
  exportRoot?: string;
};

export type RoutePostBuildResult = {
  d1SeedPath: string | null;
  refreshedPlanDbPath: string | null;
};

export type RoutePostBuildDeps = {
  buildRouteBatchAudit: typeof buildRouteBatchAudit;
  buildBriefArtifacts: typeof buildBriefArtifacts;
  buildCorridorModel: typeof buildCorridorModel;
  buildCorridorShapeReview: typeof buildCorridorShapeReview;
  buildRouteBuildPlan: typeof buildRouteBuildPlan;
  buildRouteComparison: typeof buildRouteComparison;
  buildRouteInterventionEvaluation: typeof buildRouteInterventionEvaluation;
  buildRouteReliabilityBaseline: typeof buildRouteReliabilityBaseline;
  exportD1Seed: typeof exportD1Seed;
};

export const defaultRoutePostBuildDeps: RoutePostBuildDeps = {
  buildBriefArtifacts,
  buildCorridorModel,
  buildCorridorShapeReview,
  buildRouteBatchAudit,
  buildRouteBuildPlan,
  buildRouteComparison,
  buildRouteInterventionEvaluation,
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
  const artifactArgs =
    args.artifactRoot === undefined ? buildArgs : { ...buildArgs, artifactRoot: args.artifactRoot };
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
    deps.buildRouteInterventionEvaluation(buildArgs),
    deps.buildRouteReliabilityBaseline(buildArgs),
  ]);
  await deps.buildCorridorModel(buildArgs);
  await deps.buildCorridorShapeReview(artifactArgs);
  await deps.buildBriefArtifacts(artifactArgs);
  await deps.buildRouteBatchAudit(artifactArgs);

  if (!args.exportD1) {
    return { d1SeedPath: null, refreshedPlanDbPath: refreshedPlan?.dbPath ?? null };
  }

  const d1Export = await deps.exportD1Seed({
    ...buildArgs,
    ...(args.artifactRoot === undefined ? {} : { artifactRoot: args.artifactRoot }),
    ...(args.exportRoot === undefined ? {} : { exportRoot: args.exportRoot }),
    runAudit: false,
  });

  return {
    d1SeedPath: d1Export.seedPath,
    refreshedPlanDbPath: refreshedPlan?.dbPath ?? null,
  };
}

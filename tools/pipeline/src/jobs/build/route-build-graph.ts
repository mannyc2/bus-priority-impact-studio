import { listSelectedRouteBuildCandidates } from "@bp/db/local";
import { RouteIdCodec } from "@bp/domain";
import * as z from "zod";
import { falseOption, numberOption, stringListOption, trueOption } from "../../lib/cli-args.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";
import {
  defaultRoutePostBuildDeps,
  type RoutePostBuildDeps,
  runRoutePostBuild,
} from "./route-post-build.js";
import {
  defaultRouteSharedRefreshDeps,
  type RouteSharedRefreshDeps,
  refreshRouteSharedSources,
} from "./route-shared-refresh.js";
import { buildRouteSliceArtifacts, type RouteBuildResult } from "./route-slice-pipeline.js";

export type RouteBuildGraphArgs = {
  year: number;
  month: number;
  isoMonth: string;
  routes: string[];
  hotspotLimit: number;
  topSegmentLimit: number;
  refreshSharedSources: boolean;
  refreshPlan: boolean;
  exportD1: boolean;
  dbPath: string;
};

export type RouteBuildGraphResult = {
  isoMonth: string;
  builtRouteIds: string[];
  builtRouteCount: number;
  totalBatchRouteCount: number;
  d1SeedPath: string | null;
  refreshedPlanDbPath: string | null;
  routes: RouteBuildResult[];
};

type RouteBuildGraphCliArgs = {
  routes?: string[];
  routeSelection?: "explicit" | "planned";
  limit?: number;
  year?: number;
  month?: number;
  hotspotLimit?: number;
  topSegmentLimit?: number;
  refreshSharedSources?: boolean;
  refreshPlan?: boolean;
  exportD1?: boolean;
  dbPath?: string;
};

export type RouteBuildGraphDeps = {
  buildRouteSliceArtifacts: typeof buildRouteSliceArtifacts;
  listSelectedPlanRoutes: typeof listSelectedPlanRoutes;
} & RoutePostBuildDeps &
  RouteSharedRefreshDeps;

export const defaultRouteBuildGraphDeps: RouteBuildGraphDeps = {
  buildRouteSliceArtifacts,
  listSelectedPlanRoutes,
  ...defaultRoutePostBuildDeps,
  ...defaultRouteSharedRefreshDeps,
};

function parseGraphCliArgs(args: string[]): RouteBuildGraphCliArgs {
  return parseMonthDbCliArgs(args, {} as RouteBuildGraphCliArgs, [
    stringListOption(["--route", "--routes"], (output, value) => {
      output.routes = value;
    }),
    trueOption(["--planned"], (output) => {
      output.routeSelection = "planned";
    }),
    numberOption(["--limit"], (output, value) => {
      output.limit = value;
    }),
    numberOption(["--hotspot-limit"], (output, value) => {
      output.hotspotLimit = value;
    }),
    numberOption(["--top-segments"], (output, value) => {
      output.topSegmentLimit = value;
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
  ]);
}

async function listSelectedPlanRoutes(args: {
  dbPath: string;
  isoMonth: string;
  limit: number;
}): Promise<string[]> {
  return withLocalPipelineDb(args.dbPath, async (local) => {
    return (await listSelectedRouteBuildCandidates(local.db, args.isoMonth, args.limit)).map(
      (row) => z.decode(RouteIdCodec, row.routeId),
    );
  });
}

async function resolveGraphArgs(
  args: RouteBuildGraphCliArgs = {},
  deps: Pick<RouteBuildGraphDeps, "listSelectedPlanRoutes"> = defaultRouteBuildGraphDeps,
): Promise<RouteBuildGraphArgs> {
  const options = createMonthContext(args);
  const routeSelection = args.routeSelection ?? "explicit";
  const explicitRoutes = args.routes?.map((route) => z.decode(RouteIdCodec, route)) ?? [];
  if (routeSelection === "explicit" && explicitRoutes.length === 0) {
    throw new Error("Missing required argument: --route or --routes");
  }

  const routes =
    routeSelection === "planned"
      ? await deps.listSelectedPlanRoutes({
          dbPath: options.dbPath,
          isoMonth: options.isoMonth,
          limit: args.limit ?? Number.POSITIVE_INFINITY,
        })
      : explicitRoutes;

  return {
    year: options.year,
    month: options.month,
    isoMonth: options.isoMonth,
    routes,
    hotspotLimit: args.hotspotLimit ?? 10,
    topSegmentLimit: args.topSegmentLimit ?? 5,
    refreshSharedSources: args.refreshSharedSources ?? true,
    refreshPlan: args.refreshPlan ?? routeSelection === "planned",
    exportD1: args.exportD1 ?? true,
    dbPath: options.dbPath,
  };
}

export async function buildAllRoutesGraph(
  args: RouteBuildGraphArgs,
  deps: RouteBuildGraphDeps = defaultRouteBuildGraphDeps,
): Promise<RouteBuildGraphResult> {
  await refreshRouteSharedSources(args, deps);

  const routes: RouteBuildResult[] = [];
  for (const routeId of args.routes) {
    routes.push(
      await deps.buildRouteSliceArtifacts({
        routeId,
        year: args.year,
        month: args.month,
        hotspotLimit: args.hotspotLimit,
        topSegmentLimit: args.topSegmentLimit,
        dbPath: args.dbPath,
      }),
    );
  }

  const finalized = await runRoutePostBuild(
    {
      year: args.year,
      month: args.month,
      dbPath: args.dbPath,
      routeCount: routes.length,
      refreshPlan: args.refreshPlan,
      exportD1: args.exportD1,
    },
    deps,
  );

  return {
    isoMonth: args.isoMonth,
    builtRouteIds: routes.map((route) => route.routeId),
    builtRouteCount: routes.length,
    totalBatchRouteCount: routes.length,
    d1SeedPath: finalized.d1SeedPath,
    refreshedPlanDbPath: finalized.refreshedPlanDbPath,
    routes,
  };
}

export async function buildAllRoutesGraphFromCli(
  args: string[],
  deps: RouteBuildGraphDeps = defaultRouteBuildGraphDeps,
): Promise<RouteBuildGraphResult> {
  return buildAllRoutesGraph(await resolveGraphArgs(parseGraphCliArgs(args), deps), deps);
}

import { arg, defineCommand, z } from "@liche/core";
import {
  type LocalRouteCatalogEntry,
  type LocalRouteMonthCoverage,
  type LocalRouteReadiness,
  listRouteCatalog,
  listRouteMonthCoverage,
  replaceRouteReadiness,
} from "@bp/db/local";
import { isoMonth } from "../../lib/dates.ts";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";

export type RouteReadinessResult = {
  isoMonth: string;
  routeCount: number;
  buildEligibleRouteCount: number;
  dbPath: string;
};

function scoreReadiness(input: {
  coverage: LocalRouteMonthCoverage | undefined;
  route: LocalRouteCatalogEntry;
}): number {
  let score = 0;
  if ((input.coverage?.speedObservationCount ?? 0) > 0) score += 35;
  if ((input.coverage?.speedBusTripCount ?? 0) > 0) score += 5;
  if ((input.coverage?.scheduleTimepointCount ?? 0) > 0) score += 25;
  if (input.route.shapeCount > 0 && input.route.stopCount > 0) score += 20;
  if (input.route.timepointStopCount > 0) score += 15;
  return score;
}

function missingInputs(input: {
  coverage: LocalRouteMonthCoverage | undefined;
  route: LocalRouteCatalogEntry;
}): string[] {
  const missing: string[] = [];
  if ((input.coverage?.speedObservationCount ?? 0) === 0) missing.push("segment_speeds");
  if ((input.coverage?.speedBusTripCount ?? 0) === 0) missing.push("speed_bus_trips");
  if ((input.coverage?.scheduleTimepointCount ?? 0) === 0) missing.push("schedules");
  if (input.route.shapeCount === 0) missing.push("route_shapes");
  if (input.route.stopCount === 0) missing.push("stops");
  if (input.route.timepointStopCount === 0) missing.push("timepoint_stops");
  return missing;
}

function readinessStatus(missing: readonly string[]): LocalRouteReadiness["readinessStatus"] {
  if (missing.length === 0) return "ready";
  if (missing.includes("route_shapes") || missing.includes("stops")) return "missing_geometry";
  if (missing.includes("segment_speeds") || missing.includes("speed_bus_trips"))
    return "missing_speed";
  if (missing.includes("schedules")) return "missing_schedule";
  return "partial";
}

function isBuildEligible(_missing: readonly string[]): boolean {
  return true;
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

function buildReadinessRows(
  catalog: readonly LocalRouteCatalogEntry[],
  coverage: readonly LocalRouteMonthCoverage[],
  month: string,
): LocalRouteReadiness[] {
  const coverageByRoute = new Map(coverage.map((row) => [row.routeId, row]));
  return catalog
    .map((route) => {
      const routeCoverage = coverageByRoute.get(route.routeId);
      const missing = missingInputs({ coverage: routeCoverage, route });
      const status = readinessStatus(missing);
      return {
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
      } satisfies LocalRouteReadiness;
    })
    .sort((left, right) => {
      if (left.buildEligible !== right.buildEligible) return left.buildEligible ? -1 : 1;
      if (statusPriority(left.readinessStatus) !== statusPriority(right.readinessStatus))
        return statusPriority(left.readinessStatus) - statusPriority(right.readinessStatus);
      if (left.readinessScore !== right.readinessScore)
        return right.readinessScore - left.readinessScore;
      if (left.averageSpeedMph !== null && right.averageSpeedMph !== null)
        return left.averageSpeedMph - right.averageSpeedMph;
      return left.routeId.localeCompare(right.routeId);
    });
}

export async function runRouteReadiness(inputs: {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
}): Promise<RouteReadinessResult> {
  const month = isoMonth(inputs.year, inputs.month);
  const [catalog, coverage] = await Promise.all([
    listRouteCatalog(inputs.local.db),
    listRouteMonthCoverage(inputs.local.db, month),
  ]);
  const rows = buildReadinessRows(catalog, coverage, month);
  const buildEligibleRoutes = rows.filter((row) => row.buildEligible);
  await replaceRouteReadiness(inputs.local.db, month, rows);
  return {
    isoMonth: month,
    routeCount: rows.length,
    buildEligibleRouteCount: buildEligibleRoutes.length,
    dbPath: inputs.local.path,
  };
}

export default defineCommand({
  path: ["route", "readiness"],
  summary: "Compute build readiness scores per route for a given month.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    isoMonth: z.string(),
    routeCount: z.number(),
    buildEligibleRouteCount: z.number(),
    dbPath: z.string(),
  }),
  async run({ ctx, input }) {
    return runRouteReadiness({
      local: localDbFromCtx(ctx),
      year: input.options.year,
      month: input.options.month,
    });
  },
});

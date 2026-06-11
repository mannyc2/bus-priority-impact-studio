import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  buildRouteBriefHotspotProjection,
  buildRouteBriefModel,
  buildRouteBriefSegmentUniverse,
  defaultRouteBriefHotspotLimit,
  defaultRouteBriefTopSegmentLimit,
  emptyRouteBriefHotspotSummary,
  planRouteBriefModelRoutes,
  type RouteBriefHourlyPassengerDelay,
  type RouteBriefInputRows,
  type RouteBriefModelIssue,
  routeBriefComparisonRankRows,
  routeBriefModelServingProjection,
} from "@bp/applied-research/route-briefs";
import type {
  LocalBusLane,
  LocalRouteCatalogEntry,
  LocalRouteHotspot,
  LocalRouteHotspotSummary,
} from "@bp/db/local";
import {
  listAceRoutesForRoute,
  listAceViolationSummariesForRoute,
  listBusLanes,
  listRouteCatalog,
  listRouteHourlyRidership,
  listRouteSchedules,
  listRouteSegmentSpeeds,
  listRouteStops,
  replaceRouteBriefRows,
  replaceRouteComparisonRanks,
  replaceRouteHotspots,
  replaceRouteScorecard,
} from "@bp/db/local";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.ts";
import { mergeRoutesWithFile } from "../../lib/route-list.ts";

export type { RouteBriefHourlyPassengerDelay, RouteBriefInputRows };
export { buildRouteBriefModel, buildRouteBriefSegmentUniverse };

const defaultTopSegmentLimit = defaultRouteBriefTopSegmentLimit;
const defaultHotspotLimit = defaultRouteBriefHotspotLimit;

type RouteBriefLoadedRows = RouteBriefInputRows & {
  routeId: string;
};

type RouteBriefModelCommandIssue =
  | RouteBriefModelIssue
  | {
      routeId: string;
      code: "hotspot_projection_failed";
      message: string;
    };

export type RouteBriefModelResult = {
  isoMonth: string;
  routeCount: number;
  routesWithObservedSpeedCount: number;
  scorecardRowCount: number;
  briefSummaryRowCount: number;
  comparisonRankRowCount: number;
  routeSliceArtifactCount: number;
  issueCount: number;
  dbPath: string;
};

function routeSlicePath(artifactRoot: string, routeId: string, month: string): string {
  return join(
    artifactRoot,
    "route-slices",
    `${routeId.toLowerCase()}-${month}`,
    "route-brief-input.json",
  );
}

async function writeRouteSliceArtifact(input: {
  artifactRoot: string;
  routeId: string;
  month: string;
  value: unknown;
}): Promise<void> {
  const path = routeSlicePath(input.artifactRoot, input.routeId, input.month);
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, `${JSON.stringify(input.value, null, 2)}\n`);
}

async function loadRouteBriefRows(input: {
  local: OpenLocalPipelineDb;
  routeId: string;
  month: string;
  catalog: LocalRouteCatalogEntry[];
  busLanes: LocalBusLane[];
}): Promise<RouteBriefLoadedRows> {
  const [speedRows, ridershipRows, schedules, acePrograms, aceViolations, stops] =
    await Promise.all([
      listRouteSegmentSpeeds(input.local.db, input.routeId, input.month),
      listRouteHourlyRidership(input.local.db, input.routeId, input.month),
      listRouteSchedules(input.local.db, input.routeId, input.month),
      listAceRoutesForRoute(input.local.db, input.routeId),
      listAceViolationSummariesForRoute(input.local.db, input.routeId, input.month),
      listRouteStops(input.local.db, input.routeId, input.month),
    ]);

  return {
    routeId: input.routeId,
    summary: emptyRouteBriefHotspotSummary({
      routeId: input.routeId,
      month: input.month,
      generatedAt: new Date(0).toISOString(),
      ridershipWindowCount: ridershipRows.length,
    }).summary,
    hotspots: [],
    speedRows,
    ridershipRows,
    schedules,
    acePrograms,
    aceViolations,
    busLanes: input.busLanes,
    stops,
    catalog: input.catalog,
  };
}

export async function runRouteBriefModel(inputs: {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  routes: readonly string[];
  topSegmentLimit?: number | undefined;
  hotspotLimit?: number | undefined;
  artifactRoot?: string | undefined;
}): Promise<RouteBriefModelResult> {
  const month = isoMonth(inputs.year, inputs.month);
  const artifactRoot = inputs.artifactRoot ?? defaultArtifactRootPath();
  const generatedAt = new Date().toISOString();
  const topSegmentLimit = inputs.topSegmentLimit ?? defaultTopSegmentLimit;
  const hotspotLimit = inputs.hotspotLimit ?? defaultHotspotLimit;
  const [catalog, busLanes] = await Promise.all([
    listRouteCatalog(inputs.local.db),
    listBusLanes(inputs.local.db),
  ]);
  const routePlan = planRouteBriefModelRoutes({
    catalog,
    requestedRoutes: inputs.routes,
  });

  const loadedRows: RouteBriefLoadedRows[] = [];
  for (const routeId of routePlan.routeIds) {
    loadedRows.push(
      await loadRouteBriefRows({
        local: inputs.local,
        routeId,
        month,
        catalog,
        busLanes,
      }),
    );
  }

  const routesWithObservedSpeedCount = loadedRows.filter(
    (rows) => rows.speedRows.length > 0,
  ).length;
  if (loadedRows.length > 0 && routesWithObservedSpeedCount === 0) {
    throw new Error(
      `No local_route_segment_speed rows exist for ${month}; run ingest route-segment-speeds after the public MTA source publishes this month.`,
    );
  }

  const issues: RouteBriefModelCommandIssue[] = [...routePlan.issues];
  const briefSummaries: ReturnType<typeof buildRouteBriefModel>["routeBriefRows"]["summary"][] = [];
  let routeSliceArtifactCount = 0;

  for (const rows of loadedRows) {
    let projection: { summary: LocalRouteHotspotSummary; hotspots: LocalRouteHotspot[] };
    try {
      projection = buildRouteBriefHotspotProjection({
        routeId: rows.routeId,
        month,
        generatedAt,
        speedRows: rows.speedRows,
        ridershipRows: rows.ridershipRows,
        hotspotLimit,
      });
    } catch (err) {
      issues.push({
        routeId: rows.routeId,
        code: "hotspot_projection_failed",
        message: err instanceof Error ? err.message : String(err),
      });
      projection = emptyRouteBriefHotspotSummary({
        routeId: rows.routeId,
        month,
        generatedAt,
        ridershipWindowCount: rows.ridershipRows.length,
      });
    }

    const model = buildRouteBriefModel({
      rows: {
        ...rows,
        summary: projection.summary,
        hotspots: projection.hotspots,
      },
      year: inputs.year,
      month: inputs.month,
      topSegmentLimit,
    });
    const servingProjection = routeBriefModelServingProjection(model);

    await replaceRouteHotspots(inputs.local.db, projection.summary, projection.hotspots);
    await replaceRouteScorecard(inputs.local.db, model.routeScorecardRow);
    await replaceRouteBriefRows(inputs.local.db, servingProjection.routeBriefRows);
    await writeRouteSliceArtifact({
      artifactRoot,
      routeId: rows.routeId,
      month,
      value: servingProjection.briefInput,
    });
    routeSliceArtifactCount += 1;
    briefSummaries.push(servingProjection.routeBriefRows.summary);
  }

  const ranks = routePlan.shouldBuildComparisonRanks
    ? routeBriefComparisonRankRows(month, briefSummaries)
    : [];
  if (routePlan.shouldBuildComparisonRanks) {
    await replaceRouteComparisonRanks(inputs.local.db, month, ranks);
  }

  return {
    isoMonth: month,
    routeCount: routePlan.routeIds.length,
    routesWithObservedSpeedCount,
    scorecardRowCount: routePlan.routeIds.length,
    briefSummaryRowCount: briefSummaries.length,
    comparisonRankRowCount: ranks.length,
    routeSliceArtifactCount,
    issueCount: issues.length,
    dbPath: inputs.local.path,
  };
}

export default defineCommand({
  path: ["route", "brief-model"],
  summary:
    "Build route scorecards, brief summary rows, hotspot rows, comparison ranks, and route-slice artifacts.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      route: z.string().optional().describe("Single route ID convenience filter"),
      routes: z
        .array(z.string())
        .default([])
        .describe("Specific route IDs (default: all catalog routes)"),
      routesFile: z.string().optional().describe("JSON file containing route IDs"),
      topSegmentLimit: arg.positiveInt().default(defaultTopSegmentLimit),
      hotspotLimit: arg.positiveInt().default(defaultHotspotLimit),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    isoMonth: z.string(),
    routeCount: z.number(),
    routesWithObservedSpeedCount: z.number(),
    scorecardRowCount: z.number(),
    briefSummaryRowCount: z.number(),
    comparisonRankRowCount: z.number(),
    routeSliceArtifactCount: z.number(),
    issueCount: z.number(),
    dbPath: z.string(),
  }),
  async run({ ctx, input }) {
    const routes = await mergeRoutesWithFile(
      input.options.route === undefined
        ? input.options.routes
        : [...input.options.routes, input.options.route],
      input.options.routesFile,
    );
    return runRouteBriefModel({
      local: localDbFromCtx(ctx),
      year: input.options.year,
      month: input.options.month,
      routes,
      topSegmentLimit: input.options.topSegmentLimit,
      hotspotLimit: input.options.hotspotLimit,
      artifactRoot:
        input.options.artifactRoot === undefined
          ? undefined
          : fromCliPath(input.options.artifactRoot),
    });
  },
});

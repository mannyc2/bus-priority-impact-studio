import { join } from "node:path";
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
import { Context, Effect, Layer } from "effect";
import { isoMonth } from "../lib/dates.ts";
import { writeJson } from "../lib/json.ts";
import type { OpenLocalPipelineDb } from "../lib/local-db.ts";
import { defaultArtifactRootPath } from "../lib/paths.ts";
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
} from "../lib/route-briefs/index.ts";
import { mergeRoutesWithFile } from "../lib/route-list.ts";
import { type LocalDbOpenError, RouteLocalDbCommandError } from "./errors.ts";
import { LocalDbConnection, makeLocalDbLayer } from "./local-db.ts";

export type { RouteBriefHourlyPassengerDelay, RouteBriefInputRows };
export { buildRouteBriefModel, buildRouteBriefSegmentUniverse };

export const defaultRouteBriefModelTopSegmentLimit = defaultRouteBriefTopSegmentLimit;
export const defaultRouteBriefModelHotspotLimit = defaultRouteBriefHotspotLimit;

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

export type RouteBriefModelCommandInput = {
  readonly year: number;
  readonly month: number;
  readonly route?: string | undefined;
  readonly routes: readonly string[];
  readonly routesFile?: string | undefined;
  readonly topSegmentLimit?: number | undefined;
  readonly hotspotLimit?: number | undefined;
  readonly artifactRoot?: string | undefined;
};

type RouteBriefModelServiceInput = {
  readonly year: number;
  readonly month: number;
  readonly routes: readonly string[];
  readonly topSegmentLimit?: number | undefined;
  readonly hotspotLimit?: number | undefined;
  readonly artifactRoot?: string | undefined;
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
  await writeJson(path, input.value);
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
  const topSegmentLimit = inputs.topSegmentLimit ?? defaultRouteBriefModelTopSegmentLimit;
  const hotspotLimit = inputs.hotspotLimit ?? defaultRouteBriefModelHotspotLimit;
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

export class RouteBriefModelService extends Context.Service<
  RouteBriefModelService,
  {
    readonly buildBriefModel: (
      input: RouteBriefModelServiceInput,
    ) => Effect.Effect<RouteBriefModelResult, RouteLocalDbCommandError>;
  }
>()("@bp/pipeline-v2/RouteBriefModelService") {}

export const RouteBriefModelServiceLayer: Layer.Layer<
  RouteBriefModelService,
  never,
  LocalDbConnection
> = Layer.effect(
  RouteBriefModelService,
  Effect.gen(function* () {
    const local = yield* LocalDbConnection;

    return {
      buildBriefModel: Effect.fn("RouteBriefModelService.buildBriefModel")(function* (
        input: RouteBriefModelServiceInput,
      ) {
        yield* Effect.annotateCurrentSpan({
          command: "route.brief-model",
          year: input.year,
          month: input.month,
          routeCount: input.routes.length,
          dbPath: local.path,
        });

        return yield* Effect.tryPromise({
          try: () =>
            runRouteBriefModel({
              local,
              year: input.year,
              month: input.month,
              routes: input.routes,
              topSegmentLimit: input.topSegmentLimit,
              hotspotLimit: input.hotspotLimit,
              artifactRoot: input.artifactRoot,
            }),
          catch: (cause) =>
            RouteLocalDbCommandError.make({
              command: "route.brief-model",
              year: input.year,
              month: input.month,
              operation: "runRouteBriefModel",
              cause,
            }),
        });
      }),
    };
  }),
);

export const runRouteBriefModelCommand = Effect.fn("runRouteBriefModelCommand")(function* (
  input: RouteBriefModelCommandInput,
) {
  const service = yield* RouteBriefModelService;
  const requestedRoutes = input.route === undefined ? input.routes : [...input.routes, input.route];
  const routes = yield* Effect.tryPromise({
    try: () => mergeRoutesWithFile(requestedRoutes, input.routesFile),
    catch: (cause) =>
      RouteLocalDbCommandError.make({
        command: "route.brief-model",
        year: input.year,
        month: input.month,
        operation: "mergeRoutesWithFile",
        cause,
      }),
  });

  const result = yield* service.buildBriefModel({
    year: input.year,
    month: input.month,
    routes,
    topSegmentLimit: input.topSegmentLimit,
    hotspotLimit: input.hotspotLimit,
    artifactRoot: input.artifactRoot,
  });

  yield* Effect.logInfo(
    `route brief model complete: ${result.briefSummaryRowCount}/${result.routeCount} route briefs`,
  );

  return result;
});

export function makeRouteBriefModelCommandLayer(input: {
  readonly dbPath?: string | undefined;
}): Layer.Layer<RouteBriefModelService, RouteLocalDbCommandError | LocalDbOpenError> {
  return RouteBriefModelServiceLayer.pipe(
    Layer.provide(
      makeLocalDbLayer({
        path: input.dbPath,
      }),
    ),
  );
}

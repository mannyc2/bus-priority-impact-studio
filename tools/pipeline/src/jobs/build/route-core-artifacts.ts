import type { SegmentSpeedObservation } from "@bp/analytics";
import { detectSegmentHotspots } from "@bp/analytics";
import type { LocalRouteHourlyRidership } from "@bp/db/local";
import {
  getRouteHotspotSummary,
  listAceRoutesForRoute,
  listAceViolationSummariesForRoute,
  listBusLanes,
  listRouteCatalog,
  listRouteHotspots,
  listRouteHourlyRidership,
  listRouteSchedules,
  listRouteSegmentSpeeds,
  listRouteStops,
  replaceRouteBriefRows,
  replaceRouteHotspots,
  replaceRouteScorecard,
} from "@bp/db/local";
import type { CliOption } from "../../lib/cli-args.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { createRouteMonthContext, parseRouteMonthDbCliArgs } from "../../lib/route-job.js";
import { buildRouteBriefModel, type RouteBriefInputRows } from "./route-brief-model.js";

const schemaVersion = 1;

type HotspotBuildArgs = {
  routeId?: string;
  year?: number;
  month?: number;
  limit?: number;
  dbPath?: string;
};

type RouteBriefBuildArgs = {
  routeId?: string;
  year?: number;
  month?: number;
  topSegmentLimit?: number;
  dbPath?: string;
};

type HotspotBuildResult = {
  routeId: string;
  isoMonth: string;
  hotspotCount: number;
  topHotspotScore: number;
  topRiderImpactScore?: number;
};

type RouteBriefBuildResult = {
  routeId: string;
  isoMonth: string;
  routeScore: number;
  topSegmentCount: number;
};

function parseHotspotBuildArgs(args: HotspotBuildArgs) {
  return {
    ...createRouteMonthContext(args),
    limit: args.limit ?? 10,
  };
}

function parseHotspotCliArgs(args: string[]): HotspotBuildArgs {
  return parseRouteMonthDbCliArgs(args, {} as HotspotBuildArgs, [
    {
      flags: ["--limit"],
      apply: (output, value) => {
        output.limit = Number(value);
      },
    },
  ] satisfies readonly CliOption<HotspotBuildArgs>[]);
}

function parseBriefBuildArgs(args: RouteBriefBuildArgs) {
  return {
    ...createRouteMonthContext(args),
    topSegmentLimit: args.topSegmentLimit ?? 5,
  };
}

function parseBriefCliArgs(args: string[]): RouteBriefBuildArgs {
  return parseRouteMonthDbCliArgs(args, {} as RouteBriefBuildArgs, [
    {
      flags: ["--top-segments"],
      apply: (output, value) => {
        output.topSegmentLimit = Number(value);
      },
    },
  ] satisfies readonly CliOption<RouteBriefBuildArgs>[]);
}

function ridershipKey(dayOfWeek: string, hourOfDay: number): string {
  return `${dayOfWeek}:${hourOfDay}`;
}

function addRidershipToObservations(
  rows: SegmentSpeedObservation[],
  ridershipRows: LocalRouteHourlyRidership[],
): SegmentSpeedObservation[] {
  const ridershipByWindow = new Map(
    ridershipRows.map((row) => [ridershipKey(row.dayOfWeek, row.hourOfDay), row]),
  );

  return rows.map((row) => {
    if (row.dayOfWeek === undefined || row.hourOfDay === undefined) {
      return row;
    }

    const ridership = ridershipByWindow.get(ridershipKey(row.dayOfWeek, row.hourOfDay));
    if (ridership === undefined) {
      return row;
    }

    return {
      ...row,
      ridership: ridership.ridership,
      transfers: ridership.transfers,
    };
  });
}

export async function buildRouteHotspots(args: HotspotBuildArgs = {}): Promise<HotspotBuildResult> {
  const options = parseHotspotBuildArgs(args);
  const [speedRows, ridershipRows] = await withLocalPipelineDb(options.dbPath, (local) =>
    Promise.all([
      listRouteSegmentSpeeds(local.db, options.routeId, options.isoMonth),
      listRouteHourlyRidership(local.db, options.routeId, options.isoMonth),
    ]),
  );
  const observations = addRidershipToObservations(speedRows, ridershipRows);
  if (observations.length === 0) {
    const generatedAt = new Date().toISOString();
    const summary = {
      schemaVersion,
      routeId: options.routeId,
      isoMonth: options.isoMonth,
      generatedAt,
      routeWeightedAverageSpeedMph: 0,
      observationCount: 0,
      busTripCount: 0,
      ridershipWeighted: false,
      ridershipWindowCount: ridershipRows.length,
      ridershipMatchedObservationCount: 0,
      ridershipExposure: 0,
      segmentCount: 0,
      hotspotCount: 0,
      topHotspots: [],
    };

    await withLocalPipelineDb(options.dbPath, (local) =>
      replaceRouteHotspots(local.db, summary, []),
    );

    return {
      routeId: options.routeId,
      isoMonth: options.isoMonth,
      hotspotCount: 0,
      topHotspotScore: 0,
    };
  }
  const result = detectSegmentHotspots(observations, {
    limit: options.limit,
  });
  const generatedAt = new Date().toISOString();
  const summary = {
    schemaVersion,
    routeId: result.routeId,
    isoMonth: result.isoMonth,
    generatedAt,
    routeWeightedAverageSpeedMph: result.routeWeightedAverageSpeedMph,
    observationCount: result.observationCount,
    busTripCount: result.busTripCount,
    ridershipWeighted: result.ridershipWeighted,
    ridershipWindowCount: ridershipRows.length,
    ridershipMatchedObservationCount: result.ridershipMatchedObservationCount ?? 0,
    ridershipExposure: result.ridershipExposure ?? 0,
    segmentCount: result.segmentCount,
    hotspotCount: result.hotspots.length,
    topHotspots: result.hotspots.slice(0, 5),
  };

  await withLocalPipelineDb(options.dbPath, (local) =>
    replaceRouteHotspots(local.db, summary, result.hotspots),
  );

  const output: HotspotBuildResult = {
    routeId: result.routeId,
    isoMonth: result.isoMonth,
    hotspotCount: result.hotspots.length,
    topHotspotScore: result.hotspots[0]?.hotspotScore ?? 0,
  };

  const topRiderImpactScore = result.hotspots[0]?.riderImpactScore;
  if (topRiderImpactScore !== undefined) {
    output.topRiderImpactScore = topRiderImpactScore;
  }

  return output;
}

export async function buildRouteHotspotsFromCli(args: string[]): Promise<HotspotBuildResult> {
  return buildRouteHotspots(parseHotspotCliArgs(args));
}

async function readRouteBriefInputRows(
  path: string,
  routeId: string,
  month: string,
): Promise<RouteBriefInputRows> {
  return withLocalPipelineDb(path, async (local) => {
    const summary = await getRouteHotspotSummary(local.db, routeId, month);
    if (summary === null) {
      throw new Error(`No hotspot summary found for ${routeId} ${month}`);
    }
    const [
      hotspots,
      speedRows,
      ridershipRows,
      schedules,
      acePrograms,
      aceViolations,
      busLanes,
      stops,
      catalog,
    ] = await Promise.all([
      listRouteHotspots(local.db, routeId, month),
      listRouteSegmentSpeeds(local.db, routeId, month),
      listRouteHourlyRidership(local.db, routeId, month),
      listRouteSchedules(local.db, routeId, month),
      listAceRoutesForRoute(local.db, routeId),
      listAceViolationSummariesForRoute(local.db, routeId, month),
      listBusLanes(local.db),
      listRouteStops(local.db, routeId, month),
      listRouteCatalog(local.db),
    ]);

    return {
      summary,
      hotspots,
      speedRows,
      ridershipRows,
      schedules,
      acePrograms,
      aceViolations,
      busLanes,
      stops,
      catalog,
    };
  });
}

async function writeServingProjection(
  path: string,
  model: ReturnType<typeof buildRouteBriefModel>,
): Promise<void> {
  await withLocalPipelineDb(path, async (local) => {
    await replaceRouteScorecard(local.db, model.routeScorecardRow);
    await replaceRouteBriefRows(local.db, model.routeBriefRows);
  });
}

export async function buildRouteBriefInput(
  args: RouteBriefBuildArgs = {},
): Promise<RouteBriefBuildResult> {
  const options = parseBriefBuildArgs(args);
  const rows = await readRouteBriefInputRows(options.dbPath, options.routeId, options.isoMonth);
  const model = buildRouteBriefModel({
    rows,
    year: options.year,
    month: options.month,
    topSegmentLimit: options.topSegmentLimit,
  });
  await writeServingProjection(options.dbPath, model);

  return {
    routeId: model.routeId,
    isoMonth: model.isoMonth,
    routeScore: model.routeScore,
    topSegmentCount: model.topSegmentCount,
  };
}

export async function buildRouteBriefInputFromCli(args: string[]): Promise<RouteBriefBuildResult> {
  return buildRouteBriefInput(parseBriefCliArgs(args));
}

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
  replaceRouteScorecard,
} from "@bp/db/local";
import { writeRouteSliceArtifact } from "../../lib/artifacts.js";
import { isoMonth } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { buildRouteBriefModel, type RouteBriefInputRows } from "./route-brief-model.js";

type RouteBriefBuildArgs = {
  routeId?: string;
  year?: number;
  month?: number;
  topSegmentLimit?: number;
  dbPath?: string;
};

type RouteBriefBuildResult = {
  routeId: string;
  isoMonth: string;
  briefInputPath: string;
  scorecardPath: string;
  routeScore: number;
  topSegmentCount: number;
};

function parseBuildArgs(args: RouteBriefBuildArgs): Required<RouteBriefBuildArgs> {
  return {
    routeId: args.routeId ?? "M1",
    year: args.year ?? 2026,
    month: args.month ?? 3,
    topSegmentLimit: args.topSegmentLimit ?? 5,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseCliArgs(args: string[]): RouteBriefBuildArgs {
  const output: RouteBriefBuildArgs = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--route" && value !== undefined) {
      output.routeId = value;
      index += 1;
      continue;
    }

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

    if (arg === "--top-segments" && value !== undefined) {
      output.topSegmentLimit = Number(value);
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

async function readRouteBriefInputRows(
  path: string,
  routeId: string,
  month: string,
): Promise<RouteBriefInputRows> {
  const local = await openLocalPipelineDb(path);

  try {
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
  } finally {
    local.sqlite.close();
  }
}

async function writeServingProjection(
  path: string,
  model: ReturnType<typeof buildRouteBriefModel>,
): Promise<void> {
  const local = await openLocalPipelineDb(path);

  try {
    await replaceRouteScorecard(local.db, model.routeScorecardRow);
    await replaceRouteBriefRows(local.db, model.routeBriefRows);
  } finally {
    local.sqlite.close();
  }
}

export async function buildM1RouteBriefInput(
  args: RouteBriefBuildArgs = {},
): Promise<RouteBriefBuildResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const rows = await readRouteBriefInputRows(options.dbPath, options.routeId, month);
  const model = buildRouteBriefModel({
    rows,
    year: options.year,
    month: options.month,
    topSegmentLimit: options.topSegmentLimit,
  });
  const [briefInputPath, scorecardPath] = await Promise.all([
    writeRouteSliceArtifact(options.routeId, month, "route-brief-input.json", model.briefInput),
    writeRouteSliceArtifact(options.routeId, month, "route-scorecard.json", model.scorecard),
  ]);

  await writeServingProjection(options.dbPath, model);

  return {
    routeId: model.routeId,
    isoMonth: model.isoMonth,
    briefInputPath,
    scorecardPath,
    routeScore: model.routeScore,
    topSegmentCount: model.topSegmentCount,
  };
}

export async function buildM1RouteBriefInputFromCli(
  args: string[],
): Promise<RouteBriefBuildResult> {
  return buildM1RouteBriefInput(parseCliArgs(args));
}

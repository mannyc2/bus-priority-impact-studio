import { RouteIdCodec } from "@bp/domain";
import * as z from "zod";
import { createRouteMonthContext } from "../../lib/route-job.js";
import { ingestRouteSchedules } from "../ingest/ingest-route-schedules.js";
import { ingestRouteSlice } from "../ingest/route-slice.js";
import { buildRouteBriefInput, buildRouteHotspots } from "./route-core-artifacts.js";
import { buildRouteRidershipProfile, buildRouteSpeedProfile } from "./route-profiles.js";
import {
  buildRouteBusLaneOverlay,
  buildRouteInterventionOverlay,
  buildRouteScheduleComparison,
} from "./route-secondary-artifacts.js";

type RouteBuildArgs = {
  routeId?: string;
  year?: number;
  month?: number;
  hotspotLimit?: number;
  topSegmentLimit?: number;
  dbPath?: string;
};

export type RouteBuildResult = {
  routeId: string;
  isoMonth: string;
  segmentSpeedRows: number;
  ridershipWindows: number;
  scheduleTimepoints: number;
  hotspotCount: number;
  routeScore: number;
};

type RouteBuildOptions = Required<RouteBuildArgs> & {
  isoMonth: string;
};

type RouteJobArgs = {
  routeId: string;
  year: number;
  month: number;
  dbPath: string;
};

type RoutePipelineDeps = {
  ingestRouteSlice: typeof ingestRouteSlice;
  ingestSchedules: typeof ingestRouteSchedules;
  buildHotspots: typeof buildRouteHotspots;
  buildRidershipProfile: typeof buildRouteRidershipProfile;
  buildSpeedProfile: typeof buildRouteSpeedProfile;
  buildInterventionOverlay: typeof buildRouteInterventionOverlay;
  buildBusLaneOverlay: typeof buildRouteBusLaneOverlay;
  buildScheduleComparison: typeof buildRouteScheduleComparison;
  buildRouteBriefInput: typeof buildRouteBriefInput;
};

const defaultDeps: RoutePipelineDeps = {
  ingestRouteSlice,
  ingestSchedules: ingestRouteSchedules,
  buildHotspots: buildRouteHotspots,
  buildRidershipProfile: buildRouteRidershipProfile,
  buildSpeedProfile: buildRouteSpeedProfile,
  buildInterventionOverlay: buildRouteInterventionOverlay,
  buildBusLaneOverlay: buildRouteBusLaneOverlay,
  buildScheduleComparison: buildRouteScheduleComparison,
  buildRouteBriefInput,
};

function parseRouteBuildArgs(args: RouteBuildArgs = {}): RouteBuildOptions {
  const options = createRouteMonthContext(args);

  return {
    ...options,
    routeId: z.decode(RouteIdCodec, options.routeId),
    hotspotLimit: args.hotspotLimit ?? 10,
    topSegmentLimit: args.topSegmentLimit ?? 5,
  };
}

function routeJobArgs(input: RouteBuildOptions): RouteJobArgs {
  return {
    routeId: input.routeId,
    year: input.year,
    month: input.month,
    dbPath: input.dbPath,
  };
}

async function buildSecondaryArtifacts(
  deps: RoutePipelineDeps,
  routeArgs: RouteJobArgs,
  hotspotLimit: number,
): Promise<void> {
  await Promise.all([
    deps.buildRidershipProfile({ ...routeArgs, limit: hotspotLimit }),
    deps.buildSpeedProfile({ ...routeArgs, limit: hotspotLimit }),
    deps.buildInterventionOverlay(routeArgs),
    deps.buildBusLaneOverlay(routeArgs),
    deps.buildScheduleComparison(routeArgs),
  ]);
}

export async function buildRouteSliceArtifacts(
  args: RouteBuildArgs = {},
  deps: RoutePipelineDeps = defaultDeps,
): Promise<RouteBuildResult> {
  const options = parseRouteBuildArgs(args);
  const routeArgs = routeJobArgs(options);
  const slice = await deps.ingestRouteSlice(routeArgs);
  const schedules = await deps.ingestSchedules(routeArgs);
  const hotspots = await deps.buildHotspots({ ...routeArgs, limit: options.hotspotLimit });
  await buildSecondaryArtifacts(deps, routeArgs, options.hotspotLimit);
  const brief = await deps.buildRouteBriefInput({
    ...routeArgs,
    topSegmentLimit: options.topSegmentLimit,
  });

  return {
    routeId: options.routeId,
    isoMonth: options.isoMonth,
    segmentSpeedRows: slice.summary.normalized.segmentSpeedCount,
    ridershipWindows: slice.summary.normalized.ridershipWindowCount,
    scheduleTimepoints: schedules.timepointCount,
    hotspotCount: hotspots.hotspotCount,
    routeScore: brief.routeScore,
  };
}

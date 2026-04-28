import { RouteIdCodec } from "@bp/domain";
import * as z from "zod";
import {
  dbOption,
  falseOption,
  monthOption,
  numberOption,
  parseCliOptions,
  stringListOption,
  yearOption,
} from "../../lib/cli-args.js";
import { isoMonth } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { ingestAceRoutes } from "../ingest/ingest-ace-routes.js";
import { ingestAceViolationSummary } from "../ingest/ingest-ace-violations.js";
import { ingestBusLanes } from "../ingest/ingest-bus-lanes.js";
import { ingestM1Schedules } from "../ingest/ingest-m1-schedules.js";
import { ingestM1RouteSlice } from "../ingest/m1-slice.js";
import { buildM1ArtifactManifest } from "./m1-artifact-manifest.js";
import { buildM1BusLaneOverlay } from "./m1-bus-lane-overlay.js";
import { buildM1Hotspots } from "./m1-hotspots.js";
import { buildM1InterventionOverlay } from "./m1-intervention-overlay.js";
import { buildM1RidershipProfile } from "./m1-ridership-profile.js";
import { buildM1RouteBriefInput } from "./m1-route-brief-input.js";
import { buildM1ScheduleComparison } from "./m1-schedule-comparison.js";
import { buildM1SpeedProfile } from "./m1-speed-profile.js";

type RouteBuildArgs = {
  routeId?: string;
  year?: number;
  month?: number;
  hotspotLimit?: number;
  topSegmentLimit?: number;
  dbPath?: string;
};

type RouteBatchArgs = {
  routes?: string[];
  year?: number;
  month?: number;
  hotspotLimit?: number;
  topSegmentLimit?: number;
  refreshSharedSources?: boolean;
  dbPath?: string;
};

type RouteBuildResult = {
  routeId: string;
  isoMonth: string;
  segmentSpeedRows: number;
  ridershipWindows: number;
  scheduleTimepoints: number;
  hotspotCount: number;
  routeScore: number;
  artifactCount: number;
};

type RouteBatchResult = {
  isoMonth: string;
  routeCount: number;
  routes: RouteBuildResult[];
};

type RoutePipelineDeps = {
  ingestRouteSlice: typeof ingestM1RouteSlice;
  ingestSchedules: typeof ingestM1Schedules;
  buildHotspots: typeof buildM1Hotspots;
  buildRidershipProfile: typeof buildM1RidershipProfile;
  buildSpeedProfile: typeof buildM1SpeedProfile;
  buildInterventionOverlay: typeof buildM1InterventionOverlay;
  buildBusLaneOverlay: typeof buildM1BusLaneOverlay;
  buildScheduleComparison: typeof buildM1ScheduleComparison;
  buildRouteBriefInput: typeof buildM1RouteBriefInput;
  buildArtifactManifest: typeof buildM1ArtifactManifest;
  ingestAceRoutes: typeof ingestAceRoutes;
  ingestAceViolationSummary: typeof ingestAceViolationSummary;
  ingestBusLanes: typeof ingestBusLanes;
};

const defaultDeps: RoutePipelineDeps = {
  ingestRouteSlice: ingestM1RouteSlice,
  ingestSchedules: ingestM1Schedules,
  buildHotspots: buildM1Hotspots,
  buildRidershipProfile: buildM1RidershipProfile,
  buildSpeedProfile: buildM1SpeedProfile,
  buildInterventionOverlay: buildM1InterventionOverlay,
  buildBusLaneOverlay: buildM1BusLaneOverlay,
  buildScheduleComparison: buildM1ScheduleComparison,
  buildRouteBriefInput: buildM1RouteBriefInput,
  buildArtifactManifest: buildM1ArtifactManifest,
  ingestAceRoutes,
  ingestAceViolationSummary,
  ingestBusLanes,
};

function parseRouteBuildArgs(args: RouteBuildArgs = {}): Required<RouteBuildArgs> {
  return {
    routeId: z.decode(RouteIdCodec, args.routeId ?? "M1"),
    year: args.year ?? 2026,
    month: args.month ?? 3,
    hotspotLimit: args.hotspotLimit ?? 10,
    topSegmentLimit: args.topSegmentLimit ?? 5,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseRouteBatchArgs(args: RouteBatchArgs = {}): Required<RouteBatchArgs> {
  return {
    routes: (args.routes ?? ["M1"]).map((route) => z.decode(RouteIdCodec, route)),
    year: args.year ?? 2026,
    month: args.month ?? 3,
    hotspotLimit: args.hotspotLimit ?? 10,
    topSegmentLimit: args.topSegmentLimit ?? 5,
    refreshSharedSources: args.refreshSharedSources ?? true,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseCliArgs(args: string[]): RouteBatchArgs {
  return parseCliOptions(args, {} as RouteBatchArgs, [
    stringListOption(["--route", "--routes"], (output, value) => {
      output.routes = value;
    }),
    yearOption(),
    monthOption(),
    numberOption(["--hotspot-limit"], (output, value) => {
      output.hotspotLimit = value;
    }),
    numberOption(["--top-segments"], (output, value) => {
      output.topSegmentLimit = value;
    }),
    falseOption(["--no-refresh-shared"], (output) => {
      output.refreshSharedSources = false;
    }),
    dbOption(fromCliPath),
  ]);
}

export async function buildRouteSliceArtifacts(
  args: RouteBuildArgs = {},
  deps: RoutePipelineDeps = defaultDeps,
): Promise<RouteBuildResult> {
  const options = parseRouteBuildArgs(args);
  const routeArgs = {
    routeId: options.routeId,
    year: options.year,
    month: options.month,
    dbPath: options.dbPath,
  };
  const slice = await deps.ingestRouteSlice(routeArgs);
  const schedules = await deps.ingestSchedules(routeArgs);
  const hotspots = await deps.buildHotspots({ ...routeArgs, limit: options.hotspotLimit });

  await deps.buildRidershipProfile({ ...routeArgs, limit: options.hotspotLimit });
  await deps.buildSpeedProfile({ ...routeArgs, limit: options.hotspotLimit });
  await deps.buildInterventionOverlay(routeArgs);
  await deps.buildBusLaneOverlay(routeArgs);
  await deps.buildScheduleComparison(routeArgs);
  const brief = await deps.buildRouteBriefInput({
    ...routeArgs,
    topSegmentLimit: options.topSegmentLimit,
  });
  const manifest = await deps.buildArtifactManifest(routeArgs);

  return {
    routeId: options.routeId,
    isoMonth: isoMonth(options.year, options.month),
    segmentSpeedRows: slice.summary.normalized.segmentSpeedCount,
    ridershipWindows: slice.summary.normalized.ridershipWindowCount,
    scheduleTimepoints: schedules.timepointCount,
    hotspotCount: hotspots.hotspotCount,
    routeScore: brief.routeScore,
    artifactCount: manifest.artifactCount,
  };
}

export async function buildRouteBatchArtifacts(
  args: RouteBatchArgs = {},
  deps: RoutePipelineDeps = defaultDeps,
): Promise<RouteBatchResult> {
  const options = parseRouteBatchArgs(args);
  const month = isoMonth(options.year, options.month);

  if (options.refreshSharedSources) {
    await Promise.all([
      deps.ingestAceRoutes(),
      deps.ingestAceViolationSummary({ year: options.year, month: options.month }),
      deps.ingestBusLanes(),
    ]);
  }

  const routes: RouteBuildResult[] = [];
  for (const routeId of options.routes) {
    routes.push(
      await buildRouteSliceArtifacts(
        {
          routeId,
          year: options.year,
          month: options.month,
          hotspotLimit: options.hotspotLimit,
          topSegmentLimit: options.topSegmentLimit,
          dbPath: options.dbPath,
        },
        deps,
      ),
    );
  }

  return {
    isoMonth: month,
    routeCount: routes.length,
    routes,
  };
}

export async function buildRouteBatchArtifactsFromCli(args: string[]): Promise<RouteBatchResult> {
  return buildRouteBatchArtifacts(parseCliArgs(args));
}

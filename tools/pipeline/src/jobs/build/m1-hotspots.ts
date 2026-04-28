import type { SegmentSpeedObservation } from "@bp/analytics";
import { detectSegmentHotspots } from "@bp/analytics";
import type { LocalRouteHourlyRidership } from "@bp/db/local";
import {
  listRouteHourlyRidership,
  listRouteSegmentSpeeds,
  replaceRouteHotspots,
} from "@bp/db/local";
import { routeSliceKey, writeRouteSliceArtifact } from "../../lib/artifacts.js";
import {
  dbOption,
  monthOption,
  parseCliOptions,
  routeOption,
  yearOption,
} from "../../lib/cli-args.js";
import { isoMonth } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, withLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";

const schemaVersion = 1;

type HotspotBuildArgs = {
  routeId?: string;
  year?: number;
  month?: number;
  limit?: number;
  dbPath?: string;
};

type HotspotBuildResult = {
  artifactPath: string;
  summaryPath: string;
  routeId: string;
  isoMonth: string;
  hotspotCount: number;
  topHotspotScore: number;
  topRiderImpactScore?: number;
};

type HotspotBuildOptions = Required<HotspotBuildArgs>;

function parseBuildArgs(args: HotspotBuildArgs): HotspotBuildOptions {
  return {
    routeId: args.routeId ?? "M1",
    year: args.year ?? 2026,
    month: args.month ?? 3,
    limit: args.limit ?? 10,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseCliArgs(args: string[]): HotspotBuildArgs {
  return parseCliOptions<HotspotBuildArgs>(args, {}, [
    routeOption(),
    yearOption(),
    monthOption(),
    {
      flags: ["--limit"],
      apply: (output, value) => {
        output.limit = Number(value);
      },
    },
    dbOption(fromCliPath),
  ]);
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

export async function buildM1Hotspots(args: HotspotBuildArgs = {}): Promise<HotspotBuildResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const key = routeSliceKey(options.routeId, month);
  const inputSource = `local-db://route-slices/${key}/segment-speeds`;
  const ridershipSource = `local-db://route-slices/${key}/ridership`;
  const [speedRows, ridershipRows] = await withLocalPipelineDb(options.dbPath, (local) =>
    Promise.all([
      listRouteSegmentSpeeds(local.db, options.routeId, month),
      listRouteHourlyRidership(local.db, options.routeId, month),
    ]),
  );
  const observations = addRidershipToObservations(speedRows, ridershipRows);
  if (observations.length === 0) {
    const generatedAt = new Date().toISOString();
    const artifact = {
      schemaVersion,
      generatedAt,
      inputSource,
      ridershipSource: ridershipRows.length > 0 ? ridershipSource : null,
      method: {
        targetSpeedMph: 8,
        slowSpeedThresholdMph: 8,
        score: null,
        riderImpactScore: null,
        caveat:
          "No segment-speed observations were available for this route and month, so hotspot outputs are empty.",
        ridershipCaveat:
          "Ridership is route-level hourly exposure joined by day-of-week and hour; it is not segment-level load.",
      },
      result: {
        routeId: options.routeId,
        isoMonth: month,
        targetSpeedMph: 8,
        slowSpeedThresholdMph: 8,
        routeWeightedAverageSpeedMph: 0,
        observationCount: 0,
        busTripCount: 0,
        ridershipWeighted: false,
        ridershipMatchedObservationCount: 0,
        ridershipExposure: 0,
        segmentCount: 0,
        hotspots: [],
      },
    };
    const summary = {
      schemaVersion,
      routeId: options.routeId,
      isoMonth: month,
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
    const [artifactPath, summaryPath] = await Promise.all([
      writeRouteSliceArtifact(options.routeId, month, "hotspots.json", artifact),
      writeRouteSliceArtifact(options.routeId, month, "summary.json", summary),
    ]);

    return {
      artifactPath,
      summaryPath,
      routeId: options.routeId,
      isoMonth: month,
      hotspotCount: 0,
      topHotspotScore: 0,
    };
  }
  const result = detectSegmentHotspots(observations, {
    limit: options.limit,
  });
  const artifact = {
    schemaVersion,
    generatedAt: new Date().toISOString(),
    inputSource,
    ridershipSource: ridershipRows.length > 0 ? ridershipSource : null,
    method: {
      targetSpeedMph: result.targetSpeedMph,
      slowSpeedThresholdMph: result.slowSpeedThresholdMph,
      score: "round((0.65 * speedSeverity + 0.35 * slowWindowShare) * 100)",
      riderImpactScore: "round((0.65 * hotspotScore/100 + 0.35 * riderImpactShare) * 100)",
      caveat: "Hotspot score is a deterministic prioritization heuristic, not a causal claim.",
      ridershipCaveat:
        "Ridership is route-level hourly exposure joined by day-of-week and hour; it is not segment-level load.",
    },
    result,
  };
  const summary = {
    schemaVersion,
    routeId: result.routeId,
    isoMonth: result.isoMonth,
    generatedAt: artifact.generatedAt,
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
  const [artifactPath, summaryPath] = await Promise.all([
    writeRouteSliceArtifact(options.routeId, month, "hotspots.json", artifact),
    writeRouteSliceArtifact(options.routeId, month, "summary.json", summary),
  ]);

  const output: HotspotBuildResult = {
    artifactPath,
    summaryPath,
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

export async function buildM1HotspotsFromCli(args: string[]): Promise<HotspotBuildResult> {
  return buildM1Hotspots(parseCliArgs(args));
}

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  type LocalRouteHourlyRidership,
  type LocalRouteSegmentSpeed,
  listRouteHourlyRidership,
  listRouteSegmentSpeeds,
} from "@bp/db/local";
import { routeSliceKey } from "../../lib/artifacts.js";
import { isoMonth } from "../../lib/dates.js";
import { writeJson } from "../../lib/json.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { fromRepoRoot } from "../../source-manifest.js";

const schemaVersion = 1;

type RidershipProfileArgs = {
  routeId?: string;
  year?: number;
  month?: number;
  limit?: number;
  dbPath?: string;
};

type RidershipProfileResult = {
  routeId: string;
  isoMonth: string;
  profilePath: string;
  ridershipWindowCount: number;
  slowCrowdedWindowCount: number;
};

type RidershipRow = LocalRouteHourlyRidership;
type SpeedRow = LocalRouteSegmentSpeed;

type SpeedWindowSummary = {
  matchedObservationCount: number;
  busTripCount: number;
  weightedSpeedSum: number;
  slowObservationCount: number;
};

type RidershipProfileOptions = Required<RidershipProfileArgs>;

function parseBuildArgs(args: RidershipProfileArgs): RidershipProfileOptions {
  return {
    routeId: args.routeId ?? "M1",
    year: args.year ?? 2026,
    month: args.month ?? 3,
    limit: args.limit ?? 10,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseCliArgs(args: string[]): RidershipProfileArgs {
  const output: RidershipProfileArgs = {};

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

    if (arg === "--limit" && value !== undefined) {
      output.limit = Number(value);
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

function windowKey(dayOfWeek: string, hourOfDay: number): string {
  return `${dayOfWeek}:${hourOfDay}`;
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function summarizeSpeedWindows(rows: SpeedRow[]): Map<string, SpeedWindowSummary> {
  const summaries = new Map<string, SpeedWindowSummary>();

  for (const row of rows) {
    if (row.busTripCount <= 0) {
      continue;
    }

    const key = windowKey(row.dayOfWeek, row.hourOfDay);
    const summary =
      summaries.get(key) ??
      ({
        matchedObservationCount: 0,
        busTripCount: 0,
        weightedSpeedSum: 0,
        slowObservationCount: 0,
      } satisfies SpeedWindowSummary);

    summary.matchedObservationCount += 1;
    summary.busTripCount += row.busTripCount;
    summary.weightedSpeedSum += row.averageRoadSpeedMph * row.busTripCount;
    if (row.averageRoadSpeedMph < 8) {
      summary.slowObservationCount += 1;
    }
    summaries.set(key, summary);
  }

  return summaries;
}

function buildWindowProfile(row: RidershipRow, speedSummaries: Map<string, SpeedWindowSummary>) {
  const speed = speedSummaries.get(windowKey(row.dayOfWeek, row.hourOfDay));
  const speedFields =
    speed === undefined
      ? {
          matchedObservationCount: 0,
          busTripCount: 0,
          weightedAverageSpeedMph: null,
          slowObservationShare: null,
        }
      : {
          matchedObservationCount: speed.matchedObservationCount,
          busTripCount: speed.busTripCount,
          weightedAverageSpeedMph: round(speed.weightedSpeedSum / speed.busTripCount),
          slowObservationShare: round(speed.slowObservationCount / speed.matchedObservationCount),
        };

  return {
    dayOfWeek: row.dayOfWeek,
    hourOfDay: row.hourOfDay,
    ridership: row.ridership,
    transfers: row.transfers,
    ...speedFields,
  };
}

export async function buildM1RidershipProfile(
  args: RidershipProfileArgs = {},
): Promise<RidershipProfileResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const key = routeSliceKey(options.routeId, month);
  const artifactDir = fromRepoRoot(join("data/artifacts/route-slices", key));
  const profilePath = join(artifactDir, "ridership-profile.json");
  const local = await openLocalPipelineDb(options.dbPath);
  const [ridershipRows, speedRows] = await Promise.all([
    listRouteHourlyRidership(local.db, options.routeId, month),
    listRouteSegmentSpeeds(local.db, options.routeId, month),
  ]);
  local.sqlite.close();
  const speedSummaries = summarizeSpeedWindows(speedRows);
  const windowProfiles = ridershipRows.map((row) => buildWindowProfile(row, speedSummaries));
  const topRidershipWindows = [...windowProfiles]
    .sort((left, right) => right.ridership - left.ridership || left.hourOfDay - right.hourOfDay)
    .slice(0, options.limit);
  const slowCrowdedWindows = [...windowProfiles]
    .filter((window) => window.weightedAverageSpeedMph !== null)
    .sort((left, right) => {
      const leftSlowRiders = left.ridership * (left.slowObservationShare ?? 0);
      const rightSlowRiders = right.ridership * (right.slowObservationShare ?? 0);
      if (rightSlowRiders !== leftSlowRiders) {
        return rightSlowRiders - leftSlowRiders;
      }

      return right.ridership - left.ridership;
    })
    .slice(0, options.limit);
  const profile = {
    schemaVersion,
    routeId: options.routeId,
    analysisPeriod: month,
    generatedAt: new Date().toISOString(),
    ridershipWindowCount: ridershipRows.length,
    speedWindowCount: speedSummaries.size,
    totalRidership: round(ridershipRows.reduce((total, row) => total + row.ridership, 0)),
    totalTransfers: round(ridershipRows.reduce((total, row) => total + row.transfers, 0)),
    peakRidershipWindow: topRidershipWindows[0] ?? null,
    topRidershipWindows,
    slowCrowdedWindows,
    caveats: [
      "Ridership windows are route-level hourly totals, not segment-level passenger loads.",
      "Slow crowded windows combine route-level ridership with route timepoint speed observations for the same day and hour.",
    ],
  };

  await mkdir(artifactDir, { recursive: true });
  await writeJson(profilePath, profile);

  return {
    routeId: options.routeId,
    isoMonth: month,
    profilePath,
    ridershipWindowCount: ridershipRows.length,
    slowCrowdedWindowCount: slowCrowdedWindows.length,
  };
}

export async function buildM1RidershipProfileFromCli(
  args: string[],
): Promise<RidershipProfileResult> {
  return buildM1RidershipProfile(parseCliArgs(args));
}

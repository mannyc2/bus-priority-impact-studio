import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { SegmentSpeedObservation } from "@bp/analytics";
import { detectSegmentHotspots } from "@bp/analytics";
import { NormalizedHourlyRidershipSchema, NormalizedSegmentSpeedSchema } from "@bp/sources";
import * as z from "zod";
import { routeSliceKey } from "../../lib/artifacts.js";
import { isoMonth } from "../../lib/dates.js";
import { writeJson } from "../../lib/json.js";
import { fromRepoRoot } from "../../source-manifest.js";

const schemaVersion = 1;

const SegmentSpeedArtifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    routeId: z.string().min(1),
    isoMonth: z.string().regex(/^\d{4}-\d{2}$/),
    rows: z.array(NormalizedSegmentSpeedSchema),
  })
  .strict();

const HourlyRidershipArtifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    routeId: z.string().min(1),
    isoMonth: z.string().regex(/^\d{4}-\d{2}$/),
    rows: z.array(NormalizedHourlyRidershipSchema),
  })
  .strict();

type HourlyRidershipRow = z.output<typeof NormalizedHourlyRidershipSchema>;

type HotspotBuildArgs = {
  routeId?: string;
  year?: number;
  month?: number;
  limit?: number;
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

function parseBuildArgs(args: HotspotBuildArgs): Required<HotspotBuildArgs> {
  return {
    routeId: args.routeId ?? "M1",
    year: args.year ?? 2026,
    month: args.month ?? 3,
    limit: args.limit ?? 10,
  };
}

function parseCliArgs(args: string[]): HotspotBuildArgs {
  const output: HotspotBuildArgs = {};

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

    throw new Error(`Unknown or incomplete argument: ${arg ?? ""}`);
  }

  return output;
}

function ridershipKey(dayOfWeek: string, hourOfDay: number): string {
  return `${dayOfWeek}:${hourOfDay}`;
}

function addRidershipToObservations(
  rows: SegmentSpeedObservation[],
  ridershipRows: HourlyRidershipRow[],
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

async function readRidershipRows(path: string): Promise<HourlyRidershipRow[]> {
  if (!(await Bun.file(path).exists())) {
    return [];
  }

  return HourlyRidershipArtifactSchema.parse(await Bun.file(path).json()).rows;
}

export async function buildM1Hotspots(args: HotspotBuildArgs = {}): Promise<HotspotBuildResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const key = routeSliceKey(options.routeId, month);
  const inputPath = fromRepoRoot(join("data/working/route-slices", key, "segment-speeds.json"));
  const ridershipPath = fromRepoRoot(join("data/working/route-slices", key, "ridership.json"));
  const artifactDir = fromRepoRoot(join("data/artifacts/route-slices", key));
  const artifactPath = join(artifactDir, "hotspots.json");
  const summaryPath = join(artifactDir, "summary.json");
  const input = SegmentSpeedArtifactSchema.parse(await Bun.file(inputPath).json());
  const ridershipRows = await readRidershipRows(ridershipPath);
  const observations = addRidershipToObservations(input.rows, ridershipRows);
  if (observations.length === 0) {
    const generatedAt = new Date().toISOString();
    const artifact = {
      schemaVersion,
      generatedAt,
      inputPath,
      ridershipPath: ridershipRows.length > 0 ? ridershipPath : null,
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
        routeId: input.routeId,
        isoMonth: input.isoMonth,
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
      routeId: input.routeId,
      isoMonth: input.isoMonth,
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

    await mkdir(artifactDir, { recursive: true });
    await Promise.all([writeJson(artifactPath, artifact), writeJson(summaryPath, summary)]);

    return {
      artifactPath,
      summaryPath,
      routeId: input.routeId,
      isoMonth: input.isoMonth,
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
    inputPath,
    ridershipPath: ridershipRows.length > 0 ? ridershipPath : null,
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

  await mkdir(artifactDir, { recursive: true });
  await Promise.all([writeJson(artifactPath, artifact), writeJson(summaryPath, summary)]);

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

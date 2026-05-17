import {
  type LocalObservedHeadwaySample,
  type LocalRouteReliabilityBaseline,
  listObservedHeadwaySamples,
  listRouteBriefSummaries,
  listRouteReliabilityBaselines,
  replaceRouteObservedReliabilityRows,
} from "@bp/db/local";
import { type CliOption, numberOption } from "../../lib/cli-args.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";

const fallbackBunchingThresholdMinutes = 3;
const fallbackLongGapThresholdMinutes = 20;
const defaultMinSampleThreshold = 30;

type RouteObservedReliabilityArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
  runId?: string;
  minSamples?: number;
};

type RouteObservedReliabilityResult = {
  isoMonth: string;
  runId: string;
  routeCount: number;
  observedRouteCount: number;
  insufficientRouteCount: number;
  headwaySampleCount: number;
};

type RouteReliabilitySummary = {
  routeId: string;
  month: string;
  runId: string;
  reliabilityStatus: "observed" | "insufficient_gtfs_rt_samples";
  minSampleThreshold: number;
  sampleCount: number;
  stopCount: number;
  directionCount: number;
  averageObservedHeadwayMinutes: number | null;
  medianObservedHeadwayMinutes: number | null;
  p90ObservedHeadwayMinutes: number | null;
  maxObservedHeadwayMinutes: number | null;
  scheduledMedianHeadwayMinutes: number | null;
  bunchingThresholdMinutes: number | null;
  longGapThresholdMinutes: number | null;
  observedBunchingShare: number | null;
  observedLongGapShare: number | null;
  expectedWaitMinutes: number | null;
  scheduledExpectedWaitMinutes: number | null;
  excessWaitMinutes: number | null;
  waitReliabilityRatio: number | null;
};

function requireRunId(value: string | undefined): string {
  if (value === undefined || value.length === 0) {
    throw new Error("Missing required argument: --run-id");
  }

  return value;
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function quantile(sortedValues: readonly number[], q: number): number | null {
  if (sortedValues.length === 0) {
    return null;
  }
  if (sortedValues.length === 1) {
    return sortedValues[0] ?? null;
  }

  const position = (sortedValues.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = sortedValues[lower] ?? 0;
  const upperValue = sortedValues[upper] ?? lowerValue;

  return lowerValue + (upperValue - lowerValue) * (position - lower);
}

function groupSamplesByRoute(
  samples: readonly LocalObservedHeadwaySample[],
): Map<string, LocalObservedHeadwaySample[]> {
  const output = new Map<string, LocalObservedHeadwaySample[]>();

  for (const sample of samples) {
    const group = output.get(sample.routeId) ?? [];
    group.push(sample);
    output.set(sample.routeId, group);
  }

  return output;
}

function monthTimeBounds(isoMonth: string): { startSeconds: number; endSeconds: number } {
  const [yearValue, monthValue] = isoMonth.split("-");
  const year = Number(yearValue);
  const month = Number(monthValue);
  const startSeconds = Date.UTC(year, month - 1, 1, 0, 0, 0) / 1000;
  const endSeconds = Date.UTC(year, month, 1, 0, 0, 0) / 1000;

  return { startSeconds, endSeconds };
}

function samplesForMonth(
  samples: readonly LocalObservedHeadwaySample[],
  isoMonth: string,
): LocalObservedHeadwaySample[] {
  const bounds = monthTimeBounds(isoMonth);

  return samples.filter(
    (sample) =>
      sample.observedTimestamp >= bounds.startSeconds &&
      sample.observedTimestamp < bounds.endSeconds,
  );
}

function expectedWaitMinutes(headwayMinutes: readonly number[]): number | null {
  const sum = headwayMinutes.reduce((total, value) => total + value, 0);
  if (sum <= 0) {
    return null;
  }

  return round(headwayMinutes.reduce((total, value) => total + value ** 2, 0) / (2 * sum));
}

function sourceStatusForSampleCount(sampleCount: number, minSampleThreshold: number): string {
  return sampleCount >= minSampleThreshold ? "available" : "insufficient_gtfs_rt_samples";
}

function buildSummary(input: {
  routeId: string;
  month: string;
  runId: string;
  samples: readonly LocalObservedHeadwaySample[];
  baseline: LocalRouteReliabilityBaseline | undefined;
  minSampleThreshold: number;
}): RouteReliabilitySummary {
  const headwayMinutes = input.samples
    .map((sample) => sample.headwayMinutes)
    .filter((value) => value > 0)
    .sort((left, right) => left - right);
  const sampleCount = headwayMinutes.length;
  const stopCount = new Set(input.samples.map((sample) => sample.stopId)).size;
  const directionCount = new Set(input.samples.map((sample) => sample.directionId ?? "unknown"))
    .size;
  const scheduledMedianHeadwayMinutes = input.baseline?.medianScheduledHeadwayMinutes ?? null;
  const bunchingThresholdMinutes =
    scheduledMedianHeadwayMinutes === null
      ? fallbackBunchingThresholdMinutes
      : round(scheduledMedianHeadwayMinutes * 0.5);
  const longGapThresholdMinutes =
    scheduledMedianHeadwayMinutes === null
      ? fallbackLongGapThresholdMinutes
      : round(scheduledMedianHeadwayMinutes * 2);
  const observedBunchingShare =
    sampleCount === 0
      ? null
      : round(
          headwayMinutes.filter((headway) => headway <= bunchingThresholdMinutes).length /
            sampleCount,
        );
  const observedLongGapShare =
    sampleCount === 0
      ? null
      : round(
          headwayMinutes.filter((headway) => headway >= longGapThresholdMinutes).length /
            sampleCount,
        );
  const expectedWait = expectedWaitMinutes(headwayMinutes);
  const scheduledExpectedWaitMinutes =
    scheduledMedianHeadwayMinutes === null ? null : round(scheduledMedianHeadwayMinutes / 2);

  return {
    routeId: input.routeId,
    month: input.month,
    runId: input.runId,
    reliabilityStatus:
      sampleCount >= input.minSampleThreshold ? "observed" : "insufficient_gtfs_rt_samples",
    minSampleThreshold: input.minSampleThreshold,
    sampleCount,
    stopCount,
    directionCount,
    averageObservedHeadwayMinutes:
      sampleCount === 0
        ? null
        : round(headwayMinutes.reduce((sum, value) => sum + value, 0) / sampleCount),
    medianObservedHeadwayMinutes:
      sampleCount === 0 ? null : round(quantile(headwayMinutes, 0.5) ?? 0),
    p90ObservedHeadwayMinutes: sampleCount === 0 ? null : round(quantile(headwayMinutes, 0.9) ?? 0),
    maxObservedHeadwayMinutes: sampleCount === 0 ? null : round(Math.max(...headwayMinutes)),
    scheduledMedianHeadwayMinutes,
    bunchingThresholdMinutes,
    longGapThresholdMinutes,
    observedBunchingShare,
    observedLongGapShare,
    expectedWaitMinutes: expectedWait,
    scheduledExpectedWaitMinutes,
    excessWaitMinutes:
      expectedWait === null || scheduledExpectedWaitMinutes === null
        ? null
        : round(expectedWait - scheduledExpectedWaitMinutes),
    waitReliabilityRatio:
      expectedWait === null ||
      scheduledExpectedWaitMinutes === null ||
      scheduledExpectedWaitMinutes === 0
        ? null
        : round(expectedWait / scheduledExpectedWaitMinutes),
  };
}

function sourceStatusesForSummary(summary: RouteReliabilitySummary) {
  const status = sourceStatusForSampleCount(summary.sampleCount, summary.minSampleThreshold);
  const note = `${summary.sampleCount} observed headway samples; minimum ${summary.minSampleThreshold}`;

  return ["observedHeadways", "bunching", "waitTimeReliability"].map((sourceId) => ({
    routeId: summary.routeId,
    month: summary.month,
    sourceScope: "reliability",
    sourceId,
    status,
    rowCount: summary.sampleCount,
    snapshotId: summary.runId,
    note,
  }));
}

function parseCliArgs(args: string[]): RouteObservedReliabilityArgs {
  const extraOptions: CliOption<RouteObservedReliabilityArgs>[] = [
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.runId = value;
        }
      },
    },
    numberOption(["--min-samples"], (output, value) => {
      output.minSamples = value;
    }),
  ];

  return parseMonthDbCliArgs(args, {} as RouteObservedReliabilityArgs, extraOptions);
}

export async function buildRouteObservedReliability(
  args: RouteObservedReliabilityArgs = {},
): Promise<RouteObservedReliabilityResult> {
  const options = createMonthContext(args);
  const runId = requireRunId(args.runId);
  const minSampleThreshold = Math.max(1, Math.round(args.minSamples ?? defaultMinSampleThreshold));

  const summaries = await withLocalPipelineDb(options.dbPath, async (local) => {
    const [routes, baselines, samples] = await Promise.all([
      listRouteBriefSummaries(local.db, options.isoMonth),
      listRouteReliabilityBaselines(local.db, options.isoMonth),
      listObservedHeadwaySamples(local.db, runId),
    ]);
    const samplesByRoute = groupSamplesByRoute(samplesForMonth(samples, options.isoMonth));
    const baselineByRoute = new Map(baselines.map((baseline) => [baseline.routeId, baseline]));

    return routes.map((route) =>
      buildSummary({
        routeId: route.routeId,
        month: options.isoMonth,
        runId,
        samples: samplesByRoute.get(route.routeId) ?? [],
        baseline: baselineByRoute.get(route.routeId),
        minSampleThreshold,
      }),
    );
  });

  await withLocalPipelineDb(options.dbPath, (local) =>
    replaceRouteObservedReliabilityRows(local.db, options.isoMonth, runId, {
      summaries,
      sourceStatuses: summaries.flatMap(sourceStatusesForSummary),
    }),
  );

  return {
    isoMonth: options.isoMonth,
    runId,
    routeCount: summaries.length,
    observedRouteCount: summaries.filter((summary) => summary.reliabilityStatus === "observed")
      .length,
    insufficientRouteCount: summaries.filter(
      (summary) => summary.reliabilityStatus === "insufficient_gtfs_rt_samples",
    ).length,
    headwaySampleCount: summaries.reduce((sum, summary) => sum + summary.sampleCount, 0),
  };
}

export async function buildRouteObservedReliabilityFromCli(
  args: string[],
): Promise<RouteObservedReliabilityResult> {
  return buildRouteObservedReliability(parseCliArgs(args));
}

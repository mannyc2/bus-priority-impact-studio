import type {
  LocalObservedHeadwaySample,
  LocalPipelineDb,
  LocalRouteReliabilityBaseline,
} from "@bp/db/local";
import {
  listObservedHeadwaySamples,
  listRouteBriefSummaries,
  listRouteCatalog,
  listRouteReliabilityBaselines,
  replaceRouteObservedReliabilityRows,
} from "@bp/db/local";

const fallbackBunchingThresholdMinutes = 3;
const fallbackLongGapThresholdMinutes = 20;

export const defaultObservedReliabilityMinSampleThreshold = 30;

export type ReliabilityStatus = "observed" | "insufficient_gtfs_rt_samples";

export type RouteReliabilitySummary = {
  routeId: string;
  month: string;
  runId: string;
  reliabilityStatus: ReliabilityStatus;
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

export type RouteObservedReliabilityResult = {
  isoMonth: string;
  runId: string;
  routeCount: number;
  observedRouteCount: number;
  insufficientRouteCount: number;
  headwaySampleCount: number;
};

function isoMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function normalizeRouteIdText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  if (trimmed.length === 0) return null;
  return trimmed.replace(/^([A-Z]+)0+([1-9][0-9]*)$/, "$1$2");
}

function canonicalRouteId(value: unknown, routeUniverse: ReadonlySet<string>): string | null {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : null;
  if (raw === null || raw.length === 0) return null;
  if (routeUniverse.has(raw)) return raw;

  const normalized = normalizeRouteIdText(raw);
  if (normalized === null) return null;
  return routeUniverse.has(normalized) ? normalized : normalized;
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function quantile(sortedValues: readonly number[], q: number): number | null {
  if (sortedValues.length === 0) return null;
  if (sortedValues.length === 1) return sortedValues[0] ?? null;
  const position = (sortedValues.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = sortedValues[lower] ?? 0;
  const upperValue = sortedValues[upper] ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * (position - lower);
}

function monthTimeBounds(month: string): { startSeconds: number; endSeconds: number } {
  const [yearValue, monthValue] = month.split("-");
  const year = Number(yearValue);
  const monthNum = Number(monthValue);
  return {
    startSeconds: Date.UTC(year, monthNum - 1, 1, 0, 0, 0) / 1000,
    endSeconds: Date.UTC(year, monthNum, 1, 0, 0, 0) / 1000,
  };
}

function samplesForMonth(
  samples: readonly LocalObservedHeadwaySample[],
  month: string,
): LocalObservedHeadwaySample[] {
  const bounds = monthTimeBounds(month);
  return samples.filter(
    (sample) =>
      sample.observedTimestamp >= bounds.startSeconds &&
      sample.observedTimestamp < bounds.endSeconds,
  );
}

function groupSamplesByRoute(
  samples: readonly LocalObservedHeadwaySample[],
  routeUniverse: ReadonlySet<string>,
): Map<string, LocalObservedHeadwaySample[]> {
  const out = new Map<string, LocalObservedHeadwaySample[]>();
  for (const sample of samples) {
    const routeId = canonicalRouteId(sample.routeId, routeUniverse);
    if (routeId === null || !routeUniverse.has(routeId)) continue;
    const group = out.get(routeId) ?? [];
    group.push(sample);
    out.set(routeId, group);
  }
  return out;
}

function expectedWaitMinutes(headwayMinutes: readonly number[]): number | null {
  const sum = headwayMinutes.reduce((total, value) => total + value, 0);
  if (sum <= 0) return null;
  return round(headwayMinutes.reduce((total, value) => total + value ** 2, 0) / (2 * sum));
}

export function buildSummary(input: {
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
  const status =
    summary.sampleCount >= summary.minSampleThreshold
      ? "available"
      : "insufficient_gtfs_rt_samples";
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

export async function runRouteObservedReliability(inputs: {
  local: { db: LocalPipelineDb };
  year: number;
  month: number;
  runId: string;
  minSamples: number;
}): Promise<RouteObservedReliabilityResult> {
  const month = isoMonth(inputs.year, inputs.month);
  const [briefs, catalog, baselines, samples] = await Promise.all([
    listRouteBriefSummaries(inputs.local.db, month),
    listRouteCatalog(inputs.local.db),
    listRouteReliabilityBaselines(inputs.local.db, month),
    listObservedHeadwaySamples(inputs.local.db, inputs.runId),
  ]);

  const routes = (briefs.length > 0 ? briefs : catalog)
    .map((route) => ({ routeId: route.routeId }))
    .sort((left, right) => left.routeId.localeCompare(right.routeId));
  const routeUniverse = new Set(routes.map((route) => route.routeId));
  const samplesByRoute = groupSamplesByRoute(samplesForMonth(samples, month), routeUniverse);
  const baselineByRoute = new Map(baselines.map((baseline) => [baseline.routeId, baseline]));

  const summaries = routes.map((route) =>
    buildSummary({
      routeId: route.routeId,
      month,
      runId: inputs.runId,
      samples: samplesByRoute.get(route.routeId) ?? [],
      baseline: baselineByRoute.get(route.routeId),
      minSampleThreshold: inputs.minSamples,
    }),
  );

  await replaceRouteObservedReliabilityRows(inputs.local.db, month, inputs.runId, {
    summaries,
    sourceStatuses: summaries.flatMap(sourceStatusesForSummary),
  });

  return {
    isoMonth: month,
    runId: inputs.runId,
    routeCount: summaries.length,
    observedRouteCount: summaries.filter((summary) => summary.reliabilityStatus === "observed")
      .length,
    insufficientRouteCount: summaries.filter(
      (summary) => summary.reliabilityStatus === "insufficient_gtfs_rt_samples",
    ).length,
    headwaySampleCount: summaries.reduce((sum, summary) => sum + summary.sampleCount, 0),
  };
}

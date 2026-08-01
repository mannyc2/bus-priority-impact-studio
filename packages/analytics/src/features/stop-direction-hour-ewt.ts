import type { FeatureQuality } from "./quality.js";
import type { StopDirectionHourFeature } from "./stop-direction-hour.js";
import { stopDirectionHourFeatureKey } from "./stop-direction-hour.js";

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

type HeadwayIrregularityRates = {
  pairCount: number;
  bunchingPairCount: number;
  gapPairCount: number;
  bunchingShare: number | null;
  gapShare: number | null;
  ratios: number[];
};

type HeadwayIrregularityOptions = {
  bunchingRatio: number;
  gapRatio: number;
};

const DEFAULT_HEADWAY_IRREGULARITY_OPTIONS: HeadwayIrregularityOptions = {
  bunchingRatio: 0.25,
  gapRatio: 2,
};

function finiteNonnegativeValues(values: readonly number[]): number[] {
  return values.filter((value) => Number.isFinite(value) && value >= 0);
}

function headwayIrregularityRates(
  headwaysMinutes: readonly number[],
  scheduledHeadwayMinutes: number | null,
  options: Partial<HeadwayIrregularityOptions> = {},
): HeadwayIrregularityRates {
  const thresholds = { ...DEFAULT_HEADWAY_IRREGULARITY_OPTIONS, ...options };
  if (
    scheduledHeadwayMinutes === null ||
    !Number.isFinite(scheduledHeadwayMinutes) ||
    scheduledHeadwayMinutes <= 0
  ) {
    return {
      pairCount: 0,
      bunchingPairCount: 0,
      gapPairCount: 0,
      bunchingShare: null,
      gapShare: null,
      ratios: [],
    };
  }

  const ratios = finiteNonnegativeValues(headwaysMinutes).map(
    (headway) => headway / scheduledHeadwayMinutes,
  );
  const pairCount = ratios.length;
  if (pairCount === 0) {
    return {
      pairCount,
      bunchingPairCount: 0,
      gapPairCount: 0,
      bunchingShare: null,
      gapShare: null,
      ratios,
    };
  }

  const bunchingPairCount = ratios.filter((ratio) => ratio < thresholds.bunchingRatio).length;
  const gapPairCount = ratios.filter((ratio) => ratio > thresholds.gapRatio).length;

  return {
    pairCount,
    bunchingPairCount,
    gapPairCount,
    bunchingShare: bunchingPairCount / pairCount,
    gapShare: gapPairCount / pairCount,
    ratios,
  };
}

export type ScheduleStopArrivalForStopDirectionHourEwt = {
  routeId: string;
  dayType: string;
  direction: string;
  stopId: string;
  stopName: string | null;
  scheduleDate: string;
  scheduleTime: string;
};

export type ScheduleTimepointForStopDirectionHourEwt = ScheduleStopArrivalForStopDirectionHourEwt;

export type ObservedHeadwayForStopDirectionHourEwt = {
  routeId: string;
  direction: string | null;
  stopId: string;
  stopName: string | null;
  observedTimestamp: number;
  headwayMinutes: number;
};

export type StopDirectionHourScheduleBaseline = {
  routeId: string;
  dayType: string;
  direction: string;
  stopId: string;
  stopName: string | null;
  localHour: number;
  serviceDayCount: number;
  scheduledArrivalCount: number;
  scheduledHeadwaySampleCount: number;
  scheduledBusesPerHour: number;
  scheduledHeadwayMinutes: number | null;
  scheduledHeadwaysMinutes: number[];
};

export type StopDirectionHourEwtAuditRow = {
  featureKey: string;
  routeId: string;
  stopId: string;
  stopName: string;
  direction: string;
  serviceDate: string;
  dayType: string;
  localHour: number;
  observedHeadwayCount: number;
  scheduledBusesPerHour: number | null;
  scheduledHeadwayMinutes: number | null;
  coverageStatus: FeatureQuality["coverageStatus"];
  coverageShare: number | null;
  sampleStatus: FeatureQuality["sampleStatus"];
  missingDataState: "ready" | "baseline_unavailable" | "insufficient_headways" | "low_coverage";
};

export type StopDirectionHourEwtFeatureBuildSummary = {
  scheduleTimepointCount: number;
  observedHeadwaySampleCount: number;
  scheduleBaselineCount: number;
  featureCount: number;
  readyFeatureCount: number;
  baselineUnavailableCount: number;
  insufficientHeadwayCount: number;
  lowCoverageCount: number;
};

export type StopDirectionHourEwtFeatureBuildResult = {
  timezone: string;
  scheduleBaselines: StopDirectionHourScheduleBaseline[];
  features: StopDirectionHourFeature[];
  auditRows: StopDirectionHourEwtAuditRow[];
  summary: StopDirectionHourEwtFeatureBuildSummary;
};

export type StopDirectionHourEwtFeatureBuildOptions = {
  timezone?: string | undefined;
  analysisMonth?: string | undefined;
  observedAggregation?: "service_date_hour" | "month_day_type_hour" | undefined;
  minHeadways?: number | undefined;
  minCoverageShare?: number | undefined;
  maxScheduledHeadwayMinutes?: number | undefined;
};

const defaultOptions = {
  timezone: "America/New_York",
  analysisMonth: null as string | null,
  observedAggregation: "service_date_hour" as "service_date_hour" | "month_day_type_hour",
  minHeadways: 10,
  minCoverageShare: 0.5,
  maxScheduledHeadwayMinutes: 240,
};

type ResolvedOptions = typeof defaultOptions;

type DailyScheduleGroup = {
  routeId: string;
  dayType: string;
  direction: string;
  stopId: string;
  stopName: string | null;
  scheduleDate: string;
  times: number[];
};

type ScheduleBaselineAccumulator = {
  routeId: string;
  dayType: string;
  direction: string;
  stopId: string;
  stopName: string | null;
  localHour: number;
  serviceDates: Set<string>;
  scheduledArrivalCount: number;
  scheduledHeadwaysMinutes: number[];
};

type ObservedHeadwayGroup = {
  routeId: string;
  direction: string;
  stopId: string;
  stopName: string | null;
  serviceDate: string;
  dayType: string;
  localHour: number;
  serviceDates: Set<string>;
  headwaysMinutes: number[];
};

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function scheduleDateKey(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (match === null) {
    throw new Error(`Invalid schedule date: ${value}`);
  }
  return match[1] ?? value;
}

function utcHourFromIso(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid schedule time: ${value}`);
  }
  return new Date(parsed).getUTCHours();
}

function dayTypeFromServiceDate(serviceDate: string): string {
  const day = new Date(`${serviceDate}T12:00:00Z`).getUTCDay();
  if (day === 0) return "Sunday";
  if (day === 6) return "Saturday";
  return "Weekday";
}

const localDatePartFormatters = new Map<string, Intl.DateTimeFormat>();

function localDateParts(
  timestampSeconds: number,
  timezone: string,
): { date: string; hour: number } {
  let formatter = localDatePartFormatters.get(timezone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    });
    localDatePartFormatters.set(timezone, formatter);
  }
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(timestampSeconds * 1000))
      .map((part) => [part.type, part.value]),
  );
  const year = parts["year"];
  const month = parts["month"];
  const day = parts["day"];
  const hour = parts["hour"];
  if (year === undefined || month === undefined || day === undefined || hour === undefined) {
    throw new Error(`Could not derive local date parts for timestamp ${timestampSeconds}`);
  }
  return { date: `${year}-${month}-${day}`, hour: Number(hour) };
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const left = sorted[mid - 1] ?? 0;
  const right = sorted[mid] ?? left;
  return (left + right) / 2;
}

function dailyScheduleKey(row: ScheduleTimepointForStopDirectionHourEwt): string {
  return [
    row.routeId,
    row.dayType,
    row.direction,
    row.stopId,
    scheduleDateKey(row.scheduleDate),
  ].join("\0");
}

function baselineKey(input: {
  routeId: string;
  dayType: string;
  direction: string;
  stopId: string;
  localHour: number;
}): string {
  return [
    input.routeId,
    input.dayType,
    input.direction,
    input.stopId,
    String(input.localHour).padStart(2, "0"),
  ].join("\0");
}

function observedKey(input: {
  routeId: string;
  direction: string;
  stopId: string;
  serviceDate: string;
  localHour: number;
}): string {
  return [
    input.routeId,
    input.direction,
    input.stopId,
    input.serviceDate,
    String(input.localHour).padStart(2, "0"),
  ].join("\0");
}

function buildScheduleBaselines(
  rows: readonly ScheduleStopArrivalForStopDirectionHourEwt[],
  options: ResolvedOptions,
): StopDirectionHourScheduleBaseline[] {
  const dailyGroups = new Map<string, DailyScheduleGroup>();
  for (const row of rows) {
    const parsedTime = Date.parse(row.scheduleTime);
    if (!Number.isFinite(parsedTime)) continue;
    const key = dailyScheduleKey(row);
    const group =
      dailyGroups.get(key) ??
      ({
        routeId: row.routeId,
        dayType: row.dayType,
        direction: row.direction,
        stopId: row.stopId,
        stopName: row.stopName,
        scheduleDate: scheduleDateKey(row.scheduleDate),
        times: [],
      } satisfies DailyScheduleGroup);
    group.times.push(parsedTime);
    dailyGroups.set(key, group);
  }

  const baselines = new Map<string, ScheduleBaselineAccumulator>();
  for (const group of dailyGroups.values()) {
    const uniqueTimes = [...new Set(group.times)].sort((left, right) => left - right);
    for (const time of uniqueTimes) {
      const localHour = utcHourFromIso(new Date(time).toISOString());
      const key = baselineKey({ ...group, localHour });
      const baseline =
        baselines.get(key) ??
        ({
          routeId: group.routeId,
          dayType: group.dayType,
          direction: group.direction,
          stopId: group.stopId,
          stopName: group.stopName,
          localHour,
          serviceDates: new Set<string>(),
          scheduledArrivalCount: 0,
          scheduledHeadwaysMinutes: [],
        } satisfies ScheduleBaselineAccumulator);
      baseline.serviceDates.add(group.scheduleDate);
      baseline.scheduledArrivalCount += 1;
      baselines.set(key, baseline);
    }

    for (let index = 1; index < uniqueTimes.length; index += 1) {
      const current = uniqueTimes[index];
      const previous = uniqueTimes[index - 1];
      if (current === undefined || previous === undefined) continue;
      const headway = (current - previous) / 60_000;
      if (!finitePositive(headway) || headway > options.maxScheduledHeadwayMinutes) continue;
      const localHour = utcHourFromIso(new Date(current).toISOString());
      const key = baselineKey({ ...group, localHour });
      const baseline = baselines.get(key);
      if (baseline !== undefined) {
        baseline.scheduledHeadwaysMinutes.push(headway);
      }
    }
  }

  return [...baselines.values()]
    .map((baseline) => {
      const serviceDayCount = baseline.serviceDates.size;
      const scheduledBusesPerHour =
        serviceDayCount === 0 ? 0 : baseline.scheduledArrivalCount / serviceDayCount;
      const scheduledHeadwayMedian = median(baseline.scheduledHeadwaysMinutes);
      return {
        routeId: baseline.routeId,
        dayType: baseline.dayType,
        direction: baseline.direction,
        stopId: baseline.stopId,
        stopName: baseline.stopName,
        localHour: baseline.localHour,
        serviceDayCount,
        scheduledArrivalCount: baseline.scheduledArrivalCount,
        scheduledHeadwaySampleCount: baseline.scheduledHeadwaysMinutes.length,
        scheduledBusesPerHour: round(scheduledBusesPerHour, 4),
        scheduledHeadwayMinutes:
          scheduledHeadwayMedian === null
            ? scheduledBusesPerHour > 0
              ? round(60 / scheduledBusesPerHour, 4)
              : null
            : round(scheduledHeadwayMedian, 4),
        scheduledHeadwaysMinutes: baseline.scheduledHeadwaysMinutes
          .map((value) => round(value, 4))
          .sort((left, right) => left - right),
      } satisfies StopDirectionHourScheduleBaseline;
    })
    .sort(
      (left, right) =>
        left.routeId.localeCompare(right.routeId) ||
        left.dayType.localeCompare(right.dayType) ||
        left.direction.localeCompare(right.direction) ||
        left.stopId.localeCompare(right.stopId) ||
        left.localHour - right.localHour,
    );
}

function buildObservedGroups(
  rows: readonly ObservedHeadwayForStopDirectionHourEwt[],
  options: ResolvedOptions,
): ObservedHeadwayGroup[] {
  const groups = new Map<string, ObservedHeadwayGroup>();
  for (const row of rows) {
    if (row.direction === null || !finitePositive(row.headwayMinutes)) continue;
    const parts = localDateParts(row.observedTimestamp, options.timezone);
    const dayType = dayTypeFromServiceDate(parts.date);
    const serviceDate =
      options.observedAggregation === "month_day_type_hour"
        ? `${options.analysisMonth ?? parts.date.slice(0, 7)}:${dayType}`
        : parts.date;
    const key = observedKey({
      routeId: row.routeId,
      direction: row.direction,
      stopId: row.stopId,
      serviceDate,
      localHour: parts.hour,
    });
    const group =
      groups.get(key) ??
      ({
        routeId: row.routeId,
        direction: row.direction,
        stopId: row.stopId,
        stopName: row.stopName,
        serviceDate,
        dayType,
        localHour: parts.hour,
        serviceDates: new Set<string>(),
        headwaysMinutes: [],
      } satisfies ObservedHeadwayGroup);
    group.serviceDates.add(parts.date);
    group.headwaysMinutes.push(row.headwayMinutes);
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (left, right) =>
      left.routeId.localeCompare(right.routeId) ||
      left.direction.localeCompare(right.direction) ||
      left.stopId.localeCompare(right.stopId) ||
      left.serviceDate.localeCompare(right.serviceDate) ||
      left.localHour - right.localHour,
  );
}

function qualityForGroup(input: {
  observedCount: number;
  expectedCount: number | null;
  minHeadways: number;
  minCoverageShare: number;
}): FeatureQuality {
  const coverageShare =
    input.expectedCount === null || input.expectedCount <= 0
      ? null
      : Math.min(1, input.observedCount / input.expectedCount);
  const coverageStatus: FeatureQuality["coverageStatus"] =
    coverageShare === null
      ? "complete"
      : coverageShare < input.minCoverageShare
        ? "low_coverage"
        : coverageShare < 0.95
          ? "partial"
          : "complete";
  const sampleStatus: FeatureQuality["sampleStatus"] =
    input.observedCount === 0
      ? "missing_samples"
      : input.observedCount < input.minHeadways
        ? "insufficient_samples"
        : "supported";

  return {
    coverageStatus,
    observedCount: input.observedCount,
    expectedCount: input.expectedCount,
    coverageShare: coverageShare === null ? null : round(coverageShare, 4),
    freshnessStatus: "not_expected",
    sampleCount: input.observedCount,
    minSampleCount: input.minHeadways,
    sampleStatus,
  };
}

function missingDataState(input: {
  baseline: StopDirectionHourScheduleBaseline | undefined;
  quality: FeatureQuality;
}): StopDirectionHourEwtAuditRow["missingDataState"] {
  if (input.baseline === undefined) return "baseline_unavailable";
  if (input.quality.sampleStatus !== "supported") return "insufficient_headways";
  if (input.quality.coverageStatus === "low_coverage") return "low_coverage";
  return "ready";
}

export function buildStopDirectionHourEwtFeatures(input: {
  scheduleArrivals?: readonly ScheduleStopArrivalForStopDirectionHourEwt[] | undefined;
  scheduleTimepoints?: readonly ScheduleTimepointForStopDirectionHourEwt[] | undefined;
  observedHeadways: readonly ObservedHeadwayForStopDirectionHourEwt[];
  options?: StopDirectionHourEwtFeatureBuildOptions | undefined;
}): StopDirectionHourEwtFeatureBuildResult {
  const optionOverrides = input.options ?? {};
  const options: ResolvedOptions = {
    timezone: optionOverrides.timezone ?? defaultOptions.timezone,
    analysisMonth: optionOverrides.analysisMonth ?? defaultOptions.analysisMonth,
    observedAggregation: optionOverrides.observedAggregation ?? defaultOptions.observedAggregation,
    minHeadways: optionOverrides.minHeadways ?? defaultOptions.minHeadways,
    minCoverageShare: optionOverrides.minCoverageShare ?? defaultOptions.minCoverageShare,
    maxScheduledHeadwayMinutes:
      optionOverrides.maxScheduledHeadwayMinutes ?? defaultOptions.maxScheduledHeadwayMinutes,
  };
  const scheduleRows = input.scheduleArrivals ?? input.scheduleTimepoints ?? [];
  const scheduleBaselines = buildScheduleBaselines(scheduleRows, options);
  const baselineByKey = new Map(
    scheduleBaselines.map((baseline) => [baselineKey(baseline), baseline] as const),
  );
  const observedGroups = buildObservedGroups(input.observedHeadways, options);
  const features: StopDirectionHourFeature[] = [];
  const auditRows: StopDirectionHourEwtAuditRow[] = [];

  for (const group of observedGroups) {
    const baseline = baselineByKey.get(baselineKey(group));
    const expectedCount =
      baseline === undefined ? null : baseline.scheduledBusesPerHour * group.serviceDates.size;
    const quality = qualityForGroup({
      observedCount: group.headwaysMinutes.length,
      expectedCount,
      minHeadways: options.minHeadways,
      minCoverageShare: options.minCoverageShare,
    });
    const rates = headwayIrregularityRates(
      group.headwaysMinutes,
      baseline?.scheduledHeadwayMinutes ?? null,
    );
    const stopName = group.stopName ?? baseline?.stopName ?? group.stopId;
    const feature: StopDirectionHourFeature = {
      routeId: group.routeId,
      stopId: group.stopId,
      stopName,
      direction: group.direction,
      serviceDate: group.serviceDate,
      localHour: group.localHour,
      timezone: options.timezone,
      scheduledHeadwayMinutes: baseline?.scheduledHeadwayMinutes ?? null,
      scheduledBusesPerHour: baseline?.scheduledBusesPerHour ?? null,
      observedHeadwaysMinutes: group.headwaysMinutes
        .map((value) => round(value, 4))
        .sort((left, right) => left - right),
      observedPairCount: group.headwaysMinutes.length,
      bunchingPairCount: rates.bunchingPairCount,
      gapPairCount: rates.gapPairCount,
      quality,
    };
    features.push(feature);
    auditRows.push({
      featureKey: stopDirectionHourFeatureKey(feature),
      routeId: group.routeId,
      stopId: group.stopId,
      stopName,
      direction: group.direction,
      serviceDate: group.serviceDate,
      dayType: group.dayType,
      localHour: group.localHour,
      observedHeadwayCount: group.headwaysMinutes.length,
      scheduledBusesPerHour: baseline?.scheduledBusesPerHour ?? null,
      scheduledHeadwayMinutes: baseline?.scheduledHeadwayMinutes ?? null,
      coverageStatus: quality.coverageStatus,
      coverageShare: quality.coverageShare,
      sampleStatus: quality.sampleStatus,
      missingDataState: missingDataState({ baseline, quality }),
    });
  }

  const readyFeatureCount = auditRows.filter((row) => row.missingDataState === "ready").length;
  return {
    timezone: options.timezone,
    scheduleBaselines,
    features,
    auditRows,
    summary: {
      scheduleTimepointCount: scheduleRows.length,
      observedHeadwaySampleCount: input.observedHeadways.length,
      scheduleBaselineCount: scheduleBaselines.length,
      featureCount: features.length,
      readyFeatureCount,
      baselineUnavailableCount: auditRows.filter(
        (row) => row.missingDataState === "baseline_unavailable",
      ).length,
      insufficientHeadwayCount: auditRows.filter(
        (row) => row.missingDataState === "insufficient_headways",
      ).length,
      lowCoverageCount: auditRows.filter((row) => row.missingDataState === "low_coverage").length,
    },
  };
}

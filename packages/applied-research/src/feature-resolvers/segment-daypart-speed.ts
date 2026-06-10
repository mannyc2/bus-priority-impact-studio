import type { SegmentDaypartFeature } from "@bp/analytics/features";

export type SegmentDaypartSpeedSourceRow = {
  readonly route_id: unknown;
  readonly month: unknown;
  readonly hour_of_day: unknown;
  readonly direction: unknown;
  readonly stop_order: unknown;
  readonly timepoint_stop_id: unknown;
  readonly next_timepoint_stop_id: unknown;
  readonly road_distance_miles: unknown;
  readonly average_travel_time_minutes: unknown;
  readonly average_road_speed_mph: unknown;
  readonly bus_trip_count: unknown;
};

export type SegmentDaypartFeatureResolverSummary = {
  readonly sourceRowCount: number;
  readonly featureCount: number;
  readonly routeCount: number;
  readonly monthCount: number;
  readonly skippedInvalidRowCount: number;
};

export type SegmentDaypartFeatureResolverResult = {
  readonly features: SegmentDaypartFeature[];
  readonly summary: SegmentDaypartFeatureResolverSummary;
};

type GroupAccumulator = {
  routeId: string;
  month: string;
  segmentId: string;
  direction: string;
  daypart: string;
  stopOrder: number;
  paceValues: number[];
  speedValues: number[];
  distanceMiles: number[];
  sourceRowCount: number;
  traversalCount: number;
};

function directionMaxKey(input: {
  readonly routeId: string;
  readonly month: string;
  readonly direction: string;
}): string {
  return [input.routeId, input.month, input.direction].join("\0");
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function daypartForHour(hour: number): string {
  if (hour >= 6 && hour <= 9) return "am_peak";
  if (hour >= 10 && hour <= 15) return "midday";
  if (hour >= 16 && hour <= 19) return "pm_peak";
  return "off_peak";
}

function percentile(values: readonly number[], percentileValue: number): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * percentileValue;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  if (lower === undefined) return null;
  if (upper === undefined || lowerIndex === upperIndex) return lower;
  return lower + (upper - lower) * (position - lowerIndex);
}

function median(values: readonly number[]): number | null {
  return percentile(values, 0.5);
}

function groupKey(input: {
  readonly routeId: string;
  readonly month: string;
  readonly direction: string;
  readonly segmentId: string;
  readonly daypart: string;
}): string {
  return [input.routeId, input.month, input.direction, input.segmentId, input.daypart].join("\0");
}

function baselineKey(input: {
  readonly routeId: string;
  readonly month: string;
  readonly direction: string;
  readonly segmentId: string;
}): string {
  return [input.routeId, input.month, input.direction, input.segmentId].join("\0");
}

export function segmentIdForSpeedRow(row: SegmentDaypartSpeedSourceRow): string | null {
  const routeId = text(row.route_id);
  const direction = text(row.direction);
  const stopOrder = numberValue(row.stop_order);
  const fromStop = text(row.timepoint_stop_id);
  const toStop = text(row.next_timepoint_stop_id);
  if (
    routeId === null ||
    direction === null ||
    stopOrder === null ||
    fromStop === null ||
    toStop === null
  ) {
    return null;
  }
  return [routeId, direction, String(stopOrder), fromStop, toStop].join(":");
}

export function buildSegmentDaypartFeaturesFromSpeedRows(input: {
  readonly rows: readonly SegmentDaypartSpeedSourceRow[];
  readonly minSampleCount?: number;
}): SegmentDaypartFeatureResolverResult {
  const minSampleCount = input.minSampleCount ?? 15;
  const groups = new Map<string, GroupAccumulator>();
  const baselines = new Map<string, number[]>();
  // Per-(route, month, direction) maximum stop order, used to flag first/last terminal segments.
  const directionMaxStopOrder = new Map<string, number>();
  const routeIds = new Set<string>();
  const months = new Set<string>();
  let skippedInvalidRowCount = 0;

  for (const row of input.rows) {
    const routeId = text(row.route_id);
    const month = text(row.month);
    const direction = text(row.direction);
    const hour = numberValue(row.hour_of_day);
    const segmentId = segmentIdForSpeedRow(row);
    const stopOrder = numberValue(row.stop_order);
    const distance = numberValue(row.road_distance_miles);
    const travelTime = numberValue(row.average_travel_time_minutes);
    const speed = numberValue(row.average_road_speed_mph);
    const tripCount = numberValue(row.bus_trip_count) ?? 0;
    if (
      routeId === null ||
      month === null ||
      direction === null ||
      hour === null ||
      segmentId === null ||
      stopOrder === null ||
      distance === null ||
      travelTime === null ||
      distance <= 0 ||
      travelTime <= 0
    ) {
      skippedInvalidRowCount += 1;
      continue;
    }
    const daypart = daypartForHour(hour);
    const pace = travelTime / distance;
    const key = groupKey({ routeId, month, direction, segmentId, daypart });
    const baseline = baselineKey({ routeId, month, direction, segmentId });
    const maxKey = directionMaxStopOrder.get(directionMaxKey({ routeId, month, direction }));
    directionMaxStopOrder.set(
      directionMaxKey({ routeId, month, direction }),
      Math.max(maxKey ?? stopOrder, stopOrder),
    );
    const current =
      groups.get(key) ??
      ({
        routeId,
        month,
        segmentId,
        direction,
        daypart,
        stopOrder,
        paceValues: [],
        speedValues: [],
        distanceMiles: [],
        sourceRowCount: 0,
        traversalCount: 0,
      } satisfies GroupAccumulator);
    current.paceValues.push(pace);
    if (speed !== null && speed > 0) current.speedValues.push(speed);
    current.distanceMiles.push(distance);
    current.sourceRowCount += 1;
    current.traversalCount += tripCount;
    groups.set(key, current);

    const baselineValues = baselines.get(baseline) ?? [];
    baselineValues.push(pace);
    baselines.set(baseline, baselineValues);
    routeIds.add(routeId);
    months.add(month);
  }

  const features = [...groups.values()]
    .map((group) => {
      const freeFlowPace = percentile(
        baselines.get(
          baselineKey({
            routeId: group.routeId,
            month: group.month,
            direction: group.direction,
            segmentId: group.segmentId,
          }),
        ) ?? [],
        0.15,
      );
      const medianPace = median(group.paceValues);
      const p95Pace = percentile(group.paceValues, 0.95);
      const medianSpeed = median(group.speedValues);
      const medianDistanceMiles = median(group.distanceMiles);
      const sampleStatus =
        group.traversalCount >= minSampleCount ? "supported" : "insufficient_samples";
      const directionMax =
        directionMaxStopOrder.get(
          directionMaxKey({
            routeId: group.routeId,
            month: group.month,
            direction: group.direction,
          }),
        ) ?? group.stopOrder;
      return {
        routeId: group.routeId,
        month: group.month,
        segmentId: group.segmentId,
        direction: group.direction,
        daypart: group.daypart,
        isTerminal: group.stopOrder <= 1 || group.stopOrder >= directionMax,
        traversalCount: group.traversalCount,
        segmentLengthFeet:
          medianDistanceMiles === null ? null : Math.round(medianDistanceMiles * 5280 * 10) / 10,
        minSegmentLengthFeet: null,
        medianSpeedMph: medianSpeed,
        medianPaceMinutesPerMile: medianPace,
        freeFlowPaceMinutesPerMile: freeFlowPace,
        systematicDelayMinutesPerMile:
          medianPace === null || freeFlowPace === null ? null : medianPace - freeFlowPace,
        stochasticDelayMinutesPerMile:
          p95Pace === null || medianPace === null ? null : Math.max(0, p95Pace - medianPace),
        // Not computed: these rows are pre-joined to GTFS timepoint stop pairs, so there is no fuzzy
        // spatial-join confidence to report. Left null (unsupported) rather than a placeholder 1.0
        // that would claim a geometry verification that never happened (S2.3).
        spatialConfidence: null,
        quality: {
          coverageStatus: "complete",
          observedCount: group.sourceRowCount,
          expectedCount: null,
          coverageShare: null,
          freshnessStatus: "not_expected",
          sampleCount: group.traversalCount,
          minSampleCount,
          sampleStatus,
        },
      } satisfies SegmentDaypartFeature;
    })
    .sort((left, right) =>
      [left.month, left.routeId, left.direction, left.segmentId, left.daypart]
        .join(":")
        .localeCompare(
          [right.month, right.routeId, right.direction, right.segmentId, right.daypart].join(":"),
        ),
    );

  return {
    features,
    summary: {
      sourceRowCount: input.rows.length,
      featureCount: features.length,
      routeCount: routeIds.size,
      monthCount: months.size,
      skippedInvalidRowCount,
    },
  };
}

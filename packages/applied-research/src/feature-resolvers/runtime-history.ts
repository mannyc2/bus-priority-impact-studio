import type {
  RouteDirectionDaypartFeature,
  RouteMetricHistoryFeature,
} from "@bp/analytics/features";

export type ScheduledRuntimeSourceRow = {
  readonly route_id: unknown;
  readonly direction: unknown;
  readonly daypart: unknown;
  readonly runtime_minutes: unknown;
};

export type ObservedRuntimeSourceRow = {
  readonly route_id: unknown;
  readonly month: unknown;
  readonly direction: unknown;
  readonly daypart: unknown;
  readonly runtime_minutes: unknown;
  readonly observed_trip_count: unknown;
};

export type RouteMetricHistorySourceRow = {
  readonly route_id: unknown;
  readonly month: unknown;
  readonly speed_observation_count: unknown;
  readonly average_speed_mph: unknown;
};

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

function runtimeFeatureKey(input: {
  readonly routeId: string;
  readonly month: string;
  readonly direction: string;
  readonly daypart: string;
}): string {
  return [input.routeId, input.month, input.direction, input.daypart].join("\0");
}

export function buildRouteDirectionDaypartFeatures(input: {
  readonly observedRows: readonly ObservedRuntimeSourceRow[];
  readonly scheduledRows: readonly ScheduledRuntimeSourceRow[];
  readonly minObservedTrips: number;
}): { features: RouteDirectionDaypartFeature[]; summary: Record<string, unknown> } {
  const observedByKey = new Map<
    string,
    {
      values: number[];
      tripCount: number;
      routeId: string;
      month: string;
      direction: string;
      daypart: string;
    }
  >();
  for (const row of input.observedRows) {
    const routeId = text(row.route_id);
    const month = text(row.month);
    const direction = text(row.direction);
    const daypart = text(row.daypart);
    const runtime = numberValue(row.runtime_minutes);
    if (
      routeId === null ||
      month === null ||
      direction === null ||
      daypart === null ||
      runtime === null
    ) {
      continue;
    }
    const key = runtimeFeatureKey({ routeId, month, direction, daypart });
    const current =
      observedByKey.get(key) ?? { values: [], tripCount: 0, routeId, month, direction, daypart };
    current.values.push(runtime);
    current.tripCount += numberValue(row.observed_trip_count) ?? 0;
    observedByKey.set(key, current);
  }

  const scheduledByKey = new Map<string, number[]>();
  for (const row of input.scheduledRows) {
    const routeId = text(row.route_id);
    const direction = text(row.direction);
    const daypart = text(row.daypart);
    const runtime = numberValue(row.runtime_minutes);
    if (routeId === null || direction === null || daypart === null || runtime === null) continue;
    const key = [routeId, direction, daypart].join("\0");
    const current = scheduledByKey.get(key) ?? [];
    current.push(runtime);
    scheduledByKey.set(key, current);
  }

  const features = [...observedByKey.values()]
    .map((group) => {
      const scheduledRuntimeMinutes = percentile(
        scheduledByKey.get([group.routeId, group.direction, group.daypart].join("\0")) ?? [],
        0.5,
      );
      const observedRuntimeP50Minutes = percentile(group.values, 0.5);
      const observedRuntimeP95Minutes = percentile(group.values, 0.95);
      const sampleStatus =
        group.tripCount >= input.minObservedTrips ? "supported" : "insufficient_samples";
      return {
        routeId: group.routeId,
        month: group.month,
        direction: group.direction,
        daypart: group.daypart,
        servicePatternVersion: "route_segment_speed_plus_schedule_stop.v1",
        scheduledRuntimeMinutes,
        observedRuntimeP50Minutes,
        observedRuntimeP95Minutes,
        observedTripCount: group.tripCount,
        quality: {
          coverageStatus: "complete",
          observedCount: group.values.length,
          expectedCount: null,
          coverageShare: null,
          freshnessStatus: "not_expected",
          sampleCount: group.tripCount,
          minSampleCount: input.minObservedTrips,
          sampleStatus,
        },
      } satisfies RouteDirectionDaypartFeature;
    })
    .sort((left, right) =>
      [left.routeId, left.direction, left.daypart].join(":").localeCompare(
        [right.routeId, right.direction, right.daypart].join(":"),
      ),
    );

  return {
    features,
    summary: {
      sourceKind: "route_direction_daypart_runtime_from_segment_speed",
      observedRuntimeSampleCount: input.observedRows.length,
      scheduledRuntimeSampleCount: input.scheduledRows.length,
      featureCount: features.length,
      featureWithScheduleBaselineCount: features.filter(
        (feature) => feature.scheduledRuntimeMinutes !== null,
      ).length,
      supportedFeatureCount: features.filter(
        (feature) => feature.quality.sampleStatus === "supported",
      ).length,
    },
  };
}

export function buildRouteMetricHistoryFeatures(input: {
  readonly rows: readonly RouteMetricHistorySourceRow[];
  readonly releaseMonth: string;
  readonly historyStartMonth: string;
  readonly minHistoryPoints: number;
}): { features: RouteMetricHistoryFeature[]; summary: Record<string, unknown> } {
  const rowsByRoute = new Map<string, RouteMetricHistorySourceRow[]>();
  for (const row of input.rows) {
    const routeId = text(row.route_id);
    if (routeId === null) continue;
    const current = rowsByRoute.get(routeId) ?? [];
    current.push(row);
    rowsByRoute.set(routeId, current);
  }
  const features = [...rowsByRoute.entries()]
    .map(([routeId, rows]) => {
      const points = rows
        .map((row) => {
          const month = text(row.month);
          if (month === null) return null;
          const value = numberValue(row.average_speed_mph);
          const observationCount = numberValue(row.speed_observation_count) ?? 0;
          return {
            month,
            value,
            coverageStatus:
              value === null || observationCount <= 0
                ? ("missing" as const)
                : observationCount < 30
                  ? ("low_coverage" as const)
                  : ("complete" as const),
            routeVersion: null,
          };
        })
        .filter((point): point is NonNullable<typeof point> => point !== null)
        .sort((left, right) => left.month.localeCompare(right.month));
      const supportedPointCount = points.filter(
        (point) => point.coverageStatus === "complete",
      ).length;
      return {
        scopeKind: "route" as const,
        scopeId: routeId,
        metricName: "average_speed_mph",
        historyWindowMonths: points.length,
        points,
        routeVersionBreaks: [],
        quality: {
          coverageStatus: points.some((point) => point.month === input.releaseMonth)
            ? "complete"
            : "missing",
          observedCount: supportedPointCount,
          expectedCount: null,
          coverageShare: null,
          freshnessStatus: "not_expected",
          sampleCount: supportedPointCount,
          minSampleCount: input.minHistoryPoints,
          sampleStatus:
            supportedPointCount >= input.minHistoryPoints ? "supported" : "insufficient_samples",
        },
      } satisfies RouteMetricHistoryFeature;
    })
    .sort((left, right) => left.scopeId.localeCompare(right.scopeId));
  return {
    features,
    summary: {
      sourceKind: "route_metric_history_from_route_month_trend",
      metricName: "average_speed_mph",
      historyStartMonth: input.historyStartMonth,
      releaseMonth: input.releaseMonth,
      sourceRowCount: input.rows.length,
      featureCount: features.length,
      supportedFeatureCount: features.filter(
        (feature) => feature.quality.sampleStatus === "supported",
      ).length,
    },
  };
}

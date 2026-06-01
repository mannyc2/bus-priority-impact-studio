import type { DelayConcentrationRouteInput, DelayConcentrationSegmentInput } from "@bp/analytics";
import type {
  InterventionPanelFeature,
  PositiveDevianceFeature,
  PositiveDeviancePeriodEvidence,
  RiderWeightedExcessWaitFeature,
  StopDirectionHourFeature,
} from "@bp/analytics/features";

export type RouteHourlyRidershipSourceRow = {
  route_id: unknown;
  month: unknown;
  day_of_week: unknown;
  hour_of_day: unknown;
  ridership: unknown;
};

export type InterventionComparisonSourceRow = {
  route_id: unknown;
  month: unknown;
  event_id: unknown;
  intervention_type: unknown;
  implementation_date: unknown;
  implementation_month: unknown;
  comparison_status: unknown;
  pre_start_month: unknown;
  pre_end_month: unknown;
  post_start_month: unknown;
  post_end_month: unknown;
  comparison_route_count: unknown;
  comparison_route_ids: unknown;
  adjusted_speed_delta_mph: unknown;
  speed_delta_mph: unknown;
};

export type DelayConcentrationSegmentSourceRow = {
  route_id: unknown;
  segment_id: unknown;
  direction: unknown;
  stop_order: unknown;
  timepoint_stop_name: unknown;
  next_timepoint_stop_name: unknown;
  observation_count: unknown;
  bus_trip_count: unknown;
  weighted_average_speed_mph: unknown;
  weighted_average_travel_time_minutes: unknown;
  average_road_distance_miles: unknown;
};

export type DetectorFeatureResolverResult<TFeature> = {
  features: TFeature[];
  summary: Record<string, unknown>;
};

export type DelayConcentrationResolverResult = {
  routes: DelayConcentrationRouteInput[];
  summary: Record<string, unknown>;
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

function dayTypeFromServiceDate(serviceDate: string): string {
  const day = new Date(`${serviceDate.slice(0, 10)}T12:00:00Z`).getUTCDay();
  if (day === 0) return "Sunday";
  if (day === 6) return "Saturday";
  return "Weekday";
}

function serviceDayTypeFromDate(serviceDate: string): string {
  if (serviceDate.includes(":")) return serviceDate.split(":").at(-1) ?? "Weekday";
  return dayTypeFromServiceDate(serviceDate);
}

function riderFeatureGroupKey(input: {
  routeId: string;
  serviceDate: string;
  localHour: number;
}): string {
  return [input.routeId, serviceDayTypeFromDate(input.serviceDate), input.localHour].join("\0");
}

function excessWaitMinutes(feature: StopDirectionHourFeature): number | null {
  const headways = feature.observedHeadwaysMinutes.filter(
    (headway) => Number.isFinite(headway) && headway >= 0,
  );
  if (headways.length === 0 || feature.scheduledBusesPerHour === null) return null;
  const total = headways.reduce((sum, headway) => sum + headway, 0);
  if (total <= 0 || feature.scheduledBusesPerHour <= 0) return null;
  const averageWait = headways.reduce((sum, headway) => sum + headway ** 2, 0) / (2 * total);
  const scheduledWait = 30 / feature.scheduledBusesPerHour;
  return Math.max(0, averageWait - scheduledWait);
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

function percentileRank(value: number, values: readonly number[]): number | null {
  const sorted = values.filter((entry) => Number.isFinite(entry)).sort((a, b) => a - b);
  if (sorted.length === 0 || !Number.isFinite(value)) return null;
  const belowOrEqual = sorted.filter((entry) => entry <= value).length;
  return belowOrEqual / sorted.length;
}

function median(values: readonly number[]): number | null {
  return percentile(values, 0.5);
}

function mad(values: readonly number[], center: number): number {
  const deviations = values.map((value) => Math.abs(value - center));
  return median(deviations) ?? 0;
}

function parseControlScopeIds(value: unknown): string[] {
  const raw = text(value);
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === "string");
    }
  } catch {
    // Fall through to CSV-style parsing for legacy rows.
  }
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function buildRiderWeightedExcessWaitFeatures(input: {
  stopFeatures: readonly StopDirectionHourFeature[];
  ridershipRows: readonly RouteHourlyRidershipSourceRow[];
}): DetectorFeatureResolverResult<RiderWeightedExcessWaitFeature> {
  const featureCountsByGroup = new Map<string, number>();
  for (const feature of input.stopFeatures) {
    const key = riderFeatureGroupKey(feature);
    featureCountsByGroup.set(key, (featureCountsByGroup.get(key) ?? 0) + 1);
  }

  const ridershipByGroup = new Map<string, number>();
  for (const row of input.ridershipRows) {
    const routeId = text(row.route_id);
    const dayType = text(row.day_of_week);
    const hour = numberValue(row.hour_of_day);
    const ridership = numberValue(row.ridership);
    if (routeId === null || dayType === null || hour === null || ridership === null) continue;
    ridershipByGroup.set([routeId, dayType, hour].join("\0"), ridership);
  }

  const features: RiderWeightedExcessWaitFeature[] = input.stopFeatures.map((feature) => {
    const groupKey = riderFeatureGroupKey(feature);
    const groupRidership = ridershipByGroup.get(groupKey) ?? null;
    const featureCount = featureCountsByGroup.get(groupKey) ?? 1;
    const boardings =
      groupRidership === null || featureCount <= 0 ? null : groupRidership / featureCount;
    const ridershipSupported = boardings !== null && boardings > 0;
    return {
      routeId: feature.routeId,
      stopId: feature.stopId,
      stopName: feature.stopName,
      direction: feature.direction,
      serviceDate: feature.serviceDate,
      localHour: feature.localHour,
      timezone: feature.timezone,
      excessWaitTimeMinutes: excessWaitMinutes(feature),
      boardings,
      boardingsSource: ridershipSupported ? "route_hourly_ridership_stop_hour_proxy" : null,
      ridershipSnapshotId: ridershipSupported
        ? `local_route_hourly_ridership:${feature.serviceDate}`
        : null,
      ewtDetectorVersion: "headway_reliability_ewt@1.0.0",
      quality: feature.quality,
      ridershipQuality: {
        coverageStatus: ridershipSupported ? "partial" : "missing",
        observedCount: ridershipSupported ? 1 : 0,
        expectedCount: 1,
        coverageShare: ridershipSupported ? 1 : 0,
        freshnessStatus: "not_expected",
        sampleCount: ridershipSupported ? 1 : 0,
        minSampleCount: 1,
        sampleStatus: ridershipSupported ? "supported" : "missing_samples",
      },
    };
  });

  return {
    features,
    summary: {
      sourceKind: "rider_weighted_excess_wait_from_stop_hour_ewt_and_route_hourly_ridership",
      stopFeatureCount: input.stopFeatures.length,
      ridershipRowCount: input.ridershipRows.length,
      featureCount: features.length,
      featureWithRidershipCount: features.filter((feature) => feature.boardings !== null).length,
      featureWithExcessWaitCount: features.filter((feature) => feature.excessWaitTimeMinutes !== null)
        .length,
    },
  };
}

export function buildPositiveDevianceFeatures(input: {
  rows: readonly {
    route_id: unknown;
    month: unknown;
    speed_observation_count: unknown;
    average_speed_mph: unknown;
  }[];
  releaseMonth: string;
  minPeerCount: number;
  minStablePeriods: number;
}): DetectorFeatureResolverResult<PositiveDevianceFeature> {
  const valuesByMonth = new Map<
    string,
    Array<{ routeId: string; value: number; observations: number }>
  >();
  for (const row of input.rows) {
    const routeId = text(row.route_id);
    const month = text(row.month);
    const value = numberValue(row.average_speed_mph);
    const observations = numberValue(row.speed_observation_count) ?? 0;
    if (routeId === null || month === null || value === null) continue;
    const current = valuesByMonth.get(month) ?? [];
    current.push({ routeId, value, observations });
    valuesByMonth.set(month, current);
  }

  const periodsByRoute = new Map<string, PositiveDeviancePeriodEvidence[]>();
  const peerCountsByMonth = new Map<string, number>();
  for (const [month, rows] of valuesByMonth) {
    const supported = rows.filter((row) => row.observations >= 30);
    const values = supported.map((row) => row.value);
    const monthMedian = median(values);
    const monthMad = monthMedian === null ? 0 : mad(values, monthMedian);
    peerCountsByMonth.set(month, supported.length);
    for (const row of rows) {
      const coverageStatus =
        row.observations <= 0 ? "missing" : row.observations < 30 ? "low_coverage" : "complete";
      const performancePercentile =
        coverageStatus === "complete" ? percentileRank(row.value, values) : null;
      const adjustedResidual =
        coverageStatus === "complete" && monthMedian !== null
          ? monthMad > 0
            ? (row.value - monthMedian) / (1.4826 * monthMad)
            : row.value > monthMedian
              ? 1
              : row.value === monthMedian
                ? 0
                : -1
          : null;
      const current = periodsByRoute.get(row.routeId) ?? [];
      current.push({
        period: month,
        value: row.value,
        performancePercentile,
        adjustedResidual,
        reciprocalMetricWarnings: [],
        coverageStatus,
      });
      periodsByRoute.set(row.routeId, current);
    }
  }

  const releasePeerCount = peerCountsByMonth.get(input.releaseMonth);
  const maxPeerCount = Math.max(0, ...peerCountsByMonth.values());
  const peerCount = releasePeerCount ?? maxPeerCount;
  const features = [...periodsByRoute.entries()]
    .map(([routeId, periods]) => {
      const sortedPeriods = periods.sort((left, right) => left.period.localeCompare(right.period));
      const supportedPeriodCount = sortedPeriods.filter(
        (period) => period.coverageStatus === "complete",
      ).length;
      const hasReleasePeriod = sortedPeriods.some((period) => period.period === input.releaseMonth);
      return {
        scopeKind: "route" as const,
        scopeId: routeId,
        routeId,
        metricName: "average_speed_mph",
        peerGroupId: "nyc_bus_routes_with_speed_history",
        peerGroupLabel: "NYC bus routes with speed-history support",
        peerCount,
        minPeerCount: input.minPeerCount,
        covariates: {
          metricDirection: "higher_is_better",
          peerUniverse: "all_routes_with_supported_monthly_speed",
          releaseMonth: input.releaseMonth,
        },
        periods: sortedPeriods,
        quality: {
          coverageStatus: hasReleasePeriod ? "complete" : "missing",
          observedCount: supportedPeriodCount,
          expectedCount: null,
          coverageShare: null,
          freshnessStatus: "not_expected",
          sampleCount: supportedPeriodCount,
          minSampleCount: input.minStablePeriods,
          sampleStatus:
            supportedPeriodCount >= input.minStablePeriods
              ? "supported"
              : "insufficient_samples",
        },
      } satisfies PositiveDevianceFeature;
    })
    .sort((left, right) => left.scopeId.localeCompare(right.scopeId));

  return {
    features,
    summary: {
      sourceKind: "positive_deviance_from_route_month_trend_peer_history",
      metricName: "average_speed_mph",
      releaseMonth: input.releaseMonth,
      sourceRowCount: input.rows.length,
      monthCount: valuesByMonth.size,
      featureCount: features.length,
      supportedFeatureCount: features.filter(
        (feature) => feature.quality.sampleStatus === "supported",
      ).length,
      peerCount,
    },
  };
}

export function buildInterventionPanelFeatures(input: {
  rows: readonly InterventionComparisonSourceRow[];
}): DetectorFeatureResolverResult<InterventionPanelFeature> {
  const features = input.rows
    .map((row) => {
      const routeId = text(row.route_id);
      const eventId = text(row.event_id);
      const interventionType = text(row.intervention_type);
      if (routeId === null || eventId === null || interventionType === null) return null;
      const comparisonStatus = text(row.comparison_status);
      const controlScopeIds = parseControlScopeIds(row.comparison_route_ids);
      const comparisonRouteCount = numberValue(row.comparison_route_count) ?? controlScopeIds.length;
      const effectEstimate =
        numberValue(row.adjusted_speed_delta_mph) ?? numberValue(row.speed_delta_mph);
      const hasWindow =
        text(row.pre_start_month) !== null &&
        text(row.pre_end_month) !== null &&
        text(row.post_start_month) !== null &&
        text(row.post_end_month) !== null;
      const controlEligibilityStatus =
        comparisonStatus === "evaluated" && comparisonRouteCount >= 3
          ? "eligible"
          : comparisonRouteCount > 0
            ? "insufficient_controls"
            : "not_evaluated";
      const supported = hasWindow && controlEligibilityStatus === "eligible" && effectEstimate !== null;
      return {
        eventId,
        interventionType,
        treatedScopeKind: "route" as const,
        treatedScopeId: routeId,
        interventionDate:
          text(row.implementation_date) ?? text(row.implementation_month)?.concat("-01") ?? null,
        preWindowStart: text(row.pre_start_month),
        preWindowEnd: text(row.pre_end_month),
        postWindowStart: text(row.post_start_month),
        postWindowEnd: text(row.post_end_month),
        controlScopeIds,
        controlEligibilityStatus,
        preTrendStatus: "not_tested" as const,
        placeboStatus: "not_tested" as const,
        placeboInTimeStatus: "not_tested" as const,
        placeboInSpaceStatus: "not_tested" as const,
        autocorrelationStatus: "not_tested" as const,
        methodDivergenceStatus: "not_tested" as const,
        eventStudyEstimate: effectEstimate,
        eventStudyConfidenceIntervalLow: null,
        eventStudyConfidenceIntervalHigh: null,
        segmentedRegressionLevelChange: null,
        segmentedRegressionSlopeChange: null,
        matchedPeerDelta: effectEstimate,
        syntheticControlGap: null,
        quality: {
          coverageStatus: supported ? "complete" : "partial",
          observedCount: supported ? 1 : 0,
          expectedCount: 1,
          coverageShare: supported ? 1 : 0,
          freshnessStatus: "not_expected",
          sampleCount: supported ? 1 : 0,
          minSampleCount: 1,
          sampleStatus: supported ? "supported" : "insufficient_samples",
        },
      } satisfies InterventionPanelFeature;
    })
    .filter((feature): feature is NonNullable<typeof feature> => feature !== null)
    .sort((left, right) =>
      [left.treatedScopeId, left.eventId].join(":").localeCompare(
        [right.treatedScopeId, right.eventId].join(":"),
      ),
    );

  return {
    features,
    summary: {
      sourceKind: "intervention_panel_from_local_route_intervention_comparison",
      sourceRowCount: input.rows.length,
      featureCount: features.length,
      supportedFeatureCount: features.filter(
        (feature) => feature.quality.sampleStatus === "supported",
      ).length,
      eligibleControlFeatureCount: features.filter(
        (feature) => feature.controlEligibilityStatus === "eligible",
      ).length,
      featureWithEffectEstimateCount: features.filter(
        (feature) => feature.eventStudyEstimate !== null && feature.eventStudyEstimate !== undefined,
      ).length,
    },
  };
}

export function buildDelayConcentrationRoutes(input: {
  rows: readonly DelayConcentrationSegmentSourceRow[];
}): DelayConcentrationResolverResult {
  const rowsByRoute = new Map<string, DelayConcentrationSegmentInput[]>();
  for (const row of input.rows) {
    const routeId = text(row.route_id);
    const segmentId = text(row.segment_id);
    const direction = text(row.direction);
    const stopOrder = numberValue(row.stop_order);
    const timepointStopName = text(row.timepoint_stop_name);
    const nextTimepointStopName = text(row.next_timepoint_stop_name);
    const observationCount = numberValue(row.observation_count);
    const busTripCount = numberValue(row.bus_trip_count);
    const weightedAverageSpeedMph = numberValue(row.weighted_average_speed_mph);
    const weightedAverageTravelTimeMinutes = numberValue(row.weighted_average_travel_time_minutes);
    const averageRoadDistanceMiles = numberValue(row.average_road_distance_miles);
    if (
      routeId === null ||
      segmentId === null ||
      direction === null ||
      stopOrder === null ||
      timepointStopName === null ||
      nextTimepointStopName === null ||
      observationCount === null ||
      busTripCount === null ||
      weightedAverageSpeedMph === null ||
      weightedAverageTravelTimeMinutes === null ||
      averageRoadDistanceMiles === null
    ) {
      continue;
    }
    const current = rowsByRoute.get(routeId) ?? [];
    current.push({
      segmentId,
      direction,
      stopOrder,
      timepointStopName,
      nextTimepointStopName,
      observationCount,
      busTripCount,
      weightedAverageSpeedMph,
      weightedAverageTravelTimeMinutes,
      averageRoadDistanceMiles,
    });
    rowsByRoute.set(routeId, current);
  }

  const routes = [...rowsByRoute.entries()]
    .map(([routeId, segments]) => ({
      routeId,
      hasSpeedData: segments.length > 0,
      speedObservationCount: segments.reduce((sum, segment) => sum + segment.observationCount, 0),
      segments: segments.sort((left, right) =>
        [left.direction, left.stopOrder, left.segmentId].join(":").localeCompare(
          [right.direction, right.stopOrder, right.segmentId].join(":"),
        ),
      ),
    }))
    .sort((left, right) => left.routeId.localeCompare(right.routeId));

  return {
    routes,
    summary: {
      sourceKind: "delay_concentration_from_route_segment_speed",
      sourceRowCount: input.rows.length,
      routeCount: routes.length,
      featureCount: routes.length,
      segmentCount: routes.reduce((sum, route) => sum + route.segments.length, 0),
      speedObservationCount: routes.reduce((sum, route) => sum + route.speedObservationCount, 0),
    },
  };
}

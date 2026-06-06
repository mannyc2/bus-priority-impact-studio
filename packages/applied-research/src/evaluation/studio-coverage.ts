import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { StudioAiPublicNoteSchema } from "@bp/domain/studio/briefs";

export type RouteBriefInputHourlyBins = {
  routeInputCount: number;
  scheduleComparisonCount: number;
  segmentsWithScheduleComparisons: number;
  segmentsWithCompleteScheduleComparisons: number;
  segmentsMissingScheduleComparisons: number;
  segmentsWithIncompleteScheduleComparisons: number;
  segmentCount: number;
  segmentsWith24HourlyBins: number;
  segmentsMissingHourlyBins: number;
  segmentsWithLegacyHourlyBins: number;
  segmentsWithRidershipExposure: number;
  segmentsMissingRidershipExposure: number;
  routesMissingBriefInput: string[];
  routesMissingScheduleComparisons: string[];
  routesWithSegmentsMissingScheduleComparisons: string[];
  routesWithIncompleteScheduleComparisons: string[];
  routesWithMissingHourlyBins: string[];
  routesWithLegacyHourlyBins: string[];
  routesWithMissingRidershipExposure: string[];
};

export type ProjectionSegmentHourBins = {
  segmentCount: number;
  segmentsWith24HourBins: number;
  segmentsWithInvalidHourBins: number;
  segmentsWithDotLaneGeometry: number;
  segmentsWithInvalidLaneGeometry: number;
  segmentsWithRouteShapeGeometry: number;
  segmentsWithInvalidRouteShapeGeometry: number;
  segmentsWithTspSourceEvidence: number;
  segmentsWithInvalidTspEvidence: number;
  segmentsWithPublicAiNotes: number;
  segmentsWithInvalidPublicAiNotes: number;
  routeDetailsWithExcessPublicAiNoteDensity: number;
  routeDetailsWithRidershipProfile: number;
  routeDetailsWithInvalidRidershipProfile: number;
  routeSegmentEvidenceCount: number;
  routeSegmentEvidenceWithDotLaneGeometry: number;
  routeSegmentEvidenceWithInvalidLaneGeometry: number;
  routeSegmentEvidenceWithRouteShapeGeometry: number;
  routeSegmentEvidenceWithInvalidRouteShapeGeometry: number;
  routeSegmentEvidenceWithTspSourceEvidence: number;
  routeSegmentEvidenceWithInvalidTspEvidence: number;
  routeSegmentEvidenceWithCompleteRiderDelay: number;
  routeSegmentEvidenceWithInvalidRiderDelay: number;
  routeSegmentResponsesWithCoverageMetadata: number;
  routeSegmentResponsesWithInvalidCoverageMetadata: number;
  invalidSegmentRefs: string[];
  invalidLaneRefs: string[];
  invalidRouteShapeRefs: string[];
  invalidTspRefs: string[];
  invalidPublicAiNoteRefs: string[];
  excessPublicAiNoteDensityRefs: string[];
  invalidRouteDetailRidershipProfileRefs: string[];
  invalidRouteSegmentEvidenceLaneRefs: string[];
  invalidRouteSegmentEvidenceRouteShapeRefs: string[];
  invalidRouteSegmentEvidenceTspRefs: string[];
  invalidRouteSegmentEvidenceRiderDelayRefs: string[];
  invalidRouteSegmentCoverageRefs: string[];
};

function emptyRouteBriefInputHourlyBins(): RouteBriefInputHourlyBins {
  return {
    routeInputCount: 0,
    scheduleComparisonCount: 0,
    segmentsWithScheduleComparisons: 0,
    segmentsWithCompleteScheduleComparisons: 0,
    segmentsMissingScheduleComparisons: 0,
    segmentsWithIncompleteScheduleComparisons: 0,
    segmentCount: 0,
    segmentsWith24HourlyBins: 0,
    segmentsMissingHourlyBins: 0,
    segmentsWithLegacyHourlyBins: 0,
    segmentsWithRidershipExposure: 0,
    segmentsMissingRidershipExposure: 0,
    routesMissingBriefInput: [],
    routesMissingScheduleComparisons: [],
    routesWithSegmentsMissingScheduleComparisons: [],
    routesWithIncompleteScheduleComparisons: [],
    routesWithMissingHourlyBins: [],
    routesWithLegacyHourlyBins: [],
    routesWithMissingRidershipExposure: [],
  };
}

function routeBriefInputPath(artifactRoot: string, routeId: string, isoMonthValue: string): string {
  return join(
    artifactRoot,
    "route-slices",
    `${routeId.toLowerCase()}-${isoMonthValue}`,
    "route-brief-input.json",
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasRidershipExposure(record: { ridershipExposure?: unknown }): boolean {
  return isFiniteNumber(record.ridershipExposure) && record.ridershipExposure >= 0;
}

function hasCompleteScheduleComparison(record: {
  scheduledMedianTravelTimeMinutes?: unknown;
  observedMinusScheduledMinutes?: unknown;
  scheduledSampleCount?: unknown;
}): boolean {
  return (
    isFiniteNumber(record.scheduledMedianTravelTimeMinutes) &&
    record.scheduledMedianTravelTimeMinutes > 0 &&
    isFiniteNumber(record.observedMinusScheduledMinutes) &&
    isFiniteNumber(record.scheduledSampleCount) &&
    Number.isInteger(record.scheduledSampleCount) &&
    record.scheduledSampleCount > 0
  );
}

export async function auditRouteBriefInputHourlyBins(args: {
  artifactRoot: string;
  isoMonth: string;
  routeIds: readonly string[];
}): Promise<RouteBriefInputHourlyBins> {
  const result = emptyRouteBriefInputHourlyBins();

  for (const routeId of args.routeIds) {
    let body: { topSegments?: unknown; scheduleComparisons?: unknown };
    try {
      body = JSON.parse(
        await readFile(routeBriefInputPath(args.artifactRoot, routeId, args.isoMonth), "utf-8"),
      ) as Record<string, unknown>;
    } catch {
      result.routesMissingBriefInput.push(routeId);
      continue;
    }

    result.routeInputCount += 1;
    const scheduleComparisons = body.scheduleComparisons;
    const scheduleComparisonsBySegmentId = new Map<string, Record<string, unknown>>();
    if (Array.isArray(scheduleComparisons) && scheduleComparisons.length > 0) {
      result.scheduleComparisonCount += scheduleComparisons.length;
      for (const comparison of scheduleComparisons) {
        const record =
          typeof comparison === "object" && comparison !== null
            ? (comparison as Record<string, unknown>)
            : {};
        const segmentId = record["segmentId"];
        if (typeof segmentId === "string") {
          scheduleComparisonsBySegmentId.set(segmentId, record);
        }
      }
    } else {
      result.routesMissingScheduleComparisons.push(routeId);
    }

    const topSegments = body.topSegments;
    const segments = Array.isArray(topSegments) ? topSegments : [];
    let routeHasSegmentMissingScheduleComparison = false;
    let routeHasIncompleteScheduleComparison = false;
    let routeHasMissingBins = false;
    let routeHasLegacyBins = false;
    let routeHasMissingRidershipExposure = false;

    for (const segment of segments) {
      result.segmentCount += 1;
      const segmentRecord =
        typeof segment === "object" && segment !== null ? (segment as Record<string, unknown>) : {};
      const segmentId = segmentRecord["segmentId"];
      const comparison =
        typeof segmentId === "string" ? scheduleComparisonsBySegmentId.get(segmentId) : undefined;
      if (comparison !== undefined) {
        result.segmentsWithScheduleComparisons += 1;
        if (hasCompleteScheduleComparison(comparison)) {
          result.segmentsWithCompleteScheduleComparisons += 1;
        } else {
          result.segmentsWithIncompleteScheduleComparisons += 1;
          routeHasIncompleteScheduleComparison = true;
        }
      } else {
        result.segmentsMissingScheduleComparisons += 1;
        routeHasSegmentMissingScheduleComparison = true;
      }
      const bins =
        typeof segment === "object" && segment !== null
          ? (segment as { hourlySlowWindowBins?: unknown }).hourlySlowWindowBins
          : undefined;
      if (!Array.isArray(bins)) {
        result.segmentsMissingHourlyBins += 1;
        routeHasMissingBins = true;
      } else if (bins.length === 24) {
        result.segmentsWith24HourlyBins += 1;
      } else {
        result.segmentsWithLegacyHourlyBins += 1;
        routeHasLegacyBins = true;
      }
      if (hasRidershipExposure(segmentRecord)) {
        result.segmentsWithRidershipExposure += 1;
      } else {
        result.segmentsMissingRidershipExposure += 1;
        routeHasMissingRidershipExposure = true;
      }
    }

    if (routeHasSegmentMissingScheduleComparison) {
      result.routesWithSegmentsMissingScheduleComparisons.push(routeId);
    }
    if (routeHasIncompleteScheduleComparison) {
      result.routesWithIncompleteScheduleComparisons.push(routeId);
    }
    if (routeHasMissingBins) result.routesWithMissingHourlyBins.push(routeId);
    if (routeHasLegacyBins) result.routesWithLegacyHourlyBins.push(routeId);
    if (routeHasMissingRidershipExposure) result.routesWithMissingRidershipExposure.push(routeId);
  }

  return {
    ...result,
    routesMissingBriefInput: result.routesMissingBriefInput.sort(),
    routesMissingScheduleComparisons: result.routesMissingScheduleComparisons.sort(),
    routesWithSegmentsMissingScheduleComparisons:
      result.routesWithSegmentsMissingScheduleComparisons.sort(),
    routesWithIncompleteScheduleComparisons: result.routesWithIncompleteScheduleComparisons.sort(),
    routesWithMissingHourlyBins: result.routesWithMissingHourlyBins.sort(),
    routesWithLegacyHourlyBins: result.routesWithLegacyHourlyBins.sort(),
    routesWithMissingRidershipExposure: result.routesWithMissingRidershipExposure.sort(),
  };
}

function emptyProjectionSegmentHourBins(): ProjectionSegmentHourBins {
  return {
    segmentCount: 0,
    segmentsWith24HourBins: 0,
    segmentsWithInvalidHourBins: 0,
    segmentsWithDotLaneGeometry: 0,
    segmentsWithInvalidLaneGeometry: 0,
    segmentsWithRouteShapeGeometry: 0,
    segmentsWithInvalidRouteShapeGeometry: 0,
    segmentsWithTspSourceEvidence: 0,
    segmentsWithInvalidTspEvidence: 0,
    segmentsWithPublicAiNotes: 0,
    segmentsWithInvalidPublicAiNotes: 0,
    routeDetailsWithExcessPublicAiNoteDensity: 0,
    routeDetailsWithRidershipProfile: 0,
    routeDetailsWithInvalidRidershipProfile: 0,
    routeSegmentEvidenceCount: 0,
    routeSegmentEvidenceWithDotLaneGeometry: 0,
    routeSegmentEvidenceWithInvalidLaneGeometry: 0,
    routeSegmentEvidenceWithRouteShapeGeometry: 0,
    routeSegmentEvidenceWithInvalidRouteShapeGeometry: 0,
    routeSegmentEvidenceWithTspSourceEvidence: 0,
    routeSegmentEvidenceWithInvalidTspEvidence: 0,
    routeSegmentEvidenceWithCompleteRiderDelay: 0,
    routeSegmentEvidenceWithInvalidRiderDelay: 0,
    routeSegmentResponsesWithCoverageMetadata: 0,
    routeSegmentResponsesWithInvalidCoverageMetadata: 0,
    invalidSegmentRefs: [],
    invalidLaneRefs: [],
    invalidRouteShapeRefs: [],
    invalidTspRefs: [],
    invalidPublicAiNoteRefs: [],
    excessPublicAiNoteDensityRefs: [],
    invalidRouteDetailRidershipProfileRefs: [],
    invalidRouteSegmentEvidenceLaneRefs: [],
    invalidRouteSegmentEvidenceRouteShapeRefs: [],
    invalidRouteSegmentEvidenceTspRefs: [],
    invalidRouteSegmentEvidenceRiderDelayRefs: [],
    invalidRouteSegmentCoverageRefs: [],
  };
}

function hasLaneMethodMetadata(record: {
  laneTypes?: unknown;
  laneOperatingHours?: unknown;
  laneOperatingDays?: unknown;
}) {
  return (
    Array.isArray(record.laneTypes) &&
    record.laneTypes.every((value) => typeof value === "string") &&
    Array.isArray(record.laneOperatingHours) &&
    record.laneOperatingHours.every((value) => typeof value === "string") &&
    Array.isArray(record.laneOperatingDays) &&
    record.laneOperatingDays.every((value) => typeof value === "string")
  );
}

function hasDotLaneGeometryEvidence(record: {
  lane?: unknown;
  laneSource?: unknown;
  laneOverlapShare?: unknown;
  laneMatchedCount?: unknown;
  laneTypes?: unknown;
  laneOperatingHours?: unknown;
  laneOperatingDays?: unknown;
}): boolean {
  return (
    (record.lane === "yes" ||
      record.lane === "partial" ||
      record.lane === "minimal" ||
      record.lane === "none") &&
    record.laneSource === "dot_bus_lanes_geometry" &&
    typeof record.laneOverlapShare === "number" &&
    record.laneOverlapShare >= 0 &&
    record.laneOverlapShare <= 1 &&
    typeof record.laneMatchedCount === "number" &&
    Number.isInteger(record.laneMatchedCount) &&
    record.laneMatchedCount >= 0 &&
    hasLaneMethodMetadata(record)
  );
}

export function hasDotRouteLaneCoverage(record: {
  laneCoverage?: unknown;
  laneCoverageSource?: unknown;
  laneTypes?: unknown;
  laneOperatingHours?: unknown;
  laneOperatingDays?: unknown;
}) {
  return (
    typeof record.laneCoverage === "number" &&
    Number.isFinite(record.laneCoverage) &&
    record.laneCoverage >= 0 &&
    record.laneCoverage <= 100 &&
    record.laneCoverageSource === "dot_bus_lanes_geometry" &&
    hasLaneMethodMetadata(record)
  );
}

export function hasValidTrendMonthLabels(record: {
  spark?: unknown;
  sparkMonths?: unknown;
  ridershipSpark?: unknown;
  ridershipSparkMonths?: unknown;
}): boolean {
  const isIsoMonth = (value: unknown): value is string =>
    typeof value === "string" && /^\d{4}-\d{2}$/.test(value);
  return (
    Array.isArray(record.spark) &&
    record.spark.every(isFiniteNumber) &&
    Array.isArray(record.sparkMonths) &&
    record.sparkMonths.length === record.spark.length &&
    record.sparkMonths.every(isIsoMonth) &&
    Array.isArray(record.ridershipSpark) &&
    record.ridershipSpark.every(isFiniteNumber) &&
    Array.isArray(record.ridershipSparkMonths) &&
    record.ridershipSparkMonths.length === record.ridershipSpark.length &&
    record.ridershipSparkMonths.every(isIsoMonth)
  );
}

function hasValidRidershipWindow(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const record = value as {
    dayOfWeek?: unknown;
    hourOfDay?: unknown;
    ridership?: unknown;
    transfers?: unknown;
    matchedObservationCount?: unknown;
    busTripCount?: unknown;
    weightedAverageSpeedMph?: unknown;
    slowObservationShare?: unknown;
  };
  return (
    typeof record.dayOfWeek === "string" &&
    record.dayOfWeek.length > 0 &&
    Number.isInteger(record.hourOfDay) &&
    typeof record.hourOfDay === "number" &&
    record.hourOfDay >= 0 &&
    record.hourOfDay <= 23 &&
    isFiniteNumber(record.ridership) &&
    record.ridership >= 0 &&
    isFiniteNumber(record.transfers) &&
    record.transfers >= 0 &&
    Number.isInteger(record.matchedObservationCount) &&
    typeof record.matchedObservationCount === "number" &&
    record.matchedObservationCount >= 0 &&
    isFiniteNumber(record.busTripCount) &&
    record.busTripCount >= 0 &&
    (record.weightedAverageSpeedMph === null ||
      (isFiniteNumber(record.weightedAverageSpeedMph) && record.weightedAverageSpeedMph >= 0)) &&
    (record.slowObservationShare === null ||
      (isFiniteNumber(record.slowObservationShare) &&
        record.slowObservationShare >= 0 &&
        record.slowObservationShare <= 1))
  );
}

export function hasValidRidershipProfile(record: { ridershipProfile?: unknown }): boolean {
  if (typeof record.ridershipProfile !== "object" || record.ridershipProfile === null) {
    return false;
  }
  const profile = record.ridershipProfile as {
    peakRidershipWindow?: unknown;
    topRidershipWindows?: unknown;
    slowCrowdedWindows?: unknown;
  };
  return (
    (profile.peakRidershipWindow === null ||
      hasValidRidershipWindow(profile.peakRidershipWindow)) &&
    Array.isArray(profile.topRidershipWindows) &&
    profile.topRidershipWindows.length > 0 &&
    profile.topRidershipWindows.every(hasValidRidershipWindow) &&
    Array.isArray(profile.slowCrowdedWindows) &&
    profile.slowCrowdedWindows.every(hasValidRidershipWindow)
  );
}

function hasRouteShapeSegmentGeometry(record: {
  segmentGeometrySource?: unknown;
  segmentGeometryMethod?: unknown;
  segmentGeometry?: unknown;
}): boolean {
  if (
    record.segmentGeometrySource !== "mta_route_shape_timepoint_slice" ||
    record.segmentGeometryMethod !== "timepoint_stop_projection_to_route_shape" ||
    typeof record.segmentGeometry !== "object" ||
    record.segmentGeometry === null
  ) {
    return false;
  }

  const geometry = record.segmentGeometry as { type?: unknown; coordinates?: unknown };
  return (
    geometry.type === "LineString" &&
    Array.isArray(geometry.coordinates) &&
    geometry.coordinates.length >= 2 &&
    geometry.coordinates.every(
      (coordinate) =>
        Array.isArray(coordinate) &&
        coordinate.length === 2 &&
        coordinate.every((value) => typeof value === "number" && Number.isFinite(value)),
    )
  );
}

function hasTspSourceEvidence(record: {
  tspStatus?: unknown;
  tspSource?: unknown;
  tspSourceDate?: unknown;
  tspSourceUrl?: unknown;
  tspCorridor?: unknown;
  tspMatchMethod?: unknown;
}): boolean {
  const validStatus =
    record.tspStatus === "installed" ||
    record.tspStatus === "candidate" ||
    record.tspStatus === "unknown";
  const validSource =
    record.tspSource === "nyc_dot_tsp_status_2017" ||
    record.tspSource === "not_in_ingested_tsp_sources";
  if (!validStatus || !validSource) return false;

  if (record.tspSource === "nyc_dot_tsp_status_2017") {
    return (
      typeof record.tspSourceDate === "string" &&
      record.tspSourceDate.length > 0 &&
      typeof record.tspSourceUrl === "string" &&
      record.tspSourceUrl.length > 0 &&
      typeof record.tspCorridor === "string" &&
      record.tspCorridor.length > 0 &&
      (record.tspMatchMethod === "route_label_in_2017_status_snapshot" ||
        record.tspMatchMethod === "segment_endpoint_text_match" ||
        record.tspMatchMethod === "route_level_status_only")
    );
  }

  return (
    record.tspSourceDate === null &&
    record.tspSourceUrl === null &&
    record.tspCorridor === null &&
    record.tspMatchMethod === "not_matched_in_ingested_sources"
  );
}

function hasCompleteRiderDelayEvidence(record: {
  scheduledMedianTravelTimeMinutes?: unknown;
  scheduledSpeedMph?: unknown;
  observedMinusScheduledMinutes?: unknown;
  scheduledSampleCount?: unknown;
  ridershipExposure?: unknown;
  riderDelayHours?: unknown;
  hourlyPassengerDelay?: unknown;
  stopBoardings?: unknown;
  segmentBoardings?: unknown;
}): boolean {
  const hourlyRows = Array.isArray(record.hourlyPassengerDelay) ? record.hourlyPassengerDelay : [];
  return (
    hasCompleteScheduleComparison(record) &&
    isFiniteNumber(record.scheduledSpeedMph) &&
    record.scheduledSpeedMph > 0 &&
    hasRidershipExposure(record) &&
    isFiniteNumber(record.riderDelayHours) &&
    record.riderDelayHours >= 0 &&
    hourlyRows.length > 0 &&
    hourlyRows.every((row) => {
      if (typeof row !== "object" || row === null) return false;
      const hourlyRecord = row as {
        averageServiceDayRouteRidership?: unknown;
        monthlyRouteRidership?: unknown;
        riderDelayHours?: unknown;
        segmentBoardings?: unknown;
        serviceDayCount?: unknown;
        stopBoardings?: unknown;
      };
      return (
        (hourlyRecord.averageServiceDayRouteRidership === null ||
          (isFiniteNumber(hourlyRecord.averageServiceDayRouteRidership) &&
            hourlyRecord.averageServiceDayRouteRidership >= 0)) &&
        (hourlyRecord.monthlyRouteRidership === null ||
          (isFiniteNumber(hourlyRecord.monthlyRouteRidership) &&
            hourlyRecord.monthlyRouteRidership >= 0)) &&
        (hourlyRecord.serviceDayCount === null ||
          (Number.isInteger(hourlyRecord.serviceDayCount) &&
            typeof hourlyRecord.serviceDayCount === "number" &&
            hourlyRecord.serviceDayCount > 0)) &&
        isFiniteNumber(hourlyRecord.riderDelayHours) &&
        hourlyRecord.riderDelayHours >= 0 &&
        hourlyRecord.stopBoardings === null &&
        hourlyRecord.segmentBoardings === null
      );
    }) &&
    record.stopBoardings === null &&
    record.segmentBoardings === null
  );
}

function routePublicAiNoteLimit(segmentCount: number): number {
  return segmentCount === 0 ? 0 : Math.max(1, Math.floor(segmentCount * 0.3));
}

function hasValidPublicAiNote(value: unknown): boolean {
  return StudioAiPublicNoteSchema.safeParse(value).success;
}

const requiredBoardingUnavailableCoverageReasons = [
  "stop_level_boardings_unavailable",
  "segment_level_boardings_unavailable",
] as const;

const singleMonthUnavailableCoverageReasons = [
  "multi_month_window_projection_pending",
  "stop_level_boardings_unavailable",
  "segment_level_boardings_unavailable",
] as const;

function hasRouteSegmentCoverageMetadata(record: {
  coverage?: unknown;
  segments?: unknown;
}): boolean {
  const coverage =
    typeof record.coverage === "object" && record.coverage !== null
      ? (record.coverage as {
          scope?: unknown;
          segmentUniverse?: unknown;
          riderDelayMetric?: unknown;
          riderDelayAggregation?: unknown;
          ridershipDenominator?: unknown;
          serviceDayRidershipCoverage?: unknown;
          stopBoardingsCoverage?: unknown;
          segmentBoardingsCoverage?: unknown;
          hourlyRiderDelayCoverage?: unknown;
          fullRouteCoverage?: unknown;
          multiMonthWindowCoverage?: unknown;
          unavailableCoverageReasons?: unknown;
          totalRouteSegmentRows?: unknown;
          returnedSegmentRows?: unknown;
          windowMonthCount?: unknown;
        })
      : null;
  if (coverage === null) return false;
  const segments = Array.isArray(record.segments) ? record.segments : [];
  const reasons = Array.isArray(coverage.unavailableCoverageReasons)
    ? coverage.unavailableCoverageReasons
    : [];
  const windowMonthCount =
    typeof coverage.windowMonthCount === "number" &&
    Number.isInteger(coverage.windowMonthCount) &&
    coverage.windowMonthCount >= 1
      ? coverage.windowMonthCount
      : null;
  const expectedReasons =
    windowMonthCount !== null && windowMonthCount > 1
      ? requiredBoardingUnavailableCoverageReasons
      : singleMonthUnavailableCoverageReasons;
  return (
    coverage.scope === "full_route_observed_timepoint_segments" &&
    coverage.segmentUniverse === "all_observed_timepoint_segments" &&
    coverage.riderDelayMetric ===
      "positive_observed_minus_scheduled_minutes_times_average_service_day_route_hourly_ridership" &&
    coverage.riderDelayAggregation === "segment_hour_service_day_hours" &&
    coverage.ridershipDenominator === "average_service_day_route_hourly_ridership" &&
    coverage.serviceDayRidershipCoverage === "available" &&
    coverage.stopBoardingsCoverage === "not_available" &&
    coverage.segmentBoardingsCoverage === "not_available" &&
    coverage.hourlyRiderDelayCoverage === "available" &&
    coverage.fullRouteCoverage === true &&
    windowMonthCount !== null &&
    coverage.multiMonthWindowCoverage ===
      (windowMonthCount > 1 ? "multi_month_window" : "single_release_month") &&
    expectedReasons.every((reason) => reasons.includes(reason)) &&
    reasons.every((reason) => expectedReasons.includes(reason)) &&
    coverage.returnedSegmentRows === segments.length &&
    isFiniteNumber(coverage.totalRouteSegmentRows) &&
    coverage.totalRouteSegmentRows >= segments.length &&
    coverage.windowMonthCount === windowMonthCount
  );
}

export async function auditProjectionSegmentHourBins(args: {
  studioRoot: string;
  routeDirs: readonly string[];
}): Promise<ProjectionSegmentHourBins> {
  const result = emptyProjectionSegmentHourBins();

  for (const dir of args.routeDirs) {
    let routeDetailPayload: { route?: unknown; segments?: unknown };
    try {
      routeDetailPayload = JSON.parse(
        await readFile(join(args.studioRoot, "routes", dir, "index.json"), "utf-8"),
      ) as Record<string, unknown>;
    } catch {
      routeDetailPayload = {};
    }
    const routeRecord =
      typeof routeDetailPayload.route === "object" && routeDetailPayload.route !== null
        ? (routeDetailPayload.route as { ridershipProfile?: unknown })
        : {};
    if (hasValidRidershipProfile(routeRecord)) {
      result.routeDetailsWithRidershipProfile += 1;
    } else {
      result.routeDetailsWithInvalidRidershipProfile += 1;
      result.invalidRouteDetailRidershipProfileRefs.push(`${dir}:route:ridershipProfile`);
    }
    const segments = Array.isArray(routeDetailPayload.segments) ? routeDetailPayload.segments : [];
    for (const [index, segment] of segments.entries()) {
      result.segmentCount += 1;
      const record =
        typeof segment === "object" && segment !== null
          ? (segment as {
              hours?: unknown;
              id?: unknown;
              lane?: unknown;
              laneSource?: unknown;
              laneOverlapShare?: unknown;
              laneMatchedCount?: unknown;
              laneTypes?: unknown;
              laneOperatingHours?: unknown;
              laneOperatingDays?: unknown;
              segmentGeometrySource?: unknown;
              segmentGeometryMethod?: unknown;
              segmentGeometry?: unknown;
              tspStatus?: unknown;
              tspSource?: unknown;
              tspSourceDate?: unknown;
              tspSourceUrl?: unknown;
              tspCorridor?: unknown;
              tspMatchMethod?: unknown;
              aiNote?: unknown;
            })
          : {};
      const segmentRef = `${dir}:${typeof record.id === "string" ? record.id : index + 1}`;
      if (record.aiNote !== undefined) {
        result.segmentsWithPublicAiNotes += 1;
        if (!hasValidPublicAiNote(record.aiNote)) {
          result.segmentsWithInvalidPublicAiNotes += 1;
          result.invalidPublicAiNoteRefs.push(`${segmentRef}:aiNote`);
        }
      }
      const hours = record.hours;
      if (Array.isArray(hours) && hours.length === 24) {
        result.segmentsWith24HourBins += 1;
      } else {
        result.segmentsWithInvalidHourBins += 1;
        result.invalidSegmentRefs.push(segmentRef);
      }
      if (hasDotLaneGeometryEvidence(record)) {
        result.segmentsWithDotLaneGeometry += 1;
      } else {
        result.segmentsWithInvalidLaneGeometry += 1;
        result.invalidLaneRefs.push(segmentRef);
      }
      if (hasRouteShapeSegmentGeometry(record)) {
        result.segmentsWithRouteShapeGeometry += 1;
      } else {
        result.segmentsWithInvalidRouteShapeGeometry += 1;
        result.invalidRouteShapeRefs.push(segmentRef);
      }
      if (hasTspSourceEvidence(record)) {
        result.segmentsWithTspSourceEvidence += 1;
      } else {
        result.segmentsWithInvalidTspEvidence += 1;
        result.invalidTspRefs.push(segmentRef);
      }
    }
    const routePublicAiNoteLimitValue = routePublicAiNoteLimit(segments.length);
    const routePublicAiNoteCount = segments.filter(
      (segment) =>
        typeof segment === "object" &&
        segment !== null &&
        (segment as { aiNote?: unknown }).aiNote !== undefined,
    ).length;
    if (routePublicAiNoteCount > routePublicAiNoteLimitValue) {
      result.routeDetailsWithExcessPublicAiNoteDensity += 1;
      result.excessPublicAiNoteDensityRefs.push(
        `${dir}:aiNote-density:${routePublicAiNoteCount}/${segments.length}>${routePublicAiNoteLimitValue}`,
      );
    }

    const routeSegmentEvidencePath = join(args.studioRoot, "routes", dir, "segments.json");
    const routeSegmentEvidencePayload = JSON.parse(
      await readFile(routeSegmentEvidencePath, "utf8"),
    );
    if (hasRouteSegmentCoverageMetadata(routeSegmentEvidencePayload)) {
      result.routeSegmentResponsesWithCoverageMetadata += 1;
    } else {
      result.routeSegmentResponsesWithInvalidCoverageMetadata += 1;
      result.invalidRouteSegmentCoverageRefs.push(`${dir}:segments:coverage`);
    }
    const routeSegmentEvidence = Array.isArray(
      (routeSegmentEvidencePayload as { segments?: unknown }).segments,
    )
      ? (routeSegmentEvidencePayload as { segments: unknown[] }).segments
      : [];
    if (routeSegmentEvidence.length === 0) {
      result.routeSegmentEvidenceWithInvalidLaneGeometry += 1;
      result.invalidRouteSegmentEvidenceLaneRefs.push(`${dir}:segments:missing`);
      result.routeSegmentEvidenceWithInvalidRouteShapeGeometry += 1;
      result.invalidRouteSegmentEvidenceRouteShapeRefs.push(`${dir}:segments:missing`);
      result.routeSegmentEvidenceWithInvalidTspEvidence += 1;
      result.invalidRouteSegmentEvidenceTspRefs.push(`${dir}:segments:missing`);
      result.routeSegmentEvidenceWithInvalidRiderDelay += 1;
      result.invalidRouteSegmentEvidenceRiderDelayRefs.push(`${dir}:segments:missing`);
    }
    for (const [index, segment] of routeSegmentEvidence.entries()) {
      result.routeSegmentEvidenceCount += 1;
      const record =
        typeof segment === "object" && segment !== null
          ? (segment as {
              id?: unknown;
              lane?: unknown;
              laneSource?: unknown;
              laneOverlapShare?: unknown;
              laneMatchedCount?: unknown;
              laneTypes?: unknown;
              laneOperatingHours?: unknown;
              laneOperatingDays?: unknown;
              segmentGeometrySource?: unknown;
              segmentGeometryMethod?: unknown;
              segmentGeometry?: unknown;
              tspStatus?: unknown;
              tspSource?: unknown;
              tspSourceDate?: unknown;
              tspSourceUrl?: unknown;
              tspCorridor?: unknown;
              tspMatchMethod?: unknown;
              scheduledMedianTravelTimeMinutes?: unknown;
              scheduledSpeedMph?: unknown;
              observedMinusScheduledMinutes?: unknown;
              scheduledSampleCount?: unknown;
              ridershipExposure?: unknown;
              riderDelayHours?: unknown;
            })
          : {};
      const segmentRef = `${dir}:segments:${typeof record.id === "string" ? record.id : index + 1}`;
      if (hasDotLaneGeometryEvidence(record)) {
        result.routeSegmentEvidenceWithDotLaneGeometry += 1;
      } else {
        result.routeSegmentEvidenceWithInvalidLaneGeometry += 1;
        result.invalidRouteSegmentEvidenceLaneRefs.push(segmentRef);
      }
      if (hasRouteShapeSegmentGeometry(record)) {
        result.routeSegmentEvidenceWithRouteShapeGeometry += 1;
      } else {
        result.routeSegmentEvidenceWithInvalidRouteShapeGeometry += 1;
        result.invalidRouteSegmentEvidenceRouteShapeRefs.push(segmentRef);
      }
      if (hasTspSourceEvidence(record)) {
        result.routeSegmentEvidenceWithTspSourceEvidence += 1;
      } else {
        result.routeSegmentEvidenceWithInvalidTspEvidence += 1;
        result.invalidRouteSegmentEvidenceTspRefs.push(segmentRef);
      }
      if (hasCompleteRiderDelayEvidence(record)) {
        result.routeSegmentEvidenceWithCompleteRiderDelay += 1;
      } else {
        result.routeSegmentEvidenceWithInvalidRiderDelay += 1;
        result.invalidRouteSegmentEvidenceRiderDelayRefs.push(segmentRef);
      }
    }
  }

  return {
    ...result,
    invalidSegmentRefs: result.invalidSegmentRefs.sort(),
    invalidLaneRefs: result.invalidLaneRefs.sort(),
    invalidRouteShapeRefs: result.invalidRouteShapeRefs.sort(),
    invalidTspRefs: result.invalidTspRefs.sort(),
    invalidPublicAiNoteRefs: result.invalidPublicAiNoteRefs.sort(),
    excessPublicAiNoteDensityRefs: result.excessPublicAiNoteDensityRefs.sort(),
    invalidRouteDetailRidershipProfileRefs: result.invalidRouteDetailRidershipProfileRefs.sort(),
    invalidRouteSegmentEvidenceLaneRefs: result.invalidRouteSegmentEvidenceLaneRefs.sort(),
    invalidRouteSegmentEvidenceRouteShapeRefs:
      result.invalidRouteSegmentEvidenceRouteShapeRefs.sort(),
    invalidRouteSegmentEvidenceTspRefs: result.invalidRouteSegmentEvidenceTspRefs.sort(),
    invalidRouteSegmentEvidenceRiderDelayRefs:
      result.invalidRouteSegmentEvidenceRiderDelayRefs.sort(),
    invalidRouteSegmentCoverageRefs: result.invalidRouteSegmentCoverageRefs.sort(),
  };
}

import type {
  InterventionEvidenceStatus,
  InterventionGapRouteInput,
  InterventionUnderperformanceComparisonInput,
  InterventionUnderperformanceRouteInput,
  TreatmentScopeGapSegmentInput,
  TreatmentScopeMismatchSegmentInput,
} from "@bp/analytics/detectors";
import type {
  RouteSegmentTreatmentSummaryFeature,
  RouteTreatmentSourceGapFeature,
  RouteTreatmentSummaryFeature,
} from "@bp/analytics/features";
import { isEnhancedBusStopOnlyLaneTypes } from "@bp/analytics/features";
import type { InterventionComparisonSourceRow } from "./detector-family-features";
import type { InterventionScopeFitRow } from "./intervention-scope-fit";
import type { SegmentSpeedResidualRow } from "./segment-month-panel";
import type { SourceGapModelRow } from "./source-gap-model";

export type RoutePainSourceRow = {
  route_id: unknown;
  month: unknown;
  route_score: unknown;
  public_visible: unknown;
  public_visibility_reason: unknown;
  average_speed_mph: unknown;
  hotspot_count: unknown;
  reliability_status: unknown;
  min_sample_threshold: unknown;
  sample_count: unknown;
  observed_long_gap_share: unknown;
  excess_wait_minutes: unknown;
  wait_reliability_ratio: unknown;
};

export type RouteSegmentSpeedSummarySourceRow = {
  route_id: unknown;
  month: unknown;
  segment_id: unknown;
  direction: unknown;
  stop_order: unknown;
  average_speed_mph: unknown;
  segment_length_feet: unknown;
  observation_count: unknown;
  bus_trip_count: unknown;
};

export type RouteSegmentDaypartSpeedSummarySourceRow = Omit<
  RouteSegmentSpeedSummarySourceRow,
  "segment_length_feet"
> & {
  daypart: unknown;
};

export type RouteSegmentHistoricalSpeedSummarySourceRow = RouteSegmentSpeedSummarySourceRow & {
  stable_segment_key: unknown;
};

export type TreatmentDetectorRouteResolverResult<TRoute> = {
  routes: TRoute[];
  summary: Record<string, unknown>;
};

export type TreatmentDetectorSegmentResolverResult<TSegment> = {
  segments: TSegment[];
  summary: Record<string, unknown>;
};

const POSITIVE_TREATMENT_STATUSES = new Set([
  "current_confirmed",
  "implemented",
  "historical_confirmed",
]);

const FUTURE_TREATMENT_STATUSES = new Set([
  "planned",
  "proposed",
  "under_consideration",
  "candidate",
]);
const MAX_TREATMENT_SOURCE_REFS_PER_ROUTE = 24;
const BUS_LANE_SOURCE_GAP_REF_PATTERN = /^local_intervention_event:bus-lane-source-gap:/;

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

function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "bigint") return value !== 0n;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return false;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function speedPainFromRow(row: RoutePainSourceRow): number | null {
  const publicVisible = booleanValue(row.public_visible);
  const routeScore = numberValue(row.route_score);
  if (publicVisible && routeScore !== null) return clampScore(100 - routeScore);

  const averageSpeedMph = numberValue(row.average_speed_mph);
  const hotspotCount = numberValue(row.hotspot_count) ?? 0;
  if (averageSpeedMph === null || averageSpeedMph <= 0) return null;
  const speedScore = Math.max(0, Math.min(100, (averageSpeedMph / 12) * 100));
  const hotspotPenalty = Math.max(0, Math.min(40, hotspotCount * 5));
  return clampScore(100 - Math.max(0, Math.min(100, speedScore - hotspotPenalty)));
}

function reliabilityPainFromRow(row: RoutePainSourceRow): number | null {
  if (text(row.reliability_status) !== "observed") return null;
  const sampleCount = numberValue(row.sample_count) ?? 0;
  const minSampleThreshold = numberValue(row.min_sample_threshold) ?? 1;
  if (sampleCount < minSampleThreshold) return null;

  const longGapPain = numberValue(row.observed_long_gap_share);
  const excessWaitMinutes = numberValue(row.excess_wait_minutes);
  const waitReliabilityRatio = numberValue(row.wait_reliability_ratio);
  const scores = [
    longGapPain === null ? null : longGapPain * 100,
    excessWaitMinutes === null ? null : (excessWaitMinutes / 90) * 100,
    waitReliabilityRatio === null ? null : waitReliabilityRatio * 4,
  ].filter((score): score is number => score !== null && Number.isFinite(score));
  if (scores.length === 0) return null;
  return clampScore(Math.max(...scores));
}

function painIndex(rows: readonly RoutePainSourceRow[]): Map<string, InterventionGapRouteInput> {
  const output = new Map<string, InterventionGapRouteInput>();
  for (const row of rows) {
    const routeId = text(row.route_id);
    if (routeId === null) continue;
    output.set(routeId, {
      routeId,
      speedPainScore: speedPainFromRow(row),
      reliabilityPainScore: reliabilityPainFromRow(row),
      interventionEvidenceStatus: "absent",
      interventionEvidenceCount: 0,
    });
  }
  return output;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function median(values: readonly number[]): number | null {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const left = sorted[middle - 1];
  const right = sorted[middle];
  if (left === undefined || right === undefined) return null;
  return (left + right) / 2;
}

function slownessPercentileFromRank(rankAscending: number, count: number): number | null {
  if (count <= 0 || rankAscending <= 0) return null;
  if (count === 1) return 1;
  return round(1 - (rankAscending - 1) / (count - 1));
}

function rankAscendingBySpeed(
  rows: readonly { segmentId: string; averageSpeedMph: number | null }[],
): Map<
  string,
  { rank: number; count: number; medianSpeedMph: number | null; slownessPercentile: number | null }
> {
  const supported = rows
    .filter(
      (row): row is { segmentId: string; averageSpeedMph: number } =>
        row.averageSpeedMph !== null && Number.isFinite(row.averageSpeedMph),
    )
    .sort(
      (left, right) =>
        left.averageSpeedMph - right.averageSpeedMph ||
        left.segmentId.localeCompare(right.segmentId),
    );
  const count = supported.length;
  const medianSpeedMph = median(supported.map((row) => row.averageSpeedMph));
  const output = new Map<
    string,
    {
      rank: number;
      count: number;
      medianSpeedMph: number | null;
      slownessPercentile: number | null;
    }
  >();
  supported.forEach((row, index) => {
    const rank = index + 1;
    output.set(row.segmentId, {
      rank,
      count,
      medianSpeedMph: medianSpeedMph === null ? null : round(medianSpeedMph, 4),
      slownessPercentile: slownessPercentileFromRank(rank, count),
    });
  });
  return output;
}

function stableSegmentKey(segmentId: string): string {
  const parts = segmentId.split(":");
  if (parts.length < 6) return segmentId;
  return [parts[0], ...parts.slice(2)].join(":");
}

function directionKey(routeId: string, directionId: string | null): string {
  return `${routeId}\0${directionId ?? ""}`;
}

function routeTokenVariants(routeId: string): string[] {
  const raw = routeId.trim();
  const withoutPlus = raw.replace(/\+/g, "");
  return uniqueSorted([raw, withoutPlus].filter((value) => value.length > 0));
}

function routeSpecificTreatmentSourceRefs(routeId: string, refs: readonly string[]): string[] {
  const tokens = routeTokenVariants(routeId).map((token) => token.toUpperCase());
  return uniqueSorted(
    refs.filter((ref) => {
      const normalized = ref.toUpperCase();
      return tokens.some((token) => {
        const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`).test(normalized);
      });
    }),
  );
}

function isRouteSourceGapRef(ref: string): boolean {
  return BUS_LANE_SOURCE_GAP_REF_PATTERN.test(ref);
}

function isUsablePositiveSegmentTreatment(feature: RouteSegmentTreatmentSummaryFeature): boolean {
  return (
    feature.treatmentType === "bus_lane" &&
    POSITIVE_TREATMENT_STATUSES.has(feature.status) &&
    feature.matchMethod === "route_shape_overlap" &&
    feature.overlapShare !== null &&
    feature.overlapShare > 0 &&
    !isEnhancedBusStopOnlyLaneTypes(feature.laneTypes ?? [])
  );
}

function historicalSpeedContext(input: {
  rows: readonly RouteSegmentHistoricalSpeedSummarySourceRow[];
  releaseMonth: string;
  currentAverageSpeedMph: number | null;
}): TreatmentScopeMismatchSegmentInput["historicalSpeedContext"] {
  const monthRows = input.rows
    .map((row) => ({
      month: text(row.month),
      averageSpeedMph: numberValue(row.average_speed_mph),
    }))
    .filter(
      (row): row is { month: string; averageSpeedMph: number } =>
        row.month !== null && row.averageSpeedMph !== null && Number.isFinite(row.averageSpeedMph),
    )
    .sort((left, right) => left.month.localeCompare(right.month));
  if (monthRows.length === 0) return null;
  const priorRows = monthRows.filter((row) => row.month < input.releaseMonth);
  const prior12Rows = priorRows.slice(-12);
  const prior12MedianSpeedMph = median(prior12Rows.map((row) => row.averageSpeedMph));
  const previous = priorRows.at(-1);
  const slowest = [...monthRows].sort(
    (left, right) =>
      left.averageSpeedMph - right.averageSpeedMph || left.month.localeCompare(right.month),
  )[0];
  return {
    monthCount: monthRows.length,
    priorMonthAverageSpeedMph: previous === undefined ? null : round(previous.averageSpeedMph, 4),
    prior12MedianSpeedMph: prior12MedianSpeedMph === null ? null : round(prior12MedianSpeedMph, 4),
    releaseVsPrior12DeltaMph:
      input.currentAverageSpeedMph === null || prior12MedianSpeedMph === null
        ? null
        : round(input.currentAverageSpeedMph - prior12MedianSpeedMph, 4),
    slowestMonth: slowest?.month ?? null,
    slowestMonthAverageSpeedMph: slowest === undefined ? null : round(slowest.averageSpeedMph, 4),
  };
}

function routeTreatmentCounts(input: {
  routeId: string;
  routeTreatmentFeatures: readonly RouteTreatmentSummaryFeature[];
  routeSegmentTreatmentFeatures?: readonly RouteSegmentTreatmentSummaryFeature[];
  routeTreatmentSourceGapFeatures?: readonly RouteTreatmentSourceGapFeature[];
}): {
  positiveRouteTreatmentCount: number;
  futureRouteTreatmentCount: number;
  positiveSegmentTreatmentCount: number;
  sourceGapCount: number;
  sourceRefs: string[];
} {
  const routeFeatures = input.routeTreatmentFeatures.filter(
    (feature) => feature.routeId === input.routeId,
  );
  const segmentFeatures = (input.routeSegmentTreatmentFeatures ?? []).filter(
    (feature) => feature.routeId === input.routeId,
  );
  const sourceGapFeatures = (input.routeTreatmentSourceGapFeatures ?? []).filter(
    (feature) => feature.routeId === input.routeId,
  );
  const positiveRouteFeatures = routeFeatures.filter((feature) =>
    POSITIVE_TREATMENT_STATUSES.has(feature.status),
  );
  const positiveSegmentFeatures = segmentFeatures.filter((feature) =>
    POSITIVE_TREATMENT_STATUSES.has(feature.status),
  );
  const futureRouteFeatures = routeFeatures.filter((feature) =>
    FUTURE_TREATMENT_STATUSES.has(feature.status),
  );

  return {
    positiveRouteTreatmentCount: positiveRouteFeatures.length,
    futureRouteTreatmentCount: futureRouteFeatures.length,
    positiveSegmentTreatmentCount: positiveSegmentFeatures.length,
    sourceGapCount:
      sourceGapFeatures.length +
      routeFeatures.filter((feature) => feature.status === "source_gap").length,
    sourceRefs: uniqueSorted([
      ...positiveRouteFeatures.flatMap((feature) => feature.sourceRefs),
      ...positiveSegmentFeatures.flatMap((feature) => feature.sourceRefs),
      ...futureRouteFeatures.flatMap((feature) => feature.sourceRefs),
      ...sourceGapFeatures.flatMap((feature) => feature.sourceRefs),
    ]),
  };
}

function sourceGapCountsFromModelRows(input: {
  routeId: string;
  sourceGapModelRows: readonly SourceGapModelRow[];
}): {
  sourceGapCount: number;
  sourceRefs: string[];
} {
  const rows = input.sourceGapModelRows.filter((row) => row.routeId === input.routeId);
  return {
    sourceGapCount: rows.reduce((sum, row) => sum + row.sourceGapCount, 0),
    sourceRefs: uniqueSorted(rows.flatMap((row) => row.sourceRefs)),
  };
}

function interventionEvidenceStatusFor(input: {
  positiveRouteTreatmentCount: number;
  futureRouteTreatmentCount: number;
  sourceGapCount: number;
}): InterventionEvidenceStatus {
  if (input.positiveRouteTreatmentCount > 0) return "dated_or_evaluated";
  if (input.futureRouteTreatmentCount > 0) return "future_only";
  if (input.sourceGapCount > 0) return "thin_source_gap";
  return "absent";
}

function maxPain(route: InterventionGapRouteInput): number | null {
  const scores = [route.speedPainScore, route.reliabilityPainScore].filter(
    (score): score is number => score !== null,
  );
  if (scores.length === 0) return null;
  return Math.max(...scores);
}

export function buildInterventionGapRoutesFromTreatmentFeatures(input: {
  routePainRows: readonly RoutePainSourceRow[];
  routeTreatmentFeatures: readonly RouteTreatmentSummaryFeature[];
  routeTreatmentSourceGapFeatures: readonly RouteTreatmentSourceGapFeature[];
}): TreatmentDetectorRouteResolverResult<InterventionGapRouteInput> {
  const routes = [...painIndex(input.routePainRows).values()]
    .map((route) => {
      const counts = routeTreatmentCounts({
        routeId: route.routeId,
        routeTreatmentFeatures: input.routeTreatmentFeatures,
        routeTreatmentSourceGapFeatures: input.routeTreatmentSourceGapFeatures,
      });
      return {
        ...route,
        interventionEvidenceStatus: interventionEvidenceStatusFor(counts),
        interventionEvidenceCount:
          counts.positiveRouteTreatmentCount +
          counts.futureRouteTreatmentCount +
          counts.sourceGapCount,
      };
    })
    .sort((left, right) => left.routeId.localeCompare(right.routeId));

  return {
    routes,
    summary: {
      sourceKind: "intervention_gap_from_route_pain_and_treatment_summary",
      sourceRowCount: input.routePainRows.length,
      routeTreatmentFeatureCount: input.routeTreatmentFeatures.length,
      routeTreatmentSourceGapFeatureCount: input.routeTreatmentSourceGapFeatures.length,
      routeCount: routes.length,
      featureCount: routes.length,
      routeWithSpeedPainCount: routes.filter((route) => route.speedPainScore !== null).length,
      routeWithReliabilityPainCount: routes.filter((route) => route.reliabilityPainScore !== null)
        .length,
      highPainRouteCount: routes.filter((route) => (maxPain(route) ?? -1) >= 85).length,
      absentInterventionRouteCount: routes.filter(
        (route) => route.interventionEvidenceStatus === "absent",
      ).length,
      thinSourceGapRouteCount: routes.filter(
        (route) => route.interventionEvidenceStatus === "thin_source_gap",
      ).length,
      futureOnlyRouteCount: routes.filter(
        (route) => route.interventionEvidenceStatus === "future_only",
      ).length,
      datedOrEvaluatedRouteCount: routes.filter(
        (route) => route.interventionEvidenceStatus === "dated_or_evaluated",
      ).length,
    },
  };
}

export function buildInterventionGapRoutesFromSourceGapModelRows(input: {
  routePainRows: readonly RoutePainSourceRow[];
  routeTreatmentFeatures: readonly RouteTreatmentSummaryFeature[];
  sourceGapModelRows: readonly SourceGapModelRow[];
}): TreatmentDetectorRouteResolverResult<InterventionGapRouteInput> {
  const routes = [...painIndex(input.routePainRows).values()]
    .map((route) => {
      const treatmentCounts = routeTreatmentCounts({
        routeId: route.routeId,
        routeTreatmentFeatures: input.routeTreatmentFeatures,
      });
      const sourceGapCounts = sourceGapCountsFromModelRows({
        routeId: route.routeId,
        sourceGapModelRows: input.sourceGapModelRows,
      });
      const counts = {
        ...treatmentCounts,
        sourceGapCount: sourceGapCounts.sourceGapCount,
      };
      return {
        ...route,
        interventionEvidenceStatus: interventionEvidenceStatusFor(counts),
        interventionEvidenceCount:
          counts.positiveRouteTreatmentCount +
          counts.futureRouteTreatmentCount +
          counts.sourceGapCount,
      };
    })
    .sort((left, right) => left.routeId.localeCompare(right.routeId));

  return {
    routes,
    summary: {
      sourceKind: "intervention_gap_from_source_gap_model_v1",
      sourceRowCount: input.routePainRows.length,
      routeTreatmentFeatureCount: input.routeTreatmentFeatures.length,
      sourceGapModelRowCount: input.sourceGapModelRows.length,
      sourceGapModelSourceGapCount: input.sourceGapModelRows.reduce(
        (sum, row) => sum + row.sourceGapCount,
        0,
      ),
      routeCount: routes.length,
      featureCount: routes.length,
      routeWithSpeedPainCount: routes.filter((route) => route.speedPainScore !== null).length,
      routeWithReliabilityPainCount: routes.filter((route) => route.reliabilityPainScore !== null)
        .length,
      highPainRouteCount: routes.filter((route) => (maxPain(route) ?? -1) >= 85).length,
      absentInterventionRouteCount: routes.filter(
        (route) => route.interventionEvidenceStatus === "absent",
      ).length,
      thinSourceGapRouteCount: routes.filter(
        (route) => route.interventionEvidenceStatus === "thin_source_gap",
      ).length,
      futureOnlyRouteCount: routes.filter(
        (route) => route.interventionEvidenceStatus === "future_only",
      ).length,
      datedOrEvaluatedRouteCount: routes.filter(
        (route) => route.interventionEvidenceStatus === "dated_or_evaluated",
      ).length,
    },
  };
}

function comparisonInputFromRow(
  row: InterventionComparisonSourceRow,
): { routeId: string; comparison: InterventionUnderperformanceComparisonInput } | null {
  const routeId = text(row.route_id);
  const eventId = text(row.event_id);
  const interventionType = text(row.intervention_type);
  if (routeId === null || eventId === null || interventionType === null) return null;
  return {
    routeId,
    comparison: {
      eventId,
      interventionType,
      comparisonStatus: text(row.comparison_status) ?? "unknown",
      adjustedSpeedDeltaMph: numberValue(row.adjusted_speed_delta_mph),
      comparisonRouteCount: numberValue(row.comparison_route_count) ?? 0,
    },
  };
}

export function buildInterventionUnderperformanceRoutesFromTreatmentFeatures(input: {
  routePainRows: readonly RoutePainSourceRow[];
  interventionComparisonRows: readonly InterventionComparisonSourceRow[];
  routeTreatmentFeatures: readonly RouteTreatmentSummaryFeature[];
  routeSegmentTreatmentFeatures: readonly RouteSegmentTreatmentSummaryFeature[];
}): TreatmentDetectorRouteResolverResult<InterventionUnderperformanceRouteInput> {
  const comparisonsByRoute = new Map<string, InterventionUnderperformanceComparisonInput[]>();
  for (const row of input.interventionComparisonRows) {
    const parsed = comparisonInputFromRow(row);
    if (parsed === null) continue;
    const current = comparisonsByRoute.get(parsed.routeId) ?? [];
    current.push(parsed.comparison);
    comparisonsByRoute.set(parsed.routeId, current);
  }

  const routes = [...painIndex(input.routePainRows).values()]
    .map((route) => {
      const counts = routeTreatmentCounts({
        routeId: route.routeId,
        routeTreatmentFeatures: input.routeTreatmentFeatures,
        routeSegmentTreatmentFeatures: input.routeSegmentTreatmentFeatures,
      });
      return {
        routeId: route.routeId,
        speedPainScore: route.speedPainScore,
        reliabilityPainScore: route.reliabilityPainScore,
        comparisons: (comparisonsByRoute.get(route.routeId) ?? []).sort((left, right) =>
          left.eventId.localeCompare(right.eventId),
        ),
        routeTreatmentEvidenceCount: counts.positiveRouteTreatmentCount,
        segmentTreatmentEvidenceCount: counts.positiveSegmentTreatmentCount,
        treatmentSourceRefs: counts.sourceRefs.slice(0, MAX_TREATMENT_SOURCE_REFS_PER_ROUTE),
        treatmentSourceRefCount: counts.sourceRefs.length,
      };
    })
    .sort((left, right) => left.routeId.localeCompare(right.routeId));

  const routesWithEvaluatedComparison = routes.filter((route) =>
    route.comparisons.some((comparison) => comparison.comparisonStatus === "evaluated"),
  );

  return {
    routes,
    summary: {
      sourceKind:
        "intervention_underperformance_from_route_pain_intervention_comparisons_and_treatment_summary",
      sourceRowCount: input.routePainRows.length,
      interventionComparisonRowCount: input.interventionComparisonRows.length,
      routeTreatmentFeatureCount: input.routeTreatmentFeatures.length,
      routeSegmentTreatmentFeatureCount: input.routeSegmentTreatmentFeatures.length,
      routeCount: routes.length,
      featureCount: routes.length,
      comparisonCount: routes.reduce((sum, route) => sum + route.comparisons.length, 0),
      routeWithComparisonCount: routes.filter((route) => route.comparisons.length > 0).length,
      routeWithEvaluatedComparisonCount: routesWithEvaluatedComparison.length,
      routeWithRouteTreatmentEvidenceCount: routes.filter(
        (route) => (route.routeTreatmentEvidenceCount ?? 0) > 0,
      ).length,
      routeWithSegmentTreatmentEvidenceCount: routes.filter(
        (route) => (route.segmentTreatmentEvidenceCount ?? 0) > 0,
      ).length,
      highPainWithEvaluatedComparisonCount: routesWithEvaluatedComparison.filter(
        (route) => Math.max(route.speedPainScore ?? -1, route.reliabilityPainScore ?? -1) >= 85,
      ).length,
    },
  };
}

export function buildTreatmentScopeMismatchSegmentsFromTreatmentFeatures(input: {
  segmentSpeedRows: readonly RouteSegmentSpeedSummarySourceRow[];
  segmentDaypartSpeedRows?: readonly RouteSegmentDaypartSpeedSummarySourceRow[];
  segmentHistoricalSpeedRows?: readonly RouteSegmentHistoricalSpeedSummarySourceRow[];
  segmentSpeedResidualRows?: readonly SegmentSpeedResidualRow[];
  routeSegmentTreatmentFeatures: readonly RouteSegmentTreatmentSummaryFeature[];
}): TreatmentDetectorSegmentResolverResult<TreatmentScopeMismatchSegmentInput> {
  const speedBySegment = new Map<
    string,
    {
      averageSpeedMph: number | null;
      segmentLengthFeet: number | null;
      observationCount: number | null;
      busTripCount: number | null;
    }
  >();
  const speedRowsForRanking: Array<{
    routeId: string;
    segmentId: string;
    averageSpeedMph: number | null;
  }> = [];
  const directionMaxOrder = new Map<string, number>();
  for (const row of input.segmentSpeedRows) {
    const segmentId = text(row.segment_id);
    const routeId = text(row.route_id);
    const directionId = text(row.direction);
    const segmentOrder = numberValue(row.stop_order);
    if (segmentId === null) continue;
    const speed = {
      averageSpeedMph: numberValue(row.average_speed_mph),
      segmentLengthFeet: numberValue(row.segment_length_feet),
      observationCount: numberValue(row.observation_count),
      busTripCount: numberValue(row.bus_trip_count),
    };
    speedBySegment.set(segmentId, speed);
    if (routeId !== null) {
      speedRowsForRanking.push({
        routeId,
        segmentId,
        averageSpeedMph: speed.averageSpeedMph,
      });
      if (segmentOrder !== null) {
        const key = directionKey(routeId, directionId);
        directionMaxOrder.set(key, Math.max(directionMaxOrder.get(key) ?? 0, segmentOrder));
      }
    }
  }

  const daypartSpeedsBySegment = new Map<
    string,
    Array<{
      daypart: string;
      averageSpeedMph: number | null;
      observationCount: number;
      busTripCount: number;
    }>
  >();
  for (const row of input.segmentDaypartSpeedRows ?? []) {
    const segmentId = text(row.segment_id);
    const daypart = text(row.daypart);
    if (segmentId === null || daypart === null) continue;
    const current = daypartSpeedsBySegment.get(segmentId) ?? [];
    current.push({
      daypart,
      averageSpeedMph: numberValue(row.average_speed_mph),
      observationCount: numberValue(row.observation_count) ?? 0,
      busTripCount: numberValue(row.bus_trip_count) ?? 0,
    });
    daypartSpeedsBySegment.set(segmentId, current);
  }
  for (const [segmentId, rows] of daypartSpeedsBySegment.entries()) {
    daypartSpeedsBySegment.set(
      segmentId,
      rows.sort((left, right) => left.daypart.localeCompare(right.daypart)),
    );
  }
  const historicalRowsByStableKey = new Map<
    string,
    RouteSegmentHistoricalSpeedSummarySourceRow[]
  >();
  for (const row of input.segmentHistoricalSpeedRows ?? []) {
    const stableKey = text(row.stable_segment_key);
    if (stableKey === null) continue;
    const current = historicalRowsByStableKey.get(stableKey) ?? [];
    current.push(row);
    historicalRowsByStableKey.set(stableKey, current);
  }
  const residualBySegment = new Map(
    (input.segmentSpeedResidualRows ?? []).map((row) => [row.segmentId, row] as const),
  );

  const networkRanks = rankAscendingBySpeed(speedRowsForRanking);
  const routeRows = new Map<string, typeof speedRowsForRanking>();
  for (const row of speedRowsForRanking) {
    const current = routeRows.get(row.routeId) ?? [];
    current.push(row);
    routeRows.set(row.routeId, current);
  }
  const routeRanks = new Map<
    string,
    {
      rank: number;
      count: number;
      medianSpeedMph: number | null;
      slownessPercentile: number | null;
    }
  >();
  for (const rows of routeRows.values()) {
    for (const [segmentId, rank] of rankAscendingBySpeed(rows).entries()) {
      routeRanks.set(segmentId, rank);
    }
  }

  const segments = input.routeSegmentTreatmentFeatures
    .filter((feature) => feature.treatmentType === "bus_lane")
    .map((feature) => {
      const speed = speedBySegment.get(feature.segmentId);
      const daypartSpeeds = daypartSpeedsBySegment.get(feature.segmentId) ?? [];
      const slowestDaypart = [...daypartSpeeds]
        .filter(
          (row): row is typeof row & { averageSpeedMph: number } =>
            row.averageSpeedMph !== null && Number.isFinite(row.averageSpeedMph),
        )
        .sort(
          (left, right) =>
            left.averageSpeedMph - right.averageSpeedMph ||
            left.daypart.localeCompare(right.daypart),
        )[0];
      const routeRank = routeRanks.get(feature.segmentId);
      const networkRank = networkRanks.get(feature.segmentId);
      const currentAverageSpeedMph = speed?.averageSpeedMph ?? null;
      const residual = residualBySegment.get(feature.segmentId);
      return {
        routeId: feature.routeId,
        segmentId: feature.segmentId,
        directionId: feature.directionId,
        segmentOrder: feature.segmentOrder,
        directionMaxSegmentOrder:
          directionMaxOrder.get(directionKey(feature.routeId, feature.directionId)) ?? null,
        treatmentType: feature.treatmentType,
        treatmentStatus: feature.status,
        matchMethod: feature.matchMethod,
        overlapShare: feature.overlapShare,
        treatmentConfidence: feature.confidence,
        treatmentSourceRefs: [...feature.sourceRefs],
        laneTypes: [...(feature.laneTypes ?? [])],
        averageSpeedMph: currentAverageSpeedMph,
        segmentLengthFeet: speed?.segmentLengthFeet ?? null,
        observationCount: speed?.observationCount ?? null,
        busTripCount: speed?.busTripCount ?? null,
        daypartSpeeds,
        slowestDaypart: slowestDaypart?.daypart ?? null,
        slowestDaypartAverageSpeedMph:
          slowestDaypart?.averageSpeedMph === undefined ? null : slowestDaypart.averageSpeedMph,
        historicalSpeedContext: historicalSpeedContext({
          rows: historicalRowsByStableKey.get(stableSegmentKey(feature.segmentId)) ?? [],
          releaseMonth: text(input.segmentSpeedRows[0]?.month) ?? "",
          currentAverageSpeedMph,
        }),
        speedResidualContext:
          residual === undefined
            ? null
            : {
                expectedSpeedMph: residual.expectedSpeedMph,
                speedResidualMph: residual.speedResidualMph,
                residualPercentileWithinMonth: residual.residualPercentileWithinMonth,
                residualRankWithinMonth: residual.residualRankWithinMonth,
                residualMonthCount: residual.residualMonthCount,
                segmentHistoryMeanSpeedMph: residual.segmentHistoryMeanSpeedMph,
                segmentHistoryMedianSpeedMph: residual.segmentHistoryMedianSpeedMph,
                segmentHistoryMonthCount: residual.segmentHistoryMonthCount,
                routeMonthMeanSpeedMph: residual.routeMonthMeanSpeedMph,
                routeHistoryMeanSpeedMph: residual.routeHistoryMeanSpeedMph,
                modelId: "segment_speed_residuals_v1",
              },
        routeMedianSegmentSpeedMph: routeRank?.medianSpeedMph ?? null,
        routeSegmentSpeedRank: routeRank?.rank ?? null,
        routeSegmentCount: routeRank?.count ?? null,
        routeSlownessPercentile: routeRank?.slownessPercentile ?? null,
        networkMedianSegmentSpeedMph: networkRank?.medianSpeedMph ?? null,
        networkSegmentSpeedRank: networkRank?.rank ?? null,
        networkSegmentCount: networkRank?.count ?? null,
        networkSlownessPercentile: networkRank?.slownessPercentile ?? null,
      };
    })
    .sort((left, right) => left.segmentId.localeCompare(right.segmentId));

  return {
    segments,
    summary: {
      sourceKind: "treatment_scope_mismatch_from_segment_speed_and_treatment_summary",
      sourceRowCount: input.segmentSpeedRows.length,
      routeSegmentTreatmentFeatureCount: input.routeSegmentTreatmentFeatures.length,
      segmentCount: segments.length,
      featureCount: segments.length,
      segmentWithSpeedCount: segments.filter((segment) => segment.averageSpeedMph !== null).length,
      currentBusLaneSegmentCount: segments.filter(
        (segment) => segment.treatmentStatus === "current_confirmed",
      ).length,
      notFoundBusLaneSegmentCount: segments.filter(
        (segment) => segment.treatmentStatus === "not_found",
      ).length,
      routeShapeOverlapSegmentCount: segments.filter(
        (segment) => segment.matchMethod === "route_shape_overlap",
      ).length,
      segmentWithDaypartContextCount: segments.filter((segment) => segment.daypartSpeeds.length > 0)
        .length,
      segmentWithSpeedResidualContextCount: segments.filter(
        (segment) => segment.speedResidualContext !== null,
      ).length,
      segmentWithRoutePeerRankCount: segments.filter(
        (segment) => segment.routeSegmentSpeedRank !== null,
      ).length,
      segmentWithNetworkPeerRankCount: segments.filter(
        (segment) => segment.networkSegmentSpeedRank !== null,
      ).length,
    },
  };
}

export function buildTreatmentScopeGapSegmentsFromTreatmentFeatures(input: {
  segmentSpeedRows: readonly RouteSegmentSpeedSummarySourceRow[];
  segmentDaypartSpeedRows?: readonly RouteSegmentDaypartSpeedSummarySourceRow[];
  segmentSpeedResidualRows?: readonly SegmentSpeedResidualRow[];
  routeTreatmentFeatures: readonly RouteTreatmentSummaryFeature[];
  routeSegmentTreatmentFeatures: readonly RouteSegmentTreatmentSummaryFeature[];
  interventionScopeFitRows?: readonly InterventionScopeFitRow[];
}): TreatmentDetectorSegmentResolverResult<TreatmentScopeGapSegmentInput> {
  const directionMaxOrder = new Map<string, number>();
  for (const row of input.segmentSpeedRows) {
    const routeId = text(row.route_id);
    const directionId = text(row.direction);
    const segmentOrder = numberValue(row.stop_order);
    if (routeId === null || segmentOrder === null) continue;
    const key = directionKey(routeId, directionId);
    directionMaxOrder.set(key, Math.max(directionMaxOrder.get(key) ?? 0, segmentOrder));
  }
  const mismatch = buildTreatmentScopeMismatchSegmentsFromTreatmentFeatures({
    segmentSpeedRows: input.segmentSpeedRows,
    ...(input.segmentDaypartSpeedRows === undefined
      ? {}
      : { segmentDaypartSpeedRows: input.segmentDaypartSpeedRows }),
    ...(input.segmentSpeedResidualRows === undefined
      ? {}
      : { segmentSpeedResidualRows: input.segmentSpeedResidualRows }),
    routeSegmentTreatmentFeatures: input.routeSegmentTreatmentFeatures,
  });
  const routeTreatmentRefs = new Map<string, string[]>();
  const positiveRouteTreatmentCounts = new Map<string, number>();
  const sourceGapBlockedRoutes = new Set<string>();
  const usablePositiveSegmentCountByRoute = new Map<string, number>();
  for (const feature of input.routeSegmentTreatmentFeatures) {
    if (!isUsablePositiveSegmentTreatment(feature)) continue;
    usablePositiveSegmentCountByRoute.set(
      feature.routeId,
      (usablePositiveSegmentCountByRoute.get(feature.routeId) ?? 0) + 1,
    );
  }
  for (const feature of input.routeTreatmentFeatures) {
    if (feature.treatmentType !== "bus_lane" || !POSITIVE_TREATMENT_STATUSES.has(feature.status)) {
      continue;
    }
    const routeSpecificRefs = routeSpecificTreatmentSourceRefs(feature.routeId, feature.sourceRefs);
    if (routeSpecificRefs.some(isRouteSourceGapRef)) {
      sourceGapBlockedRoutes.add(feature.routeId);
    }
    if (routeSpecificRefs.length === 0) continue;
    if ((usablePositiveSegmentCountByRoute.get(feature.routeId) ?? 0) === 0) continue;
    positiveRouteTreatmentCounts.set(
      feature.routeId,
      (positiveRouteTreatmentCounts.get(feature.routeId) ?? 0) + 1,
    );
    routeTreatmentRefs.set(
      feature.routeId,
      uniqueSorted([...(routeTreatmentRefs.get(feature.routeId) ?? []), ...routeSpecificRefs]),
    );
  }
  const segmentById = new Map(mismatch.segments.map((segment) => [segment.segmentId, segment]));
  const segmentTreatmentById = new Map<string, RouteSegmentTreatmentSummaryFeature[]>();
  for (const feature of input.routeSegmentTreatmentFeatures) {
    const current = segmentTreatmentById.get(feature.segmentId) ?? [];
    current.push(feature);
    segmentTreatmentById.set(feature.segmentId, current);
  }
  const scopeFitBySegmentId = new Map<string, InterventionScopeFitRow>();
  for (const row of input.interventionScopeFitRows ?? []) {
    if (row.segmentId === null || row.treatmentType !== "bus_lane") continue;
    const current = scopeFitBySegmentId.get(row.segmentId);
    if (
      current === undefined ||
      (row.overlapShare ?? -1) > (current.overlapShare ?? -1) ||
      row.fitStatus.localeCompare(current.fitStatus) < 0
    ) {
      scopeFitBySegmentId.set(row.segmentId, row);
    }
  }
  const segments = input.segmentSpeedRows
    .flatMap((row): TreatmentScopeGapSegmentInput[] => {
      const routeId = text(row.route_id);
      const segmentId = text(row.segment_id);
      const directionId = text(row.direction);
      if (routeId === null || segmentId === null) return [];
      const covered = segmentById.get(segmentId);
      const treatments = segmentTreatmentById.get(segmentId) ?? [];
      const scopeFit = scopeFitBySegmentId.get(segmentId);
      const strongestTreatment = treatments
        .filter((feature) => feature.treatmentType === "bus_lane")
        .sort((left, right) => (right.overlapShare ?? 0) - (left.overlapShare ?? 0))[0];
      const base = covered ?? {
        routeId,
        segmentId,
        directionId,
        segmentOrder: numberValue(row.stop_order),
        directionMaxSegmentOrder: directionMaxOrder.get(directionKey(routeId, directionId)) ?? null,
        daypartSpeeds: [],
        slowestDaypart: null,
        slowestDaypartAverageSpeedMph: null,
        routeMedianSegmentSpeedMph: null,
        routeSegmentSpeedRank: null,
        routeSegmentCount: null,
        routeSlownessPercentile: null,
        networkMedianSegmentSpeedMph: null,
        networkSegmentSpeedRank: null,
        networkSegmentCount: null,
        networkSlownessPercentile: null,
      };
      return [
        {
          ...base,
          routeId,
          segmentId,
          averageSpeedMph: numberValue(row.average_speed_mph),
          segmentLengthFeet: numberValue(row.segment_length_feet),
          observationCount: numberValue(row.observation_count),
          busTripCount: numberValue(row.bus_trip_count),
          treatmentType: strongestTreatment?.treatmentType ?? null,
          treatmentStatus: strongestTreatment?.status ?? null,
          matchMethod: strongestTreatment?.matchMethod ?? null,
          overlapShare: strongestTreatment?.overlapShare ?? null,
          routeTreatmentSourceRefs: (routeTreatmentRefs.get(routeId) ?? []).slice(
            0,
            MAX_TREATMENT_SOURCE_REFS_PER_ROUTE,
          ),
          segmentTreatmentSourceRefs: uniqueSorted(
            treatments.flatMap((feature) => feature.sourceRefs),
          ),
          positiveRouteTreatmentCount: sourceGapBlockedRoutes.has(routeId)
            ? 0
            : (positiveRouteTreatmentCounts.get(routeId) ?? 0),
          positiveSegmentTreatmentCount: treatments.filter(isUsablePositiveSegmentTreatment).length,
          treatmentScopeFitContext: sourceGapBlockedRoutes.has(routeId)
            ? {
                fitStatus: "source_gap_blocked",
                sourceGapCount: 1,
                sourceGapKinds: ["bus_lane_source_gap"],
                blocksClaims: ["absence"],
              }
            : scopeFit === undefined
              ? null
              : {
                  fitStatus: scopeFit.fitStatus,
                  sourceGapCount: scopeFit.sourceGapCount,
                  sourceGapKinds: [...scopeFit.sourceGapKinds],
                  blocksClaims: [...scopeFit.blocksClaims],
                },
        },
      ];
    })
    .sort((left, right) => left.segmentId.localeCompare(right.segmentId));

  return {
    segments,
    summary: {
      sourceKind: "treatment_scope_gap_from_segment_speed_and_treatment_summary",
      sourceRowCount: input.segmentSpeedRows.length,
      routeTreatmentFeatureCount: input.routeTreatmentFeatures.length,
      routeSegmentTreatmentFeatureCount: input.routeSegmentTreatmentFeatures.length,
      routeWithUsablePositiveSegmentTreatmentCount: usablePositiveSegmentCountByRoute.size,
      sourceGapBlockedRouteCount: sourceGapBlockedRoutes.size,
      interventionScopeFitRowCount: input.interventionScopeFitRows?.length ?? 0,
      segmentWithScopeFitContextCount: segments.filter(
        (segment) => segment.treatmentScopeFitContext !== null,
      ).length,
      segmentWithSpeedResidualContextCount: segments.filter(
        (segment) => segment.speedResidualContext !== null,
      ).length,
      segmentCount: segments.length,
      featureCount: segments.length,
      segmentWithPositiveRouteTreatmentCount: segments.filter(
        (segment) => segment.positiveRouteTreatmentCount > 0,
      ).length,
      segmentWithPositiveSegmentTreatmentCount: segments.filter(
        (segment) => segment.positiveSegmentTreatmentCount > 0,
      ).length,
    },
  };
}

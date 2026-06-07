import type { InterventionPanelFeature } from "@bp/analytics/features";
import { summarizeInterventionGates } from "@bp/analytics/calibration";
import {
  buildInterventionPanelFeatures,
  type InterventionComparisonSourceRow,
} from "./detector-family-features";
import type { PanelManifest, PanelSpec } from "./panel-spec";
import type { RouteMetricHistorySourceRow } from "./runtime-history";

export const TREATMENT_EVENT_PANEL_V1_ID = "treatment_event_panel_v1" as const;

export type TreatmentEventPanelSpec = {
  readonly panelId: typeof TREATMENT_EVENT_PANEL_V1_ID;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
  readonly routeId?: string;
};

export type TreatmentEventPanelArtifactV1 = {
  readonly artifactKind: typeof TREATMENT_EVENT_PANEL_V1_ID;
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly artifactPath: string | null;
  readonly releaseMonth: string;
  readonly historyWindow: {
    readonly startMonth: string;
    readonly endMonth: string;
  };
  readonly panelSpec: TreatmentEventPanelSpec;
  readonly panelManifest: PanelManifest;
  readonly summary: {
    readonly sourceRowCount: number;
    readonly panelRowCount: number;
    readonly supportedRowCount: number;
    readonly routeCount: number;
    readonly eventCount: number;
    readonly eligibleControlRowCount: number;
    readonly effectEstimateRowCount: number;
    readonly candidateCausalEligibleRowCount: number;
    readonly gateStatusCounts: TreatmentEventPanelGateStatusCounts;
  };
  readonly rows: readonly InterventionPanelFeature[];
};

export type TreatmentEventPanelGateStatusCounts = {
  readonly preTrendStatus: Record<string, number>;
  readonly placeboInTimeStatus: Record<string, number>;
  readonly placeboInSpaceStatus: Record<string, number>;
  readonly autocorrelationStatus: Record<string, number>;
  readonly methodDivergenceStatus: Record<string, number>;
};

export type TreatmentEventCandidateCausalReviewRow = {
  readonly reviewId: string;
  readonly eventId: string;
  readonly interventionType: string;
  readonly routeId: string;
  readonly interventionDate: string | null;
  readonly preWindowStart: string | null;
  readonly preWindowEnd: string | null;
  readonly postWindowStart: string | null;
  readonly postWindowEnd: string | null;
  readonly eventStudyEstimate: number;
  readonly matchedPeerDelta: number | null;
  readonly controlRouteCount: number;
  readonly gateSummary: ReturnType<typeof summarizeInterventionGates>;
  readonly reviewDisposition: "needs_methodology_review";
  readonly publicClaimAllowed: false;
};

export type TreatmentEventCandidateCausalReviewProjection = {
  readonly artifactKind: "treatment_event_candidate_causal_review_projection";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly historyWindow: TreatmentEventPanelArtifactV1["historyWindow"];
  readonly sourceModelId: typeof TREATMENT_EVENT_PANEL_V1_ID;
  readonly sourcePanelRowCount: number;
  readonly summary: {
    readonly candidateCausalEligibleRowCount: number;
    readonly routeCount: number;
    readonly eventCount: number;
    readonly maxAbsEffectEstimateMph: number | null;
    readonly publicClaimAllowedCount: 0;
  };
  readonly rows: readonly TreatmentEventCandidateCausalReviewRow[];
  readonly limitations: readonly string[];
};

type RouteSpeedPoint = {
  readonly month: string;
  readonly monthIndex: number;
  readonly speedMph: number;
};

type GateThresholds = {
  readonly minWindowPoints: number;
  readonly maxPreTrendSlopeDifferenceMphPerMonth: number;
  readonly maxPlaceboDeltaDifferenceMph: number;
  readonly maxLag1AutocorrelationAbs: number;
  readonly maxMethodDeltaDifferenceMph: number;
};

const DEFAULT_GATE_THRESHOLDS: GateThresholds = {
  minWindowPoints: 3,
  maxPreTrendSlopeDifferenceMphPerMonth: 0.15,
  maxPlaceboDeltaDifferenceMph: 0.5,
  maxLag1AutocorrelationAbs: 0.65,
  maxMethodDeltaDifferenceMph: 1,
};

export function treatmentEventPanelSpecV1(input: TreatmentEventPanelSpec): PanelSpec {
  const spec: PanelSpec = {
    panelId: TREATMENT_EVENT_PANEL_V1_ID,
    schemaVersion: 1,
    grain: "event_id + treated_scope_kind + treated_scope_id",
    timeKey: "intervention_date + release_month",
    entityKeys: ["event_id", "treated_scope_kind", "treated_scope_id"],
    measures: [
      "event_study_estimate",
      "matched_peer_delta",
      "control_eligibility_status",
      "pre_trend_status",
      "placebo_status",
    ],
    joins: ["local_route_intervention_comparison", "local_intervention_event"],
    coverage: [
      "pre_window",
      "post_window",
      "comparison_route_count",
      "effect_estimate",
      "methodology_gate_status",
    ],
    historyWindow: {
      startMonth: input.historyStartMonth,
      endMonth: input.releaseMonth,
    },
    releaseFilter: { month: input.releaseMonth },
    requiredProducts: [
      {
        productId: "local_route_intervention_comparison_history",
        state: "available",
        role: "source",
        reason: "Route-level comparison rows provide pre/post windows, peer counts, and adjusted deltas.",
      },
      {
        productId: "local_intervention_events_release",
        state: "available",
        role: "source",
        reason: "Intervention event rows provide implementation dates and intervention type.",
      },
    ],
    eligibilityRules: [
      {
        ruleId: "pre_post_window_available",
        description: "Rows need intervention date plus pre and post windows for event-study screening.",
      },
      {
        ruleId: "counterfactual_available",
        description: "Rows need enough comparison routes before stronger association language.",
      },
      {
        ruleId: "methodology_gates_recorded",
        description: "Pre-trend, placebo, autocorrelation, and method-divergence status must be explicit.",
      },
    ],
    negativeMeaning:
      "A clean no-hit means the event row was represented and did not pass current association gates; it is not proof that the intervention had no effect.",
  };
  return input.routeId === undefined ? spec : { ...spec, scopeFilter: { routeId: input.routeId } };
}

function candidateCausalEligible(feature: InterventionPanelFeature): boolean {
  return summarizeInterventionGates({
    controlEligibilityStatus: feature.controlEligibilityStatus,
    preTrendStatus: feature.preTrendStatus,
    placeboInTimeStatus: feature.placeboInTimeStatus ?? feature.placeboStatus,
    placeboInSpaceStatus: feature.placeboInSpaceStatus ?? feature.placeboStatus,
    autocorrelationStatus: feature.autocorrelationStatus ?? "not_tested",
    methodDivergenceStatus: feature.methodDivergenceStatus ?? "not_tested",
  }).candidateCausalEligible;
}

function gateSummaryFor(feature: InterventionPanelFeature): ReturnType<typeof summarizeInterventionGates> {
  return summarizeInterventionGates({
    controlEligibilityStatus: feature.controlEligibilityStatus,
    preTrendStatus: feature.preTrendStatus,
    placeboInTimeStatus: feature.placeboInTimeStatus ?? feature.placeboStatus,
    placeboInSpaceStatus: feature.placeboInSpaceStatus ?? feature.placeboStatus,
    autocorrelationStatus: feature.autocorrelationStatus ?? "not_tested",
    methodDivergenceStatus: feature.methodDivergenceStatus ?? "not_tested",
  });
}

function reviewIdFor(feature: InterventionPanelFeature): string {
  return [feature.eventId, feature.treatedScopeKind, feature.treatedScopeId].join(":");
}

function countValues(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function gateStatusCounts(rows: readonly InterventionPanelFeature[]): TreatmentEventPanelGateStatusCounts {
  return {
    preTrendStatus: countValues(rows.map((row) => row.preTrendStatus)),
    placeboInTimeStatus: countValues(
      rows.map((row) => row.placeboInTimeStatus ?? row.placeboStatus),
    ),
    placeboInSpaceStatus: countValues(
      rows.map((row) => row.placeboInSpaceStatus ?? row.placeboStatus),
    ),
    autocorrelationStatus: countValues(rows.map((row) => row.autocorrelationStatus ?? "not_tested")),
    methodDivergenceStatus: countValues(
      rows.map((row) => row.methodDivergenceStatus ?? "not_tested"),
    ),
  };
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

function monthIndex(month: string): number | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (match === null) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    return null;
  }
  return year * 12 + monthNumber - 1;
}

function routeHistoryIndex(
  rows: readonly RouteMetricHistorySourceRow[],
): Map<string, RouteSpeedPoint[]> {
  const byRoute = new Map<string, RouteSpeedPoint[]>();
  for (const row of rows) {
    const routeId = text(row.route_id);
    const month = text(row.month);
    const speedMph = numberValue(row.average_speed_mph);
    if (routeId === null || month === null || speedMph === null) continue;
    const index = monthIndex(month);
    if (index === null) continue;
    const current = byRoute.get(routeId) ?? [];
    current.push({ month, monthIndex: index, speedMph });
    byRoute.set(routeId, current);
  }
  for (const [routeId, points] of byRoute.entries()) {
    byRoute.set(
      routeId,
      points.sort((left, right) => left.monthIndex - right.monthIndex || left.month.localeCompare(right.month)),
    );
  }
  return byRoute;
}

function pointsInWindow(
  points: readonly RouteSpeedPoint[] | undefined,
  startMonth: string | null,
  endMonth: string | null,
): RouteSpeedPoint[] {
  if (points === undefined || startMonth === null || endMonth === null) return [];
  const start = monthIndex(startMonth);
  const end = monthIndex(endMonth);
  if (start === null || end === null || end < start) return [];
  return points.filter((point) => point.monthIndex >= start && point.monthIndex <= end);
}

function pointsBeforeMonth(
  points: readonly RouteSpeedPoint[] | undefined,
  endExclusiveMonth: string | null,
): RouteSpeedPoint[] {
  if (points === undefined || endExclusiveMonth === null) return [];
  const endExclusive = monthIndex(endExclusiveMonth);
  if (endExclusive === null) return [];
  return points.filter((point) => point.monthIndex < endExclusive);
}

function monthFromDateOrMonth(value: string | null): string | null {
  if (value === null) return null;
  const match = /^(\d{4}-\d{2})/.exec(value);
  return match?.[1] ?? null;
}

function diagnosticPrePoints(input: {
  readonly points: readonly RouteSpeedPoint[] | undefined;
  readonly preStartMonth: string | null;
  readonly preEndMonth: string | null;
  readonly interventionMonth: string | null;
  readonly minWindowPoints: number;
}): RouteSpeedPoint[] {
  const windowPoints = pointsInWindow(input.points, input.preStartMonth, input.preEndMonth);
  if (windowPoints.length >= input.minWindowPoints * 2) return windowPoints;
  const expanded = pointsBeforeMonth(input.points, input.interventionMonth);
  return expanded.length > windowPoints.length ? expanded : windowPoints;
}

function mean(values: readonly number[]): number | null {
  const supported = values.filter((value) => Number.isFinite(value));
  if (supported.length === 0) return null;
  return supported.reduce((sum, value) => sum + value, 0) / supported.length;
}

function slope(points: readonly RouteSpeedPoint[]): number | null {
  if (points.length < 2) return null;
  const meanX = mean(points.map((point) => point.monthIndex));
  const meanY = mean(points.map((point) => point.speedMph));
  if (meanX === null || meanY === null) return null;
  let numerator = 0;
  let denominator = 0;
  for (const point of points) {
    numerator += (point.monthIndex - meanX) * (point.speedMph - meanY);
    denominator += (point.monthIndex - meanX) ** 2;
  }
  return denominator === 0 ? null : numerator / denominator;
}

function lag1Autocorrelation(points: readonly RouteSpeedPoint[]): number | null {
  if (points.length < 4) return null;
  const sorted = [...points].sort((left, right) => left.monthIndex - right.monthIndex);
  const pairs: Array<readonly [number, number]> = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (previous === undefined || current === undefined) continue;
    if (current.monthIndex - previous.monthIndex !== 1) continue;
    pairs.push([previous.speedMph, current.speedMph]);
  }
  if (pairs.length < 3) return null;
  const xs = pairs.map((pair) => pair[0]);
  const ys = pairs.map((pair) => pair[1]);
  const meanX = mean(xs);
  const meanY = mean(ys);
  if (meanX === null || meanY === null) return null;
  let numerator = 0;
  let xDenominator = 0;
  let yDenominator = 0;
  for (const [x, y] of pairs) {
    numerator += (x - meanX) * (y - meanY);
    xDenominator += (x - meanX) ** 2;
    yDenominator += (y - meanY) ** 2;
  }
  if (xDenominator === 0 || yDenominator === 0) return null;
  return numerator / Math.sqrt(xDenominator * yDenominator);
}

function averageDiagnosticPreSlope(input: {
  readonly routeIds: readonly string[];
  readonly history: Map<string, RouteSpeedPoint[]>;
  readonly preStartMonth: string | null;
  readonly preEndMonth: string | null;
  readonly interventionMonth: string | null;
  readonly minWindowPoints: number;
}): number | null {
  const slopes = input.routeIds
    .map((routeId) =>
      slope(
        diagnosticPrePoints({
          points: input.history.get(routeId),
          preStartMonth: input.preStartMonth,
          preEndMonth: input.preEndMonth,
          interventionMonth: input.interventionMonth,
          minWindowPoints: input.minWindowPoints,
        }),
      ),
    )
    .filter((value): value is number => value !== null && Number.isFinite(value));
  if (slopes.length === 0) return null;
  return mean(slopes);
}

function averageDelta(input: {
  readonly routeIds: readonly string[];
  readonly history: Map<string, RouteSpeedPoint[]>;
  readonly preStartMonth: string | null;
  readonly preEndMonth: string | null;
  readonly postStartMonth: string | null;
  readonly postEndMonth: string | null;
  readonly minWindowPoints: number;
}): number | null {
  const deltas = input.routeIds
    .map((routeId) => {
      const points = input.history.get(routeId);
      const pre = pointsInWindow(points, input.preStartMonth, input.preEndMonth);
      const post = pointsInWindow(points, input.postStartMonth, input.postEndMonth);
      if (pre.length < input.minWindowPoints || post.length < input.minWindowPoints) return null;
      const preMean = mean(pre.map((point) => point.speedMph));
      const postMean = mean(post.map((point) => point.speedMph));
      return preMean === null || postMean === null ? null : postMean - preMean;
    })
    .filter((value): value is number => value !== null && Number.isFinite(value));
  if (deltas.length === 0) return null;
  return mean(deltas);
}

function firstHalfWindow(points: readonly RouteSpeedPoint[]): RouteSpeedPoint[] {
  return points.slice(0, Math.floor(points.length / 2));
}

function secondHalfWindow(points: readonly RouteSpeedPoint[]): RouteSpeedPoint[] {
  return points.slice(Math.ceil(points.length / 2));
}

function splitDelta(points: readonly RouteSpeedPoint[], minWindowPoints: number): number | null {
  const first = firstHalfWindow(points);
  const second = secondHalfWindow(points);
  if (first.length < minWindowPoints || second.length < minWindowPoints) return null;
  const firstMean = mean(first.map((point) => point.speedMph));
  const secondMean = mean(second.map((point) => point.speedMph));
  return firstMean === null || secondMean === null ? null : secondMean - firstMean;
}

function averageDiagnosticPreSplitDelta(input: {
  readonly routeIds: readonly string[];
  readonly history: Map<string, RouteSpeedPoint[]>;
  readonly preStartMonth: string | null;
  readonly preEndMonth: string | null;
  readonly interventionMonth: string | null;
  readonly minWindowPoints: number;
}): number | null {
  const deltas = input.routeIds
    .map((routeId) =>
      splitDelta(
        diagnosticPrePoints({
          points: input.history.get(routeId),
          preStartMonth: input.preStartMonth,
          preEndMonth: input.preEndMonth,
          interventionMonth: input.interventionMonth,
          minWindowPoints: input.minWindowPoints,
        }),
        input.minWindowPoints,
      ),
    )
    .filter((value): value is number => value !== null && Number.isFinite(value));
  if (deltas.length === 0) return null;
  return mean(deltas);
}

function sameDirection(left: number, right: number): boolean {
  if (Math.abs(left) < 0.05 || Math.abs(right) < 0.05) return true;
  return Math.sign(left) === Math.sign(right);
}

function sourceKey(row: InterventionComparisonSourceRow): string | null {
  const routeId = text(row.route_id);
  const eventId = text(row.event_id);
  if (routeId === null || eventId === null) return null;
  return `${eventId}\0route\0${routeId}`;
}

function applyGateDiagnostics(input: {
  readonly features: readonly InterventionPanelFeature[];
  readonly comparisonRows: readonly InterventionComparisonSourceRow[];
  readonly routeMetricHistoryRows?: readonly RouteMetricHistorySourceRow[];
  readonly thresholds?: Partial<GateThresholds>;
}): InterventionPanelFeature[] {
  const historyRows = input.routeMetricHistoryRows ?? [];
  if (historyRows.length === 0) return [...input.features];
  const thresholds = { ...DEFAULT_GATE_THRESHOLDS, ...(input.thresholds ?? {}) };
  const history = routeHistoryIndex(historyRows);
  const rowsByKey = new Map<string, InterventionComparisonSourceRow>();
  for (const row of input.comparisonRows) {
    const key = sourceKey(row);
    if (key !== null) rowsByKey.set(key, row);
  }

  return input.features.map((feature) => {
    if (feature.treatedScopeKind !== "route") return feature;
    const source = rowsByKey.get(interventionPanelFeatureKeyForSource(feature));
    const interventionMonth = monthFromDateOrMonth(feature.interventionDate);
    const prePoints = diagnosticPrePoints({
      points: history.get(feature.treatedScopeId),
      preStartMonth: feature.preWindowStart,
      preEndMonth: feature.preWindowEnd,
      interventionMonth,
      minWindowPoints: thresholds.minWindowPoints,
    });
    const postPoints = pointsInWindow(
      history.get(feature.treatedScopeId),
      feature.postWindowStart,
      feature.postWindowEnd,
    );
    const controlIds = feature.controlScopeIds;
    const treatedPreSlope =
      prePoints.length >= thresholds.minWindowPoints ? slope(prePoints) : null;
    const controlPreSlope =
      controlIds.length > 0
        ? averageDiagnosticPreSlope({
            routeIds: controlIds,
            history,
            preStartMonth: feature.preWindowStart,
            preEndMonth: feature.preWindowEnd,
            interventionMonth,
            minWindowPoints: thresholds.minWindowPoints,
          })
        : null;
    const treatedPlaceboDelta = splitDelta(prePoints, thresholds.minWindowPoints);
    const controlPlaceboDelta =
      controlIds.length > 0
        ? averageDiagnosticPreSplitDelta({
            routeIds: controlIds,
            history,
            preStartMonth: feature.preWindowStart,
            preEndMonth: feature.preWindowEnd,
            interventionMonth,
            minWindowPoints: thresholds.minWindowPoints,
          })
        : null;
    const controlDelta =
      controlIds.length > 0
        ? averageDelta({
            routeIds: controlIds,
            history,
            preStartMonth: feature.preWindowStart,
            preEndMonth: feature.preWindowEnd,
            postStartMonth: feature.postWindowStart,
            postEndMonth: feature.postWindowEnd,
            minWindowPoints: thresholds.minWindowPoints,
          })
        : null;
    const treatedDelta =
      prePoints.length >= thresholds.minWindowPoints &&
      postPoints.length >= thresholds.minWindowPoints
        ? averageDelta({
            routeIds: [feature.treatedScopeId],
            history,
            preStartMonth: feature.preWindowStart,
            preEndMonth: feature.preWindowEnd,
            postStartMonth: feature.postWindowStart,
            postEndMonth: feature.postWindowEnd,
            minWindowPoints: thresholds.minWindowPoints,
          })
        : null;
    const autocorrelation = lag1Autocorrelation(prePoints);
    const rawDelta = source === undefined ? null : numberValue(source.speed_delta_mph);
    const adjustedDelta = source === undefined ? null : numberValue(source.adjusted_speed_delta_mph);
    const methodDifference =
      rawDelta === null || adjustedDelta === null ? null : Math.abs(rawDelta - adjustedDelta);
    const preTrendStatus =
      treatedPreSlope === null || controlPreSlope === null
        ? feature.preTrendStatus
        : Math.abs(treatedPreSlope - controlPreSlope) <=
            thresholds.maxPreTrendSlopeDifferenceMphPerMonth
          ? "passes"
          : "fails";
    const placeboInTimeStatus =
      treatedPlaceboDelta === null || controlPlaceboDelta === null
        ? feature.placeboInTimeStatus ?? feature.placeboStatus
        : Math.abs(treatedPlaceboDelta - controlPlaceboDelta) <=
            thresholds.maxPlaceboDeltaDifferenceMph
          ? "passes"
          : "fails";
    const placeboInSpaceStatus =
      treatedDelta === null || controlDelta === null || feature.eventStudyEstimate === null || feature.eventStudyEstimate === undefined
        ? feature.placeboInSpaceStatus ?? feature.placeboStatus
        : Math.abs(controlDelta) < Math.abs(feature.eventStudyEstimate)
          ? "passes"
          : "fails";
    const autocorrelationStatus =
      autocorrelation === null
        ? feature.autocorrelationStatus ?? "not_tested"
        : Math.abs(autocorrelation) <= thresholds.maxLag1AutocorrelationAbs
          ? "passes"
          : "fails";
    const methodDivergenceStatus =
      rawDelta === null || adjustedDelta === null || methodDifference === null
        ? feature.methodDivergenceStatus ?? "not_tested"
        : sameDirection(rawDelta, adjustedDelta) &&
            methodDifference <= thresholds.maxMethodDeltaDifferenceMph
          ? "passes"
          : "fails";
    const placeboStatus =
      placeboInTimeStatus === "passes" && placeboInSpaceStatus === "passes"
        ? "passes"
        : placeboInTimeStatus === "fails" || placeboInSpaceStatus === "fails"
          ? "fails"
          : feature.placeboStatus;

    return {
      ...feature,
      preTrendStatus,
      placeboStatus,
      placeboInTimeStatus,
      placeboInSpaceStatus,
      autocorrelationStatus,
      methodDivergenceStatus,
    };
  });
}

function interventionPanelFeatureKeyForSource(feature: InterventionPanelFeature): string {
  return `${feature.eventId}\0${feature.treatedScopeKind}\0${feature.treatedScopeId}`;
}

export function buildTreatmentEventPanelArtifactV1(input: {
  readonly rows: readonly InterventionComparisonSourceRow[];
  readonly routeMetricHistoryRows?: readonly RouteMetricHistorySourceRow[];
  readonly gateThresholds?: Partial<GateThresholds>;
  readonly spec: TreatmentEventPanelSpec;
  readonly generatedAt: string;
  readonly artifactPath?: string | null;
}): TreatmentEventPanelArtifactV1 {
  const resolved = buildInterventionPanelFeatures({ rows: input.rows });
  const rows = applyGateDiagnostics({
    features: resolved.features,
    comparisonRows: input.rows,
    ...(input.routeMetricHistoryRows === undefined
      ? {}
      : { routeMetricHistoryRows: input.routeMetricHistoryRows }),
    ...(input.gateThresholds === undefined ? {} : { thresholds: input.gateThresholds }),
  });
  const routeCount = new Set(
    rows.filter((row) => row.treatedScopeKind === "route").map((row) => row.treatedScopeId),
  ).size;
  const eventCount = new Set(rows.map((row) => row.eventId)).size;
  const supportedRowCount = rows.filter((row) => row.quality.sampleStatus === "supported").length;
  const summary = {
    sourceRowCount: input.rows.length,
    panelRowCount: rows.length,
    supportedRowCount,
    routeCount,
    eventCount,
    eligibleControlRowCount: rows.filter((row) => row.controlEligibilityStatus === "eligible")
      .length,
    effectEstimateRowCount: rows.filter(
      (row) => row.eventStudyEstimate !== null && row.eventStudyEstimate !== undefined,
    ).length,
    candidateCausalEligibleRowCount: rows.filter(candidateCausalEligible).length,
    gateStatusCounts: gateStatusCounts(rows),
  };
  const panelManifest: PanelManifest = {
    panelId: TREATMENT_EVENT_PANEL_V1_ID,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    spec: treatmentEventPanelSpecV1(input.spec),
    inputRefs: [
      {
        refKind: "local_table",
        refId: "local_route_intervention_comparison",
        role: "comparison_panel_source",
        path: "data/local/pipeline.sqlite",
      },
      {
        refKind: "local_table",
        refId: "local_intervention_event",
        role: "event_metadata_source",
        path: "data/local/pipeline.sqlite",
      },
    ],
    summary: {
      sourceRowCount: input.rows.length,
      supportedRowCount,
      panelRowCount: rows.length,
      routeCount,
      entityCount: eventCount,
      monthCount: rows.length > 0 ? 1 : 0,
    },
    limitations: [
      "This is an association-screening panel, not a causal-estimate authority.",
      "Current rows use persisted comparison-route deltas; pre-trend, placebo, autocorrelation, and method-divergence gates are explicit and often not_tested.",
      "Causal or effect language remains blocked until methodology gates and human review pass.",
    ],
  };
  return {
    artifactKind: TREATMENT_EVENT_PANEL_V1_ID,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    artifactPath: input.artifactPath ?? null,
    releaseMonth: input.spec.releaseMonth,
    historyWindow: {
      startMonth: input.spec.historyStartMonth,
      endMonth: input.spec.releaseMonth,
    },
    panelSpec: input.spec,
    panelManifest,
    summary,
    rows,
  };
}

export function buildTreatmentEventCandidateCausalReviewProjection(
  artifact: TreatmentEventPanelArtifactV1,
): TreatmentEventCandidateCausalReviewProjection {
  const rows = artifact.rows
    .map((feature): TreatmentEventCandidateCausalReviewRow | null => {
      if (feature.treatedScopeKind !== "route") return null;
      if (feature.eventStudyEstimate === null || feature.eventStudyEstimate === undefined) {
        return null;
      }
      const gateSummary = gateSummaryFor(feature);
      if (!gateSummary.candidateCausalEligible) return null;
      return {
        reviewId: reviewIdFor(feature),
        eventId: feature.eventId,
        interventionType: feature.interventionType,
        routeId: feature.treatedScopeId,
        interventionDate: feature.interventionDate,
        preWindowStart: feature.preWindowStart,
        preWindowEnd: feature.preWindowEnd,
        postWindowStart: feature.postWindowStart,
        postWindowEnd: feature.postWindowEnd,
        eventStudyEstimate: feature.eventStudyEstimate,
        matchedPeerDelta: feature.matchedPeerDelta ?? null,
        controlRouteCount: feature.controlScopeIds.length,
        gateSummary,
        reviewDisposition: "needs_methodology_review",
        publicClaimAllowed: false,
      };
    })
    .filter((row): row is TreatmentEventCandidateCausalReviewRow => row !== null)
    .sort(
      (left, right) =>
        Math.abs(right.eventStudyEstimate) - Math.abs(left.eventStudyEstimate) ||
        left.routeId.localeCompare(right.routeId) ||
        left.eventId.localeCompare(right.eventId),
    );
  const routeCount = new Set(rows.map((row) => row.routeId)).size;
  const eventCount = new Set(rows.map((row) => row.eventId)).size;
  const maxAbsEffectEstimateMph =
    rows.length === 0
      ? null
      : Math.max(...rows.map((row) => Math.abs(row.eventStudyEstimate)));

  return {
    artifactKind: "treatment_event_candidate_causal_review_projection",
    schemaVersion: 1,
    generatedAt: artifact.generatedAt,
    releaseMonth: artifact.releaseMonth,
    historyWindow: artifact.historyWindow,
    sourceModelId: TREATMENT_EVENT_PANEL_V1_ID,
    sourcePanelRowCount: artifact.rows.length,
    summary: {
      candidateCausalEligibleRowCount: rows.length,
      routeCount,
      eventCount,
      maxAbsEffectEstimateMph,
      publicClaimAllowedCount: 0,
    },
    rows,
    limitations: [
      "Rows are candidate-causal methodology-review inputs, not approved causal findings.",
      "publicClaimAllowed is always false until human methodology approval is recorded elsewhere.",
      "The projection omits raw model rows and carries only review routing fields plus gate summaries.",
    ],
  };
}

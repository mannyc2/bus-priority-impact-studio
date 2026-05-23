import { createHash } from "node:crypto";
import {
  DetectorIdSchema,
  DetectorRunIdSchema,
  type FindingCandidate,
  FindingCandidateSchema,
  type FindingCoverageAudit,
  FindingCoverageAuditSchema,
  type FindingEvidenceLink,
  FindingEvidenceLinkSchema,
  FindingReasonCodeSchema,
  IsoMonthSchema,
  RouteIdSchema,
  type RouteMonthSignalFeature,
} from "@bp/domain";

export const SERVICE_REQUEST_CONTEXT_DETECTOR_ID = "service_request_context";

const SERVICE_REQUEST_SOURCE_IDS = [
  "nyc_311_service_requests_current",
  "nyc_311_service_requests_historical",
] as const;

export type ServiceRequestContextThresholds = {
  maxRouteWeightedAverageSpeedMph: number;
  minHotspotScore: number;
  minSpeedObservationCount: number;
  minServiceRequestTouchedEventCount: number;
  minServiceRequestHighConfidenceTouchCount: number;
  minAverageMatchWeight: number;
  candidateLimit: number;
};

export const DEFAULT_SERVICE_REQUEST_CONTEXT_THRESHOLDS: ServiceRequestContextThresholds = {
  maxRouteWeightedAverageSpeedMph: 6,
  minHotspotScore: 70,
  minSpeedObservationCount: 100,
  minServiceRequestTouchedEventCount: 25,
  minServiceRequestHighConfidenceTouchCount: 5,
  minAverageMatchWeight: 0.35,
  candidateLimit: 100,
};

export type ServiceRequestContextDetectorInput = {
  detectorRunId: string;
  month: string;
  generatedAt: string;
  features: ReadonlyArray<RouteMonthSignalFeature>;
  thresholds?: Partial<ServiceRequestContextThresholds>;
};

export type ServiceRequestContextDetectorOutput = {
  candidates: FindingCandidate[];
  evidence: FindingEvidenceLink[];
  coverage: FindingCoverageAudit[];
};

type ServiceRequestContextSummary = {
  sourceIds: string[];
  eventKinds: string[];
  touchedEventCount: number;
  touchCount: number;
  primaryTouchCount: number;
  contextTouchCount: number;
  highConfidenceTouchCount: number;
  matchWeightSum: number;
  averageMatchWeight: number;
  maxRouteFanout: number;
};

type Hit = {
  feature: RouteMonthSignalFeature;
  context: ServiceRequestContextSummary;
  detectorScore: number;
};

function stableId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 32);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function serviceRequestContext(feature: RouteMonthSignalFeature): ServiceRequestContextSummary {
  const sourceSet: ReadonlySet<string> = new Set(SERVICE_REQUEST_SOURCE_IDS);
  const rows = feature.contextEventCounts.filter(
    (context) => sourceSet.has(context.sourceId) && context.eventKind === "311_complaint",
  );

  const touchedEventCount = rows.reduce((total, row) => total + row.touchedEventCount, 0);
  const touchCount = rows.reduce((total, row) => total + row.touchCount, 0);
  const matchWeightSum = rows.reduce((total, row) => total + row.matchWeightSum, 0);

  return {
    sourceIds: [...new Set(rows.map((row) => row.sourceId))].sort(),
    eventKinds: [...new Set(rows.map((row) => row.eventKind))].sort(),
    touchedEventCount,
    touchCount,
    primaryTouchCount: rows.reduce((total, row) => total + row.primaryTouchCount, 0),
    contextTouchCount: rows.reduce((total, row) => total + row.contextTouchCount, 0),
    highConfidenceTouchCount: rows.reduce((total, row) => total + row.highConfidenceTouchCount, 0),
    matchWeightSum: Number(matchWeightSum.toFixed(4)),
    averageMatchWeight: touchCount === 0 ? 0 : Number((matchWeightSum / touchCount).toFixed(4)),
    maxRouteFanout: rows.reduce((max, row) => Math.max(max, row.maxRouteFanout), 0),
  };
}

function hasSpeedPain(
  feature: RouteMonthSignalFeature,
  thresholds: ServiceRequestContextThresholds,
): boolean {
  const hasSlowRoute =
    feature.routeWeightedAverageSpeedMph !== null &&
    feature.routeWeightedAverageSpeedMph <= thresholds.maxRouteWeightedAverageSpeedMph;
  const hasHotspot =
    feature.maxHotspotScore !== null && feature.maxHotspotScore >= thresholds.minHotspotScore;
  return hasSlowRoute || hasHotspot;
}

function hasServiceRequestSupport(
  context: ServiceRequestContextSummary,
  thresholds: ServiceRequestContextThresholds,
): boolean {
  if (context.touchedEventCount < thresholds.minServiceRequestTouchedEventCount) return false;
  if (context.highConfidenceTouchCount >= thresholds.minServiceRequestHighConfidenceTouchCount) {
    return true;
  }
  return context.averageMatchWeight >= thresholds.minAverageMatchWeight;
}

function detectorScoreFor(
  feature: RouteMonthSignalFeature,
  context: ServiceRequestContextSummary,
  thresholds: ServiceRequestContextThresholds,
): number {
  const routeSpeedSignal =
    feature.routeWeightedAverageSpeedMph === null
      ? 0
      : clamp(
          (thresholds.maxRouteWeightedAverageSpeedMph - feature.routeWeightedAverageSpeedMph) /
            thresholds.maxRouteWeightedAverageSpeedMph,
          0,
          1,
        );
  const hotspotSignal =
    feature.maxHotspotScore === null
      ? 0
      : clamp((feature.maxHotspotScore - thresholds.minHotspotScore) / 30, 0, 1);
  const speedPainSignal = Math.max(routeSpeedSignal, hotspotSignal);
  const serviceRequestVolumeSignal = clamp(
    context.touchedEventCount / (thresholds.minServiceRequestTouchedEventCount * 4),
    0,
    1,
  );
  const serviceRequestQualitySignal = Math.max(
    clamp(
      context.highConfidenceTouchCount / thresholds.minServiceRequestHighConfidenceTouchCount,
      0,
      1,
    ),
    clamp(context.averageMatchWeight / thresholds.minAverageMatchWeight, 0, 1),
  );

  return Math.round(
    55 +
      45 *
        clamp(
          0.5 * speedPainSignal +
            0.3 * serviceRequestVolumeSignal +
            0.2 * serviceRequestQualitySignal,
          0,
          1,
        ),
  );
}

function confidenceFor(
  feature: RouteMonthSignalFeature,
  context: ServiceRequestContextSummary,
  thresholds: ServiceRequestContextThresholds,
): "low" | "medium" | "high" {
  if (
    feature.speedObservationCount >= 500 &&
    context.highConfidenceTouchCount >= thresholds.minServiceRequestHighConfidenceTouchCount * 4
  ) {
    return "high";
  }
  if (
    context.highConfidenceTouchCount >= thresholds.minServiceRequestHighConfidenceTouchCount &&
    context.averageMatchWeight >= thresholds.minAverageMatchWeight
  ) {
    return "medium";
  }
  return "low";
}

function skippedReason(
  feature: RouteMonthSignalFeature,
  context: ServiceRequestContextSummary,
  thresholds: ServiceRequestContextThresholds,
): string | null {
  if (!feature.coverage.isComputable) return feature.coverage.skippedReasonCode ?? "missing_speed";
  if (feature.window !== "all_day") return "unsupported_window";
  if (feature.speedObservationCount < thresholds.minSpeedObservationCount) {
    return "insufficient_speed_observations";
  }
  if (!hasServiceRequestSupport(context, thresholds)) return "insufficient_service_request_context";
  if (!hasSpeedPain(feature, thresholds)) return null;
  return null;
}

export function detectServiceRequestContext(
  input: ServiceRequestContextDetectorInput,
): ServiceRequestContextDetectorOutput {
  const detectorId = DetectorIdSchema.parse(SERVICE_REQUEST_CONTEXT_DETECTOR_ID);
  const detectorRunId = DetectorRunIdSchema.parse(input.detectorRunId);
  const month = IsoMonthSchema.parse(input.month);
  const reasonCode = FindingReasonCodeSchema.parse("service_request_context_slowdown");
  const thresholds: ServiceRequestContextThresholds = {
    ...DEFAULT_SERVICE_REQUEST_CONTEXT_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };
  const hits = new Map(
    input.features
      .map((feature): Hit | null => {
        const context = serviceRequestContext(feature);
        if (!feature.coverage.isComputable) return null;
        if (feature.window !== "all_day") return null;
        if (feature.speedObservationCount < thresholds.minSpeedObservationCount) return null;
        if (!hasServiceRequestSupport(context, thresholds)) return null;
        if (!hasSpeedPain(feature, thresholds)) return null;
        return {
          feature,
          context,
          detectorScore: detectorScoreFor(feature, context, thresholds),
        };
      })
      .filter((hit): hit is Hit => hit !== null)
      .sort((left, right) => right.detectorScore - left.detectorScore)
      .slice(0, thresholds.candidateLimit)
      .map((hit) => [hit.feature.scopeId, hit]),
  );

  const candidates: FindingCandidate[] = [];
  const evidence: FindingEvidenceLink[] = [];
  const coverage: FindingCoverageAudit[] = [];

  for (const feature of input.features) {
    const routeId = RouteIdSchema.parse(feature.routeId);
    const context = serviceRequestContext(feature);
    const hit = hits.get(feature.scopeId);
    if (hit !== undefined) {
      const candidateId = stableId(detectorRunId, "candidate", feature.scopeId, feature.window);
      candidates.push(
        FindingCandidateSchema.parse({
          candidateId,
          detectorId,
          detectorRunId,
          month,
          scopeKind: "route",
          scopeId: routeId,
          routeId,
          physicalId: null,
          category: "context",
          severity: hit.detectorScore >= 85 ? "high" : "medium",
          confidence: confidenceFor(feature, hit.context, thresholds),
          detectorScore: hit.detectorScore,
          reasonCode,
          claimSafeLabel: "issue_needs_review",
          claimText: `Route ${routeId} has slow-speed evidence during a month with substantial 311 service-request context.`,
          status: "open",
          reviewState: "needs_review",
          windowStart: null,
          windowEnd: null,
          createdAt: input.generatedAt,
        }),
      );
      evidence.push(
        FindingEvidenceLinkSchema.parse({
          linkId: stableId(candidateId, "evidence", "speed_signal"),
          candidateId,
          evidenceKind: "metric",
          evidenceRole: "primary",
          evidenceRef: JSON.stringify({
            routeId,
            month,
            window: feature.window,
            routeWeightedAverageSpeedMph: feature.routeWeightedAverageSpeedMph,
            speedObservationCount: feature.speedObservationCount,
            maxHotspotScore: feature.maxHotspotScore,
            hotspotCount: feature.hotspotCount,
            ridershipExposure: feature.ridershipExposure,
          }),
          evidenceWeight: 1,
          note: "Route-month speed signal used before considering 311 context.",
        }),
        FindingEvidenceLinkSchema.parse({
          linkId: stableId(candidateId, "evidence", "311_context"),
          candidateId,
          evidenceKind: "context_event",
          evidenceRole: "context",
          evidenceRef: JSON.stringify({
            routeId,
            month,
            serviceRequestContext: hit.context,
            provenance: feature.provenance,
          }),
          evidenceWeight: Math.min(1, hit.context.highConfidenceTouchCount / 25),
          note: "311 service-request context is corroborating context, not causal evidence by itself.",
        }),
        FindingEvidenceLinkSchema.parse({
          linkId: stableId(candidateId, "evidence", "join_uncertainty"),
          candidateId,
          evidenceKind: "metric",
          evidenceRole: "counter_evidence",
          evidenceRef: JSON.stringify({
            routeId,
            month,
            serviceRequestContext: hit.context,
            thresholds: {
              minAverageMatchWeight: thresholds.minAverageMatchWeight,
              minServiceRequestHighConfidenceTouchCount:
                thresholds.minServiceRequestHighConfidenceTouchCount,
            },
            limitation:
              "311 complaint context can reflect broad street conditions, reporting behavior, or fanout across nearby routes.",
          }),
          evidenceWeight: 0.5,
          note: "Counter-evidence for causal interpretation: review fanout and match weight before promoting beyond context.",
        }),
      );
    }

    const reason = skippedReason(feature, context, thresholds);
    coverage.push(
      FindingCoverageAuditSchema.parse({
        auditId: stableId(detectorRunId, "audit", feature.scopeId, feature.window),
        detectorRunId,
        detectorId,
        month,
        scopeKind: "route",
        scopeId: routeId,
        outcome: !feature.coverage.isComputable
          ? "skipped_missing_input"
          : hit !== undefined
            ? "hit"
            : "clean_no_hit",
        reasonCode: reason === null ? null : FindingReasonCodeSchema.parse(reason),
        reason,
        inputsSeenJson: JSON.stringify({
          routeId,
          window: feature.window,
          speedObservationCount: feature.speedObservationCount,
          routeWeightedAverageSpeedMph: feature.routeWeightedAverageSpeedMph,
          maxHotspotScore: feature.maxHotspotScore,
          serviceRequestContext: context,
        }),
        inputsExpectedJson: JSON.stringify({
          window: "all_day",
          speedObservationCount: `>=${thresholds.minSpeedObservationCount}`,
          routeWeightedAverageSpeedMph: `<=${thresholds.maxRouteWeightedAverageSpeedMph}`,
          maxHotspotScore: `>=${thresholds.minHotspotScore}`,
          serviceRequestTouchedEventCount: `>=${thresholds.minServiceRequestTouchedEventCount}`,
          serviceRequestHighConfidenceTouchCount: `>=${thresholds.minServiceRequestHighConfidenceTouchCount}`,
          averageMatchWeight: `>=${thresholds.minAverageMatchWeight}`,
        }),
        createdAt: input.generatedAt,
      }),
    );
  }

  return { candidates, evidence, coverage };
}

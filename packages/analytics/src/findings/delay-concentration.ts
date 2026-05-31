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
} from "@bp/domain";
import { stableId } from "../core/ids.js";
import { mergeThresholds, round } from "../core/numbers.js";
import { severityFromScore } from "../core/scoring.js";
import {
  giniCoefficient,
  median,
  minItemsForShare,
  percentile,
  percentileRank,
  topItemsShare,
} from "../concentration.js";

export const DELAY_CONCENTRATION_DETECTOR_ID = "delay_concentration";

export type DelayConcentrationSegmentInput = {
  segmentId: string;
  direction: string;
  stopOrder: number;
  timepointStopName: string;
  nextTimepointStopName: string;
  observationCount: number;
  busTripCount: number;
  weightedAverageSpeedMph: number;
  weightedAverageTravelTimeMinutes: number;
  averageRoadDistanceMiles: number;
};

export type DelayConcentrationRouteInput = {
  routeId: string;
  hasSpeedData: boolean;
  speedObservationCount: number;
  /**
   * Every segment on the route, not a top-N slice — the concentration denominator is
   * the whole route's avoidable delay.
   */
  segments: ReadonlyArray<DelayConcentrationSegmentInput>;
};

export type DelayConcentrationThresholds = {
  /** Percentile of a route's own segment speeds used as its free-flow reference. */
  referenceSpeedPercentile: number;
  /** Cumulative-share target the `minSegmentsTo` readout reports against. */
  concentrationReadoutShare: number;
  /** Headline "K segments hold X%" count. */
  topSegmentsReadout: number;
  /** Min eligible segments before a route can be benchmarked. */
  minSegmentsForRoute: number;
  /** Per-segment observation floor so noisy single-sample windows do not inflate concentration. */
  minObservationCountPerSegment: number;
  /** Min benchmarkable routes before any outlier can be flagged (guards degenerate single-route runs). */
  minFleetForBenchmark: number;
  /** A route flags only if its Gini reaches this fleet percentile rank. */
  giniOutlierQuantile: number;
  /** ...and its total excess delay clears this fleet percentile (concentration must also be material). */
  absoluteDelayFloorQuantile: number;
};

export const DEFAULT_DELAY_CONCENTRATION_THRESHOLDS: DelayConcentrationThresholds = {
  referenceSpeedPercentile: 0.85,
  concentrationReadoutShare: 0.9,
  topSegmentsReadout: 6,
  minSegmentsForRoute: 8,
  minObservationCountPerSegment: 10,
  minFleetForBenchmark: 5,
  giniOutlierQuantile: 0.95,
  absoluteDelayFloorQuantile: 0.5,
};

export type DelayConcentrationDetectorInput = {
  detectorRunId: string;
  month: string;
  generatedAt: string;
  routes: ReadonlyArray<DelayConcentrationRouteInput>;
  thresholds?: Partial<DelayConcentrationThresholds>;
};

export type DelayConcentrationDetectorOutput = {
  candidates: FindingCandidate[];
  evidence: FindingEvidenceLink[];
  coverage: FindingCoverageAudit[];
};

type SegmentDelay = DelayConcentrationSegmentInput & { excessDelayMin: number; share: number };

type RouteConcentration = {
  route: DelayConcentrationRouteInput;
  referenceSpeedMph: number;
  segments: SegmentDelay[];
  totalExcessDelayMin: number;
  gini: number;
  minSegmentsToReadoutShare: number;
  topSegmentsShare: number;
  eligibleSegmentCount: number;
};

function confidenceFor(route: RouteConcentration): "medium" | "high" {
  return route.eligibleSegmentCount >= 15 && route.route.speedObservationCount >= 200
    ? "high"
    : "medium";
}

/**
 * Threshold-free per-route concentration: excess delay per segment measured against the
 * route's own free-flow reference speed, then the inequality of that delay across segments.
 * Returns null when the route lacks enough clean segment data to benchmark.
 */
function computeRoute(
  route: DelayConcentrationRouteInput,
  thresholds: DelayConcentrationThresholds,
): RouteConcentration | null {
  if (!route.hasSpeedData) return null;
  const eligible = route.segments.filter(
    (segment) =>
      segment.observationCount >= thresholds.minObservationCountPerSegment &&
      segment.busTripCount > 0,
  );
  if (eligible.length < thresholds.minSegmentsForRoute) return null;

  const referenceSpeedMph = percentile(
    eligible.map((segment) => segment.weightedAverageSpeedMph),
    thresholds.referenceSpeedPercentile,
  );
  if (referenceSpeedMph <= 0) return null;

  const segments: SegmentDelay[] = eligible.map((segment) => {
    const freeFlowMinutes = (segment.averageRoadDistanceMiles / referenceSpeedMph) * 60;
    const excessPerTrip = Math.max(0, segment.weightedAverageTravelTimeMinutes - freeFlowMinutes);
    return { ...segment, excessDelayMin: excessPerTrip * segment.busTripCount, share: 0 };
  });
  const totalExcessDelayMin = segments.reduce((sum, segment) => sum + segment.excessDelayMin, 0);
  for (const segment of segments) {
    segment.share = totalExcessDelayMin > 0 ? segment.excessDelayMin / totalExcessDelayMin : 0;
  }
  const excessValues = segments.map((segment) => segment.excessDelayMin);

  return {
    route,
    referenceSpeedMph: round(referenceSpeedMph),
    segments,
    totalExcessDelayMin: round(totalExcessDelayMin),
    gini: round(giniCoefficient(excessValues)),
    minSegmentsToReadoutShare: minItemsForShare(excessValues, thresholds.concentrationReadoutShare),
    topSegmentsShare: round(topItemsShare(excessValues, thresholds.topSegmentsReadout)),
    eligibleSegmentCount: eligible.length,
  };
}

export function detectDelayConcentration(
  input: DelayConcentrationDetectorInput,
): DelayConcentrationDetectorOutput {
  const detectorId = DetectorIdSchema.parse(DELAY_CONCENTRATION_DETECTOR_ID);
  const detectorRunId = DetectorRunIdSchema.parse(input.detectorRunId);
  const month = IsoMonthSchema.parse(input.month);
  const reasonCode = FindingReasonCodeSchema.parse("delay_concentrated");
  const skipReasonCode = FindingReasonCodeSchema.parse("insufficient_speed_observations");
  const thresholds = mergeThresholds(DEFAULT_DELAY_CONCENTRATION_THRESHOLDS, input.thresholds);

  const candidates: FindingCandidate[] = [];
  const evidence: FindingEvidenceLink[] = [];
  const coverage: FindingCoverageAudit[] = [];

  // Pass 1: per-route concentration.
  const computed = new Map<string, RouteConcentration | null>();
  for (const route of input.routes) {
    computed.set(route.routeId, computeRoute(route, thresholds));
  }

  // Pass 2: benchmark each route's concentration against the fleet distribution.
  const benchmarked = [...computed.values()].filter(
    (entry): entry is RouteConcentration => entry !== null,
  );
  const giniDistribution = benchmarked.map((entry) => entry.gini);
  const delayDistribution = benchmarked.map((entry) => entry.totalExcessDelayMin);
  const hasBenchmark = benchmarked.length >= thresholds.minFleetForBenchmark;
  const fleetMedianGini = median(giniDistribution);
  const absoluteDelayFloor = percentile(delayDistribution, thresholds.absoluteDelayFloorQuantile);

  for (const route of input.routes) {
    const routeId = RouteIdSchema.parse(route.routeId);
    const concentration = computed.get(route.routeId) ?? null;

    let outcome: "hit" | "clean_no_hit" | "skipped_missing_input";
    let flagged = false;
    let giniFleetPercentile = 0;
    let delayFleetPercentile = 0;

    if (concentration === null) {
      outcome = "skipped_missing_input";
    } else {
      giniFleetPercentile = hasBenchmark
        ? percentileRank(concentration.gini, giniDistribution)
        : 0;
      delayFleetPercentile = hasBenchmark
        ? percentileRank(concentration.totalExcessDelayMin, delayDistribution)
        : 0;
      flagged =
        hasBenchmark &&
        concentration.totalExcessDelayMin > 0 &&
        giniFleetPercentile >= thresholds.giniOutlierQuantile &&
        concentration.totalExcessDelayMin >= absoluteDelayFloor;
      outcome = flagged ? "hit" : "clean_no_hit";
    }

    if (flagged && concentration) {
      const detectorScore = Math.round(
        100 * (0.5 * giniFleetPercentile + 0.5 * delayFleetPercentile),
      );
      const topSegments = [...concentration.segments]
        .sort((left, right) => right.excessDelayMin - left.excessDelayMin)
        .slice(0, thresholds.topSegmentsReadout)
        .map((segment) => ({
          segmentId: segment.segmentId,
          from: segment.timepointStopName,
          to: segment.nextTimepointStopName,
          direction: segment.direction,
          excessDelayMin: round(segment.excessDelayMin),
          share: round(segment.share),
          weightedAverageSpeedMph: segment.weightedAverageSpeedMph,
        }));
      const sharePct = round(concentration.topSegmentsShare * 100, 1);
      const fleetPct = Math.round(giniFleetPercentile * 100);
      const candidateId = stableId(detectorRunId, "candidate", routeId);

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
          category: "speed",
          severity: severityFromScore(detectorScore),
          confidence: confidenceFor(concentration),
          detectorScore,
          reasonCode,
          claimSafeLabel: "issue_needs_review",
          claimText: `On route ${routeId}, ${thresholds.topSegmentsReadout} of ${concentration.eligibleSegmentCount} segments concentrate ${sharePct}% of avoidable bus delay (Gini ${concentration.gini}, ${fleetPct}th percentile of benchmarked routes).`,
          status: "open",
          reviewState: "needs_review",
          windowStart: null,
          windowEnd: null,
          createdAt: input.generatedAt,
        }),
      );
      evidence.push(
        FindingEvidenceLinkSchema.parse({
          linkId: stableId(candidateId, "evidence", "metric"),
          candidateId,
          evidenceKind: "metric",
          evidenceRole: "primary",
          evidenceRef: JSON.stringify({
            routeId,
            month,
            gini: concentration.gini,
            giniFleetPercentile: round(giniFleetPercentile),
            delayFleetPercentile: round(delayFleetPercentile),
            referenceSpeedMph: concentration.referenceSpeedMph,
            referenceSpeedPercentile: thresholds.referenceSpeedPercentile,
            eligibleSegmentCount: concentration.eligibleSegmentCount,
            totalExcessDelayMin: concentration.totalExcessDelayMin,
            minSegmentsToReadoutShare: concentration.minSegmentsToReadoutShare,
            readoutShare: thresholds.concentrationReadoutShare,
            topSegmentsShare: concentration.topSegmentsShare,
            topSegments,
          }),
          evidenceWeight: 1,
          note: null,
        }),
        FindingEvidenceLinkSchema.parse({
          linkId: stableId(candidateId, "evidence", "fleet_counter"),
          candidateId,
          evidenceKind: "metric",
          evidenceRole: "counter_evidence",
          evidenceRef: JSON.stringify({
            routeId,
            month,
            limitation:
              "Concentration locates where avoidable delay sits relative to the route's own free-flow speed; it is not a causal claim and does not assert the route is unusually slow overall. Gini is sensitive to segment count.",
            eligibleSegmentCount: concentration.eligibleSegmentCount,
            fleetMedianGini: round(fleetMedianGini),
            benchmarkRouteCount: benchmarked.length,
            absoluteDelayFloor: round(absoluteDelayFloor),
          }),
          evidenceWeight: 0.4,
          note: "Scope counter-evidence: concentration is benchmarked against the fleet and is not a causal or whole-route-slowness claim.",
        }),
      );
    }

    coverage.push(
      FindingCoverageAuditSchema.parse({
        auditId: stableId(detectorRunId, "audit", routeId),
        detectorRunId,
        detectorId,
        month,
        scopeKind: "route",
        scopeId: routeId,
        outcome,
        reasonCode: outcome === "skipped_missing_input" ? skipReasonCode : null,
        reason:
          outcome === "skipped_missing_input"
            ? "Route lacked enough clean segment-speed observations for concentration analysis."
            : null,
        inputsSeenJson: JSON.stringify({
          hasSpeedData: route.hasSpeedData,
          speedObservationCount: route.speedObservationCount,
          segmentCount: route.segments.length,
          eligibleSegmentCount: concentration?.eligibleSegmentCount ?? 0,
          gini: concentration?.gini ?? null,
          totalExcessDelayMin: concentration?.totalExcessDelayMin ?? null,
          giniFleetPercentile: concentration ? round(giniFleetPercentile) : null,
          benchmarkRouteCount: benchmarked.length,
        }),
        inputsExpectedJson: JSON.stringify({
          hasSpeedData: true,
          minSegmentsForRoute: thresholds.minSegmentsForRoute,
          minObservationCountPerSegment: thresholds.minObservationCountPerSegment,
          minFleetForBenchmark: thresholds.minFleetForBenchmark,
          giniOutlierQuantile: thresholds.giniOutlierQuantile,
          absoluteDelayFloorQuantile: thresholds.absoluteDelayFloorQuantile,
        }),
        createdAt: input.generatedAt,
      }),
    );
  }

  return { candidates, evidence, coverage };
}

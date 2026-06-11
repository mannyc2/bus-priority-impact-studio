import {
  DetectorIdSchema,
  DetectorRunIdSchema,
  type FindingCandidate,
  FindingCandidateSchema,
  type FindingCoverageAudit,
  type FindingEvidenceLink,
  FindingReasonCodeSchema,
} from "@bp/domain/findings";
import { IsoMonthSchema, RouteIdSchema } from "@bp/domain/primitives";
import { buildCoverageAudit } from "../core/coverage.js";
import { buildEvidenceLink } from "../core/evidence.js";
import { stableId } from "../core/ids.js";
import { clamp, mergeThresholds, round } from "../core/numbers.js";
import { severityFromScore } from "../core/scoring.js";
import {
  type CustomerJourneyFeature,
  customerJourneyFeatureKey,
} from "../features/customer-journey.js";
import type { FeatureQuality } from "../features/quality.js";
import {
  featureQualityHasCoverage,
  featureQualityHasFreshness,
  featureQualityHasSampleSupport,
} from "../features/quality.js";

export const CUSTOMER_JOURNEY_SHORTFALL_DETECTOR_ID = "customer_journey_shortfall";

export type CustomerJourneyShortfallThresholds = {
  minCustomers: number;
  maxJourneyTimePerformance: number;
  bottomPercentile: number;
  minCohortPeers: number;
  lookbackMonths: number;
  minHistoryMonths: number;
  minPersistentPoorMonths: number;
  dominanceMarginMinutes: number;
  highConfidenceCustomers: number;
  candidateLimit: number;
};

export const DEFAULT_CUSTOMER_JOURNEY_SHORTFALL_THRESHOLDS: CustomerJourneyShortfallThresholds = {
  minCustomers: 2500,
  maxJourneyTimePerformance: 0.65,
  bottomPercentile: 0.25,
  minCohortPeers: 3,
  lookbackMonths: 12,
  minHistoryMonths: 4,
  minPersistentPoorMonths: 3,
  dominanceMarginMinutes: 0.5,
  highConfidenceCustomers: 10_000,
  candidateLimit: 100,
};

export type CustomerJourneyShortfallDetectorInput = {
  detectorRunId: string;
  month: string;
  generatedAt: string;
  features: ReadonlyArray<CustomerJourneyFeature>;
  requestedRouteId?: string;
  thresholds?: Partial<CustomerJourneyShortfallThresholds>;
};

export type CustomerJourneyShortfallDetectorOutput = {
  candidates: FindingCandidate[];
  evidence: FindingEvidenceLink[];
  coverage: FindingCoverageAudit[];
};

type SkippedFeature = {
  reasonCode: string;
  reason: string;
};

type EvaluatedFeature = {
  feature: CustomerJourneyFeature;
  featureKey: string;
  cohortKey: string;
  percentileRank: number;
  poorSnapshot: boolean;
  validHistoryMonthCount: number;
  persistentPoorMonthCount: number;
  hasSameMonthPriorYearPoor: boolean;
  hasAdjacentMonthPoor: boolean;
  dominantSide: "wait" | "travel" | "mixed" | "none";
  detectorScore: number;
};

function cohortKey(feature: CustomerJourneyFeature): string {
  return [feature.month, feature.period, feature.tripType].join(":");
}

function routeCohortKey(feature: CustomerJourneyFeature): string {
  return [feature.routeId, feature.period, feature.tripType].join(":");
}

function previousMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const previous =
    monthNumber === 1 ? { year: year - 1, month: 12 } : { year, month: monthNumber - 1 };
  return `${previous.year}-${String(previous.month).padStart(2, "0")}`;
}

function nextMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const next = monthNumber === 12 ? { year: year + 1, month: 1 } : { year, month: monthNumber + 1 };
  return `${next.year}-${String(next.month).padStart(2, "0")}`;
}

function sameMonthPriorYear(month: string): string {
  return `${Number(month.slice(0, 4)) - 1}-${month.slice(5, 7)}`;
}

function monthIndex(month: string): number {
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));
}

function qualitySkipReason(quality: FeatureQuality): SkippedFeature | null {
  if (!featureQualityHasCoverage(quality)) {
    return {
      reasonCode: "low_coverage",
      reason: "Customer journey metric coverage is too low to score.",
    };
  }
  if (!featureQualityHasFreshness(quality)) {
    return {
      reasonCode: "feed_stale",
      reason: "Customer journey metric freshness is too stale to score.",
    };
  }
  if (!featureQualityHasSampleSupport(quality)) {
    return {
      reasonCode: "missing_customer_journey_metric",
      reason: "Customer journey metric sample support is missing.",
    };
  }
  return null;
}

function baseSkipReason(
  feature: CustomerJourneyFeature,
  thresholds: CustomerJourneyShortfallThresholds,
): SkippedFeature | null {
  const qualitySkip = qualitySkipReason(feature.quality);
  if (qualitySkip !== null) return qualitySkip;
  if (!Number.isFinite(feature.customers) || feature.customers < thresholds.minCustomers) {
    return {
      reasonCode: "low_customer_exposure",
      reason: "Customer exposure is below the detector minimum.",
    };
  }
  if (
    !Number.isFinite(feature.journeyTimePerformance) ||
    feature.journeyTimePerformance < 0 ||
    feature.journeyTimePerformance > 1
  ) {
    return {
      reasonCode: "missing_customer_journey_metric",
      reason: "CJTP is missing or outside the expected 0..1 performance-share range.",
    };
  }
  return null;
}

function percentileRank(value: number, values: readonly number[]): number {
  if (values.length <= 1) return 0;
  const less = values.filter((candidate) => candidate < value).length;
  const equal = values.filter((candidate) => candidate === value).length;
  return clamp((less + (equal - 1) / 2) / (values.length - 1), 0, 1);
}

function isPoor(
  feature: CustomerJourneyFeature,
  rank: number,
  thresholds: CustomerJourneyShortfallThresholds,
): boolean {
  return (
    rank <= thresholds.bottomPercentile &&
    feature.journeyTimePerformance <= thresholds.maxJourneyTimePerformance &&
    feature.customers >= thresholds.minCustomers
  );
}

function dominantSide(
  feature: CustomerJourneyFeature,
  dominanceMarginMinutes: number,
): "wait" | "travel" | "mixed" | "none" {
  const wait = Math.max(feature.additionalWaitMinutes, 0);
  const travel = Math.max(feature.additionalTravelMinutes, 0);
  if (wait <= 0 && travel <= 0) return "none";
  if (wait - travel >= dominanceMarginMinutes) return "wait";
  if (travel - wait >= dominanceMarginMinutes) return "travel";
  return "mixed";
}

function confidenceFor(
  feature: CustomerJourneyFeature,
  evaluated: EvaluatedFeature,
  thresholds: CustomerJourneyShortfallThresholds,
): "low" | "medium" | "high" {
  if (evaluated.persistentPoorMonthCount >= thresholds.minPersistentPoorMonths + 2) {
    return feature.customers >= thresholds.highConfidenceCustomers ? "high" : "medium";
  }
  return feature.customers >= thresholds.highConfidenceCustomers ? "medium" : "low";
}

function evaluateFeatures(
  features: ReadonlyArray<CustomerJourneyFeature>,
  month: string,
  thresholds: CustomerJourneyShortfallThresholds,
): Map<string, EvaluatedFeature> {
  const snapshotFeatures = features.filter((feature) => feature.month === month);
  const eligibleByCohort = new Map<string, CustomerJourneyFeature[]>();
  for (const feature of features) {
    if (baseSkipReason(feature, thresholds) !== null) continue;
    const key = cohortKey(feature);
    eligibleByCohort.set(key, [...(eligibleByCohort.get(key) ?? []), feature]);
  }

  const ranks = new Map<string, number>();
  for (const cohort of eligibleByCohort.values()) {
    const values = cohort.map((feature) => feature.journeyTimePerformance);
    for (const feature of cohort) {
      ranks.set(
        customerJourneyFeatureKey(feature),
        percentileRank(feature.journeyTimePerformance, values),
      );
    }
  }

  const minMonthIndex = monthIndex(month) - thresholds.lookbackMonths + 1;
  const maxMonthIndex = monthIndex(month);
  const historyByRouteCohort = new Map<string, CustomerJourneyFeature[]>();
  for (const feature of features) {
    if (baseSkipReason(feature, thresholds) !== null) continue;
    const index = monthIndex(feature.month);
    if (index < minMonthIndex || index > maxMonthIndex) continue;
    const key = routeCohortKey(feature);
    historyByRouteCohort.set(key, [...(historyByRouteCohort.get(key) ?? []), feature]);
  }

  const output = new Map<string, EvaluatedFeature>();
  for (const feature of snapshotFeatures) {
    const featureKey = customerJourneyFeatureKey(feature);
    const rank = ranks.get(featureKey);
    if (rank === undefined) continue;
    const history = historyByRouteCohort.get(routeCohortKey(feature)) ?? [];
    const historyRanks = new Map<string, number>();
    for (const historyFeature of history) {
      historyRanks.set(
        historyFeature.month,
        ranks.get(customerJourneyFeatureKey(historyFeature)) ?? 0,
      );
    }
    const persistentPoorMonthCount = history.filter((historyFeature) =>
      isPoor(historyFeature, historyRanks.get(historyFeature.month) ?? 0, thresholds),
    ).length;
    const poorSnapshot = isPoor(feature, rank, thresholds);
    const samePrior = history.find(
      (historyFeature) => historyFeature.month === sameMonthPriorYear(month),
    );
    const adjacentMonths = new Set([previousMonth(month), nextMonth(month)]);
    const hasSameMonthPriorYearPoor =
      samePrior === undefined
        ? false
        : isPoor(samePrior, historyRanks.get(samePrior.month) ?? 0, thresholds);
    const hasAdjacentMonthPoor = history.some(
      (historyFeature) =>
        adjacentMonths.has(historyFeature.month) &&
        isPoor(historyFeature, historyRanks.get(historyFeature.month) ?? 0, thresholds),
    );
    const shortfallSignal = clamp(
      (thresholds.maxJourneyTimePerformance - feature.journeyTimePerformance) /
        Math.max(thresholds.maxJourneyTimePerformance, 0.01),
      0,
      1,
    );
    const percentileSignal = clamp(
      (thresholds.bottomPercentile - rank) / thresholds.bottomPercentile,
      0,
      1,
    );
    const persistenceSignal = clamp(
      persistentPoorMonthCount / Math.max(thresholds.minPersistentPoorMonths + 2, 1),
      0,
      1,
    );
    const exposureSignal = clamp(
      feature.customers / Math.max(thresholds.highConfidenceCustomers, 1),
      0,
      1,
    );
    output.set(featureKey, {
      feature,
      featureKey,
      cohortKey: cohortKey(feature),
      percentileRank: rank,
      poorSnapshot,
      validHistoryMonthCount: history.length,
      persistentPoorMonthCount,
      hasSameMonthPriorYearPoor,
      hasAdjacentMonthPoor,
      dominantSide: dominantSide(feature, thresholds.dominanceMarginMinutes),
      detectorScore: Math.round(
        50 +
          50 *
            (0.35 * shortfallSignal +
              0.25 * percentileSignal +
              0.25 * persistenceSignal +
              0.15 * exposureSignal),
      ),
    });
  }
  return output;
}

export function detectCustomerJourneyShortfall(
  input: CustomerJourneyShortfallDetectorInput,
): CustomerJourneyShortfallDetectorOutput {
  const detectorId = DetectorIdSchema.parse(CUSTOMER_JOURNEY_SHORTFALL_DETECTOR_ID);
  const detectorRunId = DetectorRunIdSchema.parse(input.detectorRunId);
  const month = IsoMonthSchema.parse(input.month);
  const reasonCode = FindingReasonCodeSchema.parse("customer_journey_shortfall");
  const thresholds = mergeThresholds(
    DEFAULT_CUSTOMER_JOURNEY_SHORTFALL_THRESHOLDS,
    input.thresholds,
  );
  const evaluated = evaluateFeatures(input.features, month, thresholds);
  const selected = new Map(
    [...evaluated.values()]
      .filter((row) => {
        const persistencePass =
          row.validHistoryMonthCount >= thresholds.minHistoryMonths &&
          (row.persistentPoorMonthCount >= thresholds.minPersistentPoorMonths ||
            row.hasSameMonthPriorYearPoor ||
            row.hasAdjacentMonthPoor);
        return row.poorSnapshot && persistencePass;
      })
      .filter(
        (row) =>
          input.requestedRouteId === undefined || row.feature.routeId === input.requestedRouteId,
      )
      .sort((left, right) => right.detectorScore - left.detectorScore)
      .slice(0, thresholds.candidateLimit)
      .map((row) => [row.featureKey, row] as const),
  );

  const candidates: FindingCandidate[] = [];
  const evidence: FindingEvidenceLink[] = [];
  const coverage: FindingCoverageAudit[] = [];
  const snapshotFeatures = input.features.filter(
    (feature) =>
      feature.month === month &&
      (input.requestedRouteId === undefined || feature.routeId === input.requestedRouteId),
  );

  for (const feature of snapshotFeatures) {
    const routeId = RouteIdSchema.parse(feature.routeId);
    const featureKey = customerJourneyFeatureKey(feature);
    const baseSkip = baseSkipReason(feature, thresholds);
    const evaluatedRow = evaluated.get(featureKey);
    const cohortSize = input.features.filter(
      (row) => cohortKey(row) === cohortKey(feature) && row.month === month,
    ).length;
    const skip =
      baseSkip ??
      (cohortSize < thresholds.minCohortPeers
        ? {
            reasonCode: "insufficient_customer_journey_cohort",
            reason: "The period/trip-type cohort has too few routes for a stable percentile.",
          }
        : evaluatedRow === undefined
          ? {
              reasonCode: "missing_customer_journey_metric",
              reason: "The snapshot row could not be evaluated.",
            }
          : !evaluatedRow.poorSnapshot
            ? null
            : evaluatedRow.validHistoryMonthCount < thresholds.minHistoryMonths
              ? {
                  reasonCode: "insufficient_customer_journey_history",
                  reason:
                    "The route/period/trip-type shortfall has too few valid history months for promotion.",
                }
              : evaluatedRow.persistentPoorMonthCount < thresholds.minPersistentPoorMonths &&
                  !evaluatedRow.hasSameMonthPriorYearPoor &&
                  !evaluatedRow.hasAdjacentMonthPoor
                ? {
                    reasonCode: "failed_persistence",
                    reason: "The snapshot shortfall did not clear the historical persistence gate.",
                  }
                : null);
    const hit = selected.get(featureKey);

    if (skip === null && hit !== undefined) {
      const candidateId = stableId(detectorRunId, "candidate", featureKey, reasonCode);
      const performancePct = round(hit.feature.journeyTimePerformance * 100, 1);
      candidates.push(
        FindingCandidateSchema.parse({
          candidateId,
          detectorId,
          detectorRunId,
          month,
          scopeKind: "route",
          scopeId: featureKey,
          routeId,
          physicalId: null,
          category: "reliability",
          severity: severityFromScore(hit.detectorScore),
          confidence: confidenceFor(feature, hit, thresholds),
          detectorScore: hit.detectorScore,
          reasonCode,
          claimSafeLabel: "issue_needs_review",
          claimText: `Route ${routeId} ${feature.period} ${feature.tripType} customer journey performance was ${performancePct}% within 5 minutes of schedule; review whether the shortfall is wait-side or in-vehicle-side.`,
          status: "open",
          reviewState: "needs_review",
          windowStart: null,
          windowEnd: null,
          createdAt: input.generatedAt,
        }),
      );
      evidence.push(
        buildEvidenceLink({
          linkId: stableId(candidateId, "evidence", "cjtp"),
          candidateId,
          evidenceKind: "metric",
          evidenceRole: "primary",
          evidenceRef: {
            routeId,
            featureKey,
            period: feature.period,
            tripType: feature.tripType,
            customers: round(feature.customers, 0),
            journeyTimePerformance: round(feature.journeyTimePerformance, 4),
            journeyTimePerformancePercent: performancePct,
            additionalWaitMinutes: round(feature.additionalWaitMinutes, 3),
            additionalTravelMinutes: round(feature.additionalTravelMinutes, 3),
            dominantSide: hit.dominantSide,
            percentileRank: round(hit.percentileRank, 4),
            validHistoryMonthCount: hit.validHistoryMonthCount,
            persistentPoorMonthCount: hit.persistentPoorMonthCount,
            note: "CJTP is a 0..1 performance share, not minutes: percent of customers whose journey completed within 5 minutes of schedule.",
            thresholds,
          },
          evidenceWeight: 1,
          note: null,
        }),
        buildEvidenceLink({
          linkId: stableId(candidateId, "evidence", "limits"),
          candidateId,
          evidenceKind: "metric",
          evidenceRole: "counter_evidence",
          evidenceRef: {
            routeId,
            featureKey,
            counterEvidence: [
              "Wait/travel decomposition is a lever hint, not causal proof.",
              "Negative additional-time means better than schedule and should not be treated as a problem.",
              "The 5-minute CJTP binary can hide large absolute delays on longer trips.",
              "Cohorts are ranked within month, period, and trip type only.",
            ],
            quality: feature.quality,
          },
          evidenceWeight: 0.5,
          note: "Review unit interpretation, cohort fit, persistence, and decomposition before promotion.",
        }),
      );
    }

    coverage.push(
      buildCoverageAudit({
        auditId: stableId(detectorRunId, "audit", featureKey),
        detectorRunId,
        detectorId,
        month,
        scopeKind: "route",
        scopeId: featureKey,
        outcome:
          skip !== null ? "skipped_missing_input" : hit === undefined ? "clean_no_hit" : "hit",
        reasonCode: skip === null ? null : FindingReasonCodeSchema.parse(skip.reasonCode),
        reason: skip?.reason ?? null,
        inputsSeenJson: {
          routeId,
          period: feature.period,
          tripType: feature.tripType,
          customers: feature.customers,
          journeyTimePerformance: feature.journeyTimePerformance,
          additionalWaitMinutes: feature.additionalWaitMinutes,
          additionalTravelMinutes: feature.additionalTravelMinutes,
          cohortSize,
          evaluated: evaluatedRow,
          quality: feature.quality,
        },
        inputsExpectedJson: {
          minCustomers: thresholds.minCustomers,
          maxJourneyTimePerformance: thresholds.maxJourneyTimePerformance,
          bottomPercentile: thresholds.bottomPercentile,
          minCohortPeers: thresholds.minCohortPeers,
          minHistoryMonths: thresholds.minHistoryMonths,
          minPersistentPoorMonths: thresholds.minPersistentPoorMonths,
          unitWarning: "journeyTimePerformance is a share, not minutes",
        },
        createdAt: input.generatedAt,
      }),
    );
  }

  return { candidates, evidence, coverage };
}

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
import { summarizeInterventionGates } from "../calibration/intervention-gates.js";
import { buildCoverageAudit } from "../core/coverage.js";
import { buildEvidenceLink } from "../core/evidence.js";
import { stableId } from "../core/ids.js";
import { clamp, mergeThresholds, round } from "../core/numbers.js";
import {
  type InterventionPanelFeature,
  interventionPanelFeatureKey,
} from "../features/intervention-panel.js";
import { confidenceFromFeatureQuality, featureQualitySkipReason } from "./feature-quality.js";

export const INTERVENTION_EVENT_STUDY_DETECTOR_ID = "intervention_event_study";

export type InterventionEventStudyThresholds = {
  minAbsoluteEffectEstimate: number;
  effectScaleForMaxScore: number;
  candidateLimit: number;
};

export const DEFAULT_INTERVENTION_EVENT_STUDY_THRESHOLDS: InterventionEventStudyThresholds = {
  minAbsoluteEffectEstimate: 0,
  effectScaleForMaxScore: 1,
  candidateLimit: 100,
};

export type InterventionEventStudyDetectorInput = {
  detectorRunId: string;
  month: string;
  generatedAt: string;
  features: ReadonlyArray<InterventionPanelFeature>;
  thresholds?: Partial<InterventionEventStudyThresholds>;
};

export type InterventionEventStudyDetectorOutput = {
  candidates: FindingCandidate[];
  evidence: FindingEvidenceLink[];
  coverage: FindingCoverageAudit[];
};

type SkippedFeature = {
  reasonCode: string;
  reason: string;
};

type EvaluatedFeature = {
  feature: InterventionPanelFeature;
  featureKey: string;
  effectEstimate: number;
  gateSummary: ReturnType<typeof gateSummaryFor>;
  detectorScore: number;
};

function gateSummaryFor(feature: InterventionPanelFeature) {
  return summarizeInterventionGates({
    controlEligibilityStatus: feature.controlEligibilityStatus,
    preTrendStatus: feature.preTrendStatus,
    placeboInTimeStatus: feature.placeboInTimeStatus ?? feature.placeboStatus,
    placeboInSpaceStatus: feature.placeboInSpaceStatus ?? feature.placeboStatus,
    autocorrelationStatus: feature.autocorrelationStatus ?? "not_tested",
    methodDivergenceStatus: feature.methodDivergenceStatus ?? "not_tested",
  });
}

function skipReason(feature: InterventionPanelFeature): SkippedFeature | null {
  const qualitySkip = featureQualitySkipReason(feature.quality, "insufficient_window");
  if (qualitySkip !== null) return qualitySkip;

  if (
    feature.interventionDate === null ||
    feature.preWindowStart === null ||
    feature.preWindowEnd === null ||
    feature.postWindowStart === null ||
    feature.postWindowEnd === null
  ) {
    return {
      reasonCode: "insufficient_window",
      reason: "Intervention date or pre/post windows are missing.",
    };
  }

  if (feature.controlEligibilityStatus !== "eligible") {
    return {
      reasonCode: "no_counterfactual",
      reason: "No eligible control or comparison set is available.",
    };
  }

  if (feature.eventStudyEstimate === undefined || feature.eventStudyEstimate === null) {
    return {
      reasonCode: "missing_effect_estimate",
      reason: "No event-study association estimate is available.",
    };
  }

  return null;
}

function evaluateFeature(
  feature: InterventionPanelFeature,
  thresholds: InterventionEventStudyThresholds,
): EvaluatedFeature | null {
  if (feature.eventStudyEstimate === undefined || feature.eventStudyEstimate === null) return null;
  if (Math.abs(feature.eventStudyEstimate) < thresholds.minAbsoluteEffectEstimate) return null;
  const gateSummary = gateSummaryFor(feature);
  if (!gateSummary.associationallyScoreable) return null;

  const effectSignal = clamp(
    Math.abs(feature.eventStudyEstimate) / thresholds.effectScaleForMaxScore,
    0,
    1,
  );
  const gateSignal = gateSummary.candidateCausalEligible ? 1 : 0.35;
  const detectorScore = Math.round(55 + 45 * (0.75 * effectSignal + 0.25 * gateSignal));

  return {
    feature,
    featureKey: interventionPanelFeatureKey(feature),
    effectEstimate: feature.eventStudyEstimate,
    gateSummary,
    detectorScore,
  };
}

function routeIdForFeature(feature: InterventionPanelFeature): string | null {
  if (feature.treatedScopeKind !== "route") return null;
  return RouteIdSchema.parse(feature.treatedScopeId);
}

export function detectInterventionEventStudies(
  input: InterventionEventStudyDetectorInput,
): InterventionEventStudyDetectorOutput {
  const detectorId = DetectorIdSchema.parse(INTERVENTION_EVENT_STUDY_DETECTOR_ID);
  const detectorRunId = DetectorRunIdSchema.parse(input.detectorRunId);
  const month = IsoMonthSchema.parse(input.month);
  const reasonCode = FindingReasonCodeSchema.parse("intervention_association");
  const thresholds = mergeThresholds(DEFAULT_INTERVENTION_EVENT_STUDY_THRESHOLDS, input.thresholds);

  const candidates: FindingCandidate[] = [];
  const evidence: FindingEvidenceLink[] = [];
  const coverage: FindingCoverageAudit[] = [];
  const selected = new Map(
    input.features
      .filter((feature) => skipReason(feature) === null)
      .map((feature) => evaluateFeature(feature, thresholds))
      .filter((feature): feature is EvaluatedFeature => feature !== null)
      .sort((left, right) => right.detectorScore - left.detectorScore)
      .slice(0, thresholds.candidateLimit)
      .map((feature) => [feature.featureKey, feature] as const),
  );

  for (const feature of input.features) {
    const featureKey = interventionPanelFeatureKey(feature);
    const skip = skipReason(feature);
    const hit = selected.get(featureKey);
    const routeId = routeIdForFeature(feature);

    if (skip === null && hit !== undefined) {
      const candidateId = stableId(detectorRunId, "candidate", featureKey, reasonCode);
      candidates.push(
        FindingCandidateSchema.parse({
          candidateId,
          detectorId,
          detectorRunId,
          month,
          scopeKind: feature.treatedScopeKind,
          scopeId: feature.treatedScopeId,
          routeId,
          physicalId: feature.treatedScopeKind === "segment" ? feature.treatedScopeId : null,
          category: "intervention",
          severity: hit.detectorScore >= 85 ? "high" : "medium",
          confidence: hit.gateSummary.candidateCausalEligible
            ? confidenceFromFeatureQuality(feature.quality, feature.controlScopeIds.length, 3)
            : "low",
          detectorScore: hit.detectorScore,
          reasonCode,
          claimSafeLabel: "issue_needs_review",
          claimText: `Performance on ${feature.treatedScopeKind} ${feature.treatedScopeId} changed by ${round(hit.effectEstimate, 3)} in the window after ${feature.interventionType}; association pending review.`,
          status: "open",
          reviewState: "needs_review",
          windowStart: null,
          windowEnd: null,
          createdAt: input.generatedAt,
        }),
      );
      evidence.push(
        buildEvidenceLink({
          linkId: stableId(candidateId, "evidence", "event_study"),
          candidateId,
          evidenceKind: "metric",
          evidenceRole: "primary",
          evidenceRef: {
            eventId: feature.eventId,
            interventionType: feature.interventionType,
            treatedScopeKind: feature.treatedScopeKind,
            treatedScopeId: feature.treatedScopeId,
            interventionDate: feature.interventionDate,
            preWindowStart: feature.preWindowStart,
            preWindowEnd: feature.preWindowEnd,
            postWindowStart: feature.postWindowStart,
            postWindowEnd: feature.postWindowEnd,
            eventStudyEstimate: hit.effectEstimate,
            eventStudyConfidenceIntervalLow: feature.eventStudyConfidenceIntervalLow ?? null,
            eventStudyConfidenceIntervalHigh: feature.eventStudyConfidenceIntervalHigh ?? null,
            segmentedRegressionLevelChange: feature.segmentedRegressionLevelChange ?? null,
            segmentedRegressionSlopeChange: feature.segmentedRegressionSlopeChange ?? null,
            matchedPeerDelta: feature.matchedPeerDelta ?? null,
            syntheticControlGap: feature.syntheticControlGap ?? null,
            controlScopeIds: feature.controlScopeIds,
            gateSummary: hit.gateSummary,
            claimStrengthTier: hit.gateSummary.candidateCausalEligible
              ? "candidate_causal_needs_review"
              : "associational",
          },
          evidenceWeight: 1,
          note: null,
        }),
        buildEvidenceLink({
          linkId: stableId(candidateId, "evidence", "causal_limits"),
          candidateId,
          evidenceKind: "metric",
          evidenceRole: "counter_evidence",
          evidenceRef: {
            eventId: feature.eventId,
            gateSummary: hit.gateSummary,
            caveats: [
              "The detector may report association, not causation.",
              "Causal or effect language requires human methodology approval.",
              "History bias, anticipation, autocorrelation, route changes, and weak controls can invalidate estimates.",
            ],
          },
          evidenceWeight: 0.5,
          note: "Counter-evidence for causal interpretation: all methodology gates and human review are required before effect language.",
        }),
      );
    }

    coverage.push(
      buildCoverageAudit({
        auditId: stableId(detectorRunId, "audit", featureKey),
        detectorRunId,
        detectorId,
        month,
        scopeKind: feature.treatedScopeKind,
        scopeId: feature.treatedScopeId,
        outcome:
          skip !== null ? "skipped_missing_input" : hit === undefined ? "clean_no_hit" : "hit",
        reasonCode: skip === null ? null : FindingReasonCodeSchema.parse(skip.reasonCode),
        reason: skip?.reason ?? null,
        inputsSeenJson: {
          eventId: feature.eventId,
          interventionType: feature.interventionType,
          treatedScopeKind: feature.treatedScopeKind,
          treatedScopeId: feature.treatedScopeId,
          interventionDate: feature.interventionDate,
          controlEligibilityStatus: feature.controlEligibilityStatus,
          controlScopeCount: feature.controlScopeIds.length,
          eventStudyEstimate: feature.eventStudyEstimate ?? null,
          gateSummary: gateSummaryFor(feature),
          quality: feature.quality,
        },
        inputsExpectedJson: {
          interventionDate: "available",
          preWindow: "available",
          postWindow: "available",
          controlEligibilityStatus: "eligible",
          eventStudyEstimate: "available",
          causalLanguage: "human_methodology_review_required",
        },
        createdAt: input.generatedAt,
      }),
    );
  }

  return { candidates, evidence, coverage };
}
